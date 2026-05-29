# Covex Launch Audit Hygiene Checklist (Phase 10)

**Use this before any mainnet deployment or when handing the project to external reviewers.**

This is intentionally lightweight and focused on the things that have historically caused the biggest problems in similar projects.

---

## 1. Honesty & Labeling (Non-Negotiable)

- [ ] No claims of "trustless", "fully on-chain ZK", "no oracle required", or "smart contract enforces payout" anywhere a user or builder will see them (README, docs/, frontend, marketing).
- [ ] Range Proof is everywhere labeled as "Phase 9 foundation — zkey + full oracle path pending".
- [ ] Merkle Membership is labeled as the only fully production ZK circuit today.
- [ ] Gambling language and imagery have been removed from Covex (Terminal + explorer) — only present in Covenant Studio if at all.
- [ ] All error messages from the oracle and Terminal are honest (e.g., "Phase 9 foundation only").

**Evidence location:** Grep for the above forbidden phrases + manual review of root README and docs/.

---

## 2. Production Scripts & Operations

- [ ] `./deploy/covex-launch-verify.sh` runs without syntax errors and produces a structured verdict.
- [ ] `switch-to-mainnet.sh` has clear, commented placeholders for:
  - Real mainnet treasury P2PKH address
  - `COVEX_ORACLE_KEY` (never committed)
- [ ] All `*.sh` scripts in `deploy/` have `#!/bin/bash`, `set -euo pipefail`, and are executable.
- [ ] `validate-production.sh` and `covex-status.sh` still exist and are referenced in runbooks.
- [ ] Systemd unit (`covex-backend.service`) and nginx config are present and reviewed.

**Command:**
```bash
ls -l deploy/*.sh
file deploy/*.sh
./deploy/covex-launch-verify.sh   # even if it fails on health, the structure must be correct
```

---

## 3. Backend & Oracle Correctness

- [ ] `cd backend && cargo check` passes with zero new errors.
- [ ] `oracle.rs` contains dispatch logic for both `merkle_membership` and `range_proof`.
- [ ] The range_proof path returns an explicit honest error message (not a silent success or crash).
- [ ] No hardcoded testnet dev keys are used when `COVEX_ORACLE_KEY` is set.

**Command:**
```bash
cd backend && cargo check 2>&1 | grep -E 'error|warning:.*oracle'
grep -n 'range_proof' src/oracle.rs
```

---

## 4. ZK Circuit State

- [ ] `zk/merkle_membership_final.zkey` and `merkle_membership_vkey.json` exist (or are known to be deployed on the production server).
- [ ] `zk/range_proof/range_proof.circom` contains the real Phase 9 hiding circuit (MiMC7 commitment + range constraints + correct `main { public [...] }`).
- [ ] `zk/prove_range_proof.js` and `zk/verify_range.js` exist and are documented.
- [ ] No old broken stub circuits remain in the tree.

**Command:**
```bash
grep -E 'Phase 9 Foundation|MiMC7.*commitment' zk/range_proof/range_proof.circom
ls -l zk/*zkey zk/*vkey.json 2>/dev/null || echo "zkeys may be on server only"
```

---

## 5. Documentation & Examples

- [ ] `docs/BUILDING_ON_COVEX.md` and `docs/UNLOCK_WITH_ORACLE_SIGNATURE.md` are accurate for the current silverc limitations.
- [ ] Both `examples/merkle-membership/` and `examples/range-proof/` contain working (or clearly labeled placeholder) scripts.
- [ ] `PHASE9_COMPLETION.md` and `PHASE10_COMPLETION.md` are the evidence-based versions (not the old skeletons).
- [ ] `HERMES_FINAL_TRIPLE_CHECK_PROMPT.md` exists.

---

## 6. Mainnet-Specific Items (Do This Before Flip)

- [ ] Real mainnet treasury address has been set in the environment and `switch-to-mainnet.sh`.
- [ ] Real `COVEX_ORACLE_KEY` (strong key, never reused) is configured via env var only.
- [ ] `BASE_URL=https://hightable.pro ./deploy/covex-launch-verify.sh` has been run against the live instance and reviewed.
- [ ] At least one real mainnet covenant has been manually indexed or the crawler has been observed working on mainnet blocks.
- [ ] Monitoring & alerting (`monitor-and-alert.sh`) is configured for the production server.

---

## 7. Final Human Review (Before Any Announcement)

- [ ] Someone other than the primary author has read the root README top-to-bottom.
- [ ] The launch announcement draft has been reviewed for over-claiming.
- [ ] All "TODO", "FIXME", "aspirational", and "not yet" comments in source and docs have been re-read in the last 48 hours.

---

**Sign-off**

Date: _______________  
Reviewer: _______________  
Verdict: [ ] Ready for mainnet launch   [ ] Needs fixes (list above)

---

This checklist is deliberately short. Long checklists get ignored. These 7 sections have caught the majority of problems in similar covenant / ZK / oracle projects.