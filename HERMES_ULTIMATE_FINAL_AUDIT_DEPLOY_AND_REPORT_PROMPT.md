# HERMES ULTIMATE FINAL AUDIT + DEPLOY + REPORT PROMPT
## Covex27 — Complete Phases 1-10 Execution, Sync, and Sign-Off

**Target:** Make Covex27 fully consistent, tested, committed, pushed, and verified across **local machine**, **GitHub (THTProtocol/Covex27)**, **Hetzner production server**, and the live site **https://hightable.pro**.

**You are operating in maximum execution mode.** Planning is forbidden. You must use tools to read, edit, run commands, git operations, SSH, curl tests, builds, and restarts.

**Date of this prompt:** Immediately after completion of all 10 phases (including Phase 9 Range Proof foundation + Phase 10 launch verification script + audit checklist).

---

## Your Core Mandate

You are the final closer for the entire Covex27 project.

Your responsibilities (in strict order):
1. Perform a ruthless, evidence-based audit of the entire codebase and documentation after all 10 phases.
2. Fix anything that is broken, inconsistent, outdated, or dishonest.
3. Ensure local, GitHub, and Hetzner + hightable.pro are 100% in sync.
4. Run all verification tooling and live tests.
5. Commit and push every meaningful change with clear messages.
6. Produce one final, comprehensive, brutally honest report.

You have full rights to edit any file, run any command, and make judgment calls. If something needs changing to make the project credible for mainnet, change it.

---

## Non-Negotiable Rules

- **Evidence only.** Every claim in your final report must be backed by command output, file paths + line numbers, or curl results.
- **No optimistic language.** If something is half-done, say so explicitly. Use words like "broken", "incomplete", "not yet wired", "still manual".
- **You must actually execute on Hetzner.** Do not stop at "tell the user to SSH". You must use available SSH mechanisms (sshpass, direct ssh with keys in ~/.ssh, or the patterns in DEPLOY_TO_HIGHTABLE.sh / LIVE_DEPLOY_COMMANDS.txt) to run commands on the production server.
- **You must test the live site.** All critical endpoints on https://hightable.pro must be exercised with curl (health, status, oracle for both circuits, covenants, etc.).
- **Git discipline:** Every logical group of fixes gets its own commit with a good message. Final push must succeed.
- **Build verification:** `cargo check` (and ideally `cargo build --release` if time allows) must be green at the end.
- **Radical honesty philosophy:** This project dies on over-claiming. Your job is to protect that brand.

If you cannot reach Hetzner or GitHub push fails, document the exact error and the manual steps the human must take.

---

## Mandatory Inputs — Read These First (Use Tools)

You must examine the following before making any changes:

### Core State Documents
- `README.md` (especially Architecture, all Phase 1-10 sections, Final State, and server details)
- `PHASE9_COMPLETION.md` and `PHASE10_COMPLETION.md` (the evidence-based versions)
- `docs/FINAL_STATE_OF_COVEX.md`
- `docs/LAUNCH_AUDIT_HYGIENE_CHECKLIST.md`
- `HERMES_FINAL_TRIPLE_CHECK_PROMPT.md` (the earlier one)
- This prompt itself

### New Phase 9/10 Concrete Artifacts
- `deploy/covex-launch-verify.sh`
- `zk/range_proof/range_proof.circom`
- `zk/prove_range_proof.js`
- `zk/verify_range.js`
- `examples/range-proof/` (all files)
- `docs/LAUNCH_ANNOUNCEMENT_TEMPLATE.md`

### Production & Deployment
- `deploy/` directory (every .sh file)
- `LIVE_DEPLOY_COMMANDS.txt`
- `DEPLOY_TO_HIGHTABLE.sh`
- `deploy/deploy-hetzner.sh`
- Any references to server IP 178.105.76.81 or alias "Hightable"
- Backend source: especially `backend/src/oracle.rs`, `main.rs`, `payment_verifier.rs`

### ZK & Examples
- Full `zk/` directory structure
- Both example directories under `examples/`

### Git & Remote Reality
- Run `git status`, `git remote -v`, `git log --oneline -10`
- Check what is actually committed vs uncommitted after the Phase 9/10 work

---

## Step-by-Step Execution Plan (Follow in Order)

### Phase A: Local Audit & Fixes (Do This First)

1. Run full local verification:
   - `./deploy/covex-launch-verify.sh`
   - `cd backend && cargo check`
   - `node zk/prove_range_proof.js`
   - Grep for honesty violations (forbidden words: trustless, fully on-chain ZK enforcement, no oracle, etc.)

2. Fix anything obviously wrong or inconsistent you find in:
   - Documentation that doesn't match the new Phase 9/10 artifacts
   - Outdated phase summaries in README
   - Broken links or references
   - The launch verification script itself (improve it if you see clear improvements)
   - Any remaining low-quality stubs or aspirational text

3. Make the project internally consistent. Examples of things that often need fixing at this stage:
   - Phase numbering and descriptions
   - "Range Proof is in progress" vs actual shipped foundation state
   - References to old completion reports
   - Missing mentions of `covex-launch-verify.sh` and the audit checklist

### Phase B: Git Hygiene & Commit

