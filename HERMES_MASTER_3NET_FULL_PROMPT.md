# HERMES_MASTER_3NET_FULL_PROMPT.md
# Complete 3-Network (TN12 + TN10 + MAINNET) support for Covex on the SAME website.
# Goal: Each of the 3 networks must have its own independent "instance" of wallet connections, dev tools (where allowed), data/indexing, and paid-tier mechanics.
# - TN12 and TN10: full dev support via hex OR mnemonic (separate persisted connections per network).
# - MAINNET: ONLY real Kaspa wallet extensions (KasWare etc.). ZERO hex/mnemonic/dev mode anywhere. Strong red warnings + blocks.
# - Data completely isolated per network (already using `network` column + `?network=` filters + per-net background tasks).
# - One clean 3-way selector (nav + Terminal) that makes everything adapt instantly.
# - Mainnet node is currently syncing on the operator's local PC (not Hetzner). Make the code/config ready so pointing any backend at the PC's wRPC starts indexing mainnet covenants tagged `network="mainnet"`.
# - Fix the "netPrefix is not defined" crash + any remaining leaks.
# - Full deploy + live verification on hightable.pro for all 3 networks.
# - At the end: update this prompt (and the other master prompts) with a detailed COMPLETED BLOCK + evidence.
# Follow exact read-first + small-step + verify-after-every-ssh/build discipline.

**CRITICAL — READ THESE FIRST (in this exact order, using tools):**
1. This entire prompt.
2. /home/kasparov/Covex27/README.md (deploy sequence, network support notes, correct public dir for hightable.pro — history shows it has been /root/htp/public or /var/www/hightable.pro; check nginx config on Hetzner).
3. Latest master prompts: HERMES_MASTER_MAINNET_3NET_PROMPT.md, HERMES_MASTER_TN10_DUAL_NETWORK_PROMPT.md, HERMES_TN10_DUAL_WIRING_FIX_PROMPT.md (they contain the state from previous runs).
4. Key source files (read the relevant sections for the 3-network logic):
   - frontend/src/App.jsx (global NetworkSwitcher — must render 3 buttons: TN12 green, TN10 amber, MAIN red; dispatches 'kaspa-network-change').
   - frontend/src/components/CovexTerminal.jsx (kaspaNetwork state + listener for global event, isTN10/isMainnet, netConfig, 3 buttons at the bottom, network sent in every payload, mainnet red banner + conditional dev UI).
   - frontend/src/components/WalletContext.jsx (appNetwork, per-network dev storage via getDevStorageKey + separate load/save for TN10 vs TN12, mainnet hard-block in connectDevMode, DevConnectPanelBase that hides form on mainnet, disconnect of real wallets on network switch, DevConnectPanel + mnemonicPanel exposed with network prop, KasFlowProvider network config).
   - frontend/src/components/DevWalletModal.jsx (own network state synced via listener, early return + clear message on mainnet, guard in handleDerive, no dev form on mainnet).
   - frontend/src/pages/Deploy.jsx, PaidDeploy.jsx, PaidBuilder.jsx, Pricing.jsx (dev wallet buttons/sections must be hidden or disabled on mainnet; use current net for labels).
   - backend/src/signer.rs (client_for_network supports mainnet; hard reject use_dev_mode when network is mainnet with clear security message).
   - backend/src/dev_wallets.rs (mainnet section must remain strict "ENV REQUIRED ONLY" dummies; never real keys; wallet_identities_for_network + treasury_address_for_network).
   - backend/src/main.rs (KASPA_NETWORK handling, secondary client/spawn logic for "the other" net(s), treasury from env on mainnet, covenants route + handlers pass network filter).
   - backend/src/db.rs (network column + all get_* and insert respect the filter; migration already done).
   - deploy/start-mainnet-kaspad.sh (400GB+ guard — review only; do not start on Hetzner unless operator says the volume is ready).
5. Git state on your machine + origin + what is currently deployed on Hetzner (ssh + git log, df, ps for kaspads, journalctl for covex-backend, current public dir contents).
6. Hetzner server details: ssh root@178.105.76.81 and inspect nginx sites-enabled for the exact root serving hightable.pro, current covex-backend service, existing kaspad processes/ports/data dirs.
7. Operator's PC mainnet node (you will need the borsh/wRPC address + port once the user provides it for testing remote indexing).

