#!/usr/bin/env node
"use strict";

/**
 * SECURITY (C1): This is NOT a cryptographic verifier.
 *
 * It used to print {valid:true} for ANY input, which - when wired as a circuit's
 * verify script behind a HybridGroth16 registry entry - let anyone forge an oracle
 * signature with a bodyless / junk "proof". The circuits that delegated here
 * (ml_inference_stub, poker_equity, anon_credential, sorting_proof, multi_sig_gating,
 * verifiable_poker_solver, ...) have NO real circom circuit + committed verifying key.
 *
 * Those circuits are now registered as VerifierSpec::Attested in oracle_verifier.rs, so
 * the oracle handler refuses to sign their caller-supplied outcome regardless of this
 * script. This neutering is defense-in-depth: even if some path still invokes a verify
 * script that delegates here, it can no longer report a cryptographic pass. We therefore
 * print valid:false unconditionally (still exit 0 so the Rust caller parses {valid:bool}
 * and treats it as a verification FAILURE, not a runtime error).
 */
function main() {
  console.log(JSON.stringify({
    valid: false,
    error: "attested stub is not a cryptographic verifier",
  }));
}
main();

module.exports = { main };
