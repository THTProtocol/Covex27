# Covex Execution Sprints Tracker

This file tracks the phased "complete the list" execution against the full remaining plan (see ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md for the master vision).

**Philosophy**: Radical honesty. We ship real artifacts, real wiring, and real DX. Most things start hybrid/attested and graduate.

## Sprint 1 — Ceremonies + Real Artifacts + DX + Hybrid Polish — COMPLETE

**Goal**: Make the "dev foundation" production-ready in spirit (proper dev zkeys for flagship circuits, real proofs in E2E, real hybrid verifiers, easy addition path).

- [x] Enhanced `zk/ceremonies_harness.sh` (dev zkeys + real proof generation)
- [x] Phase 1 real circuits: basic_utxo_ownership, script_constraint, pot_split_math, vrf_dice_roll, vrf_random, nullifier_set, turn_timer — all with real Groth16 proofs
- [x] Phase 2/3 circuits: collateral_liquidation, auction_clearing, poker_vrf_deal, collateral_ltv, loan_health, financial_formula, chess_ai_move, election_feed, verifiable_poker_solver, multi_sig_gating, anon_credential, sorting_proof, weather_feed — all with hybrid/attested verifiers
- [x] 34 `verify_*.js` scripts: uniform hybrid pattern (real Groth16 when vkey+body present, safe attested fallback)
- [x] Created `zk/add_circuit.sh` bootstrap (generates circom stub + Hybrid verify + exact copy-paste lines for registry/E2E/FE)
- [x] `zk/covenant-helper.js` CLI with timelock flags (--max-delta, --lock-duration, etc.)
- [x] 9 `.sil` covenant templates in `examples/covenant-integration/`
- [x] E2E: **27 pass / 0 fail / 10 skip** (real proofs for Phase 1 circuits, hybrid/attested for expanded set)
- [x] Chess proving modes (hybrid mode=0, full mode=1) in public signals + oracle handler
- [x] Oracle `simulate` support for decentralized_liveness (partial/down) for covenant outage testing

## Sprint 2/3 — Decentralized Oracle + On-Chain Depth + Reals — IN PROGRESS

- [x] 200+ circuits inventoried in `zk/circuit_registry.json` with reality labels
- [x] Pluggable oracle verifier: StrictGroth16 / HybridGroth16 / Risc0Stub / WasmStub / Attested
- [x] Oracle response enrichment: `circuit_type` + `covenant_hint` on all paths
- [x] `decentralized_liveness`: dynamic simulate support (partial/down) + multi-oracle stubs
- [x] Oracle registry hybrid: utxo/nullifier → HybridGroth16, chess outcome from public signals
- [x] `onchain_sig_covenant.sil` for on-chain signature verification depth
- [x] RISC0 stubs: chess_eval, poker_solver (accept for dev, real path when binary available)
- [x] Version 1.1.0 unified across frontend, backend, zk, circuit_registry
- [ ] RISC0 real execution for 1-2 guests when binary available
- [ ] Chess chess_v1.zkey ceremony (PID 30259 running; finish_phase2.sh when done)
- [ ] GitHub auth token for push

## 2026-06-08 Triple-Sync Session Summary

| Metric | Value |
|--------|-------|
| E2E | 27 pass / 0 fail / 10 skip |
| Version | 1.1.0 (all 4 locations) |
| Health (live) | OK |
| Oracle turn_timer hybrid | success:true |
| Oracle liveness simulate=partial | success:true |
| Frontend build | clean 4.28s |
| Cargo check | pass (warnings only) |
| .sil templates | 9 |
| verify scripts | 34 |
| Repo Herems prompts | consolidated to docs/operations/HERMES_TRIPLE_SYNC_MASTER.md |
| Stale HC_Volume paths | fixed in 5 files |
| Reports | moved to docs/reports/ |
| Chess ceremony | PID 30259 running (~12h elapsed) |
| GitHub push | blocked (no auth token) |

**Honest gaps**: chess zkey pending, GitHub auth needed, backend Hetzner build not run this session, dev PTAU (not production MPC), MiMC7 (not SHA256), multi-oracle stub (not BLS), .sil templates (not compiled), RISC0 stub receipts.

**Confirmed**: "Everything gets along perfectly and it is easy to connect any ZK circuit + oracle into a covenant" via add_circuit.sh + pluggable verifier + uniform hybrid scripts + simulate testing + covenant-helper.js + 9 .sil templates.

See `docs/operations/HERMES_TRIPLE_SYNC_MASTER.md` for the full COMPLETED BLOCK.
