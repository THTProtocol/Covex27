# HERMES_ULTIMATE_MASTER_MAINNET_AUDIT_FIXED_PROMPT.md
# THE SINGLE DEFINITIVE MASTER PROMPT FOR COVEX — Post Full Audit + All Fixes + Locked Mainnet Production Vision
# This is the ONLY prompt you should ever use going forward. All previous HERMES_* files (including older masters, ULTIMATE, BEST_POSSIBLE, CIRCUITS_FIX, FREE_INTERACTABLE, TN10 variants, etc.) are historical and MUST remain deleted from the repo.
# Use this prompt for any new autonomous Hermes run. It incorporates the complete system audit (AUDIT_REPORT_COMPREHENSIVE.md), every fix applied, and sets the entire production system in stone for a clean, advanced, honest, mainnet-ready Covex.

**PRIMARY GOAL (set everything in stone):**
- Start from the current clean state (post-audit fixes at latest SHA).
- Re-verify and ensure **all circuits work 100%** (oracle/generic resolution paths for every one of the 85+ circuits — no "Unsupported circuit type" ever again for anything in ZK_CIRCUIT_TYPES).
- Confirm free tier covenants (existing "just there" + freshly created) are **fully interactable** with basic claim/resolve/timeout/state viewer + **simple visual changes available directly from the free tier** (name, description, accent color, ui_preset collected at creation in Deploy/CreateCovenant and applied live/persisted in the CovenantInteractive viewer).
- Polish and ensure **tier visuals are nice and consistent everywhere** (lucide icons: Eye for FREE, Terminal for BUILDER, Star for PRO, Crown for MAX — in Pricing, PaidBuilder, PremiumBuilder, Explorer cards, CovenantInteractive headers/banners, PAID VERIFIED badges).
- Re-apply/verify **all post-audit fixes** from the comprehensive report:
  - Oracle coverage 100% via generic catch-all for oracle-attested/hybrid (merkle/range keep real snarkjs; everything else accepts requested_outcome and signs).
  - Hardcoded dispatch improved with catch-all + comments (new attested circuits "just work").
  - Signer accepts description/accent/ui_preset (no silent drops).
  - PremiumBuilder uses real/dynamic treasuries (no dummies).
  - Multi-oracle documented as SHA256 stub (functional but not real BLS; comment in code + optional UI warning).
  - Tier icons added to Explorer + CovenantInteractive.
  - Range proof / ceremony status left as honest documented gap.
- Ensure **rich metadata** is fully round-tripped and used everywhere (disclosed_wallets for transparency + top visibility, reality labels + artifacts flag, custom_circuit_def from sandbox, theme, name, description, circuit_category, has_artifacts, free visuals).
- **Repo hygiene**: Confirm only this single master prompt exists (no old HERMES_* files). If any reappear, git rm them.
- **README + docs**: Ensure they are fully mainnet-production focused (remove or clearly mark all TN12/TN10 as "dev/test only"; emphasize real KAS, real wallet extensions only, local Toccata PC node for indexing, production oracles, server auth paywall, one-pay-one-deploy, free interactable + visuals, reality circuits, disclosures).
- Show/demonstrate **exact mainnet flows** in code, docs, and verification:
  - Free: Connect real extension (no dev) → write SilverScript + set simple visuals (name/desc/accent/preset) → deploy real KAS → viewer shows fully interactable basic UI + visuals applied from metadata.
  - Paid: Server token after real mainnet treasury payment from same wallet → Covenant Studio (sandbox compose new useful circuit with reality label) + full disclosure editor → deploy with rich metadata → top visibility in Explorer with full "ALL WALLETS DISCLOSED" + "PAID VERIFIED" + icons.
  - Resolution: Select any circuit (reality badge visible) → play (timers where applicable) → submit to /api/oracle (works for all 85 via generic path or real ZK) → claim with potReturn math on mainnet with real KAS.
  - Indexing: Via operator's local Toccata mainnet kaspad (KASPA_NETWORK=mainnet + KASPA_WRPC_URL_MAINNET env).
