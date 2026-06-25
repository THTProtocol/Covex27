# rusty-kaspa v2.0.1 (Toccata) crate migration

Status: VERIFICATION-COMPLETE, NOT YET APPLIED to master. This directory preserves the
feasibility-proven migration as an applyable patch so the work lives on master (no side
branch) until it is safe to land. Do NOT apply it blindly: see "When to apply" below.

## What this is

`kaspa-v2.0.1-migration.patch` is the source-only diff (backend/Cargo.toml + backend/src,
excluding the regenerable Cargo.lock and the deleted vendored crate) that migrates the
Covex backend from the vendored kaspa-consensus-core 0.15 fork to the upstream rusty-kaspa
v2.0.1 crates (Rust edition 2024). It was built and tested green on a throwaway worktree.

## Why it matters

- The vendored sighash fork becomes REDUNDANT: upstream v2.0.1 `payload_hash` already
  implements the exact Toccata rule (native+empty -> ZERO_HASH, else
  `blake2b(write_var_bytes(payload))`), byte-identical to the fork for every real Covex tx.
- v2.0.1 txscript can natively emit the covenant / introspection / on-chain-ZK opcodes:
  OpZkPrecompile (0xa6, REAL on-chain Groth16 tag 0x20 + RISC0 tag 0x21), OpCat (0x7e),
  the full tx-introspection set (0xb2-0xc9), covenant primitives (0xcb-0xd6),
  OpCheckSigFromStack (0xd7), OpBlake3 (0xd9). This is the foundation for native KIP-10
  trustless covenants and on-chain ZK.

## Evidence (verified 2026-06-25)

- `cargo build --release` EXIT 0; `cargo test --release` = 184 passed, 0 failed.
- The committed sighash golden `d4eeaa044dfa960a72dae4d51d4e4e69a7a5a9d93ff4238b11c9f1620a3121b3`
  is UNCHANGED (existing covenants stay spendable); the cross-language parity tests pass.
- The official browser SDK kaspa-wasm32-sdk-v2.0.1 produces a byte-identical sighash
  (browser/backend parity confirmed).
- A v2.0.1-serialized deploy+spend was ACCEPTED and redeemed on the live TN12 covenant node
  (deploy b7879e673849373beb8baef32243e9eea6ed896215e6a9e7fbe1a990e56f6d3f, spend
  be1550207d12000ea80de094fb4e9838c944e3469da88482fdf63bc24068d3b8).

## Breakage map (0.15.0 -> 2.0.1), all in backend/src

- covenant_builder.rs + signer.rs: `SigHashReusedValues` struct -> `SigHashReusedValuesUnsync`
  trait; `calc_schnorr_signature_hash` takes `&reused` (shared ref) not `&mut`;
  `TransactionOutput` gained `covenant: Option<CovenantBinding>` (set `None`); `UtxoEntry`
  gained `covenant_id: Option<Hash>` (set `None`); `TransactionInput.sig_op_count` removed,
  now `compute_commit: ComputeCommit` (use `SigopCount(n).into()`, import from
  `kaspa_consensus_core::mass::SigopCount`); `TxScriptEngine::from_transaction_input` now
  takes `EngineContext::new(&cache).with_reused(&reused)` + `EngineFlags::default()`.
- crawler.rs: `get_virtual_chain_from_block(start, true)` gained a 3rd arg
  `min_confirmation_count: Option<u64>` (pass `None`).
- oracle.rs, games.rs, referee_zk.rs: edition-2024 makes `env::set_var`/`remove_var` unsafe
  -> wrap in `unsafe {}` (test/seam code only).
- disassembler.rs: `deserialize_next_opcode` gained a 3rd generic
  (`::<_, PopulatedTransaction, SigHashReusedValuesUnsync>`).
- backend/Cargo.toml: edition = "2024"; wasm-bindgen pinned `=0.2.100`; kaspa deps point at
  rusty-kaspa v2.0.1; drop the `backend/vendor/kaspa-consensus-core` path deps.

## v2.0.1 sig-op rule (CRITICAL)

v2.0.1 statically sums sig-ops over the WHOLE redeem script (all IF/ELSE arms) and requires
the input's declared count == calculated, else `WrongSigOpCount`. Every spend builder MUST
declare the exact whole-script count. (The HTLC under-declaration that this surfaced is
fixed separately on master.)

## When to apply (do NOT land blindly)

1. The other agent's live `covenant_builder.rs` (settle-zk / ZkGameSettle) work must be
   settled so the patch applies cleanly.
2. Re-run `cargo build --release && cargo test --release` after applying (the patch was cut
   against an earlier master; resolve any drift).
3. Drop `backend/vendor/kaspa-consensus-core` and regenerate Cargo.lock (review it, run
   `cargo audit`).
4. Land the matching frontend swap to the official kaspa-wasm32-sdk-v2.0.1 (browser parity).
5. The node must run with `covenants_enabled` (the activated mainnet Toccata build) to
   execute the introspection / OpZkPrecompile opcodes.
6. Re-prove a TN10/TN12 on-chain deploy+spend after applying, then deploy.

To apply: `git apply docs/migrations/kaspa-v2.0.1-migration.patch` from the repo root, then
remove the vendored crate and rebuild.
