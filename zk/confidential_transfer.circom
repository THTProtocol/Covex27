pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// confidential_transfer.circom - prove a BALANCED confidential transfer (Covex)
//
// STATEMENT (v1):
//   The sender's hidden balance is conserved across a transfer. With Poseidon
//   commitments to the three (otherwise hidden) amounts, prove ALL of:
//     (C1) cOld == Poseidon(senderOld, saltOld)      // old balance commitment opens
//     (C2) cNew == Poseidon(senderNew, saltNew)      // new balance commitment opens
//     (C3) cAmt == Poseidon(amount,    saltAmt)      // transfer-amount commitment opens
//     (B)  senderOld == senderNew + amount + fee     // integer value conservation
//   valid <== C1 * C2 * C3 * B   (1 iff every clause holds, else 0).
//
//   Public:  cOld, cNew, cAmt, fee, covenantId
//   Private: senderOld, senderNew, amount, saltOld, saltNew, saltAmt
//   Output:  valid  (publicSignals[0])
//
// PUBLIC SIGNAL LAYOUT (snarkjs order = circuit output first, then `public [...]` order):
//   [0] valid
//   [1] cOld
//   [2] cNew
//   [3] cAmt
//   [4] fee
//   [5] covenantId
//
// WHY THIS IS A REAL CONFIDENTIAL TRANSFER:
//   The actual balances (senderOld, senderNew) and the transferred amount are NEVER revealed; only
//   their Poseidon commitments and the (public, protocol-chosen) fee appear in the public signals.
//   Conservation senderOld = senderNew + amount + fee is enforced over the integers (no value is
//   minted or burned), and each public commitment is bound to the same private witness that the
//   conservation equation uses, so a verifying proof attests that the three committed values really
//   do balance. A prover cannot, for example, present an honest cOld/cNew while secretly inflating
//   the committed `amount`: cAmt is recomputed from the SAME `amount` that enters the equation.
//
// NEGATIVE-AMOUNT / MINT PROTECTION (the key soundness property):
//   Every value operand is Num2Bits(64) range-bound, so senderOld, senderNew, amount, fee all lie
//   in [0, 2^64). A "negative amount" in a prime field is a huge element near p; Num2Bits rejects it
//   outright (it is not 64-bit decomposable). Likewise senderNew cannot be a wrapped element. Hence
//   senderNew + amount + fee is an honest integer sum < 3 * 2^64 < 2^66 << p (no field wrap), and the
//   equality senderOld == senderNew + amount + fee holds over the integers. A malicious prover cannot
//   create coins by choosing amount = -k (which would let senderNew exceed senderOld): such an amount
//   fails its Num2Bits(64), so no valid proof exists for a negative-amount mint.
//
// SOUNDNESS NOTES:
//   - `valid` is a CONSTRAINED OUTPUT (product of four boolean sub-results), never a prover input and
//     never `=== 1`. A witness that violates any clause yields valid=0; the proof still verifies but
//     truthfully reports the failure, so the relying oracle MUST require publicSignals[0] == 1.
//   - Commitment binding uses IsEqual on the recomputed Poseidon vs the public commitment (constrained,
//     not asserted) so a wrong opening gives valid=0 rather than an unsatisfiable witness.
//   - covenantId is bound via cbindH4 = covenantId*covenantId and is public, for H4 replay binding.
//   - No field division is used anywhere.
//
// V1 SIMPLIFICATION (documented honestly, honesty-preserving):
//   * The transfer amounts are revealed TO THE CIRCUIT (they are private inputs the prover knows in
//     the clear); they stay hidden from the public/verifier behind the Poseidon commitments. This is a
//     commit-and-conserve scheme, NOT a homomorphic (Pedersen/ElGamal) value-hiding scheme: the salts
//     provide hiding of the committed scalars, but the commitments are not additively homomorphic, so
//     conservation is proven by re-opening inside the circuit rather than by adding ciphertexts.
//   * This circuit proves ONE sender's balance conservation (single-input, single-output + fee). It
//     does NOT prove the recipient's commitment, link cAmt to a specific recipient note, prevent
//     double-spend (no nullifier), or bind cOld to a prior on-chain note/UTXO. Those (recipient note,
//     nullifier set, note-tree membership) are the FULL shielded-pool upgrade and are intentionally
//     NOT claimed here, so a verifying proof implies exactly "these three committed amounts balance
//     with the public fee, all in [0,2^64), bound to covenantId" and nothing stronger.
//
// HONESTY: keys are a single-contributor Covex dev ceremony (pot*_final.ptau), NOT a production MPC.
// Verified OFF-CHAIN by the disclosed oracle (fail-closed), never on-chain (Kaspa has no pairing
// verifier). A verifying proof here gates the consensus-required oracle co-signature.

template ConfidentialTransfer(bits) {
    // ---- Public ----
    signal input cOld;        // Poseidon(senderOld, saltOld)
    signal input cNew;        // Poseidon(senderNew, saltNew)
    signal input cAmt;        // Poseidon(amount, saltAmt)
    signal input fee;         // protocol fee (public, range-bound)
    signal input covenantId;  // H4 cross-covenant replay binding
    signal cbindH4 <== covenantId * covenantId;

    // ---- Private ----
    signal input senderOld;   // hidden old balance
    signal input senderNew;   // hidden new balance
    signal input amount;      // hidden transferred amount
    signal input saltOld;     // commitment blinding factors
    signal input saltNew;
    signal input saltAmt;

    signal output valid;

    // Range-bind every VALUE operand into [0, 2^64). This rejects negative/huge field elements and
    // guarantees senderNew + amount + fee cannot wrap the field (sum < 3*2^64 << p), so the
    // conservation equality is exact over the integers and a negative-amount mint is impossible.
    component rcOld = Num2Bits(64);
    rcOld.in <== senderOld;
    component rcNew = Num2Bits(64);
    rcNew.in <== senderNew;
    component rcAmt = Num2Bits(64);
    rcAmt.in <== amount;
    component rcFee = Num2Bits(64);
    rcFee.in <== fee;

    // (C1) cOld opens to (senderOld, saltOld).
    component hOld = Poseidon(2);
    hOld.inputs[0] <== senderOld;
    hOld.inputs[1] <== saltOld;
    component eqOld = IsEqual();
    eqOld.in[0] <== hOld.out;
    eqOld.in[1] <== cOld;

    // (C2) cNew opens to (senderNew, saltNew).
    component hNew = Poseidon(2);
    hNew.inputs[0] <== senderNew;
    hNew.inputs[1] <== saltNew;
    component eqNew = IsEqual();
    eqNew.in[0] <== hNew.out;
    eqNew.in[1] <== cNew;

    // (C3) cAmt opens to (amount, saltAmt).
    component hAmt = Poseidon(2);
    hAmt.inputs[0] <== amount;
    hAmt.inputs[1] <== saltAmt;
    component eqAmt = IsEqual();
    eqAmt.in[0] <== hAmt.out;
    eqAmt.in[1] <== cAmt;

    // (B) Conservation: senderOld == senderNew + amount + fee (exact integer equality, no wrap).
    component eqBal = IsEqual();
    eqBal.in[0] <== senderOld;
    eqBal.in[1] <== senderNew + amount + fee;

    // valid <== C1 * C2 * C3 * B. Chain the products (each multiply is one quadratic constraint).
    signal cc1 <== eqOld.out * eqNew.out;
    signal cc2 <== cc1 * eqAmt.out;
    valid <== cc2 * eqBal.out;
}

component main { public [cOld, cNew, cAmt, fee, covenantId] } = ConfidentialTransfer(64);
