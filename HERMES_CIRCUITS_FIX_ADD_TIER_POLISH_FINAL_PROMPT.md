# HERMES_CIRCUITS_FIX_ADD_TIER_POLISH_FINAL_PROMPT.md
# Fresh definitive master prompt: Fix all circuits (honest reality labeling + validity), add more useful Kaspa-covenant-focused ones, polish tier visuals to "something nice" everywhere, full changes + triple-sync deploy + commit on all 3 places (local + GitHub + Hetzner/hightable.pro), update all master prompts with evidence.

**GOAL**: Take the current excellent foundation (post-audit state at ~a87174c, expanded ~85-90 circuits with timer/oracle focus, server-auth paywall, PremiumBuilder sandbox + disclosure enforcement, free plain SilverScript path, 3-net isolation, recent tier icon fixes in Pricing) and make it the absolute best possible version.
- **Circuits**: Full audit-driven fixes (add explicit `reality` field + UI badges/labels for "Full ZK" vs "Hybrid (ZK property + Oracle)" vs "Oracle Attested"; clean descriptions so "all ZK proofs are valid" is accurate; remove any over-claims). Add 8-12 *more useful* ones prioritized for real Kaspa covenant use-cases (more ownership/script/timelock, collateral/liquidation, DAO treasury/multisig, VRF fairness extensions, verifiable state machines for games, simple NFT/token gating, basic financial formulas with oracle price). Ensure sandbox + library + terminal use the new labels. Hundreds of options via variants + composition preserved/enhanced.
- **Tier images/visuals**: The recent fixes (remove all ugly colored-div placeholders, use clean consistent lucide icons: Eye for FREE, Terminal for BUILDER, Star for PRO, Crown for MAX) are the base. Polish them to "something nice" across *all* places (Pricing cards + payment flow, PaidBuilder headers, PremiumBuilder/Covenant Studio tier badges, Explorer paid cards/glows, any other tier displays). Make consistent, professional, theme-native (subtle gradients, better spacing, icons everywhere paid tiers appear). No low-quality images or inconsistent placeholders.
- **All changes** committed + deployed identically on all 3 places with full verification (free vs paid flows on TN12/TN10/Mainnet, circuits in studio with new labels + new useful circuits selectable, tier visuals looking great, disclosure enforcement, no bypasses).
- Preserve 100% of prior work: server-auth one-pay-one-deploy (auth tokens, consume on deploy), 3-net isolation (wallets/indexers/data/treasuries per net, mainnet real-only), sandbox for custom circuits, full transparent wallet disclosure (never deploy interactive covenant without name/desc/circuit/disclosure ack), top visibility for paid, plain free SilverScript path, professional logo/tab, no phases/KYC spam.

**CRITICAL — READ THESE IN EXACT ORDER (use tools, document everything read, small steps only):**
1. This entire prompt.
2. The current audit + plan: /home/kasparov/Covex27/AUDIT_CIRCUITS_TIERS_SUGGESTIONS.md (full breakdown of ~85 circuits, gaps in reality labeling/artifacts, tier visuals problems/fix, prioritized suggestions). Treat as spec.
3. Previous masters for context (do not regress): HERMES_BEST_POSSIBLE_FINAL_VERSION_PROMPT.md, HERMES_ULTIMATE_100_COMPLETE_SANDBOX_KASPA_CIRCUITS_PROMPT.md, HERMES_MASTER_3NET_FINAL_100_PROMPT.md (and the audit doc itself). Note the 71911aa / a87174c foundation (server auth, sandbox, disclosure, recent tier icon work, circuit expansion with timers).
4. Git + live state first (both local in Covex27/ and via ssh root@178.105.76.81 on Hetzner):
   - `git status --short && git log --oneline -5 && git rev-parse --short HEAD`
   - Hetzner: ssh ... 'cd /mnt/HC_Volume_105579109/Covex27 && git status && git log --oneline -3 && git rev-parse --short HEAD'
   - Live hightable.pro: curl health, POST /api/auth-session for known paying addr on all 3 nets (expect token only where paid), check current Pricing tier visuals (via description or source grep if possible), check CovexTerminal/PremiumBuilder for current circuit count/labels.
