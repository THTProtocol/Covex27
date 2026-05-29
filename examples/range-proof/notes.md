# Range Proof — Notes on Future Covenant Unlocking (Phase 9)

This document will be expanded the moment the first production range_proof artifacts + oracle signatures exist.

## How a Range-Proof-Gated Covenant Would Work (High Level)

1. Creator deploys a silverc covenant that:
   - Accepts a range_proof + oracle signature as witness
   - Checks that the signed message matches expected format
   - Enforces min/max bounds on-chain if silverc supports (currently limited)
   - Releases funds according to outcome (claimant vs depositor)

2. User who wants to claim:
   - Generates a real Groth16 proof using their private value + public min/max/commitment
   - Submits proof to /api/oracle/verify-and-sign (circuit_type=range_proof)
   - Receives outcome + signature + message

3. User (or a helper script) constructs + broadcasts the unlock transaction containing:
   - The public inputs (commitment, min, max)
   - The oracle signature
   - The outcome chosen by the oracle after verification

Until silverc + Kaspa scripting have richer OpCheckSig / signature verification primitives, the on-chain covenant will still be relatively simple (mostly range + fee guards + "assume oracle was honest").

## Current (Phase 9) Status

- The cryptographic primitive (the circuit) is authored and correct in structure.
- The oracle integration surface is stubbed with an explicit message.
- No live covenant on TN12 yet uses this circuit.

See UNLOCK_WITH_ORACLE_SIGNATURE.md (root docs) for the merkle pattern that range_proof will follow.

## When This Becomes Real

The very next engineering spike after Phase 10 / launch will be:
1. Proper circom 2.x build in clean env
2. Small Powers-of-Tau contribution or reuse of pot10
3. zkey + vkey generation
4. verify_range.js + oracle wiring
5. One end-to-end demo covenant + video

At that point this notes.md will be replaced with copy-paste commands that actually move testnet (then mainnet) KAS.

---

*Phase 9 delivered the missing piece of the technical foundation. Execution continues.*