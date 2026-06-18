//! Covenant template decompiler -- the ASM -> (kind + named params + branches) layer of
//! the Covex reader (the part where Kaspa beats general EVM decompilation: covenants are
//! not arbitrary bytecode, they are a small set of known P2SH templates). It inverts the
//! `covenant_builder::redeem_*` builders.
//!
//! Strategy:
//!  1. Tokenize the redeem script with the byte-faithful `disassembler`.
//!  2. Normalize: collapse every value-push (data push, small-int OpN, OpFalse, Op1Negate)
//!     to a generic hole, leaving the structural opcodes. Match that shape against shapes
//!     generated AT RUNTIME from the builders themselves (with sentinel params), so the
//!     decoder can never drift from the builders. Variable-arity kinds (multisig, time-decay)
//!     are matched by dedicated structural detectors.
//!  3. Bind the holes to a concrete `RedeemKind`.
//!  4. VERIFY BY RE-EMIT: rebuild the redeem from the decoded `RedeemKind` and assert it is
//!     byte-identical to the input. This is the "Verified covenant" badge -- deterministic,
//!     in-repo, no external compiler -- and it makes the decoder self-checking: a mis-bound
//!     param yields `verified: false`, never a false positive. (Etherscan recompiles source
//!     and matches bytecode; the P2SH path gives the same guarantee for free.)
//!
//! Honesty: unrecognized scripts fall back to `matched: false` with the raw ASM and a
//! "non-standard" label, never a guessed kind. A bare N-of-N multisig is reported as exactly
//! that; the fact that Covex also uses a 2-of-2 as `oracle_enforced` is surfaced as a note,
//! not asserted, because the two are byte-identical.

use serde::Serialize;

use crate::covenant_builder::{
    blake2b256, redeem_binary_oracle_select, redeem_channel, redeem_deadman, redeem_hashlock,
    redeem_htlc, redeem_multisig, redeem_oracle_enforced_refundable, redeem_oracle_escrow,
    redeem_oracle_escrow_refundable, redeem_relative_timelock, redeem_singlesig, redeem_timelock,
    RedeemKind,
};
use crate::disassembler::{self, Token};

/// One decoded, named parameter.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct DecodedParam {
    /// Semantic role, e.g. `xonly_pubkey`, `oracle`, `hash`, `lock_daa`, `min_sequence`.
    pub role: String,
    /// Value type: `pubkey` | `hash32` | `daa` | `sequence` | `int`.
    pub r#type: String,
    /// Human-readable value (hex for keys/hashes, decimal for numbers).
    pub value: String,
}

/// One spendable branch (feeds the thirdweb-style Write tab).
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct SpendBranch {
    pub name: String,
    /// The on-chain condition this branch enforces.
    pub condition: String,
    /// The satisfier (signature_script) the spender must supply, bottom of stack first.
    pub satisfier: String,
}

/// The result of decompiling a redeem script.
#[derive(Clone, Debug, Serialize)]
pub struct Decoded {
    /// True if the script matched a known covenant template.
    pub matched: bool,
    /// The canonical kind id (e.g. `singlesig`, `htlc:1000`, `multisig:3`), or `non-standard`.
    pub kind: String,
    /// Human title for the UI.
    pub label: String,
    /// Honest enforcement reality for this kind.
    pub reality: String,
    /// True only if re-emitting the redeem from the decoded params reproduces the input
    /// byte-for-byte. This is the "Verified covenant" badge.
    pub verified: bool,
    pub params: Vec<DecodedParam>,
    pub branches: Vec<SpendBranch>,
    pub byte_len: usize,
    pub opcode_count: usize,
    /// The full ASM listing (from the disassembler).
    pub asm: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

// ---- hole helpers -----------------------------------------------------------------------

/// A value-push token is anything that pushes a value: a data push, a small-int opcode
/// (Op1..Op16 / OpTrue), OpFalse, or Op1Negate. Everything else is a structural opcode.
fn is_value_push(t: &Token) -> bool {
    t.is_push || matches!(t.opcode, 0x4f | 0x51..=0x60)
}

fn hole_bytes(t: &Token) -> Vec<u8> {
    t.data_hex
        .as_ref()
        .map(|h| hex::decode(h).unwrap_or_default())
        .unwrap_or_default()
}

/// Interpret a value-push as an unsigned integer (little-endian for data pushes; the implied
/// value for small-int opcodes). Used for lock DAAs, sequences, and multisig thresholds.
fn hole_u64(t: &Token) -> u64 {
    match t.opcode {
        0x00 => 0,                                  // OpFalse
        0x51..=0x60 => (t.opcode - 0x50) as u64,    // OpTrue(=1)..Op16
        0x4f => 0,                                  // Op1Negate (-1; never a valid lock)
        _ => {
            let b = hole_bytes(t);
            let mut v = 0u64;
            for (i, byte) in b.iter().take(8).enumerate() {
                v |= (*byte as u64) << (8 * i);
            }
            v
        }
    }
}

/// Interpret a value-push as a 32-byte key/hash, or `None` if it is not a 32-byte data push.
fn hole_key(t: &Token) -> Option<[u8; 32]> {
    let b = hole_bytes(t);
    if b.len() == 32 {
        let mut a = [0u8; 32];
        a.copy_from_slice(&b);
        Some(a)
    } else {
        None
    }
}

// ---- shape matching ---------------------------------------------------------------------

/// A normalized script shape: structural opcodes interleaved with value-push holes.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Shape {
    Op(u8),
    Hole,
}

