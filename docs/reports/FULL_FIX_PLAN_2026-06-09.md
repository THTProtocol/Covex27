# Covex27 Full Fix Plan — Post Superior Audit 2026-06-09

**Derived from**: AUDIT_REPORT_2026-06-09_SUPERIOR.md (deeper than Hermes). All items have repro evidence from curls, SSH, E2E, source, deploys with provided TN12 test wallets.

**Philosophy**: Radical honesty. Fix P0 first (mixer is broken in prod, rate limit absent, deploy fragility). Everything else is graduation/polish per ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md.

**How to use**: Topo order. Mark [x] when done + evidence (curl output, git SHA, test pass). Re-run audit commands after each P0 batch. Triple-sync (local → git push → Hetzner reset + rebuild + restart) after functional changes.

**Current baseline (this audit)**:
- SHA: fa17aa2 (local = Hetzner confirmed via SSH)
- Versions: 1.1.0 all 4
- E2E: 0 fail
- Oracle: 16/16 success live
- Covenants: 6565 total / 12 verified / 3393 TN12 (MAX samples)
- Mixer: 0 pools (prod DB), deposit broken
- Chess: ceremony ~20h running, no zkey

---

## P0 — Immediate (Unblock Prod, 1-3 days)

1. **Fix Mixer Deposit Root Compute (MIXER-1)**
   - File: `backend/src/db.rs:948` (compute_mixer_root) + `zk/privacy_mixer/lib/compute_root.js` (or path).
   - Action: Make path resolution robust (use env or absolute from CARGO_MANIFEST_DIR + zk/ relative; fallback or log full err). Ensure script is deployed with backend (scp or git). Test in prod env.
   - Repro: `curl -X POST https://hightable.pro/api/mixer/deposit -d '{"covenant_id":"t1","leaf_hash":"01..."}'` → "compute_root.js failed: "
   - Verify: After fix, deposit returns success + leaf_index + merkle_root (non-0); `ssh ... sqlite3 covex.db "SELECT COUNT(*) FROM mixer_roots;"` increases; E2E or new test uses it.
   - Effort: 1-2h (debug path in prod) + test.

2. **Complete or Explicitly Scope Mixer API Surface (MIXER-2)**
   - Files: `backend/src/mixer.rs`, `backend/src/main.rs:309`, frontend calls (grep mixer in src/).
   - Action: Either (a) implement minimal withdraw + /pools /deposits /nullifiers (using existing DB funcs + nullifier_spent guard), or (b) document "Mixer is oracle-attested stub; full privacy mixer later" and return 501/Not Implemented or clean empty for missing routes instead of silent empty. Add /mixer/status enrichment (has_pools etc).
   - Verify: Live calls to all documented mixer endpoints return consistent JSON (or explicit not-impl). Update docs/privacy-mixer-*.md.
   - Effort: 2-4h impl or 30min docs.

