# Merkle Membership + Oracle Example

This example shows a basic end-to-end flow using the current production Covex infrastructure (as of Phase 8).

## What This Example Covers

- Using a real Groth16 proof for Merkle Membership
- Submitting it to the live oracle to get a signed outcome
- Understanding how that signature can be used to unlock a covenant

## Files in This Example

- `proof.json` — A working proof (secret = 42) that you can use for testing
- `submit-to-oracle.sh` — Simple script to call the oracle endpoint
- `notes-on-unlocking.md` — Guidance on how to use the returned signature

## Quick Start (Testnet)

1. Make sure you have a covenant deployed with `merkle_membership` circuit type.
2. Run the oracle submission:

```bash
./submit-to-oracle.sh
```

3. You should receive a response containing `outcome`, `signature`, and `message`.

4. Use the signature as witness data when constructing the unlock transaction for that covenant.

## Important Notes

- This is an **oracle-attested** flow.
- The covenant on-chain currently enforces outcome range + fee parameters. The actual economic logic (who gets paid what) is still enforced off-chain or via trusted parties until silverc gains stronger payout primitives.
- See the main `docs/UNLOCK_WITH_ORACLE_SIGNATURE.md` for more details.

This example will be expanded as more of the flow becomes automated.
