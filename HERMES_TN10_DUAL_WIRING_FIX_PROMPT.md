# HERMES_TN10_DUAL_WIRING_FIX_PROMPT.md
# Focused continuation prompt after the truncated YOLO run + local completion of the wiring.

**Context (what was already done before this prompt):**
- The long YOLO run (the one user pasted) successfully:
  - Patched and ran start-tn10-kaspad.sh on Hetzner (with /mnt/HC_Volume_105579109 50GB guard, pkill, distinct ports 16610/16211/17210, log to /var/log/kaspad-tn10.log).
  - Major refactors: dev_wallets.rs (per-net _TN12/_TN10 consts + helpers + compat aliases), db.rs (network column migration + filtered get_all/get_by_creator + insert with network), indexer/crawler/signer/payment (thread network, auto_summary uses TN-10 label, signer picks dev keys + treasury by payload.network).
  - Multiple scp + run of the starter script (succeeded, tail + ss showed listening on 16211/17210).
  - Truncation happened while reading/editing main.rs (the client spawns + handlers).
- After truncation, the AI here diagnosed the exact gap (single primary client + single set of background tasks meant toggle would filter DB but no TN10 data would ever be indexed, and sign/broadcast would always hit the wrong node).
- Then this AI did the remaining work locally:
  - Extended main.rs: always compute secondary_network + secondary_wrpc (defaults to 17210 for tn10, 17217 for tn12, overridable by KASPA_WRPC_URL_TN10 etc) + secondary_treasury/seeds (from dedicated env or dev_wallets helpers). Create secondary_client (with fallback to primary on error so TN12 never breaks). Spawn *separate* indexer + payment_verifier + crawler tasks for the secondary (using the now-updated fn signatures that take network). Primary tasks also updated to pass explicit network.
  - Made signer sign_and_broadcast_handler: drop the injected primary client Extension; construct via new client_for_network(payload.network) which picks correct WRPC default + does short-lived connect + uses it for get_utxos + submit. (This is the key so "when I press tn10" the covenant tx lands on TN10 DAG and the insert uses network="testnet-10".)
  - Same for broadcast.rs: BroadcastRequest now has network (default tn12), broadcast/utxos/balance handlers construct on-demand client_for_network (from ?network= or body) and use it (kept Extension layer for router compat but ignore for the op).
  - Updated payment_verifier::run_... to take network: String (4th arg), log it, and pass Some(&network) to get_covenants_by_creator (strict net match for payments).
  - Fixed pre-existing rusqlite query_map type errors in db.rs (the three if network.is_some() branches that produced incompatible MappedRows<different closure types> -- now collection is inside each branch so each MappedRows lives in its own scope).
  - Updated all frontend callers that do deploys or creator lists: Deploy.jsx, PaidDeploy.jsx (balance?network= + sign body.network), Explorer/CovenantInteractive (already had some), Dashboard, PaidBuilder (added &network= to ?creator= queries).
  - cargo check clean (only pre-existing warnings).
  - Committed as ddd1c1f + pushed to github.com/THTProtocol/Covex27 (master).
- TN12 paths are 100% unchanged in behavior when network not specified (defaults to testnet-12 everywhere, primary process keeps working exactly as the old systemd covex-backend).

**Current state on Hetzner (you must verify first):**
The TN10 kaspad may or may not still be running from the previous YOLO (reboot? manual stop?). The covex-backend is the old binary (pre the wiring).

**Your mission (execute in small verifiable steps, report key output after each ssh/build):**
1. SSH and verify current Hetzner reality (MANDATORY FIRST STEP). Run exactly:
   ssh root@178.105.76.81 '
     echo "=== DISK (the volume) ==="; df -h /mnt/HC_Volume_105579109
     echo "=== TN10 KASPAD ==="; ps aux | grep -E "kaspad.*tn10|17210" | grep -v grep || echo "NO TN10 KASPAD"
     echo "=== TN12 KASPAD (for ref) ==="; ps aux | grep -E "kaspad.*tn12|17217" | grep -v grep || echo "no tn12 ps line"
     echo "=== PORTS ==="; ss -tlnp | grep -E "1621[0-9]|1721[0-9]|16610"
     echo "=== COVEX BACKEND ==="; systemctl status covex-backend --no-pager | cat
     echo "=== CURRENT BACKEND LOG (last 10) ==="; journalctl -u covex-backend -n 10 --no-pager | cat
     echo "=== DB has network column? ==="; sqlite3 /root/Covex27/covex.db "PRAGMA table_info(covenants);" | grep -i network || echo "NO NETWORK COL (old binary may not have migrated)"
   '
   Paste the full output in your reply.