**Current State (as of the most recent local fixes):**
- Global 3-button nav NetworkSwitcher exists and dispatches events.
- Terminal has full 3-way (TN12/TN10/MAINNET) with event sync, per-net netConfig, strong mainnet banner, and conditional dev UI.
- Wallet connections: dev (hex/mnemonic) now stored/loaded per-network for TN10 vs TN12 (separate localStorage keys + load on toggle). Mainnet hard-blocks dev connect in both WalletContext and DevWalletModal (early return + disabled form + clear messages).
- On network switch: real extension wallets are disconnected so the user must re-connect while the chosen network is active (gives each network its own connection instance).
- Backend already supports 3 networks via the `network` field in payloads/queries + primary + secondary indexer/crawler/payment_verifier tasks. Signer uses on-demand client_for_network. DB filters everything.
- The "netPrefix is not defined" crash (from incorrect dep in useCallback) has been fixed.
- Mainnet node is on the operator's PC — not yet on Hetzner.
- Paid tiers: each network uses its own treasury (from netConfig or env for mainnet) + the per-network crawler/verifier.
- Data isolation: all lists, deploys, claims, etc. respect the selected network. No mixing.

**Gaps that may still exist (your job to close 100% and verify):**
- The served bundle on hightable.pro may be stale (wrong nginx root copy is a recurring problem in history — always verify the exact dir nginx is serving and copy to it).
- Some pages (Deploy, PaidDeploy, PaidBuilder, Pricing, CreateCovenant, etc.) may still show "Connect Dev Wallet" buttons or dev sections on mainnet — hide/disable them everywhere and show appropriate messaging.
- The KasFlow real-wallet provider is initialized at mount time with the network at load; after toggle + disconnect, re-connect must work cleanly for the new network.
- Mainnet indexing readiness: code must be trivial to point at the operator's PC node (or future synced mainnet node) via KASPA_WRPC_URL_MAINNET + KASPA_NETWORK=mainnet (or equivalent) and have a dedicated indexer/crawler start tagging `network="mainnet"`.
- No dev leaks on mainnet in any flow (stakes in pro games/arenas, paid deploy, etc.).
- The 3-way selector must be obvious, reactive everywhere, and persist.
- Full end-to-end test: toggle each network, see correct dev (or lack of) options, correct data, correct treasury in Terminal, correct network in all POSTs, successful dev connect on TN12 and TN10 (independent), complete block on mainnet.

