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
use kaspa_txscript::opcodes::codes::{
    OpBlake2b, OpCheckLockTimeVerify, OpCheckSig, OpCheckSigVerify, OpElse, OpEndIf, OpEqualVerify, OpFalse,
    OpIf, OpTrue,
};
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
    /// `<lock_daa> OpCheckLockTimeVerify <xonly_pubkey> OpCheckSig` - an absolute
    /// timelock (vesting cliff / dispute window): spendable only once the chain DAA
    /// score reaches `lock_daa`, then by the key holder. (No OpDrop: Kaspa's CLTV pops
    /// its operand, unlike Bitcoin's.)
    Timelock { lock_daa: u64, xonly_pubkey: [u8; 32] },
    /// N-of-M multisig (`OP_required <pk..> OP_total OpCheckMultiSig`): spend
    /// requires `required` of the listed keys. DAO treasuries, 2-of-3 escrow.
    Multisig { pubkeys: Vec<[u8; 32]>, required: usize },
    /// HTLC (atomic swap): either the RECEIVER claims by revealing a preimage +
    /// signing, OR the SENDER refunds after `lock_daa` by signing. The two halves of
    /// a cross-chain or cross-party atomic swap.
    Htlc { hash: [u8; 32], receiver_pubkey: [u8; 32], lock_daa: u64, sender_pubkey: [u8; 32] },
    /// Trustless 2-player state-channel pot (no oracle key): `OP_IF <p1> OpCheckSigVerify
    /// <p2> OpCheckSig OP_ELSE <lock_daa> OpCheckLockTimeVerify <p1> OpCheckSig OP_ENDIF`.
    /// IF = cooperative 2-of-2 close (pays the agreed winner); ELSE = funder refund after
    /// `lock_daa`. Covex is never in the payout path.
    Channel { p1: [u8; 32], p2: [u8; 32], lock_daa: u64 },
    /// Oracle-enforced payout (D1): a 2-of-2 multisig of `[oracle, winner]`, so the chain
    /// itself requires the disclosed oracle's co-signature on the winner's claim.
    OracleEnforced { oracle: [u8; 32], winner: [u8; 32] },
    /// Oracle-enforced 2-player escrow / game pot: `<oracle> OpCheckSigVerify OP_IF
    /// <player_a> OpCheckSig OP_ELSE <player_b> OpCheckSig OP_ENDIF`. The chain requires
    /// the oracle's co-signature AND the winning player's signature on their branch.
    OracleEscrow { oracle: [u8; 32], player_a: [u8; 32], player_b: [u8; 32] },
}

impl RedeemKind {
    /// Serialize this kind into its Kaspa redeem script bytes (the single source of truth;
    /// the deploy handler and the spend path both route through here).
    pub fn redeem_script(&self) -> BResult<Vec<u8>> {
        match self {
            RedeemKind::SingleSig { xonly_pubkey } => redeem_singlesig(xonly_pubkey),
            RedeemKind::HashLock { hash, xonly_pubkey } => redeem_hashlock(hash, xonly_pubkey),
            RedeemKind::Timelock { lock_daa, xonly_pubkey } => redeem_timelock(*lock_daa, xonly_pubkey),
            RedeemKind::Multisig { pubkeys, required } => redeem_multisig(pubkeys, *required),
            RedeemKind::Htlc { hash, receiver_pubkey, lock_daa, sender_pubkey } => {
                redeem_htlc(hash, receiver_pubkey, *lock_daa, sender_pubkey)
            }
            RedeemKind::Channel { p1, p2, lock_daa } => redeem_channel(p1, p2, *lock_daa),
            RedeemKind::OracleEnforced { oracle, winner } => redeem_multisig(&[*oracle, *winner], 2),
            RedeemKind::OracleEscrow { oracle, player_a, player_b } => {
                redeem_oracle_escrow(oracle, player_a, player_b)
            }
        }
    }

