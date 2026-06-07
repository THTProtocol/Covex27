# Chess Dual Proving Modes Example (Covex27)

## Overview
Demonstrates both Hybrid (fast, mode=0) and Full ZK (stronger, mode=1) for FIDE chess covenants.

- **Hybrid**: chess.js supplies limited candidates/attacks (4 slots for speed). Circuit verifies move + transition + safety + end conditions from list. Target <15s proofs.
- **Full ZK**: More exhaustive (8 slots). Circuit has stricter checks (e.g. for mate claims, must supply non-empty cand list proving search done). Public proving_mode=1 committed in proof.

## Usage
1. cd zk/games/chess
2. Hybrid (fast): node scripts/prove_move.js 12 28 0   # mode=0
3. Full: node scripts/prove_move.js 12 28 1     # mode=1 (more work in witness)
4. The output witness/proof includes proving_mode in public signals.
5. Submit to oracle: POST /api/oracle/verify-and-sign with circuit_type=chess_v1, proving_mode in body or public.
6. Oracle logs the mode, verifies proof (same for both), signs outcome.

See zk/games/chess/CHESS_PROVING_MODES.md and CHESS_PROVING_MODES.md for security assumptions and circuit details.

## Files
- prove_hybrid.sh / prove_full.sh (example wrappers)
- sample_config.json (with proving_mode)
- chess_covenant_mode_oracle.sil (on-chain SilverScript example consuming proving_mode + oracle outcome; see below)

## On-Chain SilverScript Example for Chess Covenant (Phase 4 prep)
Added `chess_covenant_mode_oracle.sil` — a concrete .sil template for a chess covenant that:
- Takes `provingMode` (0/1) in constructor (bound at deploy time via aa20+ payload).
- `unlock(outcome, provingModeWitness, oracleSig, ts)` consumes the oracle-signed outcome (from /api/oracle/verify-and-sign for chess_v1) + the mode used in the proof.
- Documents + illustrates use of aa20+ (aa20 for complex game logic with mode flag; aa21+ for timelocks/multi-sig/pools) for script constraints, mode checks, oracle pubkey binding + sig verification as witness.
- Comments explain the flow: prove with mode (via prove_move.js), oracle sign (mode logged), use sig+outcome+mode_witness in unlock tx (via compute-payout helper or manual).
- References real components: CHESS_PROVING_MODES.md, compiler.rs emit_chess, backend main.rs unlock_witness, docs/UNLOCK_WITH_ORACLE_SIGNATURE.md + ONCHAIN_EVOLUTION_PATH.md.
- Pragmatic/honest: uses require/if patterns that current silverc supports; full OpCheckSig / on-chain mode-gated payout / ZK sig verify is future (see vision "Phase 4 prep").

### How to use aa20+ for mode check or sig (from the .sil + notes)
- Deployed covenant payload starts with `aa20` (or aa21/aa22/aa23 variants) — indexed by crawler/indexer/covenant_types.rs.
- Mode check: provingMode in state/constructor + witness match in unlock (or via script_constraint circuit proving exact aa* fragment used).
- Oracle sig: passed as witness; oracle pubkey can be embedded; verified in helper today (SHA over "covex-oracle:<id>:<outcome>:<ts>"); tomorrow direct in SilverScript via OpCheckSig or onchain_sig_verify element.
- Example consumption: after oracle response, build spend providing the 4 unlock args. Mode can gate branches (e.g. full=1 requires stronger evidence or different splits).
- See also: examples/chess-modes/chess_covenant_mode_oracle.sil (copy to editor), zk/onchain_sig_verify.circom (for sig possession proof), backend/src/compiler.rs (generic emitters + chess), frontend CovexTerminal (proving_mode selector + generateSilverScript).

This fulfills the on-chain SilverScript chess example for consuming proving_mode + oracle outcome.
