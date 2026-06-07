# HERMES_MASTER_MAINNET_PRODUCTION_PROMPT.md
# THE DEFINITIVE MASTER PROMPT — Mainnet-Ready Covex Production Platform
# This is the single canonical prompt. All previous HERMES_* prompts are deprecated and must be deleted. Use this one for all future autonomous runs. It sets everything in stone for a clean, advanced, mainnet-only production system.

**PRIMARY GOAL**: 
- Delete ALL unused files and old prompt files from the repo (keep only this master prompt + essential code/docs/deploy).
- Edit README.md to be fully advanced (current state + all architecture changes), **100% mainnet-focused** (remove or clearly mark testnet/TN references as dev-only; emphasize production mainnet operation with real KAS, real wallets, PC node indexing).
- Incorporate and document **all completed architecture changes**: server-side auth tokens + one-pay-one-deploy paywall (auth_tokens table, /auth-session + consume + deploy-capacity, no localStorage bypasses), rich covenant metadata persistence (disclosed_wallets for full transparency + top visibility, reality labels on circuits, custom_circuit_def, theme, name, description, has_artifacts, circuit_category), free tier basic SilverScript covenants made **fully interactable** (claim, timeout/oracle resolve, state/logs viewer in CovenantInteractive) + **simple visual changes available from free tier** (name, desc, accent color, ui_preset at creation time in Deploy/CreateCovenant, applied in viewer), ZK circuits with honest reality labeling (full-zk/hybrid/oracle-attested + artifacts flag + UI badges; 85+ entries + 11+ new useful Kaspa-focused ones like timelocks, VRF, state machines, collateral liquidation, DAO multisig, NFT gating, etc.), sandbox composition in paid Studio, tier visuals polished to nice consistent lucide icons (Eye/Terminal/Star/Crown), backend metadata support, oracle generic support for attested circuits, 3-net dev isolation but mainnet production ready.
- Make the entire platform **mainnet production ready**: show exact flows for free + paid on mainnet (real wallet extensions only, real KAS to mainnet treasury, production oracles, local Toccata PC node for indexing, real payouts/claims). Testnets (TN12/TN10) are explicitly dev aids only.
- Perform full triple-sync: local edits → GitHub commit/push (with cleanup) → Hetzner (git reset, build, deploy to /root/htp/public + restart) → live verification on hightable.pro (mainnet flows, free interactable + visuals, paid studio with reality circuits, disclosures, tier icons).
- Update this prompt + AUDIT file (if present) + any surviving docs with massive COMPLETED BLOCK (final SHAs, evidence of cleanup, mainnet README, new architecture sections, live mainnet curls + descriptions of free/paid mainnet experience, honest gaps like "more full-zk artifacts require ceremonies").

**CRITICAL: READ ORDER (use tools, document outputs, no shortcuts, small steps)**
1. This entire prompt.
2. Current repo state: `git status --short`, `git log --oneline -5`, `git rev-parse --short HEAD` (local + ssh to Hetzner root@178.105.76.81 'cd /mnt/HC_Volume_105579109/Covex27 && git ...').
3. Live hightable.pro + Hetzner: curl /api/health + POST /api/auth-session (use a known mainnet-paying address if available; expect mainnet behavior), inspect current README, Pricing (tier icons), Deploy/CreateCovenant (free visuals), CovenantInteractive (free interact tab + visuals), CovexTerminal (reality badges + circuits), Explorer (paid top visibility + disclosures). Confirm no old prompts in public/dist or served JS.
4. Key files for changes:
   - README.md (major rewrite for mainnet focus + advanced architecture including auth paywall, metadata, free interact+visuals, reality circuits, mainnet flow section).
   - All old HERMES_*.md and any other prompt/audit/temp/backup files (identify via ls/grep, git rm them).
   - frontend/src/pages/Deploy.jsx + CreateCovenant.jsx (ensure free visual fields: name/desc/accent/preset are present and sent in FREE deploy metadata).
   - frontend/src/pages/CovenantInteractive.jsx (ensure free !paid path has full basic interactions + limited visual controls using metadata/config).
   - frontend/src/components/CovexTerminal.jsx + PremiumBuilder.jsx (reality labels, new circuits, badges, sandbox — already advanced; verify mainnet paths).
   - backend/src/main.rs + oracle.rs + db.rs (metadata fields for disclosed/reality/etc, generic oracle for attested circuits, FREE tier support — verify mainnet treasury/env handling).
   - deploy/ scripts, docs/MAINNET_COVENANT_EXAMPLES.md, MAINNET.md (update for production mainnet; keep as references).
   - Any other files with TN12/TN10 hardcodes in mainnet paths or old prompts references (clean).