2. If no TN10 kaspad: re-run the starter (it has the guard + will kill old).
   ssh root@178.105.76.81 'bash /root/Covex27/deploy/start-tn10-kaspad.sh'
   Then re-run the verify block from step 1 and confirm "TN10 kaspad started successfully (PID ...)" + ports listening.

3. Deploy the fixed code to the running Hetzner (exact triple-sync discipline, one service covers both nets because of the secondary spawns):
   ssh root@178.105.76.81 '
     set -euo pipefail
     cd /root/Covex27
     echo "=== PRE-DEPLOY ==="
     git status --short | cat
     git log -1 --oneline | cat
     git fetch origin
     git reset --hard origin/master
     git log -1 --oneline | cat
     echo "=== BUILD FRONTEND (if needed for any ui change) ==="
     cd frontend && npm ci 2>&1 | tail -3 ; npm run build 2>&1 | tail -5
     rm -f /var/www/hightable.pro/index-*.js 2>/dev/null || true
     cp -r dist/* /var/www/hightable.pro/ || true
     cd /root/Covex27
     echo "=== BUILD BACKEND ==="
     cd backend && cargo build --release 2>&1 | tail -10
     echo "=== RESTART SERVICE (the single covex-backend now does dual) ==="
     systemctl restart covex-backend
     sleep 4
     systemctl status covex-backend --no-pager | cat
     echo "=== POST RESTART LOG (look for Secondary network testnet-10) ==="
     journalctl -u covex-backend -n 30 --no-pager | cat
   '
   Capture and report the critical lines: "Secondary network testnet-10 wRPC: ws://127.0.0.1:17210", "Connected to secondary", any errors, the new binary PID.

4. Verify dual indexing is active + DB sees network:
   ssh root@178.105.76.81 '
     echo "=== BACKEND HEALTH ==="
     curl -s http://127.0.0.1:3005/health || curl -s http://127.0.0.1:3005/ | cat
     echo "=== COVENANTS TN12 (expect old data) ==="
     curl -s "http://127.0.0.1:3005/covenants?network=testnet-12" | python3 -c "import sys,json; d=json.load(sys.stdin); print(\"total\", d.get(\"total\",0)); print(\"sample nets:\", [c.get(\"network\",\"?\") for c in d.get(\"covenants\",[])[:3]])" 2>/dev/null || echo "no python or bad json"
     echo "=== COVENANTS TN10 (expect 0 until first real TN10 covenant) ==="
     curl -s "http://127.0.0.1:3005/covenants?network=testnet-10" | python3 -c "import sys,json; d=json.load(sys.stdin); print(\"total\", d.get(\"total\",0)); print(\"first few:\", d.get(\"covenants\",[])[:2])" 2>/dev/null || echo "no python or bad"
     echo "=== RAW DB COUNT PER NET ==="
     sqlite3 /root/Covex27/covex.db "SELECT network, COUNT(*) FROM covenants WHERE is_active=1 GROUP BY network;" | cat
     echo "=== BACKEND PROC LISTEN ==="
     ss -tlnp | grep 3005
   '

5. Test end-to-end creation on TN10 (the "press tn10" requirement):
   - You can use curl to simulate what the frontend toggle does, or (preferred) use the live site after the deploy + a browser with devtools to set localStorage.
   - Minimal curl test (uses dev mode so it picks the TN10 dev key from the consts -- note: will fail if the REPLACE_ placeholders are still there, that's expected until operator fills real TN10 mnemonics):
     ssh root@178.105.76.81 '
       echo "=== TEST SIGN TN10 (will use placeholder keys -> expect clear error or success if you already replaced) ==="
       curl -s -X POST http://127.0.0.1:3005/sign-and-broadcast \
         -H "Content-Type: application/json" \
         -d '"'"'{"use_dev_mode":true,"deployer_addr":"kaspatest:REPLACE_WITH_TN10_DEV_WALLET_1_ADDRESS","script_hex":"00","tier":"FREE","covenant_name":"tn10-test","network":"testnet-10"}'"'"' | cat
       echo
       echo "=== (for TN12 it would use the real TN12 ones) ==="
     '
   - Then on the live hightable.pro (after frontend copied): open CovexTerminal or the Deploy page, use the TN10 toggle (amber), create a simple FREE covenant (or use one of the pro game sections that ends up calling the same). Watch the tx go out. Then query the two /covenants?network=... and confirm the new covenant row has "network":"testnet-10" and appears only in the TN10 list, old TN12 covenants do not appear in the TN10 list.
   - Also do a balance check with the toggle and confirm it talks to the right node (different UTXO set).

6. If the dev wallet placeholders cause the test deploy to fail with "REPLACE..." in the key, that's fine -- document it. The operator must:
   - Edit /root/Covex27/backend/src/dev_wallets.rs on Hetzner (replace the four TN10 consts: two devs + treasury addr/mnemonic/hex with real funded TN10 testnet values).
   - Or set the four envs COVENANT_TREASURY_ADDRESS_TN10 + COVENANT_SEED_ADDRESSES_TN10 (the two deployers) in the systemd unit or before starting a dedicated process.
   - Rebuild + restart.
   Tell the user exactly what to put (they said "all the wallets and mnemonics and hex will be accurately chosen when I press tn10" -- so they will supply the real ones).

7. Also confirm the old TN12 flow is 100% unaffected: create while on TN12 toggle (or no localStorage), see it uses the original TN12 dev wallets, lands with network=testnet-12, appears only in TN12 lists, indexer still works for historic + live on TN12.

8. Space / resource sanity (from the original requirement):
   - Report the free GB at the moment the TN10 node was (re)started.
   - Confirm only the start-tn10 script (with its 50GB guard) is used to (re)start it -- never manual kaspad without the guard.

9. At the very end, update the canonical master prompt file (the one that should live in the repo: HERMES_MASTER_TN10_DUAL_NETWORK_PROMPT.md or the latest one) with a big "COMPLETED BLOCK":
   - Date + your run id
   - Final git SHAs: local ddd1c1f (or newer after your hetzner reset), github, and the commit on the box after reset.
   - Hetzner evidence: 
     - df at start of TN10 node
     - ps + ss for both kaspads + their PIDs + exact command lines showing --rpclisten-borsh for 17210 vs 17217
     - backend journal tail containing the "Secondary network testnet-10" + "Covex Indexer v3 started" lines for both nets
     - curl outputs for the two networks (different totals)
     - sqlite counts per network
     - one real example covenant tx_id + its network value from a TN10 deploy you performed or the user did during verification
   - Toggle behavior proof (screenshot description or curl + the POST that included "network":"testnet-10")
   - Honest remaining work / gotchas:
     - "TN10 dev/treasury wallets in dev_wallets.rs are still the REPLACE_ placeholders. Real operator-supplied values required before paid-tier TN10 deploys (or set *_TN10 env vars). TN12 values untouched and used by default."
     - "The single covex-backend systemd service is now dual (recommended). If operator wants completely separate processes, start a second with KASPA_NETWORK=testnet-10 KASPA_WRPC_URL=ws://127.0.0.1:17210 ... on another port and have nginx/frontend call the right origin based on toggle (more complex, not needed)."
     - "Mainnet architecture (start-mainnet script, mainnet entries in dev_wallets, KASPA_NETWORK=mainnet handling) was prepped in prior commit but the actual mainnet kaspad on Hetzner was not started in this TN10-focused run (400GB guard etc). Use the other master prompt when ready for mainnet."
     - "No data mixing: every covenant row has its network, queries and background tasks are strictly scoped."
   - "TN12 on the live site is identical to before the change."

**Rules (strict):**
- Small steps. After every significant ssh or systemctl, re-run a verify command and include the *exact* relevant output lines in your message.
- Never break the TN12 path. If something would affect only the primary, keep the old code path.
- If the TN10 kaspad is not up or space <50GB on the volume, stop and report the numbers -- do not force-start.
- Prefer the existing covex-backend service (now dual) over starting extra processes unless you have a clear reason.
- After the deploy + test, do a final `git status && git log -1` on the box and on your local.
- If you hit any new truncation or length limit, just stop, report "truncated at step X, output so far: ...", and the next message will continue with the next tiny step.
- At the absolute end, also update the HERMES_MASTER* file in the repo with the completed block (use cat >> or echo the section).

**Begin with step 1 (the big verify ssh command) right now.**

You are ready. The code is good on github. Make the live Hetzner + hightable.pro + evidence match the "same website, choose tn10 or tn12, separate data + correct wallets + correct node" requirement.

BEGIN.
