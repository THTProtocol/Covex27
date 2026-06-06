# HERMES_MASTER_3NET_FINAL_100_PROMPT.md
# Definitive final prompt to make Covex 100% complete, professional, and fully working for all 3 networks (TN12 + TN10 + MAINNET) on the SAME website.
# Build directly on the previous successful run (auth tokens, deployment tracking, expanded circuits, paywall fixes from 9ddae1a and related).
# Goal: Once a user pays (server-verified via auth-session token from real on-chain payment to correct per-network treasury), they get full access to create the BEST possible interactive covenant: customize name, description, look (UI/theme/colors via inline or Studio integration), provide all info transparently (disclose dev/treasury wallets per network with clear mainnet warnings), wide selection of implementations/circuits (hundreds of options/variations), sandbox for custom circuits.
# Top visibility covenants for paid users on Explorer (higher rank, glow, featured).
# Free: always basic SilverScript editor (no special treatment, just write/compile to Kaspa covenant if valid).
# Circuits/advanced ONLY after payment (no bypasses).
# De-emphasize KYC/identity (age verification etc. not primary for Kaspa covenants; focus on game, crypto primitives, DeFi/financial, verifiable compute that are actually useful for p2p covenants, DAOs, collateral, games, etc.).
# Anticipate and implement the most useful circuits for real Kaspa covenant use-cases.
# Sandbox for paid users to create custom circuits (compose from primitives or define simple custom oracle/zk).
# Professional UI everywhere: no "Phase", no placeholders, no unnecessary messages, excellent visuals, logo on tab/favicon, clean/easy UX.
# All 3 networks 100% separate and independent: nodes, indexers/crawlers/verifiers, wallet connections (dev hex/mnemonic ONLY for TN12/TN10 with independent persisted state per net; REAL wallet extensions ONLY for mainnet - no dev ever), mnemonics/keys, treasuries, data (covenants/payments/configs tagged + filtered by network), paid tiers (per-net detection from same wallet).
# Mainnet node on operator's PC (Toccata mainnet) - make backend ready/configurable to point at it for indexing (KASPA_NETWORK=mainnet + KASPA_WRPC_URL_MAINNET); Hetzner space limited so no full mainnet node start unless confirmed.
# Logo: current glowing network C (from previous/screenshot) properly on website tab (favicon, manifest, icons, title), nav, headers, everywhere professional.
# Deploy + verify 100% on all 3 places (local, GitHub, Hetzner/hightable.pro). Update this prompt with massive COMPLETED BLOCK + evidence.
# Follow strict read-first + small-step + verify-after-every-change discipline. Preserve all prior 3-net + auth work. Make the best possible user experience.

