# HERMES_BEST_POSSIBLE_FINAL_VERSION_PROMPT.md
# Fresh canonical master prompt for the absolute best possible version of Covex.
# This is the new starting point for a fresh Hermes run. It incorporates EVERYTHING achieved so far across the entire history (3-network isolation, server-auth paywall with one-pay-one-deploy, expanded Kaspa covenant circuits, PremiumBuilder Covenant Studio with sandbox + customization + full transparent disclosure, top visibility for paid covenants, plain free SilverScript path, professional polish, triple-sync deploys).
#
# Goal: Take the current excellent foundation (as of commit 71911aa + the ULTIMATE_100 sandbox work) and make Covex the single best, most professional, most powerful, and most delightful 3-network (TN12 + TN10 + Mainnet on the exact same website) covenant platform possible. Every paid user who completes a server-verified on-chain payment from their connected wallet must get an experience that feels premium, powerful, transparent, and fun — they can name their covenant, make it look however they want, compose powerful custom circuits in the sandbox using real Kaspa-relevant primitives (games with actual per-turn timers, ownership/script/timelock proofs, collateral, DAO logic, verifiable compute, VRF/hybrid resolution), see every participating wallet disclosed clearly, and have their creation automatically receive top visibility + a "PAID VERIFIED" badge everywhere.
#
# Free users always have a clean, beautiful, no-friction plain SilverScript editor with zero special treatment, no upsells, and no circuits.
#
# The result after this run must be 100% complete, consistent, and identical across all three places (your local tree, GitHub THTProtocol/Covex27, and Hetzner/hightable.pro).

**CRITICAL — READ THESE IN ORDER (use tools, document what you read, no shortcuts):**
1. This entire prompt.
2. /home/kasparov/Covex27/HERMES_ULTIMATE_100_COMPLETE_SANDBOX_KASPA_CIRCUITS_PROMPT.md (the immediate predecessor — it already contains the detailed vision, the verbatim user request about KYC not being needed, the sandbox spec, the disclosure + top visibility rules, and its own COMPLETED BLOCK with evidence from the 71911aa studio work). Build exactly on top of it; do not regress any of the auth, sandbox, or circuit decisions.
3. The current best code state: first `git status`, `git log --oneline -5`, and `git rev-parse --short HEAD` both locally in Covex27 and via ssh on Hetzner. Then read the key files listed below (use read_file with sensible limits + grep for specific patterns). Note exact line numbers for important logic.
4. /home/kasparov/Covex27/README.md + any DEPLOY* or start-*.sh scripts (exact current deploy sequence, correct nginx root, build commands, restart, verification curls).
5. Key source files (read substantial relevant sections, especially auth flows, 3-net logic, circuit registry, free vs paid paths, metadata storage, UI polish):
   - frontend/src/pages/PremiumBuilder.jsx (the current Covenant Studio — sandbox composer, auth gate, disclosure banner, theme/look, generate + consume flow. This is the heart of the "best UX once paid". Make it even more delightful and fully wired to real covenant creation + metadata).
   - frontend/src/components/CovexTerminal.jsx (ZK_CIRCUIT_TYPES source of truth — 77+ entries with Kaspa focus, ownership category, game timer language, de-prioritized KYC. The hasPaidAccess + authToken gate from the security run. Timer/payout logic for games. Script generation for both free basic and paid advanced).
   - frontend/src/pages/Explorer.jsx (current paid-first sorting, tier badges, stats. Enhance so paid covenants with rich disclosure metadata are unmistakably top visibility + show the full transparent wallet list).
   - frontend/src/pages/PaidBuilder.jsx, Pricing.jsx, CovenantInteractive.jsx, Deploy.jsx, CreateCovenant.jsx (reference implementations of clean server-auth, QR flows, plain free editor, no localStorage paid shortcuts).
   - frontend/src/App.jsx + components/WalletContext.jsx + DevWalletModal.jsx (3-net selector, per-net dev wallets only on testnets, mainnet real-only blocks).
   - frontend/public/ (favicon, manifest, icons, title — ensure the current glowing network C logo is perfect on the browser tab and everywhere professional).
   - backend/src/main.rs + db.rs (auth-session handlers, create/validate/consume_auth_token, can_deploy/mark_deployment_used, get_highest_paid_tier_for_address, covenant insert + terminal-config. Add or extend storage for rich covenant metadata: disclosed_wallets JSON, paid_proof/token_hash, custom_circuit_def, theme, resolution_mode, etc. so transparency and top visibility are permanent and queryable).
   - backend/src/payment_verifier.rs, crawler.rs, indexer.rs, dev_wallets.rs, signer.rs (per-net everything, mainnet real-only, treasury matching from the exact paying address).
   - Any files still containing old localStorage covex_paid_tier writes or "Phase" text (clean them ruthlessly).
