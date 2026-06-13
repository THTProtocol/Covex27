//! covenant_builder.rs - real Kaspa pay-to-script-hash (P2SH) covenant construction.
//! (Roadmap B3: the custody primitive every real covenant builds on.)
//!
//! Until now every Covex "deploy" was a self-payment whose only covenant content
//! was an inert `aa20` metadata payload - nothing ever locked to a script, and the
//! funded output paid straight back to the deployer (signer.rs Output 0 ==
//! deployer_script). This module builds REAL P2SH covenants: funds lock to
//! blake2b256(redeem_script) and can only be moved by satisfying the redeem script.
//! The locking script `pay_to_script_hash_script` emits is exactly the
//! `aa20 <32-byte hash> 87` pattern the crawler/classifier already recognizes as P2SH.
//!
//! ## Signing a P2SH spend (the subtle part, verified against the txscript engine)
//! Kaspa's `calc_schnorr_signature_hash(tx, input_idx, ...)` commits to the spent
//! UTXO's `script_public_key` - which for a P2SH output is the P2SH WRAPPER, not the
//! redeem script. The txscript engine's `check_schnorr_signature` recomputes the same
//! hash the same way. So a P2SH spend is signed exactly like an ordinary input whose
//! `UtxoEntry.script_public_key` is the P2SH wrapper; the satisfier
//! (`OpData65 <sig||sighashtype>` then any extra pushes such as a hashlock preimage)
//! is concatenated with a push of the redeem script via
//! `pay_to_script_hash_signature_script`. The unit tests below run the real
//! `TxScriptEngine` to prove a correct spend passes and a wrong one fails - the
//! consensus-correctness gate before any value is ever locked on-chain.

use axum::{routing::post, Extension, Json, Router};
use kaspa_addresses::{Address, Prefix};
use kaspa_consensus_core::hashing::sighash::{calc_schnorr_signature_hash, SigHashReusedValues};
use kaspa_consensus_core::hashing::sighash_type::SIG_HASH_ALL;
use kaspa_consensus_core::sign::sign_with_multiple_v2;
use kaspa_consensus_core::subnets::SubnetworkId;
use kaspa_consensus_core::tx::{
    ScriptPublicKey, ScriptVec, SignableTransaction, Transaction, TransactionInput,
    TransactionOutpoint, TransactionOutput, UtxoEntry, VerifiableTransaction,
};
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_rpc_core::RpcTransaction;
use kaspa_txscript::opcodes::codes::{OpBlake2b, OpCheckLockTimeVerify, OpCheckSig, OpEqualVerify};
use kaspa_txscript::script_builder::ScriptBuilder;
use kaspa_wrpc_client::KaspaRpcClient;
use rusqlite::Connection;
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use tracing::{info, warn};

use crate::db;
use crate::dev_wallets;

pub type BResult<T> = Result<T, String>;

/// Minimum tx fee (0.0001 KAS), same as signer.rs.
const TX_FEE: u64 = 10_000;

/// The covenant kinds this builder can lock funds into. Each maps to a redeem
/// script that is genuinely enforced by Kaspa consensus (no oracle, no silverc).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RedeemKind {
    /// `<xonly_pubkey> OpCheckSig` - spendable only by the holder of the key.
    /// The minimal real P2SH (proves the lock/spend pipeline end to end).
    SingleSig { xonly_pubkey: [u8; 32] },
    /// `OpBlake2b <hash> OpEqualVerify <xonly_pubkey> OpCheckSig` - conditional
    /// release: spend requires revealing a preimage P with blake2b256(P)==hash
    /// AND a valid signature. The building block for HTLC / commit-reveal escrow.
    HashLock { hash: [u8; 32], xonly_pubkey: [u8; 32] },
    /// `<lock_daa> OpCheckLockTimeVerify OpDrop <xonly_pubkey> OpCheckSig` - an
    /// absolute timelock (vesting cliff / dispute window): spendable only once the
    /// chain DAA score reaches `lock_daa`, then by the key holder.
    Timelock { lock_daa: u64, xonly_pubkey: [u8; 32] },
    /// N-of-M multisig (`OP_required <pk..> OP_total OpCheckMultiSig`): spend
    /// requires `required` of the listed keys. DAO treasuries, 2-of-3 escrow.
    Multisig { pubkeys: Vec<[u8; 32]>, required: usize },
}

impl RedeemKind {
    /// Serialize this kind into its Kaspa redeem script bytes.
    pub fn redeem_script(&self) -> BResult<Vec<u8>> {
        match self {
            RedeemKind::SingleSig { xonly_pubkey } => redeem_singlesig(xonly_pubkey),
            RedeemKind::HashLock { hash, xonly_pubkey } => redeem_hashlock(hash, xonly_pubkey),
            RedeemKind::Timelock { lock_daa, xonly_pubkey } => redeem_timelock(*lock_daa, xonly_pubkey),
            RedeemKind::Multisig { pubkeys, required } => redeem_multisig(pubkeys, *required),
        }
    }
}