    /// The canonical `redeem_kind` string persisted with the covenant. Numeric params
    /// (lock DAA, multisig member total) ride after a ':' so the spend path can rebuild
    /// tx.lock_time / the input sig_op_count. This is the exact inverse of the deploy
    /// dispatch (kept byte-identical so existing rows keep round-tripping).
    pub fn kind_str(&self) -> String {
        match self {
            RedeemKind::SingleSig { .. } => "singlesig".to_string(),
            RedeemKind::HashLock { .. } => "hashlock".to_string(),
            RedeemKind::Timelock { lock_daa, .. } => format!("timelock:{lock_daa}"),
            RedeemKind::Multisig { pubkeys, .. } => format!("multisig:{}", pubkeys.len()),
            RedeemKind::Htlc { lock_daa, .. } => format!("htlc:{lock_daa}"),
            RedeemKind::Channel { lock_daa, .. } => format!("channel:{lock_daa}"),
            RedeemKind::OracleEnforced { .. } => "oracle:2".to_string(),
            RedeemKind::OracleEscrow { .. } => "oracle_escrow".to_string(),
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

/// Redeem script for an HTLC (atomic swap):
/// `OP_IF  OpBlake2b <hash> OpEqualVerify <receiver> OpCheckSig
///  OP_ELSE <lock_daa> OpCheckLockTimeVerify <sender> OpCheckSig  OP_ENDIF`.
/// The IF branch is the receiver's claim (reveal preimage + sign); the ELSE branch
/// is the sender's refund after the timelock elapses.
pub fn redeem_htlc(
    hash32: &[u8; 32],
    receiver_pubkey: &[u8; 32],
    lock_daa: u64,
    sender_pubkey: &[u8; 32],
) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    b.add_op(OpIf).map_err(|e| format!("htlc OpIf: {e}"))?;
    b.add_op(OpBlake2b).map_err(|e| format!("htlc OpBlake2b: {e}"))?;
    b.add_data(hash32).map_err(|e| format!("htlc hash: {e}"))?;
    b.add_op(OpEqualVerify).map_err(|e| format!("htlc OpEqualVerify: {e}"))?;
    b.add_data(receiver_pubkey).map_err(|e| format!("htlc receiver: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("htlc claim OpCheckSig: {e}"))?;
    b.add_op(OpElse).map_err(|e| format!("htlc OpElse: {e}"))?;
    b.add_lock_time(lock_daa).map_err(|e| format!("htlc add_lock_time: {e}"))?;
    b.add_op(OpCheckLockTimeVerify).map_err(|e| format!("htlc CLTV: {e}"))?;
    b.add_data(sender_pubkey).map_err(|e| format!("htlc sender: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("htlc refund OpCheckSig: {e}"))?;
    b.add_op(OpEndIf).map_err(|e| format!("htlc OpEndIf: {e}"))?;
    Ok(b.drain())
}

/// Redeem script for an oracle-enforced 2-player escrow / game pot:
/// `<oracle> OpCheckSigVerify  OP_IF <player_a> OpCheckSig OP_ELSE <player_b> OpCheckSig OP_ENDIF`.
/// The chain requires BOTH the disclosed oracle's signature (always) AND the winning
/// player's signature on their own branch. The oracle co-signs only the actual winner's
/// claim, so neither a loser nor a third party can take the pot. This is the on-chain
/// enforcement for 2-party games / markets where the winner is unknown at deploy time.
pub fn redeem_oracle_escrow(
    oracle: &[u8; 32],
    player_a: &[u8; 32],
    player_b: &[u8; 32],
) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    b.add_data(oracle).map_err(|e| format!("escrow oracle: {e}"))?;
    b.add_op(OpCheckSigVerify).map_err(|e| format!("escrow OpCheckSigVerify: {e}"))?;
    b.add_op(OpIf).map_err(|e| format!("escrow OpIf: {e}"))?;
    b.add_data(player_a).map_err(|e| format!("escrow player_a: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("escrow a OpCheckSig: {e}"))?;
    b.add_op(OpElse).map_err(|e| format!("escrow OpElse: {e}"))?;
    b.add_data(player_b).map_err(|e| format!("escrow player_b: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("escrow b OpCheckSig: {e}"))?;
    b.add_op(OpEndIf).map_err(|e| format!("escrow OpEndIf: {e}"))?;
    Ok(b.drain())
}

/// Build the input `idx` signature_script that releases an oracle escrow to the winner.
/// The satisfier (bottom->top) is `<winner_player_sig> <branch> <oracle_sig>`: the
/// player's sig is consumed by the branch's OpCheckSig, the branch selector picks IF
/// (player A) or ELSE (player B), and the oracle's sig (on top) is consumed by the
/// leading OpCheckSigVerify. `winner_is_a` true => IF branch (player A won).
pub fn build_oracle_escrow_signature_script(
    signable: &SignableTransaction,
    idx: usize,
    oracle_kp: &secp256k1::Keypair,
    player_kp: &secp256k1::Keypair,
    winner_is_a: bool,
    redeem: &[u8],
) -> BResult<Vec<u8>> {
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), idx, SIG_HASH_ALL, &mut reused);
    let msg = secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice())
        .map_err(|e| format!("sighash->msg: {e}"))?;
    let player_sig: [u8; 64] = *player_kp.sign_schnorr(msg).as_ref();
    let oracle_sig: [u8; 64] = *oracle_kp.sign_schnorr(msg).as_ref();

    let mut satisfier: Vec<u8> = Vec::new();
    // 1. winning player's signature (bottom of the stack; consumed by the branch).
    satisfier.extend(std::iter::once(65u8).chain(player_sig).chain([SIG_HASH_ALL.to_u8()]));
    // 2. branch selector.
    satisfier.push(if winner_is_a { OpTrue } else { OpFalse });
    // 3. oracle signature (top; consumed by the leading OpCheckSigVerify).
    satisfier.extend(std::iter::once(65u8).chain(oracle_sig).chain([SIG_HASH_ALL.to_u8()]));

    kaspa_txscript::pay_to_script_hash_signature_script(redeem.to_vec(), satisfier)
        .map_err(|e| format!("oracle escrow signature script: {e}"))
}

/// Build the input `idx` signature_script that spends an HTLC.
/// `claim`=true takes the receiver's preimage branch (satisfier: sig, preimage,
/// OP_TRUE); `claim`=false takes the sender's refund branch (satisfier: sig,
/// OP_FALSE) - the spend tx must then set lock_time >= lock_daa and a non-final
/// sequence. The `keypair` must be the receiver (claim) or sender (refund) key.
pub fn build_htlc_signature_script(
    signable: &SignableTransaction,
    idx: usize,
    keypair: &secp256k1::Keypair,
    redeem: &[u8],
    claim: bool,
    preimage: Option<&[u8]>,
) -> BResult<Vec<u8>> {
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), idx, SIG_HASH_ALL, &mut reused);
    let msg = secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice())
        .map_err(|e| format!("sighash->msg: {e}"))?;
    let sig: [u8; 64] = *keypair.sign_schnorr(msg).as_ref();
    let mut satisfier: Vec<u8> = std::iter::once(65u8).chain(sig).chain([SIG_HASH_ALL.to_u8()]).collect();
    if claim {
        let p = preimage.ok_or_else(|| "HTLC claim requires a preimage".to_string())?;
        let mut b = ScriptBuilder::new();
        b.add_data(p).map_err(|e| format!("htlc preimage push: {e}"))?;
        satisfier.extend_from_slice(&b.drain());
        satisfier.push(OpTrue); // select the IF (claim) branch
    } else {
        satisfier.push(OpFalse); // select the ELSE (refund) branch
    }
    kaspa_txscript::pay_to_script_hash_signature_script(redeem.to_vec(), satisfier)
        .map_err(|e| format!("htlc signature script: {e}"))
}

/// Redeem script for a trustless 2-player game channel (no oracle key):
/// `OP_IF  <p1> OpCheckSigVerify <p2> OpCheckSig
///  OP_ELSE <lock_daa> OpCheckLockTimeVerify <p1> OpCheckSig  OP_ENDIF`.
/// IF = the cooperative close: BOTH players co-sign the agreed winner's payout, so the
/// chain pays the winner with no third party. ELSE = the timeout default: after `lock_daa`
/// the funder (p1) can refund, so a non-cooperating counterparty cannot freeze the pot
/// forever. This is the on-chain half of a state channel; Covex is never in the path.
pub fn redeem_channel(p1: &[u8; 32], p2: &[u8; 32], lock_daa: u64) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    b.add_op(OpIf).map_err(|e| format!("channel OpIf: {e}"))?;
    b.add_data(p1).map_err(|e| format!("channel p1: {e}"))?;
    b.add_op(OpCheckSigVerify).map_err(|e| format!("channel p1 CheckSigVerify: {e}"))?;
    b.add_data(p2).map_err(|e| format!("channel p2: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("channel p2 CheckSig: {e}"))?;
    b.add_op(OpElse).map_err(|e| format!("channel OpElse: {e}"))?;
    b.add_lock_time(lock_daa).map_err(|e| format!("channel add_lock_time: {e}"))?;
    b.add_op(OpCheckLockTimeVerify).map_err(|e| format!("channel CLTV: {e}"))?;
    b.add_data(p1).map_err(|e| format!("channel refund p1: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("channel refund CheckSig: {e}"))?;
    b.add_op(OpEndIf).map_err(|e| format!("channel OpEndIf: {e}"))?;
    Ok(b.drain())
}

/// Build the input `idx` signature_script for a channel spend.
/// `cooperative`=true (the close): satisfier bottom->top `<sig_p2> <sig_p1> OP_TRUE`;
/// both players sign the same sighash and the IF branch pays whatever the tx outputs say
/// (the agreed winner). `cooperative`=false (the refund): satisfier `<sig_p1> OP_FALSE`;
/// the spend tx must set `lock_time >= lock_daa` and a non-final sequence. `kp2` is required
/// only for the cooperative close.
pub fn build_channel_signature_script(
    signable: &SignableTransaction,
    idx: usize,
    kp1: &secp256k1::Keypair,
    kp2: Option<&secp256k1::Keypair>,
    cooperative: bool,
    redeem: &[u8],
) -> BResult<Vec<u8>> {
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), idx, SIG_HASH_ALL, &mut reused);
    let msg = secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice())
        .map_err(|e| format!("sighash->msg: {e}"))?;
    let push65 = |sig: [u8; 64]| -> Vec<u8> {
        std::iter::once(65u8).chain(sig).chain([SIG_HASH_ALL.to_u8()]).collect()
    };
    let sig1: [u8; 64] = *kp1.sign_schnorr(msg).as_ref();
    let mut satisfier: Vec<u8> = Vec::new();
    if cooperative {
        let kp2 = kp2.ok_or_else(|| "cooperative channel close needs both player keys".to_string())?;
        let sig2: [u8; 64] = *kp2.sign_schnorr(msg).as_ref();
        // bottom->top: sig_p2 (consumed by p2 OpCheckSig), sig_p1 (consumed by p1
        // OpCheckSigVerify), then OP_TRUE to select the IF branch.
        satisfier.extend(push65(sig2));
        satisfier.extend(push65(sig1));
        satisfier.push(OpTrue);
    } else {
        // refund: p1's sig then OP_FALSE to select the ELSE (timeout) branch.
        satisfier.extend(push65(sig1));
        satisfier.push(OpFalse);
    }
    kaspa_txscript::pay_to_script_hash_signature_script(redeem.to_vec(), satisfier)
        .map_err(|e| format!("channel signature script: {e}"))
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

/// Parse the 32-byte x-only pubkeys pushed in a redeem script. Pubkeys are pushed via
/// OpData32 (0x20) + 32 bytes. `checksig_only` keeps ONLY pushes immediately followed by
/// OpCheckSig (0xac) or OpCheckSigVerify (0xad) - this excludes a hashlock/HTLC hash push
/// (followed by OpEqualVerify), so HTLC yields [receiver, sender] and channel yields
/// [p1, p2, p1]. With `checksig_only=false` every 0x20<32> push is returned (used for an
/// N-of-M multisig, whose `<m> pk1..pkn <n> OpCheckMultiSig` has no hash and whose pubkeys
/// are NOT each directly followed by a checksig op).
fn parse_redeem_pubkeys(redeem: &[u8], checksig_only: bool) -> Vec<[u8; 32]> {
    let mut out = Vec::new();
    let mut i = 0usize;
    while i + 33 <= redeem.len() {
        if redeem[i] == 0x20 {
            let is_pubkey = if checksig_only {
                let next = redeem.get(i + 33).copied();
                matches!(next, Some(0xac) | Some(0xad))
            } else {
                true
            };
            if is_pubkey {
                let mut pk = [0u8; 32];
                pk.copy_from_slice(&redeem[i + 1..i + 33]);
                out.push(pk);
                i += 33;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn push65(sig: &[u8; 64]) -> Vec<u8> {
    std::iter::once(65u8).chain(sig.iter().copied()).chain([SIG_HASH_ALL.to_u8()]).collect()
}

/// Assemble the input signature_script for a multi-party P2SH spend from EXTERNALLY
/// produced BIP340 signatures (the non-custodial path: each signature was made in a user's
/// wallet over the prepared sighash; no key ever touches the server). The byte layout is
/// IDENTICAL to the custodial build_* satisfiers - only the signatures' provenance differs.
///
/// - `members`: pubkeys parsed from the redeem in SCRIPT order (multisig: [pk1..pkn];
///   channel: [p1, p2, p1]; htlc: [receiver, sender]).
/// - `sigs`: signer x-only pubkey hex -> 64-byte signature, as each wallet produced it.
/// - `solo`: the single signature for one-signer kinds (singlesig/hashlock/timelock and the
///   single-signer HTLC/channel branches), when the caller passed `signature_hex`.
fn assemble_noncustodial_satisfier(
    kind_base: &str,
    branch_refund: bool,
    redeem: &[u8],
    members: &[[u8; 32]],
    sigs: &std::collections::HashMap<String, [u8; 64]>,
    solo: Option<&[u8; 64]>,
    preimage: Option<&[u8]>,
) -> BResult<Vec<u8>> {
    let need_solo = || solo.ok_or_else(|| "this spend needs one signature (signature_hex)".to_string());
    let sig_for = |pk: &[u8; 32]| -> Option<[u8; 64]> { sigs.get(&hex::encode(pk)).copied() };
    let preimage_push = |p: &[u8]| -> BResult<Vec<u8>> {
        let mut b = ScriptBuilder::new();
        b.add_data(p).map_err(|e| format!("preimage push: {e}"))?;
        Ok(b.drain())
    };

    let mut satisfier: Vec<u8> = Vec::new();
    match kind_base {
        "singlesig" | "timelock" => {
            satisfier.extend(push65(need_solo()?));
        }
        "hashlock" => {
            satisfier.extend(push65(need_solo()?));
            let p = preimage.ok_or_else(|| "hashlock spend requires preimage_hex".to_string())?;
            satisfier.extend(preimage_push(p)?);
        }
        "htlc" => {
            // claim = receiver sig + preimage + OP_TRUE; refund = sender sig + OP_FALSE.
            satisfier.extend(push65(need_solo()?));
            if branch_refund {
                satisfier.push(OpFalse);
            } else {
                let p = preimage.ok_or_else(|| "HTLC claim requires preimage_hex".to_string())?;
                satisfier.extend(preimage_push(p)?);
                satisfier.push(OpTrue);
            }
        }
        "multisig" => {
            // Push each present member's sig in pubkey (script) order; OpCheckMultiSig pops
            // them in that order. Missing members are skipped (an m-of-n subset).
            let mut count = 0;
            for pk in members {
                if let Some(sig) = sig_for(pk) {
                    satisfier.extend(push65(&sig));
                    count += 1;
                }
            }
            if count == 0 {
                return Err("multisig spend needs signatures[] from the signing members".into());
            }
        }
        "channel" => {
            if branch_refund {
                // refund: p1 (members[0]) sig then OP_FALSE.
                let s = members.first().and_then(|p| sig_for(p)).or_else(|| solo.copied())
                    .ok_or_else(|| "channel refund needs the funder (player1) signature".to_string())?;
                satisfier.extend(push65(&s));
                satisfier.push(OpFalse);
            } else {
                // cooperative close: bottom->top sig_p2, sig_p1, OP_TRUE.
                let p1 = members.first().ok_or_else(|| "channel redeem missing player1".to_string())?;
                let p2 = members.get(1).ok_or_else(|| "channel redeem missing player2".to_string())?;
                let s2 = sig_for(p2).ok_or_else(|| "channel close needs player2's signature".to_string())?;
                let s1 = sig_for(p1).ok_or_else(|| "channel close needs player1's signature".to_string())?;
                satisfier.extend(push65(&s2));
                satisfier.extend(push65(&s1));
                satisfier.push(OpTrue);
            }
        }
        other => return Err(format!("non-custodial assembly does not support '{other}'")),
    }
    kaspa_txscript::pay_to_script_hash_signature_script(redeem.to_vec(), satisfier)
        .map_err(|e| format!("assemble signature script: {e}"))
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
    // BOUND the connect: the default ConnectOptions block-and-retry would hang FOREVER
    // if the node is down (this exact hang took out prepare-spend during a node outage).
    // Cap it so the handler returns a clear error instead of blocking the request.
    match tokio::time::timeout(std::time::Duration::from_secs(12), c.connect(None)).await {
        Ok(_) => {}
        Err(_) => {
            return Err(format!(
                "wRPC connect to the {network} node timed out (the node may be down or syncing) - try again shortly"
            ))
        }
    }
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
    /// htlc/timelock: absolute DAA lock (htlc refund branch / timelock).
    /// htlc only: the receiver (claim) and sender (refund) x-only pubkeys. If absent
    /// in dev mode, receiver=dev wallet 2, sender=dev wallet 1.
    #[serde(default)]
    pub receiver_pubkey_hex: Option<String>,
    #[serde(default)]
    pub sender_pubkey_hex: Option<String>,
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

    // GATE 2 (trustless-by-removal): oracle-enforced / oracle-escrow covenants still put
    // the Covex oracle key in the payout path, so they are NOT yet removable from the
    // money path. Refuse to fund them for value on mainnet until the trustless rebuild
    // (player 2-of-2 state channels / k-of-n oracle) lands. The deterministic primitives
    // (singlesig/hashlock/timelock/multisig/htlc), which the user's own wallet redeems
    // with no Covex key, are unaffected. Testnets stay open for development.
    let is_mainnet = req.network.starts_with("mainnet");
    if is_mainnet && req.redeem.kind.starts_with("oracle") {
        return err(format!(
            "oracle-enforced covenants ('{}') are frozen on mainnet: the Covex oracle key is still in the payout path, so funds are not yet trustless. Use a deterministic primitive (timelock/hashlock/multisig/htlc) on mainnet, or this covenant on a testnet.",
            req.redeem.kind
        ));
    }

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
    let kind: RedeemKind = match req.redeem.kind.as_str() {
        "singlesig" => RedeemKind::SingleSig { xonly_pubkey: xonly },
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
            RedeemKind::HashLock { hash, xonly_pubkey: xonly }
        }
        "timelock" => {
            let lock_daa = match req.redeem.lock_daa {
                Some(d) => d,
                None => return err("timelock requires lock_daa".into()),
            };
            RedeemKind::Timelock { lock_daa, xonly_pubkey: xonly }
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
            RedeemKind::Multisig { pubkeys, required }
        }
        "htlc" => {
            let preimage_hex = match &req.redeem.preimage_hex {
                Some(p) => p,
                None => return err("htlc requires preimage_hex".into()),
            };
            let preimage = match hex::decode(preimage_hex.trim()) {
                Ok(b) => b,
                Err(e) => return err(format!("bad preimage_hex: {e}")),
            };
            let hash = blake2b256(&preimage);
            let lock_daa = match req.redeem.lock_daa {
                Some(d) => d,
                None => return err("htlc requires lock_daa (refund deadline)".into()),
            };
            // receiver (claim) and sender (refund) pubkeys: explicit, or dev wallets.
            let (receiver, sender) = if let (Some(r), Some(s)) =
                (&req.redeem.receiver_pubkey_hex, &req.redeem.sender_pubkey_hex)
            {
                match (decode_xonly_hex(r), decode_xonly_hex(s)) {
                    (Ok(rr), Ok(ss)) => (rr, ss),
                    (Err(e), _) | (_, Err(e)) => return err(e),
                }
            } else if req.use_dev_mode {
                match dev_keys(&req.network) {
                    Ok(ks) => match (xonly_from_seckey(&ks[1]), xonly_from_seckey(&ks[0])) {
                        (Ok(rr), Ok(ss)) => (rr, ss),
                        (Err(e), _) | (_, Err(e)) => return err(e),
                    },
                    Err(e) => return err(e),
                }
            } else {
                return err("htlc requires receiver_pubkey_hex + sender_pubkey_hex (or use_dev_mode)".into());
            };
            RedeemKind::Htlc { hash, receiver_pubkey: receiver, lock_daa, sender_pubkey: sender }
        }
        "oracle_enforced" => {
            // 2-of-2 [oracle, winner]: the chain itself requires the disclosed oracle's
            // co-signature, and the oracle co-signs only a verified outcome (D1). This
            // upgrades an oracle covenant from "trust the oracle off-chain" to "the chain
            // enforced that the disclosed oracle signed". Member order: [oracle, winner=deployer].
            let oracle_xonly = crate::oracle::oracle_xonly_pubkey_bytes();
            RedeemKind::OracleEnforced { oracle: oracle_xonly, winner: xonly }
        }
        "oracle_escrow" => {
            // 2-player pot: the chain requires the oracle's co-signature AND the winning
            // player's signature. The oracle co-signs only the actual winner (D1, games).
            let oracle_xonly = crate::oracle::oracle_xonly_pubkey_bytes();
            let (pa, pb) = if let Some(pks) = &req.redeem.pubkeys_hex {
                if pks.len() >= 2 {
                    match (decode_xonly_hex(&pks[0]), decode_xonly_hex(&pks[1])) {
                        (Ok(a), Ok(b)) => (a, b),
                        (Err(e), _) | (_, Err(e)) => return err(e),
                    }
                } else {
                    return err("oracle_escrow needs pubkeys_hex=[player_a, player_b]".into());
                }
            } else if req.use_dev_mode {
                match dev_keys(&req.network) {
                    Ok(ks) => match (xonly_from_seckey(&ks[0]), xonly_from_seckey(&ks[1])) {
                        (Ok(a), Ok(b)) => (a, b),
                        (Err(e), _) | (_, Err(e)) => return err(e),
                    },
                    Err(e) => return err(e),
                }
            } else {
                return err("oracle_escrow requires pubkeys_hex=[player_a, player_b] (or use_dev_mode)".into());
            };
            RedeemKind::OracleEscrow { oracle: oracle_xonly, player_a: pa, player_b: pb }
        }
        "channel" => {
            // Trustless 2-player game channel: cooperative 2-of-2 close OR a funder
            // refund after lock_daa. NO oracle key. pubkeys_hex=[player1, player2].
            let (p1k, p2k) = if let Some(pks) = &req.redeem.pubkeys_hex {
                if pks.len() >= 2 {
                    match (decode_xonly_hex(&pks[0]), decode_xonly_hex(&pks[1])) {
                        (Ok(a), Ok(b)) => (a, b),
                        (Err(e), _) | (_, Err(e)) => return err(e),
                    }
                } else {
                    return err("channel needs pubkeys_hex=[player1, player2]".into());
                }
            } else if req.use_dev_mode {
                match dev_keys(&req.network) {
                    Ok(ks) => match (xonly_from_seckey(&ks[0]), xonly_from_seckey(&ks[1])) {
                        (Ok(a), Ok(b)) => (a, b),
                        (Err(e), _) | (_, Err(e)) => return err(e),
                    },
                    Err(e) => return err(e),
                }
            } else {
                return err("channel requires pubkeys_hex=[player1, player2] (or use_dev_mode)".into());
            };
            let lock_daa = match req.redeem.lock_daa {
                Some(d) => d,
                None => return err("channel requires lock_daa (the refund deadline)".into()),
            };
            RedeemKind::Channel { p1: p1k, p2: p2k, lock_daa }
        }
        other => return err(format!(
            "unknown redeem kind '{other}' (singlesig|hashlock|timelock|multisig|htlc|oracle_enforced|oracle_escrow|channel)"
        )),
    };

    let redeem = match kind.redeem_script() {
        Ok(r) => r,
        Err(e) => return err(e),
    };
    let redeem_kind = kind.kind_str();

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
    // TRUSTLESS RECOVERY (full fix for the "redeem unrecoverable if the server vanishes"
    // gap): embed the FULL redeem script on-chain, immediately after the aa20<hash>
    // marker. The redeem is NOT a secret - it is required to spend and is safe to publish
    // - so embedding it means a holder can reconstruct and wallet-sign their spend from
    // the CHAIN ALONE, with no Covex server and no saved deploy response. Recovery format:
    //   payload[0..2]   = 0xaa 0x20 (the existing P2SH discovery marker)
    //   payload[2..34]  = blake2b256(redeem)
    //   payload[34..]   = the redeem script (validate blake2b256 of it equals [2..34])
    // The marker/prefix is unchanged so crawler discovery still works, and the P2SH
    // address is derived from the hash, so the locked funds are completely unaffected.
    deploy_payload.extend_from_slice(&redeem);
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

            // Also index it as a covenant IMMEDIATELY (mirrors signer.rs) so real
            // script-enforced covenants show up in the explorer at once with their
            // honest on-chain label, instead of waiting for the crawler to walk to the
            // tip. The stored script_hex is the P2SH wrapper (aa20<hash>87), so
            // reality_for_script classifies it on-chain. id matches the crawler's
            // `<txid>:0` form so the later crawl upserts the same row.
            let p2sh_script_hex = hex::encode(p2sh_script_pubkey(&redeem).script());
            let cid = format!("{}:0", tx_id_str);
            let recv = serde_json::to_string(&vec![p2sh_addr.clone()]).unwrap_or_default();
            let ctype = format!("p2sh-{}", req.redeem.kind);
            let summary = format!("Script-enforced {} covenant, {} KAS locked", req.redeem.kind, stake_sompi as f64 / 1e8);
            let _ = db::insert_covenant(
                &db, &cid, &p2sh_addr, stake_sompi, &crate::compute_script_hash(&p2sh_script_hex),
                &p2sh_script_hex, &ctype, "P2SH Commitments", &deployer_addr_str, &summary, 0,
                "EXPLORER", &summary, &recv, &req.network,
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
                "enforcement_reality": "on-chain",
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
    /// htlc only: "claim" (receiver reveals preimage) or "refund" (sender, after the
    /// timelock). Defaults to "claim". The signer key comes from private_key_hex or
    /// signer_keys_hex[0] (the claimer or refunder, who is not the covenant owner).
    #[serde(default)]
    pub htlc_mode: Option<String>,
    /// channel only: "cooperative" (both players co-sign the close, default) or "refund"
    /// (the funder reclaims via the timeout branch after lock_daa).
    #[serde(default)]
    pub channel_mode: Option<String>,
    /// UNIVERSAL INTERACTION (covenant NOT created on Covex): supply the redeem script
    /// (hex) that hashes to the on-chain P2SH, its kind (singlesig | hashlock |
    /// timelock:<daa> | multisig:<total> | htlc:<lock_daa>), and the funding outpoint
    /// index. The P2SH address is derived from the redeem, so a wrong script just fails
    /// the UTXO lookup. Used only when deploy_tx_id is not in our covenant DB.
    #[serde(default)]
    pub redeem_script_hex: Option<String>,
    #[serde(default)]
    pub redeem_kind: Option<String>,
    #[serde(default)]
    pub outpoint_index: Option<u32>,
}

/// POST /covenant/p2sh/spend - redeem a P2SH covenant by satisfying its script.
pub async fn p2sh_spend_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Json(req): Json<P2shSpendRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));

    // Resolve the covenant. If Covex deployed it, the DB has everything. If NOT (any
    // covenant created anywhere on-chain), the caller supplies the redeem script + kind
    // and we DERIVE the P2SH address from the redeem - so a wrong script simply fails the
    // on-chain UTXO lookup; the caller proves they hold the real redeem. This is the
    // trustless interaction path: Covex only assembles the tx, the caller's key signs it.
    let cov = match db::get_p2sh_covenant(&db, &req.deploy_tx_id) {
        Some(c) => {
            if let Some(spent) = &c.spent_tx_id {
                return err(format!("covenant already spent in tx {spent}"));
            }
            c
        }
        None => {
            let rh = match req.redeem_script_hex.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
                Some(h) => h.to_string(),
                None => return err(format!(
                    "no covenant stored for {}. To interact with a covenant NOT created on Covex, supply redeem_script_hex (the script that hashes to the on-chain P2SH) and redeem_kind (singlesig | hashlock | timelock:<daa> | multisig:<total> | htlc:<lock_daa>), plus outpoint_index if not 0.",
                    req.deploy_tx_id
                )),
            };
            let rbytes = match hex::decode(&rh) {
                Ok(b) => b,
                Err(e) => return err(format!("bad redeem_script_hex: {e}")),
            };
            let addr = match p2sh_address(&rbytes, prefix_for_network(&req.network)) {
                Ok(a) => a.to_string(),
                Err(e) => return err(e),
            };
            db::P2shCovenant {
                tx_id: req.deploy_tx_id.clone(),
                network: req.network.clone(),
                p2sh_address: addr,
                redeem_script_hex: rh,
                redeem_kind: req.redeem_kind.clone().unwrap_or_else(|| "singlesig".to_string()),
                amount_sompi: 0,
                outpoint_index: req.outpoint_index.unwrap_or(0),
                owner_addr: req.destination_addr.clone(),
                spent_tx_id: None,
            }
        }
    };
    let redeem = match hex::decode(&cov.redeem_script_hex) {
        Ok(b) => b,
        Err(e) => return err(format!("corrupt redeem script: {e}")),
    };
    // Redeem-kind dispatch: multisig (N keys), timelock (single owner key + lock_time),
    // singlesig/hashlock (single owner key).
    let is_multisig = cov.redeem_kind.starts_with("multisig");
    let multisig_total: u8 =
        cov.redeem_kind.strip_prefix("multisig:").and_then(|s| s.parse::<u8>().ok()).unwrap_or(1);
    let lock_daa: Option<u64> =
        cov.redeem_kind.strip_prefix("timelock:").and_then(|s| s.parse::<u64>().ok());
    let is_htlc = cov.redeem_kind.starts_with("htlc:");
    let htlc_lock_daa: Option<u64> =
        cov.redeem_kind.strip_prefix("htlc:").and_then(|s| s.parse::<u64>().ok());
    let htlc_claim = req.htlc_mode.as_deref() != Some("refund");
    let is_channel = cov.redeem_kind.starts_with("channel");
    let channel_lock_daa: Option<u64> =
        cov.redeem_kind.strip_prefix("channel:").and_then(|s| s.parse::<u64>().ok());
    // Channel close mode: "cooperative" (both players co-sign the IF branch, the default)
    // or "refund" (the funder p1 reclaims via the ELSE timeout branch after lock_daa).
    let channel_cooperative = req.channel_mode.as_deref() != Some("refund");

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
    } else if is_htlc {
        // The claimer (receiver) or refunder (sender) signs - NOT the covenant owner.
        // Their key is supplied explicitly (private_key_hex or signer_keys_hex[0]).
        let sk_hex = req
            .signer_keys_hex
            .as_ref()
            .and_then(|v| v.first())
            .cloned()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| if req.private_key_hex.trim().is_empty() { None } else { Some(req.private_key_hex.clone()) });
        let sk_hex = match sk_hex {
            Some(s) => s,
            None => return err("HTLC spend requires the claimer/refunder key (private_key_hex)".into()),
        };
        let bytes: [u8; 32] = match hex::decode(sk_hex.trim().trim_start_matches("0x")).ok().and_then(|b| b.try_into().ok()) {
            Some(b) => b,
            None => return err("bad HTLC signer key (need 64 hex chars)".into()),
        };
        match secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, &bytes) {
            Ok(k) => vec![k],
            Err(e) => return err(format!("bad key: {e}")),
        }
    } else if is_channel {
        // Cooperative close needs BOTH player keys [p1, p2]; refund needs only p1 (the
        // funder). Explicit via signer_keys_hex, else the two dev wallets in dev mode.
        let seckeys: Vec<[u8; 32]> = if let Some(keys) = &req.signer_keys_hex {
            let mut v = Vec::new();
            for k in keys {
                match hex::decode(k.trim().trim_start_matches("0x")).ok().and_then(|b| b.try_into().ok()) {
                    Some(b) => v.push(b),
                    None => return err("bad channel signer key hex (need 64 hex chars)".into()),
                }
            }
            v
        } else if req.use_dev_mode {
            match dev_keys(&req.network) {
                Ok(ks) => ks,
                Err(e) => return err(e),
            }
        } else {
            return err("channel spend requires signer_keys_hex (or use_dev_mode)".into());
        };
        if seckeys.is_empty() {
            return err("channel spend needs the funder (player1) key".into());
        }
        if channel_cooperative && seckeys.len() < 2 {
            return err("cooperative channel close needs BOTH player keys [player1, player2]".into());
        }
        let mut kps = Vec::new();
        for sk in &seckeys {
            match secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, sk) {
                Ok(k) => kps.push(k),
                Err(e) => return err(format!("bad channel key: {e}")),
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
        // "script units exceeded". The channel redeem has 3 sig ops across its branches
        // (CheckSigVerify + CheckSig in IF, CheckSig in ELSE). Single-key redeems use 1.
        sig_op_count: if is_multisig { multisig_total } else if is_channel { 3 } else { 1 },
    }];
    let outputs = vec![TransactionOutput { value: amount - TX_FEE, script_public_key: dest_script }];
    // Non-empty payload required (same sighash reason as deploy). Not an aa-envelope,
    // so the crawler does not misread a redeem spend as a new covenant.
    let spend_payload = b"covex-p2sh-spend".to_vec();
    // Timelock spends (and HTLC refunds) must set lock_time >= lock_daa (and the chain
    // must have reached it, else the node rejects the tx as non-final). HTLC CLAIMS do
    // not touch the timelock branch, so they keep lock_time 0.
    let spend_lock_time = lock_daa
        .or(if is_htlc && !htlc_claim { htlc_lock_daa } else { None })
        .or(if is_channel && !channel_cooperative { channel_lock_daa } else { None })
        .unwrap_or(0);
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
    } else if is_htlc {
        let preimage: Option<Vec<u8>> = if htlc_claim {
            match &req.preimage_hex {
                Some(p) => match hex::decode(p.trim()) {
                    Ok(b) => Some(b),
                    Err(e) => return err(format!("bad preimage_hex: {e}")),
                },
                None => return err("HTLC claim requires preimage_hex".into()),
            }
        } else {
            None
        };
        match build_htlc_signature_script(&signable, 0, &keypairs[0], &redeem, htlc_claim, preimage.as_deref()) {
            Ok(s) => s,
            Err(e) => return err(format!("build htlc spend script: {e}")),
        }
    } else if is_channel {
        let kp1 = &keypairs[0];
        let kp2 = if channel_cooperative { keypairs.get(1) } else { None };
        match build_channel_signature_script(&signable, 0, kp1, kp2, channel_cooperative, &redeem) {
            Ok(s) => s,
            Err(e) => return err(format!("build channel spend script: {e}")),
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

#[derive(Deserialize)]
pub struct OraclePayoutRequest {
    #[serde(default = "default_network")]
    pub network: String,
    /// The deploy tx id of the oracle-enforced (oracle:2) covenant.
    pub deploy_tx_id: String,
    /// The winner's key (the second multisig member). Dev mode resolves the dev wallet.
    #[serde(default)]
    pub private_key_hex: String,
    #[serde(default)]
    pub use_dev_mode: bool,
    pub destination_addr: String,
    /// The outcome proof the oracle must verify before it will co-sign.
    pub circuit_type: String,
    #[serde(default)]
    pub proof: serde_json::Value,
    #[serde(default)]
    pub public_inputs: Vec<String>,
    #[serde(default)]
    pub requested_outcome: Option<u32>,
}

/// Result of checking whether a covenant being paid out is a skill_games pot.
pub(crate) enum GamePot {
    /// The covenant is not linked to any match; use the request's outcome as-is.
    NotAGamePot,
    /// The server determined the winning side: 0 = player1, 1 = player2.
    Verified(u32),
    /// The covenant is a game pot but cannot be paid out (reason for the caller).
    Rejected(String),
}

/// If `pot_tx` is the locked pot of a skill_games match, return the server-authoritative
/// winning side. The winner is recomputed from the move log via game_engine - the move
/// log, not a stored or client-supplied field, is the source of truth. Game types that
/// have no server-side replay engine yet FAIL CLOSED: the oracle cannot prove who won, so
/// it refuses to co-sign any payout (no value ever moves on an unproven outcome). This is
/// the launch-safe default; adding a game's engine to game_engine re-enables its pots.
pub(crate) fn game_pot_outcome(db: &Arc<Mutex<Connection>>, pot_tx: &str) -> GamePot {
    let row: Option<(String, String, Option<String>, String, Option<String>)> = {
        let conn = db.lock().unwrap();
        conn.query_row(
            "SELECT game_type, moves, winner, status, end_reason FROM skill_games WHERE pot_tx = ?1",
            rusqlite::params![pot_tx],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .ok()
    };
    let (gtype, moves_raw, winner, status, end_reason) = match row {
        Some(t) => t,
        None => return GamePot::NotAGamePot,
    };
    if status != "finished" {
        return GamePot::Rejected(
            "game pot: the match is not finished; the oracle will not co-sign a payout".into(),
        );
    }
    // Server-decided timeouts/abandonment are timed by the server itself (the opponent
    // cannot manufacture them), so they MAY settle to the recorded winner. A resign or a
    // client-claimed finish is forgeable until moves are wallet-authenticated, so those
    // fall through to the engine replay below and only settle on a decisive board.
    let er = end_reason.as_deref().unwrap_or("");
    if er == "timeout" || er == "abandon" {
        return match winner.as_deref().map(|w| w.to_lowercase()).as_deref() {
            Some("white") | Some("player1") => GamePot::Verified(0),
            Some("black") | Some("player2") => GamePot::Verified(1),
            _ => GamePot::Rejected(format!(
                "game pot: {er} did not record a single winning player (winner={winner:?})"
            )),
        };
    }
    let moves: Vec<String> = serde_json::from_str(&moves_raw).unwrap_or_default();
    match crate::game_engine::result_from_moves(&gtype, &moves) {
        Some(crate::game_engine::GameResult::Unfinished) => GamePot::Rejected(
            "game pot: the move log shows no decisive result; nothing to pay out".into(),
        ),
        Some(crate::game_engine::GameResult::Draw) => GamePot::Rejected(
            "game pot: the match is a draw; this escrow primitive pays a single winner (refund both players instead)".into(),
        ),
        Some(res) => match res.outcome() {
            Some(o) => GamePot::Verified(o),
            None => GamePot::Rejected("game pot: indeterminate result".into()),
        },
        None => {
            // No server-side replay engine for this game type: FAIL CLOSED. The oracle
            // will not co-sign a payout it cannot prove. `winner` here is only
            // client-recorded, so paying it out would reopen the fund-theft hole.
            let _ = winner;
            GamePot::Rejected(format!(
                "game pot: game type '{gtype}' has no server-side outcome engine yet, so the oracle cannot prove the winner and will not co-sign a payout (server-verifiable today: tictactoe, connect4, chess)"
            ))
        }
    }
}

/// POST /covenant/oracle-payout - release an oracle-enforced 2-of-2 [oracle, winner]
/// covenant. The oracle co-signs ONLY if the outcome verifies; the chain enforces the
/// 2-of-2, so the disclosed oracle's signature is consensus-required (roadmap D1).
pub async fn oracle_payout_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Json(req): Json<OraclePayoutRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));

    let cov = match db::get_p2sh_covenant(&db, &req.deploy_tx_id) {
        Some(c) => c,
        None => return err(format!("no covenant for {}", req.deploy_tx_id)),
    };
    if !cov.redeem_kind.starts_with("oracle") {
        return err("not an oracle-enforced covenant (deploy with redeem.kind=oracle_enforced or oracle_escrow)".into());
    }
    let is_escrow = cov.redeem_kind == "oracle_escrow";
    if let Some(s) = &cov.spent_tx_id {
        return err(format!("already paid out in {s}"));
    }

    // GAME-POT GATE: if this covenant is the pot of a skill_games match, the winning
    // side is NOT client-controlled. Re-derive it from the server's recorded match -
    // and, for replayable game types, from a deterministic engine replay of the move
    // log - then override any client-supplied requested_outcome. This is what stops a
    // caller from asking the oracle to co-sign a payout to the losing side and drain
    // the pot. For a non-game oracle covenant the requested outcome is used as before.
    let game_pot = game_pot_outcome(&db, &req.deploy_tx_id);
    let is_game_pot = matches!(game_pot, GamePot::Verified(_));
    let effective_outcome: Option<u32> = match game_pot {
        GamePot::NotAGamePot => req.requested_outcome,
        GamePot::Verified(o) => {
            if let Some(req_o) = req.requested_outcome {
                if req_o != o {
                    return err(format!(
                        "game pot: requested outcome {req_o} contradicts the server-verified result {o}; the oracle co-signs only the real winner"
                    ));
                }
            }
            Some(o)
        }
        GamePot::Rejected(msg) => return err(msg),
    };

    // NON-GAME ATTESTED GATE (on-chain twin of the oracle.rs free-signature fix).
    // For a covenant that is NOT a server-resolved game pot, the oracle may co-sign
    // ONLY when the circuit performs real cryptographic verification (Strict/Hybrid
    // Groth16). An Attested circuit does NO crypto check, so verify_proof_for_circuit
    // returns true unconditionally and effective_outcome is the caller's
    // requested_outcome - co-signing it would release the 2-of-2 to an attacker-chosen
    // destination and DRAIN the covenant. Refuse before we ever reach the verify call.
    if !is_game_pot && !crate::oracle_verifier::circuit_requires_crypto_proof(&req.circuit_type) {
        return err(format!(
            "oracle declines to co-sign a non-game payout for attested circuit '{}': only a server-resolved game pot, or a real Groth16 proof (a Strict/Hybrid circuit), authorises a covenant payout",
            req.circuit_type
        ));
    }

    // For an escrow, the outcome picks the winner: 0 -> player A (IF), 1 -> player B (ELSE).
    let winner_is_a = effective_outcome != Some(1);

    // THE ORACLE GATE: verify the outcome before co-signing. A losing/invalid outcome
    // means the oracle declines - and without its signature the 2-of-2 can never spend.
    let verified = crate::oracle_verifier::verify_proof_for_circuit(
        &req.circuit_type,
        req.proof.clone(),
        req.public_inputs.clone(),
        effective_outcome,
    )
    .await
    .unwrap_or(false);
    if !verified {
        return err(format!(
            "oracle declines to co-sign: outcome for circuit '{}' did not verify",
            req.circuit_type
        ));
    }

    let redeem = match hex::decode(&cov.redeem_script_hex) {
        Ok(b) => b,
        Err(e) => return err(format!("corrupt stored redeem: {e}")),
    };
    // Resolve the winning party's key. oracle:2 -> the deployer/winner (via the
    // destination's dev resolution). oracle_escrow -> the WINNING player: dev wallet 1
    // (A) or 2 (B) in dev mode, else the explicit private_key_hex.
    let winner_seckey: [u8; 32] = if is_escrow {
        if !req.private_key_hex.trim().is_empty() {
            match hex::decode(req.private_key_hex.trim().trim_start_matches("0x")).ok().and_then(|b| b.try_into().ok()) {
                Some(b) => b,
                None => return err("bad winning-player key (need 64 hex chars)".into()),
            }
        } else if req.use_dev_mode {
            match dev_keys(&req.network) {
                Ok(ks) => ks[if winner_is_a { 0 } else { 1 }],
                Err(e) => return err(e),
            }
        } else {
            return err("oracle_escrow payout requires the winning player's private_key_hex (or use_dev_mode)".into());
        }
    } else {
        match resolve_signing_key(&req.network, &req.destination_addr, &req.private_key_hex, req.use_dev_mode) {
            Ok((sk, _)) => sk,
            Err(e) => return err(e),
        }
    };
    let winner_kp = match secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, &winner_seckey) {
        Ok(k) => k,
        Err(e) => return err(format!("bad winner key: {e}")),
    };

