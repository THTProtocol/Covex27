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
    TransactionOutpoint, TransactionOutput, UtxoEntry,
};
use kaspa_rpc_core::api::rpc::RpcApi;
use kaspa_rpc_core::RpcTransaction;
use kaspa_txscript::opcodes::codes::{
    OpBlake2b, OpCheckLockTimeVerify, OpCheckSequenceVerify, OpCheckSig, OpCheckSigVerify, OpElse, OpEndIf,
    OpEqualVerify, OpFalse, OpIf, OpTrue,
};
use kaspa_txscript::script_builder::ScriptBuilder;
use kaspa_wrpc_client::KaspaRpcClient;
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
    /// Dead-man's-switch / inheritance: `OP_IF <owner> OpCheckSig OP_ELSE <lock_daa>
    /// OpCheckLockTimeVerify <heir> OpCheckSig OP_ENDIF`. The owner spends/refreshes at any
    /// time; the heir can claim only once the chain reaches `lock_daa`. No oracle.
    Deadman { owner: [u8; 32], heir: [u8; 32], lock_daa: u64 },
    /// Relative timelock (CSV): `<min_sequence> OpCheckSequenceVerify <xonly> OpCheckSig`.
    /// Node-enforced (BIP68): a live TN12 spend of a fresh UTXO is rejected with
    /// "one of the transaction sequence locks conditions was not met".
    RelativeTimelock { min_sequence: u64, xonly_pubkey: [u8; 32] },
    /// Time-decaying multisig: `req_now`-of-n now, `req_after`-of-n after `lock_daa`
    /// (req_after < req_now). Treasury recovery / inheritance. Built via
    /// redeem_timedecay_multisig (two real multisigs spliced into an IF/ELSE).
    TimeDecay { pubkeys: Vec<[u8; 32]>, req_now: usize, req_after: usize, lock_daa: u64 },
    /// Binary outcome selector - the per-match unit of a parimutuel bundle. Two hashlock
    /// branches gate the two outcomes, with a relative-timelock refund tail:
    /// `OP_IF OpBlake2b <h_a> OpEqualVerify <winner_a> OpCheckSig OP_ELSE OP_IF OpBlake2b
    /// <h_b> OpEqualVerify <winner_b> OpCheckSig OP_ELSE <min_sequence> OpCheckSequenceVerify
    /// <refund> OpCheckSig OP_ENDIF OP_ENDIF`. An outcome oracle commits to H_A and H_B up
    /// front and reveals EXACTLY ONE secret at resolution: reveal s_A => winner_a claims;
    /// reveal s_B => winner_b claims; if neither is ever revealed, the refund key reclaims
    /// once the UTXO ages `min_sequence` units (BIP68). No Covex key is in the redeem - the
    /// oracle only distributes a secret, it never signs a payout, so this is pure on-chain.
    BinaryOracleSelect {
        h_a: [u8; 32],
        winner_a: [u8; 32],
        h_b: [u8; 32],
        winner_b: [u8; 32],
        min_sequence: u64,
        refund: [u8; 32],
    },
    /// Refundable oracle-enforced 2-of-2 (oracle + winner): the existing `OracleEnforced` 2-of-2
    /// wrapped in an outer OP_IF, plus an OP_ELSE relative-timelock (CSV) refund branch so the
    /// funder can reclaim if the oracle ever goes silent. Fixes the frozen-funds risk of the
    /// non-refundable form (a mandatory oracle co-signature with no timeout). Additive: existing
    /// `OracleEnforced` covenants are untouched.
    OracleEnforcedRefundable { oracle: [u8; 32], winner: [u8; 32], min_sequence: u64, refund: [u8; 32] },
    /// Refundable oracle-enforced 2-player escrow / game pot: the existing `OracleEscrow`
    /// (`<oracle> CheckSigVerify IF <a> CheckSig ELSE <b> CheckSig ENDIF`) wrapped in an outer
    /// OP_IF, plus an OP_ELSE relative-timelock (CSV) refund branch so the funder can reclaim if
    /// the oracle ever goes silent. Fixes the frozen-funds risk of the non-refundable form.
    /// Additive: existing `OracleEscrow` covenants are untouched.
    OracleEscrowRefundable {
        oracle: [u8; 32],
        player_a: [u8; 32],
        player_b: [u8; 32],
        min_sequence: u64,
        refund: [u8; 32],
    },
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
            RedeemKind::Deadman { owner, heir, lock_daa } => redeem_deadman(owner, heir, *lock_daa),
            RedeemKind::RelativeTimelock { min_sequence, xonly_pubkey } => {
                redeem_relative_timelock(*min_sequence, xonly_pubkey)
            }
            RedeemKind::TimeDecay { pubkeys, req_now, req_after, lock_daa } => {
                redeem_timedecay_multisig(pubkeys, *req_now, *req_after, *lock_daa)
            }
            RedeemKind::BinaryOracleSelect { h_a, winner_a, h_b, winner_b, min_sequence, refund } => {
                redeem_binary_oracle_select(h_a, winner_a, h_b, winner_b, *min_sequence, refund)
            }
            RedeemKind::OracleEnforcedRefundable { oracle, winner, min_sequence, refund } => {
                redeem_oracle_enforced_refundable(oracle, winner, *min_sequence, refund)
            }
            RedeemKind::OracleEscrowRefundable { oracle, player_a, player_b, min_sequence, refund } => {
                redeem_oracle_escrow_refundable(oracle, player_a, player_b, *min_sequence, refund)
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
            RedeemKind::Deadman { lock_daa, .. } => format!("deadman:{lock_daa}"),
            RedeemKind::RelativeTimelock { min_sequence, .. } => format!("rcsv:{min_sequence}"),
            RedeemKind::TimeDecay { pubkeys, req_now, req_after, lock_daa } => {
                format!("timedecay:{}:{req_now}:{req_after}:{lock_daa}", pubkeys.len())
            }
            RedeemKind::BinaryOracleSelect { min_sequence, .. } => {
                format!("binary_oracle_select:{min_sequence}")
            }
            RedeemKind::OracleEnforcedRefundable { min_sequence, .. } => {
                format!("oracle_enforced_refundable:{min_sequence}")
            }
            RedeemKind::OracleEscrowRefundable { min_sequence, .. } => {
                format!("oracle_escrow_refundable:{min_sequence}")
            }
        }
    }

    /// The `covenant_catalog::CATALOG` id for this kind. The match is exhaustive, so
    /// adding a RedeemKind variant forces giving it a catalog id - and the catalog test
    /// `catalog_has_an_entry_for_every_builder_kind` then forces an actual CATALOG row,
    /// so a deployable kind can never silently go missing from the explorer/wizard.
    pub fn catalog_id(&self) -> &'static str {
        match self {
            RedeemKind::SingleSig { .. } => "p2sh_singlesig",
            RedeemKind::HashLock { .. } => "p2sh_hashlock",
            RedeemKind::Timelock { .. } => "p2sh_timelock",
            RedeemKind::Multisig { .. } => "p2sh_multisig",
            RedeemKind::Htlc { .. } => "p2sh_htlc",
            RedeemKind::Channel { .. } => "p2sh_channel",
            RedeemKind::OracleEnforced { .. } => "oracle_enforced",
            RedeemKind::OracleEscrow { .. } => "oracle_escrow",
            RedeemKind::Deadman { .. } => "p2sh_deadman",
            RedeemKind::RelativeTimelock { .. } => "p2sh_rcsv",
            RedeemKind::TimeDecay { .. } => "p2sh_timedecay",
            RedeemKind::BinaryOracleSelect { .. } => "p2sh_binary_oracle_select",
            RedeemKind::OracleEnforcedRefundable { .. } => "oracle_enforced_refundable",
            RedeemKind::OracleEscrowRefundable { .. } => "oracle_escrow_refundable",
        }
    }
}

/// A covenant's spend-time shape, recovered from the persisted `redeem_kind` string
/// alone (the member pubkeys live in the redeem script, fetched separately). This is the
/// single place the spend `sig_op_count` rule lives: every spend path (custodial /spend,
/// /oracle-payout, and non-custodial prepare-spend) derives the count from here, so the
/// consensus-critical value can never drift between the three handlers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpendKind {
    SingleSig,
    HashLock,
    Timelock { lock_daa: u64 },
    Multisig { total: u8 },
    Htlc { lock_daa: u64 },
    Channel { lock_daa: u64 },
    /// `oracle:N` - the oracle-enforced N-of-N multisig (the oracle is one of the N).
    OracleEnforced { total: u8 },
    OracleEscrow,
    /// `deadman:N` - dead-man's-switch (owner IF branch; heir ELSE branch after lock_daa N).
    Deadman { lock_daa: u64 },
    /// `rcsv:N` - relative timelock; the spend input's sequence must be >= N.
    RelativeTimelock { min_sequence: u64 },
    /// `timedecay:{n}:{req_now}:{req_after}:{lock_daa}` - n members; sig_op_count = 2*n
    /// (two multisigs). The spend handler reads req_now/req_after/lock_daa directly.
    TimeDecay { n: u8 },
    /// `binary_oracle_select:N` - two hashlock branches + a CSV refund. sig_op_count = 3
    /// (one CheckSig per branch); the refund branch needs the spend input's sequence >= N.
    BinaryOracleSelect { min_sequence: u64 },
    /// `oracle_enforced_refundable:N` - the oracle_enforced 2-of-2 wrapped in OP_IF with a CSV
    /// refund ELSE. sig_op_count = 3 (CheckMultiSig counts 2 for [oracle, winner], + 1 refund
    /// CheckSig); the refund branch needs the spend input's sequence >= N.
    OracleEnforcedRefundable { min_sequence: u64 },
    /// `oracle_escrow_refundable:N` - the oracle_escrow logic wrapped in OP_IF with a CSV refund
    /// ELSE. sig_op_count = 4 (oracle CheckSigVerify + player_a CheckSig + player_b CheckSig +
    /// refund CheckSig); the refund branch needs the spend input's sequence >= N.
    OracleEscrowRefundable { min_sequence: u64 },
}

impl SpendKind {
    /// Parse the persisted `redeem_kind` string (e.g. `singlesig`, `multisig:3`,
    /// `channel:8000`, `oracle:2`, `oracle_escrow`). Numeric params ride after ':'.
    /// Returns `None` for an unrecognized or malformed kind.
    pub fn parse(kind_str: &str) -> Option<SpendKind> {
        let (base, param) = kind_str
            .split_once(':')
            .map_or((kind_str, None), |(b, p)| (b, Some(p)));
        match base {
            "singlesig" => Some(SpendKind::SingleSig),
            "hashlock" => Some(SpendKind::HashLock),
            "timelock" => Some(SpendKind::Timelock { lock_daa: param?.parse().ok()? }),
            "multisig" => Some(SpendKind::Multisig { total: param?.parse().ok()? }),
            "htlc" => Some(SpendKind::Htlc { lock_daa: param?.parse().ok()? }),
            "channel" => Some(SpendKind::Channel { lock_daa: param?.parse().ok()? }),
            "oracle" => Some(SpendKind::OracleEnforced {
                total: param.and_then(|s| s.parse().ok()).unwrap_or(2),
            }),
            "oracle_escrow" => Some(SpendKind::OracleEscrow),
            "deadman" => Some(SpendKind::Deadman { lock_daa: param?.parse().ok()? }),
            "rcsv" => Some(SpendKind::RelativeTimelock { min_sequence: param?.parse().ok()? }),
            "timedecay" => Some(SpendKind::TimeDecay { n: param?.split(':').next()?.parse().ok()? }),
            "binary_oracle_select" => {
                Some(SpendKind::BinaryOracleSelect { min_sequence: param?.parse().ok()? })
            }
            "oracle_enforced_refundable" => {
                Some(SpendKind::OracleEnforcedRefundable { min_sequence: param?.parse().ok()? })
            }
            "oracle_escrow_refundable" => {
                Some(SpendKind::OracleEscrowRefundable { min_sequence: param?.parse().ok()? })
            }
            _ => None,
        }
    }

