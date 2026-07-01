# Covex Full Enablement Plan (non-custodial, no dev wallet, all functions live)

Goal (owner, full authority granted): every covenant function usable on Kaspa **mainnet** by
signing with the user's own wallet, **no server-signing dev wallet**, and game logic **ZK-attested**.
Website already displays **mainnet only**.

This is the trustless money-path completion. It moves real user funds, so it ships in a safe order:
**build -> test on TN12 -> security review -> deploy -> enable the mainnet gate LAST.** A bug in this
path is irreversible fund loss, so no step skips ahead of its proof.

## Current state (honest)
- Non-custodial TODAY on mainnet: singlesig, hashlock, timelock, relative-timelock (CSV). The user's
  wallet signs; no dev wallet involved.
- Dev-wallet (server-assisted) kinds, DISABLED on mainnet by design: games, markets, oracle-escrow,
  and the deploy flow for multisig / htlc / channel / deadman / timedecay.
- Games settle via server engine-replay + a co-signature. NOT a ZK proof (correctly not labeled ZK).
- The external-cosign keystone (deployer-bound resolver co-sign, Covex signs nothing) is designed but
  not built. The RISC0 games-ZK path exists but is stalled + prover-blocked.

## The program

### Phase A - External-cosign keystone (unblocks non-custodial for co-signed kinds)
- `POST /covenant/prepare-external`: returns sighash + spend_plan + a key-free
  `request_id = blake2b256("kaspa-covenant-resolve:v1" || covenant_tx_id || input_idx || winner_xonly || amount_le)`.
- `POST /covenant/submit-external`: ingests the resolver's 64-byte BIP340 sig, serializes
  `0x41 || sig64 || 0x01`, broadcasts. Covex contributes ZERO signature material.
- Gate strictly to `*_refundable` kinds (CSV refund so a silent resolver can never freeze funds).
- Build on the server (cargo), prove with a live TN12 end-to-end (deploy -> resolve -> spend), and get
  a focused security review (rubber-stamp verifier / serialization / replay). ONLY THEN mainnet.

### Phase B - Wire each dev-wallet kind to a non-custodial path, then delete the dev wallet
- Route multisig / htlc / channel / deadman / timedecay + markets / oracle-escrow through the keystone
  or client-side signing (the redeemer already supports several redeem paths).
- Once every kind has a proven non-custodial path, remove the server-signing dev wallet entirely.

### Phase C - Games, non-custodial + ZK-attested  (BLOCKED on hardware, see below)
- Finish the `zk_game_settle` sweep + re-link (HIGH-RISK fund-movement; security review required).
- Run the RISC0 prover to produce a real Groth16 proof; Kaspa consensus verifies it (KIP-16
  OpZkPrecompile). No oracle, no co-signature in the payout -> a loser cannot forge a win.

### Phase D - Enable on mainnet (LAST)
- Flip the fund gates (`COVEX_MAINNET_COVENANTS_ENABLED`, the per-kind gates, and for games
  `KASPA_ZK_PRECOMPILE_ENABLED`) only after A-C are TN12-proven + reviewed.

## The two things authority alone cannot solve

### 1. A prover box (hard blocker for Phase C / games-ZK)
The Groth16 wrap (stark2snark) needs **x86_64 + Docker + >=12 GB RAM** (16 GB recommended). The 7 GB
Covex backend cannot do it. There is no way to ZK-attest chess/poker without this machine.
- Provision (e.g. Hetzner CCX23: 8 vCPU / 32 GB, or any Docker host >=16 GB).
- Run `prover-service/` (Node) shelling to the `covex-games-prover` binary; expose a reachable URL.
- Point the backend at it: `COVEX_PROVER_URL`, `COVEX_PROVER_TOKEN`, `RISC0_DEV_MODE=0`.
- **Owner action: stand up this box and give me its URL + token.** Then I can wire + prove Phase C.

### 2. Fund-risk acceptance + audit
This path moves real user funds. Before the Phase D mainnet enable, it should have a focused security
review (ideally third-party) and a green TN12 end-to-end. Confirm you accept this gate.

## What I will do (with authority, safely)
- Drive Phase A + B: write the keystone + kind wiring, build + prove on TN12 (server cargo), report
  each step. Hold the Phase D mainnet gate-flip for the safe checkpoint (proven + reviewed).
- Keep the website mainnet-only and the UI/builder at the highest premium level.
- Never claim a kind is live/non-custodial, or a game ZK-attested, until it truly is on a live TN12/
  mainnet transaction.
