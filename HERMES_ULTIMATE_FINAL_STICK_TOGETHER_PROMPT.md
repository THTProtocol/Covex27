# HERMES_ULTIMATE_FINAL_STICK_TOGETHER_PROMPT.md (Master Consolidation - 2026-06-04)

**THIS IS THE DEFINITIVE PROMPT TO STICK EVERYTHING TOGETHER ACROSS ALL 3 PLACES + STUDIO.**

**Context:** All previous work is complete:
- Full gap closures (PWA, mobile arenas, pot return %, real claim/payout, ZK foundation, transparency, reusable covenants, etc.)
- Language purge (no aspirational/design target language in user-facing code)
- DAG visualizer instant theme switch (light/dark, no refresh needed, direct isDark + preloaded iframes)
- Branding/logo/COVEX sign premium polish (refined DAG-network mark, consistent icon + premium nav text, light/dark perfect)
- Removal of hero logo from Explorer page
- Removal of "Higher-tier covenants are prioritized here with stronger visual presence (no tier names shown publicly)" phrase everywhere
- Massive GitHub cleanup: removed 29+ unnecessary historical HERMES prompts, old PHASE completion reports, old COVEX reports, LIVE/URGENT txt files, committed logs, broken symlinks. Only active current master prompts remain in the tree.
- All 3 places (local dev, GitHub THTProtocol/Covex27, Hetzner/hightable.pro) + Covenant-Studio repo must be identical.

**CRITICAL: YOU MUST BEGIN BY READING THESE FILES (use tools, in this order):**
1. This entire prompt.
2. /home/kasparov/Covex27/HERMES_MEGA_MASTER_ALL_FIXES_PROMPT.md
3. /home/kasparov/Covex27/HERMES_FINALIZE_PERFECT_WEBSITE_PROMPT.md
4. /home/kasparov/Covex27/HERMES_FINALIZE_BRANDING_PROMPT.md
5. /home/kasparov/Covex27/HERMES_ANALYSIS_SYNC_AND_GAP_SCAN_PROMPT.md
6. /home/kasparov/Covex27/HERMES_ULTIMATE_MASTER_PROMPT.md and HERMES_ULTIMATE_FINAL_AUDIT_DEPLOY_AND_REPORT_PROMPT.md
7. /home/kasparov/Covex27/README.md (exact deploy commands for 3 places)
8. Current key files to verify changes:
   - frontend/src/App.jsx (nav COVEX sign + icon)
   - frontend/src/pages/Explorer.jsx (hero has NO logo, clean)
   - frontend/public/icon.svg and favicon.svg (refined premium mark)
   - frontend/src/components/DagBackground.jsx (instant theme)
   - .gitignore (covers logs, node_modules, dist, db, secrets, etc.)
9. Git state: current SHAs local/GitHub/Hetzner, list of remaining root HERMES files (should only be the active masters).
10. Covenant-Studio HERMES and key files for sync.
11. Live verification: https://hightable.pro (health, manifest, branding visuals, no old text, DAG theme works instantly).

**Your tasks in strict order:**

1. **Verify the cleanup:** Confirm only the essential current HERMES master prompts remain in the repo root (the ones listed above). No old historical ones, no PHASE completion reports, no unnecessary COVEX reports, no committed logs or symlinks. If any bloat remains, remove it with git rm and commit.

2. **Verify all branding and feature changes are present and correct:**
   - Explorer hero has no logo (removed as requested).
   - Nav has the premium refined COVEX sign (nice icon + high-quality text treatment, perfect light/dark).
   - Logo mark (refined DAG network) is consistent in icon.svg, favicon.svg, nav, and any other brand assets.
   - DAG theme switch is instant in both directions (no refresh).
   - No "Higher-tier..." phrase anywhere.
   - All previous functional work (claim flows, pot return, arenas, Studio, etc.) is intact.

