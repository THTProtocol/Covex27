# HERMES_TN10_NOW_PROMPT (Focused - avoid truncation)

**Goal:** Finish the TN10 support so the website toggle (already in CovexTerminal) lets users choose TN10 vs TN12 on the same site. TN10 must have its own covenants, its own node on Hetzner (started only after space check), and the backend must respect the network for queries and background fetching. TN12 must remain completely untouched.

**You have already done a lot (from previous run):** 
- The UI toggle for TN12/TN10 is in place.
- start-tn10-kaspad.sh is patched and on the server.
- dev_wallets.rs, db.rs, indexer.rs, crawler.rs, signer.rs have network-aware changes and the 'network' column migration.
- The last scp + run of the script happened.

**Current problem:** The previous stream was truncated. Do small, verifiable steps. After each major step, run a command and report the output briefly. If you need to continue, use short follow-ups.

**Step 1: Verify current Hetzner state (do this first)**
ssh root@178.105.76.81 '
  echo "=== DISK SPACE ===" 
  df -h /mnt/HC_Volume_105579109
  echo "=== TN10 KASPAD PROCESS ==="
  ps aux | grep -E "kaspad.*tn10" | grep -v grep || echo "no tn10 kaspad"
  echo "=== TN10 LOG TAIL ==="
  tail -10 /var/log/kaspad-tn10.log 2>/dev/null || echo "no log yet"
  echo "=== PORTS ==="
  ss -tlnp | grep -E "16211|17210"
  echo "=== EXISTING BACKEND ==="
  systemctl status covex-backend --no-pager | head -5
'

Report the output.

**Step 2: Start TN10 node if not running (use the script - it has the space check)**
ssh root@178.105.76.81 'bash /root/Covex27/deploy/start-tn10-kaspad.sh'

Then re-run the verify command from Step 1 and report.

If it says not enough space, tell the user the exact free GB and stop.

**Step 3: Make sure one backend can serve both networks (or start a second one)**
The backend code now supports ?network=testnet-10 in queries (from previous patches).

To have background indexing for TN10 too:
- You can run a second backend process for TN10.

Example:
ssh root@178.105.76.81 '
  export KASPA_NETWORK=testnet-10
  export KASPA_WRPC_URL=ws://127.0.0.1:17210   # the TN10 borsh port from the script
  export DB_PATH=/root/Covex27/covex.db   # same DB is fine with network column
  export COVENANT_TREASURY_ADDRESS=kaspatest:REPLACE_WITH_TN10_TREASURY   # use the placeholder or real one the user will give
  export COVENANT_SEED_ADDRESSES=kaspatest:REPLACE_TN10_DEV1,kaspatest:REPLACE_TN10_DEV2
  nohup /root/Covex27/backend/target/release/covex27-backend > /tmp/covex-tn10.log 2>&1 &
  echo "TN10 backend PID $!"
  sleep 2
  curl -s http://127.0.0.1:3005/health   # or the port you chose
'

(If you want to use a different port for the TN10 backend, update the BIND_ADDR and use nginx location or have the frontend call different port based on toggle.)

Report if the second backend starts.

**Step 4: Quick local test that the toggle affects data**
In the code, the toggle sets localStorage 'kaspaNetwork'.

The Explorer and CovenantInteractive now append ?network=... 

Test with curl on the running backend (or the new TN10 one):

curl "http://127.0.0.1:3005/covenants?network=testnet-10" | head -c 500
curl "http://127.0.0.1:3005/covenants?network=testnet-12" | head -c 500

They should return different (or empty for TN10 until indexing runs).

**Step 5: Make the frontend toggle actually switch the backend calls (if not already perfect)**
The CovexTerminal already has the state and passes network in terminal-config.

For the main site lists, the Explorer patch we did should be there.

If the toggle in Terminal is only local to the Terminal page, lift the network choice to a simple global (e.g. a top bar toggle that sets localStorage and reloads or uses context).

If needed, add a small global NetworkSwitcher in App.jsx that sets the localStorage and shows current choice.

Do the minimal change to make choosing TN10 in the Terminal affect the "POST stake" and config so that when you create a covenant while on TN10, it gets saved with network=testnet-10.

**Step 6: Deploy the changes**
Use the exact deploy sequence the user has used before (reset --hard, build frontend, cp dist, restart backend(s)).

Make sure both the TN12 backend and (if started) the TN10 backend are running after deploy.

**Step 7: End-to-end test (report results)**
- On the live site, use the toggle to TN10.
- Create a simple covenant (or use the pro chess/poker section) while on TN10.
- Check via curl or the Explorer (with network param) that it appears under TN10 but not TN12.
- Confirm the TN10 kaspad is running and the indexer for TN10 would pick it (or manually trigger if needed).
- Switch back to TN12 and confirm old data is still there and new TN10 one is not mixed in.
- Check disk space was respected.

**Step 8: Update this prompt and the main master prompt**
At the end, append a COMPLETED block with:
- Date
- Final SHAs (git rev-parse HEAD on both repos)
- Hetzner state (TN10 node running? PID? port? free space at start?)
- Test evidence (example covenant tx_id that has network=testnet-10, toggle behavior)
- Any remaining placeholders the user needs to fill (the TN10 wallet addresses/mnemonics)
- Honest status: "TN10 chooser works, separate data via network column, TN10 node running after space check, TN12 untouched."

**Rules for you (Hermes):**
- Do ONE major step per response if the output is getting long.
- After every ssh or build, run a verification command and include the key output in your reply.
- Never break the existing TN12 functionality.
- Use the exact patched scripts we have.
- If a stream truncation happens again, just say "truncated, continuing with next small step" and do the next file/small change.

**Start with Step 1 right now.** Report the exact output of the df + ps + log tail command.

Then proceed step by step.

BEGIN.