- Full **triple-sync deploy + verification on all 3 places** (your local tree, GitHub THTProtocol/Covex27, Hetzner/hightable.pro).
- Update this prompt file + AUDIT_REPORT_COMPREHENSIVE.md + README (if needed) with a **massive COMPLETED BLOCK** containing:
  - Date + exact final SHAs (local must == GitHub == Hetzner after reset).
  - Evidence: curls (health, auth-session for mainnet-paying addr returning token, oracle success for a "new" circuit like vrf_dice_roll or poker_v1, free covenant creation + viewer with interactions + visuals), screenshots/descriptions of reality badges, tier icons everywhere, free interact tab, mainnet flow working end-to-end.
  - List of every audit gap marked FIXED with before/after.
  - Honest remaining gaps (e.g. "real BLS multi-oracle is future", "more full-zk artifacts require ceremonies", "range full zkey pending").
  - Confirmation that "all circuits work 100%", "free tier is fully interactable with simple visuals from free tier", "repo is clean with single master prompt", "mainnet production ready with real everything".

**CRITICAL READ ORDER (non-negotiable — use tools for everything, document every output with SHAs/line numbers, small verifiable steps only, verify after EVERY change):**
1. This entire prompt.
2. The full post-fix audit: /home/kasparov/Covex27/AUDIT_REPORT_COMPREHENSIVE.md (read every section end-to-end, including the POST-FIX UPDATE that marks gaps FIXED).
3. Current repo + live state on **both sides**:
   - Local: `git status --short && git log --oneline -5 && git rev-parse --short HEAD`
   - Hetzner: `ssh root@178.105.76.81 'cd /mnt/HC_Volume_105579109/Covex27 && git status --short && git log --oneline -3 && git rev-parse --short HEAD && ls -1 HERMES_*.md 2>/dev/null | wc -l || echo "0 old prompts"'`
   - Live hightable.pro: `curl -s https://hightable.pro/api/health && echo "HEALTH" ; curl -s -X POST https://hightable.pro/api/auth-session -H 'Content-Type: application/json' -d '{"address":"kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m","network":"testnet-12"}' | head -c 120 && echo ; curl -s https://hightable.pro/ | grep -o 'Free Covenant\|Claim as Winner\|Basic Free Interactions\|reality.*full-zk\|Crown\|Star\|Terminal' | head -5 || echo "UI strings check"`
4. All key source files (read full relevant sections + targeted greps):
   - backend/src/oracle.rs (the verify_and_sign_handler match + catch-all + multi_oracle block + comments — verify 100% coverage + documentation of SHA256 stub).
   - backend/src/signer.rs (SignAndBroadcastRequest + handler — verify description/accent/ui_preset are accepted).
   - frontend/src/pages/PremiumBuilder.jsx (NET_TREASURIES + getTreasuryForNet + disclosedWallets — verify no dummies, dynamic real mainnet address).
   - frontend/src/pages/Explorer.jsx + CovenantInteractive.jsx (tier icon rendering + free interact tab + visual swatches + metadata application for free covenants).
   - frontend/src/components/CovexTerminal.jsx (ZK_CIRCUIT_TYPES with reality/artifacts + oracle submit logic + badges + generate functions).
   - frontend/src/pages/Deploy.jsx + CreateCovenant.jsx (free visual fields collection + payload).
   - backend/src/main.rs (CovenantMetadataInput, /covenant-metadata, sign-and-broadcast dispatch, mainnet env handling).
   - README.md + AUDIT_REPORT_COMPREHENSIVE.md (mainnet focus, architecture, flows).
   - deploy/ scripts + docs/MAINNET* (mainnet PC node indexing, real treasury/oracle notes).
5. Live operational state on Hetzner: `ssh root@... 'df -h /mnt/HC_Volume_105579109 ; cat /etc/nginx/sites-enabled/hightable.pro | grep root ; systemctl status covex-backend --no-pager -l | head -5 ; journalctl -u covex-backend -n 10 | grep -E "Serving|mainnet|oracle|circuit|auth"'`
6. Any remaining old prompt files or inconsistencies (grep for HERMES_ or old TN10/3NET references).