5. Key source files (read full relevant sections, note line numbers, use grep for patterns like ZK_CIRCUIT_TYPES, reality, tier icons, deploy buttons, disclosedWallets):
   - frontend/src/components/CovexTerminal.jsx (the ZK_CIRCUIT_TYPES array — audit every entry for over-claims, add `reality` field to each, update RESOLUTION_MODES if needed, library rendering, generate functions, any "Technical reality" comments).
   - frontend/src/pages/PremiumBuilder.jsx (sandbox composer, circuit library grid — add reality badges/labels, use new circuits, enforce full info before deploy, disclosure banner + ack).
   - frontend/src/pages/Pricing.jsx (current tier icons — polish further for "nice", ensure no old div placeholders, consistent styling).
   - frontend/src/pages/Explorer.jsx, PaidBuilder.jsx, CovexTerminal.jsx (paid tier badges/glows/cards — add matching icons + reality context where circuits shown).
   - backend/src/main.rs + oracle.rs + db.rs (circuit storage in terminal-config/covenants, oracle verify-and-sign for new types, metadata for disclosed + custom def + reality).
   - frontend/public/ (any tier-related or logo consistency; ensure no stray bad images).
   - docs/NEXT_ZK_CIRCUITS.md + AUDIT file (update with what was done).
   - Any remaining files with old tier visuals, localStorage paid, or outdated circuit comments (clean ruthlessly).
6. zk/ dir + examples/ (current artifacts for merkle/range; note which new circuits can realistically get artifacts vs oracle path).
7. Hetzner details via ssh: df (space), nginx root confirmation (/root/htp/public), systemctl/journal for covex-backend, current public assets for circuits/tier text.