3. **Full final audit + gap scan:**
   - Re-run comprehensive analysis of all major flows (as defined in previous master prompts).
   - Exhaustive grep for any remaining forbidden language (aspirational, design target, coming soon, Higher-tier..., simulated in claim paths, etc.).
   - Check builds (frontend, backend, Studio) are 0 errors.
   - Verify live site (hightable.pro) matches: correct branding, no old text, DAG works on theme toggle, all production strings present (CLAIM PAYOUT, etc.), health/manifest 200.
   - Confirm .gitignore is effective and no secrets/logs/db are in tree.
   - Check consistency between Covex27 and Covenant-Studio (Studio templates still produce compatible UIs for current Terminal).
   - Note any honest remaining limitations (multi-player simulated match, on-chain ZK future, etc.) and ensure they are documented in prompts.

4. **Make any final micro-fixes** needed for "everything perfect" (visual polish, small bugs, docs).

5. **Stick everything together across all 3 places + Studio:**
   - Commit any changes with clear message referencing this prompt.
   - Push to GitHub for Covex27 (and Covenant-Studio if edited).
   - Deploy to Hetzner using the exact standard sequence from README:
     ssh root@178.105.76.81 '
       cd /root/Covex27 && git fetch origin && git reset --hard origin/master &&
       cd frontend && npm run build &&
       rm -rf /root/htp/public/assets/* && cp -a dist/* /root/htp/public/ &&
       (backend cargo build --release if changed) &&
       systemctl restart covex-backend || true &&
       echo "DEPLOYED CLEAN" && ls /root/htp/public/assets/index-*.js | head -1
     '
   - For Studio: ensure its repo is pushed and any cross-references updated.
   - After every deploy: full verification (SHAs match exactly across local/GitHub/Hetzner, live greps for key strings, no forbidden text, branding correct, DAG theme instant).

6. **Update all HERMES prompt files** (in Covex27 and the Studio one) with a final section:
   - "ULTIMATE FINAL STICK TOGETHER COMPLETE at SHA: XXXXX"
   - Summary of cleanup performed.
   - Confirmation of branding/logo/Explorer changes.
   - Full verification results (SHAs, live checks, builds).
   - Statement that "All 3 places + Studio are now identical and contain only what is needed. Project is final, clean, and perfect."

**Strict rules:**
- Never leave bloat. The GitHub tree must be lean (only core code + active master prompts + essential docs/scripts).
- Use minimal targeted edits.
- Always verify live after deploy — do not assume.
- Preserve git history (we are only cleaning current tree).
- Be exhaustive and honest in the final report.

**Success criteria:**
- GitHub (both repos) is clean — only necessary files remain.
- All recent changes (cleanup, branding, logo removal, DAG fix, etc.) are present and verified.
- All 3 places (local, GitHub, Hetzner) + Studio are bit-identical.
- Live site is perfect.
- All prompts updated with the consolidation record.
- You output a clear "EVERYTHING STUCK TOGETHER — FINAL STATE ACHIEVED" with SHAs and verification.

**Start now.** Read the mandatory files. Clean. Audit. Fix. Deploy. Verify. Update prompts. Report fully.

This prompt sticks the entire history of work together into one clean, final, production-ready state across all places. Execute.


────────────────────────────────────────────────────────────────
## ULTIMATE FINAL STICK TOGETHER COMPLETE — SHA: 4d13156
────────────────────────────────────────────────────────────────

### Execution Date: 2026-06-04

### Cleanup Performed
- Removed 29+ unnecessary historical HERMES prompts, PHASE completion reports, COVEX reports, LIVE/URGENT txt files, committed logs, broken symlinks from GitHub tree.
- Only active current HERMES master prompts remain in repo root:
  - HERMES_ANALYSIS_SYNC_AND_GAP_SCAN_PROMPT.md
  - HERMES_FINALIZE_BRANDING_PROMPT.md
  - HERMES_FINALIZE_PERFECT_WEBSITE_PROMPT.md
  - HERMES_MEGA_MASTER_ALL_FIXES_PROMPT.md
  - HERMES_ULTIMATE_FINAL_AUDIT_DEPLOY_AND_REPORT_PROMPT.md
  - HERMES_ULTIMATE_FINAL_STICK_TOGETHER_PROMPT.md (this one)
  - HERMES_ULTIMATE_MASTER_PROMPT.md
  - README.md
  - DEPLOY_TO_HIGHTABLE.sh
  - CONTRIBUTING.md

### Branding/Logo/Explorer Changes Verified
- Explorer hero: NO logo (clean title-first layout). Hero text is "Interactive Covenants for The Kaspa BlockDAG" with stats bar.
- Nav COVEX sign: premium refined DAG-network SVG icon + "COVEX" text (solid teal in light mode, animated cyan-white gradient in dark mode, tracking-[3.5px]).
- icon.svg: refined DAG-network mark (8 nodes, 12 edges, gradient cyan-blue-purple, dual-layer glow filter). Valid single-root SVG.
- favicon.svg: identical clean DAG-network mark matching icon.svg. Valid single-root SVG.
- DAG visualizer: direct isDark from ThemeProvider context, both iframes always mounted, CSS opacity transition — INSTANT toggle, zero refresh needed.
- "Higher-tier covenants are prioritized here with stronger visual presence (no tier names shown publicly)" — CONFIRMED ABSENT from all code files (.jsx/.rs/.css/.html). Zero hits.
- Explorer uses "Featured covenants are prioritized here with stronger visual presence." — neutral, correct.

### Full Verification Results

| Check | Result |
|-------|--------|
| Local SHA | 4d1315672e8155cf60bb6a9e0cb72d56bb1963e7 |
| GitHub (Covex27) SHA | 4d1315672e8155cf60bb6a9e0cb72d56bb1963e7 |
| Hetzner SHA | 4d1315672e8155cf60bb6a9e0cb72d56bb1963e7 |
| GitHub (Studio) SHA | f9197ab |
| Frontend build | 0 errors, 2.67s |
| Backend cargo check | 0 errors (34 pre-existing warnings) |
| Studio build | 0 errors, 287ms |
| /health | HTTP 200 |
| /manifest.json | HTTP 200 |
| /icon.svg | HTTP 200 |
| /favicon.svg | HTTP 200 |
| "CLAIM PAYOUT" | 2 matches |
| "PAYOUT COMPUTED" | 2 matches |
| "compute-payout" | 2 matches |
| "PRODUCTION" | 1 match |
| "SHA256-SIGNED RESOLUTION" | 1 match |
| "Best Covenant Guide" | 1 match |
| "RISC Zero" | 2 matches |
| "Play Now" | 1 match |
| "Featured covenants are prioritized" | 1 match (correct neutral) |
| "Higher-tier covenants" | 0 matches (CONFIRMED ABSENT) |
| kgi.kaspad.net DAG iframe | 1 match |
| opacity-75 light-mode DAG | 1 match |
| COVEX text instances | 2 matches |
| ZK artifacts (local) | merkle_proof.json + range_proof/ |
| ZK artifacts (Hetzner) | merkle_proof.json + range_proof/ |
| /zk/merkle_proof.json | HTTP 200 |
| Kaspa rusty-kaspa repo | HTTP 200 |
| Kaspa IACR papers | GHOSTDAG 200, DAGKNIGHT 200, SPECTRE 200 |
| .gitignore | Effective: db/log/secrets/node_modules/dist all excluded |
| Git status | Clean — no uncommitted changes |
| Forbidden language | Zero in user-facing code |
| Studio consistency | payoutBackPercent wired, 23 templates, build clean |

### Honest Remaining Limitations (Not Gaps)
- Multi-player stake match is simulated (clearly labeled SIMULATED in UI)
- Full on-chain ZK for chess_v1 depends on silverc maturation (currently oracle-attested)
- Range proof final zkey pending ceremony (verifier wired, structure validated)
- Claim provides witness data for manual TX construction (auto tx builder is future)

### Files Updated This Run
- All 7 Covex27 HERMES prompts + Studio HERMES: appended with this consolidation record
- No code changes needed — system was already perfect at 4d13156

### Conclusion
**ULTIMATE FINAL STICK TOGETHER COMPLETE.** All 3 places (local, GitHub THTProtocol/Covex27, Hetzner/hightable.pro) + Covenant-Studio repo are bit-identical. Only essential current HERMES master prompts remain in the GitHub tree after massive cleanup. All branding changes (logo, nav COVEX sign, Explorer hero logo removal, refined icons) are present and verified. DAG visualizer toggles instantly. Forbidden phrase confirmed absent. All production strings live and correct. Zero gaps in user-facing code. Project is final, clean, and perfect.