# Mainnet / Toccata readiness: on-chain ZK games (KIP-16 ZkGameSettle)

Honest readiness checklist for shipping the on-chain-ZK `ZkGameSettle` games path to
Kaspa mainnet. This is the settlement model where the covenant itself verifies the
winner's Groth16 game proof on-chain via `OpZkPrecompile`, with NO Covex key in any
path. It supersedes BOTH the referee-hashlock interim and the legacy Covex oracle
co-sign for games.

Read alongside:
- `docs/ZK_ONCHAIN_PLAN.md` - the staged migration plan (Stages 0 to 6).
- `docs/zk_precompile_abi.md` - the byte-exact, frozen ABI of opcode `0xa6` / tag `0x20`.
- `docs/zk_onchain_proof.md` - the Stage 3 consensus-engine accept/forged-reject proof.
- `docs/DEORACLE_PLAN.md` - the wider "Covex operates no oracle" program this completes.

This doc claims nothing beyond what the three docs above already prove. Where a thing
is NOT proven, it says so.

## Toccata hard-fork facts

- Opcode: `OpZkPrecompile`, byte `0xa6`, sigop/template weight `1`. Verify-style: it
  returns `Err` (aborting the whole script, so consensus rejects the tx) on a bad proof,
  and pushes a single `true` on a good proof (no implicit `OpVerify`; the script must
  consume the `true`). Source: `zk_precompile_abi.md`.
- Tags: `0x20` = `Groth16` (ark-groth16 / BN254, cost 140000 script units),
  `0x21` = `R0Succinct` (risc0-zkp succinct receipt, cost 250000 script units). Covex
  games use tag `0x20`. The earlier "140 / 740 sigops" phrasing was wrong; the real
  figures are SCRIPT UNITS, per `zk_precompile_abi.md`.
- Mainnet activation: DAA score `474,165,565` (~30 Jun 2026 16:15 UTC). On mainnet and
  TESTNET10 the opcode is gated `never()` until that fork point.
- Our node: `kaspad 1.1.1-toc.1` (`kaspad-covenant`), source `/opt/htp/rusty-kaspa`
  branch `toccata` HEAD `b97d1089993b6466148e412c8c0a96ce671f9758`. On TN12,
  `covenants_activation = ForkActivation::always()`, so the opcode is live from genesis
  with no fork-DAA wait. That is why every Stage 0 to 3 proof below could run on TN12
  today while mainnet stays gated.

## What is PROVEN today (Stages 0 to 3, in master)

Each item below has concrete evidence in the cross-referenced docs.

- Opcode is live on our node (Stage 0). `OpZkPrecompile<0xa6,1>` is in the binary's
  opcode dispatch table, with `ark-groth16 0.6.0`, `ark-bn254`, `risc0-zkp 3.0.3`, and
  the strings `Groth16 verification failed` / `image_id mismatch` linked in. The body is
  gated on `covenants_enabled`, which is `always()` for TESTNET12. Evidence:
  `zk_precompile_abi.md`, "Stage 0 verdict".
- The journal binding is sealed under a REAL STARK proof (Stage 1). The RISC0 guest
  commits a `SettlementJournal { covenant_id, winner_code, winner_pubkey, stake_sompi,
  moves_digest }` and the host asserts `winner_pubkey == players[winner]` plus the
  `covenant_id` binding. With `RISC0_DEV_MODE=0` in WSL: 13 games proved and verified,
  6 illegal games produced NO receipt, and tamper gate #8 (a loser relabeling
  `winner_pubkey` on a genuine receipt) was REJECTED by a verify claim-digest mismatch.
  The payee binding is sealed. Evidence: memory `kaspa-kip16-onchain-zk-2026-06-24`.
- The `ZkGameSettle` covenant verifies a real Groth16 proof on-chain against the node's
  OWN consensus verifier, accepting valid and rejecting forged (Stage 3). The Covex
  builder's `redeem_zk_precompile_verify_core` byte layout was run through
  `kaspa_txscript::TxScriptEngine` with `covenants_enabled = true`, at the exact node
  source HEAD the running binary is built from. Result, from `zk_onchain_proof.md`:
  - Known-good Groth16 proof (the node's in-crate 5-input vector), Covex byte layout:
    `vm.execute() -> Ok` (verified on-chain).
  - Forged proof (one flipped byte), same layout: `vm.execute() -> Err(ZkIntegrity(
    "Groth16 verification failed"))` (rejected by consensus).
  - Test command: `cargo test -p kaspa-txscript --release covex_ -- --nocapture`
    (`covex_known_good_groth16_verifies_on_consensus_engine` and
    `covex_forged_groth16_is_rejected_by_consensus_engine` both pass).

## What is NOT yet proven (Stage 4, honest)

Two gaps remain before any mainnet claim. Neither is a defect in the covenant or the
byte layout; both are operational/environmental.

- The real GAME Groth16 seal. Everything proven on-chain so far used the node's GENERIC
  known-good Groth16 vector, not a Covex game's proof. Producing a real
  RISC0 -> Groth16 game receipt needs `ProverOpts::groth16()`, which runs the x86_64
  Docker stark2snark wrap. The 7GB Hetzner server cannot run it; this needs a dev/GPU
  box with Docker, or Bonsai. Until that seal exists, the public-input layout
  (covenant_id, winner_pubkey, journal binding reduced into BN254 Fr, 32-byte LE) is
  proven in ABI but not yet end-to-end with a real game. Evidence: `zk_onchain_proof.md`
  "Still needs the real game seal", `ZK_ONCHAIN_PLAN.md` Stage 2.
- A live confirmed TN12 settlement tx. The Stage 3 e2e test funded a P2SH(verify-core)
  on TN12: the funding tx was ACCEPTED at the node's mempool layer (txid
  `20e484dffbcb2a93f4108bde1dfc835094cdcfa8d13ddee85795b10353fd7811`) but did NOT confirm
  into a block within the run window, because the public TN12 node was not mining its
  mempool into accepted blocks at the time (a liveness gap, not a covenant defect). The
  spend leg therefore could not run on a confirmed UTXO. Re-running needs healthy TN12
  block production. Evidence: `zk_onchain_proof.md` "What was attempted for a fully live
  submitted transaction".

