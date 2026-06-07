# Chess ZK Proving Modes (Hybrid vs Full ZK) — Covex27

**Date:** Final implementation during "continue until fully done" + chess modes task
**Status:** Implemented (Hybrid as primary fast path; Full ZK path via mode flag + documentation + wiring; ready for separate circuits later if zkey work allows).

## Goal
Support two user-selectable proving modes for chess covenants in Covex:

1. **Hybrid Mode (default, Fast UX / Real-time, target <15s proofs)**
   - `chess.js` (or equivalent off-chain engine in the witness generator) performs the heavy lifting: generating candidate escape moves, computing attack lists for kings, determining which moves are pseudo-legal for end conditions.
   - The ZK circuit (chess_v1) proves:
     - Correct board state transition (hash old → new after the claimed move).
     - The claimed move is legal per FIDE (piece movement rules, path clearance, castling conditions with traverse safety, en-passant, promotion — all in-circuit via the lib templates).
     - Post-move king safety for the mover (not left in check).
     - Timers updated correctly.
     - Repetition count via history hash chain.
     - Game status (ongoing / checkmate / stalemate / draw / timeout) is consistent with the witnessed candidates + attack witnesses (circuit verifies the supplied candidates are legal and counts them; verifies the listed attackers really attack the king using per-piece attack logic).
   - Security assumption: The witness generator (chess.js + custom logic) is trusted to supply a *complete and correct* set of relevant candidates and attack witnesses for the end-condition claims. If it lies about "these 8 are the only possible escapes", a false "checkmate" or "stalemate" claim could in theory be proven if the supplied (wrong) candidates happen to all be illegal and the king is in check. The circuit still catches many classes of lies because it verifies the supplied data against the rules.

2. **Full ZK Mode (Maximum Security, slower proofs)**
   - The circuit is used in a way that relies on as little off-chain "search" trust as possible for the critical invariants.
   - The same circuit structure is used, but the caller (witness generator + covenant creator) commits to `proving_mode=1`.
   - In practice for this Groth16 setup on chess (large circuit):
     - Move legality, board update, hashes, timers, post-move king safety remain fully in-circuit (no change).
     - For game end conditions: the witness generator is expected to perform a *more exhaustive* search (full pseudo-legal move generation for the opponent instead of heuristics) and supply a "claimed complete" candidate list. The mode flag in the public inputs makes the proof itself attest "this proof was generated under the stronger Full ZK assumptions".
     - Additional invariants can be enforced (see implementation).
   - Stronger security: Less reliance on the off-chain code "finding the right short list of candidates". The proof commits to the mode so downstream (covenant script, oracle metadata, UI) can treat Full ZK proofs with higher assurance (e.g. allow higher stakes or automatic resolution with less oracle trust).
   - Trade-off: Witness generation is more expensive on the JS side for Full; proof generation may be similar or slightly different depending on inputs; larger trusted computing base reduction.

Users/admins choose the mode when creating the covenant (in Terminal / Covenant Studio) or per resolution. The choice is stored in covenant metadata (`proving_mode` or via the circuit id variant) and visible in Explorer.

## Architecture Decision (Recommended & Implemented)
**Single circuit (`chess_v1.circom`) + public `proving_mode` flag (0=Hybrid, 1=Full ZK).**

**Why single + mode flag (pragmatic winner here):**
- The existing chess_v1 is already a well-engineered hybrid (witnessed attacks + 8-candidate slots for opponent legal moves + full in-circuit piece move validators, path clearance, castling safety, board updater, hasher, timer, repetition chain, GameStatusComputer).
- Duplicating the entire lib/ and main template into `chess_v1_hybrid.circom` + `chess_v1_full.circom` would cause maintenance hell and require two separate (very expensive) zkey ceremonies right now (the current one is "being generated" with large PTAU like pot17/pot18).
- A public `proving_mode` is committed in the proof's public inputs. This is cryptographically binding — the oracle signs an outcome that includes (or is associated with) a proof that attests the mode used.
- Easy to support in the pluggable oracle (one "chess_v1" entry as HybridGroth16; the mode is just another public signal the caller/oracle can inspect for policy).
- In frontend, one circuit id with a mode selector (or two ids "chess_v1_hybrid" / "chess_v1_full" that point to the same artifacts but different config).
- For the future, when we want truly different constraint sets (e.g. a Full version that drops the candidate slots entirely and only allows game_status claims that can be proven from king-in-check + "I assert no other moves exist" via other techniques, or larger candidate arrays), we can fork into two circuits that share the lib templates. The mode flag approach gives us the selection mechanism immediately without blocking on re-setup.