**Current State (build 100% on this — do not regress)**:
- Circuits: Large expanded list (~85-90) with excellent Kaspa focus (real per-turn timers for games, ownership/script/timelock core, merkle/range/ VRF/ compute). Some reality notes exist (e.g. "Technical reality" comment). Sandbox in PremiumBuilder for composition. Free path clean. Gaps per audit: no consistent `reality` labels/badges in UI (Full ZK vs Hybrid vs Oracle Attested), over-claims on some "ZK" for complex games (most are oracle of off-chain + ZK property), limited artifacts (only merkle/range real today), metadata not fully persisted for custom + disclosure.
- Tier visuals: Pricing fixed (colored div placeholders removed, lucide icons Terminal/Star/Crown/Eye added to cards + payment confirmation). Explorer/PaidBuilder/PremiumBuilder use CSS accents + badges/icons. Audit recommends making them "nice" and consistent everywhere.
- Paywall/Transparency/3-net: Solid (server /api/auth-session + consume + capacity; disclosure banner + ack in studio; deploy blocked without full info (name/desc/circuit/disclosure); per-net everything; mainnet real wallet only).
- Deploy process proven: git reset/pull, frontend npm run build + cp -r dist/* /root/htp/public (confirm root first), backend cargo build --release, systemctl restart, health + auth curls, journal, live hightable.pro verification on all 3 nets.
- Audit doc + suggestions plan exist and are committed.

**Requirements — Make the Best Possible Version**:
- **Circuits Fixes (address full audit)**:
  - In ZK_CIRCUIT_TYPES: Add `reality: 'full-zk' | 'hybrid' | 'oracle-attested'` (and optional `artifacts: true/false`) to *every* entry.
    - 'full-zk': Only for those with real circom + snarkjs verifier live (currently merkle_*, range_*, basic custom).
    - 'hybrid': ZK property proof (range/membership) + oracle for game outcome (most games with timers).
    - 'oracle-attested': Pure oracle sign of off-chain result (complex games until full ZK).
  - Update all descriptions/comments to be accurate (e.g. "Oracle + ZK hybrid for hand strength + timer enforcement" instead of implying full on-chain chess rules). Remove any over-claims so "all ZK proofs are valid" is true.
  - Add UI badges/labels in library grid (PremiumBuilder + CovexTerminal): e.g. green "Full ZK", blue "Hybrid", amber "Oracle Attested". Show in sandbox selection, circuit detail, generated covenant def.
  - Ensure sandbox composition respects reality (e.g. warn if mixing incompatible types) and includes the reality in the output def.
  - Update any "Technical reality" sections or docs to reflect new labels.
  - Free path never shows circuits (already enforced).

- **Add More Useful Ones (Kaspa covenant prioritized, per audit suggestions + user history)**:
  - Focus on useful for p2p interactive covenants, DAOs, collateral, finance, fair resolution, script constraints (not more KYC/age — keep de-prioritized).
  - Suggested additions (add ~8-12 new, with variants where useful, proper reality):
    - More Ownership/Script/Timelock: `timelock_daa_range`, `script_constraint_proof` (prove specific SilverScript pattern), `covenant_state_hash` (prove current covenant state matches committed hash), `utxo_spend_authority` (enhanced ownership for multi-party).
    - Collateral/Finance: `liquidation_threshold` (prove collateral < liquidation price via oracle price + range), `yield_proof` (verifiable accrual over blocks), `dao_treasury_multisig` (M-of-N + merkle voting power).
    - VRF/Fairness extensions: `vrf_card_deal` (for more games), `vrf_dice_roll` (per-turn in backgammon/monopoly etc.).
    - Verifiable Compute / State: `basic_state_machine` (simple FSM for custom game like "turn-based with phases"), `risc0_game_rule` (example RISC0 proving a rule was followed), `wasm_predicate` (user-defined predicate in WASM).
    - Gating/Access: `nft_ownership_gating` (UTXO + merkle for NFT/token gate), `reputation_threshold` (nullifier + range for on-chain rep).
    - Give each: id, name, description (with timer/payout language where applicable), circuit (reuse or new), accent, category, reality, optional variant: true.
  - Integrate: Add to library (with new reality badges), sandbox can compose them, PremiumBuilder/Paid flows use them, generate scripts include reality note.
  - Backend: Minor updates to oracle.rs/main.rs if new circuit ids need special handling (e.g. for new compute types); default to oracle/hybrid path.
  - zk/ + examples/: For 1-2 new high-priority (e.g. a timelock or simple state), note "artifacts pending" honestly like range doc. Don't block on full artifacts for all — use oracle path.

- **Tier Images/Visuals Polish to "Something Nice"**:
  - Build on the recent fix (icons in Pricing).
  - Make consistent + premium across *all* places: Pricing (cards + payment), PaidBuilder (headers/badges), PremiumBuilder/Covenant Studio (tier badge in header + any paid area), Explorer (paid cards, glows, "PAID VERIFIED" badges — add small icon next to tier label), any other (e.g. App nav if tier shown).
  - Use the same 4 icons (Eye/Terminal/Star/Crown) + matching accents. Add subtle polish: better hover, consistent sizing, perhaps a small "tier icon" component if it helps DRY. No colored div placeholders anywhere. Ensure looks great in light/dark if supported, responsive.
  - Verify no old images or hacks remain (grep public/ + src/ for any tier PNG/SVG/div icons).

- **Other Polish + Enforcement (from audit + history)**:
  - Persist rich covenant metadata (name, full desc, chosen circuit + reality + custom def from sandbox, theme, full disclosedWallets array, paid proof) on deploy/insert so Explorer + Terminal always show complete transparency + top visibility for paid ones.
  - Enforce "don't deploy interactive if not all info": name, desc (>30 chars), circuit/sandbox chosen, disclosure ack — already in PremiumBuilder; make bulletproof and surface in UI.
  - Update docs (AUDIT file, NEXT_ZK_CIRCUITS.md, perhaps add "Circuits Reality Guide").
  - 3-net + mainnet: All new circuits/labels/metadata respect network. Mainnet real-wallet only (no dev).
  - Free path: Remains plain SilverScript editor (beautiful, no circuits, no special treatment).

**Strict Rules (follow exactly)**:
- Small verifiable steps only. After reading state, make one logical change (e.g. add reality field to 5 circuits + test render), build/check (npm run build or cargo check), verify (curls or local preview description), then next.
- Read with tools first every time (note SHAs, line numbers). Never assume.
- After every Hetzner build/restart: full verification sequence (health, auth-session for paying addr on TN12/TN10/mainnet, deploy-capacity, live site checks for new circuit labels in studio, new circuits selectable, tier icons nice in Pricing/Explorer/etc., free path still plain, disclosure enforcement).
- Preserve everything prior (auth tokens + consume, one-pay-one-deploy, 3-net isolation, sandbox, disclosure, free path, logo).
- If long files: read sections. If truncation: stop, report state, continue.
- Mainnet PC node: Support documented if touching indexer.
- At end: identical on local tree, GitHub, Hetzner/hightable.pro. Triple-sync SHAs match.

**Deploy + Commit + Verify Process (do fully at end, and for major states)**:
1. Local: changes + `npm run build` (frontend) + quick checks.
2. Hetzner (exact, via ssh root@178.105.76.81):
   - cd /mnt/HC_Volume_105579109/Covex27
   - git fetch origin && git reset --hard origin/master (or pull rebase to latest)
   - Confirm files/SHAs
   - cd frontend && npm ci && npm run build
   - cp -r dist/* /root/htp/public/ (first confirm this is still the nginx root via `grep root /etc/nginx/sites-enabled/hightable.pro`)
   - cd .. && source $HOME/.cargo/env && cargo build --release
   - systemctl restart covex-backend
   - sleep 3-5; journalctl -u covex-backend -n 20 | grep -E 'Serving|error|oracle|circuit'
   - ss -tlnp | grep 3006
   - curl -s http://127.0.0.1:3006/health && echo
   - External curls from here: https://hightable.pro/api/health ; POST auth-session (paying TN12 addr → token; same addr TN10 → FREE or appropriate); deploy-capacity.
3. Live hightable.pro verification (describe exactly):
   - Pricing: tier cards + payment confirmation use nice consistent icons (no div placeholders), look professional.
   - Studio (/premium or PaidBuilder): library shows reality badges (Full ZK / Hybrid / Oracle), new useful circuits present and selectable, sandbox works, disclosure enforced (deploy button disabled until all info), can create with new circuit.
   - Explorer: paid covenants top with nice tier icons + badges, full disclosure visible.
   - 3 nets: toggle, confirm data/treasury isolation, mainnet real-wallet behavior.
   - Free path: Deploy/CreateCovenant still plain SilverScript only.
   - Circuits "valid": new labels accurate, no over-claims.
4. Git: On Hetzner (or local after sync): git add -A, commit with clear msg referencing this prompt + "circuits reality fixes + X new useful circuits + tier icons polished everywhere + full metadata + deploy enforcement", push. Confirm SHA.
5. Triple-sync: Local pull + match SHA; Hetzner after reset matches; GitHub matches. Update this prompt file + AUDIT + previous masters with massive COMPLETED BLOCK (date, final SHAs local/GitHub/Hetzner, list of circuit fixes + new circuits added, tier polish details, curls/evidence for 3 nets + studio + pricing visuals, honest remaining like "more ZK artifacts need ceremony time", "operator to verify PC mainnet wRPC").

**Begin immediately** with step 1 (local + Hetzner git state reads, read the audit doc + previous prompts + key files listed, inspect current circuits array for reality claims, current tier icons in Pricing/PaidBuilder/etc., live curls).

You have a great foundation (audit plan, recent tier fixes, expanded circuits, working paywall + sandbox + disclosure + 3-net). Now execute the fixes + additions + polish + full identical deploy on all 3 places flawlessly. Make the circuits honest + more useful for Kaspa, tiers look excellent everywhere, everything committed and verified live.

BEGIN.