6. Live state on hightable.pro and Hetzner: curl the health + auth endpoints for all 3 networks, check current public assets for studio text, journalctl for the backend (per-net indexers + auth activity), df (space reality), nginx config (confirm root), systemctl status.
7. GitHub state via API or notes: current HEAD on THTProtocol/Covex27 master.
8. Previous COMPLETED BLOCKs in the ULTIMATE prompt and any other recent HERMES_MASTER_* files for exact current feature status (auth tokens, 71911aa studio, circuit expansion, 3-net, free vs paid separation).

**Current Excellent Foundation (71911aa + prior security work — treat as 95%+ done. Preserve and polish, do not rewrite from scratch):**
- Server-side auth tokens + one-pay-one-deploy fully working (auth_tokens table with used_for_deploy, accounts deployments_used/max_deployments, POST /api/auth-session returns {token, tier} only for addresses with verified on-chain payment on that exact network, consume endpoint, deploy-capacity check, token required in memory for PremiumBuilder / CovexTerminal advanced features).
- ZK_CIRCUIT_TYPES expanded to 77+ entries with strong Kaspa covenant focus (32 games with real timer language, 8 ownership/script/timelock, excellent crypto primitives, defi/collateral, compute; KYC/identity reduced to 2 entries in "other" with explicit note).
- PremiumBuilder completely rewritten as "Covenant Studio": server auth only, full library grid, powerful sandbox composer (multi-primitive + params for players/timer/collateral/payout/resolution), covenant name + description, live theme/look preview, always-visible transparent "ALL WALLETS DISCLOSED" section (creator + per-net treasury with mainnet warnings), "Create & Deploy" that calls consume.
- Explorer has paid-first sorting + tier awareness; recent enhancements for PAID VERIFIED badges + disclosure hints.
- Free basic path (Deploy/CreateCovenant + basic Terminal mode) is plain SilverScript editor.
- Full 3-network isolation on one codebase/site (independent indexers/crawlers/verifiers, net-specific treasuries in disclosure, dev wallets only for TN12/TN10 with separate storage, mainnet real wallet extensions only + hard blocks in UI/signer).
- Professional elements in place (logo usage, 3-button selector with colors, no major phases left in core flows).
- Triple-sync deploy process proven (reset, frontend build + cp to /root/htp/public, backend build, restart on 3006, health + auth curls, journal checks).
- Mainnet PC node (Toccata) indexing infrastructure ready via env vars (no full mainnet node on Hetzner volume).

**What "the best possible version" requires in this run (push the last 5-10% to excellence):**
- **Rich covenant metadata persistence (the missing piece for true top visibility + permanent transparency)**: When a paid user creates via the Studio (or advanced Terminal), the full def (name, description, chosen/custom circuit, theme, disclosedWallets array with roles + addresses, resolution, paid proof) must be stored with the covenant record (extend terminal-config or covenant insert to accept + persist extra JSON fields). Explorer, covenant detail views, and Terminal must render the full "Transparent Wallets" section and "PAID VERIFIED • TOP VISIBILITY" treatment for any covenant that has this metadata (or whose creator had a verified tier at creation time). Paid covenants must visibly dominate lists and feel special.
- **Sandbox produces real, delightful, deployable covenants**: Improve the composer output to generate high-quality, usable SilverScript (or advanced config) snippets that actually incorporate the chosen primitives, timer rules, payout math, and resolution. Allow users to "Save Custom Circuit" (tied to their auth session/address) for reuse. Make the "Create & Deploy" flow from PremiumBuilder create a real covenant (or hand off cleanly to the protected deploy path) and consume the token/credit.
- **Game experiences with real timers feel alive (especially in CovexTerminal for paid users)**: For game circuits (chess, poker, etc.), ensure per-turn timer logic (only decrement the active player), red <30s styling, zero triggers auto-resolve + outcome submission, and clean integration with oracle/payout computation. The "SUBMIT TO ORACLE" / "PAYOUT COMPUTED" / "CLAIM" flow should feel complete and exciting.
- **Free path is beautiful and clearly the simple powerful option**: Make the plain SilverScript editor in Deploy/CreateCovenant the best possible basic experience (great examples, syntax hints, clear "this compiles to a real Kaspa covenant if valid", no clutter). It must feel intentional and excellent on its own — not like a crippled version.
- **Absolute professional polish everywhere**: Current glowing network C logo perfect on browser tab (favicon, manifest, title="Covex | 3-Network Covenant Platform"), headers, paywall, studio, error states. Zero "Phase", zero leftover placeholders, zero unnecessary messages, zero KYC over-emphasis. Consistent 3-net labeling. Mainnet surfaces have clean "REAL KAS — PRODUCTION" treatment only where genuinely needed. Empty states and loading states are calm and helpful.
- **3 networks remain perfectly isolated and mainnet PC node ready**: Every new feature (metadata, sandbox, disclosure) must respect network. Test and document pointing the mainnet indexer at the operator's local Toccata node. Hetzner space reality respected.
- **End-to-end paid user journey on live hightable.pro is magical**: Connect wallet → pay (QR from correct per-net treasury) → server gives token → land in Studio → use library or sandbox to compose → name it, describe it, pick theme → see full wallet disclosure → Create & Deploy (token consumed, credit used) → the covenant appears in Explorer at the very top with badge + full disclosure visible → open in Terminal and see the rich info. Same journey works independently and correctly on TN12, TN10, and mainnet (real wallet only). Free path always available without paying.
- **No regressions**: Preserve the working server auth (token creation only after real payment, consume on first deploy, capacity check), the 77+ circuit list with Kaspa focus, the existing sandbox UI, the disclosure banner, 3-net behavior, free basic path, and all prior polish.