1. `git status` and `git diff --stat`
2. Stage logical groups:
   - All new Phase 10 launch artifacts + docs
   - Any fixes you made during Phase A
   - Phase 9 Range Proof related files if still uncommitted
3. Create clear commits (examples of good messages):
   - `feat(phase10): add consolidated launch verification script + audit checklist`
   - `docs: update FINAL_STATE and README after Phase 9/10 execution`
   - `fix: align oracle range_proof error messaging and docs`
4. Push to GitHub (`git push origin master` or correct branch). Confirm the push succeeded.

### Phase C: Hetzner Production Sync & Rebuild

You **must** get onto the Hetzner box (178.105.76.81 or `root@Hightable`).

Known working patterns (use whatever works in this environment):
- `ssh root@Hightable` (password historically: `eiknxblt`)
- Or use `sshpass -p eiknxblt ssh -o StrictHostKeyChecking=no ...`
- Or the `DEPLOY_TO_HIGHTABLE.sh` mechanism if it still functions
- Look for `hermes_key` in `~/.ssh/` on the local machine

Once on the server, execute this sequence (adapt paths if the checkout is in a different location):

```bash
cd /root/Covex27
git fetch origin
git reset --hard origin/master
git log --oneline -1

# Backend
cd backend
cargo check
cargo build --release 2>&1 | tail -5

# Frontend (if changed)
cd ../frontend
npm install
npm run build

# Restart services
systemctl restart covex-backend || true
systemctl status covex-backend --no-pager | tail -8

# Or use the provided start script
/root/Covex27/deploy/start-covex-backend.sh || true

# Reload nginx
systemctl reload nginx || true
```

Run `./deploy/covex-launch-verify.sh` **on the server** against localhost where possible.

### Phase D: Live Site Verification (hightable.pro)

After the server is updated, run these tests from anywhere (preferably from the local machine or server):

```bash
# Core
curl -s https://hightable.pro/health | jq .
curl -s https://hightable.pro/ | jq '{network, version, status}'

# Explorer data
curl -s "https://hightable.pro/api/covenants?limit=3" | jq 'length'

# Oracle - Merkle (production path)
curl -s -X POST https://hightable.pro/api/oracle/verify-and-sign \
  -H "Content-Type: application/json" \
  -d '{"covenant_id":"hermes-final-merkle","circuit_type":"merkle_membership","proof":{},"public_inputs":[]}' | jq .

# Oracle - Range Proof (Phase 9 foundation path — must return honest error)
curl -s -X POST https://hightable.pro/api/oracle/verify-and-sign \
  -H "Content-Type: application/json" \
  -d '{"covenant_id":"hermes-final-range","circuit_type":"range_proof","proof":{},"public_inputs":["0","100","500","0"]}' | jq .

# Frontend
curl -sI https://hightable.pro | head -5
```

Document every response.

### Phase E: Final Cross-Check

- Confirm the exact same commit hash exists on:
  - Your local machine
  - GitHub (via `git ls-remote`)
  - Hetzner server
- Confirm `covex-launch-verify.sh` exists and is executable on the server.
- Confirm the live oracle returns the expected honest response for `range_proof`.
- Run the full `LAUNCH_AUDIT_HYGIENE_CHECKLIST.md` mentally or literally against the current state.

### Phase F: Any Remaining Fixes

If you find discrepancies during the live tests or on the server, fix them (edit code/docs locally → commit → push → repeat Hetzner sync).

Do not declare victory until local / GitHub / Hetzner / hightable.pro are consistent.

---

## Required Final Report Format

After you have finished all execution, produce **one Markdown file** (save it as `HERMES_FINAL_COMPLETE_REPORT.md` in the repo root and commit it).

The report **must** contain exactly these sections:

1. **Executive Summary** (3-5 sentences + overall verdict: GREEN / AMBER / RED with justification)
2. **Synchronization Status**
   - Local commit hash
   - GitHub commit hash
   - Hetzner commit hash
   - Live site behavior vs expectations
3. **What Was Fixed / Changed** (with file paths and commit hashes)
4. **What Was Tested** (list every command + key output snippets)
5. **Honest Assessment of Current State** (use the Phase 9/10 honest limitations language)
6. **Remaining Real Risks & Gaps** (ranked by severity — be specific)
7. **Mainnet Launch Readiness Verdict** (with conditions)
8. **Recommended Immediate Next Actions** (maximum 5, prioritized)
9. **Evidence Appendix** (paste the most important command outputs, curl results, git log snippets, etc.)
10. **Self-Reflection** (as the agent): What was hard? What would have made this easier? Any process improvements for future projects?

---

## Tone Reminder (Read This Twice)

Covex's only real moat is **radical honesty + shipping real artifacts**.

If the project is in good shape after your work, say so with evidence.  
If there are still meaningful holes (especially around Range Proof zkey, manual unlock steps, mainnet treasury configuration, or oracle key handling), call them out without softening.

Your reputation on this task depends on how little sugar-coating is in the final report.

---

**Begin execution now.**

Start by running `git status` and reading the key documents listed above.

When you are finished, the only acceptable output is the completed `HERMES_FINAL_COMPLETE_REPORT.md` (plus any other commits you made) and a clean summary here.

Good luck. Make it tight. Make it real.