    let client = match client_for_network(&req.network).await {
        Ok(c) => c,
        Err(e) => return err(e),
    };
    let p2sh_addr = match Address::try_from(cov.p2sh_address.as_str()) {
        Ok(a) => a,
        Err(e) => return err(format!("stored p2sh address invalid: {e}")),
    };
    let utxos = match client.get_utxos_by_addresses(vec![p2sh_addr]).await {
        Ok(u) => u,
        Err(e) => return err(format!("UTXO fetch failed: {e}")),
    };
    let utxo = match utxos
        .iter()
        .find(|u| u.outpoint.transaction_id.to_string() == cov.tx_id && u.outpoint.index == cov.outpoint_index)
    {
        Some(u) => u,
        None => return err("covenant UTXO not found on-chain (unconfirmed or already spent)".into()),
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
        sequence: 0,
        // oracle:2 multisig counts 2 pubkeys; oracle_escrow counts the static sig ops
        // in the redeem (OpCheckSigVerify + both branches' OpCheckSig = 3).
        sig_op_count: if is_escrow { 3 } else { 2 },
    }];
    let outputs = vec![TransactionOutput { value: amount - TX_FEE, script_public_key: dest_script }];
    let unsigned = Transaction::new_non_finalized(
        0,
        inputs,
        outputs,
        0,
        SubnetworkId::from_bytes([0u8; 20]),
        0,
        b"covex-oracle-payout".to_vec(),
    );
    let entries = vec![UtxoEntry {
        amount,
        script_public_key: p2sh_spk,
        block_daa_score: utxo.utxo_entry.block_daa_score,
        is_coinbase: utxo.utxo_entry.is_coinbase,
    }];
    let mut signable = SignableTransaction::with_entries(unsigned, entries);
    let oracle_kp = crate::oracle::oracle_keypair();
    let sig_script = if is_escrow {
        match build_oracle_escrow_signature_script(&signable, 0, &oracle_kp, &winner_kp, winner_is_a, &redeem) {
            Ok(s) => s,
            Err(e) => return err(format!("build oracle escrow payout script: {e}")),
        }
    } else {
        // Sigs in pubkey order: [oracle, winner] (redeem = multisig([oracle, winner], 2)).
        match build_p2sh_multisig_signature_script(&signable, 0, &[oracle_kp, winner_kp], &redeem) {
            Ok(s) => s,
            Err(e) => return err(format!("build oracle payout script: {e}")),
        }
    };
    signable.tx.inputs[0].signature_script = sig_script;
    signable.tx.finalize();
    let rpc_tx = RpcTransaction::from(&signable.tx);

    match client.submit_transaction(rpc_tx, false).await {
        Ok(tx_id) => {
            let spent = tx_id.to_string();
            let _ = db::mark_p2sh_spent(&db, &cov.tx_id, &spent);
            info!("Oracle-enforced payout: covenant {} released in {}", cov.tx_id, spent);
            Json(serde_json::json!({
                "success": true,
                "payout_tx_id": spent,
                "paid_kas": (amount - TX_FEE) as f64 / 100_000_000.0,
                "destination": req.destination_addr,
                "note": "The chain required the oracle co-signature; the oracle co-signed because the outcome verified."
            }))
        }
        Err(e) => {
            warn!("Oracle payout broadcast rejected for {}: {}", cov.tx_id, e);
            err(format!("broadcast rejected: {e}"))
        }
    }
}