3. **Add Basic Rate Limiting (RATE-1)**
   - Backend: Use tower-http or simple in-memory (per IP or global) on /api/health, /api/oracle/*, /api/sign-and-broadcast. 429 with Retry-After.
   - Verify: 10 rapid curls to health/oracle → some 429s.
   - Effort: 1h.

4. **Hide Nginx Version + Consistent Headers (NGINX-1)**
   - Deploy: `nginx.conf` or `/etc/nginx/nginx.conf` + `server_tokens off;`.
   - Hetzner: edit + reload.
   - Verify: `curl -sI https://hightable.pro/api/health | grep -i server` → no version.
   - Effort: 15min + deploy.

5. **Make Deploy Script Robust (DEPLOY-SCRIPT)**
   - `scripts/deploy-covenant.js`: Remove or conditionalize hard `/root/Covex27/...` WASM path. Use relative to __dirname or env KASPA_WASM_DIR or auto-detect (common in prior patches). Update comments in MAINNET.md / deploy_cli.rs / bin/deploy.rs if any remain.
   - Add `--dry-run` or use_dev_mode path that doesn't require full WASM for audit.
   - Verify: `node scripts/deploy-covenant.js --help` runs locally; PRO deploy construction works without prod paths.
   - Effort: 1h.

6. **Dedup E2E + Minor Test Hygiene (E2E-DUP)**
   - `zk/test_e2e_full_zk.js`: Remove duplicate `risc0_poker_solver` entry.
   - Optionally: make more cases non-optional when fixtures exist; add mixer deposit/withdraw E2E stub.
   - Verify: E2E run shows clean counts, no dups in output.
   - Effort: 5min.

7. **Oracle Attested UX: public_inputs Optional Default (ORACLE-DESER)**
   - `backend/src/oracle.rs:36` (OracleVerifyInput) + deserial.
   - Make `public_inputs: Vec<String>` default to `vec![]` for attested paths (or handle missing in verifier dispatch for circuits that don't need them in hybrid/attested).
   - Verify: `curl .../oracle/verify-and-sign -d '{"covenant_id":"x","circuit_type":"decentralized_liveness","proof":{},"requested_outcome":0,"simulate":"partial"}'` succeeds without public_inputs.
   - Effort: 30min.

8. **Cargo Warnings Pass (Low-hanging)**
   - Run `cargo fix --bin "covex27-backend" -p covex27-backend --allow-dirty` or manual (unused imports, ui_preset dead_code allow or remove if unused).
   - Target: <20 warnings or clean.
   - Effort: 1h.

9. **Stale Path Sweep (STALE-PATHS)**
   - Files: DEPLOY_TO_HIGHTABLE.sh, MAINNET.md, docs/operations/HERMES_*.md (2), deploy/start-tn10-kaspad.sh.
   - Action: Replace old volume/host with /root/Covex27 or mark "historical (pre-2026-06 Hetzner move)" in docs. Keep one reference in ops master if needed for archaeology.
   - Verify: `rg 'HC_Volume_105579109|178.105.76.81' --glob '*.md' --glob '*.sh' | wc -l` == 0 or only in comments/history.
   - Effort: 20min.

**P0 Verification Command (after batch)**:
```bash
ssh root@hightable.pro 'cd /root/Covex27 && git fetch && git reset --hard origin/master && source ~/.cargo/env && cd backend && cargo build --release 2>&1 | tail -3 && systemctl restart covex-backend && sleep 3 && curl -s http://127.0.0.1:3006/api/health'
curl -s https://hightable.pro/api/health
cd /home/kasparov/Covex27/zk && timeout 90 node test_e2e_full_zk.js 2>&1 | grep -E 'Results|pass|fail|skip|Summary'
curl -s -X POST https://hightable.pro/api/mixer/deposit -d '{"covenant_id":"p0-fix-test","leaf_hash":"0123..."}' | jq .
curl -s -X POST https://hightable.pro/api/oracle/verify-and-sign -H 'Content-Type: application/json' -d '{"covenant_id":"p0-liveness","circuit_type":"decentralized_liveness","proof":{},"requested_outcome":0,"simulate":"partial"}' | jq .success
# rapid rate test
for i in 1 2 3 4 5 6; do curl -s -w "%{http_code} " -o /dev/null https://hightable.pro/api/health; done; echo
```

---

## P1 — Polish + Graduation (1-2 weeks)

10. **Chess Ceremony Complete**
    - Monitor PID (local or wherever running). When `zk/games/chess/output/chess_v1.zkey` appears: run `zk/games/chess/scripts/finish_phase2.sh`.
    - Commit only vkey + demo proof (not multi-GB zkey). Update registry/E2E/chess modes for full-zk.
    - Verify: E2E chess_v1 (or mode) uses real proof, not skip/attested; oracle chess with full body.
    - Effort: Wait + 1h.

11. **GitHub Auth / Clean Push**
    - Configure gh token or SSH for `git push`. (Prior sessions blocked on this.)
    - After any P0, `git add -A && git commit -m "fix: P0 mixer+rate+..." && git push`.
    - Verify: `git ls-remote --heads origin | grep master` matches local after push; Hetzner `git fetch && git reset --hard origin/master`.
    - Effort: 15min once.

12. **Prod MPC for Flagships (select 4-5)**
    - Per `docs/RANGE_PROOF_CEREMONY.md` + ceremonies_harness.
    - Circuits: range_proof, merkle_membership, turn_timer, chess_v1, privacy_mixer_v1 (or pot_split).
    - Replace pot10 with real ptau contributions; regenerate zkey/vkey/proofs for those.
    - Update registry "reality": "full-zk-mpc".
    - Effort: Multi-day (coordination) + scripts.

13. **RISC0 Real Path (1-2 guests)**
    - Install risc0 toolchain on build/prod hosts.
    - Build 1-2 guests (chess_eval, poker_solver or new). Wire real receipt verify in oracle_verifier (beyond stub).
    - E2E/oracle test real execution.
    - Effort: 1-2 days (toolchain) + integration.

14. **Mainnet + TN10**
    - Configure KASPA_WRPC_URL_MAINNET (or operator node), TN10.
    - Enable in multi-indexer (main.rs), MAINNET.md updates, deploy scripts.
    - Verify: status networks_configured has them true; covenants on other nets.
    - Effort: Depends on node access.

15. **Expand Real Proofs in E2E**
    - For currently "optional"/attested: generate dev zkeys + proofs for collateral_ltv, loan_health, chess_ai_move, election_feed, poker_vrf_deal, etc. (use ceremonies_harness or add_circuit flow).
    - Flip skips to passes where artifacts land.
    - Effort: Per circuit 30-90min.

16. **Mixer Full Test + Withdraw (or scoped)**
    - Implement withdraw handler (nullifier check via mixer_nullifier_spent + record).
    - Add GET /mixer/pools, /deposits? covenant, /nullifiers.
    - Add frontend or test script exercising full deposit → root → withdraw.
    - Or mark "Phase 2 privacy" and clean API surface.
    - Effort: 4-8h.

17. **Browser / Frontend QA**
    - Investigate why prior snapshots timed out (heavy bundle? bot detection?).
    - Add explicit E2E for paid builder (playwright or curl + describe).
    - Fix large chunk warnings if desired (code-split).
    - Effort: 1-2 days.

---

## P2 / P3 — Evolution (Per Vision)

- On-chain: Compile .sil (SilverScript), aa20-aa23 binding, end-to-end mainnet covenant with oracle sig unlock (examples exist).
- Decentralized oracle: Real BLS/threshold (beyond SHA256 stubs + multi_oracle input structs).
- SDK: `covex-client` one-liner (prove → oracle → helper → witness).
- Full registry audit: Every 200+ entry has honest reality + at least attested path.
- Production deploy polish: rate limit tiers, monitoring (existing deploy/monitor-and-alert.sh), backup, alerts on oracle liveness.
- .sil → real if SilverScript matures.

---

## Cross-Cutting / Process

- **Triple-Sync After Every Functional Change**:
  ```bash
  # local
  git add -A && git commit -m "fix: ..." && git push origin master
  # hetzner
  ssh root@hightable.pro 'cd /root/Covex27 && git fetch && git reset --hard origin/master && ... (frontend npm ci+build+rsync, backend cargo build --release + systemctl restart)'
  curl -s https://hightable.pro/api/health
  ```
- **Audit Re-run Command**: See SUPERIOR report §7 repro steps. Target: oracle 20+/20, E2E 25+ pass/0 fail, mixer deposit success, rate 429s present, no nginx version.
- **Update Docs on Change**: SPRINT_TRACKER.md, ZK_ORACLE_..., reports/ append COMPLETED BLOCK like prior Hermes.
- **Owners**: Implementer (you) + reviewer (human or subagent). Use `/review` or check-work skill for verification.

---

## Quick Wins Checklist (Copy-Paste)

- [ ] Mixer deposit works end-to-end (P0-1)
- [ ] Rate limit returns 429 (P0-3)
- [ ] `server: nginx` no version (P0-4)
- [ ] Deploy script runs locally + constructs PRO (P0-5)
- [ ] E2E clean no dups, ~22+ pass (P0-6 + P1-15)
- [ ] Oracle liveness simulate without public_inputs (P0-7)
- [ ] Cargo warnings <20 or documented (P0-8)
- [ ] rg stale paths == 0 or only history (P0-9)
- [ ] Chess zkey + vkey committed, E2E real (P1-10)
- [ ] GitHub push clean, Hetzner at HEAD (P1-11)

**Success Criteria for "Fixed"**: Re-audit passes with no P0s, mixer has >0 pools + successful deposits/withdraws, 20+ oracle circuits, E2E 25+ real/hybrid, prod triple-sync clean, paid deploys with test wallets produce verifiable covenants + oracle sigs.

---

**Reference**: 
- Prior: docs/reports/AUDIT_REPORT_2026-06-08.md (and its COMPLETED BLOCK)
- Vision: docs/ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md
- Ops: docs/operations/HERMES_TRIPLE_SYNC_MASTER.md
- Tracker: docs/SPRINT_TRACKER.md

*Plan created as part of Superior Audit 2026-06-09. Execute, mark done with evidence, repeat until 0 P0s and mixer healthy.*