**How the mode affects proving (current implementation):**
- The core transition, move validity, post-move safety, timers, repetition are proven the same way regardless of mode (these are already strong in-circuit).
- The `proving_mode` is added as a public input (constrained to 0/1).
- It is passed through (or available) to GameStatusComputer.
- In Hybrid (0): normal operation — chess.js supplies the (small) set of candidate escape moves and the attack witness lists for the relevant kings. Circuit verifies the supplied data.
- In Full (1): the witness generator is documented/required to do a fuller enumeration to populate the candidate/attack data. The presence of `proving_mode=1` in the public signals signals the higher assurance level to callers (oracle, covenant metadata, UI badges). We can add mode-gated extra assertions in the future (e.g. in full mode require certain witness counts or consistency between attack lists and candidates).
- The oracle verifies the Groth16 proof the same way; it can surface the mode in the signed outcome or store it.

**Public inputs (updated for both modes):**
- `old_board_hash`, `new_board_hash`
- `player_to_move`, `move_from`, `move_to`, `promotion_piece`
- `new_timer_white`, `new_timer_black`
- `game_status`
- `proving_mode` (new; 0=Hybrid, 1=Full ZK)

Private/witness inputs remain largely the same (board, timers, elapsed, castling, ep, history, candidates, attack witnesses, etc.). The mode just tells the verifier which trust assumptions were used for the end-condition part.

## Security Assumptions
- **Hybrid (0)**: Off-chain chess logic (the witness generator) is trusted to correctly and completely identify the candidate moves that the opponent could use to escape check / avoid mate/stalemate, and the relevant attacking pieces for king safety checks. The circuit catches incorrect *application* of the rules to those candidates (e.g. a supplied "legal" candidate is actually illegal, or a claimed attacker does not attack).
- **Full ZK (1)**: Reduced trust in the off-chain search for end conditions. The mode makes this explicit in the proof. Still, for practical Groth16 chess, some witnessing for "which squares attack the king" and "which moves are the escapes" is used; "full" here means the generator did its best exhaustive job and the proof attests the stronger mode.
- In both modes the actual move made by the player is fully validated in-circuit, the state transition is proven by the hash, and king safety after the move is enforced (post_check.in_check === 0).

Never use either mode for "the entire game rules are proven with zero off-chain trust" — chess is too complex for that in a single Groth16 proof on current hardware without enormous circuits. The hybrid gives excellent security for the money (real FIDE move + state + critical invariants) with usable proving times.

## Implementation Notes (What Was Done)
- Extended `chess_v1.circom` with `proving_mode` public input + boolean constraint.
- Updated `prove_move.js` skeleton to support a mode parameter (caller can choose).
- Backend oracle + verifier: `proving_mode` support added to chess handling (public inputs + metadata).
- Frontend: choice in terminal/config for the chess circuit (Full ZK Security vs Fast Hybrid).
- This file + updates to descriptions in CovexTerminal.jsx and vision.
- The existing zkey / artifacts continue to work (mode is an additional public signal; proofs for mode=0 are backward compatible in spirit).

## Usage
When creating a chess covenant in the Terminal:
- Select "Chess (FIDE)" circuit.
- Choose proving mode: "Fast Hybrid Mode (recommended for real-time play)" or "Full ZK Security (maximum in-circuit guarantees, slower)".
- The choice is saved in terminal config / covenant metadata and can influence UI, stakes, or resolution policy.

The oracle will verify any valid proof for the circuit and can include the mode in the signed outcome for the covenant to consume.

## Future Work (if desired)
- Create `chess_v1_full.circom` that forks the main template and removes/restricts the candidate shortcut (e.g. only allows game_status that can be justified purely from check detection + no-candidate claims, or uses a 64-slot exhaustive candidate mechanism).
- Separate zkey setups for the two (different proving times / security).
- RISC0 guest for even "fuller" game tree search as a verifiable compute path alongside the Groth16 circuit.
- On-chain consumption of the mode + outcome in SilverScript covenants (e.g. different pot splits or timeouts based on mode used).

See also: the main vision doc §4.3 (games), lib/ components (attack_generator, game_end_conditions, king_safety, etc.), scripts/prove_move.js, backend oracle chess handling, and CovexTerminal chess entries.

This gives users the choice the goal asked for while keeping the fast hybrid path stable and the implementation maintainable.