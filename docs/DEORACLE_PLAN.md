# Remove the Covex oracle (staged) - authoritative plan

Owner directive (2026-06-22): make "Covex operates no oracle" literally TRUE. Covex's
trust-minimized core = ZK proof tooling + on-chain primitives. Any off-chain attestation
must come from an EXTERNAL resolver the user connects or creates (never Covex's key). Do it
in STAGES with on-chain proofs; never break a live payout. Designed by a 4-architect +
3-judge panel; this is the synthesis.

## Where the Covex oracle key is used today

- GAMES: `oracle_escrow` covenant `[Covex-oracle, p1, p2]`. The Covex key re-derives the
  winner from the engine and co-signs the payout (`covex-oracle:<id>:<outcome>:<ts>`).
- ZK: Covex key verifies a Groth16 proof OFF-CHAIN and co-signs (Kaspa has NO on-chain
  pairing verifier).
- MARKETS: already external - `binary_oracle_select` external-resolver hashlock, no Covex
  key. PROVEN live on TN12. This is the pattern everything migrates onto.

## Chosen mechanism

- GAMES -> `binary_oracle_select`: an EXTERNAL referee/resolver holds both per-game secrets
  and reveals ONLY the winner's; the winner redeems with that secret + their OWN OpCheckSig;
  CSV refund to funder if the referee is silent. (The panel proved "players hold their own
  secrets" is UNSOUND: branch assignment is by slot, so a loser can self-claim their slot
  regardless of the game result. A single non-player revealer is the only sound forced
  winner-takes-all on Kaspa, which has no introspection opcodes for a forfeit.)
- ZK: the 4 self-contained circuits (merkle_membership, age_verification, escrow_2party,
  range_proof) -> pure on-chain primitives, no co-sign. All others -> resolver-published
  hashlock: an external resolver runs verify_*.js off-chain and reveals the secret only on a
  valid covenant-bound proof. Covex's verify endpoint returns `{valid}`, never a signature.

## Stages (each independently shippable + on-chain provable)

1. **Honesty + freeze hardening (SAFE NOW, no live break).** Assert the mainnet oracle freeze
   + the binary_oracle_select external-hash mandate; reframe ALL user-facing copy to the
   honest model (Covex operates no oracle for real money; external resolver for real-world; ZK
   = tooling + off-chain verify; games = testnet co-sign in transition). Proof: TN12
   binary_oracle_select redeem decode shows NO Covex xonly. (Freeze already live + proven.)
2. **Games hashlock rebind behind a default-OFF flag.** `games.rs::lock_pot` gains
   `settle_mode='hashlock'` building a binary_oracle_select pot. No live break. TN12 e2e.
3. **Winner self-settle + CSV refund for the hashlock pot.** Zero Covex signatures. TN12 e2e.
4. **Flip games default to hashlock; freeze NEW oracle_escrow pots** (legacy drains on old
   path). TN12 e2e from the prod UI.
5. **ZK external-resolver rebind** (high risk, breaks testnet ZK payout path).
6. **Retire COVEX_ORACLE_KEY from the signing path** (allowlist legacy only); make the claim
   literally true everywhere. Audit endpoint + health assertion.

## Copy that becomes TRUE after each stage

- After 1: "On mainnet, Covex-key oracle covenants cannot be funded; real-money settlement
  binds to an external resolver's published hashlock the chain verifies (OpBlake2b) + timelock
  refund." Real-world facts: external resolver only. ZK: Covex provides tooling; proofs verified
  off-chain (4 self-contained circuits are pure on-chain). Games: testnet co-sign, in transition.
- After 4: "New game pots settle on-chain by the winner alone; Covex operates no oracle for new games."
- After 6: "Covex operates no oracle and holds no key on any new payout path."

## FORBIDDEN (keeps the reframe honest)

- Calling any non-self-contained ZK circuit "on-chain" or "trustless".
- Claiming Covex "decides" a game winner (it only displays a replayable result).
- Calling ANY external-resolver flow "trustless" - correct phrasing: "no Covex trust; trust
  sits with the disclosed external resolver you chose/run."
- No em or en dashes (CI byte-gate).

## Residual trust that CANNOT be removed on Kaspa (state plainly)

- ZK soundness is off-chain for every circuit beyond the 4 self-contained ones (no pairing
  verifier). Moving the verifier off Covex makes "no Covex oracle" true, NOT trustless.
- Forced winner-takes-all needs a non-player third party (no introspection opcodes for a
  forfeit). A lying-but-live referee can collude; CSV protects against silence, not a liar.
- Game-result semantics lean on the publicly-replayable move log unless the RISC0 zkVM prover
  (built, not the live path) is used.

Files: backend/src/covenant_builder.rs (redeem_binary_oracle_select:538 reuse, resolve_oracle_xonly:1837,
deploy freeze:1865-1888), backend/src/games.rs (lock_pot:279, settle_pot:407), backend/src/oracle.rs
(retire sign_outcome/oracle_keypair from money path), frontend/src/lib/enforcement-copy.js,
frontend/src/lib/oracle/request.js + the standalone resolver.