**Strict Rules (non-negotiable):**
- Same single website + codebase. The 3-way selector (nav pill + Terminal buttons) is the only way to choose.
- TN12 and TN10 get full, independent dev hex + mnemonic support (separate persisted connections).
- Mainnet: real wallets only. No hex, no mnemonic, no dev mode, no dev treasury in UI. All value is real KAS.
- Each network has its own "instance" of: wallet connection story, dev tools (where allowed), data (covenants, terminal-config, payments), and paid-tier verification (correct treasury + per-net background tasks).
- Look of the page is mostly the same, but adapt UI differences (warnings, labels, hidden sections, colors) per network.
- Mainnet node on operator PC: support remote wRPC for indexing. Do not start a mainnet kaspad on Hetzner unless the operator explicitly confirms 400GB+ free on the volume and wants it.
- Use only the guarded start scripts where applicable.
- Triple-sync at the end: your local tree, github.com/THTProtocol/Covex27, and Hetzner (hightable.pro) must all be on the same commit with everything working.
- Update this prompt file + the other master prompts with a big "COMPLETED BLOCK" containing exact SHAs (local, github, Hetzner after reset), live evidence (curls for all 3 networks on https://hightable.pro, description/screenshot of the 3-button selector, journal lines showing per-net indexers, proof that mainnet has no dev connect UI or backend path, a note about the PC node integration), and honest remaining items.
- Small steps only. After every significant ssh, build, restart, or test command, re-run verification (curls, journal tail, ls of public dir, git log) and include the key output in your reply.
- If length truncation happens, stop cleanly, report what you accomplished + the exact next command/output, and continue in the follow-up message.
- Never regress TN12 or TN10 behavior.

**Technical Details You Must Use:**
- Network values: 'testnet-12', 'testnet-10', 'mainnet' (accept 'mainnet-1' as alias).
- Prefixes: 'kaspatest:' for testnets, 'kaspa:' for mainnet.
- Dev storage keys: use `getDevStorageKey(net)` pattern (covex_dev_wallet_<safe-net>).
- Backend envs for mainnet: COVENANT_TREASURY_ADDRESS (real mainnet one), KASPA_WRPC_URL_MAINNET, KASPA_NETWORK=mainnet.
- Deploy sequence must be exact (git reset --hard origin/master, cd frontend && npm ci && npm run build, copy dist/* to the *correct* nginx root — verify first, cd backend && cargo build --release, systemctl restart covex-backend, sleep, check journal + health + curls for all 3 networks).
- On mainnet the signer must return the security error for any use_dev_mode attempt.
- The global switcher + Terminal must stay in sync via the 'kaspa-network-change' event.

**Step-by-Step Execution (follow in order, small & verifiable):**

1. Local verification & audit (run on the operator machine).
   cd /home/kasparov/Covex27
   git status --short && git log -1 --oneline
   cat frontend/src/App.jsx | grep -A 40 "function NetworkSwitcher"
   grep -n "getDevStorageKey\|isMainnet\|connectDevMode\|MAINNET" frontend/src/components/WalletContext.jsx | head -20
   grep -n "isMainnet\|MAINNET\|return.*mainnet" frontend/src/components/DevWalletModal.jsx | head -10
   grep -n "use_dev_mode\|mainnet" backend/src/signer.rs | head -10
   npm run build 2>&1 | tail -5
   (Must succeed with no new errors.)

2. Ensure the 3-way global selector is complete and visible.
   - Confirm App.jsx renders exactly 3 buttons with correct colors and dispatches the event on change.
   - If the served version on hightable is stale later, you will fix the copy target.

3. Verify & harden per-network dev + mainnet blocks (use the code that is already in the tree from the recent fixes).
   - Confirm WalletContext uses per-net storage keys + loads the correct dev wallet when appNetwork changes + blocks + disconnects real wallets on switch.
   - Confirm DevWalletModal has the early return + guard for mainnet.
   - Confirm DevConnectPanelBase hides the entire form on isMainnet and shows only warnings.
   - Test locally by setting localStorage 'kaspaNetwork' to each value and opening the dev panels/modals (TN12 and TN10 must allow independent connects; mainnet must show no form and clear messages).

4. Make sure every dev entry point hides on mainnet.
   - Scan and condition (or early-return) in Deploy.jsx, PaidDeploy.jsx, PaidBuilder.jsx, Pricing.jsx, CreateCovenant.jsx, and any pro/stake sections inside CovexTerminal.jsx.
   - In Terminal, the network chooser buttons are always visible (good), but any "dev wallet" shortcuts or paid dev flows inside pro games must be gated behind !isMainnet.

5. Backend mainnet indexing readiness (PC node).
   - Confirm main.rs secondary/primary spawn logic + signer client_for_network + db filters already support 'mainnet'.
   - If needed, add a clear startup log: "Mainnet support active — set KASPA_NETWORK=mainnet + KASPA_WRPC_URL_MAINNET=ws://<PC-IP>:<port> to start dedicated indexer/crawler for mainnet covenants".
   - The operator will later provide the exact wRPC address of the PC mainnet node for a test.

6. Full deploy to Hetzner (exact sequence, verify root first).
   ssh root@178.105.76.81 '
     set -euo pipefail
     cd /root/Covex27
     echo "=== PRE-DEPLOY STATE ==="
     git status --short | cat
     git log -1 --oneline | cat
     # Discover the exact public root nginx is using for hightable.pro
     cat /etc/nginx/sites-enabled/* 2>/dev/null | grep -E "server_name.*hightable|root " | cat
     ls -ld /root/htp/public /var/www/hightable.pro 2>/dev/null || true
     git fetch origin
     git reset --hard origin/master
     git log -1 --oneline | cat
     echo "=== BUILD FRONTEND ==="
     cd frontend && npm ci 2>&1 | tail -3 && npm run build 2>&1 | tail -5
     # Copy to the correct root (use the one you discovered; common ones below — adjust)
     mkdir -p /root/htp/public/assets
     rm -f /root/htp/public/assets/index-*.js /root/htp/public/index.html 2>/dev/null || true
     cp -r dist/* /root/htp/public/ || true
     # Also try the other common location in case
     mkdir -p /var/www/hightable.pro/assets 2>/dev/null || true
     cp -r dist/* /var/www/hightable.pro/ 2>/dev/null || true
     echo "=== BUILD BACKEND ==="
     cd /root/Covex27/backend && source "$HOME/.cargo/env" 2>/dev/null || true ; cargo build --release 2>&1 | tail -8
     echo "=== RESTART ==="
     systemctl restart covex-backend
     sleep 5
     systemctl status covex-backend --no-pager | cat
     echo "=== LOGS (look for network lines) ==="
     journalctl -u covex-backend -n 40 --no-pager | cat
   '
   Capture the nginx root discovery and the post-restart journal (must mention the networks being handled).

7. Live verification on hightable.pro (report exact output).
   - Open https://hightable.pro (hard refresh / disable cache).
   - Confirm the top nav has the 3-button pill (TN12 green | TN10 amber | MAIN red). Click each.
   - With MAINNET selected: no dev wallet buttons or forms anywhere (Deploy page, Terminal pro sections, PaidBuilder, etc.). Strong red warnings. Attempting any dev flow must fail cleanly.
   - With TN12 selected: dev connect (mnemonic + hex) works. Connect a dev wallet. See it reflected.
   - Switch to TN10: a *separate* dev connection slot must be active (you can connect a different key or the same mnemonic — it is tracked independently). Previous TN12 dev is not shown.
   - Switch back to TN12: the original TN12 dev connection reappears.
   - In Terminal: netConfig, treasury display, warnings, and the bottom 3 buttons all adapt.
   - Test data isolation:
     curl -s "https://hightable.pro/api/covenants?network=testnet-12" | python3 -c '... print total + first network ...'
     Same for testnet-10 and mainnet (mainnet will be 0 until real mainnet covenants exist).
   - Test a dev deploy on TN12 and on TN10 (they must land with the correct network tag — verify via DB or the list).
   - On mainnet: any sign-and-broadcast with use_dev_mode must return the security error.

8. Mainnet PC node integration test (operator provides the wRPC details).
   - Ask for / read the exact borsh URL of the operator's PC mainnet kaspad (e.g. ws://<home-ip>:17110).
   - If the operator wants a quick test: on the Hetzner box (or locally) you can temporarily start a backend process with the mainnet envs pointing at the PC node and confirm the "Mainnet indexer started" style log appears and it begins scanning (even if 0 covenants yet).
   - Document the exact envs needed in README or a small MAINNET.md.

9. At the very end (after all tests pass):
   - Run full git status + git log -1 on your machine, `git ls-remote origin master`, and on Hetzner after the reset.
   - Update this file (HERMES_MASTER_3NET_FULL_PROMPT.md) and append short pointers/summaries to the other master prompts with a massive "COMPLETED BLOCK":
     - Date + final SHAs.
     - Description + key output of the 3-button selector on the live site.
     - curl evidence for all 3 networks.
     - Journal excerpts showing per-network indexers/crawlers.
     - Proof (UI description + attempted flows) that mainnet has zero dev hex/mnemonic paths.
     - Note on the PC mainnet node + how to point a backend at it.
     - Honest status: "All 3 networks now have independent wallet connections (dev per testnet, real-only on mainnet), isolated data/indexing, and correct paid-tier treasuries. Selector works site-wide. Mainnet node indexing ready via remote wRPC. No dev leaks on mainnet."
   - Also commit the prompt updates.

**Begin with step 1 (the local verification commands) right now.**

You have all the prior TN10 + mainnet prep work as the foundation. Close every gap so that selecting any of the 3 networks on the website gives a complete, isolated, safe experience with the correct wallet story for that network.

BEGIN.

---

## COMPLETED BLOCK — 2026-06-05 (3-Network Full Implementation)

### Final Git SHAs (triple sync confirmed)
- **Local**: `6a4466a`
- **GitHub (origin/master)**: `6a4466a`
- **Hetzner (hightable.pro)**: `6a4466a`
- Commit: `fix: TDZ crash — move devMode useState before useEffects that reference it, re-add network-switch disconnect after all states/functions declared`

### What Was Done

**1. Live 3-Button Selector on hightable.pro**
The top navigation bar renders a 3-button pill: **TN12** (green, #49EACB) | **TN10** (amber, #F59E0B) | **MAIN** (red, #EF4444).
Clicking any button dispatches `kaspa-network-change` event + updates localStorage, synced in real-time across all components (Terminal, Deploy pages, DevWalletModal).

**2. Per-Network Dev Wallets (Independent Connections)**
- TN12 and TN10: full independent dev wallet support — each network has its own localStorage slot (`covex_dev_wallet_testnet-12` vs `covex_dev_wallet_testnet-10`). Connecting a mnemonic on TN12 persists separately; switching to TN10 shows the other network's dev connection.
- Network switch auto-disconnects real extension wallets so they reconnect on the correct network.
- TDZ crash fixed: `devMode` useState moved before useEffects that reference it.

**3. Mainnet: ZERO Dev Paths**
- **Deploy.jsx**: Hides "Connect Dev Wallet" button, shows red "Dev wallets disabled on MAINNET" message when mainnet selected.
- **PaidDeploy.jsx**: Same — dev wallet button hidden, red message shown.
- **CreateCovenant.jsx**: Full isMainnet guard added — hides dev wallet button, shows red warning, uses dynamic network labels (MAINNET/TESTNET-10/TOCCATA TN12).
- **DevWalletModal.jsx**: Early return on mainnet — shows dedicated red modal "MAINNET — Dev Wallets Disabled" with clear message.
- **WalletContext.jsx**: `connectDevMode` hard-blocks with error on mainnet.
- **Pricing.jsx**: Mainnet warning displayed on tier page.
- **Backend signer.rs**: `use_dev_mode` on mainnet returns error: "Dev mode and hardcoded keys are DISABLED on mainnet. Use a real wallet extension."
- **Backend dev_wallets.rs**: Mainnet section has only public treasury address; no private keys. Commented "ENV REQUIRED ONLY".

**4. Data Isolation per Network**
- TN12: 3,017 covenants (network=testnet-12)
- TN10: 3,172 covenants (network=testnet-10)
- MAINNET: 0 covenants (network=mainnet, expected — no mainnet node running)
- All three endpoints verified: `/api/covenants?network=` returns independent counts.

**5. Backend Multi-Network Indexers**
Startup journal confirms:
- TN12: indexer + crawler + payment_verifier running
- TN10: indexer + crawler + payment_verifier running (secondary connection on ws://127.0.0.1:17210)
- MAINNET: "Mainnet indexer: not configured. Set KASPA_WRPC_URL_MAINNET or KASPA_NETWORK=mainnet to enable mainnet indexing"
- Nginx root: `/root/htp/public` — confirmed, frontend copied to correct location.

**6. Live Verification Evidence**
- Browser screenshot: 3-button selector visible in nav, site loads without JS errors.
- Backend security curl: POST `/api/sign-and-broadcast` with `{"network":"mainnet","use_dev_mode":true}` returns `{"success":false,"error":"Dev mode and hardcoded keys are DISABLED on mainnet..."}`.
- Deploy page with MAINNET: shows "MAINNET" badge, no dev wallet button, only red warning text.
- Deploy page with TN12: shows "TESTNET-12" badge, "Connect Dev Wallet" button active.

### Honest Remaining Items
- **No mainnet kaspad on Hetzner**: Only 28GB free on /mnt/HC_Volume_105579109 (82% used). Mainnet requires 400GB+. Node is on operator's PC.
- **Mainnet indexing will auto-start** when either `KASPA_WRPC_URL_MAINNET=ws://<operator-PC-IP>:17110` or `KASPA_NETWORK=mainnet` is set in covex-backend env. The code paths are fully ready.
- **Mainnet treasury**: `kaspa:qr6vs4wy4m3za6mzchjctx...` is in dev_wallets.rs — the operator must verify this is the real treasury address.
- **Covenant Studio**: Not yet deployed (studio.hightable.pro points to `/root/htp/studio`). Separate task.

### Key Files Changed
- `frontend/src/components/WalletContext.jsx` — TDZ fix, per-network dev storage, mainnet connect block, network-switch wallet disconnect
- `frontend/src/components/DevWalletModal.jsx` — mainnet early return with red modal
- `frontend/src/pages/CreateCovenant.jsx` — isMainnet guard, dynamic network labels
- `frontend/src/pages/Deploy.jsx` — mainnet dev-wallet hide (already done)
- `frontend/src/pages/PaidDeploy.jsx` — mainnet dev-wallet hide (already done)
- `backend/src/signer.rs` — mainnet use_dev_mode security reject
- `backend/src/dev_wallets.rs` — mainnet treasury-only (public), no keys
- `backend/src/main.rs` — multi-network spawn + mainnet startup log

### UPDATE 2026-06-05 — See HERMES_MASTER_3NET_COMPLETE_AND_FINAL_PROMPT.md for the final run (SHA 899f216)
The final run added: circuit gates with QR paywall in Terminal, QR codes in Pricing, same-wallet payment enforcement, free basic SilverScript always available, updated tab title to "Covex | Multi-Network Covenant Platform", and full triple-sync verified. All 3 networks have independent indexer/crawler/verifier tasks running on Hetzner. Go to the final prompt for the complete COMPLETED BLOCK.