**CRITICAL - READ IN EXACT ORDER (use tools, document what you read):**
1. This entire prompt.
2. The most recent master prompt: /home/kasparov/Covex27/HERMES_MASTER_3NET_COMPLETE_AND_FINAL_PROMPT.md (and HERMES_MASTER_3NET_FULL_PROMPT.md) - contains previous COMPLETED BLOCK, current state (auth tokens, 53 circuits, deployment tracking, paywall fixes). Build exactly on this, do not regress.
3. /home/kasparov/Covex27/README.md + deploy/ scripts (exact sequence: git reset --hard, frontend build + copy to the CORRECT nginx root - verify via nginx config first, backend cargo build --release, systemctl restart, health curls for 3 nets, journal checks).
4. Key current code files (read full relevant sections, note line numbers):
   - frontend/src/components/CovexTerminal.jsx (current 3-way net, netConfig per net/treasury, auth/paid gate, circuit list from ZK_CIRCUIT_TYPES - expand/refine here, script gen for basic free only, pro arenas, no dev on mainnet, customization points for name/desc/theme).
   - frontend/src/pages/PremiumBuilder.jsx (current state - polish to professional sandbox + circuit selector + customization for paid; integrate logo; easy flow: select/compose circuit -> customize UI/name/desc -> generate covenant + transparent wallet disclosure).
   - frontend/src/pages/PaidBuilder.jsx, Pricing.jsx, CovenantInteractive.jsx, Deploy.jsx, CreateCovenant.jsx (paid flow with server auth-session, QR codes, same-wallet enforcement, free basic editor, no localStorage bypasses, dynamic per-net labels, clean text).
   - frontend/src/App.jsx (global 3-button switcher, routing guards using server auth).
   - frontend/src/components/WalletContext.jsx, DevWalletModal.jsx (per-net dev for TN only, mainnet real-only, auth integration).
   - frontend/public/ + dist/ (logos: covex-logo-*.png/svg, favicon.svg, manifest.json, icon.svg - update favicon/tab icon/<title> to current glowing network C logo; make tab professional "Covex | 3-Network Covenant Platform").
   - backend/src/main.rs (current auth endpoints: /auth-session, /validate, /consume, /deploy-capacity; paid-status; multi-net spawns; signer per-net; mainnet handling. Extend for custom circuits if needed, sandbox endpoints).
   - backend/src/db.rs (auth_tokens table, deployment tracking on accounts, get_highest_paid_tier, create/validate/consume auth, can_deploy/mark_deployment_used. Add tables/funcs for custom user circuits if needed).
   - backend/src/payment_verifier.rs, crawler.rs, indexer.rs (per-net treasury monitoring from same wallet, insert with network, easy detection).
   - backend/src/dev_wallets.rs (TN12/TN10 full separate dev keys/mnemonics/hex; mainnet ENV ONLY + public treasury, strong comments).
   - frontend/src/lib/covenant-config/ + advanced-primitives/ + multi-oracle/ (for customization/sandbox).
   - Any pages with leftover "Phase", placeholders, KYC-heavy text, unnecessary messages (grep for "Phase", "KYC", "age", "identity", "unprofessional" notes - clean them).
   - zk/ dir and examples/ for circuit artifacts (ensure valid proofs for key circuits; expand if needed).
5. Git state (local + origin + Hetzner post-reset), current deployed on hightable.pro (nginx root, public dir, bundle hash), kaspad processes (TN12/TN10 + mainnet PC readiness), backend logs for per-net indexers + auth.
6. Hetzner via ssh root@178.105.76.81: df (space note for mainnet), nginx config for root, systemctl/journal for covex-backend (verify per-net + auth endpoints), current public files.
7. Operator's PC mainnet node details (if provided) for Toccata mainnet wRPC; ensure code supports pointing indexer at it (env + correct mainnet params/prefixes 'kaspa:').
8. Current logo (glowing network C from previous attachment/screenshot): use it for tab (update all favicon/manifest/icon files), nav, PremiumBuilder header, error states, everywhere professional and consistent.
9. Previous live issues (from history/logs): paywall bypasses via localStorage (now fixed with server auth tokens - ensure 100% no bypass: all advanced UI + deploy require valid server token from paid-status + consume on deploy), circuits in free (gate strictly), unprofessional PremiumBuilder (polish now), logo not on tab, mainnet node not fully integrated for indexing, 3 nets not 100% separate in UX/data/wallets, gaps/unnecessary text, KYC over-emphasis.

**Current State (build 100% on this - previous run achieved auth infrastructure + 53 circuits + some paywall fixes; finish the vision):**
- Server auth tokens + deployment tracking in place (db + main.rs endpoints). Frontend partially migrated to use /auth-session instead of localStorage (Pricing/CovenantInteractive/PaidBuilder/CovexTerminal/App updated in last run).
- ZK_CIRCUIT_TYPES expanded to ~53 (games like chess/poker/blackjack + many primitives; 6 resolution modes).
- Per-net everything: dev wallets (TN only, independent), indexers (dual spawns), data filters, treasuries in netConfig (mainnet real kaspa:), mainnet blocks.
- Free basic: Deploy/CreateCovenant for SilverScript.
- PremiumBuilder: somewhat polished but needs full sandbox + customization + transparency.
- Logo files present but tab/favicon may need final polish to current design.
- Mainnet node on PC - backend ready but verify indexing works when pointed (no testnet assumptions in mainnet paths).
- Some cleanup done (no phases in some places), but ensure 100% professional, no KYC over-focus, no bypasses, wide options, best UX for paid.

