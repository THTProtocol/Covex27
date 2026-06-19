//! Off-chain co-signed state relay for the trustless 2-of-2 game channel.
//!
//! This is the OFF-CHAIN half of the channel (the on-chain half is
//! `covenant_builder::redeem_channel`: an OP_IF 2-of-2 cooperative close, OP_ELSE
//! a CLTV refund to the funder). The server here holds NO key and can forge
//! nothing. Each checkpoint is a fully-formed UNSIGNED cooperative-close tx that
//! pays the currently-agreed winner, plus a strictly-monotonic state nonce. Both
//! players sign that exact sighash IN-BROWSER (BIP340 Schnorr over secp256k1);
//! the server only RELAYS the partial signatures and rejects anything that is not
//! a valid member signature over the stored sighash.
//!
//! HONESTY (what this is and is NOT):
//!  - Kaspa 0.15.0 has no transaction-introspection opcodes, so a Lightning-style
//!    justice / penalty transaction is NOT expressible on-chain. A later checkpoint
//!    cannot be penalised on-chain if an old one is broadcast. The ONLY dispute
//!    mechanism is the CLTV refund branch (the funder, player1, reclaims after
//!    `lock_daa` when there is no cooperative close).
//!  - Because the only on-chain default is "funder refunds after timeout", the
//!    funder (player1) can stall a losing position by refusing to co-sign the
//!    close until the timeout, then refunding. So this channel is suitable for
//!    LOW-TRUST, SHORT-LIVED games with a SHORT timeout window, not for adversarial
//!    custody of large balances. We do not claim otherwise anywhere.
//!  - This relay tracks the LATEST mutually-agreed state off-chain. Settlement on
//!    chain is still the cooperative close (both browser sigs) or the CLTV refund;
//!    see games.rs settle_channel / refund_channel.

use axum::{
    extract::Path,
    routing::{get, post},
    Extension, Json, Router,
};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Mutex;

use crate::games::authorize_money_caller_pub as authorize_money_caller;
use crate::games::xonly_hex_from_address_pub as xonly_hex_from_address;

/// Hard cap on how many checkpoints we retain per channel (the latest plus a short
/// audit tail). Bounds memory against a chatty client; the only checkpoint that
/// matters for settlement is the latest (highest nonce).
const MAX_CHECKPOINTS_PER_CHANNEL: usize = 64;
/// Hard cap on the number of distinct channels we track in memory. Oldest-touched
/// channels are evicted past this. This is a relay cache, not the source of truth
/// (the source of truth is each player's signed copy + the chain), so eviction is
/// safe: a client can always re-post the latest checkpoint to repopulate it.
const MAX_CHANNELS: usize = 4096;

/// One co-signing party's partial signature over a checkpoint's sighash.
#[derive(Clone, serde::Serialize)]
pub struct PartialSig {
    /// The signer's x-only pubkey (hex). MUST be one of the channel members
    /// (player1 or player2), validated on submit.
    pub signer_xonly: String,
    /// That signer's 64-byte BIP340 Schnorr signature (hex) over `sighash_hex`.
    pub sig_hex: String,
}

/// An opaque, server-relayed checkpoint. The server never derives or holds a key;
/// it stores only what the clients submit, after validating the partial signature.
#[derive(Clone, serde::Serialize)]
pub struct Checkpoint {
    pub channel_id: String,
    /// Strictly-monotonic state nonce. A checkpoint with nonce <= the stored
    /// latest is REJECTED (fail-closed), so an old state cannot replace a newer one.
    pub nonce: u64,
    /// The exact sighash both players sign (hex). The server does NOT recompute it
    /// from a tx; it is the opaque message the browser produced via prepare-spend
    /// and that both members sign. Partial sigs are verified against THIS value.
    pub sighash_hex: String,
    /// The currently-agreed winner's destination address (the close pays here).
    pub winner_dest: String,
    /// The pot amount (sompi) this checkpoint pays out, for display/audit.
    pub amount_sompi: u64,
    /// The channel's CLTV refund DAA (the on-chain timeout), for display/audit.
    pub lock_daa: u64,
    /// The partial signatures gathered so far (0, 1, or 2 entries). A cooperative
    /// close needs both members present; until then this is a pending checkpoint.
    pub partial_sigs: Vec<PartialSig>,
    /// Server receipt time (unix seconds), for eviction ordering and audit only.
    pub updated_at: i64,
}

struct ChannelState {
    /// Bounded ring of checkpoints, oldest first; the last entry is the latest.
    checkpoints: Vec<Checkpoint>,
    last_touched: i64,
}

