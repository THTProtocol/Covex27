//! Covenant script disassembler -- the byte -> ASM layer of the Covex decompiler
//! (the "opcode view" half of the Etherscan-grade reader). It turns a raw Kaspa
//! script (a recovered redeem script, a script_pubkey, or any script bytes) into a
//! token stream plus an ASM listing.
//!
//! Design notes:
//!  - The token walk is keyed on the OPCODE BYTE, never on a v0.15.0 enum name, so
//!    it stays correct across the covenant-era opcode renames/additions (KIP-16/17/20):
//!    a byte that reads as `OpUnknown178` today renders as `OpTxVersion` once the
//!    `toccata` flag is set, with no change to the parsing.
//!  - The push-data walk replicates kaspa-txscript 0.15.0's consensus tokenizer
//!    exactly: `OpData1..=OpData75` carry a fixed N data bytes; `OpPushData1/2/4`
//!    carry a little-endian length prefix (1/2/4 bytes) then that many data bytes;
//!    every other opcode is a single byte. The test `matches_consensus_tokenizer`
//!    cross-checks every token (opcode value + pushed data) against the crate's own
//!    `deserialize_next_opcode` over the full builder corpus plus random scripts, so
//!    any divergence from consensus fails the build.
//!  - The 256-entry name table is generated from the crate's `opcode_list!` macro
//!    (kaspa-txscript 0.15.0). The `toccata` overlay carries the KIP-16/17/20 opcode
//!    NAMES + byte values as published in the official KIPs (kaspanet/kips
//!    kip-0010 / kip-0016 / kip-0017 / kip-0020). This overlay is a DISPLAY aid, not
//!    consensus, and the bytes are sourced from the KIP specifications rather than the
//!    v2.0.1 node binary; only bytes the KIPs assign a concrete value are mapped, and
//!    anything uncertain is left as `OpUnknown*` rather than mislabeled.
//!  - Two distinct activations are tagged so the reader is honest about what is LIVE:
//!      * The 7 KIP-10 introspection opcodes (OpTxInputCount 0xb3, OpTxOutputCount 0xb4,
//!        OpTxInputIndex 0xb9, OpTxInputAmount 0xbe, OpTxInputSpk 0xbf,
//!        OpTxOutputAmount 0xc2, OpTxOutputSpk 0xc3) have been consensus-active on Kaspa
//!        MAINNET since the Crescendo hard fork (May 2025). They carry
//!        `kip: "KIP-10"`, `mainnet_live: true`.
//!      * Every other overlay opcode (the rest of KIP-17's extended introspection +
//!        OpCat/OpSubStr/OpMul/OpBlake3/OpCheckSigFromStack, KIP-20 covenant IDs, and
//!        KIP-16's OpZkPrecompile 0xa6) is GATED on the Toccata fork (mainnet ~mid-2026)
//!        and is NOT live on mainnet yet. These carry `mainnet_live: false`.
//!    Both groups are flagged `introspection: true` only when `toccata = true`, so the
//!    UI never presents Toccata names as live-today.

use serde::Serialize;

fn is_false(b: &bool) -> bool {
    !*b
}