**Strict Rules (non-negotiable — this is how previous successful runs stayed on track):**
- Small steps only. Read with tools first (note versions, SHAs, exact line numbers). After every meaningful edit + after every remote build/restart/deploy: verify with output (cargo check / npm run build success, specific curls for health + auth + deploy-capacity on all 3 nets, journal snippets, ls of public dir, git status, visual description of what the live UI would show for free vs paid on each net).
- Never assume state — always confirm with fresh tool output.
- Preserve 100% of the server-auth one-pay-one-deploy model and per-network isolation.
- If a file is long, read sections, edit surgically, verify.
- On Hetzner deploys: always confirm the nginx root first, use the exact proven sequence, restart, then immediately run the verification curls from both inside the box and externally.
- At the absolute end: the three places must be consistent. Append a massive "COMPLETED BLOCK" (with date, final triple-sync SHAs, live curl evidence, descriptions of the improved studio + metadata + timers + free path + disclosure + top visibility, journal highlights, honest remaining items like "full mainnet node space on Hetzner", "operator PC wRPC details for Toccata") to this prompt file. Also append short update notes + pointers to the previous ULTIMATE and FINAL_100 prompt files.

**Deploy + Live Verification Checklist (do this for every significant state, and fully at the end):**
- Local: edit → build/check → quick test.
- Hetzner (via ssh): git reset --hard origin/master (or pull the latest good SHA), verify files, frontend build + copy to the confirmed nginx root (/root/htp/public), backend build, systemctl restart covex-backend, journal + ss + health.
- External curls from here: health, POST auth-session for known paying addresses on all 3 networks (expect token only on the network where payment exists), deploy-capacity, consume.
- Live hightable.pro browser/UX verification (describe or note exact behavior):
  - No wallet or unpaid wallet on any net: Deploy/CreateCovenant shows beautiful plain SilverScript editor only.
  - After payment on a net: PremiumBuilder Studio loads with full sandbox + library + name/desc/theme + disclosure banner. Creating consumes the credit.
  - Paid covenants appear at the top of Explorer with badge and disclosure info.
  - 3-net selector works everywhere; data, treasuries, and wallet rules are isolated.
  - Mainnet: real wallet only, correct treasury in disclosure.
  - Logo/tab is correct and professional.
- Git: commit with clear message referencing this prompt, push, confirm SHA matches on GitHub and (after reset+build) on Hetzner.
- Finally update this prompt file (and note the prior masters) with the COMPLETED BLOCK.

**Begin right now with step 1** (local git status + reading the ULTIMATE prompt + the key files above, especially current PremiumBuilder, CovexTerminal circuits + timer logic, Explorer list rendering + metadata usage, backend covenant insert paths, and Hetzner live state via ssh + curls).

You have an outstanding foundation (server paywall that actually works, huge relevant circuit library, a real sandbox + customization + disclosure UI, 3-net isolation, proven deploy process). Now finish the vision: make the paid experience feel truly premium and transparent with persistent metadata, make the games with timers exciting and correct, keep the free path elegantly simple and powerful, deliver perfect professional quality, and achieve full identical triple-sync on all three places with fresh evidence in the prompt.

Make this the best possible version.

BEGIN.