fn channels() -> &'static Mutex<HashMap<String, ChannelState>> {
    static S: std::sync::OnceLock<Mutex<HashMap<String, ChannelState>>> = std::sync::OnceLock::new();
    S.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn channel_routes() -> Router {
    Router::new()
        .route("/games/:covenant_id/channel/checkpoint", post(post_checkpoint))
        .route("/games/:covenant_id/channel", get(get_channel))
}

/// Verify a BIP340 Schnorr signature (hex) by `signer_xonly` (hex) over the 32-byte
/// `sighash` (hex). Returns Ok only on a genuine signature; this is what makes the
/// relay non-forgeable - the server accepts a partial sig only if it actually
/// verifies against the member key and the exact stored sighash.
fn verify_member_sig(signer_xonly: &str, sig_hex: &str, sighash_hex: &str) -> Result<(), String> {
    let xonly_bytes = hex::decode(signer_xonly.trim().trim_start_matches("0x"))
        .map_err(|_| "signer_xonly must be hex".to_string())?;
    let xonly = secp256k1::XOnlyPublicKey::from_slice(&xonly_bytes)
        .map_err(|e| format!("bad signer_xonly: {e}"))?;
    let sig_bytes = hex::decode(sig_hex.trim().trim_start_matches("0x"))
        .map_err(|_| "sig_hex must be hex".to_string())?;
    let sig = secp256k1::schnorr::Signature::from_slice(&sig_bytes)
        .map_err(|_| "sig_hex must be a 64-byte BIP340 Schnorr signature".to_string())?;
    let digest = hex::decode(sighash_hex.trim().trim_start_matches("0x"))
        .map_err(|_| "sighash must be hex".to_string())?;
    let msg = secp256k1::Message::from_digest_slice(&digest)
        .map_err(|_| "sighash must be 32 bytes".to_string())?;
    secp256k1::SECP256K1
        .verify_schnorr(&sig, &msg, &xonly)
        .map_err(|_| "signature does not verify for this signer over the checkpoint sighash".to_string())
}

/// The pure decision the monotonic-nonce gate makes for an incoming checkpoint given the
/// stored latest. Extracted so it can be unit-tested without a live DB or HTTP layer.
#[derive(Debug, PartialEq, Eq)]
enum NonceDecision {
    /// No stored checkpoint, or the incoming nonce is strictly greater: store as the new latest.
    Advance,
    /// Same nonce AND same (sighash, winner): merge the counterparty's sig into the latest.
    MergeSameCheckpoint,
    /// Incoming nonce <= stored AND not an identical same-nonce checkpoint: REJECT (fail-closed).
    Reject,
}

/// Decide whether an incoming (nonce, sighash, winner) advances, merges, or is rejected
/// against the stored latest. Strictly-monotonic: a nonce <= the stored latest can only
/// merge an IDENTICAL same-nonce checkpoint; anything else is rejected so an old state can
/// never replace a newer one.
fn nonce_decision(
    latest: Option<(u64, &str, &str)>, // (nonce, sighash_hex, winner_dest) of the stored latest
    incoming_nonce: u64,
    incoming_sighash: &str,
    incoming_winner: &str,
) -> NonceDecision {
    match latest {
        None => NonceDecision::Advance,
        Some((ln, ls, lw)) => {
            if incoming_nonce > ln {
                NonceDecision::Advance
            } else if incoming_nonce == ln
                && ls.eq_ignore_ascii_case(incoming_sighash.trim())
                && lw == incoming_winner
            {
                NonceDecision::MergeSameCheckpoint
            } else {
                NonceDecision::Reject
            }
        }
    }
}

#[derive(serde::Deserialize)]
struct CheckpointReq {
    /// Per-seat secret (the same token move/settle require). Required - fail-closed.
    #[serde(default)]
    token: Option<String>,
    nonce: u64,
    sighash_hex: String,
    winner_dest: String,
    #[serde(default)]
    amount_sompi: u64,
    #[serde(default)]
    lock_daa: u64,
    /// The submitting player's partial signature for THIS checkpoint. Must be from a
    /// channel member (player1/player2) and verify over `sighash_hex`.
    signer_xonly: String,
    sig_hex: String,
}

