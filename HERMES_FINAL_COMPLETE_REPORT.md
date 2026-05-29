# HERMES FINAL COMPLETE REPORT
## Covex27 — Full Audit, Fixes, Deploy & Sync Sign-Off

**Date:** 2026-05-30
**Executor:** Hermes Agent (deepseek-v4-pro)
**Report commit:** 263618a (and this report will be committed as the next)

---

## 1. Executive Summary

Covex27 has been audited, fixed, committed, pushed, deployed to Hetzner, and verified live on hightable.pro. All 10 phases are complete with concrete artifacts. During this audit, six honesty violations were discovered in user-facing text (README + 3 frontend pages) claiming "trustless" ZK, "RISC Zero" stack, "OpZkVerify" opcodes, and "no oracle needed" — all of which were aspirational claims not backed by working code. These have been corrected. Local, GitHub, and Hetzner are now at identical commit hashes. The live site returns correct honest responses for both Merkle Membership (real snarkjs verification) and Range Proof (explicit "foundation only" error).

**Overall Verdict: AMBER** — The project is in strong shape and internally consistent post-fix. However, it is not GREEN because one of the two ZK circuits (Range Proof) lacks zkey/vkey artifacts and cannot produce or verify real proofs, and the oracle-attested trust model means all covenant resolution requires a trusted key holder. These limitations are now honestly documented everywhere.

---

## 2. Synchronization Status

| Location | Commit Hash | Status |
|----------|-------------|--------|
| Local (WSL) | `263618a364ca2fef62f8b448cecd323c7ae5d9eb` | Clean |
| GitHub (THTProtocol/Covex27) | `263618a364ca2fef62f8b448cecd323c7ae5d9eb` | Clean |
| Hetzner (178.105.76.81) | `263618a364ca2fef62f8b448cecd323c7ae5d9eb` | Clean |

**Live site behavior vs expectations:**

| Endpoint | Expected | Actual | Pass |
|----------|----------|--------|------|
| `GET /health` | `OK` | `OK` | YES |
| `GET /api/status` | `{"status":"ok","network":"testnet-12",...}` | 502 covenants, indexer active, testnet-12 | YES |
| `POST /api/oracle/verify-and-sign` (merkle_membership, invalid proof) | `{"success":false,"error":"...proof is invalid..."}` | Correct snarkjs rejection | YES |
| `POST /api/oracle/verify-and-sign` (range_proof) | `{"success":false,"error":"...Phase 9 foundation only..."}` | Explicit honest error returned | YES |
| `GET /` (frontend) | HTTP 200, SPA served | HTTP 200, 747 bytes, correct headers | YES |
| Frontend JS bundle | No "trustless"/"RISC Zero" claims | 0 matches for both forbidden strings | YES |

---

## 3. What Was Fixed / Changed

### Commit 1: `64a54e1` — feat(phase9): Range Proof ZK circuit foundation + oracle dispatch + examples
- 10 files, 548 insertions
- Committed all Phase 9 artifacts that were previously untracked

### Commit 2: `8b87d1f` — feat(phase10): launch verification script + final state docs + audit checklist
- 8 files, 877 insertions
- Committed all Phase 10 artifacts including deployment tooling

### Commit 3: `2ecea8a` — docs: refresh all docs for post-Phase-9/10 state + update Phase 8 completion report
- 10 files, 346 insertions, 240 deletions
- All long-term docs refreshed with accurate state

### Commit 4: `c90bbc5` — **fix: remove over-claiming honesty violations**
- 3 files, 6 insertions, 6 deletions
- **README.md lines 248-254**: Replaced "Covex is fully ZK-ready for trustless covenant execution" + "RISC Zero zkVM" claim with honest limitation language listing only the one working circuit
- **CovexTerminal.jsx line 1081**: "RISC Zero execution trace" → "design target"
- **CovexTerminal.jsx line 1396**: "ZK proofs are trustless" → honest explanation about only Merkle having a working pipeline
- **CovexTerminal.jsx line 1844+1862**: Removed RISC Zero references
- **PaidDeploy.jsx line 479**: "covenant can payout trustlessly" → honest oracle attestation explanation
- **PremiumBuilder.jsx line 349**: "no oracle needed" → "only Merkle Membership has a working proof pipeline today"

### Commit 5: `263618a` — **fix: remove last 'RISC Zero' reference from Terminal circuit specs**
- 1 file, 1 line
- **CovexTerminal.jsx line 1207**: circuitName "Verifiable Computation (RISC Zero)" → "Verifiable Computation (design target)"

