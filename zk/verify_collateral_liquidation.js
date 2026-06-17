#!/usr/bin/env node
"use strict";
// SECURITY (C1 hygiene): this script has NO real circom circuit + committed vkey.
// It used to print {valid:true} for ANY input, which - if this circuit were ever
// registered as Strict/Hybrid in oracle_verifier.rs - would let the oracle sign a
// forged outcome. `collateral_liquidation` is not registered at all (the oracle
// refuses to sign unregistered circuits), so this script is currently unreachable,
// but we fail closed unconditionally so it can never become a rubber-stamp.
// (Mirror of verify_attested.js.)
console.log(JSON.stringify({
  valid: false,
  error: "collateral_liquidation is an attested stub, not a cryptographic verifier",
}));
process.exit(0);