fn shape_of(tokens: &[Token]) -> Vec<Shape> {
    tokens
        .iter()
        .map(|t| if is_value_push(t) { Shape::Hole } else { Shape::Op(t.opcode) })
        .collect()
}

/// The value-push tokens (the holes), in script order.
fn holes_of(tokens: &[Token]) -> Vec<&Token> {
    tokens.iter().filter(|t| is_value_push(t)).collect()
}

/// The fixed-arity templates, with their shapes generated from the builders themselves
/// (sentinel params) so the decoder stays in lockstep with the builders. Variable-arity
/// kinds (multisig, time-decay) are handled by the structural detectors below.
fn fixed_specs() -> Vec<(&'static str, Vec<u8>)> {
    let p1 = [0x21u8; 32];
    let p2 = [0x22u8; 32];
    let p3 = [0x23u8; 32];
    let h1 = [0x31u8; 32];
    let h2 = [0x32u8; 32];
    let lock = 1_000_000u64; // large enough to force a data push, not a small-int opcode
    let seq = 1000u64;
    vec![
        ("singlesig", redeem_singlesig(&p1).unwrap()),
        ("hashlock", redeem_hashlock(&h1, &p1).unwrap()),
        ("timelock", redeem_timelock(lock, &p1).unwrap()),
        ("rcsv", redeem_relative_timelock(seq, &p1).unwrap()),
        ("htlc", redeem_htlc(&h1, &p1, lock, &p2).unwrap()),
        ("channel", redeem_channel(&p1, &p2, lock).unwrap()),
        ("deadman", redeem_deadman(&p1, &p2, lock).unwrap()),
        ("oracle_escrow", redeem_oracle_escrow(&p1, &p2, &p3).unwrap()),
        ("binary_oracle_select", redeem_binary_oracle_select(&h1, &p1, &h2, &p2, seq, &p3).unwrap()),
        ("oracle_escrow_refundable", redeem_oracle_escrow_refundable(&p1, &p2, &p3, seq, &p1).unwrap()),
        ("oracle_enforced_refundable", redeem_oracle_enforced_refundable(&p1, &p2, seq, &p3).unwrap()),
    ]
}