// ── Mainnet wallet-side signing (trustless 2a): the server NEVER holds the key ──
// A user redeems a single-sig covenant by signing with their OWN wallet. prepare-spend
// builds the unsigned tx and returns the sighash for the wallet to sign (BIP340 Schnorr
// over the 32-byte hash); submit-signed assembles that signature into the satisfier and
// broadcasts. Covex only constructs and relays the tx - it is fully removable from the key
// path, which is what makes a mainnet spend trustless (no raw key sent to the server).
struct PendingWalletSpend {
    network: String,
    unsigned_tx: Transaction,
    entry: UtxoEntry,
    redeem: Vec<u8>,
    /// The covenant's tx_id, so submit-signed can mark it spent in the DB.
    deploy_tx_id: String,
    /// The redeem kind (singlesig | hashlock | timelock:<daa> | multisig:<n> | htlc:<daa>
    /// | channel:<daa>) so submit-signed assembles the correct satisfier.
    kind: String,
    /// For HTLC/channel: which branch the prepared sighash committed to. true = the
    /// timeout/refund branch (lock_time set), false = claim/cooperative close. Single-sig
    /// kinds ignore this.
    branch_refund: bool,
    /// Member x-only pubkeys parsed from the redeem in script order (multisig: [pk1..pkn];
    /// channel: [p1, p2, p1]; htlc: [receiver, sender]). Lets submit-signed order the
    /// supplied signatures correctly without re-parsing.
    member_pubkeys: Vec<[u8; 32]>,
    created_at: i64,
}