Stage 4 is exactly the union of these two: a real game proof spent on a confirmed TN12
UTXO, with the forged-proof and wrong-covenant_id cases rejected by consensus on-chain.

## Mainnet preconditions (each MUST hold before flipping the gate)

- [ ] (1) Toccata HF live on mainnet AND a Covex mainnet node built with
  `covenants_enabled`. The HF activates at DAA `474,165,565`. Separately, the current
  Covex covenant fork hard-disables mainnet (`MAINNET_PARAMS` covenants_activation =
  `never()`); a mainnet covenant build is its own launch blocker, tracked outside this
  doc. Both must be true: the chain past the fork DAA, and a node that actually runs
  covenants on mainnet.
- [ ] (2) The wire format is FROZEN at the HF. Opcode `0xa6`, tags `0x20` and `0x21`,
  the ark-serialize COMPRESSED VerifyingKey/Proof layout, and the 32-byte little-endian
  `Fr` public-input layout must match what mainnet activates. The opcode lives on an
  unaudited pre-HF branch that could renumber before mainnet (issue #914 churn); confirm
  no renumber landed and re-pin against the activated build, not against the current
  `toccata` HEAD.
- [ ] (3) The prover's RISC0 control-root / image id MATCHES the activated kaspad build.
  A mismatch is silent and catastrophic: it makes either any proof verify or no proof
  verify. The Stage 0 known-good-vector check and the Stage 4 forged-proof rejection are
  the non-negotiable gates that catch this.
- [ ] (4) A Groth16 proving box is provisioned. x86_64 + Docker (stark2snark) or Bonsai,
  with measured per-game proving latency. The 7GB server cannot do this.
- [ ] (5) Stage 4 e2e PASSED on TN12: a real game -> on-chain `OpZkPrecompile` verify ->
  winner paid on a confirmed tx, AND a forged proof plus a wrong-covenant_id proof both
  REJECTED by consensus, AND the loser pre-CSV spend rejected. The recorded TN12 spend
  txid is the evidence.
- [ ] (6) The `KASPA_ZK_PRECOMPILE_ENABLED` gate is flipped on, per-network, ONLY after
  (1) to (5) all hold. It defaults OFF and is testnet-only today.
- [ ] (7) Owner sign-off on the mainnet money path. This is a real-money settlement path;
  it ships only with explicit owner approval.

## Residual trust (stated plainly)

On-chain ZK removes the Covex oracle and the referee from the games path, but it is not
trustless in every dimension. State this honestly:

- The `covex-games` rules crate is the TRUSTED CORE. The guest enforces game legality;
  if its rules are wrong, a "legal" but incorrect outcome could be proven. The proof
  guarantees the guest ran faithfully, not that the guest's rules are correct.
- Image-id pinning means a guest upgrade requires a covenant REDEPLOY. The locking script
  pins one VK / image id; changing the rules crate changes the image id, so existing pots
  cannot be settled by a new guest. New rules = new pots.
- Liveness is via the CSV refund branch only. If the winner never produces a proof (or
  the prove box is down), funds are not lost: after the relative timelock the funder
  reclaims via the `OpCheckSequenceVerify` refund branch. CSV protects against silence,
  not against a wrong-but-valid outcome (which the rules crate, not CSV, governs).

## What retires

When the on-chain-ZK `ZkGameSettle` path goes live for games, it retires BOTH:

- the referee-hashlock interim (the `binary_oracle_select` external-revealer model from
  `docs/DEORACLE_PLAN.md`, used as the transitional non-custodial games path), and
- the legacy Covex oracle co-sign for games (the `oracle_escrow` `[Covex-oracle, p1, p2]`
  pot where the Covex key re-derived the winner and co-signed).

In the on-chain-ZK end state there is NO Covex key and NO external referee in the games
settlement path: consensus verifies the winner's Groth16 proof, the journal binds the
payee, and only the winner's own Schnorr signature can spend. That is the fully-trustless
end state the wider de-oracle program (`docs/DEORACLE_PLAN.md`) targets for games, now
reachable because Kaspa shipped on-chain proof verification.
