# HERMES_REMAINING_GAPS_PROMPT.md (Focused - 2026-06-03)

**Use this to finish the last gaps after the language purge + Kaspa airtight run.**

**MANDATORY FIRST STEPS (do in order, no exceptions):**
1. Read this entire prompt.
2. Read /home/kasparov/Covex27/HERMES_ULTIMATE_MASTER_PROMPT.md (the big one).
3. Read /home/kasparov/Covex27/HERMES_ULTIMATE_FINAL_AUDIT_DEPLOY_AND_REPORT_PROMPT.md (latest completion).
4. Read current /home/kasparov/Covex27/frontend/src/components/CovexTerminal.jsx (focus on claimPayout, submit*ToOracle, ZK sections, full-screen arenas).
5. Read /home/kasparov/Covex27/frontend/src/pages/CovenantInteractive.jsx and App.jsx routes.
6. Read /home/kasparov/Covex27/frontend/src/index.css (light mode .light rules) + components/ThemeProvider.jsx + DagBackground.jsx.
7. Read /home/kasparov/Covex27/backend/src/main.rs (oracle handlers, resolution, any claim/resolve code) + oracle.rs.
8. cd /home/kasparov/Covex27 && grep -rn --include='*.jsx' --include='*.tsx' -i 'aspirational\|design target\|coming soon' frontend/src/ 2>/dev/null | grep -v node_modules || echo "CLEAN"
9. Check current SHAs: local, `git ls-remote origin HEAD`, ssh hetzner.
10. curl -sI https://hightable.pro/health && ssh hetzner for live bundle strings.

**Current State (post previous run):**
- Language purge done: No "aspirational/design target/coming soon" in user-facing code. Badges say PRODUCTION, footers say SHA256-SIGNED RESOLUTION, honest disclaimers ("live for merkle/range", "will follow as silverc matures").
- Triple sync was forced in audit; Kaspa page links real + PDFs 200.
- % back (potReturnPercent), rich Best Guide, PWA, 3 full-screen pro arenas (chess/poker/bj) with stake match, timers, logic, oracle submit (real sigs), % breakdowns on claim, mobile-first viewport boards.
- Backend compiler parses pot_return_percent.
- SHAs should match after deploys.
- claimPayout and similar are still "RESET BOARD (simulated)" with comments admitting "not enforced by current covenant" and "demo".

**Exact Remaining Gaps to Close (in this order, repeat full loop until zero):**

1. **Full client-side ZK proving (browser snarkjs fullProve for live circuits)**:
   - In CovexTerminal.jsx, for merkle_membership and range_proof (when selected), implement or wire actual client-side proof generation using the circuits in zk/ (merkle_membership.circom etc., assume zkeys are or can be loaded from public or generated).
   - Add a "Generate ZK Proof Locally" button in the resolution flow that calls snarkjs.fullProve (or equivalent) in browser, shows progress, then submits the proof + public signals to /api/oracle/verify-and-sign (which already supports it).
   - Update the "SUBMIT RESULT TO ORACLE / ZK" to branch: if ZK mode and circuit supports, do local prove first, then attest.
   - For chess_v1 keep oracle (chess.js validated + oracle sign) as it's complex.
   - Make sure the proof is passed correctly so oracle returns usable sig.
   - Test: In Terminal, choose merkle or range, "prove", get sig.

2. **Real claim / payout flow (beyond simulation)**:
   - Implement a proper claimPayout (and equivalents for poker/bj) that:
     - Takes the oracle sig / proof ref + outcome.
     - Calls a new or existing backend endpoint (e.g. POST /api/covenant/:id/claim) with the sig, covenant id, outcome.
   - Backend: In main.rs or new handler, verify the oracle signature (using the same logic as oracle service or pubkey), compute shares using the pot_return_percent + fee from ui_config or covenant, "resolve" the covenant (mark resolved in DB, adjust pot if reusable), and return the exact amounts or a ready-to-sign spend template / unsigned tx hex that the user can broadcast with the sig as witness to the unlock() script.
   - For TN12, at minimum update covenant state + show the exact KAS amounts the winner should receive (including pot back to covenant_pot if reusable).
   - In UI after claim: Show "Payout computed: Winner X KAS (incl. pot return Y to covenant if reusable). Use this sig in your spend tx." Provide copyable witness data.
   - Update SilverScript generators if needed to have clear unlock(outcome) that handles the pot return line.
   - Remove all "simulated" / "not enforced" disclaimers once real.