fn wallet_sessions() -> &'static Mutex<std::collections::HashMap<String, PendingWalletSpend>> {
    static S: std::sync::OnceLock<Mutex<std::collections::HashMap<String, PendingWalletSpend>>> =
        std::sync::OnceLock::new();
    S.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

#[derive(Deserialize)]
pub struct WalletPrepareRequest {
    #[serde(default = "default_network")]
    pub network: String,
    pub deploy_tx_id: String,
    pub destination_addr: String,
    /// External covenant (not in our DB): supply the redeem script.
    #[serde(default)]
    pub redeem_script_hex: Option<String>,
    /// External covenant: its redeem kind (singlesig | hashlock | timelock:<daa> |
    /// multisig:<n> | htlc:<daa> | channel:<daa>). Defaults to singlesig when omitted.
    #[serde(default)]
    pub redeem_kind: Option<String>,
    #[serde(default)]
    pub outpoint_index: Option<u32>,
    /// For HTLC/channel: which branch to spend. HTLC "claim" (default) | "refund";
    /// channel "close" (default) | "refund". Determines the committed lock_time, so it is
    /// fixed at prepare time and the wallet signs that exact sighash.
    #[serde(default)]
    pub branch: Option<String>,
}

/// POST /covenant/p2sh/prepare-spend - build the unsigned spend + return the sighash the
/// user's wallet must sign. No key touches the server.
pub async fn prepare_spend_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Json(req): Json<WalletPrepareRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));
    let (redeem_hex, redeem_kind, src_tx_id, outpoint_index, p2sh_address) =
        match db::get_p2sh_covenant(&db, &req.deploy_tx_id) {
            Some(c) => {
                if let Some(s) = &c.spent_tx_id {
                    return err(format!("covenant already spent in tx {s}"));
                }
                (c.redeem_script_hex, c.redeem_kind, c.tx_id, c.outpoint_index, c.p2sh_address)
            }
            None => {
                let rh = match req.redeem_script_hex.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
                    Some(h) => h.to_string(),
                    None => return err("no covenant stored; supply redeem_script_hex (single-sig) for wallet-side signing".into()),
                };
                let rbytes = match hex::decode(&rh) {
                    Ok(b) => b,
                    Err(e) => return err(format!("bad redeem_script_hex: {e}")),
                };
                let addr = match p2sh_address(&rbytes, prefix_for_network(&req.network)) {
                    Ok(a) => a.to_string(),
                    Err(e) => return err(e),
                };
                let extkind = req.redeem_kind.clone().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "singlesig".to_string());
                (rh, extkind, req.deploy_tx_id.clone(), req.outpoint_index.unwrap_or(0), addr)
            }
        };
    // Non-custodial wallet signing now covers EVERY deterministic primitive: the
    // single-signer kinds (singlesig / hashlock / timelock) and the multi-party kinds
    // (multisig N-of-M, HTLC claim/refund, channel close/refund). Each party signs the
    // prepared sighash in their own wallet and only the SIGNATURES are sent - no key ever
    // touches the server. (oracle_enforced / oracle_escrow still co-sign with the Covex
    // oracle key server-side by design and use /covenant/oracle-payout.)
    let kind_base = redeem_kind.split(':').next().unwrap_or(&redeem_kind).to_string();
    if kind_base.starts_with("oracle") {
        return err(format!(
            "'{redeem_kind}' needs the Covex oracle co-signature; use /covenant/oracle-payout, not the non-custodial spend"
        ));
    }
    if !matches!(kind_base.as_str(), "singlesig" | "hashlock" | "timelock" | "multisig" | "htlc" | "channel") {
        return err(format!("non-custodial wallet signing does not support '{redeem_kind}'"));
    }
    let timelock_daa: Option<u64> = redeem_kind.strip_prefix("timelock:").and_then(|s| s.parse::<u64>().ok());
    let multisig_total: u8 = redeem_kind.strip_prefix("multisig:").and_then(|s| s.parse::<u8>().ok()).unwrap_or(1);
    let htlc_lock_daa: Option<u64> = redeem_kind.strip_prefix("htlc:").and_then(|s| s.parse::<u64>().ok());
    let channel_lock_daa: Option<u64> = redeem_kind.strip_prefix("channel:").and_then(|s| s.parse::<u64>().ok());
    // Branch selection (committed in the sighash via lock_time): HTLC claim(default)/refund,
    // channel close(default)/refund.
    let branch = req.branch.as_deref().unwrap_or("").to_lowercase();
    let branch_refund = matches!(kind_base.as_str(), "htlc" | "channel") && branch == "refund";
    let redeem = match hex::decode(&redeem_hex) {
        Ok(b) => b,
        Err(e) => return err(format!("corrupt redeem: {e}")),
    };
    // Parse the redeem's member pubkeys: multisig keeps every 0x20<32> push; htlc/channel
    // keep only those followed by a checksig op (so an HTLC hash push is excluded).
    let member_pubkeys: Vec<[u8; 32]> = if kind_base == "multisig" {
        parse_redeem_pubkeys(&redeem, false)
    } else {
        parse_redeem_pubkeys(&redeem, true)
    };
    // The single-signer kinds end with `<0x20><pubkey32> OpCheckSig`; surface that as the
    // signer the wallet must use (multi-party kinds report required_signers instead).
    let signer_xonly = if redeem.len() >= 34
        && redeem[redeem.len() - 1] == 0xac
        && redeem[redeem.len() - 34] == 0x20
    {
        hex::encode(&redeem[redeem.len() - 33..redeem.len() - 1])
    } else {
        String::new()
    };
    // The signatures the wallet(s) must produce, in the order/role the satisfier needs.
    let required_signers: Vec<serde_json::Value> = match kind_base.as_str() {
        "multisig" => member_pubkeys.iter().enumerate()
            .map(|(i, pk)| serde_json::json!({ "role": format!("member{}", i + 1), "xonly": hex::encode(pk) }))
            .collect(),
        "htlc" => {
            let idx = if branch_refund { 1 } else { 0 };
            let role = if branch_refund { "sender (refund)" } else { "receiver (claim)" };
            member_pubkeys.get(idx).map(|pk| vec![serde_json::json!({ "role": role, "xonly": hex::encode(pk) })]).unwrap_or_default()
        }
        "channel" => {
            if branch_refund {
                member_pubkeys.first().map(|pk| vec![serde_json::json!({ "role": "funder (refund)", "xonly": hex::encode(pk) })]).unwrap_or_default()
            } else {
                let mut v = Vec::new();
                if let Some(pk) = member_pubkeys.first() { v.push(serde_json::json!({ "role": "player1", "xonly": hex::encode(pk) })); }
                if let Some(pk) = member_pubkeys.get(1) { v.push(serde_json::json!({ "role": "player2", "xonly": hex::encode(pk) })); }
                v
            }
        }
        _ => if signer_xonly.is_empty() { vec![] } else { vec![serde_json::json!({ "role": "signer", "xonly": signer_xonly.clone() })] },
    };

    let client = match client_for_network(&req.network).await {
        Ok(c) => c,
        Err(e) => return err(e),
    };
    let p2sh = match Address::try_from(p2sh_address.as_str()) {
        Ok(a) => a,
        Err(e) => return err(format!("bad p2sh address: {e}")),
    };
    let utxos = match client.get_utxos_by_addresses(vec![p2sh]).await {
        Ok(u) => u,
        Err(e) => return err(format!("UTXO fetch failed: {e}")),
    };
    let utxo = match utxos.iter().find(|u| {
        u.outpoint.transaction_id.to_string() == src_tx_id && u.outpoint.index == outpoint_index
    }) {
        Some(u) => u,
        None => return err("P2SH UTXO not found on-chain (unconfirmed, spent, or wrong network)".into()),
    };
    let amount = utxo.utxo_entry.amount;
    if amount <= TX_FEE {
        return err("locked amount does not cover the tx fee".into());
    }
    let dest_script = match script_pub_key_from_address(&req.destination_addr) {
        Ok(s) => s,
        Err(e) => return err(e),
    };
    // sig_op_count is committed in the sighash and must cover the redeem's sig ops or the
    // node rejects "script units exceeded": multisig counts one per listed pubkey, the
    // channel redeem has 3 (CheckSigVerify + CheckSig in IF, CheckSig in ELSE), others 1.
    // Mirrors the custodial /spend handler exactly so the same sighash is produced.
    let sig_op_count: u8 = if kind_base == "multisig" { multisig_total } else if kind_base == "channel" { 3 } else { 1 };
    let inputs = vec![TransactionInput {
        previous_outpoint: TransactionOutpoint {
            transaction_id: utxo.outpoint.transaction_id,
            index: utxo.outpoint.index,
        },
        signature_script: vec![],
        sequence: 0, // non-final, required for any CLTV (timelock / htlc-refund / channel-refund) spend
        sig_op_count,
    }];
    let outputs = vec![TransactionOutput { value: amount - TX_FEE, script_public_key: dest_script }];
    // A spend that takes a CLTV branch MUST carry lock_time = lock_daa (with a non-final
    // input sequence, set above) so OpCheckLockTimeVerify passes, and the chain must have
    // reached that DAA. This applies to a timelock covenant, an HTLC refund, and a channel
    // refund. Claims / cooperative closes / other single-signer kinds use 0.
    let spend_lock_time = timelock_daa
        .or(if kind_base == "htlc" && branch_refund { htlc_lock_daa } else { None })
        .or(if kind_base == "channel" && branch_refund { channel_lock_daa } else { None })
        .unwrap_or(0);
    let unsigned = Transaction::new_non_finalized(
        0,
        inputs,
        outputs,
        spend_lock_time,
        SubnetworkId::from_bytes([0u8; 20]),
        0,
        b"covex-p2sh-spend".to_vec(),
    );
    let entry = UtxoEntry {
        amount,
        script_public_key: p2sh_script_pubkey(&redeem),
        block_daa_score: utxo.utxo_entry.block_daa_score,
        is_coinbase: utxo.utxo_entry.is_coinbase,
    };
    let signable = SignableTransaction::with_entries(unsigned.clone(), vec![entry.clone()]);
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), 0, SIG_HASH_ALL, &mut reused);
    let sighash_hex = hex::encode(sig_hash.as_bytes());

    let session_id = uuid::Uuid::new_v4().to_string();
    let now_ts = chrono::Utc::now().timestamp();
    {
        let mut s = wallet_sessions().lock().unwrap();
        s.retain(|_, v| v.created_at > now_ts - 600); // drop sessions older than 10 min
        s.insert(
            session_id.clone(),
            PendingWalletSpend {
                network: req.network.clone(), unsigned_tx: unsigned, entry, redeem,
                deploy_tx_id: src_tx_id.clone(), kind: redeem_kind.clone(),
                branch_refund, member_pubkeys, created_at: now_ts,
            },
        );
    }
    // A hashlock spend, and an HTLC CLAIM, must also reveal the preimage in submit-signed.
    let needs_preimage = kind_base == "hashlock" || (kind_base == "htlc" && !branch_refund);
    let is_multi = matches!(kind_base.as_str(), "multisig" | "channel") && !(kind_base == "channel" && branch_refund);
    Json(serde_json::json!({
        "success": true,
        "session_id": session_id,
        "sighash": sighash_hex,
        "sign_scheme": "bip340-schnorr-secp256k1",
        "signer_xonly": signer_xonly,
        "required_signers": required_signers,
        "branch": if matches!(kind_base.as_str(), "htlc" | "channel") { Some(if branch_refund { "refund" } else if kind_base == "htlc" { "claim" } else { "close" }) } else { None },
        "p2sh_address": p2sh_address,
        "amount_sompi": amount,
        "destination": req.destination_addr,
        "redeem_kind": redeem_kind,
        "needs_preimage": needs_preimage,
        "note": if is_multi {
            "Each required signer signs this exact sighash (BIP340 Schnorr) in their own wallet, then POST {session_id, signatures:[{signer_xonly, signature_hex}], ...} to /covenant/p2sh/submit-signed. No key is sent to the server."
        } else {
            "Sign the sighash (BIP340 Schnorr) with the covenant key in your wallet, then POST {session_id, signature_hex} (plus preimage_hex for a hashlock or HTLC claim) to /covenant/p2sh/submit-signed. No key is sent to the server."
        }
    }))
}