    /// The input `sig_op_count` to commit in the spend's sighash. Kaspa counts a
    /// CheckMultiSig as one sig-op per listed pubkey, and each CheckSig / CheckSigVerify
    /// as one; too low a count is rejected by the node ("script units exceeded").
    pub fn sig_op_count(&self) -> u8 {
        match self {
            SpendKind::SingleSig
            | SpendKind::HashLock
            | SpendKind::Timelock { .. }
            | SpendKind::Htlc { .. } => 1,
            SpendKind::Multisig { total } => *total,
            SpendKind::Channel { .. } => 3,
            SpendKind::OracleEnforced { total } => *total,
            SpendKind::OracleEscrow => 3,
            // IF <owner> CheckSig  ELSE  CLTV <heir> CheckSig  ENDIF = 2 static sig ops.
            SpendKind::Deadman { .. } => 2,
            SpendKind::RelativeTimelock { .. } => 1,
            // IF CheckSig / ELSE IF CheckSig / ELSE CSV CheckSig = 3 static sig ops (one per branch).
            SpendKind::BinaryOracleSelect { .. } => 3,
            // IF [2-of-2 multisig = 2 sig ops] ELSE [CSV refund CheckSig = 1] = 3 static sig ops.
            SpendKind::OracleEnforcedRefundable { .. } => 3,
            // IF [oracle CheckSigVerify + a CheckSig + b CheckSig = 3] ELSE [CSV refund CheckSig = 1] = 4.
            SpendKind::OracleEscrowRefundable { .. } => 4,
            // Two multisigs (IF + ELSE), each counting one sig-op per listed pubkey.
            SpendKind::TimeDecay { n } => 2 * *n,
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

/// Redeem script for a RELATIVE timelock (CSV): `<min_sequence> OpCheckSequenceVerify
/// <xonly> OpCheckSig`. The CSV opcode requires the spend input's `sequence` field to
/// encode a relative lock >= `min_sequence`. Like Kaspa's CLTV, OpCheckSequenceVerify POPS
/// its operand, so there is NO OpDrop. The engine test proves the OPCODE comparison, and a
/// live TN12 e2e CONFIRMED the node enforces the aging delay (BIP68): spending a fresh UTXO
/// is rejected with "one of the transaction sequence locks conditions was not met".
pub fn redeem_relative_timelock(min_sequence: u64, xonly_pubkey: &[u8; 32]) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    b.add_lock_time(min_sequence).map_err(|e| format!("rel-timelock add seq: {e}"))?;
    b.add_op(OpCheckSequenceVerify).map_err(|e| format!("rel-timelock CSV: {e}"))?;
    b.add_data(xonly_pubkey).map_err(|e| format!("rel-timelock pubkey: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("rel-timelock OpCheckSig: {e}"))?;
    Ok(b.drain())
}

/// Redeem script for a BINARY OUTCOME SELECTOR - the per-match unit of a parimutuel
/// bundle. Two hashlock branches gate the two outcomes, and a relative-timelock tail
/// returns the funds if neither secret is ever revealed:
///   `OP_IF  OpBlake2b <h_a> OpEqualVerify <winner_a> OpCheckSig
///    OP_ELSE OP_IF OpBlake2b <h_b> OpEqualVerify <winner_b> OpCheckSig
///            OP_ELSE <min_sequence> OpCheckSequenceVerify <refund> OpCheckSig OP_ENDIF OP_ENDIF`.
/// An outcome oracle commits to H_A, H_B at market creation and reveals EXACTLY ONE secret at
/// resolution: revealing s_A (blake2b256(s_A)==h_a) lets winner_a claim; revealing s_B lets
/// winner_b claim; if the oracle stays silent, the refund key reclaims once the UTXO has aged
/// `min_sequence` units (BIP68, node-enforced). Crucially each branch ALSO requires a specific
/// key's OpCheckSig, so a publicly-revealed secret does NOT let the wrong party take a branch.
/// No Covex key is in the redeem - the chain alone enforces who can spend, so this is pure
/// on-chain. Like CLTV/CSV elsewhere, OpCheckSequenceVerify pops its operand, so NO OpDrop.
pub fn redeem_binary_oracle_select(
    h_a: &[u8; 32],
    winner_a: &[u8; 32],
    h_b: &[u8; 32],
    winner_b: &[u8; 32],
    min_sequence: u64,
    refund: &[u8; 32],
) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    // Branch A (outer IF): reveal preimage of H_A, signed by winner_a.
    b.add_op(OpIf).map_err(|e| format!("bos OpIf(outer): {e}"))?;
    b.add_op(OpBlake2b).map_err(|e| format!("bos OpBlake2b(a): {e}"))?;
    b.add_data(h_a).map_err(|e| format!("bos h_a: {e}"))?;
    b.add_op(OpEqualVerify).map_err(|e| format!("bos OpEqualVerify(a): {e}"))?;
    b.add_data(winner_a).map_err(|e| format!("bos winner_a: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("bos OpCheckSig(a): {e}"))?;
    b.add_op(OpElse).map_err(|e| format!("bos OpElse(outer): {e}"))?;
    // Branch B (inner IF): reveal preimage of H_B, signed by winner_b.
    b.add_op(OpIf).map_err(|e| format!("bos OpIf(inner): {e}"))?;
    b.add_op(OpBlake2b).map_err(|e| format!("bos OpBlake2b(b): {e}"))?;
    b.add_data(h_b).map_err(|e| format!("bos h_b: {e}"))?;
    b.add_op(OpEqualVerify).map_err(|e| format!("bos OpEqualVerify(b): {e}"))?;
    b.add_data(winner_b).map_err(|e| format!("bos winner_b: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("bos OpCheckSig(b): {e}"))?;
    b.add_op(OpElse).map_err(|e| format!("bos OpElse(inner): {e}"))?;
    // Refund (inner ELSE): relative timelock to the refund key.
    b.add_lock_time(min_sequence).map_err(|e| format!("bos add seq: {e}"))?;
    b.add_op(OpCheckSequenceVerify).map_err(|e| format!("bos CSV: {e}"))?;
    b.add_data(refund).map_err(|e| format!("bos refund: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("bos OpCheckSig(refund): {e}"))?;
    b.add_op(OpEndIf).map_err(|e| format!("bos OpEndIf(inner): {e}"))?;
    b.add_op(OpEndIf).map_err(|e| format!("bos OpEndIf(outer): {e}"))?;
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

/// Redeem script for a TIME-DECAYING multisig (threshold relaxes after a timeout):
/// `OP_IF <req_now-of-n multisig> OP_ELSE <lock_daa> OpCheckLockTimeVerify
/// <req_after-of-n multisig> OP_ENDIF`. Before `lock_daa`, `req_now` of the N keys are
/// needed; once the chain reaches `lock_daa`, only `req_after` are (req_after < req_now).
/// Treasury recovery / inheritance: e.g. 3-of-5 normally, 2-of-5 if keyholders are lost.
/// Each branch is a real kaspa-txscript multisig, spliced into the IF/ELSE. Like CLTV
/// elsewhere, OpCheckLockTimeVerify pops its operand, so no OpDrop.
pub fn redeem_timedecay_multisig(
    pubkeys: &[[u8; 32]],
    req_now: usize,
    req_after: usize,
    lock_daa: u64,
) -> BResult<Vec<u8>> {
    let ms_now = redeem_multisig(pubkeys, req_now)?;
    let ms_after = redeem_multisig(pubkeys, req_after)?;
    // Encode the CLTV lock value exactly as redeem_timelock does (a sub-builder), then
    // splice everything into the IF/ELSE around the two multisig sub-scripts.
    let mut ltb = ScriptBuilder::new();
    ltb.add_lock_time(lock_daa).map_err(|e| format!("timedecay add_lock_time: {e}"))?;
    let lt_bytes = ltb.drain();
    let mut r: Vec<u8> = Vec::new();
    r.push(OpIf);
    r.extend_from_slice(&ms_now);
    r.push(OpElse);
    r.extend_from_slice(&lt_bytes);
    r.push(OpCheckLockTimeVerify);
    r.extend_from_slice(&ms_after);
    r.push(OpEndIf);
    Ok(r)
}

/// Build the input `idx` signature_script for a time-decaying multisig spend.
/// `after_timeout`=false takes the IF branch (req_now sigs + OP_TRUE); `after_timeout`=true
/// takes the ELSE branch (req_after sigs + OP_FALSE) and the spend tx must set
/// `lock_time >= lock_daa` with a non-final input sequence. `keypairs` are the signing
/// members IN PUBKEY ORDER (req_now of them for IF, req_after for ELSE).
pub fn build_timedecay_signature_script(
    signable: &SignableTransaction,
    idx: usize,
    keypairs: &[secp256k1::Keypair],
    redeem: &[u8],
    after_timeout: bool,
) -> BResult<Vec<u8>> {
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), idx, SIG_HASH_ALL, &mut reused);
    let msg = secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice())
        .map_err(|e| format!("sighash->msg: {e}"))?;
    let mut satisfier: Vec<u8> = Vec::new();
    for kp in keypairs {
        let sig: [u8; 64] = *kp.sign_schnorr(msg).as_ref();
        satisfier.extend(push65(&sig));
    }
    satisfier.push(if after_timeout { OpFalse } else { OpTrue });
    kaspa_txscript::pay_to_script_hash_signature_script(redeem.to_vec(), satisfier)
        .map_err(|e| format!("timedecay signature script: {e}"))
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

/// Redeem script for a REFUNDABLE oracle-enforced 2-player escrow / game pot. This is the
/// frozen-funds-safe form of redeem_oracle_escrow: the existing oracle-cosigned 2-of-2 logic
/// is wrapped verbatim in an outer OP_IF, and an OP_ELSE relative-timelock (CSV) branch lets
/// the funder reclaim if the oracle ever goes silent (offline, lost key, refuses):
///   `OP_IF <oracle> OpCheckSigVerify OP_IF <player_a> OpCheckSig OP_ELSE <player_b> OpCheckSig OP_ENDIF
///    OP_ELSE <min_sequence> OpCheckSequenceVerify <refund> OpCheckSig OP_ENDIF`.
/// The outer IF (true) branch is byte-for-byte the existing oracle escrow: the chain requires
/// the disclosed oracle's signature AND the winning player's signature on their own sub-branch.
/// The outer ELSE branch returns the pot to the refund key once the UTXO has aged
/// `min_sequence` units (BIP68, node-enforced). Like CLTV/CSV elsewhere in this file,
/// OpCheckSequenceVerify pops its operand, so there is NO OpDrop. The refund branch is signed
/// entirely by the funder in their own wallet - no Covex/oracle key is in the refund path.
pub fn redeem_oracle_escrow_refundable(
    oracle: &[u8; 32],
    player_a: &[u8; 32],
    player_b: &[u8; 32],
    min_sequence: u64,
    refund: &[u8; 32],
) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    // Outer IF (true) = the existing oracle-cosigned 2-of-2, identical to redeem_oracle_escrow.
    b.add_op(OpIf).map_err(|e| format!("escrow_refundable OpIf(outer): {e}"))?;
    b.add_data(oracle).map_err(|e| format!("escrow_refundable oracle: {e}"))?;
    b.add_op(OpCheckSigVerify).map_err(|e| format!("escrow_refundable OpCheckSigVerify: {e}"))?;
    b.add_op(OpIf).map_err(|e| format!("escrow_refundable OpIf(inner): {e}"))?;
    b.add_data(player_a).map_err(|e| format!("escrow_refundable player_a: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("escrow_refundable a OpCheckSig: {e}"))?;
    b.add_op(OpElse).map_err(|e| format!("escrow_refundable OpElse(inner): {e}"))?;
    b.add_data(player_b).map_err(|e| format!("escrow_refundable player_b: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("escrow_refundable b OpCheckSig: {e}"))?;
    b.add_op(OpEndIf).map_err(|e| format!("escrow_refundable OpEndIf(inner): {e}"))?;
    // Outer ELSE = relative-timelock refund to the funder.
    b.add_op(OpElse).map_err(|e| format!("escrow_refundable OpElse(outer): {e}"))?;
    b.add_lock_time(min_sequence).map_err(|e| format!("escrow_refundable add seq: {e}"))?;
    b.add_op(OpCheckSequenceVerify).map_err(|e| format!("escrow_refundable CSV: {e}"))?;
    b.add_data(refund).map_err(|e| format!("escrow_refundable refund: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("escrow_refundable refund OpCheckSig: {e}"))?;
    b.add_op(OpEndIf).map_err(|e| format!("escrow_refundable OpEndIf(outer): {e}"))?;
    Ok(b.drain())
}

/// Redeem script for a REFUNDABLE oracle-enforced payout - the frozen-funds-safe form of
/// the `oracle_enforced` 2-of-2 (oracle + winner). The existing oracle-cosigned 2-of-2 multisig
/// is wrapped verbatim in an outer OP_IF, and an OP_ELSE relative-timelock (CSV) branch lets the
/// funder reclaim if the oracle goes silent:
///   `OP_IF <2-of-2 multisig [oracle, winner]> OP_ELSE <min_sequence> OpCheckSequenceVerify
///    <refund> OpCheckSig OP_ENDIF`.
/// The outer IF (true) branch is byte-for-byte the existing oracle_enforced redeem (a real
/// kaspa-txscript 2-of-2, spliced in as bytes exactly like redeem_timedecay_multisig does), so
/// already-deployed oracle_enforced covenants are untouched. The outer ELSE returns the funds to
/// the refund key once the UTXO has aged `min_sequence` units (BIP68). OpCheckSequenceVerify pops
/// its operand, so NO OpDrop. The refund path is signed entirely by the funder in their own wallet.
pub fn redeem_oracle_enforced_refundable(
    oracle: &[u8; 32],
    winner: &[u8; 32],
    min_sequence: u64,
    refund: &[u8; 32],
) -> BResult<Vec<u8>> {
    // The IF branch is the EXACT bytes of the existing oracle_enforced 2-of-2 multisig.
    let ms = redeem_multisig(&[*oracle, *winner], 2)?;
    // Encode the CSV operand exactly as the other CSV builders do (a sub-builder), then splice
    // everything into the IF/ELSE around the multisig sub-script.
    let mut sb = ScriptBuilder::new();
    sb.add_lock_time(min_sequence).map_err(|e| format!("enforced_refundable add seq: {e}"))?;
    let seq_bytes = sb.drain();
    let mut r: Vec<u8> = Vec::new();
    r.push(OpIf);
    r.extend_from_slice(&ms);
    r.push(OpElse);
    r.extend_from_slice(&seq_bytes);
    r.push(OpCheckSequenceVerify);
    // refund key push (0x20 <32 bytes>) + OpCheckSig.
    let mut rb = ScriptBuilder::new();
    rb.add_data(refund).map_err(|e| format!("enforced_refundable refund: {e}"))?;
    r.extend_from_slice(&rb.drain());
    r.push(OpCheckSig);
    r.push(OpEndIf);
    Ok(r)
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

/// Which branch of a `BinaryOracleSelect` covenant a spend takes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinarySelectBranch {
    /// Outcome A won: reveal the preimage of H_A and sign with winner_a's key.
    RevealA,
    /// Outcome B won: reveal the preimage of H_B and sign with winner_b's key.
    RevealB,
    /// Neither secret revealed: after the relative-timelock the refund key reclaims.
    Refund,
}

/// Build the input `idx` signature_script that spends a `BinaryOracleSelect` covenant.
/// The witness selectors mirror the nested IF/ELSE - the OUTER condition is consumed first
/// so it sits on TOP of the stack (pushed last). Stack order bottom->top:
///   RevealA: <sig_a> <preimage_a> OP_TRUE                  (outer IF taken; inner never runs)
///   RevealB: <sig_b> <preimage_b> OP_TRUE OP_FALSE         (inner TRUE, outer FALSE on top)
///   Refund:  <sig_refund> OP_FALSE OP_FALSE                (spend input.sequence must be >= min_sequence)
/// `keypair` is winner_a (RevealA), winner_b (RevealB), or the refund key (Refund); the
/// preimage is required for the two reveal branches and ignored for the refund.
pub fn build_binary_oracle_select_signature_script(
    signable: &SignableTransaction,
    idx: usize,
    keypair: &secp256k1::Keypair,
    redeem: &[u8],
    branch: BinarySelectBranch,
    preimage: Option<&[u8]>,
) -> BResult<Vec<u8>> {
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), idx, SIG_HASH_ALL, &mut reused);
    let msg = secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice())
        .map_err(|e| format!("sighash->msg: {e}"))?;
    let sig: [u8; 64] = *keypair.sign_schnorr(msg).as_ref();
    let mut satisfier: Vec<u8> = std::iter::once(65u8).chain(sig).chain([SIG_HASH_ALL.to_u8()]).collect();
    let push_preimage = |s: &mut Vec<u8>, label: &str| -> BResult<()> {
        let p = preimage.ok_or_else(|| format!("{label} requires a preimage"))?;
        let mut b = ScriptBuilder::new();
        b.add_data(p).map_err(|e| format!("bos preimage push: {e}"))?;
        s.extend_from_slice(&b.drain());
        Ok(())
    };
    match branch {
        BinarySelectBranch::RevealA => {
            push_preimage(&mut satisfier, "RevealA")?;
            satisfier.push(OpTrue); // outer IF -> branch A (top of stack)
        }
        BinarySelectBranch::RevealB => {
            push_preimage(&mut satisfier, "RevealB")?;
            satisfier.push(OpTrue); // inner IF -> branch B
            satisfier.push(OpFalse); // outer IF -> ELSE (top of stack)
        }
        BinarySelectBranch::Refund => {
            satisfier.push(OpFalse); // inner IF -> ELSE
            satisfier.push(OpFalse); // outer IF -> ELSE (top of stack)
        }
    }
    kaspa_txscript::pay_to_script_hash_signature_script(redeem.to_vec(), satisfier)
        .map_err(|e| format!("binary_oracle_select signature script: {e}"))
}

/// Redeem script for a dead-man's-switch / inheritance covenant:
/// `OP_IF <owner> OpCheckSig OP_ELSE <lock_daa> OpCheckLockTimeVerify <heir> OpCheckSig OP_ENDIF`.
/// IF = the owner can spend (or refresh by re-locking) at ANY time. ELSE = once the chain
/// DAA score reaches `lock_daa`, the heir can claim - so funds pass on if the owner goes
/// silent, while the owner can always reclaim/refresh before then. No oracle, no third party.
pub fn redeem_deadman(owner: &[u8; 32], heir: &[u8; 32], lock_daa: u64) -> BResult<Vec<u8>> {
    let mut b = ScriptBuilder::new();
    b.add_op(OpIf).map_err(|e| format!("deadman OpIf: {e}"))?;
    b.add_data(owner).map_err(|e| format!("deadman owner: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("deadman owner OpCheckSig: {e}"))?;
    b.add_op(OpElse).map_err(|e| format!("deadman OpElse: {e}"))?;
    b.add_lock_time(lock_daa).map_err(|e| format!("deadman add_lock_time: {e}"))?;
    b.add_op(OpCheckLockTimeVerify).map_err(|e| format!("deadman CLTV: {e}"))?;
    b.add_data(heir).map_err(|e| format!("deadman heir: {e}"))?;
    b.add_op(OpCheckSig).map_err(|e| format!("deadman heir OpCheckSig: {e}"))?;
    b.add_op(OpEndIf).map_err(|e| format!("deadman OpEndIf: {e}"))?;
    Ok(b.drain())
}

/// Build the input `idx` signature_script that spends a dead-man's-switch.
/// `owner_branch`=true takes the IF branch (owner spends anytime: satisfier sig, OP_TRUE).
/// `owner_branch`=false takes the ELSE branch (heir claims after the timelock: satisfier
/// sig, OP_FALSE) - the spend tx must then set lock_time >= lock_daa and a non-final
/// sequence. `keypair` is the owner (IF) or the heir (ELSE) key.
pub fn build_deadman_signature_script(
    signable: &SignableTransaction,
    idx: usize,
    keypair: &secp256k1::Keypair,
    redeem: &[u8],
    owner_branch: bool,
) -> BResult<Vec<u8>> {
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), idx, SIG_HASH_ALL, &mut reused);
    let msg = secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice())
        .map_err(|e| format!("sighash->msg: {e}"))?;
    let sig: [u8; 64] = *keypair.sign_schnorr(msg).as_ref();
    let mut satisfier: Vec<u8> = std::iter::once(65u8).chain(sig).chain([SIG_HASH_ALL.to_u8()]).collect();
    satisfier.push(if owner_branch { OpTrue } else { OpFalse });
    kaspa_txscript::pay_to_script_hash_signature_script(redeem.to_vec(), satisfier)
        .map_err(|e| format!("deadman signature script: {e}"))
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
    // Oracle kinds only (oracle_enforced / oracle_escrow): the SERVER-produced oracle
    // partial signature over the SAME sighash the winner signed. None for the 8 plain
    // primitives. The oracle key never leaves the server and the winner key never reaches
    // it - the satisfier is the only place the two halves meet.
    oracle_sig: Option<&[u8; 64]>,
    // For oracle_escrow / binary_oracle_select: true = the winner is player/outcome A (the
    // IF branch), false = player/outcome B (the ELSE branch). Ignored by oracle_enforced
    // (a flat 2-of-2 with no branch) and the 8 plain primitives.
    winner_is_a: bool,
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
        "singlesig" | "timelock" | "rcsv" => {
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
        "deadman" => {
            // owner (IF, default) = owner sig + OP_TRUE; heir (ELSE, after lock_daa) = heir sig + OP_FALSE.
            satisfier.extend(push65(need_solo()?));
            satisfier.push(if branch_refund { OpFalse } else { OpTrue });
        }
        // ── Oracle co-sign keystone (non-custodial). The 2 sig halves meet HERE: the WINNER
        // sig came from the browser (solo / sigs), the ORACLE sig was produced server-side
        // over the SAME sighash (which commits the winner output, so the winner cannot
        // redirect the funds). Byte layout is IDENTICAL to the custodial build_* builders. ──
        "oracle" | "oracle_enforced" => {
            // redeem = multisig([oracle, winner], 2). OpCheckMultiSig pops sigs in pubkey
            // (script) order, so push oracle first then winner. members = [oracle, winner].
            let osig = oracle_sig.ok_or_else(|| "oracle payout needs the server oracle signature".to_string())?;
            satisfier.extend(push65(osig));
            // The winner's browser signature, keyed by the second member's x-only pubkey,
            // or supplied as the solo signature.
            let winner_pk = members.get(1).ok_or_else(|| "oracle redeem missing the winner pubkey".to_string())?;
            let wsig = sig_for(winner_pk).or_else(|| solo.copied())
                .ok_or_else(|| "oracle payout needs the winner's browser signature".to_string())?;
            satisfier.extend(push65(&wsig));
        }
        "oracle_escrow" => {
            // satisfier bottom->top = <winner_player_sig> <branch_selector> <oracle_sig>.
            // members (checksig_only) = [oracle, player_a, player_b]; the leading oracle push
            // is followed by OpCheckSigVerify so it IS included, hence the player keys are at
            // indices 1 and 2.
            let osig = oracle_sig.ok_or_else(|| "oracle_escrow payout needs the server oracle signature".to_string())?;
            let winner_pk = members.get(if winner_is_a { 1 } else { 2 })
                .ok_or_else(|| "oracle_escrow redeem missing the winning player's pubkey".to_string())?;
            let wsig = sig_for(winner_pk).or_else(|| solo.copied())
                .ok_or_else(|| "oracle_escrow payout needs the winning player's browser signature".to_string())?;
            satisfier.extend(push65(&wsig));
            satisfier.push(if winner_is_a { OpTrue } else { OpFalse });
            satisfier.extend(push65(osig));
        }
        // ── Refundable oracle kinds. Outer OP_IF (true) = the existing oracle-cosigned claim
        // path (byte-identical layout to the non-refundable kinds, then OP_TRUE selects the outer
        // IF). Outer OP_ELSE (branch_refund=true) = a CSV refund signed ENTIRELY by the funder in
        // their own wallet (no oracle, no Covex key): refund sig then OP_FALSE selects the ELSE,
        // and the spend input's sequence must be >= the redeem's min_sequence (BIP68). ──
        "oracle_enforced_refundable" => {
            if branch_refund {
                // Outer ELSE: <refund_sig> OP_FALSE. members[2] is the refund key (after the
                // 2-of-2 multisig's [oracle, winner]); accept solo for the funder's wallet sig.
                let rsig = members.get(2).and_then(|p| sig_for(p)).or_else(|| solo.copied()).ok_or_else(|| {
                    "oracle_enforced_refundable refund needs the funder/refund key signature".to_string()
                })?;
                satisfier.extend(push65(&rsig));
                satisfier.push(OpFalse);
            } else {
                // Outer IF: the existing oracle_enforced 2-of-2 [oracle, winner], then OP_TRUE.
                // OpCheckMultiSig pops sigs in pubkey (script) order: oracle first, then winner.
                let osig = oracle_sig.ok_or_else(|| {
                    "oracle_enforced_refundable payout needs the server oracle signature".to_string()
                })?;
                satisfier.extend(push65(osig));
                let winner_pk = members.get(1).ok_or_else(|| {
                    "oracle_enforced_refundable redeem missing the winner pubkey".to_string()
                })?;
                let wsig = sig_for(winner_pk).or_else(|| solo.copied()).ok_or_else(|| {
                    "oracle_enforced_refundable payout needs the winner's browser signature".to_string()
                })?;
                satisfier.extend(push65(&wsig));
                satisfier.push(OpTrue);
            }
        }
        "oracle_escrow_refundable" => {
            if branch_refund {
                // Outer ELSE: <refund_sig> OP_FALSE. members (checksig_only) =
                // [oracle, player_a, player_b, refund]; members[3] is the refund key. Accept solo.
                let rsig = members.get(3).and_then(|p| sig_for(p)).or_else(|| solo.copied()).ok_or_else(|| {
                    "oracle_escrow_refundable refund needs the funder/refund key signature".to_string()
                })?;
                satisfier.extend(push65(&rsig));
                satisfier.push(OpFalse);
            } else {
                // Outer IF: the existing oracle_escrow layout, then OP_TRUE for the outer IF.
                // bottom->top = <winner_sig> <inner_branch_selector> <oracle_sig> <OP_TRUE>.
                let osig = oracle_sig.ok_or_else(|| {
                    "oracle_escrow_refundable payout needs the server oracle signature".to_string()
                })?;
                let winner_pk = members.get(if winner_is_a { 1 } else { 2 }).ok_or_else(|| {
                    "oracle_escrow_refundable redeem missing the winning player's pubkey".to_string()
                })?;
                let wsig = sig_for(winner_pk).or_else(|| solo.copied()).ok_or_else(|| {
                    "oracle_escrow_refundable payout needs the winning player's browser signature".to_string()
                })?;
                satisfier.extend(push65(&wsig));
                satisfier.push(if winner_is_a { OpTrue } else { OpFalse });
                satisfier.extend(push65(osig));
                satisfier.push(OpTrue);
            }
        }
        // ── Binary outcome selector (the parimutuel-bundle leg), winner-only NON-CUSTODIAL.
        // No Covex key is ever in this path: the bettor signs the leg in their own browser and
        // only the 64-byte signature is sent. members (checksig_only) = [winner_a, winner_b,
        // refund]. The branch is carried in the existing bool params (mirroring oracle_escrow):
        //   RevealA  = branch_refund=false, winner_is_a=true   -> <sig_a> <preimage> OP_TRUE
        //   RevealB  = branch_refund=false, winner_is_a=false  -> <sig_b> <preimage> OP_TRUE OP_FALSE
        //   Refund   = branch_refund=true                      -> <sig_refund> OP_FALSE OP_FALSE
        // Byte layout is IDENTICAL to build_binary_oracle_select_signature_script (@731). The
        // on-chain OpCheckSig in each branch is the real enforcer (a public secret cannot let the
        // wrong key sweep), and we ALSO fail closed here: the signature must be supplied under the
        // branch's NAMED member pubkey (or as solo for that same key), so a wrong claimer cannot
        // assemble a script that reorders the branches. ──
        "binary_oracle_select" => {
            // Defense-in-depth: this redeem always exposes exactly [winner_a, winner_b, refund];
            // reject any other count so a redeem-parse miscount can never route to a wrong key.
            if members.len() != 3 {
                return Err(format!(
                    "binary_oracle_select redeem must expose exactly 3 keys, found {}",
                    members.len()
                ));
            }
            // The branch's named key index in members: RevealA -> 0 (winner_a), RevealB -> 1
            // (winner_b), Refund -> 2 (refund). winner_is_a selects A vs B for the reveal arms.
            let (named_idx, branch_label) = if branch_refund {
                (2usize, "refund")
            } else if winner_is_a {
                (0usize, "outcome A")
            } else {
                (1usize, "outcome B")
            };
            let named_pk = members.get(named_idx).ok_or_else(|| {
                format!("binary_oracle_select redeem missing the {branch_label} key")
            })?;
            // FAIL CLOSED: require the signature under the branch's NAMED pubkey. We accept a
            // solo signature only when no per-member map is present (single-signer wallet flow);
            // if a sigs map is present it MUST contain the named key (a wrong-key entry is
            // rejected here, not silently dropped, so a loser cannot mis-route the claim).
            let bsig = match sig_for(named_pk) {
                Some(s) => s,
                None => {
                    if sigs.is_empty() {
                        *solo.ok_or_else(|| {
                            format!("binary_oracle_select {branch_label} needs the {branch_label} key signature (signature_hex)")
                        })?
                    } else {
                        return Err(format!(
                            "binary_oracle_select {branch_label} requires the {branch_label} key's signature; the supplied signatures do not include it"
                        ));
                    }
                }
            };
            if branch_refund {
                // Refund: <sig_refund> OP_FALSE (inner ELSE) OP_FALSE (outer ELSE, top of stack).
                satisfier.extend(push65(&bsig));
                satisfier.push(OpFalse);
                satisfier.push(OpFalse);
            } else {
                // Reveal: <sig> <preimage> then the branch selector(s).
                let p = preimage.ok_or_else(|| {
                    format!("binary_oracle_select {branch_label} reveal requires preimage_hex (the revealed secret)")
                })?;
                satisfier.extend(push65(&bsig));
                satisfier.extend(preimage_push(p)?);
                // RevealA: OP_TRUE alone (outer IF taken). RevealB: OP_TRUE selects the inner IF,
                // then OP_FALSE on top selects the outer ELSE. Mirrors the custodial builder.
                satisfier.push(OpTrue);
                if !winner_is_a {
                    satisfier.push(OpFalse); // outer IF -> ELSE (top of stack)
                }
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
    // NON-CUSTODIAL KEYSTONE (security): the server must NEVER accept a raw MAINNET private key.
    // Mainnet signing is non-custodial only: the key signs the sighash in the browser via the
    // prepare/submit flow. Accepting a raw mainnet key here would be the backend half of a custody
    // breach (the advertised "your key never leaves your device" guarantee). Refuse it; testnet
    // dev/demo flows are unaffected.
    if (network == "mainnet" || network == "mainnet-1") && !use_dev_mode && !private_key_hex.trim().is_empty() {
        return Err(
            "mainnet signing is non-custodial: do not send a private key to the server. Use the prepare/submit flow so your key signs in your browser.".into(),
        );
    }
    let (hexkey, address) = if use_dev_mode {
        // Dev-deployer keys come from the environment (never source); `?` surfaces a
        // clear error if the env var is missing.
        if addr == dev_wallets::DEV_WALLET_2_ADDRESS_TN12 || addr == dev_wallets::DEV_WALLET_2_ADDRESS_TN10 {
            let a = if network == "testnet-10" {
                dev_wallets::DEV_WALLET_2_ADDRESS_TN10
            } else {
                dev_wallets::DEV_WALLET_2_ADDRESS_TN12
            };
            (dev_wallets::dev_private_key(2, network)?, a.to_string())
        } else {
            let a = if network == "testnet-10" {
                dev_wallets::DEV_WALLET_1_ADDRESS_TN10
            } else {
                dev_wallets::DEV_WALLET_1_ADDRESS_TN12
            };
            (dev_wallets::dev_private_key(1, network)?, a.to_string())
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
    /// timedecay only: the relaxed threshold that applies after lock_daa (< `required`).
    #[serde(default)]
    pub req_after: Option<usize>,
    /// htlc/timelock: absolute DAA lock (htlc refund branch / timelock).
    /// htlc only: the receiver (claim) and sender (refund) x-only pubkeys. If absent
    /// in dev mode, receiver=dev wallet 2, sender=dev wallet 1.
    #[serde(default)]
    pub receiver_pubkey_hex: Option<String>,
    #[serde(default)]
    pub sender_pubkey_hex: Option<String>,
    /// binary_oracle_select only: outcome B's secret preimage (H_B = blake2b256 of it).
    /// preimage_hex is reused for outcome A. NEVER stored - re-supplied at spend.
    #[serde(default)]
    pub preimage_b_hex: Option<String>,
    /// binary_oracle_select only: the refund key that reclaims after the CSV delay if the
    /// oracle never reveals a secret. Defaults to the deployer.
    #[serde(default)]
    pub refund_pubkey_hex: Option<String>,
}

/// The two testnet dev-wallet secret keys for a network (used as default multisig
/// members and signers in dev-mode demos). Never reachable on mainnet.
fn dev_keys(network: &str) -> BResult<Vec<[u8; 32]>> {
    // Read both dev-deployer keys from the environment (never source).
    let k1 = dev_wallets::dev_private_key(1, network)?;
    let k2 = dev_wallets::dev_private_key(2, network)?;
    let dec = |h: &str| -> BResult<[u8; 32]> {
        hex::decode(h.trim()).ok().and_then(|b| b.try_into().ok()).ok_or_else(|| "bad dev key".to_string())
    };
    Ok(vec![dec(k1.as_str())?, dec(k2.as_str())?])
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
    Extension(db): Extension<db::Db>,
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
        "deadman" => {
            // Dead-man's-switch / inheritance: the DEPLOYER is the owner (spends/refreshes
            // anytime); pubkeys_hex=[heir] claims the funds only after lock_daa. No oracle.
            let heir = if let Some(pks) = &req.redeem.pubkeys_hex {
                match pks.first() {
                    Some(h) => match decode_xonly_hex(h) {
                        Ok(x) => x,
                        Err(e) => return err(e),
                    },
                    None => return err("deadman requires pubkeys_hex=[heir]".into()),
                }
            } else if req.use_dev_mode {
                match dev_keys(&req.network) {
                    Ok(ks) => match xonly_from_seckey(&ks[1]) {
                        Ok(x) => x,
                        Err(e) => return err(e),
                    },
                    Err(e) => return err(e),
                }
            } else {
                return err("deadman requires pubkeys_hex=[heir] (or use_dev_mode for the 2nd dev wallet)".into());
            };
            let lock_daa = match req.redeem.lock_daa {
                Some(d) => d,
                None => return err("deadman requires lock_daa (the inheritance deadline)".into()),
            };
            RedeemKind::Deadman { owner: xonly, heir, lock_daa }
        }
        "relative_timelock" => {
            // Relative timelock (CSV; node-enforced). Reuses the lock_daa request field as the
            // required min_sequence; the owner is the deployer.
            let min_sequence = match req.redeem.lock_daa {
                Some(d) => d,
                None => return err("relative_timelock requires lock_daa (used as min_sequence)".into()),
            };
            RedeemKind::RelativeTimelock { min_sequence, xonly_pubkey: xonly }
        }
        "timedecay" => {
            // Time-decaying multisig: pubkeys_hex = the n members; `required` = req_now;
            // `req_after` = the relaxed threshold after lock_daa. dev mode uses the two
            // dev wallets (n=2). Engine-proven; spends via the non-default custodial arm.
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
                return err("timedecay requires pubkeys_hex (or use_dev_mode for the two dev wallets)".into());
            };
            let req_now = req.redeem.required.unwrap_or(pubkeys.len());
            let req_after = match req.redeem.req_after {
                Some(r) => r,
                None => return err("timedecay requires req_after (the relaxed threshold valid after lock_daa)".into()),
            };
            let lock_daa = match req.redeem.lock_daa {
                Some(d) => d,
                None => return err("timedecay requires lock_daa (when the relaxed threshold activates)".into()),
            };
            if req_after == 0 || req_now == 0 || req_after > pubkeys.len() || req_now > pubkeys.len() {
                return err("timedecay thresholds must satisfy 0 < req_after,req_now <= n".into());
            }
            RedeemKind::TimeDecay { pubkeys, req_now, req_after, lock_daa }
        }
        "binary_oracle_select" => {
            // Parimutuel bundle unit: two hashlock branches (winner_a on H_A, winner_b on
            // H_B) + a CSV refund. preimage_hex -> H_A, preimage_b_hex -> H_B. Winners from
            // pubkeys_hex=[winner_a, winner_b] (or the two dev wallets); refund from
            // refund_pubkey_hex (or the deployer). lock_daa = the relative-timelock min_sequence.
            let pa_hex = match &req.redeem.preimage_hex {
                Some(p) => p,
                None => return err("binary_oracle_select requires preimage_hex (outcome A secret)".into()),
            };
            let pb_hex = match &req.redeem.preimage_b_hex {
                Some(p) => p,
                None => return err("binary_oracle_select requires preimage_b_hex (outcome B secret)".into()),
            };
            let pa = match hex::decode(pa_hex.trim()) {
                Ok(b) => b,
                Err(e) => return err(format!("bad preimage_hex: {e}")),
            };
            let pb = match hex::decode(pb_hex.trim()) {
                Ok(b) => b,
                Err(e) => return err(format!("bad preimage_b_hex: {e}")),
            };
            let h_a = blake2b256(&pa);
            let h_b = blake2b256(&pb);
            let (winner_a, winner_b) = if let Some(pks) = &req.redeem.pubkeys_hex {
                if pks.len() >= 2 {
                    match (decode_xonly_hex(&pks[0]), decode_xonly_hex(&pks[1])) {
                        (Ok(a), Ok(b)) => (a, b),
                        (Err(e), _) | (_, Err(e)) => return err(e),
                    }
                } else {
                    return err("binary_oracle_select needs pubkeys_hex=[winner_a, winner_b]".into());
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
                return err("binary_oracle_select requires pubkeys_hex=[winner_a, winner_b] (or use_dev_mode)".into());
            };
            let refund = if let Some(r) = &req.redeem.refund_pubkey_hex {
                match decode_xonly_hex(r) {
                    Ok(x) => x,
                    Err(e) => return err(e),
                }
            } else {
                // Default: the deployer reclaims if the oracle never reveals.
                xonly
            };
            let min_sequence = match req.redeem.lock_daa {
                Some(d) => d,
                None => return err("binary_oracle_select requires lock_daa (used as the CSV refund min_sequence)".into()),
            };
            RedeemKind::BinaryOracleSelect { h_a, winner_a, h_b, winner_b, min_sequence, refund }
        }
        other => return err(format!(
            "unknown redeem kind '{other}' (singlesig|hashlock|timelock|multisig|htlc|oracle_enforced|oracle_escrow|channel|deadman|relative_timelock|timedecay|binary_oracle_select)"
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
            // Honest description (roadmap B4/B6). Every kind except the parimutuel leg is a
            // pure script-enforced covenant, so the generic "Script-enforced" wording is true
            // for them. A binary_oracle_select leg's custody and payouts ARE on-chain, but
            // which branch wins is set by the secret the disclosed oracle reveals, so calling
            // it bare "Script-enforced" would hide that residue. State it plainly instead.
            let summary = if req.redeem.kind == "binary_oracle_select" {
                format!(
                    "Parimutuel market leg: two hashlock payout branches plus a CSV refund. \
                     Custody and payouts are on-chain; which branch wins is set by the secret \
                     the disclosed Covex oracle reveals. {} KAS locked",
                    stake_sompi as f64 / 1e8
                )
            } else {
                format!("Script-enforced {} covenant, {} KAS locked", req.redeem.kind, stake_sompi as f64 / 1e8)
            };
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
    /// timedecay only: "now" (the req_now-of-n IF branch, default) or "after" (the
    /// relaxed req_after-of-n ELSE branch, valid once lock_daa is reached).
    #[serde(default)]
    pub timedecay_mode: Option<String>,
    /// binary_oracle_select only: "reveal_a" (outcome A won, default) | "reveal_b"
    /// (outcome B won) | "refund" (no secret revealed, reclaim after the CSV delay).
    /// Reveal branches need preimage_hex (the revealed secret) and the winner's key.
    #[serde(default)]
    pub select_mode: Option<String>,
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
    Extension(db): Extension<db::Db>,
    Json(req): Json<P2shSpendRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));

    // NON-CUSTODIAL KEYSTONE: never accept a raw MAINNET private key on the spend path either.
    // Mainnet redeem is non-custodial (the key signs the sighash in the browser); a raw mainnet
    // key here would be the backend half of a custody breach. Testnet dev/demo flows are unaffected.
    if (req.network == "mainnet" || req.network == "mainnet-1")
        && !req.use_dev_mode
        && !req.private_key_hex.trim().is_empty()
    {
        return err("mainnet signing is non-custodial: do not send a private key to the server. Use the prepare/submit flow so your key signs in your browser.".into());
    }

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
    // Time-decaying multisig: kind = "timedecay:{n}:{req_now}:{req_after}:{lock_daa}".
    // "now" spends the req_now-of-n IF branch; "after" spends the relaxed req_after-of-n
    // ELSE branch (valid once lock_daa is reached - it carries the tx lock_time).
    let is_timedecay = cov.redeem_kind.starts_with("timedecay:");
    let td_parts: Vec<u64> = cov
        .redeem_kind
        .strip_prefix("timedecay:")
        .map(|s| s.split(':').filter_map(|x| x.parse::<u64>().ok()).collect())
        .unwrap_or_default();
    let td_req_now = td_parts.get(1).copied().unwrap_or(1) as usize;
    let td_req_after = td_parts.get(2).copied().unwrap_or(1) as usize;
    let td_lock_daa = td_parts.get(3).copied().unwrap_or(0);
    let td_after = req.timedecay_mode.as_deref() == Some("after");
    // Binary outcome selector: kind = "binary_oracle_select:{min_sequence}". reveal_a/reveal_b
    // claim a hashlock branch (preimage + the named winner's sig); refund reclaims via the CSV
    // branch once the input has aged min_sequence units.
    let is_binary_select = cov.redeem_kind.starts_with("binary_oracle_select:");
    let bos_min_seq: u64 = cov
        .redeem_kind
        .strip_prefix("binary_oracle_select:")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let bos_branch = match req.select_mode.as_deref() {
        Some("reveal_b") => BinarySelectBranch::RevealB,
        Some("refund") => BinarySelectBranch::Refund,
        _ => BinarySelectBranch::RevealA,
    };

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
    } else if is_timedecay {
        // The present members sign (req_now of n for "now", req_after for "after").
        // Explicit via signer_keys_hex, else the dev wallets. The sig-script arm slices
        // this to the branch's required count.
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
            return err("timedecay spend requires signer_keys_hex (or use_dev_mode)".into());
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
    } else if is_binary_select {
        // The branch's named key signs: reveal_a => winner_a, reveal_b => winner_b,
        // refund => the refund key. Explicit via private_key_hex / signer_keys_hex[0];
        // dev mode maps reveal_a + refund to dev wallet 1 (deployer), reveal_b to dev wallet 2.
        let explicit = req
            .signer_keys_hex
            .as_ref()
            .and_then(|v| v.first())
            .cloned()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| if req.private_key_hex.trim().is_empty() { None } else { Some(req.private_key_hex.clone()) });
        let bytes: [u8; 32] = if let Some(s) = explicit {
            match hex::decode(s.trim().trim_start_matches("0x")).ok().and_then(|b| b.try_into().ok()) {
                Some(b) => b,
                None => return err("bad binary_oracle_select signer key (need 64 hex chars)".into()),
            }
        } else if req.use_dev_mode {
            match dev_keys(&req.network) {
                Ok(ks) => {
                    // Pick the dev key whose x-only pubkey matches THIS branch's named winner,
                    // so a bundle leg won by either dev wallet settles in dev mode. The redeem
                    // layout is fixed: winner_a = redeem[37..69], winner_b = redeem[108..140].
                    let want: Option<[u8; 32]> = match bos_branch {
                        BinarySelectBranch::RevealA => redeem.get(37..69).and_then(|s| s.try_into().ok()),
                        BinarySelectBranch::RevealB => redeem.get(108..140).and_then(|s| s.try_into().ok()),
                        BinarySelectBranch::Refund => None,
                    };
                    want.and_then(|w| ks.iter().copied().find(|k| xonly_from_seckey(k).map(|x| x == w).unwrap_or(false)))
                        .unwrap_or(ks[0])
                }
                Err(e) => return err(e),
            }
        } else {
            return err("binary_oracle_select spend requires the branch key (private_key_hex) or use_dev_mode".into());
        };
        match secp256k1::Keypair::from_seckey_slice(secp256k1::SECP256K1, &bytes) {
            Ok(k) => vec![k],
            Err(e) => return err(format!("bad key: {e}")),
        }
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

    // For a relative timelock (rcsv:N), the spend input's sequence must satisfy
    // OpCheckSequenceVerify (input.sequence >= N). Every other kind uses 0 (non-final).
    let spend_sequence: u64 = if is_binary_select && matches!(bos_branch, BinarySelectBranch::Refund) {
        bos_min_seq // CSV refund branch: input.sequence must satisfy OpCheckSequenceVerify
    } else {
        cov.redeem_kind.strip_prefix("rcsv:").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0)
    };
    let inputs = vec![TransactionInput {
        previous_outpoint: TransactionOutpoint {
            transaction_id: utxo.outpoint.transaction_id,
            index: utxo.outpoint.index,
        },
        signature_script: vec![],
        sequence: spend_sequence, // rcsv: satisfies OpCheckSequenceVerify; others 0 (non-final)
        // Kaspa counts a CheckMultiSig as one sig-op per listed pubkey; the declared
        // count must cover the redeem's actual sig ops or the node rejects with
        // "script units exceeded". The channel redeem has 3 sig ops across its branches
        // (CheckSigVerify + CheckSig in IF, CheckSig in ELSE). Single-key redeems use 1.
        sig_op_count: SpendKind::parse(&cov.redeem_kind).map_or(1, |k| k.sig_op_count()),
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
        .or(if is_timedecay && td_after { Some(td_lock_daa) } else { None })
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
    } else if is_timedecay {
        let take = if td_after { td_req_after } else { td_req_now };
        if keypairs.len() < take {
            return err(format!(
                "timedecay {} branch needs {} signer key(s), got {}",
                if td_after { "after" } else { "now" },
                take,
                keypairs.len()
            ));
        }
        match build_timedecay_signature_script(&signable, 0, &keypairs[..take], &redeem, td_after) {
            Ok(s) => s,
            Err(e) => return err(format!("build timedecay spend script: {e}")),
        }
    } else if is_binary_select {
        let preimage: Option<Vec<u8>> = match bos_branch {
            BinarySelectBranch::Refund => None,
            _ => match &req.preimage_hex {
                Some(p) => match hex::decode(p.trim()) {
                    Ok(b) => Some(b),
                    Err(e) => return err(format!("bad preimage_hex: {e}")),
                },
                None => return err("binary_oracle_select reveal requires preimage_hex (the revealed secret)".into()),
            },
        };
        match build_binary_oracle_select_signature_script(&signable, 0, &keypairs[0], &redeem, bos_branch, preimage.as_deref()) {
            Ok(s) => s,
            Err(e) => return err(format!("build binary_oracle_select spend script: {e}")),
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
pub(crate) fn game_pot_outcome(db: &db::Db, pot_tx: &str) -> GamePot {
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
    Extension(db): Extension<db::Db>,
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
        sig_op_count: SpendKind::parse(&cov.redeem_kind).map_or(2, |k| k.sig_op_count()),
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

// ── NON-CUSTODIAL ORACLE CO-SIGN KEYSTONE ───────────────────────────────────────────
// The oracle-enforced kinds (oracle_enforced / oracle_escrow) need TWO signatures over the
// same spend sighash: the disclosed oracle's (server-held, by design - it co-signs ONLY a
// verified outcome) and the WINNER's. On mainnet the winner key may NOT touch the server
// (resolve_signing_key rejects raw/dev keys there), so the custodial oracle_payout_handler
// cannot release these on mainnet. This pair of handlers fixes that:
//   prepare-oracle-payout: runs the EXISTING outcome gate (unchanged), builds the unsigned
//     spend whose ONLY output pays the verified winner, produces ONLY the oracle partial
//     signature over that sighash, and returns {sighash, oracle_sig, winner_xonly} so the
//     winner signs their half in the browser.
//   submit-oracle-payout: takes the winner's browser signature, assembles it WITH the stored
//     oracle partial-sig into the satisfier, and broadcasts.
// The server never holds or uses the winner key. Because the oracle signs over a sighash
// that COMMITS the single winner output, a winner cannot redirect the funds: changing the
// destination changes the sighash, which invalidates the oracle's signature. binary_oracle_
// select carries NO oracle key (pure on-chain), so it does NOT route through here; its
// non-custodial winner-only spend is a separate (still-pending) extension of the plain
// /covenant/p2sh/prepare-spend flow, and its custodial spend already works today.
struct PendingOraclePayout {
    network: String,
    unsigned_tx: Transaction,
    entry: UtxoEntry,
    redeem: Vec<u8>,
    /// The covenant's deploy tx_id, so submit can mark it spent.
    deploy_tx_id: String,
    /// "oracle_enforced" | "oracle_escrow" - selects the satisfier layout.
    kind_base: String,
    /// The oracle's partial signature over the prepared sighash (server-produced; the
    /// oracle key is gone from memory after this). 64-byte BIP340.
    oracle_sig: [u8; 64],
    /// Member x-only pubkeys parsed from the redeem in script order: oracle_enforced =
    /// [oracle, winner]; oracle_escrow = [oracle, player_a, player_b].
    member_pubkeys: Vec<[u8; 32]>,
    /// The winner side: true = player A (IF branch), false = player B (ELSE). Drives the
    /// oracle_escrow branch selector. oracle_enforced ignores it (flat 2-of-2).
    winner_is_a: bool,
    /// The x-only pubkey the winner's browser signature must come from (the winner member).
    winner_xonly: [u8; 32],
    created_at: i64,
}

fn oracle_payout_sessions() -> &'static Mutex<std::collections::HashMap<String, PendingOraclePayout>> {
    static S: std::sync::OnceLock<Mutex<std::collections::HashMap<String, PendingOraclePayout>>> =
        std::sync::OnceLock::new();
    S.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

#[derive(Deserialize)]
pub struct PrepareOraclePayoutRequest {
    #[serde(default = "default_network")]
    pub network: String,
    /// The deploy tx id of the oracle_enforced / oracle_escrow covenant.
    pub deploy_tx_id: String,
    /// The verified winner's payout address. The oracle signs a sighash committing the
    /// single output that pays THIS address, so it cannot be redirected after signing.
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

/// POST /covenant/oracle-payout/prepare - the non-custodial half of an oracle co-sign.
/// Runs the SAME outcome gate as oracle_payout_handler (game-pot re-derivation + crypto-proof
/// gate + verify_proof_for_circuit), then produces ONLY the oracle's signature over the spend
/// sighash that commits the winner output. Returns the sighash + oracle partial-sig so the
/// winner signs their half in the browser. The server never sees the winner key.
pub async fn prepare_oracle_payout_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<PrepareOraclePayoutRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));

    let cov = match db::get_p2sh_covenant(&db, &req.deploy_tx_id) {
        Some(c) => c,
        None => return err(format!("no covenant for {}", req.deploy_tx_id)),
    };
    if !cov.redeem_kind.starts_with("oracle") {
        return err("not an oracle-enforced covenant (deploy with redeem.kind=oracle_enforced or oracle_escrow). For binary_oracle_select use the plain /covenant/p2sh/prepare-spend flow.".into());
    }
    let is_escrow = cov.redeem_kind == "oracle_escrow";
    if let Some(s) = &cov.spent_tx_id {
        return err(format!("already paid out in {s}"));
    }

    // GAME-POT GATE (identical to oracle_payout_handler): if this covenant is a skill_games
    // pot, the winning side is server-authoritative, NOT client-controlled.
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

    // NON-GAME ATTESTED GATE (identical to oracle_payout_handler): for a non-game covenant the
    // oracle co-signs ONLY when the circuit does real Groth16 verification.
    if !is_game_pot && !crate::oracle_verifier::circuit_requires_crypto_proof(&req.circuit_type) {
        return err(format!(
            "oracle declines to co-sign a non-game payout for attested circuit '{}': only a server-resolved game pot, or a real Groth16 proof (a Strict/Hybrid circuit), authorises a covenant payout",
            req.circuit_type
        ));
    }

    // 0 -> player A (IF), 1 -> player B (ELSE). Same convention as the custodial handler.
    let winner_is_a = effective_outcome != Some(1);

    // THE ORACLE GATE (unchanged): verify the outcome before producing the oracle signature.
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
    // Member pubkeys in script order. oracle_enforced = multisig([oracle, winner]) -> every
    // 0x20<32> push (checksig_only=false). oracle_escrow = [oracle, player_a, player_b] -
    // each is directly followed by a checksig(verify), so checksig_only=true keeps all three.
    let member_pubkeys: Vec<[u8; 32]> = parse_redeem_pubkeys(&redeem, is_escrow);
    // The winner member: oracle_enforced -> index 1 (after oracle); oracle_escrow -> player A
    // at index 1 or player B at index 2.
    let winner_idx = if is_escrow { if winner_is_a { 1 } else { 2 } } else { 1 };
    let winner_xonly = match member_pubkeys.get(winner_idx) {
        Some(pk) => *pk,
        None => return err("could not locate the winner pubkey in the stored redeem".into()),
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
        sig_op_count: SpendKind::parse(&cov.redeem_kind).map_or(if is_escrow { 3 } else { 2 }, |k| k.sig_op_count()),
    }];
    // The SOLE output pays the verified winner. The oracle signs the sighash over THIS exact
    // output set, so a winner who later tries to redirect funds changes the sighash and voids
    // the oracle signature - the chain then rejects the spend.
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
    let entry = UtxoEntry {
        amount,
        script_public_key: p2sh_spk,
        block_daa_score: utxo.utxo_entry.block_daa_score,
        is_coinbase: utxo.utxo_entry.is_coinbase,
    };
    let signable = SignableTransaction::with_entries(unsigned.clone(), vec![entry.clone()]);
    let mut reused = SigHashReusedValues::new();
    let sig_hash = calc_schnorr_signature_hash(&signable.as_verifiable(), 0, SIG_HASH_ALL, &mut reused);
    let sighash_hex = hex::encode(sig_hash.as_bytes());

    // Produce ONLY the oracle's partial signature over the sighash. The winner's half is
    // signed in the browser and supplied to submit-oracle-payout. The oracle key never leaves
    // the server and the winner key never reaches it.
    let oracle_kp = crate::oracle::oracle_keypair();
    let msg = match secp256k1::Message::from_digest_slice(sig_hash.as_bytes().as_slice()) {
        Ok(m) => m,
        Err(e) => return err(format!("sighash->msg: {e}")),
    };
    let oracle_sig: [u8; 64] = *oracle_kp.sign_schnorr(msg).as_ref();

    let kind_base = if is_escrow { "oracle_escrow".to_string() } else { "oracle_enforced".to_string() };
    let session_id = uuid::Uuid::new_v4().to_string();
    let now_ts = chrono::Utc::now().timestamp();
    {
        let mut s = oracle_payout_sessions().lock().unwrap();
        s.retain(|_, v| v.created_at > now_ts - 600); // drop sessions older than 10 min
        s.insert(
            session_id.clone(),
            PendingOraclePayout {
                network: req.network.clone(), unsigned_tx: unsigned, entry, redeem,
                deploy_tx_id: cov.tx_id.clone(), kind_base, oracle_sig, member_pubkeys,
                winner_is_a, winner_xonly, created_at: now_ts,
            },
        );
    }
    Json(serde_json::json!({
        "success": true,
        "session_id": session_id,
        "sighash": sighash_hex,
        "sign_scheme": "bip340-schnorr-secp256k1",
        "oracle_signature_hex": hex::encode(oracle_sig),
        "winner_xonly": hex::encode(winner_xonly),
        "winner_is_a": winner_is_a,
        "p2sh_address": cov.p2sh_address,
        "amount_sompi": amount,
        "destination": req.destination_addr,
        "redeem_kind": cov.redeem_kind,
        "note": "The oracle verified the outcome and co-signed this exact sighash (which commits the winner payout output). Sign the SAME sighash (BIP340 Schnorr) with the winner key in your wallet, then POST {session_id, signature_hex} to /covenant/oracle-payout/submit. No key is sent to the server, and the payout cannot be redirected without voiding the oracle signature."
    }))
}

#[derive(Deserialize)]
pub struct SubmitOraclePayoutRequest {
    pub session_id: String,
    /// The winner's 64-byte BIP340 Schnorr signature (hex) over the prepared sighash,
    /// produced in the winner's browser. No key is ever sent to the server.
    pub signature_hex: String,
}

/// POST /covenant/oracle-payout/submit - combine the winner's browser signature with the
/// stored oracle partial-sig into the satisfier and broadcast. The server never had the
/// winner key; it only relays the assembled tx.
pub async fn submit_oracle_payout_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<SubmitOraclePayoutRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));
    let pending = {
        let mut s = oracle_payout_sessions().lock().unwrap();
        match s.remove(&req.session_id) {
            Some(p) => p,
            None => return err("unknown or expired session_id (call /covenant/oracle-payout/prepare first; sessions last 10 minutes)".into()),
        }
    };
    let winner_sig: [u8; 64] = match hex::decode(req.signature_hex.trim().trim_start_matches("0x")).ok().and_then(|b| b.try_into().ok()) {
        Some(s) => s,
        None => return err("signature_hex must be a 64-byte BIP340 Schnorr signature".into()),
    };
    // Key the winner signature by its x-only pubkey so the satisfier orders it correctly.
    let mut sigs: std::collections::HashMap<String, [u8; 64]> = std::collections::HashMap::new();
    sigs.insert(hex::encode(pending.winner_xonly), winner_sig);

    let sig_script = match assemble_noncustodial_satisfier(
        &pending.kind_base, false, &pending.redeem, &pending.member_pubkeys,
        &sigs, Some(&winner_sig), None,
        Some(&pending.oracle_sig), pending.winner_is_a,
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
            let spent = tx_id.to_string();
            let _ = db::mark_p2sh_spent(&db, &pending.deploy_tx_id, &spent);
            info!("Non-custodial oracle payout: covenant {} released in {}", pending.deploy_tx_id, spent);
            Json(serde_json::json!({
                "success": true,
                "payout_tx_id": spent,
                "note": "The chain required both the oracle co-signature and the winner's signature; the oracle co-signed only the verified outcome, and the winner signed in their browser. No key touched the server."
            }))
        }
        Err(e) => {
            warn!("Non-custodial oracle payout broadcast rejected for {}: {}", pending.deploy_tx_id, e);
            err(format!("broadcast rejected: {e} (a wrong winner signature, or the wallet signing a different sighash, fails the 2-of-2 script)"))
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
    /// For HTLC/channel/binary_oracle_select: which branch the prepared sighash committed to.
    /// true = the timeout/refund branch (CLTV lock_time or CSV sequence set), false =
    /// claim/cooperative close / a reveal branch. Single-sig kinds ignore this.
    branch_refund: bool,
    /// For binary_oracle_select reveal branches (and oracle_escrow kinds): true = outcome/player
    /// A (the IF branch), false = outcome/player B. submit-signed must reproduce the EXACT
    /// branch selector the sighash committed to, so this is fixed at prepare time. Ignored by
    /// the other kinds (which carry no A/B branch). Defaults to true.
    winner_is_a: bool,
    /// Member x-only pubkeys parsed from the redeem in script order (multisig: [pk1..pkn];
    /// channel: [p1, p2, p1]; htlc: [receiver, sender]; binary_oracle_select:
    /// [winner_a, winner_b, refund]). Lets submit-signed order the supplied signatures
    /// correctly without re-parsing.
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
    Extension(db): Extension<db::Db>,
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
    if !matches!(kind_base.as_str(), "singlesig" | "hashlock" | "timelock" | "multisig" | "htlc" | "channel" | "deadman" | "rcsv" | "binary_oracle_select") {
        return err(format!("non-custodial wallet signing does not support '{redeem_kind}'"));
    }
    let timelock_daa: Option<u64> = redeem_kind.strip_prefix("timelock:").and_then(|s| s.parse::<u64>().ok());
    let rcsv_min_seq: u64 = redeem_kind.strip_prefix("rcsv:").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let htlc_lock_daa: Option<u64> = redeem_kind.strip_prefix("htlc:").and_then(|s| s.parse::<u64>().ok());
    let channel_lock_daa: Option<u64> = redeem_kind.strip_prefix("channel:").and_then(|s| s.parse::<u64>().ok());
    let deadman_lock_daa: Option<u64> = redeem_kind.strip_prefix("deadman:").and_then(|s| s.parse::<u64>().ok());
    // binary_oracle_select:{min_sequence} - the refund (ELSE) branch is a CSV relative timelock,
    // so the Refund spend's input sequence must be >= min_sequence (BIP68), NOT a CLTV lock_time.
    let bos_min_seq: u64 = redeem_kind.strip_prefix("binary_oracle_select:").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    // Branch selection (committed in the sighash via lock_time / sequence): HTLC claim(default)/
    // refund, channel close(default)/refund, deadman owner(default)/heir, binary_oracle_select
    // reveal_a(default)/reveal_b/refund.
    let branch = req.branch.as_deref().unwrap_or("").to_lowercase();
    // The "refund/ELSE" timeout branch: HTLC/channel refund, the dead-man's heir branch
    // (requested as "heir" or "refund"), or the binary_oracle_select CSV refund. (The HTLC/
    // channel/deadman variants are CLTV and set lock_time below; the bos variant is CSV and
    // sets the input sequence instead.)
    let branch_refund = (matches!(kind_base.as_str(), "htlc" | "channel") && branch == "refund")
        || (kind_base == "deadman" && (branch == "heir" || branch == "refund"))
        || (kind_base == "binary_oracle_select" && branch == "refund");
    // For binary_oracle_select reveal branches: outcome A (the IF branch, default) vs outcome B.
    // Carried into the session so submit-signed reproduces the exact branch selector. Refund
    // ignores it. The default (reveal_a / true) matches the custodial select_mode default.
    let bos_winner_is_a = !(kind_base == "binary_oracle_select" && branch == "reveal_b");
    // Reject a typo'd binary_oracle_select branch rather than silently routing it to outcome A
    // (which would only fail later at signing with a confusing error). Empty = the reveal_a default.
    if kind_base == "binary_oracle_select"
        && !branch.is_empty()
        && !matches!(branch.as_str(), "reveal_a" | "reveal_b" | "refund")
    {
        return err(format!(
            "unknown binary_oracle_select branch '{branch}' (expected reveal_a, reveal_b, or refund)"
        ));
    }
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
    // binary_oracle_select: the wallet that may sign is the branch's NAMED key, parsed from
    // the redeem (members = [winner_a, winner_b, refund]). RevealA -> winner_a, RevealB ->
    // winner_b, Refund -> refund. We surface THIS as signer_xonly so the bettor signs the
    // correct leg; the trailing-pubkey heuristic below would always return the refund key
    // (the script ends with the refund CheckSig), which is only right for the Refund branch.
    let bos_named_xonly: Option<String> = if kind_base == "binary_oracle_select" {
        let idx = if branch_refund { 2 } else if bos_winner_is_a { 0 } else { 1 };
        match member_pubkeys.get(idx) {
            Some(pk) => Some(hex::encode(pk)),
            None => return err("binary_oracle_select redeem is missing the branch's named key".into()),
        }
    } else {
        None
    };
    // The single-signer kinds end with `<0x20><pubkey32> OpCheckSig`; surface that as the
    // signer the wallet must use (multi-party kinds report required_signers instead).
    let signer_xonly = if let Some(x) = bos_named_xonly.clone() {
        x
    } else if redeem.len() >= 34
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
        "deadman" => {
            // owner spends the IF branch; heir spends the ELSE branch after the timelock.
            let idx = if branch_refund { 1 } else { 0 };
            let role = if branch_refund { "heir (after timelock)" } else { "owner" };
            member_pubkeys.get(idx).map(|pk| vec![serde_json::json!({ "role": role, "xonly": hex::encode(pk) })]).unwrap_or_default()
        }
        "binary_oracle_select" => {
            // Exactly one named key spends the chosen leg (no co-signer): winner_a (RevealA),
            // winner_b (RevealB), or the refund key (Refund). signer_xonly already carries it.
            let role = if branch_refund { "refund (after timelock)" } else if bos_winner_is_a { "winner (outcome A)" } else { "winner (outcome B)" };
            if signer_xonly.is_empty() { vec![] } else { vec![serde_json::json!({ "role": role, "xonly": signer_xonly.clone() })] }
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
    let sig_op_count: u8 = SpendKind::parse(&redeem_kind).map_or(1, |k| k.sig_op_count());
    // Relative-timelock (CSV) spends commit the aging requirement in the INPUT SEQUENCE (BIP68),
    // not lock_time: an rcsv covenant always, and a binary_oracle_select REFUND only. Every other
    // spend uses 0 (non-final). Mirrors the custodial /spend handler so the sighash matches.
    let spend_sequence: u64 = if kind_base == "binary_oracle_select" && branch_refund {
        bos_min_seq
    } else {
        rcsv_min_seq
    };
    let inputs = vec![TransactionInput {
        previous_outpoint: TransactionOutpoint {
            transaction_id: utxo.outpoint.transaction_id,
            index: utxo.outpoint.index,
        },
        signature_script: vec![],
        sequence: spend_sequence, // rcsv / bos-refund: satisfies OpCheckSequenceVerify; all others 0 (non-final)
        sig_op_count,
    }];
    let outputs = vec![TransactionOutput { value: amount - TX_FEE, script_public_key: dest_script }];
    // A spend that takes a CLTV branch MUST carry lock_time = lock_daa (with a non-final
    // input sequence, set above) so OpCheckLockTimeVerify passes, and the chain must have
    // reached that DAA. This applies to a timelock covenant, an HTLC refund, and a channel
    // refund. Claims / cooperative closes / other single-signer kinds use 0. NOTE:
    // binary_oracle_select uses CSV (relative timelock via the input sequence above), NOT
    // CLTV, so its refund leaves lock_time at 0 - it is intentionally absent from this chain.
    let spend_lock_time = timelock_daa
        .or(if kind_base == "htlc" && branch_refund { htlc_lock_daa } else { None })
        .or(if kind_base == "channel" && branch_refund { channel_lock_daa } else { None })
        .or(if kind_base == "deadman" && branch_refund { deadman_lock_daa } else { None })
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
                branch_refund, winner_is_a: bos_winner_is_a, member_pubkeys, created_at: now_ts,
            },
        );
    }
    // A hashlock spend, an HTLC CLAIM, and a binary_oracle_select REVEAL must also reveal the
    // preimage (the winning outcome's secret) in submit-signed. The bos refund needs no preimage.
    let needs_preimage = kind_base == "hashlock"
        || (kind_base == "htlc" && !branch_refund)
        || (kind_base == "binary_oracle_select" && !branch_refund);
    let is_multi = matches!(kind_base.as_str(), "multisig" | "channel") && !(kind_base == "channel" && branch_refund);
    Json(serde_json::json!({
        "success": true,
        "session_id": session_id,
        "sighash": sighash_hex,
        "sign_scheme": "bip340-schnorr-secp256k1",
        "signer_xonly": signer_xonly,
        "required_signers": required_signers,
        "branch": if matches!(kind_base.as_str(), "htlc" | "channel") { Some(if branch_refund { "refund" } else if kind_base == "htlc" { "claim" } else { "close" }) } else if kind_base == "deadman" { Some(if branch_refund { "heir" } else { "owner" }) } else if kind_base == "binary_oracle_select" { Some(if branch_refund { "refund" } else if bos_winner_is_a { "reveal_a" } else { "reveal_b" }) } else { None },
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
    Extension(db): Extension<db::Db>,
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
        // The plain primitives (incl. binary_oracle_select) carry NO oracle signature - no Covex
        // key is ever in this path. winner_is_a was fixed at prepare time (the branch selector the
        // sighash committed to) and is meaningful only for binary_oracle_select reveal branches;
        // every other kind ignores it (and defaults to true).
        None, pending.winner_is_a,
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
        "relative_timelock" => {
            let seq = spec.lock_daa.ok_or("relative_timelock requires lock_daa (min_sequence)")?;
            Ok((redeem_relative_timelock(seq, owner_xonly)?, format!("rcsv:{seq}")))
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
        "deadman" => {
            // owner = the deployer (owner_xonly); pubkeys_hex=[heir] claims after lock_daa.
            let pks = spec.pubkeys_hex.as_ref().ok_or("deadman requires pubkeys_hex=[heir]")?;
            let heir = pks.first().ok_or("deadman requires pubkeys_hex=[heir]")?;
            let lock = spec.lock_daa.ok_or("deadman requires lock_daa")?;
            Ok((redeem_deadman(owner_xonly, &decode_xonly_hex(heir)?, lock)?, format!("deadman:{lock}")))
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
    Extension(_db): Extension<db::Db>,
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
    Extension(db): Extension<db::Db>,
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

#[derive(serde::Deserialize)]
pub struct ClaimCovenantInput {
    pub covenant_id: String,
    pub redeem_script_hex: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub owner_addr: Option<String>,
}

/// POST /covenant/p2sh/claim — "Claim & activate" an elsewhere-created covenant.
///
/// The caller supplies the covenant's REDEEM SCRIPT (and optional metadata). We recompute the P2SH
/// lock from it and require it to MATCH the covenant's on-chain commitment, so a claim is impossible
/// without genuinely knowing the script (which is secret until a spend reveals it). On success the
/// covenant becomes fully interactable on Covex: redeemable (a p2sh_covenants row) + richly
/// displayed (metadata). Fully trustless — no key, no trust, just a hash match.
pub async fn claim_covenant_handler(
    Extension(db): Extension<db::Db>,
    Json(input): Json<ClaimCovenantInput>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "ok": false, "error": m }));
    let redeem = match hex::decode(input.redeem_script_hex.trim().trim_start_matches("0x")) {
        Ok(b) if !b.is_empty() => b,
        _ => return err("redeem_script_hex must be non-empty hex".into()),
    };
    let cov = match db::get_covenant_by_txid(&db, &input.covenant_id) {
        Ok(Some(c)) => c,
        _ => return err("covenant not found".into()),
    };
    // The covenant's on-chain lock is aa20<blake2b256(redeem)>87. Recompute it from the supplied
    // redeem script; it MUST equal the indexed script for the claim to be valid.
    let expected_lock = hex::encode(p2sh_script_pubkey(&redeem).script());
    if !expected_lock.eq_ignore_ascii_case(cov.script_hex.trim()) {
        return err(format!(
            "this redeem script does not produce the covenant's on-chain commitment (lock mismatch: indexed {}, from your script {})",
            cov.script_hex, expected_lock
        ));
    }
    // Verified. Persist the redeem script + metadata so the covenant is fully interactable.
    let txid = input.covenant_id.split(':').next().unwrap_or(&input.covenant_id).to_string();
    let outpoint: u32 = input.covenant_id.split(':').nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let kind = input.kind.clone().filter(|k| !k.trim().is_empty()).unwrap_or_else(|| "singlesig".into());
    let owner = input.owner_addr.clone().filter(|o| !o.trim().is_empty()).unwrap_or_else(|| cov.creator_addr.clone());
    let redeem_lc = input.redeem_script_hex.trim().trim_start_matches("0x").to_lowercase();
    let _ = db::insert_p2sh_covenant(&db, &txid, &cov.network, &cov.address, &redeem_lc, &kind, cov.amount_sompi, outpoint, &owner);
    let kind_base = kind.split(':').next().unwrap_or(&kind).to_string();
    let ctype = format!("p2sh-{kind_base}");
    let nm = input.name.clone().filter(|n| !n.trim().is_empty());
    let base_desc = input.description.clone().filter(|d| !d.trim().is_empty())
        .unwrap_or_else(|| format!("Claimed {kind_base} covenant - redeem script verified on-chain, now fully interactable on Covex."));
    let desc = match nm { Some(n) => format!("{n} - {base_desc}"), None => base_desc };
    let _ = db::set_claimed_metadata(&db, &input.covenant_id, &desc, &ctype);
    info!("Covenant claimed + activated: {} kind={} (lock verified)", input.covenant_id, kind);
    Json(serde_json::json!({
        "ok": true,
        "covenant_id": input.covenant_id,
        "redeem_kind": kind,
        "p2sh_address": cov.address,
        "message": "Verified: this redeem script matches the on-chain commitment. The covenant is now redeemable and fully interactable.",
    }))
}

#[derive(Deserialize)]
pub struct BundleDeployRequest {
    #[serde(default = "default_network")]
    pub network: String,
    /// Funder (pays the whole matched pool + tx fee). dev mode = dev wallet 1.
    pub funder_addr: String,
    #[serde(default)]
    pub private_key_hex: String,
    #[serde(default)]
    pub use_dev_mode: bool,
    /// Matched stakes: outcome-A bettor stake and outcome-B bettor stake (KAS).
    pub a_kas: f64,
    pub b_kas: f64,
    /// x-only pubkeys: the A bettor (winner if A) and B bettor (winner if B). dev mode
    /// defaults A = dev wallet 1, B = dev wallet 2.
    #[serde(default)]
    pub a_pubkey_hex: Option<String>,
    #[serde(default)]
    pub b_pubkey_hex: Option<String>,
    /// Treasury fee beneficiary x-only pubkey; defaults to the network treasury address key.
    #[serde(default)]
    pub treasury_pubkey_hex: Option<String>,
    /// Outcome secrets: H_A = blake2b256(preimage_a_hex), H_B = blake2b256(preimage_b_hex).
    pub preimage_a_hex: String,
    pub preimage_b_hex: String,
    /// CSV relative-locktime (min_sequence) for every leg's refund branch.
    pub min_sequence: u64,
    /// House fee / loser rebate in basis points. Defaults 3000 (30%) / 5000 (50%).
    #[serde(default)]
    pub fee_bps: Option<u64>,
    #[serde(default)]
    pub rebate_bps: Option<u64>,
}

/// POST /covenant/bundle/deploy - the CONJOINED COVENANT. Carves a matched parimutuel
/// mini-pool (stakes a on outcome A, b on outcome B) into up to FOUR binary_oracle_select
/// P2SH UTXOs, all funded by ONE transaction and all sharing the same H_A/H_B/min_sequence.
/// An outcome oracle later reveals exactly one secret to route the whole bundle: winners,
/// the loser rebate, and the treasury fee each land at a key the chain enforces; silence =>
/// every leg refunds via its CSV branch. Carve (fee f, rebate r, T=a+b):
///   FEE   = f*T            -> treasury on both reveal branches
///   U_AB  = (1-f)T - r*b - max(0,r(a-b))   -> A on reveal_a, B on reveal_b
///   U_BA  = r*a - max(0,r(a-b))            -> B on reveal_a, A on reveal_b
///   U_AA  = max(0,r(a-b))                  -> A on both (only when a>b)
///   U_BB  = remaining - the above          -> B on both (only when a<b)
/// They sum to T exactly; each leg names ONE key per outcome so consensus pays the right
/// party with no introspection opcode.
pub async fn bundle_deploy_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<BundleDeployRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));

    let (seckey, funder_addr_str) =
        match resolve_signing_key(&req.network, &req.funder_addr, &req.private_key_hex, req.use_dev_mode) {
            Ok(v) => v,
            Err(e) => return err(e),
        };
    let funder_xonly = match xonly_from_seckey(&seckey) {
        Ok(x) => x,
        Err(e) => return err(e),
    };

    // Beneficiary keys: A bettor (winner if A), B bettor (winner if B), treasury (fee).
    let dec_addr_xonly = |addr: &str| -> BResult<[u8; 32]> {
        let a = Address::try_from(addr).map_err(|e| format!("invalid address '{addr}': {e}"))?;
        a.payload
            .as_slice()
            .try_into()
            .map_err(|_| format!("address '{addr}' is not a 32-byte schnorr key"))
    };
    let (a_pk, b_pk) = if let (Some(ah), Some(bh)) = (&req.a_pubkey_hex, &req.b_pubkey_hex) {
        match (decode_xonly_hex(ah), decode_xonly_hex(bh)) {
            (Ok(a), Ok(b)) => (a, b),
            (Err(e), _) | (_, Err(e)) => return err(e),
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
        return err("bundle deploy requires a_pubkey_hex + b_pubkey_hex (or use_dev_mode)".into());
    };
    let pa = match hex::decode(req.preimage_a_hex.trim()) {
        Ok(b) => b,
        Err(e) => return err(format!("bad preimage_a_hex: {e}")),
    };
    let pb = match hex::decode(req.preimage_b_hex.trim()) {
        Ok(b) => b,
        Err(e) => return err(format!("bad preimage_b_hex: {e}")),
    };
    let h_a = blake2b256(&pa);
    let h_b = blake2b256(&pb);
    let min_seq = req.min_sequence;

    // Integer-sompi carve.
    let a_s = (req.a_kas * 100_000_000.0).round() as u64;
    let b_s = (req.b_kas * 100_000_000.0).round() as u64;
    if a_s == 0 || b_s == 0 {
        return err("both a_kas and b_kas must be > 0 (a matched mini-pool has both sides)".into());
    }
    let t = a_s + b_s;
    // Default OFF: no market fee unless the creator explicitly sets one. Covex takes nothing.
    let fee_bps = req.fee_bps.unwrap_or(0);
    let rebate_bps = req.rebate_bps.unwrap_or(5000);
    if fee_bps + rebate_bps >= 10000 {
        return err("fee_bps + rebate_bps must be < 10000 (winners would be unfunded)".into());
    }
    // Fee recipient: NEVER a Covex key. A nonzero fee REQUIRES an explicit creator-defined
    // recipient (treasury_pubkey_hex), so Covex is never in the money path. A zero fee drops
    // the fee leg entirely (MIN_LEG dust filter below), so the placeholder key is unused.
    let treasury_pk = if let Some(t) = &req.treasury_pubkey_hex {
        match decode_xonly_hex(t) {
            Ok(x) => x,
            Err(e) => return err(e),
        }
    } else if fee_bps > 0 {
        return err("a market fee requires a creator-defined recipient; Covex takes no fee".into());
    } else {
        a_pk
    };
    let fee = t * fee_bps / 10000;
    let remaining = t - fee; // = (1-f)T, integer-exact
    let ra = a_s * rebate_bps / 10000;
    let rb = b_s * rebate_bps / 10000;
    let w1 = ra.saturating_sub(rb); // U_AA = max(0, r(a-b))
    let w2 = remaining.saturating_sub(rb).saturating_sub(w1); // U_AB
    let w3 = ra.saturating_sub(w1); // U_BA
    let w4 = remaining.saturating_sub(w2).saturating_sub(w3).saturating_sub(w1); // U_BB (closes to `remaining`)

    // (amount, winner_a key, winner_b key, role). refund key = funder (escrow reclaims on silence).
    let legs: Vec<(u64, [u8; 32], [u8; 32], &str)> = vec![
        (fee, treasury_pk, treasury_pk, "fee"),
        (w2, a_pk, b_pk, "win_AB"),
        (w3, b_pk, a_pk, "rebate_BA"),
        (w1, a_pk, a_pk, "AA"),
        (w4, b_pk, b_pk, "BB"),
    ];
    const MIN_LEG: u64 = 30_000; // clear dust + the eventual claim TX_FEE
    let mut built: Vec<(u64, Vec<u8>, String, &str)> = Vec::new();
    for (amt, wa, wb, role) in legs {
        if amt == 0 {
            continue;
        }
        if amt < MIN_LEG {
            return err(format!(
                "carve leg '{role}' = {amt} sompi is below the {MIN_LEG}-sompi minimum; use larger stakes"
            ));
        }
        let redeem = match redeem_binary_oracle_select(&h_a, &wa, &h_b, &wb, min_seq, &funder_xonly) {
            Ok(r) => r,
            Err(e) => return err(e),
        };
        let addr = match p2sh_address(&redeem, prefix_for_network(&req.network)) {
            Ok(a) => a.to_string(),
            Err(e) => return err(e),
        };
        built.push((amt, redeem, addr, role));
    }
    if built.is_empty() {
        return err("nothing to fund".into());
    }

    let client = match client_for_network(&req.network).await {
        Ok(c) => c,
        Err(e) => return err(e),
    };
    let funder_addr = match Address::try_from(funder_addr_str.as_str()) {
        Ok(a) => a,
        Err(e) => return err(format!("invalid funder address: {e}")),
    };
    let utxos = match client.get_utxos_by_addresses(vec![funder_addr]).await {
        Ok(u) => u,
        Err(e) => return err(format!("UTXO fetch failed: {e}")),
    };
    if utxos.is_empty() {
        return err("no UTXOs for funder address".into());
    }
    let best = utxos.iter().max_by_key(|u| u.utxo_entry.amount).unwrap();
    let total_input = best.utxo_entry.amount;
    let total_locked: u64 = built.iter().map(|(a, _, _, _)| *a).sum();
    let total_cost = total_locked + TX_FEE;
    if total_input < total_cost {
        return err(format!(
            "insufficient balance: have {total_input} sompi, need {total_cost} sompi (pool T={t})"
        ));
    }
    let funder_script = best.utxo_entry.script_public_key.clone();
    let change = total_input - total_cost;
    let mut outputs: Vec<TransactionOutput> = built
        .iter()
        .map(|(amt, redeem, _, _)| TransactionOutput {
            value: *amt,
            script_public_key: p2sh_script_pubkey(redeem),
        })
        .collect();
    if change > 0 {
        outputs.push(TransactionOutput { value: change, script_public_key: funder_script });
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
    // Non-empty payload (sighash) + aa20 discovery marker for the first leg.
    let mut payload = vec![0xaa, 0x20];
    payload.extend_from_slice(&blake2b256(&built[0].1));
    let unsigned = Transaction::new_non_finalized(
        0,
        inputs,
        outputs,
        0,
        SubnetworkId::from_bytes([0u8; 20]),
        0,
        payload,
    );
    let entries = vec![UtxoEntry {
        amount: total_input,
        script_public_key: best.utxo_entry.script_public_key.clone(),
        block_daa_score: best.utxo_entry.block_daa_score,
        is_coinbase: best.utxo_entry.is_coinbase,
    }];
    let signable = SignableTransaction::with_entries(unsigned, entries);
    let mut signed = match sign_with_multiple_v2(signable, &[seckey]).fully_signed() {
        Ok(tx) => tx,
        Err(e) => return err(format!("signing failed: {e:?}")),
    };
    signed.tx.finalize();
    let rpc_tx = RpcTransaction::from(&signed.tx);
    match client.submit_transaction(rpc_tx, false).await {
        Ok(tx_id) => {
            let tx_id_str = tx_id.to_string();
            let redeem_kind = format!("binary_oracle_select:{min_seq}");
            let mut legs_json = Vec::new();
            for (i, (amt, redeem, addr, role)) in built.iter().enumerate() {
                let idx = i as u32;
                let redeem_hex = hex::encode(redeem);
                // NOTE: p2sh_covenants is keyed by tx_id alone, so the legs of one bundle
                // would collide there. Legs are spent via the trustless interaction path
                // instead (the deploy response returns each leg's redeem_script_hex +
                // outpoint_index), so we only index them in the explorer `covenants` table.
                let p2sh_script_hex = hex::encode(p2sh_script_pubkey(redeem).script());
                let cid = format!("{tx_id_str}:{idx}");
                let recv = serde_json::to_string(&vec![addr.clone()]).unwrap_or_default();
                let summary = format!("Parimutuel bundle leg '{role}': {} KAS locked in a binary_oracle_select covenant", *amt as f64 / 1e8);
                // Bundle legs are internal plumbing: keep them EXPLORER tier so they do NOT
                // spam the paid-tier top of the explorer. The MARKET is the featured unit (it
                // lives on the /markets page); legs group under the "Prediction Markets" category.
                let _ = db::insert_covenant(
                    &db, &cid, addr, *amt, &crate::compute_script_hash(&p2sh_script_hex), &p2sh_script_hex,
                    "p2sh-binary_oracle_select", "Prediction Markets", &funder_addr_str, &summary, 0,
                    "EXPLORER", &summary, &recv, &req.network,
                );
                legs_json.push(serde_json::json!({
                    "role": role,
                    "outpoint": cid,
                    "outpoint_index": idx,
                    "p2sh_address": addr,
                    "amount_sompi": amt,
                    "amount_kas": *amt as f64 / 1e8,
                    "redeem_script_hex": redeem_hex,
                    "redeem_kind": redeem_kind.clone(),
                }));
            }
            info!("Parimutuel bundle deployed: tx={tx_id_str} T={t} sompi legs={}", built.len());
            Json(serde_json::json!({
                "success": true,
                "deploy_tx_id": tx_id_str,
                "pool_total_sompi": t,
                "pool_total_kas": t as f64 / 1e8,
                "fee_bps": fee_bps,
                "rebate_bps": rebate_bps,
                "min_sequence": min_seq,
                "legs": legs_json,
                "enforcement_reality": "hybrid",
                "note": "Conjoined parimutuel bundle. Reveal one outcome secret, then claim each leg via /covenant/p2sh/spend (select_mode reveal_a|reveal_b); silence => refund after the CSV delay."
            }))
        }
        Err(e) => err(format!("broadcast rejected: {e}")),
    }
}

// ── P3: outcome-oracle COMMIT / REVEAL service ──────────────────────────────
// A binary market commits two secrets (H_A, H_B) up front and reveals EXACTLY ONE at
// resolution. The secrets are derived from the oracle key + a unique market id (so they
// are recomputable and unpredictable) AND returned to the creator at creation, so the
// winning secret can be revealed - and the bundle settled - even if the Covex server is
// down. The chain enforces the routing; this service only distributes the 1-bit outcome.

#[derive(Deserialize)]
pub struct CreateMarketRequest {
    #[serde(default = "default_network")]
    pub network: String,
    pub question: String,
    pub outcome_a: String,
    pub outcome_b: String,
    /// The market creator's Kaspa (schnorr P2PK) address. Recorded as the only party
    /// authorized to later resolve this market (C2): resolution requires a wallet
    /// signature from this address.
    pub creator_address: String,
    #[serde(default)]
    pub kickoff_utc: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    /// Customizable economics in basis points. Defaults: 3000 (30% house fee) / 5000 (50% loser rebate).
    #[serde(default)]
    pub fee_bps: Option<u64>,
    #[serde(default)]
    pub rebate_bps: Option<u64>,
}

/// POST /covenant/market/create - commit a binary market; returns H_A/H_B (to deploy the
/// bundle) plus the preimages (so the creator can reveal independently of Covex).
pub async fn create_market_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<CreateMarketRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));
    if req.question.trim().is_empty() || req.outcome_a.trim().is_empty() || req.outcome_b.trim().is_empty() {
        return err("question, outcome_a and outcome_b are required".into());
    }
    let creator_address = req.creator_address.trim().to_string();
    if creator_address.is_empty() {
        return err("creator_address is required".into());
    }
    // The creator must be a schnorr P2PK (q...) address: resolution verifies a wallet
    // signature from this exact address, which only works for a 32-byte x-only key.
    match Address::try_from(creator_address.as_str()) {
        Ok(a) if a.payload.as_slice().len() == 32 => {}
        Ok(_) => return err("creator_address must be a 32-byte schnorr (q...) address".into()),
        Err(e) => return err(format!("invalid creator_address: {e}")),
    }
    let fee_bps = req.fee_bps.unwrap_or(0); // default OFF; a creator fee is opt-in and never routes to Covex
    let rebate_bps = req.rebate_bps.unwrap_or(5000);
    if fee_bps + rebate_bps >= 10000 {
        return err("fee_bps + rebate_bps must be < 10000 (winners would be unfunded)".into());
    }
    let okey = crate::oracle::oracle_keypair().secret_key().secret_bytes();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut idseed: Vec<u8> = Vec::new();
    idseed.extend_from_slice(&okey);
    idseed.extend_from_slice(req.question.as_bytes());
    idseed.extend_from_slice(req.network.as_bytes());
    idseed.extend_from_slice(&nanos.to_le_bytes());
    let market_id = hex::encode(&blake2b256(&idseed)[..16]);
    // Secrets = blake2b(oracle_key || market_id || tag): recomputable, unpredictable.
    let derive = |tag: u8| -> [u8; 32] {
        let mut s: Vec<u8> = Vec::new();
        s.extend_from_slice(&okey);
        s.extend_from_slice(market_id.as_bytes());
        s.push(tag);
        blake2b256(&s)
    };
    let secret_a = derive(0);
    let secret_b = derive(1);
    let sa = hex::encode(secret_a);
    let sb = hex::encode(secret_b);
    let ha = hex::encode(blake2b256(&secret_a));
    let hb = hex::encode(blake2b256(&secret_b));
    if let Err(e) = db::insert_bundle_market(
        &db, &market_id, &req.network, req.question.trim(), req.outcome_a.trim(), req.outcome_b.trim(),
        &ha, &hb, &sa, &sb, req.kickoff_utc.as_deref(), req.source_url.as_deref(),
        fee_bps as i64, rebate_bps as i64,
    ) {
        return err(format!("db insert failed: {e}"));
    }
    // Record the creator as the sole party authorized to resolve this market (C2).
    if let Err(e) = db::set_bundle_market_creator(&db, &market_id, &creator_address) {
        return err(format!("db set creator failed: {e}"));
    }
    // Surface the market as a first-class covenant in the Explorer (no separate Markets page):
    // tx_id = market_id, so /covenant/<market_id> resolves and the covenant page renders the full
    // betting website. Funds are enforced by the on-chain binary_oracle_select bundles it funds.
    let anchor_summary = format!(
        "Parimutuel prediction market. {} vs {}. Settled on-chain by binary_oracle_select covenants. {}% house fee, {}% loser rebate.",
        req.outcome_a.trim(), req.outcome_b.trim(), fee_bps / 100, rebate_bps / 100
    );
    let _ = db::insert_covenant(
        &db, &market_id, "", 0, &market_id, "", "prediction-market", "Prediction Markets",
        "", req.question.trim(), 0, "EXPLORER", &anchor_summary, "[]", &req.network,
    );
    Json(serde_json::json!({
        "success": true,
        "market_id": market_id,
        "network": req.network,
        "question": req.question.trim(),
        "outcome_a": req.outcome_a.trim(),
        "outcome_b": req.outcome_b.trim(),
        "h_a": ha,
        "h_b": hb,
        "preimage_a_hex": sa,
        "preimage_b_hex": sb,
        "fee_bps": fee_bps,
        "rebate_bps": rebate_bps,
        "note": "Deploy the bundle covenant with preimage_a_hex/preimage_b_hex. SAVE the preimages: revealing the winning one settles the market even if Covex is down. Reveal via POST /covenant/market/resolve."
    }))
}

#[derive(Deserialize)]
pub struct ResolveMarketRequest {
    pub market_id: String,
    /// 0 = outcome A won, 1 = outcome B won.
    pub outcome: i64,
    /// Authorization (C2): the resolver's Kaspa address, a wallet signature, and a
    /// caller-chosen nonce. `signer_address` MUST equal the market's recorded creator,
    /// and `signature` must be a valid wallet signature of
    /// `covex-market-resolve:{market_id}:{outcome}:{nonce}` by that address.
    pub signer_address: String,
    pub signature: String,
    pub nonce: String,
}

/// POST /covenant/market/resolve - reveal the winning outcome's secret (single-secret
/// policy). After this anyone can settle the bundle legs with the secret + a Kaspa node.
pub async fn resolve_market_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<ResolveMarketRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));
    let m = match db::get_bundle_market(&db, &req.market_id) {
        Some(m) => m,
        None => return err("market not found".into()),
    };
    if req.outcome != 0 && req.outcome != 1 {
        return err("outcome must be 0 (A) or 1 (B)".into());
    }
    // C2: authorize the reveal. Only the recorded market creator may resolve, and only
    // with a valid wallet signature. Fail closed if no creator was recorded (legacy row).
    let creator = match db::get_bundle_market_creator(&db, &req.market_id) {
        Some(c) => c,
        None => {
            return err(
                "market has no recorded creator and cannot be resolved (resolution is restricted to the creator)".into(),
            )
        }
    };
    if req.signer_address.trim() != creator {
        return err("signer_address is not the market creator; only the creator may resolve".into());
    }
    let msg = format!("covex-market-resolve:{}:{}:{}", req.market_id, req.outcome, req.nonce);
    match crate::kaspa_msg::verify_message(&creator, &msg, &req.signature) {
        Ok(true) => {}
        Ok(false) => return err("invalid creator signature for this resolution".into()),
        Err(e) => return err(format!("signature verification failed: {e}")),
    }
    if let Some(prev) = m.revealed_outcome {
        if prev != req.outcome {
            return err(format!(
                "market already resolved to outcome {prev}; single-secret policy forbids revealing the other secret"
            ));
        }
    }
    // M5 (partial): re-derive the winning secret deterministically from the oracle key +
    // market_id (the SAME derivation create uses) instead of trusting the stored plaintext,
    // and verify it matches the committed hash before revealing. (Fully eliminating the
    // plaintext-at-create storage needs db schema/struct changes outside this file and the
    // matcher path, which still requires the preimages before resolution.)
    let okey = crate::oracle::oracle_keypair().secret_key().secret_bytes();
    let derive = |tag: u8| -> [u8; 32] {
        let mut s: Vec<u8> = Vec::new();
        s.extend_from_slice(&okey);
        s.extend_from_slice(req.market_id.as_bytes());
        s.push(tag);
        blake2b256(&s)
    };
    let secret_bytes = if req.outcome == 0 { derive(0) } else { derive(1) };
    let secret = hex::encode(secret_bytes);
    // Fail closed if the re-derived secret does not match the market's on-chain commitment.
    let committed_hash = if req.outcome == 0 { &m.h_a } else { &m.h_b };
    if hex::encode(blake2b256(&secret_bytes)) != *committed_hash {
        return err("re-derived secret does not match the market commitment; refusing to reveal".into());
    }
    if let Err(e) = db::resolve_bundle_market(&db, &req.market_id, req.outcome, &secret) {
        return err(format!("db resolve failed: {e}"));
    }
    Json(serde_json::json!({
        "success": true,
        "market_id": req.market_id,
        "revealed_outcome": req.outcome,
        "revealed_outcome_label": if req.outcome == 0 { m.outcome_a } else { m.outcome_b },
        "revealed_secret": secret,
        "select_mode": if req.outcome == 0 { "reveal_a" } else { "reveal_b" },
        "note": "Settle each bundle leg via /covenant/p2sh/spend using this revealed_secret as preimage_hex and the matching select_mode. Anyone with the secret + a Kaspa node can do this - Covex is no longer required."
    }))
}

#[derive(Deserialize)]
pub struct GetMarketRequest {
    pub market_id: String,
}

/// POST /covenant/market/get - market state; includes the revealed secret once resolved
/// (so an offline claimer can read it here, or recover it from the on-chain claim witness).
pub async fn get_market_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<GetMarketRequest>,
) -> Json<serde_json::Value> {
    match db::get_bundle_market(&db, &req.market_id) {
        Some(m) => Json(serde_json::json!({
            "success": true,
            "market_id": m.market_id,
            "network": m.network,
            "question": m.question,
            "outcome_a": m.outcome_a,
            "outcome_b": m.outcome_b,
            "h_a": m.h_a,
            "h_b": m.h_b,
            "kickoff_utc": m.kickoff_utc,
            "source_url": m.source_url,
            "resolved": m.revealed_outcome.is_some(),
            "revealed_outcome": m.revealed_outcome,
            "revealed_secret": m.revealed_secret,
            "resolved_at": m.resolved_at,
        })),
        None => Json(serde_json::json!({ "success": false, "error": "market not found" })),
    }
}

#[derive(Deserialize)]
pub struct ListMarketsRequest {
    #[serde(default)]
    pub network: Option<String>,
}

/// POST /covenant/market/list - all markets (optionally filtered by network), newest first.
pub async fn list_markets_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<ListMarketsRequest>,
) -> Json<serde_json::Value> {
    let markets = db::list_bundle_markets(&db, req.network.as_deref(), 100);
    let arr: Vec<_> = markets.iter().map(|m| serde_json::json!({
        "market_id": m.market_id, "network": m.network, "question": m.question,
        "outcome_a": m.outcome_a, "outcome_b": m.outcome_b, "kickoff_utc": m.kickoff_utc,
        "source_url": m.source_url, "resolved": m.revealed_outcome.is_some(), "revealed_outcome": m.revealed_outcome,
    })).collect();
    Json(serde_json::json!({ "success": true, "markets": arr }))
}

// ── P4: order book + matcher + market lifecycle ─────────────────────────────
// Bettors place YES(0)/NO(1) orders on a market; the matcher pairs open orders (FIFO) into
// mini-pools and funds a CONJOINED BUNDLE per pair (reusing bundle_deploy_handler). State
// flows open -> funded; settlement happens when the market is resolved (P3) and each leg is
// claimed (P2). Live parimutuel odds come from the funded pool sizes.

#[derive(Deserialize)]
pub struct PlaceOrderRequest {
    pub market_id: String,
    /// 0 = back outcome A, 1 = back outcome B.
    pub side: i64,
    pub stake_kas: f64,
    /// The bettor's kaspatest:q... address (its 32-byte payload is the x-only key that wins).
    pub bettor_addr: String,
}

/// POST /covenant/market/order - place a YES(0)/NO(1) order on a market.
pub async fn place_order_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<PlaceOrderRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));
    let m = match db::get_bundle_market(&db, &req.market_id) {
        Some(m) => m,
        None => return err("market not found".into()),
    };
    if m.revealed_outcome.is_some() {
        return err("market already resolved; no new orders".into());
    }
    if req.side != 0 && req.side != 1 {
        return err("side must be 0 (A) or 1 (B)".into());
    }
    let stake_sompi = (req.stake_kas * 100_000_000.0).round() as i64;
    if stake_sompi <= 0 {
        return err("stake_kas must be > 0".into());
    }
    let pk = match Address::try_from(req.bettor_addr.as_str()) {
        Ok(a) => {
            let p = a.payload.as_slice();
            if p.len() != 32 {
                return err("bettor_addr is not a 32-byte schnorr (q...) address".into());
            }
            hex::encode(p)
        }
        Err(e) => return err(format!("invalid bettor_addr: {e}")),
    };
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut seed: Vec<u8> = Vec::new();
    seed.extend_from_slice(req.market_id.as_bytes());
    seed.extend_from_slice(req.bettor_addr.as_bytes());
    seed.push(req.side as u8);
    seed.extend_from_slice(&nanos.to_le_bytes());
    let order_id = hex::encode(&blake2b256(&seed)[..12]);
    if let Err(e) = db::insert_market_order(&db, &order_id, &req.market_id, req.side, stake_sompi, &req.bettor_addr, &pk) {
        return err(format!("db insert failed: {e}"));
    }
    Json(serde_json::json!({
        "success": true,
        "order_id": order_id,
        "market_id": req.market_id,
        "side": req.side,
        "side_label": if req.side == 0 { m.outcome_a } else { m.outcome_b },
        "stake_kas": req.stake_kas,
        "status": "open"
    }))
}

#[derive(Deserialize)]
pub struct MatchMarketRequest {
    pub market_id: String,
    #[serde(default)]
    pub fee_bps: Option<u64>,
    #[serde(default)]
    pub rebate_bps: Option<u64>,
}

/// Refund delay (CSV min_sequence) baked into every matched bundle leg.
const MARKET_MIN_SEQ: u64 = 200_000;

/// POST /covenant/market/match - pair open A/B orders (FIFO) into mini-pools and fund a
/// conjoined bundle covenant per pair (dev-funded escrow on testnet). Marks orders funded.
pub async fn match_market_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<MatchMarketRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));
    let m = match db::get_bundle_market(&db, &req.market_id) {
        Some(m) => m,
        None => return err("market not found".into()),
    };
    if m.revealed_outcome.is_some() {
        return err("market already resolved".into());
    }
    let a_orders = db::list_open_orders_side(&db, &req.market_id, 0);
    let b_orders = db::list_open_orders_side(&db, &req.market_id, 1);
    let pairs = a_orders.len().min(b_orders.len());
    if pairs == 0 {
        return err("need at least one open order on EACH side to match".into());
    }
    // Route any creator-set market fee to the market CREATOR (never Covex). A market with a
    // nonzero fee must have a resolvable creator x-only key, else build_bundle fails closed.
    let fee_recipient: Option<String> = if m.fee_bps > 0 {
        db::get_bundle_market_creator(&db, &req.market_id)
            .and_then(|c| Address::try_from(c.as_str()).ok())
            .map(|a| hex::encode(a.payload.as_slice()))
    } else {
        None
    };
    let mut matches = Vec::new();
    for i in 0..pairs {
        let ao = &a_orders[i];
        let bo = &b_orders[i];
        let breq = BundleDeployRequest {
            network: m.network.clone(),
            funder_addr: dev_wallets::DEV_WALLET_1_ADDRESS_TN12.to_string(),
            private_key_hex: String::new(),
            use_dev_mode: true,
            a_kas: ao.stake_sompi as f64 / 1e8,
            b_kas: bo.stake_sompi as f64 / 1e8,
            a_pubkey_hex: Some(ao.bettor_pubkey.clone()),
            b_pubkey_hex: Some(bo.bettor_pubkey.clone()),
            treasury_pubkey_hex: fee_recipient.clone(),
            preimage_a_hex: m.secret_a.clone(),
            preimage_b_hex: m.secret_b.clone(),
            min_sequence: MARKET_MIN_SEQ,
            fee_bps: Some(m.fee_bps as u64),
            rebate_bps: Some(m.rebate_bps as u64),
        };
        let res = bundle_deploy_handler(Extension(db.clone()), Json(breq)).await.0;
        if res.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            let txid = res.get("deploy_tx_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let _ = db::mark_order_funded(&db, &ao.order_id, &txid);
            let _ = db::mark_order_funded(&db, &bo.order_id, &txid);
            // Persist the carved legs (role + redeem + outpoint) so /market/settle can claim
            // each one after resolution without recomputing the carve.
            let legs_json = res.get("legs").map(|v| v.to_string()).unwrap_or_else(|| "[]".to_string());
            let _ = db::insert_market_bundle(&db, &txid, &req.market_id, &ao.bettor_addr, &bo.bettor_addr, &legs_json);
            matches.push(serde_json::json!({
                "a_order": ao.order_id, "b_order": bo.order_id,
                "a_kas": ao.stake_sompi as f64 / 1e8, "b_kas": bo.stake_sompi as f64 / 1e8,
                "bundle_tx": txid, "legs": res.get("legs"),
            }));
        } else {
            matches.push(serde_json::json!({ "a_order": ao.order_id, "b_order": bo.order_id, "error": res.get("error") }));
        }
    }
    Json(serde_json::json!({
        "success": true,
        "market_id": req.market_id,
        "matched_pairs": matches.len(),
        "matches": matches,
        "unmatched_a": a_orders.len().saturating_sub(pairs),
        "unmatched_b": b_orders.len().saturating_sub(pairs),
    }))
}

