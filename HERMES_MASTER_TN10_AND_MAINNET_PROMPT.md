# HERMES_MASTER_TN10_AND_MAINNET_PROMPT.md
# Master prompt for full multi-network support: TN12 (unchanged) + TN10 fork + Mainnet architecture fully ready on the SAME website.
# User can choose any of the three. Data, wallets, indexers, everything fully isolated per network.
# Do as much local code work as possible, then run Hetzner nodes (with space guards), test everything, deploy to all 3 places, update this prompt.

**CRITICAL — READ FIRST (tools, exact order):**
1. This entire prompt.
2. /home/kasparov/Covex27/README.md (updated network section).
3. /home/kasparov/Covex27/deploy/start-tn10-kaspad.sh (space guard example).
4. /home/kasparov/Covex27/deploy/start-mainnet-kaspad.sh (strict 400GB+ space guard for mainnet).
5. Key files:
   - frontend/src/components/CovexTerminal.jsx (3-way toggle + netConfig + mainnet banner + network in payloads).
   - frontend/src/components/WalletContext.jsx (supports testnet-10 + mainnet).
   - backend/src/dev_wallets.rs (per-network via wallet_identities_for_network + mainnet dummies + strong warnings).
   - backend/src/main.rs (KASPA_NETWORK, treasury branching, multi-client ready).
   - backend/src/db.rs + indexer.rs + crawler.rs (add/use 'network' column, per-net indexers).
   - deploy/ scripts.
6. Git state + SHAs (local, GitHub, Hetzner after pull).
7. Hetzner: ssh root@178.105.76.81 — run df, start scripts ONLY after space confirmed.

**Current State (previous work to build on, do not regress TN12):**
- 3-way network chooser in Terminal (TN12 / TN10 / MAINNET) with strong red warning for mainnet.
- netConfig helper that returns per-network treasury/seeds/warning.
- WalletContext supports the networks.
- start-tn10-kaspad.sh with 80GB+ space check.
- start-mainnet-kaspad.sh with 400GB+ space check (mainnet is heavy).
- dev_wallets has per-network support (TN10 placeholders, mainnet explicit "ENV REQUIRED" dummies).
- Some backend mainnet branching already existed (treasury, status).
- Only the master prompt files remain after cleanups.
- TN12 must stay 100% identical in behavior and data.

**Goal (user request context):**
Extend the TN10 "same website chooser + separate everything" to also make full mainnet support ready in indexers, fetchers (crawler), signer, DB, frontend, scripts, etc.
- When user selects MAINNET in the toggle: everything adapts (wallets/mnemonics/hex, treasury, seeds, RPC, indexer data, covenant storage, displayed values, terminal configs) — pure mainnet.
- TN12 and TN10 remain completely untouched.
- Hetzner: run mainnet kaspad only after confirming enough space (use the script).
- Full testing of the chooser for all 3 networks.
- "do as much as possible" locally, then give/execute via this prompt for the rest (nodes, full wiring, deploy, test).

**Strict Rules:**
- Same single website/codebase.
- Chooser (toggle) drives full adaptation per network.
- Separate data (use 'network' column or equivalent — no mixing).
- For mainnet: extreme warnings, real funds only, no test keys ever used.
- Space guard on Hetzner for all nodes (TN10 80GB+, mainnet 400GB+).
- All secrets (mainnet especially) via env vars only.
- Preserve TN12 perfection exactly.
- After: commit/push, full deploy (exact sequence), live verification on hightable.pro that chooser works for all 3 and networks are isolated.
- Update this prompt with completion, SHAs, evidence.

**Mainnet Technical Notes:**
- Network: "mainnet" or "mainnet-1"
- Standard ports: p2p 16111, gRPC 16110, borsh 17110.
- wRPC URL typically ws://your-mainnet-node:17110
- Treasury: real mainnet address via COVENANT_TREASURY_ADDRESS env (the code already branches for it).
- Dev wallets: must be real secure mainnet ones via env — never the dummies.
- Disk: mainnet + utxoindex is large; the starter script enforces 400GB+.
- Indexer/crawler: use high enough start DAA for current mainnet tip.
- Warnings in UI already strong — enhance if needed.

**Step-by-Step (follow exactly):**

1. **Audit & baseline**
   - Confirm 3-way toggle works, mainnet shows red banner + warning.
   - Confirm netConfig in Terminal.
   - Confirm start scripts for tn10 and mainnet exist with space checks.
   - Pull repos.
   - Verify TN12 still perfect.

2. **Hetzner nodes (space first!)**
   - ssh root@178.105.76.81
   - For TN10: df -h ; if <80GB free on data volume → STOP, report, do not start.
     Only if OK: cd /root/Covex27 && ./deploy/start-tn10-kaspad.sh ; verify running, note port (e.g. 17210).
   - For Mainnet: df -h ; if <400GB free → STOP, report "mainnet needs serious volume".
     Only if OK: cd /root/Covex27 && ./deploy/start-mainnet-kaspad.sh ; verify, note borsh port (typically 17110).
   - Set up env for backend: KASPA_WRPC_URL_TN10=..., KASPA_WRPC_URL_MAINNET=...
   - Optionally systemd for both extra nodes.
   - Confirm both nodes syncing their respective networks.