/// One disassembled instruction.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Token {
    /// Byte offset of this instruction's opcode within the script.
    pub offset: usize,
    /// The opcode byte.
    pub opcode: u8,
    /// Canonical Kaspa opcode name (e.g. `OpData32`, `OpCheckSig`, `OpBlake2b`).
    pub name: String,
    /// ASM rendering of this single instruction.
    pub asm: String,
    /// Total bytes this instruction consumes (opcode + any length prefix + data).
    pub size: usize,
    /// Pushed data as hex, for push opcodes that carry data (omitted otherwise).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_hex: Option<String>,
    /// A data/number push opcode.
    #[serde(skip_serializing_if = "is_false")]
    pub is_push: bool,
    /// Disabled under the 0.15.0 consensus VM (script fails if it executes).
    #[serde(skip_serializing_if = "is_false")]
    pub disabled: bool,
    /// Always illegal (renders the whole script unspendable even unexecuted).
    #[serde(skip_serializing_if = "is_false")]
    pub illegal: bool,
    /// A flow-control opcode (`OpIf`/`OpNotIf`/`OpElse`/`OpEndIf`).
    #[serde(skip_serializing_if = "is_false")]
    pub conditional: bool,
    /// Reserved / unimplemented byte under the current (pre-Toccata) VM. Such a byte
    /// fails if executed today; set `toccata` to see its proposed introspection name.
    #[serde(skip_serializing_if = "is_false")]
    pub reserved_unknown: bool,
    /// A Toccata-era introspection / covenant / ZK opcode (KIP-16/17/20). Only set when
    /// the caller passes `toccata = true`; the KIP-17/20/16 names below activate on
    /// mainnet at the Toccata fork. (The 7 KIP-10 introspection bytes are a separate,
    /// Crescendo-live subset, distinguished by `kip` / `mainnet_live`.)
    #[serde(skip_serializing_if = "is_false")]
    pub introspection: bool,
    /// Which Kaspa improvement proposal owns this opcode, when known and the `toccata`
    /// overlay is on (e.g. "KIP-10", "KIP-16", "KIP-17", "KIP-20"). Display only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kip: Option<&'static str>,
    /// True only for the 7 KIP-10 introspection opcodes, which have been consensus-active
    /// on Kaspa mainnet since the Crescendo hard fork (May 2025). Every other overlay
    /// opcode (KIP-16/17/20) is gated on the Toccata fork and is NOT live on mainnet yet.
    #[serde(skip_serializing_if = "is_false")]
    pub mainnet_live: bool,
}

/// The result of disassembling a script.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Disassembly {
    pub byte_len: usize,
    pub opcode_count: usize,
    /// Whether the Toccata introspection name overlay was applied.
    pub toccata: bool,
    pub tokens: Vec<Token>,
    /// The full ASM listing (one instruction per line).
    pub asm: String,
    /// A parse error (e.g. a truncated push). Any cleanly-parsed instructions before
    /// the error are still returned in `tokens`; the walk stops at the bad byte.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Canonical Kaspa opcode name for `byte`. When `toccata` is true, the KIP-10/17/20
/// introspection + covenant names overlay the bytes that read as `OpUnknown*` under
/// kaspa-txscript 0.15.0.
pub fn opcode_name(byte: u8, toccata: bool) -> String {
    // Fixed-length data pushes: the opcode value IS the byte count.
    if (0x01..=0x4b).contains(&byte) {
        return format!("OpData{byte}");
    }
    // Small-integer pushes Op2..Op16 (0x52..=0x60). 0x51 (OpTrue/Op1) and
    // 0x00 (OpFalse/Op0) keep their canonical names below.
    if (0x52..=0x60).contains(&byte) {
        return format!("Op{}", byte - 0x50);
    }
    if toccata {
        if let Some(n) = toccata_name(byte) {
            return n.to_string();
        }
    }
    if let Some(n) = legacy_name(byte) {
        return n.to_string();
    }
    // Unassigned bytes read as OpUnknown<decimal> (matches the crate's naming).
    format!("OpUnknown{byte}")
}