/// Redeem script for a single-signature P2SH covenant: `<xonly_pubkey> OpCheckSig`.
pub fn redeem_singlesig(xonly_pubkey: &[u8; 32]) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    b.add_data(xonly_pubkey).map_err(|e| format!("redeem singlesig add_data: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("redeem singlesig add_op: {e}"))?;
    Ok(b.drain())
}

/// Redeem script for a hashlock covenant:
/// `OpBlake2b <hash32> OpEqualVerify <xonly_pubkey> OpCheckSig`.
/// To spend, the satisfier must push the signature then the preimage (preimage on
/// top, so OpBlake2b consumes it first), then the redeem script.
pub fn redeem_hashlock(hash32: &[u8; 32], xonly_pubkey: &[u8; 32]) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    b.add_op(OpBlake2b).map_err(|e| format!("redeem hashlock OpBlake2b: {e}"))?;
    b.add_data(hash32).map_err(|e| format!("redeem hashlock hash: {e}"))?;
    b.add_op(OpEqualVerify).map_err(|e| format!("redeem hashlock OpEqualVerify: {e}"))?;
    b.add_data(xonly_pubkey).map_err(|e| format!("redeem hashlock pubkey: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("redeem hashlock OpCheckSig: {e}"))?;
    Ok(b.drain())
}

/// Redeem script for an absolute timelock:
/// `<lock_daa> OpCheckLockTimeVerify <xonly_pubkey> OpCheckSig`.
/// NOTE: Kaspa's OpCheckLockTimeVerify POPS the lock-time value off the stack
/// (unlike Bitcoin's CLTV, which leaves it), so there is NO OpDrop here - adding one
/// would drop the signature and the spend would fail (caught by the engine test).
/// To spend, the spend tx must set `lock_time >= lock_daa` (same DAA type, i.e. both
/// below LOCK_TIME_THRESHOLD), the input sequence must be non-final, and the chain
/// must have reached lock_daa (else the node treats the tx as non-final).
pub fn redeem_timelock(lock_daa: u64, xonly_pubkey: &[u8; 32]) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    b.add_lock_time(lock_daa).map_err(|e| format!("redeem timelock add_lock_time: {e}"))?;
    b.add_op(OpCheckLockTimeVerify).map_err(|e| format!("redeem timelock CLTV: {e}"))?;
    b.add_data(xonly_pubkey).map_err(|e| format!("redeem timelock pubkey: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("redeem timelock OpCheckSig: {e}"))?;
    Ok(b.drain())
}

/// Redeem script for an N-of-M multisig, built by kaspa-txscript:
/// `OP_required <pk1> .. <pkM> OP_M OpCheckMultiSig`. To spend, the satisfier must
/// push exactly `required` signatures in the same relative order as their pubkeys.
pub fn redeem_multisig(pubkeys: &[[u8; 32]], required: usize) -> BResult<Vec<u8>> {
    kaspa_txscript::multisig_redeem_script(pubkeys.iter(), required)
        .map_err(|e| format!("multisig redeem: {e:?}"))
}

/// Build the input `idx` signature_script for a multisig P2SH spend: `required`
/// OpData65 signatures (in `keypairs` order, which MUST match pubkey order in the
/// redeem) followed by a push of the redeem script.
pub fn build_p2sh_multisig_signature_script(
    signable: &SignableTransaction,
    idx: usize,
    keypairs: &[secp256k1::Keypair],
    redeem: &[u8],
) -> BResult<Vec<u8>> {
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), idx, SIG_HASH_ALL, &mut reused);
    let msg = secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice())
        .map_err(|e| format!("sighash->msg: {e}"))?;
    let mut satisfier: Vec<u8> = Vec::new();
    for kp in keypairs {
        let sig: [u8; 64] = *kp.sign_schnorr(msg).as_ref();
        satisfier.extend(std::iter::once(65u8).chain(sig).chain([SIG_HASH_ALL.to_u8()]));
    }
    kaspa_txscript::pay_to_script_hash_signature_script(redeem.to_vec(), satisfier)
        .map_err(|e| format!("p2sh multisig signature script: {e}"))
}

/// blake2b-256 of a preimage, matching the hash OpBlake2b computes on-chain. Used
/// to build a hashlock's `hash` from a chosen secret.
pub fn blake2b256(data: &[u8]) -> [u8; 32] {
    let digest = blake2b_simd::Params::new().hash_length(32).to_state().update(data).finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(digest.as_bytes());
    out
}

/// The P2SH locking ScriptPublicKey for a redeem script. This is what a deploy's
/// Output 0 funds (the stake is now genuinely locked to the script, not self-paid).
pub fn p2sh_script_pubkey(redeem: &[u8]) -> ScriptPublicKey {
    kaspa_txscript::pay_to_script_hash_script(redeem)
}

/// The kaspa P2SH address (`kaspa:` / `kaspatest:` ...) for a redeem script.
pub fn p2sh_address(redeem: &[u8], prefix: Prefix) -> BResult<Address> {
    kaspa_txscript::extract_script_pub_key_address(&p2sh_script_pubkey(redeem), prefix)
        .map_err(|e| format!("p2sh address: {e}"))
}

/// Network string -> address prefix.
pub fn prefix_for_network(network: &str) -> Prefix {
    if network == "mainnet" || network == "mainnet-1" {
        Prefix::Mainnet
    } else {
        Prefix::Testnet
    }
}

