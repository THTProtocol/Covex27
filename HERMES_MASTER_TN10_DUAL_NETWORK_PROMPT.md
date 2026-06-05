# HERMES_MASTER_TN10_DUAL_NETWORK_PROMPT.md
# Definitive prompt to fork Covex for TN10 while keeping full TN12 support on the SAME website.
# Execute exactly. Do local work + Hetzner node (with space guard) + full testing + update this prompt.

**CRITICAL — READ THESE FIRST (use tools, in exact order):**
1. This entire prompt.
2. /home/kasparov/Covex27/README.md (network support section + deploy commands).
3. /home/kasparov/Covex27/deploy/start-tn10-kaspad.sh (the space-check script you must use or replicate exactly).
4. Current key files (read relevant sections):
   - frontend/src/components/CovexTerminal.jsx (the existing kaspaNetwork toggle + isTN10 logic at the top of the main config section).
   - frontend/src/components/WalletContext.jsx (SUPPORTED_NETWORKS including testnet-10).
   - backend/src/main.rs (KASPA_NETWORK, wRPC client creation, treasury/seeds).
   - backend/src/dev_wallets.rs (hardcoded TN12 wallets — you will add TN10 set).
   - backend/src/db.rs + indexer.rs + crawler.rs (covenants table, run_indexer).
   - deploy/start-covex-backend.sh and other deploy/ scripts.
5. Git state + current SHAs (local, GitHub, Hetzner after pull).
6. Hetzner server: ssh root@178.105.76.81 — you will run df, the start script, etc.

**Current State (already done by previous agent — build on this, do not break TN12):**
- Frontend has a working TN12 / TN10 toggle in CovexTerminal (persisted, visual, placed right after "Covenant Configuration" header). When TN10 is selected, isTN10=true.
- WalletContext supports 'testnet-10'.
- deploy/start-tn10-kaspad.sh exists with **mandatory disk space check** (exits with clear error if <80GB free on /).
- README documents the dual support.
- Only clean files remain after previous purges (no old HERMES bloat).
- TN12 path must remain 100% unchanged and fully working.

**Goal (user verbatim):**
"I want a fork of covex specifically for tn10 now — so I can have 2 instances 1 for tn12 and 1 for tn10 — I need to run a tn on hetzner and I need the indexers and everything to fetch covenants from tn10 too — its not combined — I need to be able to choose if its tn10 or tn12 on the same website — so make everything fit tn10 now [...] all the wallets and mnemonics and hex will be accurately chosen when I press tn10 — so its all for tn10 and when I do tn12 its like now — everything fits only for tn12"

**Strict Rules:**
- Same single website / codebase.
- User chooses via the toggle (or equivalent global selector you improve).
- **When TN10 selected:** EVERYTHING adapts — dev wallets, mnemonics, private hex, treasury address, seed addresses, RPC/wRPC URL, indexer scope, covenant data, terminal config, displayed addresses in pro sections, etc. are pure TN10.
- **TN12 is completely untouched** — identical behavior, addresses, data, node as before this work.
- Data is **not combined** (separate per network).
- Hetzner: run real TN10 kaspad **only after** confirming sufficient disk space.
- Full end-to-end testing on both networks.
- After work: commit, push, full deploy (exact sequence), live verification on hightable.pro that toggle works and networks are isolated.
- Update this prompt file (and README if needed) with completion block + SHAs + test evidence.
- Be minimal, targeted, and preserve existing TN12 perfection.

**TN10 Technical Details (use these as base — user will correct the exact wallet hex/mnemonics):**
- Network label: "testnet-10"
- Explorer: https://explorer-tn10.kaspa.org/
- Typical public wRPC (Borsh): ws://tn10-rpc.kaspa.stream or local after you start the node (use 17210 in the starter script).
- Node command base (already in the script): kaspad --testnet --utxoindex with dedicated ports (16610 p2p, 16210 gRPC, 17210 borsh) + own data dir.
- Addresses still use "kaspatest:" prefix but different values per network.
- You must add accurate TN10 dev wallets (user will provide the real mnemonics/hex when "pressing TN10").

**Step-by-Step Execution Order (Hermes must follow exactly):**

1. **Audit current state**
   - Confirm the toggle exists and works in Terminal.
   - Confirm start-tn10-kaspad.sh has the space check and correct TN10 flags.
   - Confirm TN12 still works perfectly (no breakage from your changes).
   - Pull latest on both repos.

