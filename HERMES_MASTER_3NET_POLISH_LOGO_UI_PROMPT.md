# HERMES_MASTER_3NET_POLISH_LOGO_UI_PROMPT.md
# Polish & Complete the 3-Network (TN12 + TN10 + MAINNET) Covex Experience
# Make it the BEST possible professional version: fully working on all 3 networks with SEPARATE nodes, indexers, wallets (dev hex/mnemonic for testnets, REAL wallet extensions ONLY for mainnet), mnemonics, data, paid tiers, everything.
# Clean up unprofessional UI (especially Premium Builder / Circuit Schema page - remove ALL "Phase" references, make super easy to use with excellent visuals).
# Integrate the current logo (use the one from the provided screenshot description / previous glowing network C logo - ensure favicon, tab title/icon, nav, everywhere professional).
# Ensure mainnet node correctly syncing/indexing with Toccata mainnet (support user's PC node via KASPA_WRPC_URL_MAINNET, make backend ready, no gaps).
# Remove all gaps, stupid clarifications, unnecessary messages, placeholder text on the website.
# Everything must look premium, clean, professional, easy, with great visuals.
# Follow previous master prompts (3NET_FULL etc.) - build on the completed 3-network foundation.
# Do local changes + full deploy to all 3 places (local, GitHub, Hetzner/hightable.pro) + verify live + update this prompt with new COMPLETED BLOCK + evidence.

**CRITICAL - READ IN ORDER (use tools, no skipping):**
1. This full prompt.
2. /home/kasparov/Covex27/HERMES_MASTER_3NET_FULL_PROMPT.md (the previous master with the COMPLETED BLOCK from last run - build on it, do not regress).
3. /home/kasparov/Covex27/README.md + deploy scripts (exact deploy sequence: git reset --hard, frontend build + copy to CORRECT nginx root /root/htp/public, backend cargo build --release, systemctl restart, health checks, curls for all 3 networks).
4. Key files for current state (read relevant sections):
   - frontend/src/pages/PremiumBuilder.jsx (the unprofessional "Premium Builder (Phase 1 Fixed)" + Circuit Schema stub - this is the main target for polish).
   - frontend/src/components/CovexTerminal.jsx (ZK_CIRCUIT_TYPES definition with Chess FIDE, Merkle, Range, Age, Verifiable Compute, Custom - use this for the nice UI).
   - frontend/src/App.jsx (global NetworkSwitcher - ensure 3 clean buttons with logo integration).
   - frontend/src/components/CovexTerminal.jsx (3-way network logic, netConfig, isMainnet guards - extend cleanliness).
   - frontend/src/components/WalletContext.jsx (per-network dev wallets for TN10/TN12, mainnet real-only blocks, network switch handling).
   - frontend/src/pages/Deploy.jsx, PaidDeploy.jsx, CreateCovenant.jsx, PaidBuilder.jsx, Pricing.jsx (ensure no dev on mainnet, clean labels, use dynamic network, integrate logo, remove unprofessional text).
   - frontend/public/ (logos: covex-logo-*.png, covex-logo.svg, favicon.svg, manifest.json - update favicon, title, icons to use the current logo from screenshot/previous glowing C design. Make tab professional).
   - backend/src/main.rs, signer.rs, dev_wallets.rs (3-network support, mainnet env-only, per-net indexers ready for Toccata mainnet).
   - Any other pages with "Phase", placeholders, unnecessary messages (search for them).
5. Git state, current deployed version on Hetzner, nginx root confirmation, current kaspad processes for all 3 (or readiness for mainnet).
6. Hetzner: ssh root@178.105.76.81 - df (space for mainnet node note), nginx config for public root, current covex-backend logs for network/indexer status.
7. Logo: Use the current logo (glowing network C style from previous attachment/screenshot 2026-06-05). Ensure it's on website tab (favicon, <title>, manifest, nav logo if not already perfect).
8. Mainnet Toccata sync: Ensure code/config allows correct indexing when pointing to operator's PC mainnet node (wRPC on Toccata mainnet). Update any logs/docs for "Toccata mainnet". Make sure when KASPA_NETWORK=mainnet the indexer uses correct mainnet params (no testnet assumptions).

**Current State (from previous successful runs - do not break):**
- 3-network selector working (TN12 green, TN10 amber, MAIN red) in nav + Terminal. Dispatches events, data isolated via ?network= and DB network column.
- Per-network dev wallets: TN12 and TN10 have independent persisted hex/mnemonic connections (separate localStorage). Mainnet: hard blocked everywhere (UI hidden, signer errors, modals show red "disabled" messages).
- Backend: dual/secondary indexers for testnets running. Mainnet paths ready (client_for_network, spawn logic, env for treasury/wrpc). DB filters per network.
- Many pages have isMainnet guards (CreateCovenant cleaned, Deploy/PaidDeploy hidden dev on mainnet).
- TDZ crash fixed, deploys to /root/htp/public confirmed.
- Logo files exist in public (use the best current one for tab/favicon).
- Unprofessional bits remain: PremiumBuilder.jsx is stub with "Phase 1 Fixed", placeholder text "(Full terminal UI restored...)", basic grid. Other pages may have leftover "Phase", "test only" notes, unnecessary clarifications.
- Mainnet node: on user's PC (Hetzner has space issues - 28GB free noted before, need 400GB+ for full node). Backend must be ready to index against it via remote wRPC for Toccata mainnet.