3. **Light mode 100% complete + perfect**:
   - Ensure pure white background (#ffffff) on html/body in .light.
   - Full support for light DAG: Already has ?theme=light in DagBackground — verify it shows cleanly.
   - Audit and fix all components in .light: full-screen arenas (chess/poker/bj boards, clocks, panels must look great on white, not inherit dark glass badly), Pricing, Explorer (CovenantCard, tags, Featured), Terminal (creation form, guide, arenas), PaidDeploy, WhatIsKaspa, nav, buttons, cards, inputs.
   - Use existing .light rules in index.css and extend where missing (contrast, glass -> light frosted, accents vibrant teal #0f766e, no dark text on dark bg remnants).
   - ThemeToggle must switch cleanly, persist, and arenas must respect current theme (or force dark for pro games if needed, but prefer full support).
   - Test: Switch to light, open full arena, create covenant, view Explorer — everything readable and "perfect" as per prior requirements (pure white + vibrant accents).

4. **Dedicated play routes + pro UX polish**:
   - Enhance /covenant/:id (CovenantInteractive.jsx) and any related: Add prominent "Launch Full Arena" buttons that detect game type (chess_v1 etc.) and open the matching full-screen immediately (or deep-link with ?play=chess).
   - Make CovenantInteractive load the specific covenant's Terminal config and pre-select the game.
   - Add direct links from Explorer cards for paid covenants with interactive games: "Play Now" that goes to /covenant/:id?play=full.
   - Polish: Auto-launch option, better loading states, shareable "play this covenant" links.
   - Ensure PWA "Add to Home Screen" prompt appears (beforeinstallprompt handler in main or App, visible button in Terminal or footer for phone users).

5. **Studio full sync + honest language**:
   - In Covenant-Studio: Update templates/index.js generate functions, Editor.jsx Covex Integration section, README, and generated HTML to use current honest language ("PRODUCTION", "live oracle attestation", "RISC Zero where applicable", no "aspirational").
   - Ensure payoutBackPercent / potReturnPercent is prominently labeled, default 2, shown in transparency and resolution panels in generated code.
   - Update Studio HERMES_COVENANT_STUDIO_MASTER_PROMPT.md and README with reference to the Covex ULTIMATE + this prompt.
   - When running, after changes, copy relevant example generated code or notes back to Covex27 if needed for consistency.

6. **End-to-end verification + final cleanup**:
   - Add or run verification: e.g. a node script or in-terminal test that creates a config with potReturn=2, generates script, checks the pot credit line math is correct (winner gets 100-fee-pot%).
   - Grep entire project (exclude node_modules/dist/.git) one last time for any "TODO|FIXME|aspirational|design target|coming soon" in user-facing or critical files and fix or properly comment as internal.
   - PWA: Confirm installable (manifest served, sw registered, icons).
   - Full deploy + triple sync: Build all, commit, push Covex27 + Studio, ssh exact deploy sequence to Hetzner (git hard reset, fe build + copy + clean stale, be if changed, reload), verify live:
     - curl health, manifest.
     - ssh grep for "PRODUCTION", "SHA256-SIGNED", "Circuit Design Specs", paper links in Kaspa bundle, "Pot return" in arena code.
     - Manually spot-check Kaspa page links resolve, light mode toggle, one full arena flow (stake match → play → submit → claim numbers).
   - Update this prompt + the ULTIMATE_FINAL one with exact "Run #3 completion" section (files, SHAs, live verification output, "all gaps closed").

**Strict Loop (every single change):**
- Read the required files above.
- Diagnose with grep/read/ssh/curl.
- Minimal precise edits only.
- `cd frontend && npm run build` (0 errors) + backend `cargo check`.
- For Studio if touched: its build.
- Local verify (grep new strings, node test if applicable).
- git commit -m "precise desc (refs gap #X)".
- git push both repos if Studio touched.
- Hetzner: ssh 'cd /root/Covex27 && git fetch && git reset --hard origin/master && [fe build + cp + clean] ; [be if needed]'.
- Live verify with curls + ssh greps + Kaspa link checks.
- Update the HERMES files (this one and ULTIMATE ones) with completion details + SHAs + "Remaining: [list or NONE]".
- Only stop when the 6 gaps above are 100% done and verified.

**Success =**:
- All 6 gaps closed with working code (browser ZK prove for supported, real claim that computes + "pays" or gives tx data, light mode perfect across app + arenas, dedicated play UX, Studio in sync with honest language, full E2E + deploys verified).
- Zero forbidden language.
- SHAs match local/GH/Hetzner.
- Live site has the strings, Kaspa links good, health OK.
- This prompt updated with final "ALL GAPS CLOSED" note.

**Output after run:** "Hermes remaining-gaps run complete. Changes: [bullets]. Verification: [SHAs, greps, build, live samples]. Prompts updated. All gaps from the list are now closed. No more missing."

Start now. Read first. Be precise. Make it real. No gaps left.

(After this, the system should be the best possible fully working version as originally requested across all phases and the A-to-Z plan.)