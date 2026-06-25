# KIP-10 Deterministic Trustless Covenants (Implementation Spec)

Status: DESIGN ONLY. No code is built and nothing is deployed by this document.
Author scope: Covex architect (planning). All claims grounded against origin/master
and the canonical Kaspa sources cited inline.

## 0. What this spec is, and what it is NOT

This is the NON-ZK, pure-introspection trustless path. It is the complement to the
on-chain ZK precompile spec (the KIP-16 OpZkPrecompile work, tracked in
docs/ZK_ONCHAIN_PLAN.md / docs/MAINNET_ONCHAIN_ZK.md and the separate
docs/ONCHAIN_ZK_KIP16_SPEC.md worktree). This spec does NOT duplicate that work.

The mechanism here uses the KIP-10 transaction-introspection opcodes that have been
consensus-active on Kaspa MAINNET since the Crescendo hard fork (May 2025). Because
they are already live on mainnet, the covenants in this spec are the trustless win
available BEFORE and INDEPENDENT of the Toccata ZK precompile. They can be small-value
mainnet-tested today (post Covex launch), unlike the ZK precompile path which is gated
off mainnet until Toccata activates (see zk_precompile_deploy_allowed,
backend/src/covenant_builder.rs).

Honesty rule enforced throughout: a covenant is deterministic-trustless ONLY when the
spend condition is a chain-checkable FACT (output amount + output scriptPubKey binding,
plus hashlock/preimage, CSV/CLTV, and OpCheckSig). If deciding who wins requires a
trusted reveal, a real-world fact, or a private computation, that OUTCOME bit is NOT
covered here. Those route to the ZK path (KIP-16) or the disclosed off-chain oracle.

## 1. KIP-10 opcode table (bytes verified against three sources)

Sources cross-checked:
- KIP-10 spec text: github.com/kaspanet/kips/blob/master/kip-0010.md (opcode names + bytes).
- rusty-kaspa master crypto/txscript/src/opcodes/mod.rs (enum values + execution semantics).
- The Covex in-repo disassembler backend/src/disassembler.rs (independent byte map; the
  7 KIP-10 bytes are tagged kip "KIP-10", mainnet_live true, Crescendo, May 2025).

All three agree on the 7 mainnet-live bytes. They are:

| Opcode            | Byte | Pops from stack | Pushes onto stack                                |
|-------------------|------|-----------------|--------------------------------------------------|
| OpTxInputCount    | 0xb3 | nothing         | i64 number = number of inputs                     |
| OpTxOutputCount   | 0xb4 | nothing         | i64 number = number of outputs                    |
| OpTxInputIndex    | 0xb9 | nothing         | i64 number = index of the input being validated   |
| OpTxInputAmount   | 0xbe | i32 index       | i64 number = inputs[index].amount (sompi)         |
| OpTxInputSpk      | 0xbf | i32 index       | byte string = inputs[index].scriptPublicKey bytes |
| OpTxOutputAmount  | 0xc2 | i32 index       | i64 number = outputs[index].amount (sompi)        |
| OpTxOutputSpk     | 0xc3 | i32 index       | byte string = outputs[index].scriptPublicKey bytes|

Semantics confirmed from rusty-kaspa master opcodes/mod.rs:
- The amount opcodes pop a single i32 index and push the amount as a script number. KIP-10
  also widened script arithmetic and number encoding to 8 bytes (i64), so a full 21M-KAS
  pot in sompi fits a single comparable number. This 8-byte widening is what makes
  pot-minus-fee arithmetic and amount equality safe at real values.
- The SPK opcodes pop a single i32 index and push the raw scriptPublicKey BYTE STRING
  (version-prefixed serialization, NOT a hash). This lets a covenant compare an output
  full SPK against an SPK it reconstructs on the stack.
- The count/index opcodes pop nothing.
- These 7 introspection bytes execute UNCONDITIONALLY on mainnet today (no per-script
  activation flag at the consensus layer; they were activated network-wide at Crescendo).
  The covenants_enabled engine flag in rusty-kaspa gates a DIFFERENT, larger Toccata set
  (OpTxVersion 0xb2, OpTxLockTime 0xb5, the KIP-17/KIP-20 covenant-ID family 0xcb..0xd6,
  etc.), which is why those are NOT used here.

