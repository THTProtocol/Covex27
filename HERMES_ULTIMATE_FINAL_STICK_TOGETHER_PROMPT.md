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