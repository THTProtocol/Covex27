# How to Unlock a Covenant Using an Oracle Signature (Phase 5)

This document explains the current (as of Phase 5) way to use a signature from `/api/oracle/verify-and-sign` to unlock a covenant on testnet or mainnet.

## Current Reality (Honest)

As of the end of Phase 5:

- The Covex Oracle can verify a real ZK proof (e.g. Merkle Membership) and return a signed outcome.
- The signature is currently a **SHA256 key-possession proof** (same style as the terminal config ownership proof), **not** a proper Schnorr signature that can be directly used in `OpCheckSig`.
- Because of silverc v0.1.0 limitations, the emitted covenant does **not** contain full `VerifyPayout` logic. It mainly enforces outcome range + fee parameters.
- Actual fund movement still happens via normal Kaspa transaction construction using the oracle signature as part of the witness data.

## Step-by-Step: Using the Signature

1. **Get a valid signature**
   - Submit a valid proof to `POST /api/oracle/verify-and-sign`
   - You will receive something like:
     ```json
     {
       "success": true,
       "outcome": 0,
       "signature": "ff174f14b315a1f1...",
       "message": "covex-oracle:your-covenant-id:0:1780095307",
       "timestamp": 1780095307
     }
     ```

2. **Verify the signature locally (recommended)**
   - Recompute `SHA256(oracle_private_key || message)`
   - Compare with the returned `signature`.

3. **Construct the unlock transaction**
   - You must build a Kaspa transaction that spends the covenant UTXO.
   - Include the oracle signature + outcome + timestamp as witness data.
   - The exact script condition depends on how the covenant was compiled (see `emit_merkle` and `emit_generic_game` in the compiler).

4. **Broadcast**
   - Use the existing signer/broadcast infrastructure or construct the transaction manually.

## Important Limitations

- This is still an **oracle-attested** model, not pure on-chain ZK.
- Full automated "submit proof → money moves" UX will require either:
  - Improvements to silverc, or
  - A more sophisticated covenant design that can verify the oracle signature on-chain.

## Future Direction

Phase 5+ work is expected to focus on:
- Better on-chain signature verification paths once silverc supports more opcodes.
- Multiple circuits with full oracle flows.
- Possibly a small helper service that can construct the unlock transaction given a proof + signature.

---

**Document created during Phase 5 execution (2026-05-30)**