Supporting opcodes (already used by existing Covex builders, bytes confirmed in opcodes/mod.rs):
OpCheckSig 0xac, OpCheckSigVerify 0xad, OpEqual 0x87, OpEqualVerify 0x88,
OpBlake2b 0xaa, OpCheckSequenceVerify (CSV) 0xb1, OpCheckLockTimeVerify (CLTV) 0xb0,
OpSub 0x94, OpNumEqual 0x9c, OpNumEqualVerify 0x9d, OpIf 0x63, OpElse 0x67, OpEndIf 0x68,
OpDrop 0x75, OpVerify 0x69, OpDup 0x76.

### UNCONFIRMED / MUST-VERIFY-IN-T1 (flagged honestly)

1. EXACT byte layout that OpTxOutputSpk / OpTxInputSpk push. The consensus type
   ScriptPublicKey serializes (per rusty-kaspa consensus/core script_public_key.rs Borsh
   impl) as [2-byte LE version][len][script bytes]. But what the OPCODE pushes onto the
   stack may be a DIFFERENT framing (version-prefixed without a borsh length, or the bare
   script). This MATTERS: the covenant reconstructs the winner SPK on the stack to compare,
   so we must build that reconstruction byte-for-byte identical to what the opcode pushes.
   RESOLUTION: build the reconstruction helper (section 4) by EXACTLY mirroring the
   serialize-spk-for-stack form in the rusty-kaspa opcode impl under the v2.0.1 crate (T1),
   and add a golden vector that decodes a real on-chain SPK push from a TN12 spend. Until
   that vector passes, treat the SPK-equality templates as PROVISIONAL.

2. Whether OpTxOutputAmount returns sompi as a plain i64 number directly comparable with a
   pushed-number literal (assumed yes from push_number in the opcode impl), versus any
   normalization. The amount template uses OpNumEqual; verify the encodings match in T1.

3. The i32 index operand for the Amount/Spk opcodes must be pushed as a script NUMBER
   (minimal encoding), not an OpN small-int in a form the opcode rejects. For index 0 this
   is OP_0 / empty push; verify the opcode accepts OP_0 for index 0 (it pops an i32).

## 2. Covenant script templates

Notation: PUSH(x) = a canonical data push of x (ScriptBuilder add_data). NUM(i) = a minimal
script-number push of integer i used as an opcode index operand. P2PK_SPK(pubkey) = the
on-stack reconstruction of the version-prefixed scriptPublicKey for a P2PK lock to pubkey
(see section 4; the SilverScript primitive calls this new ScriptPubKeyP2PK(winner)).

These templates follow the proven SilverScript escrow primitive
(kaspanet/silverscript silverscript-lang/tests/examples/covenant_escrow.sil), the canonical
winner-binding pattern (verbatim from that file):

    int amount = tx.inputs[this.activeInputIndex].value - minerFee;
    require(tx.outputs[0].value == amount);
    require(tx.outputs[0].scriptPubKey == new ScriptPubKeyP2PK(recipient));

### (a) Trustless WINNER-TAKES-ALL (output-bound; no key required to TRIGGER the spend)

Goal: the spend is valid ONLY if output 0 pays exactly (input amount - fee) to the winner
P2PK SPK and there is exactly one output. ANYONE can be the spender (no specific key is
required to TRIGGER the spend), but the introspection asserts make it IMPOSSIBLE to redirect
the funds. The pot can only ever flow to winner.

Two variants. Pick A1 for a fixed single winner with no claim signature; A2 to additionally
require the winner to authorize (most uses want A2, matching the escrow primitive checkSig).

A1 - pure output-binding (no signature needed to spend; first-seen relayer pays it out):

    OpTxOutputCount  NUM(1)  OpNumEqualVerify   ; exactly one output, no skim     0xb4
    OpTxInputIndex                              ; idx of this input               0xb9
    OpTxInputAmount                             ; inputs[idx].amount (pops idx)   0xbe
    PUSH(fee)                                   ; minerFee literal in sompi
    OpSub                                       ; amount - fee                    0x94
    NUM(0)  OpTxOutputAmount                    ; outputs[0].amount               0xc2
    OpNumEqualVerify                            ; require == amount-fee           0x9d
    NUM(0)  OpTxOutputSpk                       ; outputs[0].scriptPubKey         0xc3
    PUSH(P2PK_SPK(winner))                      ; reconstructed winner SPK, sec 4
    OpEqual                                     ; require == P2PK_SPK(winner)     0x87

The trailing OpEqual leaves TRUE/FALSE as the final stack value (script succeeds iff the
output binding holds). The witness (signature_script) is just the redeem-script push.