/// One member's signature in a multi-party non-custodial submit.
#[derive(Deserialize)]
pub struct WalletSigEntry {
    /// The signer's x-only pubkey (hex), matching a member of the redeem script.
    pub signer_xonly: String,
    /// That signer's 64-byte BIP340 Schnorr signature (hex) over the prepared sighash.
    pub signature_hex: String,
}

#[derive(Deserialize)]
pub struct WalletSubmitRequest {
    pub session_id: String,
    /// Single-signer kinds (singlesig/hashlock/timelock, HTLC, channel-refund): the one
    /// 64-byte BIP340 Schnorr signature (hex) over the prepared sighash.
    #[serde(default)]
    pub signature_hex: Option<String>,
    /// Multi-party kinds (multisig, channel cooperative close): one entry per signing
    /// member. Each signature is over the SAME prepared sighash; the server orders them by
    /// the redeem's pubkey order. No key is ever sent - only signatures.
    #[serde(default)]
    pub signatures: Option<Vec<WalletSigEntry>>,
    /// For a hashlock covenant or an HTLC claim: the preimage P. Pushed into the satisfier.
    /// Not a server secret (it is revealed on-chain by the spend anyway).
    #[serde(default)]
    pub preimage_hex: Option<String>,
}

/// POST /covenant/p2sh/submit-signed - assemble the wallet signature(s) into the satisfier
/// and broadcast. The server never had any key; it only relays the signed tx.
pub async fn submit_signed_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Json(req): Json<WalletSubmitRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));
    let pending = {
        let mut s = wallet_sessions().lock().unwrap();
        match s.remove(&req.session_id) {
            Some(p) => p,
            None => return err("unknown or expired session_id (call prepare-spend first; sessions last 10 minutes)".into()),
        }
    };
    let parse_sig = |h: &str| -> Option<[u8; 64]> {
        hex::decode(h.trim().trim_start_matches("0x")).ok().and_then(|b| b.try_into().ok())
    };
    // The single signature (single-signer kinds) and/or the per-member map (multi-party).
    let solo: Option<[u8; 64]> = match req.signature_hex.as_deref().filter(|s| !s.trim().is_empty()) {
        Some(h) => match parse_sig(h) {
            Some(s) => Some(s),
            None => return err("signature_hex must be a 64-byte BIP340 Schnorr signature".into()),
        },
        None => None,
    };
    let mut sigs: std::collections::HashMap<String, [u8; 64]> = std::collections::HashMap::new();
    if let Some(list) = &req.signatures {
        for e in list {
            match parse_sig(&e.signature_hex) {
                Some(s) => { sigs.insert(e.signer_xonly.trim().trim_start_matches("0x").to_lowercase(), s); }
                None => return err(format!("bad signature_hex for signer {}", e.signer_xonly)),
            }
        }
    }
    let kind_base = pending.kind.split(':').next().unwrap_or(&pending.kind).to_string();
    let preimage: Option<Vec<u8>> = match req.preimage_hex.as_ref().and_then(|p| hex::decode(p.trim()).ok()) {
        Some(b) => Some(b),
        None => None,
    };
    // Assemble the satisfier from the externally-produced signature(s). Byte-identical to
    // the custodial build_* satisfiers; only the signatures' provenance differs (wallet,
    // not server).
    let sig_script = match assemble_noncustodial_satisfier(
        &kind_base, pending.branch_refund, &pending.redeem, &pending.member_pubkeys,
        &sigs, solo.as_ref(), preimage.as_deref(),
    ) {
        Ok(s) => s,
        Err(e) => return err(e),
    };
    let mut signable = SignableTransaction::with_entries(pending.unsigned_tx.clone(), vec![pending.entry.clone()]);
    signable.tx.inputs[0].signature_script = sig_script;
    signable.tx.finalize();
    let client = match client_for_network(&pending.network).await {
        Ok(c) => c,
        Err(e) => return err(e),
    };
    let rpc_tx = RpcTransaction::from(&signable.tx);
    match client.submit_transaction(rpc_tx, false).await {
        Ok(tx_id) => {
            // Mark the covenant spent so the explorer/API stops showing it spendable.
            let _ = crate::db::mark_p2sh_spent(&db, &pending.deploy_tx_id, &tx_id.to_string());
            Json(serde_json::json!({
                "success": true,
                "spend_tx_id": tx_id.to_string(),
                "note": "Wallet-signed spend broadcast; no key touched the server."
            }))
        }
        Err(e) => err(format!(
            "broadcast rejected: {e} (a wrong signature, or the wallet signing a different sighash, fails the script)"
        )),
    }
}

// ── Non-custodial wallet-FUNDED deploy (3.1): the deploy-side analog of
// prepare-spend/submit-spend. The server builds the unsigned funding tx (locking the
// stake to the P2SH and carrying the aa20+redeem payload) and returns its sighash; the
// deployer's WALLET signs it; submit-deploy assembles the P2PK signature_script and
// broadcasts. The deployer's private key never touches the server, so a mainnet covenant
// can be deployed trustlessly (no dev key, no key upload). The redeem locks to the
// deployer's own x-only pubkey, derived from their address. ──

/// Build (redeem, redeem_kind) for a non-custodial deploy from the spec + the deployer's
/// x-only pubkey (extracted from their address - no secret key needed). Mirrors the
/// custodial p2sh_deploy_handler dispatch. oracle_* are intentionally unsupported here
/// (they put the Covex oracle key in the path; not part of the trustless wallet flow).
fn build_redeem_from_spec(spec: &RedeemSpec, owner_xonly: &[u8; 32]) -> BResult<(Vec<u8>, String)> {
    match spec.kind.as_str() {
        "singlesig" => Ok((redeem_singlesig(owner_xonly)?, "singlesig".to_string())),
        "hashlock" => {
            let p = spec.preimage_hex.as_ref().ok_or("hashlock requires preimage_hex")?;
            let preimage = hex::decode(p.trim()).map_err(|e| format!("bad preimage_hex: {e}"))?;
            Ok((redeem_hashlock(&blake2b256(&preimage), owner_xonly)?, "hashlock".to_string()))
        }
        "timelock" => {
            let lock = spec.lock_daa.ok_or("timelock requires lock_daa")?;
            Ok((redeem_timelock(lock, owner_xonly)?, format!("timelock:{lock}")))
        }
        "multisig" => {
            let pks = spec.pubkeys_hex.as_ref().ok_or("multisig requires pubkeys_hex")?;
            let mut v = Vec::new();
            for p in pks { v.push(decode_xonly_hex(p)?); }
            if v.is_empty() { return Err("multisig requires at least one pubkey".into()); }
            let required = spec.required.unwrap_or(v.len());
            Ok((redeem_multisig(&v, required)?, format!("multisig:{}", v.len())))
        }
        "htlc" => {
            let p = spec.preimage_hex.as_ref().ok_or("htlc requires preimage_hex")?;
            let preimage = hex::decode(p.trim()).map_err(|e| format!("bad preimage_hex: {e}"))?;
            let lock = spec.lock_daa.ok_or("htlc requires lock_daa")?;
            let receiver = match &spec.receiver_pubkey_hex { Some(s) => decode_xonly_hex(s)?, None => *owner_xonly };
            let sender = match &spec.sender_pubkey_hex { Some(s) => decode_xonly_hex(s)?, None => *owner_xonly };
            Ok((redeem_htlc(&blake2b256(&preimage), &receiver, lock, &sender)?, format!("htlc:{lock}")))
        }
        "channel" => {
            let pks = spec.pubkeys_hex.as_ref().ok_or("channel requires pubkeys_hex=[p1,p2]")?;
            if pks.len() < 2 { return Err("channel needs pubkeys_hex=[p1,p2]".into()); }
            let lock = spec.lock_daa.ok_or("channel requires lock_daa")?;
            Ok((redeem_channel(&decode_xonly_hex(&pks[0])?, &decode_xonly_hex(&pks[1])?, lock)?, format!("channel:{lock}")))
        }
        other => Err(format!("non-custodial deploy does not support kind '{other}' (oracle covenants use the server oracle path)")),
    }
}

#[derive(Deserialize)]
pub struct PrepareDeployRequest {
    #[serde(default = "default_network")]
    pub network: String,
    /// The deployer's address (a 32-byte schnorr P2PK address). Funds the lock and, for the
    /// single-signer kinds, becomes the redeem key. The key itself is NEVER sent.
    pub deployer_addr: String,
    pub stake_kas: f64,
    pub redeem: RedeemSpec,
}

struct PendingDeploy {
    network: String,
    unsigned_tx: Transaction,
    entry: UtxoEntry,
    redeem: Vec<u8>,
    redeem_kind: String,
    p2sh_address: String,
    deployer_addr: String,
    stake_sompi: u64,
    created_at: i64,
}

fn deploy_sessions() -> &'static Mutex<std::collections::HashMap<String, PendingDeploy>> {
    static S: std::sync::OnceLock<Mutex<std::collections::HashMap<String, PendingDeploy>>> =
        std::sync::OnceLock::new();
    S.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

/// POST /covenant/p2sh/prepare-deploy - build the unsigned funding tx + return the sighash
/// the deployer's wallet must sign. No key touches the server.
pub async fn prepare_deploy_handler(
    Extension(_db): Extension<Arc<Mutex<Connection>>>,
    Json(req): Json<PrepareDeployRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));
    let is_mainnet = req.network.starts_with("mainnet");
    // Pre-Toccata, Kaspa mainnet does not enforce covenant scripts, so gate mainnet deploys
    // behind the same flag the operator flips at activation. Testnets are always open.
    if is_mainnet && !crate::crawler::mainnet_covenants_enabled() {
        return err("mainnet covenants activate at the Toccata hard fork (set COVEX_MAINNET_COVENANTS_ENABLED=true once it is live). Deploy on a testnet until then.".into());
    }
    // The deployer's x-only pubkey IS the payload of a 32-byte schnorr P2PK address.
    let owner_addr = match Address::try_from(req.deployer_addr.as_str()) {
        Ok(a) => a,
        Err(e) => return err(format!("invalid deployer address: {e}")),
    };
    let owner_xonly: [u8; 32] = match owner_addr.payload.as_slice().try_into() {
        Ok(x) => x,
        Err(_) => return err("deployer must be a 32-byte schnorr P2PK address (kaspa:q.../kaspatest:q...)".into()),
    };
    let (redeem, redeem_kind) = match build_redeem_from_spec(&req.redeem, &owner_xonly) {
        Ok(v) => v,
        Err(e) => return err(e),
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
    let utxos = match client.get_utxos_by_addresses(vec![owner_addr.clone()]).await {
        Ok(u) => u,
        Err(e) => return err(format!("UTXO fetch failed: {e}")),
    };
    if utxos.is_empty() {
        return err("no UTXOs for the deployer address (fund it first)".into());
    }
    let best = utxos.iter().max_by_key(|u| u.utxo_entry.amount).unwrap();
    let total_input = best.utxo_entry.amount;
    let total_cost = stake_sompi + TX_FEE;
    if total_input < total_cost {
        return err(format!("insufficient balance in the largest UTXO: have {total_input} sompi, need {total_cost}. Consolidate UTXOs or lower the stake."));
    }
    let deployer_script = best.utxo_entry.script_public_key.clone();
    let change = total_input - total_cost;
    let mut outputs = vec![TransactionOutput { value: stake_sompi, script_public_key: p2sh_spk }];
    if change > 0 {
        outputs.push(TransactionOutput { value: change, script_public_key: deployer_script });
    }
    let inputs = vec![TransactionInput {
        previous_outpoint: TransactionOutpoint { transaction_id: best.outpoint.transaction_id, index: best.outpoint.index },
        signature_script: vec![],
        sequence: 0,
        sig_op_count: 1,
    }];
    // Same aa20 + blake2b(redeem) + full-redeem payload as the custodial deploy (required
    // for the sighash, crawler-discoverable, and trustless on-chain recovery).
    let mut deploy_payload = vec![0xaa, 0x20];
    deploy_payload.extend_from_slice(&blake2b256(&redeem));
    deploy_payload.extend_from_slice(&redeem);
    let unsigned = Transaction::new_non_finalized(
        0, inputs, outputs, 0, SubnetworkId::from_bytes([0u8; 20]), 0, deploy_payload,
    );
    let entry = UtxoEntry {
        amount: best.utxo_entry.amount,
        script_public_key: best.utxo_entry.script_public_key.clone(),
        block_daa_score: best.utxo_entry.block_daa_score,
        is_coinbase: best.utxo_entry.is_coinbase,
    };
    let signable = SignableTransaction::with_entries(unsigned.clone(), vec![entry.clone()]);
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), 0, SIG_HASH_ALL, &mut reused);
    let sighash_hex = hex::encode(sig_hash.as_bytes());

    let session_id = uuid::Uuid::new_v4().to_string();
    let now_ts = chrono::Utc::now().timestamp();
    {
        let mut s = deploy_sessions().lock().unwrap();
        s.retain(|_, v| v.created_at > now_ts - 600);
        s.insert(session_id.clone(), PendingDeploy {
            network: req.network.clone(), unsigned_tx: unsigned, entry, redeem: redeem.clone(),
            redeem_kind: redeem_kind.clone(), p2sh_address: p2sh_addr.clone(),
            deployer_addr: req.deployer_addr.clone(), stake_sompi, created_at: now_ts,
        });
    }
    Json(serde_json::json!({
        "success": true,
        "session_id": session_id,
        "sighash": sighash_hex,
        "sign_scheme": "bip340-schnorr-secp256k1",
        "signer_xonly": hex::encode(owner_xonly),
        "p2sh_address": p2sh_addr,
        "redeem_script_hex": hex::encode(&redeem),
        "redeem_kind": redeem_kind,
        "stake_sompi": stake_sompi,
        "locked_kas": stake_sompi as f64 / 100_000_000.0,
        "note": "Sign this sighash (BIP340 Schnorr) with your wallet key, then POST {session_id, signature_hex} to /covenant/p2sh/submit-deploy. Your key never leaves your device."
    }))
}