/// Build the input `idx` signature_script that spends a P2SH output.
///
/// `signable` must already have `entries[idx].script_public_key` set to the P2SH
/// wrapper (the on-chain script of the UTXO being spent) and all signature_scripts
/// empty (the sighash excludes them). `extra_after_sig` are pushed (via add_data)
/// after the signature, in stack order (last item ends up on top) - e.g. the
/// preimage for a hashlock. Returns the bytes to assign to
/// `tx.inputs[idx].signature_script`.
pub fn build_p2sh_signature_script(
    signable: &SignableTransaction,
    idx: usize,
    keypair: &secp256k1::Keypair,
    redeem: &[u8],
    extra_after_sig: &[Vec<u8>],
) -> BResult<Vec<u8>> {
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), idx, SIG_HASH_ALL, &mut reused);
    let msg = secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice())
        .map_err(|e| format!("sighash->msg: {e}"))?;
    let sig: [u8; 64] = *keypair.sign_schnorr(msg).as_ref();
    // OpData65 (== 65) pushes the 65-byte (64 sig + 1 sighashtype) signature value.
    let mut satisfier: Vec<u8> = std::iter::once(65u8).chain(sig).chain([SIG_HASH_ALL.to_u8()]).collect();
    for extra in extra_after_sig {
        let mut b = ScriptBuilder::new();
        b.add_data(extra).map_err(|e| format!("satisfier extra push: {e}"))?;
        satisfier.extend_from_slice(&b.drain());
    }
    kaspa_txscript::pay_to_script_hash_signature_script(redeem.to_vec(), satisfier)
        .map_err(|e| format!("p2sh signature script: {e}"))
}

/// Derive the x-only public key (32 bytes) from a 32-byte secp256k1 secret key.
pub fn xonly_from_seckey(seckey: &[u8; 32]) -> BResult<[u8; 32]> {
    let kp = secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, seckey)
        .map_err(|e| format!("bad seckey: {e}"))?;
    Ok(kp.x_only_public_key().0.serialize())
}

// ── HTTP handlers: deploy a P2SH covenant and spend (redeem) it ──────

fn default_network() -> String {
    "testnet-12".to_string()
}

/// Parse a kaspa address into its ScriptPublicKey (P2PK schnorr=32 / P2PK ecdsa=33
/// not handled here / P2SH=via address). Mirrors signer.rs for the 32-byte case.
fn script_pub_key_from_address(addr_str: &str) -> BResult<ScriptPublicKey> {
    let addr = Address::try_from(addr_str).map_err(|e| format!("invalid address '{addr_str}': {e}"))?;
    let payload = addr.payload.as_slice();
    let script_vec: Vec<u8> = match payload.len() {
        32 => {
            let mut s = Vec::with_capacity(34);
            s.push(0x20);
            s.extend_from_slice(payload);
            s.push(0xac);
            s
        }
        20 => {
            // P2SH address payload is the 32-byte script hash, but kaspa P2SH
            // addresses carry a 32-byte payload; 20 is legacy p2pkh. Keep parity
            // with signer.rs which handles both.
            let mut s = Vec::with_capacity(25);
            s.extend_from_slice(&[0x76, 0xa9, 0x14]);
            s.extend_from_slice(payload);
            s.extend_from_slice(&[0x88, 0xac]);
            s
        }
        n => return Err(format!("unexpected address payload length {n}")),
    };
    Ok(ScriptPublicKey::new(0, ScriptVec::from_slice(&script_vec)))
}

async fn client_for_network(network: &str) -> BResult<Arc<KaspaRpcClient>> {
    let wrpc = if network == "testnet-10" {
        std::env::var("KASPA_WRPC_URL_TN10").unwrap_or_else(|_| "ws://127.0.0.1:17210".to_string())
    } else if network == "mainnet" || network == "mainnet-1" {
        std::env::var("KASPA_WRPC_URL_MAINNET").unwrap_or_else(|_| "ws://127.0.0.1:17110".to_string())
    } else {
        std::env::var("KASPA_WRPC_URL_TN12").unwrap_or_else(|_| "ws://127.0.0.1:17217".to_string())
    };
    let c = KaspaRpcClient::new(kaspa_wrpc_client::WrpcEncoding::Borsh, Some(&wrpc), None, None, None)
        .map_err(|e| format!("wRPC client create failed for {network}: {e}"))?;
    let _ = c.connect(None).await;
    Ok(Arc::new(c))
}

/// Resolve the (private_key_hex, address) that signs, honoring use_dev_mode for the
/// two testnet dev wallets (never on mainnet). Mirrors signer.rs.
fn resolve_signing_key(
    network: &str,
    addr: &str,
    private_key_hex: &str,
    use_dev_mode: bool,
) -> BResult<([u8; 32], String)> {
    if (network == "mainnet" || network == "mainnet-1") && use_dev_mode {
        return Err("dev mode is disabled on mainnet; sign with a real wallet".into());
    }
    let (hexkey, address) = if use_dev_mode {
        if addr == dev_wallets::DEV_WALLET_2_ADDRESS_TN12 || addr == dev_wallets::DEV_WALLET_2_ADDRESS_TN10 {
            if network == "testnet-10" {
                (dev_wallets::DEV_WALLET_2_PRIVATE_KEY_TN10.to_string(), dev_wallets::DEV_WALLET_2_ADDRESS_TN10.to_string())
            } else {
                (dev_wallets::DEV_WALLET_2_PRIVATE_KEY_TN12.to_string(), dev_wallets::DEV_WALLET_2_ADDRESS_TN12.to_string())
            }
        } else if network == "testnet-10" {
            (dev_wallets::DEV_WALLET_1_PRIVATE_KEY_TN10.to_string(), dev_wallets::DEV_WALLET_1_ADDRESS_TN10.to_string())
        } else {
            (dev_wallets::DEV_WALLET_1_PRIVATE_KEY_TN12.to_string(), dev_wallets::DEV_WALLET_1_ADDRESS_TN12.to_string())
        }
    } else {
        (private_key_hex.trim().to_string(), addr.to_string())
    };
    let clean = hexkey.trim().trim_start_matches("0x");
    let bytes: [u8; 32] = hex::decode(clean)
        .ok()
        .and_then(|b| b.try_into().ok())
        .ok_or_else(|| "invalid private key: must be 64 hex chars".to_string())?;
    Ok((bytes, address))
}