#[derive(Deserialize)]
pub struct MarketBookRequest {
    pub market_id: String,
}

/// POST /covenant/market/book - the order book, funded pool sizes, and live parimutuel odds.
pub async fn market_book_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<MarketBookRequest>,
) -> Json<serde_json::Value> {
    let m = match db::get_bundle_market(&db, &req.market_id) {
        Some(m) => m,
        None => return Json(serde_json::json!({ "success": false, "error": "market not found" })),
    };
    let orders = db::list_market_orders(&db, &req.market_id);
    let (mut pa, mut pb, mut oa, mut ob) = (0i64, 0i64, 0i64, 0i64);
    let mut order_json = Vec::new();
    for o in &orders {
        if o.status == "funded" {
            if o.side == 0 { pa += o.stake_sompi } else { pb += o.stake_sompi }
        } else if o.side == 0 {
            oa += o.stake_sompi
        } else {
            ob += o.stake_sompi
        }
        order_json.push(serde_json::json!({
            "order_id": o.order_id, "side": o.side, "stake_kas": o.stake_sompi as f64 / 1e8,
            "status": o.status, "bundle_tx": o.bundle_tx,
        }));
    }
    // Generalized for the market's customizable economics: winner multiplier = (1-fee) + (1-fee-rebate)*(L/P).
    let f = m.fee_bps as f64 / 10000.0;
    let r = m.rebate_bps as f64 / 10000.0;
    let mult = |p: i64, l: i64| if p > 0 { (1.0 - f) + (1.0 - f - r) * (l as f64 / p as f64) } else { 0.0 };
    Json(serde_json::json!({
        "success": true,
        "market_id": m.market_id, "question": m.question,
        "outcome_a": m.outcome_a, "outcome_b": m.outcome_b,
        "resolved": m.revealed_outcome.is_some(), "revealed_outcome": m.revealed_outcome,
        "fee_bps": m.fee_bps, "rebate_bps": m.rebate_bps,
        "funded_pool_a_kas": pa as f64 / 1e8, "funded_pool_b_kas": pb as f64 / 1e8,
        "open_pool_a_kas": oa as f64 / 1e8, "open_pool_b_kas": ob as f64 / 1e8,
        "odds": {
            "if_a_wins_multiplier": mult(pa, pb),
            "if_b_wins_multiplier": mult(pb, pa),
            "breakeven_lp": if (1.0 - f - r) > 0.0 { f / (1.0 - f - r) } else { 0.0 },
            "note": "winner multiplier = (1-fee) + (1-fee-rebate)*(L/P)"
        },
        "orders": order_json
    }))
}

