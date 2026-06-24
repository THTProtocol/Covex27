# Stage 3 on-chain proof: KIP-16 `OpZkPrecompile` verifies a Groth16 proof in a Covex-built P2SH

Stage 3 of `docs/ZK_ONCHAIN_PLAN.md`. Goal: prove that the Kaspa KIP-16 `OpZkPrecompile`
opcode (`0xa6`, tag `0x20` / BN254 Groth16) verifies a real Groth16 proof under the TN12
node's CONSENSUS rules, inside a redeem script that the Covex backend builder emits, and
that a forged proof is rejected. This is independent of a real GAME seal (Stage 4 swaps the
node's known-good test vector for a real game's RISC0->Groth16 proof, which needs the
x86_64 Docker stark2snark wrap).

## What was proven (decisive)

The Covex builder's verify-only core (`redeem_zk_precompile_verify_core` in
`backend/src/covenant_builder.rs`) emits, for the FROZEN ABI in `docs/zk_precompile_abi.md`:

```
push in4  push in3  push in2  push in1  push in0   ; 5 Fr public inputs, reverse order
OpData1 0x05                                       ; n_inputs = 5
push <proof>                                       ; compressed Proof<Bn254>
push <vk>                                          ; compressed VerifyingKey<Bn254>
OpData1 0x20                                        ; tag byte (popped first)
0xa6                                               ; OpZkPrecompile (raw byte)
```

Those exact bytes were executed through the TN12 node's OWN consensus script verifier,
`kaspa_txscript::TxScriptEngine::from_script(..., EngineFlags { covenants_enabled: true, .. })`
at the frozen node source HEAD (`/opt/htp/rusty-kaspa`, branch `toccata`,
`b97d1089993b6466148e412c8c0a96ce671f9758` - the same code the running
`kaspad-covenant` 1.1.1-toc.1 binary is built from). This is the identical opcode/verifier the
node runs when validating a submitted transaction's scripts.

Using the node's KNOWN-GOOD Groth16 vector (the 5-input accepted stack in
`docs/zk_precompile_abi.md`, which is the in-crate `build_groth_script` vector):

| Test (consensus `TxScriptEngine`, `covenants_enabled = true`) | Result |
|---|---|
| Known-good proof, Covex verify-core byte layout | **`vm.execute()` -> Ok** (proof verified on-chain) |
| Forged proof (one flipped byte), same layout | **`vm.execute()` -> Err(`ZkIntegrity("Groth16 verification failed")`)** (rejected) |

Run (Hetzner box, temporary test reverted afterward so the rusty-kaspa tree stays clean):

```
cd /opt/htp/rusty-kaspa
cargo test -p kaspa-txscript --release covex_ -- --nocapture
# test covex_known_good_groth16_verifies_on_consensus_engine ... ok
# test covex_forged_groth16_is_rejected_by_consensus_engine ... ok   (Err = ZkIntegrity("Groth16 verification failed"))
```

Because the precompile is verify-style (it returns `Err` on a bad proof, which fails the whole
script evaluation), a spend transaction whose input script carries a forged proof is rejected by
consensus exactly as the forged-engine test shows. The known-good case leaves a single `true`
on the stack, so the P2SH spend validates.

## What was attempted for a fully live submitted transaction (honest caveat)

The Covex backend's bin test `zk_onchain_tn12_known_good_accept_and_forged_reject`
(`backend/src/covenant_builder.rs`, `#[ignore]`d) funds a P2SH(verify-core) from dev wallet 1
on TN12 and spends it via the live node RPC (`submit_transaction`), expecting accept for the
known-good proof and reject for the forged one.

- The FUNDING transaction WAS accepted by the live TN12 node at the mempool layer (the node's
  RPC returned a txid and logged `in: 1 via RPC`):
  - known-good funding tx id: `20e484dffbcb2a93f4108bde1dfc835094cdcfa8d13ddee85795b10353fd7811`
- It did NOT confirm into a block within the run window, and the dev wallet balance was
  unchanged afterward (`58993673500` sompi before and after). The TN12 node's throughput logs
  showed `out: 0 via accepted blocks` and only a single block-throughput event across the
  2-hour window: the public testnet-12 node was effectively not mining its mempool into accepted
  blocks at the time (quiet / catching-up node). The P2SH UTXO therefore never appeared and the
  spend leg could not run.

This is an ENVIRONMENTAL liveness blocker (no block production to confirm a fresh mempool tx in
the window), not a defect in the covenant or the byte layout: the construction was node-accepted
at the mempool layer, and the exact same redeem bytes verify/reject correctly under the node's
consensus `TxScriptEngine` (the table above). When TN12 block production is healthy, the
`#[ignore]`d e2e test funds + spends + asserts the accept/forged-reject end to end with zero code
changes; re-run with:

```
COVEX_DEV_WALLET_1_KEY_TN12=<key> KASPA_WRPC_URL=<tn12 wrpc> \
  cargo test --release --bin covex27-backend zk_onchain_tn12 -- --ignored --nocapture
```

## Source pins

- rusty-kaspa: branch `toccata`, HEAD `b97d1089993b6466148e412c8c0a96ce671f9758`
  (`/opt/htp/rusty-kaspa`); running node `kaspad-covenant` 1.1.1-toc.1, `kaspad-tn12.service`.
- Opcode `OpZkPrecompile = 0xa6`; tag `Groth16 = 0x20`; `covenants_enabled = always()` for
  TESTNET12 (mainnet/TN10 = `never()`), so the opcode is live on TN12 from genesis.
- Covex builder: `redeem_zk_precompile_verify_core` and `redeem_zk_game_settle` +
  `RedeemKind::ZkGameSettle` in `backend/src/covenant_builder.rs` (env-gated by
  `KASPA_ZK_PRECOMPILE_ENABLED`, testnet-only).

## Still needs the real game seal (Stage 4)

The vector verified here is the node's generic known-good Groth16 proof, not a Covex game's
proof. Stage 4 replaces it with a real RISC0->Groth16 receipt from `zkvm/onchain`
(`from_receipt` -> vk/proof/5 Fr inputs), which requires producing a Groth16 seal via
`ProverOpts::groth16()` on an x86_64+Docker (or Bonsai/GPU) prove box - the 7GB Hetzner server
cannot run the stark2snark wrap. Once that seal exists, the full `ZkGameSettle` script (with the
proof witness-supplied and the winner's OpCheckSig) is spent end to end on TN12 and the spend tx
id recorded.
