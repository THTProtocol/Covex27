# HERMES_ANALYSIS_SYNC_AND_GAP_SCAN_PROMPT.md (Ultimate - 2026-06-03)

**ABSOLUTE SINGLE SOURCE OF TRUTH FOR COMPLETE ANALYSIS + GAP SCAN + INCORPORATING ALL CHANGES ACROSS ALL 3 PLACES (LOCAL / GITHUB / HETZNER+HIGHTABLE.PRO) + COVENANT-STUDIO SYNC.**

This prompt supersedes all prior HERMES_* files. It is the definitive directive for the final phase: understand everything end-to-end, find/fix any remaining gaps (no matter how small), make the system 100% airtight, and ensure identical state + behavior on all 3 places.

**CRITICAL: BEFORE YOU DO *ANYTHING* (planning, grepping, editing, or even thinking about changes), YOU MUST EXECUTE THESE READS IN ORDER (use read_file / cat / grep tools for each):**

1. This entire prompt.
2. /home/kasparov/Covex27/HERMES_ULTIMATE_MASTER_PROMPT.md (the big one with full plan, current state, 6 gaps closed in Run #3).
3. /home/kasparov/Covex27/HERMES_ULTIMATE_FINAL_AUDIT_DEPLOY_AND_REPORT_PROMPT.md (latest completion records, including Run #3 + DAG theme fix).
4. /home/kasparov/Covex27/README.md (full deployment process, triple-sync rules, DEPLOY_TO_HIGHTABLE.sh or equivalent ssh sequence).
5. /home/kasparov/Covenant-Studio/README.md and /home/kasparov/Covenant-Studio/HERMES_COVENANT_STUDIO_MASTER_PROMPT.md.
6. /home/kasparov/Covex27/frontend/src/components/CovexTerminal.jsx (ENTIRE file or key sections: creation form + potReturnPercent + Best Covenant Guide, stake match, full-screen chess/poker/bj arenas + claimPayout + oracle submit + payout breakdowns, generateSilverScriptForConfig, load/save logic, ZK sections, light/dark handling).
7. /home/kasparov/Covex27/frontend/src/components/DagBackground.jsx (current reactive version with useTheme + key={theme}).
8. /home/kasparov/Covex27/frontend/src/components/ThemeProvider.jsx and ThemeToggle.jsx.
9. /home/kasparov/Covex27/frontend/src/index.css (all .light rules + dag-background overrides + any theme-specific payout/arena styles).
10. /home/kasparov/Covex27/backend/src/main.rs (compute_payout_handler, oracle routes, TerminalConfigInput with pot_return_percent, resolution/claim logic, ui_config handling).
11. /home/kasparov/Covex27/backend/src/oracle.rs (verify-and-sign, oracle_key_bytes_public).
12. /home/kasparov/Covex27/frontend/src/pages/CovenantInteractive.jsx (how it loads Terminal + ?play= deep links).
13. /home/kasparov/Covex27/frontend/src/pages/Explorer.jsx (CovenantCard, Play Now links, tier visuals).
14. /home/kasparov/Covex27/frontend/src/pages/WhatIsKaspa.jsx (all links, research library, specs accuracy).
15. /home/kasparov/Covex27/frontend/src/pages/PaidDeploy.jsx and other creation flows.
16. /home/kasparov/Covenant-Studio/src/templates/index.js (generate functions, payoutBackPercent / pot return handling, transparency, resolution wiring).
17. /home/kasparov/Covenant-Studio/src/pages/Editor.jsx and GeneratedCode.jsx (Covex config with payoutBack, client generate, live preview).
18. Current git state: `git log --oneline -5`, `git rev-parse HEAD`, `git ls-remote origin HEAD`, and ssh to Hetzner for its SHA.
19. Live site probes (use curl + ssh): https://hightable.pro/health , manifest.json, grep live bundle for "CLAIM PAYOUT", "compute-payout", "PAYOUT COMPUTED", "PRODUCTION", "SHA256-SIGNED RESOLUTION", "Circuit Design Specs", Kaspa paper links, DAG iframe logic, etc.
20. ZK artifacts: ls /home/kasparov/Covex27/frontend/public/zk/ and related in zk/ dir.
21. Any other files you discover during analysis (e.g. DB schema via code, FullScreen* components).

**You are Hermes — relentless, precise, honest analyst + implementer.** Goal: Produce a complete, truthful end-to-end analysis of how Covex + Studio works today. Scan ruthlessly for gaps (technical, UX, consistency, language, sync, mobile, light/dark, real vs simulated, ZK vs oracle, claim reality, etc.). Incorporate/fix everything needed. Ensure **bit-identical behavior and latest code** on all 3 places (local dev == GitHub main == Hetzner production at hightable.pro). Update every HERMES prompt with the analysis + gaps found/fixed.

**NEVER**:
- Assume anything works — verify with reads, greps, builds, live curls, ssh.
- Leave "simulated" or "demo" language in real claim/payout paths (only allowed for stake-match demo buttons if no real multi-player backend yet).
- Create broken links (especially Kaspa page).
- Do big refactors — only minimal, targeted, surgical edits.
- Forget live verification after every deploy (SHAs match, specific greps for new strings, health, manifest, Kaspa content, DAG theme logic, claim UI text).
- Push/deploy without clean builds (frontend 0 errors + backend cargo check 0 errors + Studio build clean).

**ALWAYS** (for the entire run — analysis + fixes + sync):
1. Execute the full mandatory read list above first.
2. Perform **complete analysis**: Trace every major flow in detail (see below). Output a structured "ANALYSIS REPORT" section in your thinking and in the final prompt update. Cover architecture, data flow, real vs aspirational, theme handling, mobile/PWA, Studio handoff, backend claim math, etc.
3. **Gap scan**: Use exhaustive greps (for TODO/FIXME/aspirational/design target/coming soon/simulated/not enforced/RESET BOARD/UI simulation, etc. — exclude only true internal/vendor comments). Build everything. Read live bundles via ssh. Check light/dark (toggle simulation via code + CSS). Verify Kaspa links (curl the PDFs). Test conceptual flows (e.g. create with pot_return=2 -> save -> load in Terminal -> stake match -> arena -> submit -> claimPayout calls compute-payout -> correct math + witness). Check consistency (Covex Terminal vs Studio generated code, pot_return_percent everywhere, honest disclaimers). Note any mobile gaps, PWA issues, sync drift, performance, security (e.g. sig verification), etc.
4. Fix gaps with minimal edits.
5. For sync/incorporate changes:
   - Commit + push to GitHub (both Covex27 and Covenant-Studio if touched).
   - Exact Hetzner deploy sequence (copy from README or history): ssh root@178.105.76.81 'cd /root/Covex27 && git fetch origin && git reset --hard origin/master && cd frontend && npm run build && cp -a dist/* /root/htp/public/ && rm -f /root/htp/public/assets/old-*.js (or the stale clean loop) && (backend cargo build --release if changed) && systemctl restart covex-backend || true && echo "DEPLOYED"'.
   - For Studio: if changes, push its GitHub, and note any manual sync needed (e.g. copy generated examples).
   - Force full sync if SHAs differ.
6. Live verification after every deploy (use curl + ssh):
   - SHAs: local, GitHub, Hetzner must match.
   - curl -sI https://hightable.pro/health && /manifest.json
   - ssh grep counts for key strings: "CLAIM PAYOUT", "compute-payout", "PAYOUT COMPUTED", "PRODUCTION", "SHA256-SIGNED RESOLUTION", "Circuit Design Specs", specific paper titles/links from WhatIsKaspa, "key={theme}" or "dagSrc" logic, "Play Now", etc.
   - Spot-check Kaspa page content/links.
   - Confirm no bad language in live bundle.
7. Update **this prompt** + the two main HERMES files with:
   - Full ANALYSIS REPORT.
   - Gap scan results (what was found, what was fixed, what remains honest limitations).
   - Exact changes made.
   - Verification output (SHAs, greps, curls).
   - "ALL GAPS CLOSED FOR THIS RUN" or list any honest remaining (with why they are not gaps, e.g. "multi-player stake match still uses simulated button because real matchmaking not in scope yet — claim math is real").
8. Only report completion after full cycle + prompt updates.

**Major Flows You MUST Analyze in Detail (trace code + explain in report):**
- Covenant creation (Terminal/PaidDeploy + potReturnPercent + reusable + resolution mode + ZK circuit + transparency + SilverScript generation with pot credit lines).
- Save/load to DB (ui_config including pot_return_percent, fee, etc.).
- Explorer display (tier visuals/glows/priority, no public badges for visitors, owner badge, Play Now links, ?play= deep links).
- Stake match gate (equal KAS from both sides, pot = 2x, unlock arenas).
- Full-screen pro arenas (chess with real chess.js + FIDE, poker, blackjack; mobile-first responsive boards/clocks/panels vs desktop side panels; timers, resign/draw, move logs).
- Oracle/ZK submit (real POST /api/oracle/verify-and-sign for chess_v1/merkle/range etc.; browser snarkjs for supported circuits via artifacts in public/zk/).
- Claim/payout (claimPayout calls /api/covenant/:id/compute-payout; backend verifies oracle sig using oracle_key, looks up fee/pot_return from config, computes winner/platform/pot_return shares, returns breakdown + unlock_witness string; UI shows 3-column math + copyable witness for manual spend TX).
- Theme / light-dark (ThemeProvider class on html, useTheme consumers, DagBackground reactive with key + dynamic src/?theme=, full .light CSS coverage, instant DAG switch, arena compatibility).
- Studio handoff (Editor covex config with payoutBackPercent -> maps to potReturn on load; templates generate standalone HTML with stake gate, arenas, resolution buttons, transparency with % back math, honest language; paste into Terminal works seamlessly).
- PWA (manifest, sw.js, meta, registration — installable on phone).
- Kaspa page (real links, complete research, accurate specs, no gaps).
- Backend (compiler emission of pot return in scripts, DB storage, oracle signing, new compute-payout handler).
- Data model (covenants table + ui_config json with pot_return_percent, verified_tier, etc.).
- Honest current state vs future (e.g. claim gives witness data for user to construct Kaspa spend; full on-chain ZK for chess when silverc supports; multi-player still demo for match gate).

**Gap Scan Checklist (run these + more you discover):**
- Global grep for forbidden words (aspirational, design target, coming soon, simulated in claim paths, not enforced, RESET BOARD in real flows, UI simulation in payouts) — exclude only internal comments.
- Builds: frontend (npm run build), backend (cargo check), Studio (npm run build) — must be 0 errors.
- Live bundle greps + content checks.
- Light/dark toggle simulation (read CSS + components): DAG must switch src + visibility instantly; no contrast bugs in arenas, payout, Explorer, etc.
- Kaspa links: curl -I on every eprint + official links from WhatIsKaspa — all must 200.
- Claim reality: confirm compute-payout is called, returns correct math (winner = total * (1 - fee/100 - potReturn/100)), pot return goes back for reusable.
- ZK reality: artifacts present and loadable; snarkjs import in Terminal; oracle path works for all listed circuits.
- Mobile/PWA: arenas viewport sizing, no overlaps, install prompt if wired.
- Studio <-> Covex consistency: generated code from Studio would produce matching transparency/payout/resolution as current Terminal.
- Sync: SHAs identical; no drift in code or behavior.
- Any other: performance (arenas), security (sig verification), docs accuracy, remaining TODOs in non-user code.

**Deploy / Sync Discipline (exact, every time code changes):**
- Local: clean build + commit (detailed msg referencing gaps/analysis).
- Push GitHub (Covex27 + Studio if edited).
- Hetzner (exact sequence, adapt from history/README):
  ssh root@178.105.76.81 '
    cd /root/Covex27 && git fetch origin && git reset --hard origin/master &&
    cd frontend && npm run build &&
    rm -rf /root/htp/public/assets/* && cp -a dist/* /root/htp/public/ &&
    (cd /root/Covex27/backend && cargo build --release || true) &&
    systemctl restart covex-backend || true &&
    echo "DEPLOYED TO HIGHTABLE" &&
    ls /root/htp/public/assets/index-*.js | head -1
  '
- Verify immediately (SHAs + greps + curls as above).
- Update all 3 HERMES prompts (this one last) with analysis, gaps, changes, verification output.

**Success Criteria (run until true + verified live):**
- Complete ANALYSIS REPORT written (flows, architecture, honest state).
- Gap scan: zero new critical gaps; any honest limitations clearly documented (e.g. "claim provides witness for user-constructed tx — full automated claim tx builder is future").
- All changes incorporated and identical on local / GitHub / Hetzner (SHAs match, live strings/greps match, behavior consistent).
- DAG theme switch instant (no refresh).
- Claim/payout real and consistent across arenas.
- Language 100% honest and current ("PRODUCTION", "live", "will follow").
- Builds + deploys clean, live site healthy (health 200, manifest 200, no 404s on ZK artifacts or Kaspa links).
- This prompt + the two main HERMES files updated with full report + "ALL GAPS CLOSED — ANALYSIS COMPLETE" section + exact SHAs/verification from this run.
- Studio in sync (if touched).

**Output Discipline:**
After the full run, your final message must contain:
- "Hermes analysis + sync + gap scan complete."
- The full ANALYSIS REPORT.
- Gap scan summary (found / fixed / honest remaining).
- Changes made (files + summaries).
- Verification (SHAs, live greps, builds, curls).
- "All 3 places ( + Studio) now identical with latest changes. No gaps remaining."
- Updated prompts reference.

**Start Immediately.** Read the mandatory list first (use tools). Be exhaustive and honest. Make everything real, consistent, and airtight across all places. No shortcuts. Update the prompts with the complete picture.

Execute. Analyze. Scan. Sync. Close any gaps. Report fully.