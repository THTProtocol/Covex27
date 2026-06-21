pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// sanctions_non_membership.circom - prove a value is NOT in a published sorted blocklist (Covex27)
//
// DEPLOYMENT IS LEGAL / COUNSEL-GATED. This circuit attests OFAC / sanctions / blocklist
// NON-membership. Turning it on for any real covenant is a compliance decision for counsel,
// not an engineering default. The math below is sound regardless; whether you are ALLOWED to
// rely on a given blocklist root, and what it legally certifies, is out of scope of the circuit.
//
// STATEMENT (generalizes set_non_membership.circom):
//   Prove that a committed value is absent from a sorted-Merkle blocklist, via a non-membership
//   witness = the two ADJACENT sorted leaves (lo, hi) that bracket the value.
//
//   The blocklist is a Merkle tree (depth 4, 16 leaves) whose leaves are "range nodes"
//   Poseidon(lo, hi) for two ADJACENT entries (lo, hi) of the sorted blocklist. A value V is
//   absent iff there is a committed range node with lo < V < hi (V falls strictly between two
//   adjacent blocked entries, hence V is itself not one of them). Proving one Merkle path to such
//   a range node + strict bracketing is exactly equivalent to non-membership for a SORTED set, and
//   is far cheaper than two separate membership disproofs.
//
//   The blocklist entries (lo, hi) are themselves the SORT KEYS the publisher used. In production
//   they are typically Poseidon(address) hashes; the circuit treats them as opaque field elements
//   in [0, 2^bits) and only relies on their sorted order under integer comparison.
//
//   Public:  blocklistRoot   - Merkle root of the sorted blocklist range-node tree
//            valueCommitment  - Poseidon(value), publicly binds WHICH value was cleared
//            covenantId       - H4 anti-replay binding
//   Private: value            - the value being cleared (its plaintext stays hidden)
//            low, high        - the bracketing adjacent blocked entries (lo < value < high)
//            pathElements[4]   - Merkle siblings of the Poseidon(low, high) range node
//            pathIndices[4]    - 0 = node is left child, 1 = node is right child
//   Output:  valid == (low < value) AND (value < high) AND Merkle path of Poseidon(low,high)
//                     recomputes to blocklistRoot AND valueCommitment == Poseidon(value)
//
// SOUNDNESS / HONESTY:
//   - `valid` is a CONSTRAINED OUTPUT (valid <== ltLo.out * ltHi.out); it is never a free input
//     and there is no `valid <== 1` stub. The Merkle-root match and the valueCommitment match are
//     HARD === constraints, so a satisfying witness can only exist when those hold; `valid` is 0
//     unless strict bracketing also holds. The oracle gates co-signing on valid == 1, so it can
//     never be coerced into clearing a genuinely-blocked value.
//   - Every free numeric operand fed to a LessThan comparator (low, value, high) is Num2Bits
//     range-bound to [0, 2^bits) FIRST. Without this a field-wrap witness could forge the
//     bracketing and clear a blocked value. bits = 64.
//   - covenantId is bound via cbindH4 and exported in public[] (H4 anti-replay).
//
// v1 SIMPLIFICATIONS (documented for honesty):
//   - Tree depth is fixed at 4 (max 16 range nodes -> blocklists up to 17 sorted entries per
//     proof). A production list of N entries needs depth = ceil(log2(N-1)); re-instantiate
//     SanctionsNonMembership(depth, 64) with a larger depth and regenerate keys. This is a sizing
//     parameter only; the soundness argument is depth-independent.
//   - The circuit does NOT verify that the blocklist is actually sorted or that (low, high) are
//     truly ADJACENT in the publisher's tree beyond "both bracket value and their Poseidon node is
//     in the tree". Soundness of non-membership therefore RESTS ON the published root being a
//     correctly-sorted adjacency tree. That is the publisher's (counsel-approved) responsibility,
//     stated here so no one over-claims. If the publisher commits a malformed/unsorted root, this
//     proof certifies only "value lies strictly between two committed bracket values", which is
//     the documented v1 trust boundary.
//   - bits = 64 caps the value domain; values/hashes must be reduced to < 2^64 before use (the
//     prover does this). Wider domains need a larger `bits` and matching range checks.
//
// CEREMONY HONESTY: keys come from a single-contributor Covex DEV ceremony (pot*_final.ptau),
// NOT a production multi-party MPC. Proofs are verified OFF-CHAIN by the disclosed, fail-closed
// oracle, never by an on-chain pairing verifier (Kaspa has none).

template SanctionsNonMembership(depth, bits) {
    signal input blocklistRoot;                                 // public: sorted-blocklist root
    signal input valueCommitment;                               // public: Poseidon(value)
    signal input covenantId; signal cbindH4 <== covenantId * covenantId; // H4 binding
    signal input value;                                         // private: the value being cleared
    signal input low;                                           // private: lower adjacent blocked entry
    signal input high;                                          // private: upper adjacent blocked entry
    signal input pathElements[depth];                           // private: Merkle siblings
    signal input pathIndices[depth];                            // private: 0 = node is left, 1 = node is right
    signal output valid;

    // (0) Bind the public valueCommitment to the private value: valueCommitment === Poseidon(value).
    // This publicly fixes WHICH value the proof clears, without revealing its plaintext, so the
    // oracle / consuming covenant can reference a stable commitment.
    component vc = Poseidon(1);
    vc.inputs[0] <== value;
    valueCommitment === vc.out;

    // (1) Range-bind low, value, high to [0, 2^bits) BEFORE comparison. circomlib LessThan is only
    // sound when its inputs are already known < 2^bits; otherwise a field-wrap forges the bracket.
    component rbLow = Num2Bits(bits);
    rbLow.in <== low;
    component rbVal = Num2Bits(bits);
    rbVal.in <== value;
    component rbHigh = Num2Bits(bits);
    rbHigh.in <== high;

    // (1b) Strict bracketing: low < value AND value < high.
    component ltLo = LessThan(bits);
    ltLo.in[0] <== low;
    ltLo.in[1] <== value;
    component ltHi = LessThan(bits);
    ltHi.in[0] <== value;
    ltHi.in[1] <== high;

    // (2) Merkle path of the range node Poseidon(low, high) up to blocklistRoot.
    component rangeNode = Poseidon(2);
    rangeNode.inputs[0] <== low;
    rangeNode.inputs[1] <== high;

    signal cur[depth + 1];
    cur[0] <== rangeNode.out;

    component lvl[depth];
    signal leftIn[depth];
    signal rightIn[depth];
    for (var i = 0; i < depth; i++) {
        // pathIndices[i] must be boolean.
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        // index==0 -> current node is LEFT child; index==1 -> RIGHT child.
        leftIn[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        rightIn[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);
        lvl[i] = Poseidon(2);
        lvl[i].inputs[0] <== leftIn[i];
        lvl[i].inputs[1] <== rightIn[i];
        cur[i + 1] <== lvl[i].out;
    }
    // Hard constraint: recomputed root must equal the public blocklistRoot.
    blocklistRoot === cur[depth];

    // (3) valid = strict-bracketing holds (root match + commitment match are already === enforced).
    valid <== ltLo.out * ltHi.out;
}

component main { public [blocklistRoot, valueCommitment, covenantId] } = SanctionsNonMembership(4, 64);