A2 - output-binding AND winner signature (recommended; mirrors escrow.sil checkSig):

    OpTxOutputCount  NUM(1)  OpNumEqualVerify
    OpTxInputIndex OpTxInputAmount PUSH(fee) OpSub
    NUM(0) OpTxOutputAmount OpNumEqualVerify
    NUM(0) OpTxOutputSpk PUSH(P2PK_SPK(winner)) OpEqualVerify
    PUSH(winner_xonly) OpCheckSig

Witness for A2: PUSH(winner_sig) then the redeem-script push (standard P2SH satisfier, sec 3).

Why trustless: no oracle key, no Covex key. The chain rejects any spend whose output 0 is
not exactly the pot-minus-fee paid to winner. A losing party or any third party who tries to
broadcast a redirect spend FAILS at consensus.

CRITICAL HONESTY CAVEAT (the change-output / skim surface): output[0]-only binding is unsafe
WITHOUT the leading OpTxOutputCount NUM(1) OpNumEqualVerify. A malicious spender could
otherwise add output[1..] that skim value. The exactly-one-output bind is REQUIRED in every
template and must never be dropped. The miner fee is taken purely as the input/output delta
(the baked fee), never as a redirected output. A wrong fee makes the pot unspendable
(safe-fail) or overpays the miner, never the attacker. The exact-fee form ships first; a
fee-tolerance form (two comparisons bounding the delta) is a post-e2e enhancement, not v1.

### (b) Trustless 2-PARTY ESCROW with output binding + CSV refund tail

Goal: release the pot to either party A or party B (each must authorize their own claim),
bound by introspection so the released amount/recipient is chain-enforced; plus a CSV refund
tail so funds are never frozen if neither claim happens.

    OpIf
      ; ---- Branch A: pay output[0] = amount-fee to A, signed by A ----
      OpTxOutputCount NUM(1) OpNumEqualVerify
      OpTxInputIndex OpTxInputAmount PUSH(fee) OpSub
      NUM(0) OpTxOutputAmount OpNumEqualVerify
      NUM(0) OpTxOutputSpk PUSH(P2PK_SPK(party_a)) OpEqualVerify
      PUSH(party_a_xonly) OpCheckSig
    OpElse
      OpIf
        ; ---- Branch B: pay output[0] = amount-fee to B, signed by B ----
        OpTxOutputCount NUM(1) OpNumEqualVerify
        OpTxInputIndex OpTxInputAmount PUSH(fee) OpSub
        NUM(0) OpTxOutputAmount OpNumEqualVerify
        NUM(0) OpTxOutputSpk PUSH(P2PK_SPK(party_b)) OpEqualVerify
        PUSH(party_b_xonly) OpCheckSig
      OpElse
        ; ---- Refund tail: relative timelock to the funder ----
        PUSH(min_sequence) OpCheckSequenceVerify
        PUSH(refund_xonly) OpCheckSig
      OpEndIf
    OpEndIf

Witness: branch A = PUSH(sig_a) OP_TRUE; branch B = PUSH(sig_b) OP_FALSE OP_TRUE; refund =
PUSH(sig_refund) OP_FALSE OP_FALSE. (Same IF/IF/ELSE selector choreography as the existing
redeem_binary_oracle_select in covenant_builder.rs line 613, which Covex already ships; this
template REPLACES that builder hashlock branches with output-binding asserts.)

Like every CSV/CLTV builder in covenant_builder.rs, OpCheckSequenceVerify POPS its operand
(no OpDrop). BIP68 aging is node-enforced (proven on TN12 elsewhere). sig_op_count = 3 (one
CheckSig per branch), identical to BinaryOracleSelect.

Difference vs OracleEscrow: OracleEscrow needs the Covex oracle co-signature
(PUSH(oracle) OpCheckSigVerify ...). This template has NO oracle key; the chain enforces
amount + recipient directly. WHICH branch (A vs B) is selected by whoever can produce A or B
signature for their own payout - correct for an escrow where each party can only claim TO
THEMSELVES and a dispute is resolved by the CSV refund. If the branch CHOICE itself must be
arbitrated by a third party, that is the oracle/ZK path, not this.

## 3. New RedeemKind(s) + builder functions (covenant_builder.rs)