3. **Backend — full multi-network (clients, DB, indexers, signer per net)**
   - Ensure dev_wallets.rs has the per-network function with mainnet dummies + warnings (already partially done).
   - main.rs: load per-network configs from env (KASPA_WRPC_URL_TN10, _MAINNET, etc.). Create map of clients. Start background indexers/crawlers for each supported network (use the network param).
   - DB: add 'network' TEXT column to covenants (and other tables if needed). Default old rows to 'testnet-12'. Update all insert/select in db.rs, indexer, crawler, handlers to scope by network.
   - Handlers: accept ?network=... (or from config), use correct client/treasury/seeds for that network. Default 'testnet-12'.
   - Signer: use wallet_identities_for_network(network) to pick correct keys.
   - Rebuild. Test locally that you can query different networks independently.

4. **Frontend — make the chooser fully drive adaptation**
   - The toggle + netConfig is there — ensure all pro game sections (chess, poker, bj, checkers, connect4, etc.) display and use netConfig.treasury / seeds when generating configs or showing "current treasury".
   - Include `network: kaspaNetwork` in all terminal-config, oracle submit, stake, claim payloads.
   - Explorer / covenants list: pass network filter, only show matching network's data.
   - When mainnet chosen: the strong banner is shown; pro sections should note "REAL KAS".
   - Wallet: when mainnet selected, it should ideally warn or use mainnet (the connector supports it).
   - Make sure switching networks feels like separate instances (different addresses shown/used, different covenants).

5. **Scripts & deploy**
   - Update start-covex-backend.sh or create variants that set the right KASPA_NETWORK and WRPC for the chosen net.
   - Enhance deploy scripts to support deploying for specific network.
   - The space guard scripts are there — use them.

6. **Local build + exhaustive testing (all 3 networks)**
   - npm run build + cargo check — clean.
   - Test chooser:
     - TN12: exact previous behavior, TN12 addresses, TN12 data.
     - TN10: switches to TN10 values, separate data.
     - Mainnet: shows red banner, uses mainnet treasury placeholder (or env), warns heavily, no test keys used.
   - Create covenant in each mode → saved with correct network.
   - Switch modes → only that network's covenants appear.
   - Test oracle submit, claim, full arena flow in each (use demo where needed).
   - If local nodes available, test indexer actually fetches for the selected network only.

7. **Commit, push, full deploy**
   - Clear commit referencing this prompt + "TN10 + Mainnet full architecture ready".
   - Push Covex27 (and Studio if templates updated).
   - Full Hetzner deploy (exact from DEPLOY_TO_HIGHTABLE.sh / README): reset, build frontend, cp dist, backend if changed, restart, health.
   - Ensure the two extra nodes (tn10 + mainnet) are running after space was confirmed.

8. **Live verification on hightable.pro (document everything)**
   - Chooser works for all 3.
   - TN12: unchanged from before this whole effort.
   - TN10: uses TN10 addresses/wallets, its own covenants.
   - Mainnet: banner + warnings, mainnet treasury (from env), separate.
   - Create/test covenants in each mode → correct network tag, no cross-contamination.
   - Nodes up (confirm via ssh).
   - Space checks would have prevented start if low.
   - Full flows (arenas, submit, claim with pot return) work in test modes; mainnet shows warnings.
   - No breakage, clean branding, etc.

9. **Update prompts & docs**
   - Append to this file (and the other master if exists):
     COMPLETED: <date>
     Covex27 SHA: <final>
     Hetzner: TN10 node running (port, space at start: XXX GB), Mainnet node running (port, space: YYY GB)
     Testing: (key evidence — toggle screenshots/descriptions, example covenants per network, no mixing)
     TN12: confirmed untouched.
     Mainnet readiness: indexers/fetchers/arch fully network-aware and ready (with warnings).
     Honest limitations (e.g. "mainnet dev wallets must be supplied by operator via env", "mainnet node disk requirements high", "real mainnet use only after keys + hardfork").
   - Update README with the 3-network support.
   - Clean bloat.

**Success criteria:**
User goes to the site, picks TN12 → exact old experience.
Picks TN10 → full TN10 fork experience (addresses, data, node).
Picks MAINNET → full warnings, mainnet-adapted (treasury from env, etc.), architecture ready, separate data.
All indexers/fetchers respect the choice. Hetzner has the nodes running after space confirmed. Everything tested. TN12 never regressed.

**Start now.** Read files. Confirm space on Hetzner before starting any extra node. Wire the remaining backend/frontend details for mainnet (same as TN10). Test the full chooser. Deploy. Verify live. Update this prompt with full proof.

BEGIN.
