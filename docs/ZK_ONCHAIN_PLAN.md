# Covex fully-trustless games via KIP-16 on-chain ZK (OpZkPrecompile)

Kaspa Toccata shipped **KIP-16 = `OpZkPrecompile` (opcode `0xa6`)**, which verifies a
**RISC0-Groth16** proof (tag `0x20`, 140 sigops) or raw Groth16 (`0x21` R0Succinct, 740)
**on-chain**. Live on TN12; mainnet at the Toccata HF (DAA 474,165,565, ~30 Jun 2026).
This retires the referee/co-sign entirely: the covenant itself verifies the winner's game
proof. Reference: kaspa-chess (creative-inference/kaspa-chess), silverscript, rusty-kaspa
PR #775 / branch `covpp-reset1`. See [[kaspa-kip16-onchain-zk-2026-06-24]].

## The model (from the kaspa-chess blueprint, adapted to Covex)

- The whole finished game is replayed once in a RISC0 guest (`covex_games::replay`), which
  decides the winner (checkmate/resign/draw/timeout are outcomes INSIDE replay). One proof at
  settlement, not one per move (Covex is replay-based, not move-by-move).
- The guest commits a **self-sufficient journal** that binds the proof to THIS pot + payout:
  `{ covenant_id, winner_pubkey = players[winner], winner_code, stake_sompi, moves_digest }`.
- The settlement covenant: `OP_IF <pinned VK> <proof> <n> <pub_i..> 0x20 OpZkPrecompile
  <winner_pubkey-from-journal> OpCheckSig OP_ELSE <min_seq> OpCheckSequenceVerify <refund>
  OpCheckSig OP_ENDIF`. The VK + covenant_id + image-id inputs + CSV are baked in at lock; the
  proof + journal come from the winner's spend witness. Draw -> 50/50 output-amount split.
- **Loser cannot forge a win:** an illegal/unfinished game returns Err -> the guest panics ->
  NO receipt exists; the winner identity is inside the journal and the RISC0 seal binds it;
  consensus (not Covex) verifies the Groth16 proof; covenant_id binding blocks cross-pot
  replay; only the active player's Schnorr sig can spend. No Covex key in any path.

## Stages (highest-value, safest, TN12-provable first)

- **STAGE 0 (BLOCKING GATE):** confirm `OpZkPrecompile 0xa6` / tag `0x20` is live on the Covex
  TN12 covpp node; submit a known-good-VK/proof test tx (PR #775 vectors); a valid proof
  verifies, a forged one is rejected. Freeze the byte-exact ABI in `zk_precompile_abi.md`.
  Everything downstream is worthless if the node lacks the opcode. Zero code risk.
- **STAGE 1 (SAFE, no dep, do now):** make the journal self-sufficient. `zkvm/games/src/lib.rs`
  add `SettlementJournal` + `settle(input)` (maps winner->players[winner], echoes covenant_id +
  stake). Guest (`zkvm/chess/methods/guest/src/main.rs`) commits the binding fields, not just
  `GameResult`. Host asserts the binding. Test with the EXISTING STARK prover in WSL. Commit.
- **STAGE 2:** emit a RISC0->Groth16 receipt: host `prove_with_opts(env, ELF,
  &ProverOpts::groth16())` (risc0-zkvm 3.x). Needs the x86_64 Docker stark2snark stage (the
  7GB server CANNOT; needs a dev/GPU/Bonsai box) - the headline operational risk. Freeze the
  guest `GAMES_GUEST_ID` (one shared multi-game image). Pin the VK + image id per deployment.
- **STAGE 3 (HIGHEST dep risk):** builder `ZkGameSettle` RedeemKind in covenant_builder.rs.
  Emit `0xa6` via RAW-BYTE opcode push (`add_op(0xa6)`/`add_data`) on the existing
  kaspa-txscript 0.15.0 - AVOID upgrading the whole backend to the unaudited `covpp-reset1`
  git rev (issue #914 churn; opcode may renumber pre-HF). Gate behind
  `KASPA_ZK_PRECOMPILE_ENABLED` (default off, per-network).
- **STAGE 4 (decisive):** TN12 e2e: lock a ZkGameSettle pot -> play -> winner generates the
  Groth16 proof bound to the real deploy-tx covenant_id -> spends with [sig, proof, journal] ->
  node verifies via OpZkPrecompile -> pays winner. Record the spend tx. Negative on-chain: a
  forged proof and a wrong-covenant_id proof are both REJECTED by consensus; loser pre-CSV
  rejected; CSV refund is the only liveness escape (never pays a false winner).
- **STAGE 5:** whitepaper honesty: false-win impossibility + referee/co-sign retirement +
  residual trust (the covex-games rules crate is the trusted core; image-id pinning means a
  guest upgrade needs covenant redeploy; liveness via CSV refund).
- **STAGE 6 (owner-gated):** mainnet at Toccata. Preconditions: Toccata HF live + a Covex
  mainnet covenant build with `covenants_enabled` (the current fork hard-disables mainnet =
  separate blocker); issue #914 fixes merged; opcode `0xa6`/tags/Fr-layout frozen at the HF;
  the prover's RISC0 control-root matches the activated kaspad build. Keep the env-gate off
  until all hold.

## Honest headline risks

1. The rusty-kaspa ZK opcode lives on an **unaudited pre-HF branch** that may renumber before
   mainnet (mitigate: raw-byte emission + the mainnet gate).
2. **Groth16 proving cost**: the stark2snark wrap needs x86_64+Docker/Bonsai (not the 7GB
   server) - a dedicated prove box + measured per-game latency.
3. **Image-id / control-root pinning**: wrong = any-proof-verifies OR none-verify; Stage 0's
   test-vector check + Stage 4's forged-proof rejection are non-negotiable gates.