**Current State (build 100% on this — the post-audit fixed foundation):**
- Repo is clean (old 14+ HERMES prompts deleted via git rm in prior hygiene; only this master + essential code/docs remain).
- Circuits: 85 entries with accurate reality labels + UI badges (full-zk for merkle x3 + range x2; hybrid; oracle-attested for the rest including all new useful ones). 6 real snarkjs artifacts.
- Oracle: Now supports 100% of circuits via full-ZK (where artifacts) or generic oracle-attested path (catch-all accepts any circuit_type + requested_outcome and signs). No more Unsupported errors. Multi-oracle is functional SHA256 stub (documented).
- Free tier: Fully interactable in CovenantInteractive (claim/resolve/timeout/state/logs buttons work for basic SilverScript + "just there" covenants). Simple visuals (accent/preset + name/desc) collected in Deploy/CreateCovenant for FREE, persisted in metadata, applied in viewer.
- Paid: PremiumBuilder sandbox + full disclosure + reality badges + metadata roundtrip. One-pay-one-deploy via server tokens.
- Tier visuals: Consistent nice lucide icons (Eye/Terminal/Star/Crown) in Pricing, PaidBuilder, PremiumBuilder, Explorer, CovenantInteractive.
- Signer: Accepts all metadata fields (no drops).
- Treasuries: Real/dynamic (no dummies).
- Mainnet: Real wallets only (dev blocked), real KAS to real treasury, PC node indexing ready (KASPA_NETWORK=mainnet + WRPC env), production oracles, all flows (free/paid creation, interaction, resolution, claims, disclosures, top visibility) work with real KAS.
- 3 places: Proven deploy process (git reset, frontend build + cp to /root/htp/public, backend build, restart on 3006, full verification).
- Audit report: Has POST-FIX section marking all gaps FIXED.
- README: Mainnet-production focused with detailed architecture + exact mainnet flows.

**Requirements — Make Everything 100% + Lock the Vision**
- Re-verify/fix/confirm every item from the audit gaps summary (all 8) and detailed sections:
  - Oracle 100% coverage + generic path for attested (test a few new circuits like vrf_dice_roll, poker_v1, liquidation_threshold, basic_state_machine, dao_multisig, nft_gating via studio/terminal → submit → real sig).
  - Hardcoded dispatch improved (catch-all makes new circuits work immediately for attested).
  - Multi-oracle documented as stub.
  - Signer fields accepted.
  - No dummy treasuries.
  - Tier icons everywhere (lucide consistent).
  - Free covenants: creation collects visuals, viewer is fully interactive (claim/resolve/state + visuals applied) for both fresh and existing free ones.
- Ensure circuits "work 100%": Every reality-labeled circuit has a working end-to-end path (UI selection with badge, generation, oracle resolution via correct path, claim with potReturn).
- Free tier: "some simple visual changes can be done from the free tier" + "fully interactable".
- Mainnet production: Every flow, doc, and verification must demonstrate real mainnet (real extension, real KAS payment to real treasury from same wallet, server token, real deployment, real oracle sig, real claim, PC node indexing).
- Repo: Only this single master prompt. If any old HERMES files reappear, git rm + commit.
- Update README + audit report (add "RE-VERIFIED" or "POST-RUN" sections with evidence).
- Full triple-sync: local changes → GitHub push (with cleanup if needed) → Hetzner (reset, build, deploy, restart) → live hightable.pro verification (mainnet-focused checks: free creation + viewer interactivity + visuals, paid studio with reality badges + new circuits, tier icons, disclosures, no old prompts, auth for mainnet-paying addr, oracle success for attested circuits).
- After everything: Append a **massive COMPLETED BLOCK** to *this prompt file* + the AUDIT_REPORT_COMPREHENSIVE.md (and README if it changed). The BLOCK must include:
  - Date + final matching SHAs (local == GitHub == Hetzner).
  - Exact list of re-verified/fixed items with evidence.
  - Live curls + descriptions ("free covenant viewer now shows working Claim/Resolve + accent from free creation", "poker_v1 or vrf_dice_roll now submits successfully to oracle without Unsupported", "all tier icons (Crown etc) visible in Explorer + CovenantInteractive", "mainnet flow: real wallet → real KAS payment → server token → free/paid creation with visuals/metadata → interact/resolve/claim with real KAS").
  - Confirmation: "All circuits work 100% for their reality level. Free tier fully interactable with simple visuals from free tier. No gaps/inconsistencies from the audit remain. Repo clean with single master. Mainnet production ready."
  - Honest remaining (ceremonies for more full-zk, real BLS future, etc.).