**Requirements - Make the BEST possible 100% done version:**
- **Paywall 100% solid (no bypasses, server-verified, same-wallet only):**
  - All advanced access (CovexTerminal circuits/pro, PremiumBuilder/sandbox, custom UI) requires valid server auth token from POST /api/auth-session (after real payment to per-net treasury from the exact wallet address).
  - Token is one-time (consume on deploy via /auth-session/consume + mark_deployment_used).
  - Deploy capacity check (/deploy-capacity) before allowing covenant creation.
  - UI: if no valid token for current address+net, show prominent paywall with QR codes (kaspa:treasury?amount=XX&message=COVEX-TIER-XXX from the connected wallet), "pay from this wallet", "I paid - get token" that calls auth-session.
  - Free basic SilverScript (Deploy/CreateCovenant or basic mode in Terminal) always available, no paywall, no circuits.
  - On refresh after pay: if token valid and deployment not yet used, grant access.
  - Mainnet: real KAS warnings, real wallet only.
  - Backend enforces: signer/deploy only if valid unconsumed token + capacity (or for free basic).
- **Free Covenant Creation (plain, no special treatment):**
  - Clean SilverScript editor (text area + compile button).
  - "Write in SilverScript and if everything matches it can compile into a covenant for Kaspa".
  - Basic resolution (oracle or simple), no ZK circuits, no pro arenas.
  - Works identically on all 3 nets (mainnet uses real wallet for the lock tx).
  - No "free tier" labels or upsell spam - just the tool.
- **Paid/Advanced + Best UX (after server auth token):**
  - Full CovexTerminal + PremiumBuilder/sandbox.
  - Wide selection of implementations (hundreds of options): expand/refine ZK_CIRCUIT_TYPES in CovexTerminal (de-prioritize pure KYC/identity like age_verification - note "KYC/identity circuits are not primary for Kaspa covenants; focus on real use-cases").
    - Anticipate useful for Kaspa covenants: 
      - Games (p2p interactive): Chess (FIDE full), Poker (hand ranking + pot), Blackjack, Connect4, Checkers, TicTacToe, Reversi, Go (scoring), Backgammon, Battleship, Scrabble (words), Dominoes, Rummikub, Mancala, plus variations (e.g., chess with time controls, poker variants, multi-player modes).
      - Crypto primitives: Merkle membership (DAO voting, airdrops, whitelists), Range/collateral proofs, Schnorr signatures, Pedersen commitments, verifiable random (for fair resolution), hash preimage, etc.
      - DeFi/Financial: Verifiable yield/interest, membership for DAOs/treasuries, collateral sufficiency ranges, token-gated access, multi-sig thresholds (via merkle or custom).
      - Compute: Verifiable off-chain state transitions, custom predicates, RISC0/ general compute for complex logic (e.g., game AI, financial models).
      - Custom + variations: templates with parameters (e.g., "chess with 50-move rule disabled", "range with different bounds", "multi-player poker with side pots").
    - Create ~100+ by having base circuits + parameter variations + resolution modes (ZK proof, oracle attestation, multi-oracle consensus, timeout fallback, hybrid, committed random/VRF).
    - Sandbox for paid users: UI (in PremiumBuilder) to create custom circuit - select base primitive(s), set params (min/max, players, rules), describe resolution, generate custom SilverScript snippet + verifier config + UI theme suggestion. Allow "my custom" that users can name/describe. Store per-user (with auth token) or just generate on fly for their covenant. Make it easy/powerful for "best interactive covenant".
  - Customization for paid: name the covenant, full description, make it look however you want (colors/theme via inline config or Covenant Studio integration, layout, custom UI HTML/JS for arenas if applicable, logo integration). Provide all info transparently: in the covenant detail/terminal, disclose all wallets per network (dev1/dev2/treasury addresses + mnemonics where applicable for testnets; for mainnet show "real treasury from env - verify yourself", with warnings). Top visibility on Explorer (higher sort, glow, "PAID/VERIFIED" badge, featured section).
  - Best UX: after pay -> immediate auth token -> full sandbox/terminal. Step-by-step: choose circuit (or sandbox custom) -> customize name/desc/theme/wallets disclosure -> generate script + UI config -> deploy (consumes token, marks deployment used). Transparent: always show "This covenant uses [network] dev/treasury wallets: [list] - payments verified on-chain".
  - Pro features (arenas, oracles, custom UI builder) unlocked.