#[derive(Deserialize)]
pub struct RedeemSpec {
    /// "singlesig" | "hashlock" | "timelock" | "multisig"
    pub kind: String,
    /// hashlock only: the secret preimage as hex. blake2b256(preimage) becomes the
    /// lock hash. The preimage is NEVER stored - the spender re-supplies it.
    #[serde(default)]
    pub preimage_hex: Option<String>,
    /// timelock only: the absolute DAA score before which the funds stay locked.
    #[serde(default)]
    pub lock_daa: Option<u64>,
    /// multisig only: the member x-only pubkeys (hex). If absent in dev mode, the two
    /// dev wallets are used (2-of-2).
    #[serde(default)]
    pub pubkeys_hex: Option<Vec<String>>,
    /// multisig only: how many signatures are required (defaults to all members).
    #[serde(default)]
    pub required: Option<usize>,
}

/// The two testnet dev-wallet secret keys for a network (used as default multisig
/// members and signers in dev-mode demos). Never reachable on mainnet.
fn dev_keys(network: &str) -> BResult<Vec<[u8; 32]>> {
    let (k1, k2) = if network == "testnet-10" {
        (dev_wallets::DEV_WALLET_1_PRIVATE_KEY_TN10, dev_wallets::DEV_WALLET_2_PRIVATE_KEY_TN10)
    } else {
        (dev_wallets::DEV_WALLET_1_PRIVATE_KEY_TN12, dev_wallets::DEV_WALLET_2_PRIVATE_KEY_TN12)
    };
    let dec = |h: &str| -> BResult<[u8; 32]> {
        hex::decode(h.trim()).ok().and_then(|b| b.try_into().ok()).ok_or_else(|| "bad dev key".to_string())
    };
    Ok(vec![dec(k1)?, dec(k2)?])
}

fn decode_xonly_hex(h: &str) -> BResult<[u8; 32]> {
    hex::decode(h.trim().trim_start_matches("0x"))
        .ok()
        .and_then(|b| b.try_into().ok())
        .ok_or_else(|| format!("bad x-only pubkey hex '{h}' (need 64 hex chars)"))
}

#[derive(Deserialize)]
pub struct P2shDeployRequest {
    #[serde(default = "default_network")]
    pub network: String,
    pub deployer_addr: String,
    #[serde(default)]
    pub private_key_hex: String,
    #[serde(default)]
    pub use_dev_mode: bool,
    /// Amount of KAS to LOCK into the P2SH covenant (genuinely script-locked).
    pub stake_kas: f64,
    pub redeem: RedeemSpec,
}