#[derive(Deserialize)]
pub struct SettleMarketRequest {
    pub market_id: String,
}

/// POST /covenant/market/settle - after a market is RESOLVED, claim EVERY funded bundle leg
/// on-chain via dev-mode using the revealed secret. The fee leg pays the treasury (whose key
/// the dev wallets don't hold) so it is skipped; in production each bettor claims their own
/// leg non-custodially. Returns the spend tx for each settled leg.
pub async fn settle_market_handler(
    Extension(db): Extension<db::Db>,
    Json(req): Json<SettleMarketRequest>,
) -> Json<serde_json::Value> {
    let err = |m: String| Json(serde_json::json!({ "success": false, "error": m }));
    let m = match db::get_bundle_market(&db, &req.market_id) {
        Some(m) => m,
        None => return err("market not found".into()),
    };
    let outcome = match m.revealed_outcome {
        Some(o) => o,
        None => return err("market is not resolved yet; reveal an outcome first".into()),
    };
    let secret = match &m.revealed_secret {
        Some(s) => s.clone(),
        None => return err("no revealed secret on record".into()),
    };
    let select_mode = if outcome == 0 { "reveal_a" } else { "reveal_b" };
    let bundles = db::list_market_bundles(&db, &req.market_id);
    let mut settled = Vec::new();
    for b in &bundles {
        let legs: Vec<serde_json::Value> = serde_json::from_str(&b.legs_json).unwrap_or_default();
        for leg in &legs {
            let role = leg.get("role").and_then(|v| v.as_str()).unwrap_or("");
            if role == "fee" {
                continue; // the treasury claims its own fee leg
            }
            // Pay each leg to its rightful winner under the resolved outcome.
            let dest = match (role, outcome) {
                ("win_AB", 0) | ("AA", _) => b.a_addr.clone(),
                ("win_AB", _) => b.b_addr.clone(),
                ("rebate_BA", 0) | ("BB", _) => b.b_addr.clone(),
                ("rebate_BA", _) => b.a_addr.clone(),
                _ => b.a_addr.clone(),
            };
            let redeem_hex = leg.get("redeem_script_hex").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if redeem_hex.is_empty() {
                continue;
            }
            let kind = leg.get("redeem_kind").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let idx = leg.get("outpoint_index").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let sreq = P2shSpendRequest {
                network: m.network.clone(),
                deploy_tx_id: b.bundle_tx.clone(),
                private_key_hex: String::new(),
                use_dev_mode: true,
                destination_addr: dest,
                preimage_hex: Some(secret.clone()),
                signer_keys_hex: None,
                htlc_mode: None,
                channel_mode: None,
                timedecay_mode: None,
                select_mode: Some(select_mode.to_string()),
                redeem_script_hex: Some(redeem_hex),
                redeem_kind: Some(kind),
                outpoint_index: Some(idx),
            };
            let res = p2sh_spend_handler(Extension(db.clone()), Json(sreq)).await.0;
            settled.push(serde_json::json!({
                "bundle_tx": b.bundle_tx, "role": role,
                "ok": res.get("success").and_then(|v| v.as_bool()).unwrap_or(false),
                "spend_tx": res.get("spend_tx_id"),
                "error": res.get("error"),
            }));
        }
    }
    let ok_count = settled.iter().filter(|s| s.get("ok").and_then(|v| v.as_bool()).unwrap_or(false)).count();
    Json(serde_json::json!({
        "success": true,
        "market_id": req.market_id,
        "resolved_outcome": outcome,
        "legs_settled": ok_count,
        "legs_total": settled.len(),
        "settled": settled,
        "note": "Each non-fee leg is claimed on-chain with the revealed secret; the fee leg is left for the treasury. In production each bettor claims their own leg non-custodially."
    }))
}