/// POST /games/:id/channel/checkpoint - advance the off-chain channel state.
///
/// Fail-closed at every step: a valid seat token is required; the nonce must be
/// STRICTLY GREATER than the stored latest; the submitted partial sig must be from a
/// channel member and must verify over the submitted sighash. The server holds no
/// key and cannot forge a signature, so it can only relay member-produced sigs.
async fn post_checkpoint(
    Extension(db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
    Json(req): Json<CheckpointReq>,
) -> Json<serde_json::Value> {
    // Auth: only a seated player holding this match's seat token may advance state.
    if let Err(e) = authorize_money_caller(&db, &covenant_id, req.token.as_deref().unwrap_or("")) {
        return Json(json!({ "success": false, "error": e }));
    }
    // Resolve the channel's two member x-only keys from the match's players. The
    // submitted partial sig must come from one of them.
    let (p1, p2) = match crate::games::game_players_pub(&db, &covenant_id) {
        Some(pair) => pair,
        None => return Json(json!({ "success": false, "error": "game not found" })),
    };
    if p1.is_empty() || p2.is_empty() {
        return Json(json!({ "success": false, "error": "channel needs two seated players" }));
    }
    let p1x = match xonly_hex_from_address(&p1) { Ok(x) => x, Err(e) => return Json(json!({ "success": false, "error": e })) };
    let p2x = match xonly_hex_from_address(&p2) { Ok(x) => x, Err(e) => return Json(json!({ "success": false, "error": e })) };
    let submitted = req.signer_xonly.trim().trim_start_matches("0x").to_lowercase();
    if submitted != p1x.to_lowercase() && submitted != p2x.to_lowercase() {
        return Json(json!({ "success": false, "error": "signer_xonly is not a member of this channel (must be player1 or player2)" }));
    }
    // Validate the partial signature is real BEFORE storing anything. A bad sig is
    // rejected outright, so the relay never holds a forged or junk signature.
    if let Err(e) = verify_member_sig(&req.signer_xonly, &req.sig_hex, &req.sighash_hex) {
        return Json(json!({ "success": false, "error": e }));
    }

    let now = chrono::Utc::now().timestamp();
    let mut map = channels().lock().unwrap();
    // Evict the least-recently-touched channels if we are over the cap (relay cache;
    // safe to evict because the chain + each client's signed copy are the real state).
    if map.len() >= MAX_CHANNELS && !map.contains_key(&covenant_id) {
        if let Some(oldest) = map.iter().min_by_key(|(_, v)| v.last_touched).map(|(k, _)| k.clone()) {
            map.remove(&oldest);
        }
    }
    let state = map.entry(covenant_id.clone()).or_insert_with(|| ChannelState {
        checkpoints: Vec::new(),
        last_touched: now,
    });
    state.last_touched = now;

    // Monotonic-nonce gate (fail-closed): an old (already-superseded) state can never
    // replace a newer one. The pure decision lives in `nonce_decision` (unit-tested).
    let decision = {
        let latest = state.checkpoints.last();
        nonce_decision(
            latest.map(|c| (c.nonce, c.sighash_hex.as_str(), c.winner_dest.as_str())),
            req.nonce,
            &req.sighash_hex,
            &req.winner_dest,
        )
    };
    match decision {
        NonceDecision::Reject => {
            let stored = state.checkpoints.last().map(|c| c.nonce).unwrap_or(0);
            return Json(json!({
                "success": false,
                "error": format!("stale checkpoint: nonce {} is not greater than the stored latest {}", req.nonce, stored)
            }));
        }
        NonceDecision::MergeSameCheckpoint => {
            // Idempotent merge: the SAME checkpoint (same nonce, sighash, winner) may be
            // co-signed by the second player. Merge their sig; never regress the nonce.
            let latest = state.checkpoints.last_mut().unwrap();
            if !latest.partial_sigs.iter().any(|s| s.signer_xonly.eq_ignore_ascii_case(&submitted)) {
                latest.partial_sigs.push(PartialSig { signer_xonly: submitted.clone(), sig_hex: req.sig_hex.clone() });
                latest.updated_at = now;
            }
            let out = latest.clone();
            return Json(json!({ "success": true, "checkpoint": out, "merged": true }));
        }
        NonceDecision::Advance => {}
    }

    // New, strictly-newer checkpoint. Store it with the single submitted partial sig;
    // the counterparty merges its sig via a same-nonce re-post (handled above).
    let cp = Checkpoint {
        channel_id: covenant_id.clone(),
        nonce: req.nonce,
        sighash_hex: req.sighash_hex.trim().to_string(),
        winner_dest: req.winner_dest.clone(),
        amount_sompi: req.amount_sompi,
        lock_daa: req.lock_daa,
        partial_sigs: vec![PartialSig { signer_xonly: submitted, sig_hex: req.sig_hex.clone() }],
        updated_at: now,
    };
    state.checkpoints.push(cp.clone());
    if state.checkpoints.len() > MAX_CHECKPOINTS_PER_CHANNEL {
        let drop = state.checkpoints.len() - MAX_CHECKPOINTS_PER_CHANNEL;
        state.checkpoints.drain(0..drop);
    }
    Json(json!({ "success": true, "checkpoint": cp, "merged": false }))
}

/// GET /games/:id/channel - the latest checkpoint (highest nonce) for this channel,
/// or success:true with checkpoint:null when none has been posted yet. Read-only;
/// no auth (the data is opaque sighash + sigs, not a secret), but a client can only
/// USE it to broadcast if they already hold both members' agreement.
async fn get_channel(
    Extension(_db): Extension<crate::db::Db>,
    Path(covenant_id): Path<String>,
) -> Json<serde_json::Value> {
    let map = channels().lock().unwrap();
    match map.get(&covenant_id).and_then(|s| s.checkpoints.last()) {
        Some(cp) => Json(json!({ "success": true, "checkpoint": cp.clone() })),
        None => Json(json!({ "success": true, "checkpoint": serde_json::Value::Null })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_keypair(seed: u8) -> secp256k1::Keypair {
        let sk = [seed.max(1); 32];
        secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, &sk).unwrap()
    }

    fn sign_sighash(kp: &secp256k1::Keypair, sighash_hex: &str) -> String {
        let digest = hex::decode(sighash_hex).unwrap();
        let msg = secp256k1::Message::from_digest_slice(&digest).unwrap();
        hex::encode(kp.sign_schnorr(msg).as_ref())
    }

    /// A real member signature over the stored sighash verifies; a wrong-signer or
    /// tampered signature is rejected. This is the property that makes the relay
    /// non-forgeable: the server only ever stores signatures that actually verify.
    #[test]
    fn verify_member_sig_accepts_real_rejects_forged() {
        let kp = test_keypair(7);
        let xonly = hex::encode(kp.x_only_public_key().0.serialize());
        let sighash = hex::encode([0x11u8; 32]);
        let sig = sign_sighash(&kp, &sighash);
        assert!(verify_member_sig(&xonly, &sig, &sighash).is_ok());

        // A different key did not sign this sighash.
        let other = test_keypair(9);
        let other_xonly = hex::encode(other.x_only_public_key().0.serialize());
        assert!(verify_member_sig(&other_xonly, &sig, &sighash).is_err());

        // A signature over a different sighash does not verify against this one.
        let other_sighash = hex::encode([0x22u8; 32]);
        assert!(verify_member_sig(&xonly, &sig, &other_sighash).is_err());
    }

    /// Deliverable (a): the monotonic-nonce gate. A checkpoint whose nonce is <= the stored
    /// latest is REJECTED (fail-closed) - an old, superseded state can never replace a newer
    /// one. The only exception is an IDENTICAL same-nonce checkpoint, which MERGES (so the
    /// second player can co-sign the same agreed state).
    #[test]
    fn nonce_gate_rejects_stale_and_equal_but_merges_identical() {
        let sh = hex::encode([0xabu8; 32]);
        let win = "kaspatest:qwinner";

        // First checkpoint on an empty channel always advances.
        assert_eq!(nonce_decision(None, 1, &sh, win), NonceDecision::Advance);

        // Stored latest = nonce 5. A strictly-greater nonce advances.
        let latest = Some((5u64, sh.as_str(), win));
        assert_eq!(nonce_decision(latest, 6, &sh, win), NonceDecision::Advance);

        // A LOWER nonce is rejected (replay / rollback of an old state).
        assert_eq!(nonce_decision(latest, 4, &sh, win), NonceDecision::Reject);

        // An EQUAL nonce with a DIFFERENT sighash or winner is rejected (cannot overwrite an
        // agreed state with a conflicting one at the same nonce).
        let other_sh = hex::encode([0xcdu8; 32]);
        assert_eq!(nonce_decision(latest, 5, &other_sh, win), NonceDecision::Reject);
        assert_eq!(nonce_decision(latest, 5, &sh, "kaspatest:qother"), NonceDecision::Reject);

        // An EQUAL nonce with the SAME sighash AND winner merges (the counterparty co-signs).
        assert_eq!(nonce_decision(latest, 5, &sh, win), NonceDecision::MergeSameCheckpoint);
        // Case-insensitive / whitespace-tolerant sighash still merges (same value).
        let sh_upper = sh.to_uppercase();
        let sh_padded = format!("  {sh}  ");
        assert_eq!(nonce_decision(latest, 5, &sh_upper, win), NonceDecision::MergeSameCheckpoint);
        assert_eq!(nonce_decision(latest, 5, &sh_padded, win), NonceDecision::MergeSameCheckpoint);
    }
}