/// POST /covenant/p2sh/deploy - lock `stake_kas` into a real P2SH covenant.
pub async fn p2sh_deploy_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Json(req): Json<P2shDeployRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));

    let (seckey, deployer_addr_str) =
        match resolve_signing_key(&req.network, &req.deployer_addr, &req.private_key_hex, req.use_dev_mode) {
            Ok(v) => v,
            Err(e) => return err(e),
        };

    // Redeem pubkey = the deployer's own key (so the deployer can redeem).
    let xonly = match xonly_from_seckey(&seckey) {
        Ok(x) => x,
        Err(e) => return err(e),
    };
    let (redeem, redeem_kind) = match req.redeem.kind.as_str() {
        "singlesig" => match redeem_singlesig(&xonly) {
            Ok(r) => (r, "singlesig".to_string()),
            Err(e) => return err(e),
        },
        "hashlock" => {
            let preimage_hex = match &req.redeem.preimage_hex {
                Some(p) => p,
                None => return err("hashlock requires preimage_hex".into()),
            };
            let preimage = match hex::decode(preimage_hex.trim()) {
                Ok(b) => b,
                Err(e) => return err(format!("bad preimage_hex: {e}")),
            };
            let hash = blake2b256(&preimage);
            match redeem_hashlock(&hash, &xonly) {
                Ok(r) => (r, "hashlock".to_string()),
                Err(e) => return err(e),
            }
        }
        "timelock" => {
            let lock_daa = match req.redeem.lock_daa {
                Some(d) => d,
                None => return err("timelock requires lock_daa".into()),
            };
            match redeem_timelock(lock_daa, &xonly) {
                // Encode lock_daa into the stored kind so the spend can set tx.lock_time.
                Ok(r) => (r, format!("timelock:{lock_daa}")),
                Err(e) => return err(e),
            }
        }
        "multisig" => {
            let pubkeys: Vec<[u8; 32]> = if let Some(pks) = &req.redeem.pubkeys_hex {
                let mut v = Vec::new();
                for p in pks {
                    match decode_xonly_hex(p) {
                        Ok(x) => v.push(x),
                        Err(e) => return err(e),
                    }
                }
                v
            } else if req.use_dev_mode {
                match dev_keys(&req.network) {
                    Ok(ks) => {
                        let mut v = Vec::new();
                        for k in &ks {
                            match xonly_from_seckey(k) {
                                Ok(x) => v.push(x),
                                Err(e) => return err(e),
                            }
                        }
                        v
                    }
                    Err(e) => return err(e),
                }
            } else {
                return err("multisig requires pubkeys_hex (or use_dev_mode for the two dev wallets)".into());
            };
            let required = req.redeem.required.unwrap_or(pubkeys.len());
            match redeem_multisig(&pubkeys, required) {
                // Encode the member TOTAL so the spend can set the input sig_op_count
                // (Kaspa counts a CheckMultiSig as one sig-op per listed pubkey; too
                // low a sig_op_count yields a "script units exceeded" rejection).
                Ok(r) => (r, format!("multisig:{}", pubkeys.len())),
                Err(e) => return err(e),
            }
        }
        other => return err(format!("unknown redeem kind '{other}' (singlesig|hashlock|timelock|multisig)")),
    };

    let p2sh_spk = p2sh_script_pubkey(&redeem);
    let p2sh_addr = match p2sh_address(&redeem, prefix_for_network(&req.network)) {
        Ok(a) => a.to_string(),
        Err(e) => return err(e),
    };

    let stake_sompi = (req.stake_kas * 100_000_000.0).round() as u64;
    if stake_sompi == 0 {
        return err("stake_kas must be > 0".into());
    }

    let client = match client_for_network(&req.network).await {
        Ok(c) => c,
        Err(e) => return err(e),
    };
    let deployer_addr = match Address::try_from(deployer_addr_str.as_str()) {
        Ok(a) => a,
        Err(e) => return err(format!("invalid deployer address: {e}")),
    };
    let utxos = match client.get_utxos_by_addresses(vec![deployer_addr.clone()]).await {
        Ok(u) => u,
        Err(e) => return err(format!("UTXO fetch failed: {e}")),
    };
    if utxos.is_empty() {
        return err("no UTXOs for deployer address".into());
    }

    // Single largest UTXO funds the lock (keeps mass small).
    let best = utxos.iter().max_by_key(|u| u.utxo_entry.amount).unwrap();
    let total_input = best.utxo_entry.amount;
    let total_cost = stake_sompi + TX_FEE;
    if total_input < total_cost {
        return err(format!(
            "insufficient balance: have {} sompi, need {} sompi",
            total_input, total_cost
        ));
    }
    let deployer_script = best.utxo_entry.script_public_key.clone();
    let change = total_input - total_cost;

    // Output 0 = stake LOCKED to the P2SH script. Output 1 = change to deployer.
    let mut outputs = vec![TransactionOutput { value: stake_sompi, script_public_key: p2sh_spk }];
    if change > 0 {
        outputs.push(TransactionOutput { value: change, script_public_key: deployer_script });
    }

    let inputs = vec![TransactionInput {
        previous_outpoint: TransactionOutpoint {
            transaction_id: best.outpoint.transaction_id,
            index: best.outpoint.index,
        },
        signature_script: vec![],
        sequence: 0,
        sig_op_count: 1,
    }];

    // A non-empty payload is REQUIRED: the TN12 node hashes the payload into each
    // input's sighash, so an empty payload yields a "false stack entry" signature
    // mismatch (see vendor/kaspa-consensus-core sighash::payload_hash). The envelope
    // is the aa20 P2SH marker followed by the locked redeem-script hash, which also
    // makes the covenant discoverable by the crawler's payload-prefix scan.
    let mut deploy_payload = vec![0xaa, 0x20];
    deploy_payload.extend_from_slice(&blake2b256(&redeem));
    let unsigned = Transaction::new_non_finalized(
        0,
        inputs,
        outputs,
        0,
        SubnetworkId::from_bytes([0u8; 20]),
        0,
        deploy_payload,
    );
    let entries = vec![UtxoEntry {
        amount: best.utxo_entry.amount,
        script_public_key: best.utxo_entry.script_public_key.clone(),
        block_daa_score: best.utxo_entry.block_daa_score,
        is_coinbase: best.utxo_entry.is_coinbase,
    }];
    let signable = SignableTransaction::with_entries(unsigned, entries);
    let signed = match sign_with_multiple_v2(signable, &[seckey]).fully_signed() {
        Ok(tx) => tx,
        Err(e) => return err(format!("signing failed: {e:?}")),
    };
    let mut signed = signed;
    signed.tx.finalize();
    let rpc_tx = RpcTransaction::from(&signed.tx);

    match client.submit_transaction(rpc_tx, false).await {
        Ok(tx_id) => {
            let tx_id_str = tx_id.to_string();
            let redeem_hex = hex::encode(&redeem);
            let _ = db::insert_p2sh_covenant(
                &db, &tx_id_str, &req.network, &p2sh_addr, &redeem_hex, &redeem_kind, stake_sompi, 0,
                &deployer_addr_str,
            );
            info!(
                "P2SH covenant deployed: tx={} kind={} addr={} locked={} sompi",
                tx_id_str, redeem_kind, p2sh_addr, stake_sompi
            );
            Json(serde_json::json!({
                "success": true,
                "deploy_tx_id": tx_id_str,
                "p2sh_address": p2sh_addr,
                "redeem_script_hex": redeem_hex,
                "redeem_kind": redeem_kind,
                "outpoint": format!("{}:0", tx_id_str),
                "locked_sompi": stake_sompi,
                "locked_kas": stake_sompi as f64 / 100_000_000.0,
                "note": "Funds are locked to the script hash, not the deployer. Spend via POST /covenant/p2sh/spend."
            }))
        }
        Err(e) => err(format!("broadcast rejected: {e}")),
    }
}