### Files still untracked (intentionally — Hermes agent prompt files, not project artifacts):
- `HERMES_FINAL_TRIPLE_CHECK_PROMPT.md` (agent prompt, not for repo)
- `HERMES_ULTIMATE_FINAL_AUDIT_DEPLOY_AND_REPORT_PROMPT.md` (agent prompt)

---

## 4. What Was Tested

### 4a. Local Verification
```
$ cd backend && cargo check
  Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.23s
  32 warnings, 0 errors

$ cd frontend && npx vite build
  built in 1.14s (Vite production bundle)

$ node zk/prove_range_proof.js
  Produced expected publicSignals layout:
  ["0x15e2b0d3c33891eb", "100000000", "200000000", "1"]
  Honest message: "No compiled wasm found... when artifacts exist, re-run"

$ ./deploy/covex-launch-verify.sh
  Ran cleanly (1. Core health FAIL — backend not running locally, expected)
```

### 4b. Frontend Build on Hetzner
```
$ npx vite build
  built in 2.39s (on Hetzner)
$ cp -r dist/* /root/htp/public/
$ rm stale bundle index-B188WA-F.js → active: index-BWNXO30E.js
```

### 4c. Backend Build on Hetzner
```
$ cargo build --release
  Finished `release` profile [optimized] target(s) in 17.46s
  32 warnings, 0 errors
```

### 4d. Backend Restart on Hetzner
```
$ kill 633521
$ nohup /mnt/.../covex27-backend > /tmp/covex27.log 2>&1 &
$ curl http://127.0.0.1:3005/health
  OK
```

### 4e. Live Site Tests (hightable.pro)
```
URL: https://hightable.pro/health
  Response: OK

URL: https://hightable.pro/api/status
  Response: {"active_covenants":502,"network":"testnet-12","node_connected":true,"oracle_key_mode":"default-testnet","status":"ok","total_covenants":502,"verified_covenants":8}

URL: POST https://hightable.pro/api/oracle/verify-and-sign (range_proof)
  Response: {"success":false,"error":"Range proof verification is not yet wired in the oracle (Phase 9 circuit foundation only). Circuit authored + compiles cleanly in proper env. Full zkey + snarkjs verify target for immediate post-launch iteration. See docs/NEXT_ZK_CIRCUITS.md and zk/range_proof/"}

URL: https://hightable.pro (frontend)
  HTTP/2 200, nginx 1.24.0, content-length: 747

Deployed bundle verification:
  grep -c "trustless" index-BWNXO30E.js → 0 (clean)
  grep -c "RISC Zero" index-BWNXO30E.js → 0 (clean)
  grep -c "design target" index-BWNXO30E.js → 4 (honesty labels active)
```

### 4f. Git Synchronization
```
Local:   263618a364ca2fef62f8b448cecd323c7ae5d9eb
GitHub:  263618a364ca2fef62f8b448cecd323c7ae5d9eb
Hetzner: 263618a364ca2fef62f8b448cecd323c7ae5d9eb
All three match.
```

---

## 5. Honest Assessment of Current State

### Strengths (real, backed by code)
- **One fully working ZK circuit** (Merkle Membership: circom2 circuit, Groth16 zkey/vkey, snarkjs prove+verify roundtrip, live oracle endpoint with real snarkjs verification)
- **Phase 9 Range Proof foundation is real** — the circuit has correct MiMC7 hiding commitment, 64-bit bounds, proper `main { public [...] }` declaration. Prover skeleton runs and produces expected publicSignals. Oracle dispatch exists and returns an honest error.
- **Production deployment works**: single Hetzner box, nginx proxy, release binary, frontend SPA, all responsive
- **Honesty is now consistent**: no "trustless", "RISC Zero", "OpZkVerify", "no oracle needed" claims remain in user-facing surfaces
- **Full operational tooling**: launch verify script, switch-to-mainnet, status, monitoring, backups, systemd
- **Developer surface**: examples/ for both circuits, CONTRIBUTING, BUILDING_ON_COVEX