5. Architecture/docs: AUDIT_CIRCUITS_TIERS_SUGGESTIONS.md (if still present), docs/* (update mainnet sections).
6. Hetzner operational: ssh for df (note space for mainnet indexing only via PC node — no full node on volume), nginx root confirmation, current service (BIND_ADDR, KASPA_NETWORK=mainnet support), journal.

**Current State (as of latest work — build exactly on this, do not regress)**
- **Repo hygiene**: Previously had 14+ old HERMES_* prompt files (TN10, 3NET variants, ULTIMATE, etc.). Many unused. Cleanup required: git rm all except this single master + essential code.
- **Architecture (advanced, mainnet-ready)**:
  - Server auth paywall: POST /api/auth-session returns {token, tier, expires} only after real on-chain mainnet payment from the wallet. Token one-time (consume on deploy). Deploy capacity tracked. No localStorage bypasses.
  - One-pay-one-deploy + metadata: covenants table + terminal-config store disclosed_wallets (full transparent list for top visibility), reality (full-zk/hybrid/oracle-attested + artifacts flag), custom_circuit_def (from paid sandbox), theme, name, description, etc. Explorer shows paid at top with badges + disclosures.
  - Free tier: Basic SilverScript creation (Deploy/CreateCovenant) with simple visuals (accent, preset, name/desc at creation). Post-deploy: CovenantInteractive "interact" tab is fully functional — basic claim, timeout/oracle resolve, state/logs. Limited visuals (swatches/preset) apply live from metadata. No circuits.
  - Paid (BUILDER/PRO/MAX after token): Covenant Studio (PremiumBuilder) with sandbox (compose new useful circuits), full disclosure editor, custom UI. CovexTerminal with reality-labeled library (85+ circuits + new useful: timelocks, VRF, state machines, liquidation, DAO, gating, etc.), pro arenas, timers/potReturn. Top visibility.
  - Circuits: Reality labels + badges in UI. Generic oracle support for attested. Only real artifacts for a few (honest). Sandbox for composition.
  - Tier visuals: Clean lucide icons (Eye free, Terminal builder, Star pro, Crown max) in Pricing + headers.
  - Mainnet specifics: Real extensions only (dev blocked). Real KAS to mainnet treasury. Indexing via local Toccata PC node (env KASPA_NETWORK=mainnet + WRPC). Production oracles. All flows (free/paid creation, interaction, claim, disclosures) with real KAS.
  - 3 places: Local edits, GitHub (THTProtocol/Covex27), Hetzner (hightable.pro via /root/htp/public + covex-backend service on 3006). Proven deploy: git reset, frontend build + cp, backend build, restart, verify.
- **README**: Currently mixed (some TN12 badges/mentions). Needs full mainnet rewrite + architecture updates.
- **Cleanup needed**: Delete old prompts (14+ HERMES files), any unused temp/backup/prompt variants, keep single master + core (src, deploy, docs/MAINNET*, examples, zk essential artifacts, etc.).

**Requirements — Set Everything in Stone (Mainnet Production)**
- **Repo Cleanup (GitHub + all places)**: `git rm` all old HERMES_*.md prompts (keep only this HERMES_MASTER_MAINNET_PRODUCTION_PROMPT.md). Delete any other unused (old TN10 scripts if redundant, temp files, duplicate docs, node_modules in source if present — respect .gitignore). Commit as "chore: repo hygiene — deleted all unused prompts and files; single master prompt remains". Do the same on Hetzner tree before deploy. Result: clean repo with only production essentials.
- **README.md Edit (Mainnet-Only, Advanced)**: Complete rewrite for production focus:
  - Badges: Mainnet (Toccata), live hightable.pro, MIT, Covenant Studio link. Remove TN12.
  - Intro: "The Platform for Verifiable Interactive Covenants on Kaspa Mainnet. Real KAS. Real wallets. Production oracles. Local PC node indexing. Server-verified paywall. Rich metadata for transparency. Free basic (fully interactable + simple visuals). Paid advanced (reality-labeled circuits, sandbox, custom UI, top visibility)."
  - Core Capabilities: Update with current (free interactable + visuals from free tier, paid Studio/sandbox, reality circuits, server auth one-pay-one-deploy, disclosures, mainnet examples).
  - Architecture: Update mermaid + text to include auth layer, metadata fields (disclosed_wallets, reality, etc.), free interactivity, mainnet kaspad/PC node, production oracles. Remove TN-specific.
  - Data Flow + Classification: Keep advanced but note mainnet (real KAS, real treasury monitoring).
  - **New Mainnet Production Section**: Detailed step-by-step (as in the edit above): birth with real wallet + real KAS payment, detection/indexing via local Toccata, server token issuance, free creation with visuals + post-deploy interactivity, paid Studio creation with disclosures + reality circuits, resolution/claim with real oracles/payouts, indexing setup. Emphasize "no dev mode on mainnet", "real extensions only", "PC node required for full mainnet covenant indexing".
  - Classification/Oracle/Etc.: Update examples to mainnet. Add "Mainnet Treasury & Oracles", "Free vs Paid on Mainnet with Real KAS".
  - Keep advanced tone but production-oriented. Mention repo is clean (single master prompt, essential files only).
- **Incorporate All Architecture Changes** (document + ensure code reflects if needed):
  - Server auth + one-deploy as core paywall.
  - Free: fully interactable (claim/resolve/state in viewer) + simple visuals from free creation (accent/preset persisted in metadata, applied in CovenantInteractive).
  - Circuits: reality labels + new useful ones (list key additions), sandbox, generic oracle support.
  - Metadata + disclosures + top visibility for all (free + paid).
  - Tier icons polished.
  - Mainnet: real everything, PC node, blocked dev on mainnet.
- **Mainnet-Ready Emphasis**: Every flow described for mainnet. Testnets noted only as "for development/debug (use local or Hetzner TN instances)". Deploy scripts updated if touching (e.g. switch-to-mainnet.sh). No testnet assumptions leak into mainnet paths.
- **Other Polish**: Ensure free creation sends visuals/metadata. Viewer applies them for free covenants. Circuits "work" via labels + generic paths. No unused prompts left.

**Strict Rules (Non-Negotiable)**
- Small steps only. After every read/edit: verify (git status, build success, specific mainnet-focused curls if possible, description of "what mainnet user sees in free Deploy + covenant viewer").
- Read with tools first. Document SHAs, file contents, live state.
- Preserve all prior production work (auth, metadata, free interact+visuals, reality circuits, tier polish, 3-net dev isolation but mainnet prod focus).
- On Hetzner: always confirm nginx root, use exact deploy sequence, full verification (health, auth for mainnet-paying addr, live hightable.pro mainnet experience for free/paid, tier icons, no old prompts in source or served).
- Cleanup: actual `git rm` + commit of deletions.
- At end: triple-sync SHAs (local = GitHub = Hetzner post-reset+build). Single master prompt only in repo. README is the authoritative mainnet production guide.

**Deploy + Verification Process (All 3 Places — Execute Fully)**
1. Local: edits (README + any code if gaps) + cleanup (rm old prompts if not already), `git add -A`, commit, push.
2. Hetzner (ssh root@178.105.76.81):
   - cd /mnt/HC_Volume_105579109/Covex27
   - git fetch && git reset --hard origin/master (pulls the cleanup + README + this prompt)
   - Verify: no old HERMES prompts remain (`ls HERMES_*.md`), README is mainnet-focused.
   - cd frontend && npm ci && npm run build
   - Confirm nginx root (`grep -E 'root .*htp' /etc/nginx/sites-enabled/hightable.pro`)
   - cp -r dist/* /root/htp/public/
   - cd .. && source $HOME/.cargo/env && cargo build --release
   - systemctl restart covex-backend
   - sleep 4; journalctl -u covex-backend -n 20 | grep -E 'Serving|mainnet|oracle|circuit|auth'
   - ss -tlnp | grep 3006
   - curl -s http://127.0.0.1:3006/health
3. Verification (external + description):
   - https://hightable.pro/api/health
   - POST /api/auth-session with mainnet-paying address (token issued, tier correct).
   - Browse: Pricing (nice tier icons, mainnet treasury/amounts), Deploy (free visual fields for name/desc/accent/preset), create free covenant → view in /covenant (interactable claim/resolve + accent applied from metadata), Explorer (paid top with disclosures), Studio (if paid test: reality badges + new circuits).
   - Confirm no TN12/TN10 mentions in served UI/README (or clearly "dev only").
   - Mainnet flow demo description in prompt BLOCK: "User connects real extension → pays real KAS to mainnet treasury → gets server token → creates named free covenant with accent in Deploy (or paid in Studio with sandbox circuit + full disclosure) → deploys with real wallet → viewer shows interactive basic UI + visuals (free) or full Terminal (paid) → oracle resolution → claim real KAS. Indexing via local PC Toccata node."
4. Git: Commit cleanup + README + this prompt (message: "chore+docs: repo hygiene (deleted all old prompts), mainnet-only README with full advanced architecture (auth paywall, free interact+visuals, reality circuits, metadata, mainnet flows), single master prompt"). Push. Confirm SHAs.
5. Triple sync + BLOCK: Local pull matches. Hetzner reset matches. Update this prompt file (and AUDIT if present) with huge COMPLETED BLOCK (date, final SHAs, list of deleted files, README changes summary, mainnet flow evidence, live curls/screenshots descriptions, honest remaining like "full-zk artifacts for more circuits require ceremonies", "operator maintains local Toccata for mainnet indexing").

**Begin Immediately**: Read state (git + live + files), delete old prompts (git rm), edit README (mainnet focus + architecture), verify mainnet flows in code, full Hetzner deploy/verify, commits, final BLOCK in this prompt.

This prompt + the resulting clean mainnet-ready repo + README sets the production system in stone. Future runs use only this master.

BEGIN.