pub fn p2sh_routes() -> Router {
    Router::new()
        .route("/covenant/p2sh/deploy", post(p2sh_deploy_handler))
        .route("/covenant/bundle/deploy", post(bundle_deploy_handler))
        .route("/covenant/market/settle", post(settle_market_handler))
        .route("/covenant/market/create", post(create_market_handler))
        .route("/covenant/market/resolve", post(resolve_market_handler))
        .route("/covenant/market/get", post(get_market_handler))
        .route("/covenant/market/list", post(list_markets_handler))
        .route("/covenant/market/order", post(place_order_handler))
        .route("/covenant/market/match", post(match_market_handler))
        .route("/covenant/market/book", post(market_book_handler))
        .route("/covenant/p2sh/spend", post(p2sh_spend_handler))
        .route("/covenant/p2sh/prepare-spend", post(prepare_spend_handler))
        .route("/covenant/p2sh/submit-signed", post(submit_signed_handler))
        .route("/covenant/p2sh/prepare-deploy", post(prepare_deploy_handler))
        .route("/covenant/p2sh/submit-deploy", post(submit_deploy_handler))
        .route("/covenant/p2sh/claim", post(claim_covenant_handler))
        .route("/covenant/oracle-payout", post(oracle_payout_handler))
        .route("/covenant/oracle-payout/prepare", post(prepare_oracle_payout_handler))
        .route("/covenant/oracle-payout/submit", post(submit_oracle_payout_handler))
}