#[derive(Deserialize)]
pub struct P2shSpendRequest {
    #[serde(default = "default_network")]
    pub network: String,
    /// The deploy tx id of the P2SH covenant to redeem.
    pub deploy_tx_id: String,
    #[serde(default)]
    pub private_key_hex: String,
    #[serde(default)]
    pub use_dev_mode: bool,
    /// Where the redeemed funds go.
    pub destination_addr: String,
    /// hashlock only: the preimage (hex) that satisfies the lock.
    #[serde(default)]
    pub preimage_hex: Option<String>,
    /// multisig only: the `required` member secret keys (hex), in pubkey order. If
    /// absent in dev mode, the two dev wallets are used.
    #[serde(default)]
    pub signer_keys_hex: Option<Vec<String>>,
}

/// POST /covenant/p2sh/spend - redeem a P2SH covenant by satisfying its script.
pub async fn p2sh_spend_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Json(req): Json<P2shSpendRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));

    let cov = match db::get_p2sh_covenant(&db, &req.deploy_tx_id) {
        Some(c) => c,
        None => return err(format!("no P2SH covenant found for deploy_tx_id {}", req.deploy_tx_id)),
    };
    if let Some(spent) = &cov.spent_tx_id {
        return err(format!("covenant already spent in tx {spent}"));
    }
    let redeem = match hex::decode(&cov.redeem_script_hex) {
        Ok(b) => b,
        Err(e) => return err(format!("corrupt stored redeem script: {e}")),
    };
    // Redeem-kind dispatch: multisig (N keys), timelock (single owner key + lock_time),
    // singlesig/hashlock (single owner key).
    let is_multisig = cov.redeem_kind.starts_with("multisig");
    let multisig_total: u8 =
        cov.redeem_kind.strip_prefix("multisig:").and_then(|s| s.parse::<u8>().ok()).unwrap_or(1);
    let lock_daa: Option<u64> =
        cov.redeem_kind.strip_prefix("timelock:").and_then(|s| s.parse::<u64>().ok());

    // Extra satisfier pushes (after the sig): the preimage for a hashlock.
    let extra: Vec<Vec<u8>> = if cov.redeem_kind == "hashlock" {
        let p = match &req.preimage_hex {
            Some(p) => p,
            None => return err("hashlock spend requires preimage_hex".into()),
        };
        match hex::decode(p.trim()) {
            Ok(b) => vec![b],
            Err(e) => return err(format!("bad preimage_hex: {e}")),
        }
    } else {
        vec![]
    };

    // Resolve the signing key(s). Multisig needs `required` keys; the single-key kinds
    // are signed by the covenant OWNER (the deployer who can satisfy the redeem).
    let keypairs: Vec<secp256k1::Keypair> = if is_multisig {
        let seckeys: Vec<[u8; 32]> = if let Some(keys) = &req.signer_keys_hex {
            let mut v = Vec::new();
            for k in keys {
                match hex::decode(k.trim().trim_start_matches("0x")).ok().and_then(|b| b.try_into().ok()) {
                    Some(b) => v.push(b),
                    None => return err("bad signer key hex (need 64 hex chars)".into()),
                }
            }
            v
        } else if req.use_dev_mode {
            match dev_keys(&req.network) {
                Ok(ks) => ks,
                Err(e) => return err(e),
            }
        } else {
            return err("multisig spend requires signer_keys_hex (or use_dev_mode)".into());
        };
        let mut kps = Vec::new();
        for sk in &seckeys {
            match secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, sk) {
                Ok(k) => kps.push(k),
                Err(e) => return err(format!("bad signer key: {e}")),
            }
        }
        kps
    } else {
        let (seckey, _addr) =
            match resolve_signing_key(&req.network, &cov.owner_addr, &req.private_key_hex, req.use_dev_mode) {
                Ok(v) => v,
                Err(e) => return err(e),
            };
        match secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, &seckey) {
            Ok(k) => vec![k],
            Err(e) => return err(format!("bad key: {e}")),
        }
    };

    let client = match client_for_network(&req.network).await {
        Ok(c) => c,
        Err(e) => return err(e),
    };
    // Find the P2SH UTXO at (deploy_tx_id, outpoint_index).
    let p2sh_addr = match Address::try_from(cov.p2sh_address.as_str()) {
        Ok(a) => a,
        Err(e) => return err(format!("stored p2sh address invalid: {e}")),
    };
    let utxos = match client.get_utxos_by_addresses(vec![p2sh_addr]).await {
        Ok(u) => u,
        Err(e) => return err(format!("UTXO fetch failed: {e}")),
    };
    let utxo = utxos.iter().find(|u| {
        u.outpoint.transaction_id.to_string() == cov.tx_id && u.outpoint.index == cov.outpoint_index
    });
    let utxo = match utxo {
        Some(u) => u,
        None => return err("P2SH UTXO not found on-chain (unconfirmed, already spent, or wrong network)".into()),
    };
    let amount = utxo.utxo_entry.amount;
    if amount <= TX_FEE {
        return err("locked amount does not cover the tx fee".into());
    }
    let dest_script = match script_pub_key_from_address(&req.destination_addr) {
        Ok(s) => s,
        Err(e) => return err(e),
    };
    let p2sh_spk = p2sh_script_pubkey(&redeem);

    let inputs = vec![TransactionInput {
        previous_outpoint: TransactionOutpoint {
            transaction_id: utxo.outpoint.transaction_id,
            index: utxo.outpoint.index,
        },
        signature_script: vec![],
        sequence: 0, // non-final, required for CLTV timelock spends
        // Kaspa counts a CheckMultiSig as one sig-op per listed pubkey; the declared
        // count must cover the redeem's actual sig ops or the node rejects with
        // "script units exceeded". Single-key redeems use 1.
        sig_op_count: if is_multisig { multisig_total } else { 1 },
    }];
    let outputs = vec![TransactionOutput { value: amount - TX_FEE, script_public_key: dest_script }];
    // Non-empty payload required (same sighash reason as deploy). Not an aa-envelope,
    // so the crawler does not misread a redeem spend as a new covenant.
    let spend_payload = b"covex-p2sh-spend".to_vec();
    // Timelock spends must set lock_time >= lock_daa (and the chain must have reached
    // it, else the node rejects the tx as non-final). We set it exactly to lock_daa.
    let spend_lock_time = lock_daa.unwrap_or(0);
    let unsigned = Transaction::new_non_finalized(
        0,
        inputs,
        outputs,
        spend_lock_time,
        SubnetworkId::from_bytes([0u8; 20]),
        0,
        spend_payload,
    );
    let entries = vec![UtxoEntry {
        amount,
        script_public_key: p2sh_spk,
        block_daa_score: utxo.utxo_entry.block_daa_score,
        is_coinbase: utxo.utxo_entry.is_coinbase,
    }];
    let mut signable = SignableTransaction::with_entries(unsigned, entries);
    let sig_script = if is_multisig {
        match build_p2sh_multisig_signature_script(&signable, 0, &keypairs, &redeem) {
            Ok(s) => s,
            Err(e) => return err(format!("build multisig spend script: {e}")),
        }
    } else {
        match build_p2sh_signature_script(&signable, 0, &keypairs[0], &redeem, &extra) {
            Ok(s) => s,
            Err(e) => return err(format!("build spend script: {e}")),
        }
    };
    signable.tx.inputs[0].signature_script = sig_script;
    signable.tx.finalize();
    let rpc_tx = RpcTransaction::from(&signable.tx);

    match client.submit_transaction(rpc_tx, false).await {
        Ok(tx_id) => {
            let spent_id = tx_id.to_string();
            let _ = db::mark_p2sh_spent(&db, &cov.tx_id, &spent_id);
            info!("P2SH covenant {} redeemed in tx {}", cov.tx_id, spent_id);
            Json(serde_json::json!({
                "success": true,
                "spend_tx_id": spent_id,
                "redeemed_sompi": amount - TX_FEE,
                "redeemed_kas": (amount - TX_FEE) as f64 / 100_000_000.0,
                "destination": req.destination_addr,
            }))
        }
        Err(e) => {
            warn!("P2SH spend broadcast rejected for {}: {}", cov.tx_id, e);
            err(format!("broadcast rejected: {e}"))
        }
    }
}