Mirror the existing builders (redeem_binary_oracle_select line 613; ZkGameSettle gate
zk_precompile_deploy_allowed line ~960). Add to enum RedeemKind (line 72):

    /// Trustless WINNER-TAKES-ALL via KIP-10 introspection (no oracle, no Covex key). The
    /// spend is valid only if output[0] pays exactly (input amount - fee) to winner P2PK SPK
    /// and there is exactly one output, enforced ON-CHAIN by OpTxOutputAmount (0xc2) /
    /// OpTxOutputSpk (0xc3) / OpTxOutputCount (0xb4). KIP-10 is Crescendo-live on mainnet.
    WinnerTakesAllBound { winner: [u8; 32], fee_sompi: u64, require_sig: bool },

    /// Trustless 2-party escrow with output binding + CSV refund tail (no oracle). IF = pay A,
    /// ELSE IF = pay B, ELSE = CSV refund to funder. Each payout branch binds output[0]
    /// amount + spk via introspection.
    EscrowBound { party_a: [u8; 32], party_b: [u8; 32], fee_sompi: u64,
                  min_sequence: u64, refund: [u8; 32] },

Builder functions (siblings of redeem_binary_oracle_select), emitting the section-2 templates:

    pub fn redeem_winner_takes_all_bound(winner, fee_sompi, require_sig) -> BResult<Vec<u8>>;
    pub fn redeem_escrow_bound(party_a, party_b, fee_sompi, min_sequence, refund) -> BResult<Vec<u8>>;

Plus an on-stack SPK reconstruction helper (section 4):

    fn push_p2pk_spk(b: &mut ScriptBuilder, xonly: &[u8;32]) -> BResult<()>;

Wire-up touch points (each mirrors an existing arm):
- RedeemKind::redeem_script() match (line ~250): add the two arms.
- RedeemKind kind-string (line ~324): "winner_bound", "escrow_bound:N" (N = min_sequence).
- RedeemKind script_kind label (line ~366): "p2sh_winner_bound", "p2sh_escrow_bound".
- SpendKind enum + parse() (line ~444/471): add WinnerBound and EscrowBound { min_sequence }.
- SpendKind::sig_op_count() (line ~503): WinnerBound = 1 if require_sig else 0; EscrowBound = 3.
- assemble_noncustodial_satisfier() (line 1737): add "winner_bound" and "escrow_bound" arms.
  winner_bound: A2 = PUSH(winner_sig); A1 = empty satisfier (just the redeem push).
  escrow_bound: branch A = PUSH(sig_a) OP_TRUE; branch B = PUSH(sig_b) OP_FALSE OP_TRUE;
  refund = PUSH(sig_refund) OP_FALSE OP_FALSE. NO oracle_sig is consumed (pass oracle_sig=None).
  This is the key difference vs the oracle_escrow arm.

DEPLOY GATING - opposite of the ZK kind. Because KIP-10 IS mainnet-live, these kinds need NO
mainnet freeze (unlike zk_precompile_deploy_allowed and bundled_market_mainnet_allowed). They
DO require the introspection opcodes in the build (T1). Add a guard
kip10_introspection_available() that is true once the v2.0.1 crate is wired, so a pre-T1 build
fail-closes with a clear message instead of emitting an opcode the vendored 0.15 ScriptBuilder
cannot name. They are SAFE on mainnet once T1 + the section-5 e2e pass.

## 4. The P2PK SPK reconstruction (the load-bearing detail)

To assert outputs[0].scriptPubKey == P2PK(winner), the covenant must push the EXACT byte
string that OpTxOutputSpk (0xc3) pushes for a standard P2PK output to winner.

A Kaspa P2PK output script is PUSH(xonly_pubkey) OpCheckSig = 0x20 pubkey32 0xac (34 bytes).
The scriptPublicKey ALSO carries a 2-byte version. Per rusty-kaspa
consensus/core script_public_key.rs the type is { version: u16, script: Vec<u8> }.

UNCERTAINTY (repeated from section 1, flagged): the on-stack push form of the SPK is NOT
guaranteed to be the Borsh [2-byte LE version][4-byte len][script] form. It is most likely
[2-byte LE version][script] (version-prefixed, no length, since the opcode pushes a
known-length byte string). push_p2pk_spk MUST reproduce whatever the v2.0.1 opcode impl
produces, verified by a golden vector captured from a real TN12 OpTxOutputSpk push. Do NOT
ship the Spk-equality templates until that golden passes. The Amount templates
(0xc2 / 0xbe / OpNumEqual) do not depend on this and can ship first if desired.