#[cfg(test)]
mod tests {
    use super::*;
    use kaspa_consensus_core::subnets::SubnetworkId;
    use kaspa_consensus_core::tx::{
        Transaction, TransactionInput, TransactionOutpoint, TransactionOutput, UtxoEntry,
        VerifiableTransaction,
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

    /// Phase 1: SpendKind is the single source of truth for the consensus-critical spend
    /// sig_op_count. parse() must accept every string kind_str() emits, and sig_op_count()
    /// must reproduce the values the three spend handlers previously computed inline.
    #[test]
    fn spendkind_parse_and_sig_op_count() {
        assert_eq!(SpendKind::parse("singlesig"), Some(SpendKind::SingleSig));
        assert_eq!(SpendKind::parse("hashlock"), Some(SpendKind::HashLock));
        assert_eq!(SpendKind::parse("timelock:123"), Some(SpendKind::Timelock { lock_daa: 123 }));
        assert_eq!(SpendKind::parse("multisig:3"), Some(SpendKind::Multisig { total: 3 }));
        assert_eq!(SpendKind::parse("htlc:9"), Some(SpendKind::Htlc { lock_daa: 9 }));
        assert_eq!(SpendKind::parse("channel:8000"), Some(SpendKind::Channel { lock_daa: 8000 }));
        assert_eq!(SpendKind::parse("oracle:2"), Some(SpendKind::OracleEnforced { total: 2 }));
        assert_eq!(SpendKind::parse("oracle_escrow"), Some(SpendKind::OracleEscrow));
        assert_eq!(SpendKind::parse("nonsense"), None);
        assert_eq!(SpendKind::parse("timelock"), None); // missing the required lock_daa param

        // sig_op_count reproduces the previously-inline values at the three spend sites.
        assert_eq!(SpendKind::parse("singlesig").unwrap().sig_op_count(), 1);
        assert_eq!(SpendKind::parse("hashlock").unwrap().sig_op_count(), 1);
        assert_eq!(SpendKind::parse("timelock:1").unwrap().sig_op_count(), 1);
        assert_eq!(SpendKind::parse("htlc:1").unwrap().sig_op_count(), 1);
        assert_eq!(SpendKind::parse("multisig:5").unwrap().sig_op_count(), 5);
        assert_eq!(SpendKind::parse("channel:1").unwrap().sig_op_count(), 3);
        assert_eq!(SpendKind::parse("oracle:2").unwrap().sig_op_count(), 2);
        assert_eq!(SpendKind::parse("oracle_escrow").unwrap().sig_op_count(), 3);

        // Every kind RedeemKind can persist must parse back into a SpendKind.
        let a = [7u8; 32];
        let kinds = [
            RedeemKind::SingleSig { xonly_pubkey: a },
            RedeemKind::HashLock { hash: a, xonly_pubkey: a },
            RedeemKind::Timelock { lock_daa: 10, xonly_pubkey: a },
            RedeemKind::Multisig { pubkeys: vec![a, a, a], required: 2 },
            RedeemKind::Htlc { hash: a, receiver_pubkey: a, lock_daa: 10, sender_pubkey: a },
            RedeemKind::Channel { p1: a, p2: a, lock_daa: 10 },
            RedeemKind::OracleEnforced { oracle: a, winner: a },
            RedeemKind::OracleEscrow { oracle: a, player_a: a, player_b: a },
        ];
        for rk in &kinds {
            assert!(SpendKind::parse(&rk.kind_str()).is_some(), "kind_str '{}' must parse", rk.kind_str());
        }
        // A 3-member multisig's kind_str round-trips to sig_op_count 3.
        let ms = RedeemKind::Multisig { pubkeys: vec![a, a, a], required: 2 };
        assert_eq!(SpendKind::parse(&ms.kind_str()).unwrap().sig_op_count(), 3);
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
    fn deadman_owner_anytime_heir_after_timelock() {
        let owner = test_keypair(91);
        let heir = test_keypair(92);
        let ox = owner.x_only_public_key().0.serialize();
        let hx = heir.x_only_public_key().0.serialize();
        let lock_daa: u64 = 3_000_000;
        let redeem = redeem_deadman(&ox, &hx, lock_daa).unwrap();

        // OWNER spends via the IF branch at any time (no timelock on that branch).
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| build_deadman_signature_script(s, 0, &owner, &redeem, true).unwrap()),
            "owner must be able to spend anytime via the IF branch"
        );
        // The HEIR key on the IF branch fails (OpCheckSig wants the owner key).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_deadman_signature_script(s, 0, &heir, &redeem, true).unwrap()),
            "the IF branch requires the owner key"
        );
        // HEIR spends via the ELSE branch after the timelock (lock_time >= lock_daa, non-final input).
        assert!(
            run_spend_generic(&redeem, lock_daa, 0, |s| build_deadman_signature_script(s, 0, &heir, &redeem, false).unwrap()),
            "heir must be able to claim after the timelock"
        );
        // HEIR before the timelock fails (CLTV).
        assert!(
            !run_spend_generic(&redeem, lock_daa - 1, 0, |s| build_deadman_signature_script(s, 0, &heir, &redeem, false).unwrap()),
            "heir claim before the timelock must fail"
        );
        // The OWNER key on the ELSE branch fails (OpCheckSig wants the heir key).
        assert!(
            !run_spend_generic(&redeem, lock_daa, 0, |s| build_deadman_signature_script(s, 0, &owner, &redeem, false).unwrap()),
            "the ELSE branch requires the heir key"
        );
    }

    #[test]
    fn deadman_kind_wiring() {
        let a = [11u8; 32];
        let b = [22u8; 32];
        // redeem_script routes to the proven builder; kind_str / catalog_id are stable.
        assert_eq!(
            RedeemKind::Deadman { owner: a, heir: b, lock_daa: 8000 }.redeem_script().unwrap(),
            redeem_deadman(&a, &b, 8000).unwrap()
        );
        assert_eq!(RedeemKind::Deadman { owner: a, heir: b, lock_daa: 8000 }.kind_str(), "deadman:8000");
        assert_eq!(RedeemKind::Deadman { owner: a, heir: b, lock_daa: 8000 }.catalog_id(), "p2sh_deadman");
        // SpendKind parses the persisted string and reports 2 sig ops (IF + ELSE CheckSig).
        assert_eq!(SpendKind::parse("deadman:8000"), Some(SpendKind::Deadman { lock_daa: 8000 }));
        assert_eq!(SpendKind::parse("deadman:8000").unwrap().sig_op_count(), 2);
        assert_eq!(
            SpendKind::parse(&RedeemKind::Deadman { owner: a, heir: b, lock_daa: 8000 }.kind_str()),
            Some(SpendKind::Deadman { lock_daa: 8000 })
        );
    }

    #[test]
    fn relative_timelock_csv_opcode_compares_sequence() {
        let kp = test_keypair(95);
        let xonly = kp.x_only_public_key().0.serialize();
        let min_seq: u64 = 100;
        let redeem = redeem_relative_timelock(min_seq, &xonly).unwrap();
        // The CSV opcode passes iff the spend input's sequence >= the script's min_sequence.
        assert!(
            run_spend_generic(&redeem, 0, min_seq, |s| build_p2sh_signature_script(s, 0, &kp, &redeem, &[]).unwrap()),
            "CSV passes when input.sequence == required"
        );
        assert!(
            run_spend_generic(&redeem, 0, min_seq + 50, |s| build_p2sh_signature_script(s, 0, &kp, &redeem, &[]).unwrap()),
            "CSV passes when input.sequence > required"
        );
        assert!(
            !run_spend_generic(&redeem, 0, min_seq - 1, |s| build_p2sh_signature_script(s, 0, &kp, &redeem, &[]).unwrap()),
            "CSV fails when input.sequence < required"
        );
        let wrong = test_keypair(96);
        assert!(
            !run_spend_generic(&redeem, 0, min_seq, |s| build_p2sh_signature_script(s, 0, &wrong, &redeem, &[]).unwrap()),
            "wrong key must fail regardless of sequence"
        );
    }

    #[test]
    fn binary_oracle_select_routes_by_revealed_secret() {
        use BinarySelectBranch::*;
        let winner_a = test_keypair(81);
        let winner_b = test_keypair(82);
        let refund = test_keypair(83);
        let wa = winner_a.x_only_public_key().0.serialize();
        let wb = winner_b.x_only_public_key().0.serialize();
        let rf = refund.x_only_public_key().0.serialize();
        let s_a = b"outcome-A-secret-v1".to_vec();
        let s_b = b"outcome-B-secret-v1".to_vec();
        let h_a = blake2b256(&s_a);
        let h_b = blake2b256(&s_b);
        let min_seq: u64 = 144;
        let redeem = redeem_binary_oracle_select(&h_a, &wa, &h_b, &wb, min_seq, &rf).unwrap();

        // A wins: reveal s_A, winner_a signs -> branch A passes.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| build_binary_oracle_select_signature_script(s, 0, &winner_a, &redeem, RevealA, Some(&s_a[..])).unwrap()),
            "reveal s_A + winner_a sig must pass branch A"
        );
        // s_A is public, but the LOSER's key cannot take branch A (each branch also needs the named key's sig).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_binary_oracle_select_signature_script(s, 0, &winner_b, &redeem, RevealA, Some(&s_a[..])).unwrap()),
            "a public s_A must NOT let the wrong key sweep branch A"
        );
        // Wrong preimage on branch A fails (OpEqualVerify).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_binary_oracle_select_signature_script(s, 0, &winner_a, &redeem, RevealA, Some(&b"nope"[..])).unwrap()),
            "wrong preimage must fail branch A"
        );
        // B wins: reveal s_B, winner_b signs -> the nested ELSE/IF branch passes.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| build_binary_oracle_select_signature_script(s, 0, &winner_b, &redeem, RevealB, Some(&s_b[..])).unwrap()),
            "reveal s_B + winner_b sig must pass branch B"
        );
        // Refund: no secret, refund key signs, input aged >= min_seq -> passes (BIP68/CSV).
        assert!(
            run_spend_generic(&redeem, 0, min_seq, |s| build_binary_oracle_select_signature_script(s, 0, &refund, &redeem, Refund, None).unwrap()),
            "refund after the relative timelock must pass"
        );
        // Refund before the relative timelock fails (input.sequence < min_seq).
        assert!(
            !run_spend_generic(&redeem, 0, min_seq - 1, |s| build_binary_oracle_select_signature_script(s, 0, &refund, &redeem, Refund, None).unwrap()),
            "refund before the relative timelock must be rejected"
        );
        // Refund branch with a non-refund key fails (final OpCheckSig).
        assert!(
            !run_spend_generic(&redeem, 0, min_seq, |s| build_binary_oracle_select_signature_script(s, 0, &winner_a, &redeem, Refund, None).unwrap()),
            "refund branch requires the refund key"
        );
    }

    /// The WINNER-ONLY NON-CUSTODIAL binary_oracle_select spend, proven against the REAL
    /// kaspa-txscript interpreter. The bettor signs their own leg in their browser (here: an
    /// external secp256k1 sig over the prepared sighash) and only the 64-byte signature is fed
    /// in - NO Covex/oracle key is in this path (oracle_sig is always None). Proves:
    ///  (a) the non-custodial satisfier has the SAME script layout as the custodial build_*
    ///      satisfier (identical aside from the randomized-nonce signature value), so the
    ///      on-chain behavior is unchanged and only the signature's provenance differs;
    ///  (b) RevealA / RevealB / Refund each pass with the branch's named key + correct selectors;
    ///  (c) the Refund branch needs the input aged >= min_sequence (CSV/BIP68) and fails below it;
    ///  (d) FAIL CLOSED: a signer whose x-only pubkey does not match the branch's named key is
    ///      rejected at assembly (a loser cannot reorder branches), AND the engine rejects a
    ///      loser's sig supplied under the named key (anti-redirect via the on-chain OpCheckSig).
    #[test]
    fn noncustodial_binary_oracle_select_winner_only_claim() {
        use BinarySelectBranch::*;
        let winner_a = test_keypair(81);
        let winner_b = test_keypair(82);
        let refund = test_keypair(83);
        let wa = winner_a.x_only_public_key().0.serialize();
        let wb = winner_b.x_only_public_key().0.serialize();
        let rf = refund.x_only_public_key().0.serialize();
        let s_a = b"outcome-A-secret-v1".to_vec();
        let s_b = b"outcome-B-secret-v1".to_vec();
        let h_a = blake2b256(&s_a);
        let h_b = blake2b256(&s_b);
        let min_seq: u64 = 144;
        let redeem = redeem_binary_oracle_select(&h_a, &wa, &h_b, &wb, min_seq, &rf).unwrap();
        // checksig_only parse keeps the three pubkeys each directly followed by OpCheckSig
        // (the h_a/h_b pushes are followed by OpEqualVerify and are excluded).
        let members = parse_redeem_pubkeys(&redeem, true);
        assert_eq!(members, vec![wa, wb, rf], "parse must yield [winner_a, winner_b, refund]");

        // (a) STRUCTURAL parity with the custodial builder: aside from the (randomized-nonce)
        // signature value, the non-custodial satisfier and build_binary_oracle_select_signature_
        // script emit the SAME bytes. Each sig is pushed as OpData65 (0x41) + 65 payload bytes; the
        // preimage push, branch selectors, and trailing redeem-script push are identical in both.
        // BIP340 aux randomness makes the raw sig bytes differ between two signings, so we zero the
        // 65 payload bytes of every OpData65 push in BOTH scripts and require the rest to be equal.
        let strip_sig = |script: &[u8]| -> Vec<u8> {
            // Zero out every 0x41 (OpData65) push's 65 payload bytes so only the selectors,
            // preimage push, and redeem-script push remain for comparison.
            let mut out = script.to_vec();
            let mut i = 0usize;
            while i < out.len() {
                if out[i] == 0x41 && i + 1 + 65 <= out.len() {
                    for b in out.iter_mut().skip(i + 1).take(65) { *b = 0; }
                    i += 1 + 65;
                } else {
                    i += 1;
                }
            }
            out
        };
        let parity = |branch: BinarySelectBranch, kp: &Keypair, winner_is_a: bool, preimage: Option<&[u8]>| {
            let seq = if matches!(branch, Refund) { min_seq } else { 0 };
            let equal = std::cell::Cell::new(false);
            // Build both over the SAME signable; their layouts (sig push zeroed) must match.
            run_spend_generic(&redeem, 0, seq, |s| {
                let custodial = build_binary_oracle_select_signature_script(s, 0, kp, &redeem, branch, preimage).unwrap();
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(kp.x_only_public_key().0.serialize()), ext_solo(s, kp));
                let noncustodial = assemble_noncustodial_satisfier(
                    "binary_oracle_select", matches!(branch, Refund), &redeem, &members,
                    &sigs, None, preimage, None, winner_is_a,
                ).unwrap();
                equal.set(strip_sig(&custodial) == strip_sig(&noncustodial));
                custodial // run the custodial script through the engine to keep this a valid spend
            });
            assert!(equal.get(), "non-custodial satisfier layout must match the custodial one byte-for-byte (sig aside)");
        };
        parity(RevealA, &winner_a, true, Some(&s_a[..]));
        parity(RevealB, &winner_b, false, Some(&s_b[..]));
        parity(Refund, &refund, true, None);

        // (b) RevealA: external winner_a sig (keyed by its xonly) + s_a + winner_is_a=true passes.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(wa), ext_solo(s, &winner_a));
                assemble_noncustodial_satisfier("binary_oracle_select", false, &redeem, &members, &sigs, None, Some(&s_a[..]), None, true).unwrap()
            }),
            "(b) winner_a's browser sig + revealed s_A must claim outcome A"
        );
        // RevealB: external winner_b sig + s_b + winner_is_a=false passes.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(wb), ext_solo(s, &winner_b));
                assemble_noncustodial_satisfier("binary_oracle_select", false, &redeem, &members, &sigs, None, Some(&s_b[..]), None, false).unwrap()
            }),
            "(b) winner_b's browser sig + revealed s_B must claim outcome B"
        );
        // RevealA via the SOLO signature path (single-signer wallet flow, no sigs map) also passes.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let solo = ext_solo(s, &winner_a);
                assemble_noncustodial_satisfier("binary_oracle_select", false, &redeem, &members, &empty_sigs(), Some(&solo), Some(&s_a[..]), None, true).unwrap()
            }),
            "(b) the solo-signature wallet flow must also claim outcome A"
        );

        // (c) Refund: refund key (solo) + input aged >= min_seq passes via the CSV ELSE branch.
        assert!(
            run_spend_generic(&redeem, 0, min_seq, |s| {
                let solo = ext_solo(s, &refund);
                assemble_noncustodial_satisfier("binary_oracle_select", true, &redeem, &members, &empty_sigs(), Some(&solo), None, None, true).unwrap()
            }),
            "(c) the refund key must reclaim once the UTXO has aged min_sequence (BIP68)"
        );
        // Refund BELOW min_seq fails - no early pull (the custodial path proves the same).
        assert!(
            !run_spend_generic(&redeem, 0, min_seq - 1, |s| {
                let solo = ext_solo(s, &refund);
                assemble_noncustodial_satisfier("binary_oracle_select", true, &redeem, &members, &empty_sigs(), Some(&solo), None, None, true).unwrap()
            }),
            "(c) the refund must be rejected before the relative timelock matures"
        );

        // (d) FAIL CLOSED at assembly: a sigs map that does NOT contain the branch's named key is
        // rejected (no silent fallthrough), so a loser cannot assemble a script reordering branches.
        let wrong = {
            let mut sigs = std::collections::HashMap::new();
            // winner_b's sig offered for outcome A (named key = winner_a, which is absent).
            sigs.insert(hex::encode(wb), [0u8; 64]);
            assemble_noncustodial_satisfier("binary_oracle_select", false, &redeem, &members, &sigs, None, Some(&s_a[..]), None, true)
        };
        assert!(wrong.is_err(), "(d) a sigs map missing the branch's named key must be rejected at assembly");
        // Anti-redirect via the on-chain OpCheckSig: even if the LOSER's signature is supplied
        // UNDER the winner's named key (so it assembles), the engine rejects it - a public secret
        // cannot let the wrong party sweep the winner's branch.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(wa), ext_solo(s, &winner_b)); // winner_b signing, keyed as winner_a
                assemble_noncustodial_satisfier("binary_oracle_select", false, &redeem, &members, &sigs, None, Some(&s_a[..]), None, true).unwrap()
            }),
            "(d) the loser's sig cannot take the winner's branch even when keyed as the winner"
        );
        // The refund key cannot take a reveal branch (named key mismatch + on-chain OpCheckSig).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(wa), ext_solo(s, &refund)); // refund signing, keyed as winner_a
                assemble_noncustodial_satisfier("binary_oracle_select", false, &redeem, &members, &sigs, None, Some(&s_a[..]), None, true).unwrap()
            }),
            "(d) the refund key cannot claim a reveal branch"
        );
    }

    #[test]
    fn binary_oracle_select_kind_wiring() {
        let a = [11u8; 32];
        let b = [22u8; 32];
        let c = [33u8; 32];
        let d = [44u8; 32];
        let k = RedeemKind::BinaryOracleSelect { h_a: a, winner_a: b, h_b: c, winner_b: d, min_sequence: 144, refund: a };
        assert_eq!(k.redeem_script().unwrap(), redeem_binary_oracle_select(&a, &b, &c, &d, 144, &a).unwrap());
        assert_eq!(k.kind_str(), "binary_oracle_select:144");
        assert_eq!(k.catalog_id(), "p2sh_binary_oracle_select");
        assert_eq!(SpendKind::parse("binary_oracle_select:144"), Some(SpendKind::BinaryOracleSelect { min_sequence: 144 }));
        assert_eq!(SpendKind::parse("binary_oracle_select:144").unwrap().sig_op_count(), 3);
    }

    #[test]
    fn timedecay_multisig_now_and_after_timeout() {
        let k1 = test_keypair(101);
        let k2 = test_keypair(102);
        let k3 = test_keypair(103);
        let pks = [
            k1.x_only_public_key().0.serialize(),
            k2.x_only_public_key().0.serialize(),
            k3.x_only_public_key().0.serialize(),
        ];
        let lock_daa: u64 = 4_000_000;
        // 2-of-3 now, 1-of-3 after the timeout.
        let redeem = redeem_timedecay_multisig(&pks, 2, 1, lock_daa).unwrap();

        // NOW: any 2 of the 3 satisfy the IF branch (lock_time irrelevant).
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| build_timedecay_signature_script(s, 0, &[k1, k2], &redeem, false).unwrap()),
            "2-of-3 on the IF branch must pass"
        );
        // NOW with only 1 signature fails (needs 2).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| build_timedecay_signature_script(s, 0, &[k1], &redeem, false).unwrap()),
            "1 signature on the 2-of-3 IF branch must fail"
        );
        // AFTER the timeout: just 1 of the 3 satisfies the ELSE branch (lock_time >= lock_daa).
        assert!(
            run_spend_generic(&redeem, lock_daa, 0, |s| build_timedecay_signature_script(s, 0, &[k3], &redeem, true).unwrap()),
            "1-of-3 after the timeout must pass"
        );
        // The ELSE branch BEFORE the timeout fails (CLTV).
        assert!(
            !run_spend_generic(&redeem, lock_daa - 1, 0, |s| build_timedecay_signature_script(s, 0, &[k3], &redeem, true).unwrap()),
            "the ELSE branch before the timeout must fail"
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
                assemble_noncustodial_satisfier("multisig", false, &redeem, &members, &sigs, None, None, None, true).unwrap()
            }),
            "2-of-2 non-custodial multisig must satisfy the lock"
        );
        // Only one signature -> the engine rejects (needs both).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let sigs = ext_sigs(s, &[&kp1]);
                assemble_noncustodial_satisfier("multisig", false, &redeem, &members, &sigs, None, None, None, true).unwrap()
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
                assemble_noncustodial_satisfier("htlc", false, &redeem, &members, &empty_sigs(), Some(&solo), Some(preimage), None, true).unwrap()
            }),
            "non-custodial HTLC claim must satisfy"
        );
        // Claim with the WRONG preimage -> OpEqualVerify fails.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let solo = ext_solo(s, &receiver);
                assemble_noncustodial_satisfier("htlc", false, &redeem, &members, &empty_sigs(), Some(&solo), Some(b"wrong"), None, true).unwrap()
            }),
            "HTLC claim with a wrong preimage must fail"
        );
        // Refund: sender signs, lock_time = lock_daa.
        assert!(
            run_spend_generic(&redeem, lock_daa, 0, |s| {
                let solo = ext_solo(s, &sender);
                assemble_noncustodial_satisfier("htlc", true, &redeem, &members, &empty_sigs(), Some(&solo), None, None, true).unwrap()
            }),
            "non-custodial HTLC refund at lock_daa must satisfy"
        );
        // Refund before the timelock elapses -> not finalized.
        assert!(
            !run_spend_generic(&redeem, lock_daa - 1, 0, |s| {
                let solo = ext_solo(s, &sender);
                assemble_noncustodial_satisfier("htlc", true, &redeem, &members, &empty_sigs(), Some(&solo), None, None, true).unwrap()
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
                assemble_noncustodial_satisfier("channel", false, &redeem, &members, &sigs, None, None, None, true).unwrap()
            }),
            "non-custodial channel cooperative close must satisfy"
        );
        // Close with a wrong player2 signature -> rejected.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let mut sigs = ext_sigs(s, &[&p1]);
                sigs.insert(hex::encode(xp2), ext_solo(s, &wrong));
                assemble_noncustodial_satisfier("channel", false, &redeem, &members, &sigs, None, None, None, true).unwrap()
            }),
            "channel close with a forged player2 signature must fail"
        );
        // Refund: funder (p1) signs, lock_time = lock_daa.
        assert!(
            run_spend_generic(&redeem, lock_daa, 0, |s| {
                let solo = ext_solo(s, &p1);
                assemble_noncustodial_satisfier("channel", true, &redeem, &members, &empty_sigs(), Some(&solo), None, None, true).unwrap()
            }),
            "non-custodial channel refund by the funder must satisfy"
        );
        // Refund signed by a non-funder -> rejected.
        assert!(
            !run_spend_generic(&redeem, lock_daa, 0, |s| {
                let solo = ext_solo(s, &wrong);
                assemble_noncustodial_satisfier("channel", true, &redeem, &members, &empty_sigs(), Some(&solo), None, None, true).unwrap()
            }),
            "only the funder can refund the channel (non-custodial)"
        );
    }

    #[test]
    fn noncustodial_oracle_enforced_cosign() {
        // oracle_enforced = redeem_multisig([oracle, winner], 2). The non-custodial co-sign
        // combines the SERVER oracle signature with the WINNER's browser signature over the
        // SAME sighash; the satisfier must satisfy the 2-of-2, and a missing or forged half
        // must fail. members(checksig_only=false) = [oracle, winner].
        let oracle = test_keypair(61);
        let winner = test_keypair(62);
        let wrong = test_keypair(99);
        let xo = oracle.x_only_public_key().0.serialize();
        let xw = winner.x_only_public_key().0.serialize();
        let redeem = redeem_multisig(&[xo, xw], 2).unwrap();
        let members = parse_redeem_pubkeys(&redeem, false);
        assert_eq!(members, vec![xo, xw], "oracle_enforced parse must yield [oracle, winner]");
        // oracle sig (server) + winner sig (browser) -> valid.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xw), ext_solo(s, &winner));
                assemble_noncustodial_satisfier("oracle_enforced", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "oracle 2-of-2 with the oracle + winner signatures must satisfy"
        );
        // Winner signature forged by a non-winner -> rejected (the chain binds the winner key).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xw), ext_solo(s, &wrong));
                assemble_noncustodial_satisfier("oracle_enforced", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "a forged winner signature must not satisfy the oracle 2-of-2"
        );
    }

    #[test]
    fn noncustodial_oracle_escrow_cosign() {
        // oracle_escrow = <oracle> CheckSigVerify IF <a> CheckSig ELSE <b> CheckSig ENDIF.
        // The winning player's browser sig + the server oracle sig + the right branch
        // selector must satisfy; the loser's sig (or the wrong branch) must fail.
        let oracle = test_keypair(71);
        let player_a = test_keypair(72);
        let player_b = test_keypair(73);
        let xo = oracle.x_only_public_key().0.serialize();
        let xa = player_a.x_only_public_key().0.serialize();
        let xb = player_b.x_only_public_key().0.serialize();
        let redeem = redeem_oracle_escrow(&xo, &xa, &xb).unwrap();
        let members = parse_redeem_pubkeys(&redeem, true);
        assert_eq!(members, vec![xo, xa, xb], "oracle_escrow parse must yield [oracle, player_a, player_b]");
        // Player A wins (winner_is_a = true): oracle sig + player A sig + IF branch -> valid.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xa), ext_solo(s, &player_a));
                assemble_noncustodial_satisfier("oracle_escrow", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "oracle_escrow payout to the winning player A must satisfy"
        );
        // Player B wins (winner_is_a = false): oracle sig + player B sig + ELSE branch -> valid.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xb), ext_solo(s, &player_b));
                assemble_noncustodial_satisfier("oracle_escrow", false, &redeem, &members, &sigs, None, None, Some(&osig), false).unwrap()
            }),
            "oracle_escrow payout to the winning player B must satisfy"
        );
        // The LOSER (player B) tries to take player A's branch with the oracle sig present:
        // player B's signature does not satisfy player A's OpCheckSig -> rejected. This is the
        // anti-redirect guarantee: even with the oracle co-signature, only the real winner's
        // own signature releases their branch.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xa), ext_solo(s, &player_b)); // wrong signer for the A branch
                assemble_noncustodial_satisfier("oracle_escrow", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "the loser cannot take the winner's branch even with the oracle co-signature"
        );
    }

    /// Wiring + sig_op_count for the two refundable oracle kinds: redeem_script() must be
    /// byte-identical to the free builders, kind_str()/SpendKind::parse() must round-trip, and
    /// the static sig_op_count must match what the node counts (every CheckSig/CheckSigVerify,
    /// + the multisig's per-pubkey count).
    #[test]
    fn refundable_oracle_kinds_wiring() {
        let o = [11u8; 32];
        let w = [22u8; 32];
        let a = [33u8; 32];
        let b = [44u8; 32];
        let rf = [55u8; 32];

        // oracle_enforced_refundable: byte-identical, round-trips, 3 sig ops (2 multisig + 1 refund).
        let ker = RedeemKind::OracleEnforcedRefundable { oracle: o, winner: w, min_sequence: 144, refund: rf };
        assert_eq!(ker.redeem_script().unwrap(), redeem_oracle_enforced_refundable(&o, &w, 144, &rf).unwrap());
        assert_eq!(ker.kind_str(), "oracle_enforced_refundable:144");
        assert_eq!(ker.catalog_id(), "oracle_enforced_refundable");
        assert_eq!(
            SpendKind::parse("oracle_enforced_refundable:144"),
            Some(SpendKind::OracleEnforcedRefundable { min_sequence: 144 })
        );
        assert_eq!(SpendKind::parse("oracle_enforced_refundable:144").unwrap().sig_op_count(), 3);

        // oracle_escrow_refundable: byte-identical, round-trips, 4 sig ops (CSV(oracle) + a + b + refund).
        let kes = RedeemKind::OracleEscrowRefundable { oracle: o, player_a: a, player_b: b, min_sequence: 200, refund: rf };
        assert_eq!(kes.redeem_script().unwrap(), redeem_oracle_escrow_refundable(&o, &a, &b, 200, &rf).unwrap());
        assert_eq!(kes.kind_str(), "oracle_escrow_refundable:200");
        assert_eq!(kes.catalog_id(), "oracle_escrow_refundable");
        assert_eq!(
            SpendKind::parse("oracle_escrow_refundable:200"),
            Some(SpendKind::OracleEscrowRefundable { min_sequence: 200 })
        );
        assert_eq!(SpendKind::parse("oracle_escrow_refundable:200").unwrap().sig_op_count(), 4);

        // The refundable IF-branch is the existing redeem spliced in verbatim: the
        // oracle_enforced_refundable IF body equals the oracle_enforced 2-of-2 multisig bytes, so
        // already-deployed covenants are provably untouched.
        let ms = redeem_multisig(&[o, w], 2).unwrap();
        let er = redeem_oracle_enforced_refundable(&o, &w, 144, &rf).unwrap();
        assert_eq!(&er[1..1 + ms.len()], &ms[..], "enforced_refundable IF branch must be the exact oracle_enforced 2-of-2 bytes");
    }

    /// The frozen-funds fix, proven against the REAL kaspa-txscript interpreter. The refundable
    /// oracle-escrow wraps the existing `<oracle> CheckSigVerify IF <a> CheckSig ELSE <b> CheckSig
    /// ENDIF` in an outer OP_IF and adds an OP_ELSE CSV refund. Proves (a) oracle+A claims the IF
    /// branch, (b) oracle+B claims, (c) the refund key with sequence >= min_sequence reclaims via
    /// the ELSE, (d) the refund FAILS below min_sequence (no early pull), and (e) no non-member key
    /// can take any branch and the oracle alone cannot claim.
    #[test]
    fn noncustodial_oracle_escrow_refundable_claim_and_csv_refund() {
        let oracle = test_keypair(91);
        let player_a = test_keypair(92);
        let player_b = test_keypair(93);
        let refund = test_keypair(94);
        let outsider = test_keypair(95);
        let xo = oracle.x_only_public_key().0.serialize();
        let xa = player_a.x_only_public_key().0.serialize();
        let xb = player_b.x_only_public_key().0.serialize();
        let xr = refund.x_only_public_key().0.serialize();
        let min_seq: u64 = 144;
        let redeem = redeem_oracle_escrow_refundable(&xo, &xa, &xb, min_seq, &xr).unwrap();
        // checksig_only parse keeps the four pubkeys each directly followed by a checksig(verify).
        let members = parse_redeem_pubkeys(&redeem, true);
        assert_eq!(members, vec![xo, xa, xb, xr], "parse must yield [oracle, player_a, player_b, refund]");

        // (a) oracle + player A satisfy the IF branch (winner A claims), lock_time/sequence irrelevant.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xa), ext_solo(s, &player_a));
                assemble_noncustodial_satisfier("oracle_escrow_refundable", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "(a) oracle + A must claim the IF branch"
        );
        // (b) oracle + player B satisfy the inner ELSE (winner B claims).
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xb), ext_solo(s, &player_b));
                assemble_noncustodial_satisfier("oracle_escrow_refundable", false, &redeem, &members, &sigs, None, None, Some(&osig), false).unwrap()
            }),
            "(b) oracle + B must claim"
        );
        // (c) refund key with input.sequence >= min_seq satisfies the outer ELSE (CSV refund).
        assert!(
            run_spend_generic(&redeem, 0, min_seq, |s| {
                let rsig = ext_solo(s, &refund);
                assemble_noncustodial_satisfier("oracle_escrow_refundable", true, &redeem, &members, &empty_sigs(), Some(&rsig), None, None, true).unwrap()
            }),
            "(c) the funder must reclaim once the UTXO has aged min_sequence"
        );
        // (d) refund BELOW min_seq fails - funds cannot be pulled before the CSV matures (BIP68).
        assert!(
            !run_spend_generic(&redeem, 0, min_seq - 1, |s| {
                let rsig = ext_solo(s, &refund);
                assemble_noncustodial_satisfier("oracle_escrow_refundable", true, &redeem, &members, &empty_sigs(), Some(&rsig), None, None, true).unwrap()
            }),
            "(d) the refund must be rejected before the relative timelock matures"
        );
        // (e1) a non-member key cannot take the refund branch even at maturity (final OpCheckSig).
        assert!(
            !run_spend_generic(&redeem, 0, min_seq, |s| {
                let osig = ext_solo(s, &outsider);
                assemble_noncustodial_satisfier("oracle_escrow_refundable", true, &redeem, &members, &empty_sigs(), Some(&osig), None, None, true).unwrap()
            }),
            "(e) a non-refund key cannot take the refund branch (no theft)"
        );
        // (e2) the oracle alone (no winning player sig, taking A's branch) cannot claim: the inner
        // OpCheckSig for player A fails because the oracle co-sign is supplied as the winner sig.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xa), ext_solo(s, &oracle)); // oracle masquerading as winner A
                assemble_noncustodial_satisfier("oracle_escrow_refundable", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "(e) the oracle alone cannot claim a player's branch"
        );
        // (e3) the loser cannot take the winner's branch even with the oracle co-sign (anti-redirect).
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xa), ext_solo(s, &player_b)); // B signing A's branch
                assemble_noncustodial_satisfier("oracle_escrow_refundable", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "(e) the loser cannot take the winner's branch even with the oracle co-sign"
        );
        // (e4) the claim branch with a forged (non-oracle) co-sign fails at the leading CheckSigVerify.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &outsider); // not the oracle
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xa), ext_solo(s, &player_a));
                assemble_noncustodial_satisfier("oracle_escrow_refundable", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "(e) without the real oracle co-sign the IF branch is unspendable"
        );
    }

    /// The frozen-funds fix for the oracle-enforced 2-of-2 (oracle + winner), proven against the
    /// REAL interpreter. The IF branch is the existing 2-of-2 multisig; the ELSE is a CSV refund.
    /// Proves (a)/(b) the oracle + winner co-sign claims the IF branch (and the LOSER/forged
    /// winner cannot), (c) the refund key matured reclaims the ELSE, (d) it FAILS before maturity,
    /// and (e) a non-member cannot take any branch and the oracle alone cannot claim.
    #[test]
    fn noncustodial_oracle_enforced_refundable_claim_and_csv_refund() {
        let oracle = test_keypair(81);
        let winner = test_keypair(82);
        let refund = test_keypair(84);
        let outsider = test_keypair(85);
        let xo = oracle.x_only_public_key().0.serialize();
        let xw = winner.x_only_public_key().0.serialize();
        let xr = refund.x_only_public_key().0.serialize();
        let min_seq: u64 = 100;
        let redeem = redeem_oracle_enforced_refundable(&xo, &xw, min_seq, &xr).unwrap();
        // The IF body is a 2-of-2 multisig (pubkeys NOT followed by checksig), the refund key IS;
        // checksig_only=false keeps every 0x20<32> push: [oracle, winner, refund].
        let members = parse_redeem_pubkeys(&redeem, false);
        assert_eq!(members, vec![xo, xw, xr], "parse must yield [oracle, winner, refund]");

        // (a) oracle (server) + winner (browser) satisfy the IF branch 2-of-2.
        assert!(
            run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xw), ext_solo(s, &winner));
                assemble_noncustodial_satisfier("oracle_enforced_refundable", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "(a) oracle + winner must claim the IF branch 2-of-2"
        );
        // (b) a forged winner signature (non-winner) fails: the chain binds the winner key.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xw), ext_solo(s, &outsider));
                assemble_noncustodial_satisfier("oracle_enforced_refundable", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "(b) a forged winner signature must not satisfy the IF branch"
        );
        // (c) refund key with input.sequence >= min_seq satisfies the outer ELSE (CSV refund).
        assert!(
            run_spend_generic(&redeem, 0, min_seq, |s| {
                let rsig = ext_solo(s, &refund);
                assemble_noncustodial_satisfier("oracle_enforced_refundable", true, &redeem, &members, &empty_sigs(), Some(&rsig), None, None, true).unwrap()
            }),
            "(c) the funder must reclaim once the UTXO has aged min_sequence"
        );
        // (d) refund BELOW min_seq fails - the CSV has not matured.
        assert!(
            !run_spend_generic(&redeem, 0, min_seq - 1, |s| {
                let rsig = ext_solo(s, &refund);
                assemble_noncustodial_satisfier("oracle_enforced_refundable", true, &redeem, &members, &empty_sigs(), Some(&rsig), None, None, true).unwrap()
            }),
            "(d) the refund must be rejected before the relative timelock matures"
        );
        // (e1) a non-member key cannot take the refund branch even at maturity.
        assert!(
            !run_spend_generic(&redeem, 0, min_seq, |s| {
                let osig = ext_solo(s, &outsider);
                assemble_noncustodial_satisfier("oracle_enforced_refundable", true, &redeem, &members, &empty_sigs(), Some(&osig), None, None, true).unwrap()
            }),
            "(e) a non-refund key cannot take the refund branch (no theft)"
        );
        // (e2) the oracle alone (no winner) cannot claim the IF branch 2-of-2: a single sig fails.
        assert!(
            !run_spend_generic(&redeem, 0, 0, |s| {
                let osig = ext_solo(s, &oracle);
                let mut sigs = std::collections::HashMap::new();
                sigs.insert(hex::encode(xw), ext_solo(s, &oracle)); // oracle masquerading as the winner
                assemble_noncustodial_satisfier("oracle_enforced_refundable", false, &redeem, &members, &sigs, None, None, Some(&osig), true).unwrap()
            }),
            "(e) the oracle alone cannot satisfy the 2-of-2 claim"
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
