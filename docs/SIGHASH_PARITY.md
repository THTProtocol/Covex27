# Sighash parity: the empty-payload divergence (Rust signer vs browser redeemer)

Status: DOCUMENTED, NOT ALIGNED. This file records a known, intentional difference
between the two code paths that build a covenant-spend sighash. It is a DOC only.
Aligning the two stacks is a FUND-PATH change and MUST NOT be done without a real
TN12 end-to-end spend (see "Alignment is a fund-path change" below).

## The two stacks

A covenant P2SH spend is signed in two independent places:

1. Backend (Rust): `backend/src/signer.rs` and `backend/src/covenant_builder.rs`,
   using the vendored sighash at
   `backend/vendor/kaspa-consensus-core/src/hashing/sighash.rs`
   (`calc_schnorr_signature_hash` -> `payload_hash`).

2. Browser (JS): `frontend/src/lib/redeemer/covenantRedeemer.js`
   (`buildUnsignedSpend`), using kaspa-wasm's sighash inside the wallet.

Each stack is internally self-consistent: the side that builds the tx is also the
side that signs it, so the signature it produces verifies against the tx it built,
and the node accepts the resulting spend. Both paths produce node-valid spends today.

## The exact difference

The Kaspa transaction signing hash folds in a `payload_hash(tx)` (Toccata HF: the
payload is committed in EVERY input's sighash). The OFFICIAL Toccata rule for that
field is:

```
if tx.subnetwork_id.is_native() && tx.payload.is_empty() {
    payload_hash = ZERO_HASH            // the 32-byte all-zero hash
} else {
    payload_hash = hash(write_var_bytes(&tx.payload))   // u64-LE length prefix then raw bytes
}
```

The two Covex stacks handle the `native + empty payload` case differently:

- Browser `buildUnsignedSpend` (covenantRedeemer.js, the `new Transaction({...})`
  call, currently ~L862) sets `payload: new Uint8Array(0)` on a NATIVE-subnetwork
  spend (`subnetworkId: new Uint8Array(20)`). It relies on the wasm implementing the
  official native+empty -> ZERO_HASH rule.

- Backend signer.rs (the "TOCCATA SIGHASH GUARD", currently ~L514) FORBIDS an empty
  payload and injects a non-empty branded marker (`b"covex:pay:" + tier` on the
  fee-only payment path; the covenant-spend path in covenant_builder.rs uses
  `b"covex-p2sh-spend"`). It never emits an empty payload.

- The vendored sighash (`payload_hash`, sighash.rs ~L82-L109) does NOT implement the
  official native+empty -> ZERO_HASH shortcut. It carries a `debug_assert!` that the
  tx is NOT native+empty, then unconditionally hashes `write_var_bytes(&tx.payload)`.
  For an empty payload that is `hash(u64-LE 0)` which is NOT ZERO_HASH. The vendored
  code documents this verbatim: the ONLY divergence from official Toccata is the
  native + empty payload case (official -> ZERO_HASH; vendored -> hash of
  write_var_bytes(&[])), and the assert exists so a future empty-payload tx fails
  loudly rather than silently signing under the wrong rule.

Net: if a browser-built empty-payload native spend were ever signed by the vendored
Rust signer (or hashed under the vendored rule), the two would compute DIFFERENT
sighashes for the SAME tx. Today they never meet on an empty payload, because the
backend always makes the payload non-empty and the browser always builds + signs its
own tx with the wasm rule. So each stack is correct on its own; they are only
NON-INTEROPERABLE on the native+empty case.

## The decided canonical rule

The canonical sighash rule is the OFFICIAL Toccata rule:

> native subnetwork AND empty payload => payload_hash = ZERO_HASH.

Rationale: it is what the consensus node enforces, and it is the rule the browser
wasm already follows. Any future alignment should make the Rust path agree with this
(e.g. by allowing an empty payload and returning ZERO_HASH for the native case, or by
having BOTH sides use the SAME non-empty payload), not the other way around.

The committed canonical sighash golden for the NON-empty (current production) case is
`tests/fixtures/sighash_vector.json`, asserted by the Rust test
`sighash_vector_matches_committed_golden` in
`backend/src/covenant_builder.rs`. A later frontend task asserts the browser path
produces the same 32-byte sighash for that same fixed spend. That fixture pins the
NON-empty path both stacks already agree on; it is the safe interop anchor.

## Alignment is a fund-path change (do NOT do it without a TN12 e2e)

Changing EITHER `signer.rs` (the non-empty marker / empty-payload guard) OR
`covenantRedeemer.js` (the empty payload) so that the two stacks agree on the
native+empty case is a CHANGE TO THE MONEY PATH:

- The sighash determines which signatures the consensus node will accept. A wrong
  payload rule produces a signature the node rejects ("false stack entry at end of
  script execution") and the spend cannot be broadcast: the funds appear stranded
  until re-signed correctly.
- A subtle mismatch could also let one stack sign a tx the other stack (or a future
  node version) treats as a different tx.

Therefore any such alignment MUST be proven with a real testnet-12 end-to-end:
deploy a covenant, spend it through the changed stack, and confirm the node accepts
the broadcast and the UTXO is consumed. It must NOT be merged on the strength of unit
tests alone.

This file changes NO behavior. signer.rs and covenantRedeemer.js are intentionally
left untouched.