2. **Hetzner TN10 Node (with space guard — do this early)**
   - ssh root@178.105.76.81
   - First: df -h / ; df -h /home or the data volume.
   - If free space on the relevant volume < 80-100 GB: STOP and report "Insufficient space for TN10 node (utxoindex + history). Resize the Hetzner volume first." Do not start the node.
   - Only if space is confirmed sufficient: run the starter (or equivalent exact commands):
     cd /root/Covex27 && ./deploy/start-tn10-kaspad.sh
   - Verify the node is running (ps aux | grep kaspad, tail the log, check it is syncing TN10).
   - Note the exact Borsh/wRPC port it is listening on.
   - (Optional but recommended) Make it a systemd service similar to existing kaspad/covex services.
   - Set env for backend: KASPA_WRPC_URL_TN10=ws://127.0.0.1:<the-port>

3. **Backend — Make it support both networks cleanly (separate data, no leakage)**
   - In dev_wallets.rs: add a TN10 set of wallets (DEV_WALLET_1_TN10 etc. with placeholders + comment "REPLACE WITH ACTUAL TN10 VALUES PROVIDED BY OPERATOR"). Add helper functions like get_dev_wallets(network) that return the correct set for 'testnet-10' or 'testnet-12'.
   - In main.rs: support reading TN10-specific env vars (KASPA_WRPC_URL_TN10, COVENANT_TREASURY_ADDRESS_TN10, COVENANT_SEED_ADDRESSES_TN10, etc.). Create clients for both networks at startup.
   - Add 'network' column to the covenants table (ALTER TABLE or ensure in CREATE). Default existing rows to 'testnet-12'. Update all inserts/selects/queries to include and filter by network.
   - Run two indexers in background (one per network), each using its own client, seeds, treasury, and writing with the correct network tag.
   - Update all handlers (/covenants, /status, /terminal-config, compute-payout, etc.) to accept `?network=testnet-10` (or header). Scope data and use the correct client/treasury for that network. Default to 'testnet-12' for backward compatibility.
   - Signer and other signing paths must choose the correct private key based on the network + deployer address.
   - Status/root responses must report the current network when requested.
   - Rebuild and test locally that both networks can be queried independently.

4. **Frontend — Make the toggle drive full adaptation (nothing leaks)**
   - Enhance the existing kaspaNetwork toggle if needed so it is global (e.g., lift to App.jsx + context, or ensure CovexTerminal + Explorer + any other pages read the same localStorage value and react).
   - In CovexTerminal:
     - When isTN10, automatically load/switch to TN10-specific treasury address and seed addresses in all pro sections (chess, poker, blackjack, checkers, etc.) and in the generated covenant config.
     - Include `network: kaspaNetwork` in every terminal-config save/load, stake post, oracle submit, etc.
     - Display the correct network label and TN10-specific addresses/wallets when selected.
   - In Explorer and covenant list pages: pass the selected network in queries and only show covenants for the chosen network.
   - Wallet connection: when user selects TN10, ensure the wallet adapter uses 'testnet-10' (already supported).
   - Any place that hardcodes TN12 treasury/seeds/wallets must become network-aware (use the same pattern as the toggle).
   - The choice must feel like "two separate instances" while staying on one website.

5. **TN10-specific accurate values**
   - Hardcode or load TN10 dev wallet mnemonics, private hex, treasury, and seeds (use the placeholders you added in step 3; operator will replace with real ones before final deploy).
   - When the toggle is on TN10, the UI must show and use only the TN10 values for signing, indexing, display, etc.

6. **Local build + testing (both networks)**
   - npm run build (frontend) + cargo check (backend) — zero errors.
   - Test toggle:
     - Select TN12 → everything behaves exactly as before (wallets, addresses, data).
     - Select TN10 → all displayed/used values switch to TN10 set, network label is TN10.
   - Manually verify (or describe) that saving a covenant config on TN10 includes the correct network and TN10 addresses.
   - If you have local kaspad for TN10, test indexer picks TN10 covenants only.

7. **Commit, push, deploy**
   - Commit with clear message referencing this prompt and the user's TN10 request.
   - Push both Covex27 and Covenant-Studio (if any Studio templates need network awareness).
   - Full Hetzner deploy using the exact sequence from README/DEPLOY_TO_HIGHTABLE.sh (git reset --hard, frontend build + cp dist, backend build if changed, restart services, health checks).
   - Ensure the TN10 kaspad (started in step 2) is running and the backend can connect to it for TN10 mode.