#[derive(Deserialize)]
pub struct SubmitDeployRequest {
    pub session_id: String,
    /// 64-byte BIP340 Schnorr signature (hex) over the prepared funding sighash.
    pub signature_hex: String,
}

/// POST /covenant/p2sh/submit-deploy - assemble the deployer's signature into the funding
/// tx and broadcast, then index the new covenant. The server never had the key.
pub async fn submit_deploy_handler(
    Extension(db): Extension<Arc<Mutex<Connection>>>,
    Json(req): Json<SubmitDeployRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));
    let pending = {
        let mut s = deploy_sessions().lock().unwrap();
        match s.remove(&req.session_id) {
            Some(p) => p,
            None => return err("unknown or expired session_id (call prepare-deploy first; sessions last 10 minutes)".into()),
        }
    };
    let sig: [u8; 64] = match hex::decode(req.signature_hex.trim().trim_start_matches("0x")).ok().and_then(|b| b.try_into().ok()) {
        Some(b) => b,
        None => return err("signature_hex must be a 64-byte BIP340 Schnorr signature".into()),
    };
    // The funding input spends a 32-byte schnorr P2PK output; its signature_script is just
    // the 65-byte (sig||sighashtype) push.
    let mut signable = SignableTransaction::with_entries(pending.unsigned_tx.clone(), vec![pending.entry.clone()]);
    signable.tx.inputs[0].signature_script = push65(&sig);
    signable.tx.finalize();
    let client = match client_for_network(&pending.network).await {
        Ok(c) => c,
        Err(e) => return err(e),
    };
    let rpc_tx = RpcTransaction::from(&signable.tx);
    match client.submit_transaction(rpc_tx, false).await {
        Ok(tx_id) => {
            let tx_id_str = tx_id.to_string();
            let redeem_hex = hex::encode(&pending.redeem);
            // Same bookkeeping as the custodial deploy: persist the p2sh record + index the
            // covenant immediately at "<txid>:0" so it shows on-chain at once.
            let _ = db::insert_p2sh_covenant(
                &db, &tx_id_str, &pending.network, &pending.p2sh_address, &redeem_hex,
                &pending.redeem_kind, pending.stake_sompi, 0, &pending.deployer_addr,
            );
            let p2sh_script_hex = hex::encode(p2sh_script_pubkey(&pending.redeem).script());
            let cid = format!("{}:0", tx_id_str);
            let recv = serde_json::to_string(&vec![pending.p2sh_address.clone()]).unwrap_or_default();
            let kind_base = pending.redeem_kind.split(':').next().unwrap_or(&pending.redeem_kind);
            let ctype = format!("p2sh-{kind_base}");
            let summary = format!("Script-enforced {} covenant, {} KAS locked", kind_base, pending.stake_sompi as f64 / 1e8);
            let _ = db::insert_covenant(
                &db, &cid, &pending.p2sh_address, pending.stake_sompi, &crate::compute_script_hash(&p2sh_script_hex),
                &p2sh_script_hex, &ctype, "P2SH Commitments", &pending.deployer_addr, &summary, 0,
                "EXPLORER", &summary, &recv, &pending.network,
            );
            info!("Non-custodial P2SH deploy: tx={} kind={} addr={} locked={} sompi", tx_id_str, pending.redeem_kind, pending.p2sh_address, pending.stake_sompi);
            Json(serde_json::json!({
                "success": true,
                "deploy_tx_id": tx_id_str,
                "p2sh_address": pending.p2sh_address,
                "redeem_script_hex": redeem_hex,
                "redeem_kind": pending.redeem_kind,
                "outpoint": format!("{}:0", tx_id_str),
                "locked_sompi": pending.stake_sompi,
                "locked_kas": pending.stake_sompi as f64 / 100_000_000.0,
                "enforcement_reality": "on-chain",
                "note": "Wallet-signed deploy broadcast; no key touched the server. Funds are locked to the script hash."
            }))
        }
        Err(e) => err(format!("broadcast rejected: {e} (a wrong signature, or signing a different sighash, fails the funding input)")),
    }
}