Cross-language: add push_p2pk_spk to the JS redeemer (frontend/src/lib/redeemer/
covenantRedeemer.js) and the composer (frontend/src/lib/composer/redeem.js), and extend the
cross-language golden fixtures tests/fixtures/redeem_golden.json (Rust-side asserted by the
redeem_golden_cross_language_parity test) and satisfier_golden.json. The byte form of
push_p2pk_spk is the single most important interop anchor for these kinds.

## 5. T1 / T2 integration (both REQUIRED)

T1 - the v2.0.1 kaspa-txscript crate (REQUIRED). backend/Cargo.toml pins
kaspa-txscript = "0.15.0" (lines 12-17) which PREDATES the KIP-10 opcodes - it has no
OpTxOutputAmount/OpTxOutputSpk/OpTxInputAmount/OpTxInputIndex/OpTxOutputCount constants and
its ScriptBuilder cannot name them (channel.rs:13 documents exactly this gap, and the
ZkGameSettle builder already works around a similar gap by splicing the raw 0xa6 byte).
Two options:
  - PREFERRED: bump kaspa-txscript (and the consensus-core/hashes companions) to the v2.0.1
    line that exposes the introspection opcode constants + ScriptBuilder support, OR vendor
    that crate the way vendor/kaspa-consensus-core is already vendored (Cargo.toml:45). Then
    emit OpTxOutputAmount etc. by name.
  - INTERIM (matches ZkGameSettle raw-byte precedent): keep 0.15 and splice the raw bytes
    (0xc2, 0xc3, 0xbe, 0xb9, 0xb4) via the existing push_data_raw / direct-byte pattern.
    Acceptable for a first TN12 e2e, but the v2.0.1 bump is the shippable end state because
    the disassembler, fee/mass estimation and sig_op accounting all benefit from named ops.
Either way the ENGINE that validates the spend is the live node (TN12/TN10/mainnet), which
already has the opcodes - T1 is only about the BUILDER being able to emit them.

T2 - the official WASM SDK with ScriptBuilder + covenantsEnabled (REQUIRED for in-browser
build). The frontend builds these covenants client-side (non-custodial: the key never leaves
the browser on mainnet). The redeemer (frontend/src/lib/redeemer/covenantRedeemer.js, with
its .wasm.test.js) must use a kaspa-wasm SDK build whose ScriptBuilder exposes the
introspection opcodes (the SDK guards them behind a covenantsEnabled-style capability). The
current pin is kaspa-wasm 1.0.2 (worktree HEAD commit); confirm that build exposes
OpTxOutputSpk/OpTxOutputAmount, and if not, bump to the v2.0.1-aligned WASM SDK. Add a
covenantRedeemer.wasm.test.js case that builds redeem_winner_takes_all_bound in WASM and
byte-matches the Rust golden.

## 6. Which Covex products this makes trustless WITHOUT an oracle

| Product / case | Trustless via KIP-10? | Why / what enforces the OUTCOME |
|---|---|---|
| Single-winner pot, winner FIXED at lock time | YES (WinnerTakesAllBound) | Output binding alone; winner known up front |
| 2-of-2 game, WINNER decided by a posted secret the chain can check (reveal preimage of H_winner) | YES | Output binding + a hashlock branch (existing BinaryOracleSelect choreography); chain checks blake2b preimage + binds payout |
| Hashlock-settled market: resolver only REVEALS a preimage, never signs a payout | YES (outcome bit = a preimage the chain verifies) | OpBlake2b preimage selects the branch; output binding fixes amount + recipient. The resolver is a data publisher, not a signer. This is BinaryOracleSelect made amount-bound. |
| Simple 2-party escrow with self-claim + timeout refund | YES (EscrowBound) | Output binding + per-party OpCheckSig + CSV refund |
| Atomic swap / HTLC | YES (already shipped, RedeemKind::Htlc) | preimage + CLTV; output binding optional hardening |
| Channel cooperative close | YES (already shipped, RedeemKind::Channel) | 2-of-2 sig; output binding could harden the close amount |
| Game where who won is a real-world fact (sports score, match result) | NO - needs oracle/ZK | The chain cannot observe the real world. Route to the disclosed off-chain oracle (off-Covex resolver) or a ZK proof of the result. |
| Game where the winner is a PRIVATE computation (chess legality, poker hand) | NO - needs ZK | The chain cannot recompute the game. Route to KIP-16 OpZkPrecompile (the ZkGameSettle / ONCHAIN_ZK spec path). |
| Prediction market on an external event | OUTCOME = oracle/ZK; PAYOUT = KIP-10 | The resolver decides the outcome off-chain, but once it reveals the deciding preimage the PAYOUT can be fully output-bound and trustless. Split honestly: outcome bit = oracle, money bit = chain. |