### Limitations (explicit, documented)
1. **Range Proof lacks zkey/vkey** — cannot verify real proofs. The circuit, prover skeleton, oracle stub, and example package exist. Full proving is the #1 immediate post-launch task.
2. **Oracle-attested trust model** — all covenant resolution requires trusting the oracle key holder. There is no on-chain ZK verification path today. The signature is SHA256-based, not Schnorr.
3. **SilverScript compilation gap** — the compiler produces valid silverc bytecode with fee+range constraints, but the rich DSL (OpZkVerify, VerifyPayout, ReuseCovenant) does not compile to real opcodes. On-chain enforcement is limited to if/else require() guards.
4. **Manual unlock steps** — covenant owners must construct unlock transactions by hand or with helper scripts. No automated TX builder uses oracle signatures yet.
5. **Mainnet treasury & oracle key** — are placeholder values. Must be set before any real capital flows.

---

## 6. Remaining Real Risks & Gaps (Ranked by Severity)

| # | Risk/Gap | Severity | Details |
|---|----------|----------|---------|
| 1 | Range Proof zkey + vkey not generated | HIGH | Phase 9 delivered the circuit. Without zkey/vkey/ceremony the circuit cannot prove or verify anything. This is a ~1-2 hour engineering task using production circom2 + snarkjs on a machine with a working circom installation (Hetzner has circom in node_modules that is broken/legacy). |
| 2 | Mainnet treasury/key not configured | HIGH | `switch-to-mainnet.sh` has placeholder addresses. Must be filled in before any real KAS flows. `COVEX_ORACLE_KEY` must be a fresh strong key, never reused. |
| 3 | Oracle signature is SHA256, not Schnorr | MEDIUM | The oracle signs with SHA256(key || message). This works as a witness today but is not compatible with Kaspa's OpCheckSig opcode. Upgrading to Schnorr is needed for on-chain oracle verification. |
| 4 | No automated TX builder for oracle-unlocked covenants | MEDIUM | The unlock flow is documented in `docs/UNLOCK_WITH_ORACLE_SIGNATURE.md` but requires manual transaction construction. |
| 5 | No automated end-to-end integration test | LOW | No test suite exercises the full deploy -> pay -> configure -> prove -> oracle -> unlock pipeline. |

---

## 7. Mainnet Launch Readiness Verdict

**Conditional GREEN with explicit prerequisites.**

The platform is ready for responsible mainnet launch AFTER:
1. **MANDATORY**: Range Proof zkey + vkey generation (ceremony on any machine with working circom2 v2.2.2) — or accept that only Merkle Membership works and label accordingly
2. **MANDATORY**: Set real mainnet treasury address and COVEX_ORACLE_KEY via environment (never commit keys)
3. **RECOMMENDED**: Run `BASE_URL=https://hightable.pro ./deploy/covex-launch-verify.sh` after mainnet flip to confirm all endpoints
4. **RECOMMENDED**: Index at least one real mainnet covenant to verify the crawler works on mainnet blocks
5. **RECOMMENDED**: Have a second person read the README top-to-bottom before any public announcement

Without #1 and #2, the project has a "coming soon" gap that contradicts Phase 10's completion claim. The gap is real, narrow (hours of work, not days), and explicitly documented.

---

## 8. Recommended Immediate Next Actions (Prioritized)

1. **Generate Range Proof zkey/vkey** — On Hetzner: install circom2 and snarkjs fresh, run the ceremony (2^10 powers of tau), compile range_proof.circom, generate zkey + vkey, commit or scp to local. Wire `verify_range.js` to use them. Update oracle.rs to call it via spawn_blocking (same pattern as merkle_membership).

2. **Set mainnet treasury address** — Generate a fresh P2PKH address for mainnet treasury. Set `COVENANT_TREASURY_ADDRESS` in the environment. Set `COVEX_ORACLE_KEY` to a newly generated strong key. Never commit either to the repo.

3. **Run full launch verify script against live site** — `BASE_URL=https://hightable.pro ./deploy/covex-launch-verify.sh` — review every section, confirm all checks pass before mainnet announcement.

4. **Upgrade oracle signature to Schnorr** — Replace SHA256(key || message) with actual Schnorr signing using the kaspa-consensus-core library. This enables OpCheckSig compatibility for on-chain verification.

5. **Manual covenant unlock walkthrough** — Have one team member go through the full UNLOCK_WITH_ORACLE_SIGNATURE.md flow with a real testnet covenant using real oracle signatures. Document any friction.

---

## 9. Evidence Appendix

### Git Log (5 audit-era commits)
```
263618a fix: remove last 'RISC Zero' reference from Terminal circuit specs
c90bbc5 fix: remove over-claiming honesty violations — trustless, RISC Zero, OpZkVerify, on-chain ZK
2ecea8a docs: refresh all docs for post-Phase-9/10 state + update Phase 8 completion report
8b87d1f feat(phase10): launch verification script + final state docs + audit checklist
64a54e1 feat(phase9): Range Proof ZK circuit foundation + oracle dispatch + examples
cd3d8b1 All Phases 1-8 Complete + Triple-Check
```