pub fn p2sh_routes() -> Router {
    Router::new()
        .route("/covenant/p2sh/deploy", post(p2sh_deploy_handler))
        .route("/covenant/p2sh/spend", post(p2sh_spend_handler))
        .route("/covenant/p2sh/prepare-spend", post(prepare_spend_handler))
        .route("/covenant/p2sh/submit-signed", post(submit_signed_handler))
        .route("/covenant/p2sh/prepare-deploy", post(prepare_deploy_handler))
        .route("/covenant/p2sh/submit-deploy", post(submit_deploy_handler))
        .route("/covenant/oracle-payout", post(oracle_payout_handler))
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

    /// Phase 1: `RedeemKind` is the single source of truth. Its `redeem_script()` must be
    /// byte-identical to calling the underlying builder directly (so routing the deploy
    /// handler through the enum can never change a covenant's locking script), and its
    /// `kind_str()` must reproduce the exact strings the deploy handler persists (so the
    /// spend path keeps round-tripping existing rows, including `oracle:2`).
    #[test]
    fn redeemkind_is_byte_identical_and_round_trips_kind_str() {
        let a = [11u8; 32];
        let b = [22u8; 32];
        let c = [33u8; 32];
        let h = [44u8; 32];

        // redeem_script() routes to the exact same builder bytes as the free functions.
        assert_eq!(
            RedeemKind::SingleSig { xonly_pubkey: a }.redeem_script().unwrap(),
            redeem_singlesig(&a).unwrap()
        );
        assert_eq!(
            RedeemKind::HashLock { hash: h, xonly_pubkey: a }.redeem_script().unwrap(),
            redeem_hashlock(&h, &a).unwrap()
        );
        assert_eq!(
            RedeemKind::Timelock { lock_daa: 5000, xonly_pubkey: a }.redeem_script().unwrap(),
            redeem_timelock(5000, &a).unwrap()
        );
        assert_eq!(
            RedeemKind::Multisig { pubkeys: vec![a, b], required: 2 }.redeem_script().unwrap(),
            redeem_multisig(&[a, b], 2).unwrap()
        );
        assert_eq!(
            RedeemKind::Htlc { hash: h, receiver_pubkey: a, lock_daa: 7000, sender_pubkey: b }
                .redeem_script()
                .unwrap(),
            redeem_htlc(&h, &a, 7000, &b).unwrap()
        );
        assert_eq!(
            RedeemKind::Channel { p1: a, p2: b, lock_daa: 8000 }.redeem_script().unwrap(),
            redeem_channel(&a, &b, 8000).unwrap()
        );
        assert_eq!(
            RedeemKind::OracleEnforced { oracle: a, winner: b }.redeem_script().unwrap(),
            redeem_multisig(&[a, b], 2).unwrap()
        );
        assert_eq!(
            RedeemKind::OracleEscrow { oracle: a, player_a: b, player_b: c }.redeem_script().unwrap(),
            redeem_oracle_escrow(&a, &b, &c).unwrap()
        );

        // kind_str() reproduces the exact strings the deploy handler persisted pre-refactor.
        assert_eq!(RedeemKind::SingleSig { xonly_pubkey: a }.kind_str(), "singlesig");
        assert_eq!(RedeemKind::HashLock { hash: h, xonly_pubkey: a }.kind_str(), "hashlock");
        assert_eq!(RedeemKind::Timelock { lock_daa: 5000, xonly_pubkey: a }.kind_str(), "timelock:5000");
        assert_eq!(RedeemKind::Multisig { pubkeys: vec![a, b, c], required: 2 }.kind_str(), "multisig:3");
        assert_eq!(
            RedeemKind::Htlc { hash: h, receiver_pubkey: a, lock_daa: 7000, sender_pubkey: b }.kind_str(),
            "htlc:7000"
        );
        assert_eq!(RedeemKind::Channel { p1: a, p2: b, lock_daa: 8000 }.kind_str(), "channel:8000");
        assert_eq!(RedeemKind::OracleEnforced { oracle: a, winner: b }.kind_str(), "oracle:2");
        assert_eq!(RedeemKind::OracleEscrow { oracle: a, player_a: b, player_b: c }.kind_str(), "oracle_escrow");
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

    #[test]
    fn htlc_claim_and_refund_branches() {
        let receiver = test_keypair(71);
        let sender = test_keypair(72);
        let rpk = receiver.x_only_public_key().0.serialize();
        let spk = sender.x_only_public_key().0.serialize();
        let preimage = b"atomic-swap-secret".to_vec();
        let hash = blake2b256(&preimage);
        let lock_daa: u64 = 2_000_000;
        let redeem = redeem_htlc(&hash, &rpk, lock_daa, &spk).unwrap();

        // CLAIM: receiver reveals the correct preimage and signs (lock_time irrelevant).
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| build_htlc_signature_script(s, 0, &receiver, &redeem, true, Some(&preimage)).unwrap()),
            "receiver claim with correct preimage must pass"
        );
        // CLAIM with a wrong preimage fails (OpEqualVerify).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_htlc_signature_script(s, 0, &receiver, &redeem, true, Some(b"wrong")).unwrap()),
            "claim with wrong preimage must fail"
        );
        // CLAIM with the correct preimage but the SENDER key fails (OpCheckSig in IF branch).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_htlc_signature_script(s, 0, &sender, &redeem, true, Some(&preimage)).unwrap()),
            "claim branch requires the receiver key"
        );
        // REFUND: sender signs after the timelock (lock_time >= lock_daa, non-final input).
        assert!(
            run_spend_generic(&redeem, lock_daa, 0, |s| build_htlc_signature_script(s, 0, &sender, &redeem, false, None).unwrap()),
            "sender refund after the timelock must pass"
        );
        // REFUND before the timelock fails (CLTV).
        assert!(
            !run_spend_generic(&redeem, lock_daa - 1, 0, |s| build_htlc_signature_script(s, 0, &sender, &redeem, false, None).unwrap()),
            "refund before the timelock must fail"
        );
        // REFUND branch with the RECEIVER key fails (OpCheckSig in ELSE branch).
        assert!(
            !run_spend_generic(&redeem, lock_daa, 0, |s| build_htlc_signature_script(s, 0, &receiver, &redeem, false, None).unwrap()),
            "refund branch requires the sender key"
        );
    }

    #[test]
    fn oracle_escrow_pays_only_the_winner_with_oracle_cosign() {
        let oracle = test_keypair(81);
        let player_a = test_keypair(82);
        let player_b = test_keypair(83);
        let ox = oracle.x_only_public_key().0.serialize();
        let ax = player_a.x_only_public_key().0.serialize();
        let bx = player_b.x_only_public_key().0.serialize();
        let redeem = redeem_oracle_escrow(&ox, &ax, &bx).unwrap();

        // Player A won: oracle co-signs + A signs the IF branch.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| build_oracle_escrow_signature_script(s, 0, &oracle, &player_a, true, &redeem).unwrap()),
            "A's claim with the oracle co-sign must pass"
        );
        // Player B won: oracle co-signs + B signs the ELSE branch.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| build_oracle_escrow_signature_script(s, 0, &oracle, &player_b, false, &redeem).unwrap()),
            "B's claim with the oracle co-sign must pass"
        );
        // A signs but selects B's branch (B's pubkey vs A's sig) -> fail.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_oracle_escrow_signature_script(s, 0, &oracle, &player_a, false, &redeem).unwrap()),
            "claiming the wrong branch must fail"
        );
        // No valid oracle co-sign (wrong oracle key) -> OpCheckSigVerify aborts.
        let not_oracle = test_keypair(99);
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_oracle_escrow_signature_script(s, 0, &not_oracle, &player_a, true, &redeem).unwrap()),
            "without the real oracle co-sign the pot is unspendable"
        );
        // A non-member 'player' with the oracle co-sign still fails (OpCheckSig in branch).
        let outsider = test_keypair(98);
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_oracle_escrow_signature_script(s, 0, &oracle, &outsider, true, &redeem).unwrap()),
            "a non-member cannot claim even with the oracle co-sign"
        );
    }

    #[test]
    fn channel_cooperative_close_and_timeout_refund() {
        let p1 = test_keypair(71);
        let p2 = test_keypair(72);
        let p1x = p1.x_only_public_key().0.serialize();
        let p2x = p2.x_only_public_key().0.serialize();
        let lock_daa = 5_000u64; // absolute DAA (well below LOCK_TIME_THRESHOLD)
        let redeem = redeem_channel(&p1x, &p2x, lock_daa).unwrap();

        // Cooperative close: BOTH players co-sign the IF branch (no oracle) -> spends.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| build_channel_signature_script(s, 0, &p1, Some(&p2), true, &redeem).unwrap()),
            "cooperative 2-of-2 close must satisfy the IF branch"
        );
        // Cooperative close with a wrong second key -> the p2 OpCheckSig fails.
        let wrong = test_keypair(99);
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_channel_signature_script(s, 0, &p1, Some(&wrong), true, &redeem).unwrap()),
            "cooperative close needs BOTH real player signatures"
        );
        // Refund BEFORE the timeout (tx lock_time 0 < lock_daa) -> CLTV rejects.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_channel_signature_script(s, 0, &p1, None, false, &redeem).unwrap()),
            "refund before the timeout must be rejected by CLTV"
        );
        // Refund AFTER the timeout (lock_time >= lock_daa, non-final sequence) -> p1 reclaims.
        assert!(
            run_spend_generic(&redeem, lock_daa, 0, |s| build_channel_signature_script(s, 0, &p1, None, false, &redeem).unwrap()),
            "funder refund after the timeout must pass"
        );
        // Refund after the timeout by the wrong key -> the ELSE branch's OpCheckSig fails.
        assert!(
            !run_spend_generic(&redeem, lock_daa, 0, |s| build_channel_signature_script(s, 0, &wrong, None, false, &redeem).unwrap()),
            "only the funder can refund the channel"
        );
    }

    // ── Non-custodial multi-party assembly (1.4): prove the satisfier built from
    // EXTERNALLY-produced signatures (each "wallet" signs the sighash, the server only
    // assembles + relays) satisfies the SAME consensus script engine. ──
    fn sighash_msg(signable: &SignableTransaction) -> secp256k1::Message {
        let mut reused = SigHashReusedValues::new();
        let h = calc_schnorr_signature_hash(&signable.as_verifiable(), 0, SIG_HASH_ALL, &mut reused);
        secp256k1::Message::from_digest_slice(h.as_bytes().as_slice()).unwrap()
    }
    fn ext_sigs(signable: &SignableTransaction, kps: &[&Keypair]) -> std::collections::HashMap<String, [u8; 64]> {
        let msg = sighash_msg(signable);
        let mut m = std::collections::HashMap::new();
        for kp in kps {
            let sig: [u8; 64] = *kp.sign_schnorr(msg).as_ref();
            m.insert(hex::encode(kp.x_only_public_key().0.serialize()), sig);
        }
        m
    }
    fn ext_solo(signable: &SignableTransaction, kp: &Keypair) -> [u8; 64] {
        *kp.sign_schnorr(sighash_msg(signable)).as_ref()
    }
    fn empty_sigs() -> std::collections::HashMap<String, [u8; 64]> { std::collections::HashMap::new() }

    #[test]
    fn noncustodial_multisig_2of2() {
        let kp1 = test_keypair(31);
        let kp2 = test_keypair(32);
        let x1 = kp1.x_only_public_key().0.serialize();
        let x2 = kp2.x_only_public_key().0.serialize();
        let redeem = redeem_multisig(&[x1, x2], 2).unwrap();
        let members = parse_redeem_pubkeys(&redeem, false);
        assert_eq!(members, vec![x1, x2], "multisig pubkey parse must keep both members in order");
        // Both members sign in their own wallet -> valid 2-of-2 spend.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let sigs = ext_sigs(s, &[&kp1, &kp2]);
                assemble_noncustodial_satisfier("multisig", false, &redeem, &members, &sigs, None, None).unwrap()
            }),
            "2-of-2 non-custodial multisig must satisfy the lock"
        );
        // Only one signature -> the engine rejects (needs both).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let sigs = ext_sigs(s, &[&kp1]);
                assemble_noncustodial_satisfier("multisig", false, &redeem, &members, &sigs, None, None).unwrap()
            }),
            "a single signature must not satisfy a 2-of-2"
        );
    }

    #[test]
    fn noncustodial_htlc_claim_and_refund() {
        let receiver = test_keypair(41);
        let sender = test_keypair(42);
        let xr = receiver.x_only_public_key().0.serialize();
        let xs = sender.x_only_public_key().0.serialize();
        let preimage = b"non-custodial-htlc-secret";
        let hash = blake2b256(preimage);
        let lock_daa = 555u64;
        let redeem = redeem_htlc(&hash, &xr, lock_daa, &xs).unwrap();
        let members = parse_redeem_pubkeys(&redeem, true);
        assert_eq!(members, vec![xr, xs], "htlc parse must yield [receiver, sender]");
        // Claim: receiver signs + reveals the preimage, lock_time 0.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let solo = ext_solo(s, &receiver);
                assemble_noncustodial_satisfier("htlc", false, &redeem, &members, &empty_sigs(), Some(&solo), Some(preimage)).unwrap()
            }),
            "non-custodial HTLC claim must satisfy"
        );
        // Claim with the WRONG preimage -> OpEqualVerify fails.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let solo = ext_solo(s, &receiver);
                assemble_noncustodial_satisfier("htlc", false, &redeem, &members, &empty_sigs(), Some(&solo), Some(b"wrong")).unwrap()
            }),
            "HTLC claim with a wrong preimage must fail"
        );
        // Refund: sender signs, lock_time = lock_daa.
        assert!(
            run_spend_generic(&redeem, lock_daa, 0, |s| {
                let solo = ext_solo(s, &sender);
                assemble_noncustodial_satisfier("htlc", true, &redeem, &members, &empty_sigs(), Some(&solo), None).unwrap()
            }),
            "non-custodial HTLC refund at lock_daa must satisfy"
        );
        // Refund before the timelock elapses -> not finalized.
        assert!(
            !run_spend_generic(&redeem, lock_daa - 1, 0, |s| {
                let solo = ext_solo(s, &sender);
                assemble_noncustodial_satisfier("htlc", true, &redeem, &members, &empty_sigs(), Some(&solo), None).unwrap()
            }),
            "HTLC refund before lock_daa must fail"
        );
    }

    #[test]
    fn noncustodial_channel_close_and_refund() {
        let p1 = test_keypair(51);
        let p2 = test_keypair(52);
        let wrong = test_keypair(99);
        let xp1 = p1.x_only_public_key().0.serialize();
        let xp2 = p2.x_only_public_key().0.serialize();
        let lock_daa = 777u64;
        let redeem = redeem_channel(&xp1, &xp2, lock_daa).unwrap();
        let members = parse_redeem_pubkeys(&redeem, true);
        assert_eq!(members, vec![xp1, xp2, xp1], "channel parse must yield [p1, p2, p1]");
        // Cooperative close: both players sign the agreed payout, lock_time 0.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let sigs = ext_sigs(s, &[&p1, &p2]);
                assemble_noncustodial_satisfier("channel", false, &redeem, &members, &sigs, None, None).unwrap()
            }),
            "non-custodial channel cooperative close must satisfy"
        );
        // Close with a wrong player2 signature -> rejected.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let mut sigs = ext_sigs(s, &[&p1]);
                sigs.insert(hex::encode(xp2), ext_solo(s, &wrong));
                assemble_noncustodial_satisfier("channel", false, &redeem, &members, &sigs, None, None).unwrap()
            }),
            "channel close with a forged player2 signature must fail"
        );
        // Refund: funder (p1) signs, lock_time = lock_daa.
        assert!(
            run_spend_generic(&redeem, lock_daa, 0, |s| {
                let solo = ext_solo(s, &p1);
                assemble_noncustodial_satisfier("channel", true, &redeem, &members, &empty_sigs(), Some(&solo), None).unwrap()
            }),
            "non-custodial channel refund by the funder must satisfy"
        );
        // Refund signed by a non-funder -> rejected.
        assert!(
            !run_spend_generic(&redeem, lock_daa, 0, |s| {
                let solo = ext_solo(s, &wrong);
                assemble_noncustodial_satisfier("channel", true, &redeem, &members, &empty_sigs(), Some(&solo), None).unwrap()
            }),
            "only the funder can refund the channel (non-custodial)"
        );
    }

    #[test]
    fn noncustodial_deploy_funding_p2pk_spend() {
        // The wallet-funded deploy (3.1) spends the deployer's 32-byte schnorr P2PK UTXO to
        // fund the lock; its signature_script is push65(sig) verified against
        // `<pubkey> OpCheckSig`. Prove that exact funding spend executes, and that a wrong
        // key fails (so a forged funding signature cannot move the deployer's coins).
        use kaspa_consensus_core::tx::{ScriptPublicKey, ScriptVec};
        // Mirror run_spend_generic's borrow structure (a plain fn) but for a P2PK input.
        fn run_p2pk(p2pk_spk: &ScriptPublicKey, make_sig: impl Fn(&SignableTransaction) -> Vec<u8>) -> bool {
            let prev = TransactionOutpoint { transaction_id: kaspa_hashes::Hash::from_bytes([9u8; 32]), index: 0 };
            let tx = Transaction::new(
                0,
                vec![TransactionInput { previous_outpoint: prev, signature_script: vec![], sequence: 0, sig_op_count: 1 }],
                vec![TransactionOutput { value: 90_000_000, script_public_key: p2pk_spk.clone() }],
                0, SubnetworkId::from_bytes([0u8; 20]), 0, vec![0xaa, 0x20, 1, 2, 3],
            );
            let entries = vec![UtxoEntry { amount: 100_000_000, script_public_key: p2pk_spk.clone(), block_daa_score: 1, is_coinbase: false }];
            let mut signable = SignableTransaction::with_entries(tx, entries);
            let sig_script = make_sig(&signable);
            signable.tx.inputs[0].signature_script = sig_script;
            let verifiable = signable.as_verifiable();
            let (input, entry) = verifiable.populated_inputs().next().unwrap();
            let mut reused = SigHashReusedValues::new();
            let cache = Cache::new(10_000);
            let mut engine = TxScriptEngine::from_transaction_input(&verifiable, input, 0, entry, &mut reused, &cache).unwrap();
            engine.execute().is_ok()
        }
        let kp = test_keypair(61);
        let xonly = kp.x_only_public_key().0.serialize();
        let mut p2pk = Vec::with_capacity(34);
        p2pk.push(0x20);
        p2pk.extend_from_slice(&xonly);
        p2pk.push(0xac);
        let p2pk_spk = ScriptPublicKey::new(0, ScriptVec::from_slice(&p2pk));
        let sign = |s: &SignableTransaction, k: &Keypair| -> [u8; 64] {
            let mut reused = SigHashReusedValues::new();
            let h = calc_schnorr_signature_hash(&s.as_verifiable(), 0, SIG_HASH_ALL, &mut reused);
            let msg = secp256k1::Message::from_digest_slice(h.as_bytes().as_slice()).unwrap();
            *k.sign_schnorr(msg).as_ref()
        };
        assert!(run_p2pk(&p2pk_spk, |s| push65(&sign(s, &kp))), "non-custodial deploy funding P2PK spend must execute");
        let wrong = test_keypair(62);
        assert!(!run_p2pk(&p2pk_spk, |s| push65(&sign(s, &wrong))), "a wrong key must not satisfy the funding P2PK spend");
    }
}