/// Build a concrete `RedeemKind` from a matched fixed template's holes. Returns `None` if a
/// key/hash hole is not a 32-byte push (so a malformed look-alike does not get mislabeled).
fn construct_fixed(kind: &str, h: &[&Token]) -> Option<RedeemKind> {
    Some(match kind {
        "singlesig" => RedeemKind::SingleSig { xonly_pubkey: hole_key(h[0])? },
        "hashlock" => RedeemKind::HashLock { hash: hole_key(h[0])?, xonly_pubkey: hole_key(h[1])? },
        "timelock" => RedeemKind::Timelock { lock_daa: hole_u64(h[0]), xonly_pubkey: hole_key(h[1])? },
        "rcsv" => RedeemKind::RelativeTimelock { min_sequence: hole_u64(h[0]), xonly_pubkey: hole_key(h[1])? },
        "htlc" => RedeemKind::Htlc {
            hash: hole_key(h[0])?,
            receiver_pubkey: hole_key(h[1])?,
            lock_daa: hole_u64(h[2]),
            sender_pubkey: hole_key(h[3])?,
        },
        "channel" => RedeemKind::Channel { p1: hole_key(h[0])?, p2: hole_key(h[1])?, lock_daa: hole_u64(h[2]) },
        "deadman" => RedeemKind::Deadman { owner: hole_key(h[0])?, heir: hole_key(h[2])?, lock_daa: hole_u64(h[1]) },
        "oracle_escrow" => RedeemKind::OracleEscrow {
            oracle: hole_key(h[0])?,
            player_a: hole_key(h[1])?,
            player_b: hole_key(h[2])?,
        },
        "binary_oracle_select" => RedeemKind::BinaryOracleSelect {
            h_a: hole_key(h[0])?,
            winner_a: hole_key(h[1])?,
            h_b: hole_key(h[2])?,
            winner_b: hole_key(h[3])?,
            min_sequence: hole_u64(h[4]),
            refund: hole_key(h[5])?,
        },
        "oracle_escrow_refundable" => RedeemKind::OracleEscrowRefundable {
            oracle: hole_key(h[0])?,
            player_a: hole_key(h[1])?,
            player_b: hole_key(h[2])?,
            min_sequence: hole_u64(h[3]),
            refund: hole_key(h[4])?,
        },
        // holes: [threshold, oracle, winner, key_count, min_sequence, refund]
        "oracle_enforced_refundable" => RedeemKind::OracleEnforcedRefundable {
            oracle: hole_key(h[1])?,
            winner: hole_key(h[2])?,
            min_sequence: hole_u64(h[4]),
            refund: hole_key(h[5])?,
        },
        _ => return None,
    })
}

// ---- structural detectors (variable arity) ----------------------------------------------

/// A plain N-of-M multisig: `<threshold> <pk1..pkM> <count> OpCheckMultiSig`.
fn try_multisig(tokens: &[Token]) -> Option<RedeemKind> {
    if tokens.len() < 4 {
        return None;
    }
    let last = tokens.last()?;
    if last.opcode != 0xae {
        return None; // OpCheckMultiSig
    }
    // tokens[0] = threshold (value-push), tokens[1..n+1] = n key pushes, tokens[n+1] = count.
    if !is_value_push(&tokens[0]) {
        return None;
    }
    let required = hole_u64(&tokens[0]) as usize;
    let mut keys: Vec<[u8; 32]> = Vec::new();
    let mut i = 1;
    while i < tokens.len() - 2 {
        let k = hole_key(&tokens[i])?;
        keys.push(k);
        i += 1;
    }
    // Now tokens[i] must be the count value-push, then OpCheckMultiSig at i+1 (== last).
    if i + 2 != tokens.len() || !is_value_push(&tokens[i]) {
        return None;
    }
    let count = hole_u64(&tokens[i]) as usize;
    if count != keys.len() || required == 0 || required > keys.len() {
        return None;
    }
    Some(RedeemKind::Multisig { pubkeys: keys, required })
}

/// Parse a multisig sub-slice (`<threshold> <keys..> <count> OpCheckMultiSig`) returning
/// `(threshold, keys)` if the slice is exactly one multisig.
fn parse_multisig_slice(tokens: &[Token]) -> Option<(usize, Vec<[u8; 32]>)> {
    match try_multisig(tokens)? {
        RedeemKind::Multisig { pubkeys, required } => Some((required, pubkeys)),
        _ => None,
    }
}