pub fn p2sh_routes() -> Router {
    Router::new()
        .route("/covenant/p2sh/deploy", post(p2sh_deploy_handler))
        .route("/covenant/p2sh/spend", post(p2sh_spend_handler))
}

#[cfg(test)]
mod tests {
    use super::*;
    use kaspa_consensus_core::subnets::SubnetworkId;
    use kaspa_consensus_core::tx::{
        Transaction, TransactionInput, TransactionOutpoint, TransactionOutput, UtxoEntry,
    };
    use kaspa_txscript::{caches::Cache, TxScriptEngine};
    use secp256k1::Keypair;

    fn test_keypair(seed: u8) -> Keypair {
        let sk = [seed.max(1); 32];
        Keypair::from_seckey_slice(secp256k1::SECP256K1, &sk).unwrap()
    }

    /// Build a 1-input P2SH spend tx with the given lock_time/sequence, let `make_sig`
    /// produce the signature_script from the (unsigned) signable, install it, and run
    /// the real consensus engine. Returns whether `execute()` succeeded.
    fn run_spend_generic(
        redeem: &[u8],
        lock_time: u64,
        sequence: u64,
        make_sig: impl Fn(&SignableTransaction) -> Vec<u8>,
    ) -> bool {
        let prev = TransactionOutpoint { transaction_id: kaspa_hashes::Hash::from_bytes([7u8; 32]), index: 0 };
        let tx = Transaction::new(
            0,
            vec![TransactionInput { previous_outpoint: prev, signature_script: vec![], sequence, sig_op_count: 1 }],
            vec![TransactionOutput { value: 90_000_000, script_public_key: p2sh_script_pubkey(redeem) }],
            lock_time,
            SubnetworkId::from_bytes([0u8; 20]),
            0,
            vec![],
        );
        let entries = vec![UtxoEntry {
            amount: 100_000_000,
            script_public_key: p2sh_script_pubkey(redeem),
            block_daa_score: 1,
            is_coinbase: false,
        }];
        let mut signable = SignableTransaction::with_entries(tx, entries);
        let sig_script = make_sig(&signable);
        signable.tx.inputs[0].signature_script = sig_script;

        let verifiable = signable.as_verifiable();
        let (input, entry) = verifiable.populated_inputs().next().unwrap();
        let mut reused = SigHashReusedValues::new();
        let cache = Cache::new(10_000);
        let mut engine =
            TxScriptEngine::from_transaction_input(&verifiable, input, 0, entry, &mut reused, &cache).unwrap();
        engine.execute().is_ok()
    }