HONEST SUMMARY: KIP-10 makes the MONEY MOVEMENT trustless (amount + recipient + refund are
chain-enforced) in every case. It makes the WHOLE THING trustless only when the OUTCOME
selector is itself a chain-checkable fact (a fixed winner, a revealed preimage, a CSV
timeout). When the outcome is a real-world fact or a private computation, the outcome bit
still needs the oracle or the ZK precompile - say so, do not claim otherwise.

## 7. TN12/TN10-Toccata e2e plan + mainnet small-value note

Reuse the proven e2e harness (the binary_oracle_select / ZkGameSettle TN12 method, plus the
Node-wasm TN12 funding recipe in MEMORY). Per kind, prove all four of:

1. LOCK a pot: deploy a WinnerTakesAllBound (and an EscrowBound); confirm the deploy tx lands
   and the crawler discovers it (the aa20-hash-redeem payload marker, covenant_builder.rs:1906,
   embeds the full redeem so recovery works).
2. REDIRECT spend MUST FAIL: broadcast a spend whose output[0] pays a DIFFERENT spk (or a
   wrong amount, or adds a second output). Expect consensus rejection (script false /
   OpEqualVerify failure / output-count failure). This is the load-bearing negative test - it
   is the whole trustless claim.
3. VALID winner spend MUST SUCCEED: broadcast the correctly output-bound spend (output[0] =
   pot-fee to winner, exactly one output, winner sig if A2). Expect acceptance + the pot
   arrives at the winner.
4. ESCROW CSV refund: let the UTXO age min_sequence, broadcast the refund branch
   (PUSH(sig_refund) OP_FALSE OP_FALSE), expect acceptance only AFTER aging (BIP68; a fresh
   spend is rejected with the sequence-lock error, as proven for rcsv/BinaryOracleSelect).

MAINNET note: because KIP-10 is Crescendo (mainnet-live), these kinds can be small-value
mainnet-tested POST-LAUNCH (lock a few sompi, run tests 2-4 on mainnet). This is a genuine
mainnet trustless capability TODAY, unlike the ZK precompile path which
zk_precompile_deploy_allowed correctly refuses on mainnet until Toccata. Gate the e2e: run
TN12/TN10 first, then a single dust-value mainnet pass before enabling for users. Add the
negative test (step 2) as a CI fixture so a builder regression that drops an OpEqualVerify is
caught.

## 8. Top risks / uncertainties (read before implementing)

R1 (HIGH) - OpTxOutputSpk push byte format is UNCONFIRMED. The SPK-equality templates are
provisional until a golden vector from a real TN12 OpTxOutputSpk push pins the exact form
(version prefix? length prefix?). Mitigation: ship the Amount binding first; gate the Spk
binding on the golden. See sections 1, 4.

R2 (HIGH) - change/skim outputs. output[0]-only binding is unsafe without OpTxOutputCount == 1
(or a fully-accounted multi-output form). The templates include the count bind; do NOT drop
it. A missing OpTxOutputCount check is a fund-redirect hole.

R3 (MED) - baked fee literal. The exact-fee form makes the pot spendable only in a tx whose
miner fee equals the baked fee. Wrong fee = unspendable (safe) or miner overpay (not attacker).
Document the constraint; a tolerance form is a post-e2e enhancement, not v1.

R4 (MED) - T1 builder gap. Vendored kaspa-txscript 0.15 cannot name the opcodes
(channel.rs:13). Either bump/vendor v2.0.1 or splice raw bytes (ZkGameSettle precedent). The
raw-byte interim must still pass the disassembler round-trip (disassembler.rs already maps
0xb3/0xb4/0xb9/0xbe/0xbf/0xc2/0xc3, mainnet_live).

R5 (MED) - index operand encoding for 0xbe/0xc2/0xc3/0xbf. They pop an i32; index 0 must be
pushed in the minimal form the opcode accepts (likely OP_0). Verify in T1 (section 1, item 3).

R6 (LOW) - sig_op_count + mass. WinnerBound A1 has ZERO sig ops (pure introspection); confirm
the node accepts a 0-sigop spend and that mass/fee estimation handles introspection opcodes.

R7 (LOW) - this is NOT a justice/penalty channel. KIP-10 does not enable Lightning-style
penalty txs (channel.rs honesty note). Do not over-claim what introspection covers.