/// Named opcodes from kaspa-txscript 0.15.0 (everything except the OpData range, the
/// Op2..Op16 small-int range, and the unassigned OpUnknown bytes, which are derived).
fn legacy_name(byte: u8) -> Option<&'static str> {
    Some(match byte {
        0x00 => "OpFalse",
        0x4c => "OpPushData1",
        0x4d => "OpPushData2",
        0x4e => "OpPushData4",
        0x4f => "Op1Negate",
        0x50 => "OpReserved",
        0x51 => "OpTrue",
        0x61 => "OpNop",
        0x62 => "OpVer",
        0x63 => "OpIf",
        0x64 => "OpNotIf",
        0x65 => "OpVerIf",
        0x66 => "OpVerNotIf",
        0x67 => "OpElse",
        0x68 => "OpEndIf",
        0x69 => "OpVerify",
        0x6a => "OpReturn",
        0x6b => "OpToAltStack",
        0x6c => "OpFromAltStack",
        0x6d => "Op2Drop",
        0x6e => "Op2Dup",
        0x6f => "Op3Dup",
        0x70 => "Op2Over",
        0x71 => "Op2Rot",
        0x72 => "Op2Swap",
        0x73 => "OpIfDup",
        0x74 => "OpDepth",
        0x75 => "OpDrop",
        0x76 => "OpDup",
        0x77 => "OpNip",
        0x78 => "OpOver",
        0x79 => "OpPick",
        0x7a => "OpRoll",
        0x7b => "OpRot",
        0x7c => "OpSwap",
        0x7d => "OpTuck",
        0x7e => "OpCat",
        0x7f => "OpSubStr",
        0x80 => "OpLeft",
        0x81 => "OpRight",
        0x82 => "OpSize",
        0x83 => "OpInvert",
        0x84 => "OpAnd",
        0x85 => "OpOr",
        0x86 => "OpXor",
        0x87 => "OpEqual",
        0x88 => "OpEqualVerify",
        0x89 => "OpReserved1",
        0x8a => "OpReserved2",
        0x8b => "Op1Add",
        0x8c => "Op1Sub",
        0x8d => "Op2Mul",
        0x8e => "Op2Div",
        0x8f => "OpNegate",
        0x90 => "OpAbs",
        0x91 => "OpNot",
        0x92 => "Op0NotEqual",
        0x93 => "OpAdd",
        0x94 => "OpSub",
        0x95 => "OpMul",
        0x96 => "OpDiv",
        0x97 => "OpMod",
        0x98 => "OpLShift",
        0x99 => "OpRShift",
        0x9a => "OpBoolAnd",
        0x9b => "OpBoolOr",
        0x9c => "OpNumEqual",
        0x9d => "OpNumEqualVerify",
        0x9e => "OpNumNotEqual",
        0x9f => "OpLessThan",
        0xa0 => "OpGreaterThan",
        0xa1 => "OpLessThanOrEqual",
        0xa2 => "OpGreaterThanOrEqual",
        0xa3 => "OpMin",
        0xa4 => "OpMax",
        0xa5 => "OpWithin",
        0xa8 => "OpSHA256",
        0xa9 => "OpCheckMultiSigECDSA",
        0xaa => "OpBlake2b",
        0xab => "OpCheckSigECDSA",
        0xac => "OpCheckSig",
        0xad => "OpCheckSigVerify",
        0xae => "OpCheckMultiSig",
        0xaf => "OpCheckMultiSigVerify",
        0xb0 => "OpCheckLockTimeVerify",
        0xb1 => "OpCheckSequenceVerify",
        0xfa => "OpSmallInteger",
        0xfb => "OpPubKeys",
        0xfd => "OpPubKeyHash",
        0xfe => "OpPubKey",
        0xff => "OpInvalidOpCode",
        _ => return None,
    })
}