- **Professional UI / Polish (no junk):**
  - Remove ALL "Phase", "Phase 1 Fixed", placeholders, unnecessary disclaimers, "test only" notes, KYC-over-emphasis text.
  - PremiumBuilder: beautiful professional easy-to-use (cards for circuits with icons/visuals/hovers, sandbox tab for custom creation, customization panel for name/desc/theme, preview, transparent wallet disclosure section, generate + copy/deploy buttons). Integrate current logo. Wide options + sandbox = "hundreds of implementations".
  - All pages: consistent 3-net labels/colors (TN12 green, TN10 amber, MAIN red), minimal clear text, excellent visuals (use logo + theme), responsive, no gaps.
  - Logo on website tab: update favicon.svg, manifest.json, icon files, <title>Covex | 3-Network Covenant Platform</title>, nav/header to current glowing network C design. Professional everywhere.
  - Explorer: paid covenants top visibility (sort by tier + TVL, glow for paid, transparent wallet info in details).
  - Mainnet: clean "REAL KAS - PRODUCTION" only where needed, no clutter.
- **3 Networks 100% Separate + Mainnet PC Node:**
  - Full independence as specified (wallets/indexers/data/paid/treasuries per net).
  - Mainnet: real wallets only (enforce), PC node support - document "To index Toccata mainnet covenants from your PC node: set KASPA_NETWORK=mainnet KASPA_WRPC_URL_MAINNET=ws://<your-pc-ip>:<port> ...". Ensure indexer starts correctly for mainnet (correct prefixes, no testnet hardcodes).
- **Deploy + Verify 100%:**
  - Local edits + build.
  - Full Hetzner deploy (exact sequence, correct nginx root /root/htp/public, backend restart).
  - Live on hightable.pro: 3 nets work, selector clean, PremiumBuilder/sandbox beautiful + wide options + custom circuits + customization + transparency, paywall solid (QR, server auth, no bypass even on refresh), free basic editor plain, circuits only post-pay, logo on tab, no unprofessional text/gaps, top paid visibility, mainnet flows clean.
  - Specific tests: pay on mainnet (real wallet) -> get token -> access full sandbox/terminal -> create customized covenant with circuit (or custom) -> deploy (token consumed) -> appears with top visibility + full disclosure. Same for TN12/TN10 (separate dev wallets). Free editor always accessible without pay. Curls for auth endpoints, 3-net data, mainnet deploy error on dev. Journal shows per-net + mainnet indexer.
- **Update Prompts:**
  - At end: massive "COMPLETED BLOCK" in this file (date, final SHAs triple-sync local/GitHub/Hetzner, evidence: live curls/screenshots descriptions of polished PremiumBuilder + sandbox + QR paywall + customization + transparency + logo tab + 3 nets working, journal for auth/indexers/mainnet, proof no bypasses/phases/KYC-clutter, honest remaining like "full mainnet node space on Hetzner", "operator verifies PC wRPC for Toccata", "real mainnet treasury in env").
  - Pointers to previous masters.

**Strict Rules:**
- Small steps. Read with tools first (note versions/SHAs). After every ssh/build/restart: verify (builds clean, curls for 3 nets + auth + mainnet error on dev, journal per-net/auth, public dir, no errors, UI checks via description or tools).
- Preserve prior 3-net + auth + circuit expansion work 100%.
- Professional/best UX only: clean, visuals, easy, transparent, wide options via sandbox + expanded list.
- Free plain basic always; paid = full power + customization + top visibility.
- De-prioritize KYC: in circuit list/docs, note "KYC/identity circuits (e.g. pure age) are not primary for Kaspa covenants - focus on game/crypto/DeFi/compute that enable real interactive p2p experiences".
- Mainnet PC node: support + document for Toccata indexing.
- If length/truncation: stop, report exact state/output, continue.
- At end: identical on local/GitHub/Hetzner, everything 100% as specified, best possible.

**Begin with step 1 right now (local verification: git status, read previous master + key files above, inspect current PremiumBuilder/CovexTerminal circuits/auth gates, logo files, backend auth code, Hetzner ssh for state/nginx/root, etc.).**

You have the full foundation from prior runs. Make Covex the ultimate 3-network platform: pay once (server-verified), create the absolute best customizable interactive covenant with wide circuits + sandbox, full transparency on wallets per net, top visibility, professional everywhere, free basic always available, mainnet PC node ready. All 3 instances fully independent and 100% working. Execute flawlessly.

BEGIN.