/// Time-decaying multisig: `OpIf <ms_now> OpElse <lock> OpCheckLockTimeVerify <ms_after> OpEndIf`,
/// where both multisigs cover the same key set (threshold relaxes after the lock).
fn try_timedecay(tokens: &[Token]) -> Option<RedeemKind> {
    if tokens.first()?.opcode != 0x63 || tokens.last()?.opcode != 0x68 {
        return None; // OpIf ... OpEndIf
    }
    // Find the top-level OpElse (depth 1 -> 0 boundary), tracking nested IFs.
    let mut depth = 0i32;
    let mut else_idx = None;
    for (i, t) in tokens.iter().enumerate() {
        match t.opcode {
            0x63 | 0x64 => depth += 1,            // OpIf / OpNotIf
            0x68 => depth -= 1,                   // OpEndIf
            0x67 if depth == 1 => {               // OpElse at the outer level
                else_idx = Some(i);
                break;
            }
            _ => {}
        }
    }
    let else_idx = else_idx?;
    // ms_now = tokens[1..else_idx]
    let (req_now, keys_now) = parse_multisig_slice(&tokens[1..else_idx])?;
    // After OpElse: [lock value-push][OpCheckLockTimeVerify][ms_after..][OpEndIf]
    let after = &tokens[else_idx + 1..tokens.len() - 1];
    if after.len() < 3 || !is_value_push(&after[0]) || after[1].opcode != 0xb0 {
        return None; // OpCheckLockTimeVerify
    }
    let lock_daa = hole_u64(&after[0]);
    let (req_after, keys_after) = parse_multisig_slice(&after[2..])?;
    if keys_now != keys_after || req_after >= req_now {
        return None;
    }
    Some(RedeemKind::TimeDecay { pubkeys: keys_now, req_now, req_after, lock_daa })
}

// ---- describe a matched RedeemKind ------------------------------------------------------

fn hexv(b: &[u8; 32]) -> String {
    hex::encode(b)
}