/// Covenant-era (KIP-16/17/20) opcode names for the bytes the official KIPs assign a
/// concrete value. Source: the kaspanet/kips specifications (kip-0010 / kip-0016 /
/// kip-0017 / kip-0020), NOT the node binary, so this is a display overlay only and any
/// byte the KIPs do not pin is left unmapped (it falls through to `OpUnknown*`).
/// The 7 KIP-10 bytes here are mainnet-live since Crescendo; the rest activate at the
/// Toccata fork. Before activation each reads as the reserved `OpUnknown*` byte above.
fn toccata_name(byte: u8) -> Option<&'static str> {
    Some(match byte {
        // KIP-16: zero-knowledge proof verification precompile.
        0xa6 => "OpZkPrecompile",
        // KIP-17: keyed BLAKE2b.
        0xa7 => "OpBlake2bWithKey",
        0xb2 => "OpTxVersion",
        0xb3 => "OpTxInputCount",
        0xb4 => "OpTxOutputCount",
        0xb5 => "OpTxLockTime",
        0xb6 => "OpTxSubnetId",
        0xb7 => "OpTxGas",
        0xb8 => "OpTxPayloadSubstr",
        0xb9 => "OpTxInputIndex",
        0xba => "OpOutpointTxId",
        0xbb => "OpOutpointIndex",
        0xbc => "OpTxInputScriptSigSubstr",
        0xbd => "OpTxInputSeq",
        0xbe => "OpTxInputAmount",
        0xbf => "OpTxInputSpk",
        0xc0 => "OpTxInputDaaScore",
        0xc1 => "OpTxInputIsCoinbase",
        0xc2 => "OpTxOutputAmount",
        0xc3 => "OpTxOutputSpk",
        0xc4 => "OpTxPayloadLen",
        0xc5 => "OpTxInputSpkLen",
        0xc6 => "OpTxInputSpkSubstr",
        0xc7 => "OpTxOutputSpkLen",
        0xc8 => "OpTxOutputSpkSubstr",
        0xc9 => "OpTxInputScriptSigLen",
        // 0xca remains OpUnknown202 even under Toccata.
        0xcb => "OpAuthOutputCount",
        0xcc => "OpAuthOutputIdx",
        0xcd => "OpNum2Bin",
        0xce => "OpBin2Num",
        0xcf => "OpInputCovenantId",
        0xd0 => "OpCovInputCount",
        0xd1 => "OpCovInputIdx",
        0xd2 => "OpCovOutputCount",
        0xd3 => "OpCovOutputIdx",
        0xd4 => "OpChainblockSeqCommit",
        0xd5 => "OpOutputCovenantId",
        0xd6 => "OpOutputAuthorizingInput",
        // KIP-17: check-sig-from-stack + BLAKE3.
        0xd7 => "OpCheckSigFromStack",
        0xd8 => "OpCheckSigFromStackECDSA",
        0xd9 => "OpBlake3",
        0xda => "OpBlake3WithKey",
        _ => return None,
    })
}

/// The 7 KIP-10 introspection opcodes, consensus-active on Kaspa MAINNET since the
/// Crescendo hard fork (May 2025). Distinguished from the Toccata-gated overlay so the
/// disassembler can honestly tag what is live today vs what awaits the Toccata fork.
fn is_kip10_live_byte(byte: u8) -> bool {
    matches!(byte, 0xb3 | 0xb4 | 0xb9 | 0xbe | 0xbf | 0xc2 | 0xc3)
}

/// Which KIP owns `byte` in the covenant-era overlay, for display tagging. `None` for
/// bytes outside the overlay. The 0xa6 ZK precompile is KIP-16; the covenant-ID family
/// (0xcb..=0xd6) is KIP-20; everything else in the overlay is KIP-17 (which also
/// re-specifies and extends the KIP-10 introspection set). The 7 mainnet-live bytes are
/// reported as KIP-10, their originating proposal.
fn kip_for_byte(byte: u8) -> Option<&'static str> {
    if is_kip10_live_byte(byte) {
        return Some("KIP-10");
    }
    match byte {
        0xa6 => Some("KIP-16"),
        0xcb..=0xd6 => Some("KIP-20"),
        // The remaining named overlay bytes are KIP-17's extended scripting set.
        _ if toccata_name(byte).is_some() => Some("KIP-17"),
        _ => None,
    }
}

/// Disabled under the 0.15.0 consensus VM (the script fails if the opcode executes).
/// Mirrors `OpCodeMetadata::is_disabled` in kaspa-txscript 0.15.0 exactly.
fn is_disabled_byte(byte: u8) -> bool {
    matches!(
        byte,
        0x7e // OpCat
            | 0x7f // OpSubStr
            | 0x80 // OpLeft
            | 0x81 // OpRight
            | 0x83 // OpInvert
            | 0x84 // OpAnd
            | 0x85 // OpOr
            | 0x86 // OpXor
            | 0x8d // Op2Mul
            | 0x8e // Op2Div
            | 0x95 // OpMul
            | 0x96 // OpDiv
            | 0x97 // OpMod
            | 0x98 // OpLShift
            | 0x99 // OpRShift
    )
}

/// Always-illegal opcodes: present in a script (executed or not) makes it unspendable.
/// Mirrors `OpCodeMetadata::always_illegal` in kaspa-txscript 0.15.0.
fn is_always_illegal_byte(byte: u8) -> bool {
    matches!(byte, 0x65 | 0x66) // OpVerIf | OpVerNotIf
}

/// Flow-control (conditional) opcodes that structure branches.
fn is_conditional_byte(byte: u8) -> bool {
    matches!(byte, 0x63 | 0x64 | 0x67 | 0x68) // OpIf | OpNotIf | OpElse | OpEndIf
}