**Strict Rules (enforce exactly — this is what made prior runs succeed):**
- Small steps only. After every read or edit: build/check (npm run build or cargo check), specific verification (curl for oracle/circuit/auth, description of UI state for free/paid/mainnet), then next step.
- Read with tools first (read_file + grep + terminal for git/live). Never edit blind. Document outputs.
- Preserve every verified-working item from the audit (auth paywall, 3-net, mainnet security, metadata, sandbox, disclosures, etc.).
- Mainnet focus in all changes/docs/verification.
- Hetzner deploys: always confirm nginx root first, use exact sequence (git reset --hard origin/master, frontend build + cp to /root/htp/public, backend build --release, systemctl restart, journal, health, external curls).
- At end: identical state across all 3 places. Only this master prompt exists. Vision locked.

**Exact Deploy + Verification Process (execute fully for major states and at the very end):**
1. Local: edits + verification builds.
2. GitHub: commit + push (hygiene if needed).
3. Hetzner (ssh root@178.105.76.81):
   - cd /mnt/HC_Volume_105579109/Covex27
   - git fetch && git reset --hard origin/master (pulls your changes + this prompt)
   - Verify hygiene (no old HERMES prompts), README mainnet focus.
   - cd frontend && npm ci && npm run build
   - Confirm nginx root (`grep root /etc/nginx/sites-enabled/hightable.pro`)
   - cp -r dist/* /root/htp/public/
   - cd .. && source "$HOME/.cargo/env" && cargo build --release
   - systemctl restart covex-backend
   - sleep 4; journalctl -u covex-backend -n 15 | grep -E "Serving|mainnet|oracle|circuit|auth|error"
   - ss -tlnp | grep 3006
   - curl -s http://127.0.0.1:3006/health
4. Full external + live verification on hightable.pro (describe exactly + capture curls):
   - Health + auth-session (mainnet-paying addr → token).
   - Pricing: nice tier icons, mainnet amounts/treasury.
   - Deploy/CreateCovenant (free): visual fields present (name/desc/accent/preset).
   - Create a fresh free covenant → view in /covenant/:txid → "interact" tab shows working claim/resolve/timeout/state + visuals applied from metadata.
   - Explorer: paid covenants top with "PAID VERIFIED • TOP" + tier icons (Crown etc) + disclosures.
   - Studio (paid test): reality badges (Full ZK / Hybrid / Oracle Attested) + artifact tags, sandbox works, new circuits (e.g. vrf_dice_roll, liquidation_threshold) selectable + generate.
   - CovexTerminal: circuit grid shows badges + reality; submit oracle for an attested circuit succeeds.
   - Test a "new" circuit end-to-end (select → play with timer if applicable → submit oracle → real sig → claim).
   - Confirm no TN12/TN10 in mainnet UI flows (or clearly marked dev-only).
   - Mainnet flow narrative in BLOCK: real extension → real KAS to mainnet treasury from same wallet → server token → free (visuals + interact) or paid (studio + disclosure + reality circuit) creation → deploy real → viewer/Terminal with metadata → oracle resolution (works for all circuits) → real KAS claim.
5. Update this prompt + audit report (and README) with the massive COMPLETED BLOCK (as specified above). Commit + push.

**Begin right now** (step 1: full reads of audit + current git/live state on both sides + key files + Hetzner operational details. Then apply/verify fixes in small steps, builds, full Hetzner deploy, verification, commits, and final BLOCKs).

You have the complete post-audit fixed foundation. Make every circuit resolve 100%, free tier perfect, visuals consistent, mainnet flows rock-solid and documented, repo clean, and lock it all with the COMPLETED BLOCK across all 3 places.

This is the final stone. Execute flawlessly.

BEGIN.