fn params_for(kind: &RedeemKind) -> Vec<DecodedParam> {
    let pk = |role: &str, b: &[u8; 32]| DecodedParam {
        role: role.into(),
        r#type: "pubkey".into(),
        value: hexv(b),
    };
    let hash = |role: &str, b: &[u8; 32]| DecodedParam {
        role: role.into(),
        r#type: "hash32".into(),
        value: hexv(b),
    };
    let daa = |role: &str, v: u64| DecodedParam { role: role.into(), r#type: "daa".into(), value: v.to_string() };
    let seq = |role: &str, v: u64| DecodedParam {
        role: role.into(),
        r#type: "sequence".into(),
        value: v.to_string(),
    };
    match kind {
        RedeemKind::SingleSig { xonly_pubkey } => vec![pk("xonly_pubkey", xonly_pubkey)],
        RedeemKind::HashLock { hash: h, xonly_pubkey } => vec![hash("hash", h), pk("xonly_pubkey", xonly_pubkey)],
        RedeemKind::Timelock { lock_daa, xonly_pubkey } => vec![daa("lock_daa", *lock_daa), pk("xonly_pubkey", xonly_pubkey)],
        RedeemKind::RelativeTimelock { min_sequence, xonly_pubkey } => {
            vec![seq("min_sequence", *min_sequence), pk("xonly_pubkey", xonly_pubkey)]
        }
        RedeemKind::Multisig { pubkeys, required } => {
            let mut v = vec![DecodedParam { role: "threshold".into(), r#type: "int".into(), value: required.to_string() }];
            for (i, k) in pubkeys.iter().enumerate() {
                v.push(pk(&format!("pubkey_{}", i + 1), k));
            }
            v
        }
        RedeemKind::Htlc { hash: h, receiver_pubkey, lock_daa, sender_pubkey } => vec![
            hash("hash", h),
            pk("receiver_pubkey", receiver_pubkey),
            daa("lock_daa", *lock_daa),
            pk("sender_pubkey", sender_pubkey),
        ],
        RedeemKind::Channel { p1, p2, lock_daa } => {
            vec![pk("p1", p1), pk("p2", p2), daa("lock_daa", *lock_daa)]
        }
        RedeemKind::OracleEnforced { oracle, winner } => vec![pk("oracle", oracle), pk("winner", winner)],
        RedeemKind::OracleEscrow { oracle, player_a, player_b } => {
            vec![pk("oracle", oracle), pk("player_a", player_a), pk("player_b", player_b)]
        }
        RedeemKind::Deadman { owner, heir, lock_daa } => {
            vec![pk("owner", owner), pk("heir", heir), daa("lock_daa", *lock_daa)]
        }
        RedeemKind::TimeDecay { pubkeys, req_now, req_after, lock_daa } => {
            let mut v = vec![
                DecodedParam { role: "req_now".into(), r#type: "int".into(), value: req_now.to_string() },
                DecodedParam { role: "req_after".into(), r#type: "int".into(), value: req_after.to_string() },
                daa("lock_daa", *lock_daa),
            ];
            for (i, k) in pubkeys.iter().enumerate() {
                v.push(pk(&format!("pubkey_{}", i + 1), k));
            }
            v
        }
        RedeemKind::BinaryOracleSelect { h_a, winner_a, h_b, winner_b, min_sequence, refund } => vec![
            hash("h_a", h_a),
            pk("winner_a", winner_a),
            hash("h_b", h_b),
            pk("winner_b", winner_b),
            seq("min_sequence", *min_sequence),
            pk("refund", refund),
        ],
        RedeemKind::OracleEnforcedRefundable { oracle, winner, min_sequence, refund } => vec![
            pk("oracle", oracle),
            pk("winner", winner),
            seq("min_sequence", *min_sequence),
            pk("refund", refund),
        ],
        RedeemKind::OracleEscrowRefundable { oracle, player_a, player_b, min_sequence, refund } => vec![
            pk("oracle", oracle),
            pk("player_a", player_a),
            pk("player_b", player_b),
            seq("min_sequence", *min_sequence),
            pk("refund", refund),
        ],
    }
}

fn branch(name: &str, condition: &str, satisfier: &str) -> SpendBranch {
    SpendBranch { name: name.into(), condition: condition.into(), satisfier: satisfier.into() }
}

fn branches_for(kind: &RedeemKind) -> Vec<SpendBranch> {
    match kind {
        RedeemKind::SingleSig { .. } => vec![branch("spend", "Signed by the key holder", "<sig>")],
        RedeemKind::HashLock { .. } => vec![branch(
            "reveal",
            "Reveal preimage P where blake2b256(P) == hash, then sign",
            "<sig> <preimage>",
        )],
        RedeemKind::Timelock { lock_daa, .. } => vec![branch(
            "spend",
            &format!("After chain DAA reaches {lock_daa}, signed by the key holder"),
            "<sig> (tx.lock_time >= lock_daa, non-final input)",
        )],
        RedeemKind::RelativeTimelock { min_sequence, .. } => vec![branch(
            "spend",
            &format!("After the UTXO has aged {min_sequence} (BIP68), signed by the key holder"),
            "<sig> (input.sequence encodes >= min_sequence)",
        )],
        RedeemKind::Multisig { required, pubkeys } => vec![branch(
            "spend",
            &format!("{required}-of-{} signatures in key order", pubkeys.len()),
            "<sig_1> .. <sig_required>",
        )],
        RedeemKind::Htlc { lock_daa, .. } => vec![
            branch("claim", "IF: receiver reveals the preimage and signs", "<receiver_sig> <preimage> OP_TRUE"),
            branch(
                "refund",
                &format!("ELSE: sender refunds after DAA {lock_daa}"),
                "<sender_sig> OP_FALSE (tx.lock_time >= lock_daa)",
            ),
        ],
        RedeemKind::Channel { lock_daa, .. } => vec![
            branch("cooperative_close", "IF: both p1 and p2 sign (2-of-2)", "<p1_sig> <p2_sig> OP_TRUE"),
            branch("refund", &format!("ELSE: p1 refunds after DAA {lock_daa}"), "<p1_sig> OP_FALSE (tx.lock_time >= lock_daa)"),
        ],
        RedeemKind::OracleEnforced { .. } => vec![branch(
            "payout",
            "2-of-2: the disclosed oracle co-signs the winner's claim",
            "<oracle_sig> <winner_sig>",
        )],
        RedeemKind::OracleEscrow { .. } => vec![
            branch("player_a", "IF: oracle co-signs and player A signs", "<player_a_sig> OP_TRUE <oracle_sig>"),
            branch("player_b", "ELSE: oracle co-signs and player B signs", "<player_b_sig> OP_FALSE <oracle_sig>"),
        ],
        RedeemKind::Deadman { lock_daa, .. } => vec![
            branch("owner", "IF: the owner spends or refreshes at any time", "<owner_sig> OP_TRUE"),
            branch("heir", &format!("ELSE: the heir claims after DAA {lock_daa}"), "<heir_sig> OP_FALSE (tx.lock_time >= lock_daa)"),
        ],
        RedeemKind::TimeDecay { req_now, req_after, lock_daa, .. } => vec![
            branch("now", &format!("IF: {req_now} signatures before DAA {lock_daa}"), "<sigs..> OP_TRUE"),
            branch(
                "after",
                &format!("ELSE: only {req_after} signatures after DAA {lock_daa}"),
                "<sigs..> OP_FALSE (tx.lock_time >= lock_daa)",
            ),
        ],
        RedeemKind::BinaryOracleSelect { min_sequence, .. } => vec![
            branch("outcome_a", "Reveal preimage of h_a, signed by winner_a", "<winner_a_sig> <preimage_a> OP_TRUE"),
            branch("outcome_b", "Reveal preimage of h_b, signed by winner_b", "<winner_b_sig> <preimage_b> OP_TRUE OP_FALSE"),
            branch(
                "refund",
                &format!("Neither secret revealed: refund key after the UTXO ages {min_sequence}"),
                "<refund_sig> OP_FALSE OP_FALSE (input.sequence >= min_sequence)",
            ),
        ],
        RedeemKind::OracleEnforcedRefundable { min_sequence, .. } => vec![
            branch("payout", "IF: 2-of-2, the disclosed oracle co-signs the winner", "<...multisig...> OP_TRUE"),
            branch(
                "refund",
                &format!("ELSE: funder refunds after the UTXO ages {min_sequence}"),
                "<refund_sig> OP_FALSE (input.sequence >= min_sequence)",
            ),
        ],
        RedeemKind::OracleEscrowRefundable { min_sequence, .. } => vec![
            branch("player_a", "IF then inner IF: oracle co-signs and player A signs", "<player_a_sig> OP_TRUE <oracle_sig> OP_TRUE"),
            branch("player_b", "IF then inner ELSE: oracle co-signs and player B signs", "<player_b_sig> OP_FALSE <oracle_sig> OP_TRUE"),
            branch(
                "refund",
                &format!("ELSE: funder refunds after the UTXO ages {min_sequence}"),
                "<refund_sig> OP_FALSE (input.sequence >= min_sequence)",
            ),
        ],
    }
}

/// Honest enforcement reality per kind. Oracle kinds put custody + payouts on-chain but
/// require the disclosed oracle's co-signature (or its revealed secret), so they are hybrid.
fn reality_for(kind: &RedeemKind) -> &'static str {
    match kind {
        RedeemKind::OracleEnforced { .. }
        | RedeemKind::OracleEscrow { .. }
        | RedeemKind::OracleEnforcedRefundable { .. }
        | RedeemKind::OracleEscrowRefundable { .. } => {
            "on-chain custody; the disclosed oracle's co-signature is required to release (hybrid)"
        }
        RedeemKind::BinaryOracleSelect { .. } => {
            "on-chain custody and payouts; which branch wins is set by the secret the disclosed oracle reveals (hybrid)"
        }
        _ => "on-chain script-enforced (no oracle, no third party)",
    }
}

fn label_for(kind: &RedeemKind) -> String {
    match kind {
        RedeemKind::SingleSig { .. } => "Single-signature".into(),
        RedeemKind::HashLock { .. } => "Hashlock (commit/reveal)".into(),
        RedeemKind::Timelock { .. } => "Absolute timelock (CLTV)".into(),
        RedeemKind::RelativeTimelock { .. } => "Relative timelock (CSV)".into(),
        RedeemKind::Multisig { required, pubkeys } => format!("{required}-of-{} multisig", pubkeys.len()),
        RedeemKind::Htlc { .. } => "HTLC (atomic swap)".into(),
        RedeemKind::Channel { .. } => "Payment channel".into(),
        RedeemKind::OracleEnforced { .. } => "Oracle-enforced payout (2-of-2)".into(),
        RedeemKind::OracleEscrow { .. } => "Oracle-enforced escrow (2-player)".into(),
        RedeemKind::Deadman { .. } => "Dead-man's switch / inheritance".into(),
        RedeemKind::TimeDecay { .. } => "Time-decaying multisig".into(),
        RedeemKind::BinaryOracleSelect { .. } => "Binary outcome selector (market leg)".into(),
        RedeemKind::OracleEnforcedRefundable { .. } => "Oracle-enforced payout, refundable".into(),
        RedeemKind::OracleEscrowRefundable { .. } => "Oracle-enforced escrow, refundable".into(),
    }
}

/// Decompile a redeem script into kind + named params + branches, verified by re-emit.
pub fn decompile(redeem: &[u8]) -> Decoded {
    let dis = disassembler::disassemble(redeem, false);
    let tokens = &dis.tokens;

    // Match: structural detectors first (variable arity), then the fixed-template shapes.
    let matched_kind: Option<RedeemKind> = try_timedecay(tokens)
        .or_else(|| try_multisig(tokens))
        .or_else(|| {
            let shape = shape_of(tokens);
            for (kind, spec) in fixed_specs() {
                let spec_dis = disassembler::disassemble(&spec, false);
                if shape_of(&spec_dis.tokens) == shape {
                    let holes = holes_of(tokens);
                    if let Some(rk) = construct_fixed(kind, &holes) {
                        return Some(rk);
                    }
                }
            }
            None
        });

    match matched_kind {
        Some(rk) => {
            // Verify by re-emit: rebuilding the redeem must reproduce the input byte-for-byte.
            let verified = rk.redeem_script().map(|s| s == redeem).unwrap_or(false);
            let note = match &rk {
                RedeemKind::Multisig { required, pubkeys } if *required == 2 && pubkeys.len() == 2 => Some(
                    "A bare 2-of-2 multisig. Covex also deploys this exact shape as an oracle-enforced \
                     payout (oracle + winner); the two are byte-identical, so the roles cannot be told \
                     apart from the script alone."
                        .to_string(),
                ),
                _ => None,
            };
            Decoded {
                matched: true,
                kind: rk.kind_str(),
                label: label_for(&rk),
                reality: reality_for(&rk).to_string(),
                verified,
                params: params_for(&rk),
                branches: branches_for(&rk),
                byte_len: dis.byte_len,
                opcode_count: dis.opcode_count,
                asm: dis.asm,
                note,
            }
        }
        None => Decoded {
            matched: false,
            kind: "non-standard".into(),
            label: "Non-standard script".into(),
            reality: "unknown -- does not match any known Covex covenant template".into(),
            verified: false,
            params: vec![],
            branches: vec![],
            byte_len: dis.byte_len,
            opcode_count: dis.opcode_count,
            asm: dis.asm,
            note: dis.error.map(|e| format!("disassembly error: {e}")),
        },
    }
}

/// Does `blake2b256(redeem)` match an on-chain commitment? Accepts either the 32-byte hash
/// or the 35-byte P2SH script_pubkey `aa20<hash>87`.
pub fn commitment_matches(redeem: &[u8], commitment: &[u8]) -> Option<bool> {
    let h = blake2b256(redeem);
    if commitment.len() == 32 {
        Some(commitment == h)
    } else if commitment.len() == 35 && commitment[0] == 0xaa && commitment[1] == 0x20 && commitment[34] == 0x87 {
        Some(&commitment[2..34] == h)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(n: u8) -> [u8; 32] {
        [n; 32]
    }

    /// Every builder output must decode to the right kind AND verify by re-emit.
    #[test]
    fn round_trips_every_builder_kind() {
        let a = key(11);
        let b = key(22);
        let c = key(33);
        let h = key(44);
        let h2 = key(55);

        let cases: Vec<(&str, Vec<u8>)> = vec![
            ("singlesig", RedeemKind::SingleSig { xonly_pubkey: a }.redeem_script().unwrap()),
            ("hashlock", RedeemKind::HashLock { hash: h, xonly_pubkey: a }.redeem_script().unwrap()),
            ("timelock:500000", RedeemKind::Timelock { lock_daa: 500_000, xonly_pubkey: a }.redeem_script().unwrap()),
            ("rcsv:10", RedeemKind::RelativeTimelock { min_sequence: 10, xonly_pubkey: a }.redeem_script().unwrap()),
            ("rcsv:1000", RedeemKind::RelativeTimelock { min_sequence: 1000, xonly_pubkey: a }.redeem_script().unwrap()),
            ("multisig:3", RedeemKind::Multisig { pubkeys: vec![a, b, c], required: 2 }.redeem_script().unwrap()),
            ("htlc:7000", RedeemKind::Htlc { hash: h, receiver_pubkey: a, lock_daa: 7000, sender_pubkey: b }.redeem_script().unwrap()),
            ("channel:8000", RedeemKind::Channel { p1: a, p2: b, lock_daa: 8000 }.redeem_script().unwrap()),
            ("deadman:9000", RedeemKind::Deadman { owner: a, heir: b, lock_daa: 9000 }.redeem_script().unwrap()),
            ("oracle_escrow", RedeemKind::OracleEscrow { oracle: a, player_a: b, player_b: c }.redeem_script().unwrap()),
            ("timedecay:3:2:1:9000", RedeemKind::TimeDecay { pubkeys: vec![a, b, c], req_now: 2, req_after: 1, lock_daa: 9000 }.redeem_script().unwrap()),
            ("binary_oracle_select:64", RedeemKind::BinaryOracleSelect { h_a: h, winner_a: a, h_b: h2, winner_b: b, min_sequence: 64, refund: c }.redeem_script().unwrap()),
            ("oracle_enforced_refundable:64", RedeemKind::OracleEnforcedRefundable { oracle: a, winner: b, min_sequence: 64, refund: c }.redeem_script().unwrap()),
            ("oracle_escrow_refundable:64", RedeemKind::OracleEscrowRefundable { oracle: a, player_a: b, player_b: c, min_sequence: 64, refund: a }.redeem_script().unwrap()),
        ];

        for (expected_kind, script) in cases {
            let d = decompile(&script);
            assert!(d.matched, "[{expected_kind}] should match a template; got non-standard");
            assert_eq!(d.kind, expected_kind, "[{expected_kind}] wrong kind id");
            assert!(d.verified, "[{expected_kind}] re-emit verification failed (binding bug)");
            assert!(!d.params.is_empty(), "[{expected_kind}] no params decoded");
            assert!(!d.branches.is_empty(), "[{expected_kind}] no branches decoded");
        }
    }

    #[test]
    fn binds_hashlock_params_correctly() {
        let h = key(0xAB);
        let pk = key(0xCD);
        let script = RedeemKind::HashLock { hash: h, xonly_pubkey: pk }.redeem_script().unwrap();
        let d = decompile(&script);
        assert_eq!(d.kind, "hashlock");
        assert!(d.verified);
        assert_eq!(d.params[0].role, "hash");
        assert_eq!(d.params[0].value, hex::encode(h));
        assert_eq!(d.params[1].role, "xonly_pubkey");
        assert_eq!(d.params[1].value, hex::encode(pk));
        assert!(d.reality.contains("on-chain"));
    }

    #[test]
    fn multisig_arity_and_threshold() {
        let keys: Vec<[u8; 32]> = (1..=5).map(key).collect();
        let script = RedeemKind::Multisig { pubkeys: keys.clone(), required: 3 }.redeem_script().unwrap();
        let d = decompile(&script);
        assert_eq!(d.kind, "multisig:5");
        assert!(d.verified);
        assert_eq!(d.params[0].role, "threshold");
        assert_eq!(d.params[0].value, "3");
        assert_eq!(d.params.iter().filter(|p| p.role.starts_with("pubkey_")).count(), 5);
    }

    #[test]
    fn two_of_two_multisig_carries_oracle_note() {
        let script = RedeemKind::Multisig { pubkeys: vec![key(1), key(2)], required: 2 }.redeem_script().unwrap();
        let d = decompile(&script);
        assert_eq!(d.kind, "multisig:2");
        assert!(d.note.as_deref().unwrap_or("").contains("oracle-enforced"));
    }

    #[test]
    fn non_standard_falls_back_honestly() {
        // OpDup OpDrop -- a valid but non-template script.
        let d = decompile(&[0x76, 0x75]);
        assert!(!d.matched);
        assert_eq!(d.kind, "non-standard");
        assert!(!d.verified);
        assert!(d.params.is_empty());
    }

    #[test]
    fn commitment_match_accepts_hash_and_spk() {
        let script = RedeemKind::SingleSig { xonly_pubkey: key(7) }.redeem_script().unwrap();
        let h = blake2b256(&script);
        assert_eq!(commitment_matches(&script, &h), Some(true));
        let mut spk = vec![0xaa, 0x20];
        spk.extend_from_slice(&h);
        spk.push(0x87);
        assert_eq!(commitment_matches(&script, &spk), Some(true));
        assert_eq!(commitment_matches(&script, &[0u8; 32]), Some(false));
    }
}