/// Is `byte` an unassigned / reserved opcode under the current (pre-Toccata) VM?
fn is_unknown_byte(byte: u8) -> bool {
    matches!(byte, 0xa6 | 0xa7 | 0xb2..=0xf9 | 0xfc)
}

/// For a push opcode, return `(header_len, data_len)` where `header_len` is the bytes
/// for the opcode plus any length prefix, and `data_len` is the number of data bytes
/// that follow. Returns `Err(message)` if a length prefix is truncated. Returns
/// `Ok(None)` for a non-push opcode (single byte, no data).
fn push_layout(script: &[u8], i: usize) -> Result<Option<(usize, usize)>, String> {
    let op = script[i];
    match op {
        0x00 => Ok(None), // OpFalse pushes an empty value but consumes no data bytes.
        0x01..=0x4b => Ok(Some((1, op as usize))),
        0x4c => {
            // OpPushData1: 1-byte length prefix.
            if i + 2 > script.len() {
                return Err(format!(
                    "OpPushData1 at offset {i}: truncated length prefix (need 1 byte)"
                ));
            }
            Ok(Some((2, script[i + 1] as usize)))
        }
        0x4d => {
            // OpPushData2: 2-byte little-endian length prefix.
            if i + 3 > script.len() {
                return Err(format!(
                    "OpPushData2 at offset {i}: truncated length prefix (need 2 bytes)"
                ));
            }
            let l = u16::from_le_bytes([script[i + 1], script[i + 2]]) as usize;
            Ok(Some((3, l)))
        }
        0x4e => {
            // OpPushData4: 4-byte little-endian length prefix.
            if i + 5 > script.len() {
                return Err(format!(
                    "OpPushData4 at offset {i}: truncated length prefix (need 4 bytes)"
                ));
            }
            let l = u32::from_le_bytes([script[i + 1], script[i + 2], script[i + 3], script[i + 4]])
                as usize;
            Ok(Some((5, l)))
        }
        _ => Ok(None),
    }
}

/// Render a single instruction's ASM line.
fn render_asm(name: &str, data_hex: Option<&str>) -> String {
    match data_hex {
        Some(h) if !h.is_empty() => format!("{name} 0x{h}"),
        _ => name.to_string(),
    }
}