**Requirements - Make it the BEST PROFESSIONAL VERSION:**
- **Premium Builder / Circuit Schema page (top priority cleanup):** Remove "Phase 1 Fixed", all phase references, placeholder text. Make it SUPER EASY TO USE with VERY GOOD VISUALS (beautiful cards/grid for the circuits, icons, descriptions, hover effects, clear selection, preview, easy config for fee/reusable/etc. like in Terminal but polished standalone for paid). Use the exact circuits from ZK_CIRCUIT_TYPES / user list: Chess (FIDE - full rules), Merkle Membership, Range Proof, Age Verification, Verifiable Compute, Custom Circuit. Professional copy, no "unprofessional" notes. Integrate current logo in header or branding. Make it feel premium, modern, Kaspa-themed (use existing colors: #49EACB green, amber for TN10, red for mainnet). Easy flow: select circuit -> configure (if needed) -> generate covenant code or go to deploy flow, respecting current network.
- **3 Networks Fully Separate & Working:**
  - Separate wallet connections: dev (hex/mnemonic) only for TN12/TN10 (already independent - ensure no cross-talk, clean UI per net). For MAINNET: ONLY real Kaspa wallet extensions (KasWare etc.), no dev options, no hex/mnemonics anywhere.
  - Separate indexers/nodes: TN12 and TN10 indexers/crawlers/verifiers running on their wRPC (17217/17210). Mainnet indexer ready - when env KASPA_NETWORK=mainnet + KASPA_WRPC_URL_MAINNET=ws://<PC-IP>:port (Toccata mainnet), it starts correctly tagging `network="mainnet"`. No gaps in mainnet support (correct prefixes, treasuries from ENV only, no testnet assumptions).
  - Separate mnemonics/hex: per-network for testnets (as implemented). Mainnet: none.
  - Separate paid tiers/indexes/data: already via network filter - ensure clean, no mixing, correct treasury per net in all flows (Terminal, Deploy, signer, crawler).
  - UI adapts per network (labels, warnings, colors, dev availability) but core experience consistent and professional. No "stupid clarification or unnecessary messages".
- **Logo on Website Tab & Everywhere Professional:**
  - Use current logo (glowing network C from screenshot/previous - files like covex-logo-*.png or the attached style). Set as favicon (update favicon.svg, manifest.json, public icons). Tab title/icon professional (e.g. "Covex | 3-Network Covenant Platform" or per net if possible, but clean).
  - Integrate logo in nav (already partial), headers, PremiumBuilder, error states, etc. Make visuals excellent: consistent, high-quality, no placeholders.
- **Clean Professional Website:**
  - Remove ALL "Phase", "Phase 1 Fixed", placeholder comments like "(Full terminal...)", "test only" notes that are unprofessional, unnecessary warnings/clarifications.
  - No gaps: all 3 networks fully functional in UI/flows (selector, data, deploys, stakes in games if applicable, paid tiers).
  - Super easy to use: intuitive flows, good defaults, clear but minimal text, excellent visuals (cards, gradients matching theme, responsive, smooth).
  - Mainnet Toccata sync: ensure when mainnet selected, everything points to real mainnet (addresses start with kaspa:, correct wRPC handling, indexer logs mention "Toccata mainnet" if possible). Support user's PC node seamlessly.
  - Best possible: premium feel, fully works, separate per network as specified.
- **Deploy & Verify:**
  - Local changes, build, commit, push.
  - Full Hetzner deploy (exact sequence from README, copy to /root/htp/public, restart backend, verify no errors).
  - Live on hightable.pro: 3 networks work, selector clean, PremiumBuilder professional and easy, logo on tab, no unprofessional text, mainnet flows clean (real wallet only).
  - Test: toggle networks, see separation (dev available only on testnets independently, mainnet blocked), data per net, clean UI.
- **Update Master Prompt:**
  - At end, append/update this file with new "COMPLETED BLOCK" (date, SHAs triple-sync, evidence: screenshots/descriptions of PremiumBuilder clean UI + 3-selector + logo tab, curls for 3 nets, journal for indexers including mainnet readiness, proof no phases/unnecessary messages, mainnet node note, honest remaining like space for full mainnet node on Hetzner).
  - Also update previous masters (3NET_FULL etc.) with pointers if needed.

**Strict Rules:**
- Read files first, use tools, small incremental changes (avoid huge diffs that truncate).
- Preserve all previous 3-network work (per-net dev, guards, indexers, selector).
- No dev on mainnet ever.
- Professional only: clean copy, great visuals, easy UX.
- Verify after every build/deploy (curls, journal, browser if possible via tools, no error boundaries).
- Mainnet: correctly handle Toccata mainnet (prefixes, envs, indexer).
- If space issues on Hetzner for mainnet node, note it (don't force start full node).
- Update prompt last with full evidence.
- YOLO but careful - test builds, no breaking changes.

**Begin with step 1: Local reads, audit current PremiumBuilder and logo files, git state.**

You know the drill from previous runs. Make Covex the best 3-network professional platform. Everything separate per network, beautiful UI, logo perfect on tab, no junk text, fully working.

BEGIN.