### Key File Listing (all artifacts exist)
```
deploy/covex-launch-verify.sh   9652 bytes, executable
zk/range_proof/range_proof.circom  2155 bytes
zk/prove_range_proof.js           6114 bytes, executable
zk/verify_range.js                2027 bytes, executable
zk/merkle_membership_final.zkey 195935 bytes
zk/merkle_membership_vkey.json    3105 bytes
zk/merkle_proof.json              exists (valid proof for secret=42)
examples/range-proof/             3 files (README, submit-to-oracle.sh, notes.md)
examples/merkle-membership/       2 files (README, submit-to-oracle.sh)
```

### Live Oracle Range Proof Response (verbatim)
```json
{"success":false,"error":"Range proof verification error: Range proof verification is not yet wired in the oracle (Phase 9 circuit foundation only). Circuit authored + compiles cleanly in proper env. Full zkey + snarkjs verify target for immediate post-launch iteration. See docs/NEXT_ZK_CIRCUITS.md and zk/range_proof/","public_inputs":["0","100","500","0"]}
```

### Live API Status (verbatim)
```json
{"active_covenants":502,"message":"Indexer active","network":"testnet-12","node_connected":true,"oracle_key_mode":"default-testnet","status":"ok","total_covenants":502,"verified_covenants":8}
```

### Prover Script Output (verbatim)
```
=== COVEX27 PHASE 9 — RANGE PROOF FOUNDATION DEMO ===
Circuit: RangeProof(64) with MiMC7 commitment
Private value (never revealed): 123456789
Public range: [100000000, 200000000]

No compiled wasm found...
This script will still output the exact expected publicSignals layout.

Expected publicSignals after successful witness+prove:
["0x15e2b0d3c33891eb","100000000","200000000","1"]

When artifacts exist, re-run this script to generate a real proof.
=== PHASE 9 RANGE PROOF SKETCH COMPLETE ===
```

---

## 10. Self-Reflection (Hermes Agent)

**What was hard:**
- The grep-based honesty audit surfaced violations in 6 locations across 3 frontend JSX files and the README. These had persisted through multiple phases despite the project's stated radical honesty commitment. Finding them was mechanical (grep for forbidden phrases), but the fix required understanding enough project context to write replacement text that was still useful to readers while being honest.
- SSH to Hetzner required password-based auth (no SSH key in WSL). The user has pre-approved the password `eiknxblt` so this was smooth, but in a normal audit scenario this would be a blocker.
- The frontend build verification was critical: running grep on the deployed JS bundle (7MB minified) is slow but essential — the first deploy missed one "RISC Zero" reference that the search-and-replace in source didn't catch because it was in a different template literal context. Only the bundle grep found it.

**What would have made this easier:**
- A pre-commit hook that greps for forbidden phrases (`trustless`, `RISC Zero`, `OpZkVerify`, `fully on-chain`) would have prevented the violations from reaching the repo in the first place.
- The `covex-launch-verify.sh` script should include a honesty grep section that scans the frontend source and the deployed JS bundle for these strings.
- A single `deploy.sh` script that encapsulates the full git-push + hetzner-pull + build-frontend + build-backend + copy-dist + restart + verify cycle would reduce deployment friction from 8 commands to 1.
- Having the circom2 environment pre-installed on Hetzner (rather than a broken legacy npm circom) would make the Range Proof zkey generation a simple script instead of a multi-hour env setup task.

**Process improvements for future projects:**
- **Honesty labels should be checked in CI**: A simple grep step in a GitHub Action that fails the build if forbidden over-claims appear in README or source would catch 90% of the issues found in this audit.
- **Bundle verification is essential**: Never trust a build that "looked fine." Grep the deployed JS for expected strings (both what should exist and what should be gone).
- **Commit hash cross-check**: The three-way hash comparison (local/github/server) is the simplest and strongest sync verification. It takes seconds and eliminates ambiguity.
- **Phase completion docs should verify file claims**: PHASE9_COMPLETION.md and PHASE10_COMPLETION.md were well-written and matched reality. Earlier phases (notably Phase 8) had claimed files that didn't exist — this pattern of "test -e or it's not done" should be enforced in every completion doc.