8. **Live verification on https://hightable.pro (must pass and be documented)**
   - Toggle works and is visible.
   - TN12 mode: identical to before (same addresses, same covenants, same behavior).
   - TN10 mode: uses TN10 addresses/wallets, separate covenant list (ideally empty or only TN10 test data).
   - Create a test covenant while on TN10 → it is stored with network=tn10.
   - Switch back to TN12 → the TN10 covenant does not appear.
   - Status / health endpoints reflect the selected network when queried.
   - TN10 node is up (you can confirm via ssh or status).
   - No mixing of data, no breakage of TN12.
   - Favicon, branding, everything else from previous work still perfect.
   - Run the space check script again on server and confirm it would have blocked if space was low.

9. **Final updates**
   - Append to this prompt file (and README if useful):
     - COMPLETED: <date>
     - Covex27 SHA: <final>
     - Hetzner TN10 node: running (PID, port, space confirmed XXX GB free at start)
     - Testing evidence: (paste key curl outputs, toggle behavior, example covenant tx with network tag)
     - TN12 unchanged: confirmed.
     - Honest limitations (e.g. "TN10 dev wallets are placeholders until operator provides real ones", "separate backends or query-param routing used", etc.).
   - Clean any new bloat.

**Success =** User can go to the site, flip the switch to TN10, and the entire experience (wallets, addresses, indexer, data) is a pure TN10 fork. Flip back to TN12 and it is exactly as it was before this work. TN10 node is running on Hetzner after space was verified. Everything tested.

**Start executing now.** Read the files. Check space on Hetzner first. Run the node only if safe. Wire the code. Test both networks thoroughly. Deploy. Verify live. Update this prompt with full evidence.

BEGIN.

---

## POST-TRUNCATION UPDATE (completed by direct AI work + this prompt for Hermes)

**Problem diagnosed from the pasted YOLO log:** The stream truncated while Hermes was in the middle of main.rs (after successful patches to dev_wallets/db/indexer/crawler/signer). Result: background tasks and the wRPC client were still single-network only. The frontend toggle + ?network= would filter DB reads, but (a) no TN10 indexer/crawler was running so TN10 covenants would never appear, and (b) even if you sent network=testnet-10 in a sign payload, the broadcast would still go through the primary (TN12) client -> covenants would be created on the wrong chain or fail.

**What was fixed locally (before handing to you):**
- main.rs now always starts a secondary client + spawns dedicated indexer + payment_verifier + crawler for the other net (using dev_wallets treasury/seeds or *_TN10 envs, correct WRPC defaults 17210/17217).
- signer.rs + broadcast.rs: sign-and-broadcast, balance, utxos, broadcast now construct a fresh short-lived client_for_network(payload.network or ?network=) and target the right kaspad (on-demand, no change to the long-lived primary client the service was started with).
- payment_verifier now takes + passes network.
- db.rs: the query_map if/else type errors (pre-existing from the original network patch) were fixed so it compiles.
- All relevant frontend POST/GET for deploys and creator lists now forward the localStorage 'kaspaNetwork'.
- cargo check: clean.
- Committed ddd1c1f + pushed to github.

**Next (you/Hermes):** Use the dedicated focused prompt at HERMES_TN10_DUAL_WIRING_FIX_PROMPT.md (cat it, copy, paste to a fresh hermes). It starts with "verify current Hetzner state" (the mandatory df/ps/ss/journalctl), re-starts TN10 node if needed via the guarded script, does the git reset --hard + cargo build + systemctl restart on the box (single service now dual), runs the verification curls + sqlite + a test TN10 dev deploy, collects the exact evidence, and appends the big COMPLETED block with SHAs, Hetzner outputs, sample TN10 covenant tx, honest limitations (the REPLACE_ wallets), etc.

The single covex-backend on Hetzner is now capable of serving both networks on the same website via the existing toggle. TN12 is untouched.

(Also see the small HERMES_TN10_NOW_PROMPT.md that was written earlier in the session.)

**Current good commit on github (use in the reset):** ddd1c1f9ba5d2f04c3d8434b19a609d47bdeb7a2
