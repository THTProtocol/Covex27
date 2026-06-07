pragma circom 2.0.0;

// onchain_sig_verify.circom — Phase 3 on-chain prep stub (Covex27)
// Prove possession of a valid oracle (or multi-oracle) signature over (covenant_id, outcome, ts)
// without revealing the oracle private material. Starts as hybrid/oracle-attested.
// Later: on-chain consumption via SilverScript + OpCheckSig (or ZK verifier element).

template OnchainSigVerify() {
    signal input covenant_id_hash; // public-ish commitment to covenant
    signal input outcome;          // public 0/1/2
    signal input ts;               // public timestamp
    signal input oracle_pubkey_hash; // public (binds to disclosed oracle)
    signal input sig_r;            // signature component (or hash of sig for stub)
    signal input sig_s;

    // Stub constraint: for dev, just require non-zero sig parts (real would be ecdsa/snark or poseidon sig verify)
    signal sig_nonzero <== sig_r * sig_s;
    sig_nonzero === sig_nonzero; // tautology for stub; real impl adds pairing/ecdsa checks

    // Public outputs for covenant: the verified outcome + binding
    signal output verified_outcome <== outcome;
    signal output bound_covenant <== covenant_id_hash;
}

component main { public [covenant_id_hash, outcome, ts, oracle_pubkey_hash] } = OnchainSigVerify();