    /// Single-key spend (singlesig / hashlock) at lock_time 0, non-final sequence.
    fn run_spend(redeem: &[u8], sign_kp: &Keypair, extra_after_sig: &[Vec<u8>]) -> bool {
        run_spend_generic(redeem, 0, 0, |s| {
            build_p2sh_signature_script(s, 0, sign_kp, redeem, extra_after_sig).unwrap()
        })
    }

    #[test]
    fn singlesig_p2sh_spend_valid_and_invalid() {
        let kp = test_keypair(11);
        let xonly = kp.x_only_public_key().0.serialize();
        let redeem = redeem_singlesig(&xonly).unwrap();

        // Correct key spends.
        assert!(run_spend(&redeem, &kp, &[]), "correct single-sig spend must satisfy the P2SH lock");

        // Wrong key is rejected by the engine.
        let wrong = test_keypair(99);
        assert!(!run_spend(&redeem, &wrong, &[]), "wrong-key single-sig spend must be rejected");
    }

    #[test]
    fn hashlock_p2sh_spend_requires_preimage_and_sig() {
        let kp = test_keypair(22);
        let xonly = kp.x_only_public_key().0.serialize();
        let preimage = b"covex-secret-preimage-v1".to_vec();
        let hash = blake2b256(&preimage);
        let redeem = redeem_hashlock(&hash, &xonly).unwrap();

        // Correct preimage + correct key spends.
        assert!(run_spend(&redeem, &kp, &[preimage.clone()]), "correct hashlock spend must satisfy the lock");

        // Wrong preimage is rejected (OpEqualVerify fails).
        assert!(!run_spend(&redeem, &kp, &[b"wrong-preimage".to_vec()]), "wrong preimage must be rejected");

        // Correct preimage but wrong key is rejected (OpCheckSig fails).
        let wrong = test_keypair(98);
        assert!(!run_spend(&redeem, &wrong, &[preimage]), "wrong key must be rejected even with correct preimage");
    }

    #[test]
    fn p2sh_script_pubkey_is_aa20_pattern() {
        // The crawler/classifier recognizes P2SH as aa20 <32 bytes> 87.
        let kp = test_keypair(33);
        let redeem = redeem_singlesig(&kp.x_only_public_key().0.serialize()).unwrap();
        let spk = p2sh_script_pubkey(&redeem);
        let script = spk.script();
        assert_eq!(script.len(), 35, "P2SH script is 1 + 32 + 1 bytes");
        assert_eq!(script[0], 0xaa, "leading OpBlake2b opcode");
        assert_eq!(script[1], 0x20, "32-byte push");
        assert_eq!(script[34], 0x87, "trailing OpEqual");
    }

    #[test]
    fn p2sh_address_round_trips() {
        let kp = test_keypair(44);
        let redeem = redeem_singlesig(&kp.x_only_public_key().0.serialize()).unwrap();
        let addr = p2sh_address(&redeem, Prefix::Testnet).unwrap();
        assert!(addr.to_string().starts_with("kaspatest:"), "testnet P2SH address prefix");
    }

    #[test]
    fn timelock_p2sh_spend_respects_locktime() {
        let kp = test_keypair(55);
        let xonly = kp.x_only_public_key().0.serialize();
        let lock_daa: u64 = 1_000_000;
        let redeem = redeem_timelock(lock_daa, &xonly).unwrap();
        let sign = |s: &SignableTransaction| build_p2sh_signature_script(s, 0, &kp, &redeem, &[]).unwrap();

        // tx.lock_time == lock_daa, input not final -> CLTV satisfied.
        assert!(run_spend_generic(&redeem, lock_daa, 0, sign), "spend at lock_time==lock_daa must pass");
        // tx.lock_time above lock_daa also passes (lock elapsed further).
        assert!(run_spend_generic(&redeem, lock_daa + 50, 0, sign), "spend after the lock must pass");
        // tx.lock_time below lock_daa -> CLTV fails (still locked).
        assert!(!run_spend_generic(&redeem, lock_daa - 1, 0, sign), "spend before the lock must be rejected");
        // A finalized input (max sequence) disables locktime enforcement -> rejected.
        assert!(!run_spend_generic(&redeem, lock_daa, u64::MAX, sign), "finalized input must be rejected by CLTV");
    }

    #[test]
    fn multisig_2_of_3_requires_two_distinct_sigs() {
        let kp1 = test_keypair(61);
        let kp2 = test_keypair(62);
        let kp3 = test_keypair(63);
        let pks = vec![
            kp1.x_only_public_key().0.serialize(),
            kp2.x_only_public_key().0.serialize(),
            kp3.x_only_public_key().0.serialize(),
        ];
        let redeem = redeem_multisig(&pks, 2).unwrap();

        // 2 of 3 (in pubkey order) -> passes.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| build_p2sh_multisig_signature_script(s, 0, &[kp1, kp2], &redeem).unwrap()),
            "2-of-3 with two valid sigs must pass"
        );
        // Only 1 signature -> fails.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_p2sh_multisig_signature_script(s, 0, &[kp1], &redeem).unwrap()),
            "2-of-3 with a single sig must be rejected"
        );
        // 2 sigs but one from a non-member key -> fails.
        let outsider = test_keypair(99);
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_p2sh_multisig_signature_script(s, 0, &[kp1, outsider], &redeem).unwrap()),
            "a signature from a non-member key must be rejected"
        );
    }
}