/// Disassemble a raw Kaspa script into a token stream + ASM listing. `toccata` overlays
/// the KIP-10/17/20 introspection names onto the reserved-byte range. This never panics:
/// a malformed/truncated script yields the cleanly-parsed prefix plus an `error`.
pub fn disassemble(script: &[u8], toccata: bool) -> Disassembly {
    let mut tokens: Vec<Token> = Vec::new();
    let mut error: Option<String> = None;
    let mut i = 0usize;

    while i < script.len() {
        let op = script[i];
        let layout = match push_layout(script, i) {
            Ok(l) => l,
            Err(msg) => {
                error = Some(msg);
                break;
            }
        };

        let (header_len, data_len, data_hex, is_push) = match layout {
            Some((header_len, data_len)) => {
                let data_start = i + header_len;
                // checked_add guards a pathological OpPushData4 length on 32-bit targets.
                let data_end = match data_start.checked_add(data_len) {
                    Some(e) => e,
                    None => {
                        error = Some(format!(
                            "push at offset {i}: declared data length {data_len} overflows"
                        ));
                        break;
                    }
                };
                if data_end > script.len() {
                    error = Some(format!(
                        "{} at offset {i}: truncated push (declared {data_len} data bytes, only {} available)",
                        opcode_name(op, toccata),
                        script.len() - data_start.min(script.len())
                    ));
                    break;
                }
                let hex = hex::encode(&script[data_start..data_end]);
                (header_len, data_len, Some(hex), true)
            }
            None => (1, 0, None, false),
        };

        let name = opcode_name(op, toccata);
        let asm = render_asm(&name, data_hex.as_deref());
        let is_intro = toccata && toccata_name(op).is_some();
        tokens.push(Token {
            offset: i,
            opcode: op,
            asm,
            size: header_len + data_len,
            is_push,
            disabled: is_disabled_byte(op),
            illegal: is_always_illegal_byte(op),
            conditional: is_conditional_byte(op),
            // Under Toccata, the introspection bytes are no longer reserved/unknown.
            reserved_unknown: is_unknown_byte(op) && !is_intro,
            introspection: is_intro,
            // Display tags, only meaningful on the overlay. KIP-10's 7 bytes are
            // mainnet-live (Crescendo); the rest of the overlay awaits Toccata.
            kip: if is_intro { kip_for_byte(op) } else { None },
            mainnet_live: is_intro && is_kip10_live_byte(op),
            name,
            data_hex,
        });

        i += header_len + data_len;
    }

    let asm = tokens
        .iter()
        .map(|t| t.asm.as_str())
        .collect::<Vec<_>>()
        .join("\n");

    Disassembly {
        byte_len: script.len(),
        opcode_count: tokens.len(),
        toccata,
        tokens,
        asm,
        error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::covenant_builder::*;
    use kaspa_consensus_core::tx::PopulatedTransaction;
    // `value()` / `get_data()` live on the `OpCodeMetadata` supertrait, so it must be in
    // scope to call them on the `dyn OpCodeImplementation` trait object that
    // `deserialize_next_opcode` returns.
    use kaspa_txscript::opcodes::{deserialize_next_opcode, OpCodeMetadata};

    /// Tokenize a script with the crate's own consensus tokenizer, returning
    /// `(opcode_value, pushed_data)` for each opcode, plus whether parsing ended in an
    /// error (a truncated/invalid push). `PopulatedTransaction` is named only as the
    /// phantom `T`; no instance is constructed because deserialization is tx-independent.
    fn consensus_tokens(script: &[u8]) -> (Vec<(u8, Vec<u8>)>, bool) {
        let mut it = script.iter();
        let mut out: Vec<(u8, Vec<u8>)> = Vec::new();
        loop {
            match deserialize_next_opcode::<_, PopulatedTransaction>(&mut it) {
                Some(Ok(op)) => out.push((op.value(), op.get_data().to_vec())),
                Some(Err(_)) => return (out, true),
                None => return (out, false),
            }
        }
    }

    /// My tokenizer's `(opcode, data)` stream, excluding any trailing error.
    fn mine_tokens(script: &[u8]) -> (Vec<(u8, Vec<u8>)>, bool) {
        let dis = disassemble(script, false);
        let toks = dis
            .tokens
            .iter()
            .map(|t| {
                let data = t
                    .data_hex
                    .as_ref()
                    .map(|h| hex::decode(h).unwrap())
                    .unwrap_or_default();
                (t.opcode, data)
            })
            .collect();
        (toks, dis.error.is_some())
    }

    /// The full corpus of redeem scripts the builders can emit (the golden vectors).
    fn builder_corpus() -> Vec<(&'static str, Vec<u8>)> {
        let a = [11u8; 32];
        let b = [22u8; 32];
        let c = [33u8; 32];
        let h = [44u8; 32];
        let h2 = [55u8; 32];
        vec![
            ("singlesig", redeem_singlesig(&a).unwrap()),
            ("hashlock", redeem_hashlock(&h, &a).unwrap()),
            ("timelock", redeem_timelock(500_000, &a).unwrap()),
            (
                "relative_timelock",
                redeem_relative_timelock(64, &a).unwrap(),
            ),
            ("multisig_2of3", redeem_multisig(&[a, b, c], 2).unwrap()),
            ("htlc", redeem_htlc(&h, &a, 7000, &b).unwrap()),
            ("channel", redeem_channel(&a, &b, 8000).unwrap()),
            ("oracle_enforced", redeem_multisig(&[a, b], 2).unwrap()),
            ("oracle_escrow", redeem_oracle_escrow(&a, &b, &c).unwrap()),
            ("deadman", redeem_deadman(&a, &b, 9000).unwrap()),
            (
                "timedecay",
                redeem_timedecay_multisig(&[a, b, c], 2, 1, 9000).unwrap(),
            ),
            (
                "binary_oracle_select",
                redeem_binary_oracle_select(&h, &a, &h2, &b, 64, &c).unwrap(),
            ),
            (
                "oracle_enforced_refundable",
                redeem_oracle_enforced_refundable(&a, &b, 64, &c).unwrap(),
            ),
            (
                "oracle_escrow_refundable",
                redeem_oracle_escrow_refundable(&a, &b, &c, 64, &a).unwrap(),
            ),
        ]
    }

    #[test]
    fn matches_consensus_tokenizer_on_builder_corpus() {
        for (label, script) in builder_corpus() {
            let dis = disassemble(&script, false);
            assert!(
                dis.error.is_none(),
                "[{label}] unexpected error: {:?}",
                dis.error
            );
            let (mine, mine_err) = mine_tokens(&script);
            let (theirs, theirs_err) = consensus_tokens(&script);
            assert_eq!(mine, theirs, "[{label}] tokenizer divergence vs consensus");
            assert_eq!(mine_err, theirs_err, "[{label}] error-flag divergence");
            // Round-trip: the token sizes exactly reconstruct the script length.
            let total: usize = dis.tokens.iter().map(|t| t.size).sum();
            assert_eq!(
                total,
                script.len(),
                "[{label}] sizes do not cover the script"
            );
        }
    }

    #[test]
    fn matches_consensus_tokenizer_on_random_scripts() {
        // Deterministic xorshift so the test is reproducible without a rand dependency.
        let mut s: u64 = 0x9E37_79B9_7F4A_7C15;
        let mut next = || {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            s
        };
        for _ in 0..2000 {
            let len = (next() % 120) as usize;
            let script: Vec<u8> = (0..len).map(|_| (next() & 0xff) as u8).collect();
            let (mine, mine_err) = mine_tokens(&script);
            let (theirs, theirs_err) = consensus_tokens(&script);
            assert_eq!(
                mine,
                theirs,
                "tokenizer divergence on random script {}",
                hex::encode(&script)
            );
            assert_eq!(
                mine_err,
                theirs_err,
                "error-flag divergence on random script {}",
                hex::encode(&script)
            );
        }
    }

    #[test]
    fn names_match_known_opcodes() {
        assert_eq!(opcode_name(0x00, false), "OpFalse");
        assert_eq!(opcode_name(0x01, false), "OpData1");
        assert_eq!(opcode_name(0x20, false), "OpData32");
        assert_eq!(opcode_name(0x4b, false), "OpData75");
        assert_eq!(opcode_name(0x51, false), "OpTrue");
        assert_eq!(opcode_name(0x52, false), "Op2");
        assert_eq!(opcode_name(0x60, false), "Op16");
        assert_eq!(opcode_name(0xaa, false), "OpBlake2b");
        assert_eq!(opcode_name(0xac, false), "OpCheckSig");
        assert_eq!(opcode_name(0xb0, false), "OpCheckLockTimeVerify");
        assert_eq!(opcode_name(0xb1, false), "OpCheckSequenceVerify");
        // Reserved today, covenant-era introspection under the Toccata overlay.
        assert_eq!(opcode_name(0xb2, false), "OpUnknown178");
        assert_eq!(opcode_name(0xb2, true), "OpTxVersion");
        assert_eq!(opcode_name(0xc2, true), "OpTxOutputAmount");
        assert_eq!(opcode_name(0xcf, true), "OpInputCovenantId");
        assert_eq!(opcode_name(0xd6, true), "OpOutputAuthorizingInput");
        // KIP-16 ZK precompile + KIP-17 sig/hash additions (verified byte values from
        // the official KIPs). Reserved/unknown before the Toccata overlay is applied.
        assert_eq!(opcode_name(0xa6, false), "OpUnknown166");
        assert_eq!(opcode_name(0xa6, true), "OpZkPrecompile");
        assert_eq!(opcode_name(0xa7, true), "OpBlake2bWithKey");
        assert_eq!(opcode_name(0xd7, true), "OpCheckSigFromStack");
        assert_eq!(opcode_name(0xd8, true), "OpCheckSigFromStackECDSA");
        assert_eq!(opcode_name(0xd9, true), "OpBlake3");
        assert_eq!(opcode_name(0xda, true), "OpBlake3WithKey");
        // OpCat/OpSubStr/OpMul are legacy-named bytes (live names today, disabled in the
        // 0.15.0 VM), KIP-17 re-enables them; they are not part of the toccata overlay.
        assert_eq!(opcode_name(0x7e, false), "OpCat");
        assert_eq!(opcode_name(0x95, false), "OpMul");
    }

    #[test]
    fn fork_tags_separate_crescendo_live_from_toccata_gated() {
        // KIP-10 introspection: mainnet-live since Crescendo. The 7 canonical bytes.
        for b in [0xb3u8, 0xb4, 0xb9, 0xbe, 0xbf, 0xc2, 0xc3] {
            let dis = disassemble(&[b], true);
            let t = &dis.tokens[0];
            assert!(t.introspection, "{b:#x} should be flagged introspection");
            assert_eq!(t.kip, Some("KIP-10"), "{b:#x} should be tagged KIP-10");
            assert!(t.mainnet_live, "{b:#x} (KIP-10) is mainnet-live since Crescendo");
            assert!(!t.reserved_unknown, "{b:#x} no longer reserved under the overlay");
        }
        // KIP-16 ZK precompile: Toccata-gated, NOT mainnet-live.
        let zk = &disassemble(&[0xa6], true).tokens[0];
        assert_eq!(zk.kip, Some("KIP-16"));
        assert!(!zk.mainnet_live, "OpZkPrecompile is gated on Toccata, not live today");
        // KIP-20 covenant ID: Toccata-gated.
        let cov = &disassemble(&[0xcf], true).tokens[0];
        assert_eq!(cov.kip, Some("KIP-20"));
        assert!(!cov.mainnet_live);
        // KIP-17 extended introspection byte (OpTxVersion 0xb2): Toccata-gated.
        let v = &disassemble(&[0xb2], true).tokens[0];
        assert_eq!(v.kip, Some("KIP-17"));
        assert!(!v.mainnet_live);
        // Without the overlay, none of these carry a kip / mainnet_live tag.
        let off = &disassemble(&[0xc2], false).tokens[0];
        assert_eq!(off.kip, None);
        assert!(!off.mainnet_live);
        assert!(off.reserved_unknown, "0xc2 is a reserved byte pre-Toccata");
    }

    #[test]
    fn hashlock_asm_is_readable() {
        let h = [0xABu8; 32];
        let pk = [0xCDu8; 32];
        let script = redeem_hashlock(&h, &pk).unwrap();
        let dis = disassemble(&script, false);
        assert_eq!(dis.error, None);
        // OpBlake2b <32> OpEqualVerify <32> OpCheckSig
        assert_eq!(dis.tokens.len(), 5);
        assert_eq!(dis.tokens[0].name, "OpBlake2b");
        assert_eq!(dis.tokens[1].name, "OpData32");
        assert_eq!(
            dis.tokens[1].data_hex.as_deref(),
            Some(&"ab".repeat(32)[..])
        );
        assert_eq!(dis.tokens[2].name, "OpEqualVerify");
        assert_eq!(dis.tokens[4].name, "OpCheckSig");
        assert!(dis.asm.contains("OpBlake2b\nOpData32 0x"));
    }

    #[test]
    fn flags_disabled_and_illegal() {
        // OpMul (disabled) then OpVerIf (always illegal).
        let dis = disassemble(&[0x95, 0x65], false);
        assert!(dis.tokens[0].disabled, "OpMul should be flagged disabled");
        assert!(dis.tokens[1].illegal, "OpVerIf should be flagged illegal");
    }

    #[test]
    fn truncated_push_is_reported_not_panicked() {
        // OpData32 (0x20) with only 3 bytes following.
        let dis = disassemble(&[0x20, 0x01, 0x02, 0x03], false);
        assert!(dis.error.is_some(), "expected a truncation error");
        assert_eq!(dis.tokens.len(), 0, "no clean token before the bad push");
    }

    #[test]
    fn empty_script_is_clean() {
        let dis = disassemble(&[], false);
        assert_eq!(dis.opcode_count, 0);
        assert_eq!(dis.error, None);
        assert_eq!(dis.asm, "");
    }
}
