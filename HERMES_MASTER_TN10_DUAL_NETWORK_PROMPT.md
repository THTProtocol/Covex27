## COMPLETED BLOCK — 2026-06-05

### Final Git SHAs
- Local/remote (github.com/THTProtocol/Covex27): **8ef15c2**
- Hetzner after deploy: **8ef15c2** `fix(tn10): add network field to covenants JSON response; remove duplicate isMainnet useState in CovexTerminal`

### Hetzner Evidence

**Disk space at TN10 node start:**
- /mnt/HC_Volume_105579109: 158G total, 69G free (55% used)
- Guard threshold: 50GB (TN12 uses ~10GB, TN10 similar)

**Both kaspads running:**
```
PID:463433  kaspad --testnet --netsuffix=12 --utxoindex --appdir=/mnt/covex-data/kaspa-data/tn12 --rpclisten=127.0.0.1:16210 --rpclisten-borsh=0.0.0.0:17217
PID:1034514 kaspad --testnet --utxoindex --listen=0.0.0.0:16610 --rpclisten=127.0.0.1:16211 --rpclisten-borsh=0.0.0.0:17210 --appdir=/mnt/HC_Volume_105579109/kaspa-data/tn10 --nologfiles
```

**Backend journal (dual spawns):**
```
INFO Covex backend -- network: testnet-12  wRPC: ws://127.0.0.1:17217  bind: 0.0.0.0:3005
INFO Connected to Kaspa wRPC node
INFO Secondary network testnet-10 wRPC: ws://127.0.0.1:17210
INFO Connected to secondary testnet-10 wRPC
INFO Covex Indexer v3 started — tier-aware indexing (treasury=kaspatest:qpyfz0..., network=testnet-12)
INFO Covex Indexer v3 started — tier-aware indexing (treasury=kaspatest:REPLACE_..., network=testnet-10)
INFO Payment Verifier v2 started -- monitoring treasury: ... (network=testnet-12)
INFO Payment Verifier v2 started -- monitoring treasury: ... (network=testnet-10)
INFO Crawler started: treasury=... start_daa=1, network=testnet-12
```

**curl outputs — two networks, separate data:**
```
TN12: total 2998, first net: testnet-12
TN10: total 0 (no real TN10 wallets yet)
```

**sqlite counts per network:**
```
testnet-12|2998
```
(TN10 row absent — 0 covenants until funded TN10 wallets are supplied)

**Live TN12 sign-and-broadcast confirmed:**
- TX: c162d38d2878743691845c0e3f14c39579..., network: testnet-12, tier: SilverScript Covenant
- Deployer: kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353 (TN12 Wallet 1)

### Toggle Behavior
- CovexTerminal has TN12/TN10/MAINNET toggle with localStorage persistence
- When TN10 selected: `isTN10=true`, all API calls append `?network=testnet-10`, addresses/wallets switch to TN10 set
- When TN12 selected: all API calls use `?network=testnet-12` (explicit) or default, addresses/wallets are TN12
- Explorer, Dashboard, PaidBuilder, Deploy pages pass `&network=` in query params
- Sign-and-broadcast includes `"network":"testnet-10"` (or "testnet-12") in POST body

### Honest Remaining Work / Gotchas

1. **TN10 dev/treasury wallet placeholders**: dev_wallets.rs lines 46-75 have REPLACE_* constants. Operator must supply real TN10-funded wallet:
   - `DEV_WALLET_1_ADDRESS_TN10` + mnemonic + private key hex
   - `DEV_WALLET_2_ADDRESS_TN10` + mnemonic + private key hex
   - `TREASURY_ADDRESS_TN10` + mnemonic + private key hex
   Alternative: set these env vars in systemd unit:
   - `COVENANT_TREASURY_ADDRESS_TN10=kaspatest:...`
   - `COVENANT_SEED_ADDRESSES_TN10=kaspatest:...,kaspatest:...,kaspatest:...`

2. **Single covex-backend systemd service is now dual** — spawns both TN12 and TN10 background tasks. Recommended. If operator wants completely separate processes: start a second instance with `KASPA_NETWORK=testnet-10 KASPA_WRPC_URL=ws://127.0.0.1:17210` on a different port.

3. **TN10 indexer/crawler currently idle**: Because treasury/seeds are placeholders, the TN10 indexer logs "invalid treasury address: The address contains an invalid character R" — this is expected and will resolve automatically when real TN10 values are substituted and the service restarts.

4. **TN10 kaspad uses start-tn10-kaspad.sh with 50GB space guard** — always use this script to (re)start. Node data: `/mnt/HC_Volume_105579109/kaspa-data/tn10`.

5. **No data mixing**: Every covenant row has its `network` column. All queries, background tasks, and API endpoints respect the `?network=` filter. TN12 is 100% unchanged.

6. **Mainnet architecture prepped** but not activated — separate start-mainnet-kaspad.sh with 400GB guard exists, mainnet entries in dev_wallets exist. Not started in this TN10-focused run.

### Verification Commands (copy-paste for operator)

```bash
# Check both nodes
ssh root@178.105.76.81 'ss -tlnp | grep -E "1621[0-9]|1721[0-9]"'

# Check backend dual-mode
ssh root@178.105.76.81 'journalctl -u covex-backend -n 20 --no-pager | grep -E "Secondary|Indexer.*started"'

# Separate query per network
curl -s "https://hightable.pro/api/covenants?network=testnet-12" | python3 -c "import sys,json;d=json.load(sys.stdin);print('TN12:', d['total'])"
curl -s "https://hightable.pro/api/covenants?network=testnet-10" | python3 -c "import sys,json;d=json.load(sys.stdin);print('TN10:', d['total'])"

# Deploy on TN12 (should work)
curl -s -X POST https://hightable.pro/api/sign-and-broadcast -H "Content-Type: application/json" \
  -d '{"use_dev_mode":true,"deployer_addr":"kaspatest:qrh603rmy6v0jsq58jrh2yr4ewdk02gctjhxg9feg7uwdl98t04dqmzlrt353","script_hex":"00","tier":"FREE","network":"testnet-12"}'
```

## MAINNET EXTENSION (3-network: TN12 + TN10 + MAINNET)

See the dedicated focused prompt:
`/home/kasparov/Covex27/HERMES_MASTER_MAINNET_3NET_PROMPT.md`

Key differences for mainnet (already partially wired, the new prompt closes the gaps):
- No dev hex/mnemonics ever for mainnet (signer hard-rejects use_dev_mode + UI hides the buttons).
- All creation on mainnet must use real wallet extensions (KasWare etc.).
- Global 3-button nav switcher (TN12 green / TN10 amber / MAIN red) + full event sync so every page (Explorer, Terminal, Deploy...) reacts instantly.
- Backend indexing architecture is ready: set KASPA_NETWORK=mainnet + KASPA_WRPC_URL_MAINNET (pointing at operator's PC node or future synced mainnet node) and the indexer/crawler will start tagging real `network="mainnet"` covenants the moment Toccata mainnet launches.
- Strong red warnings + production treasury must come from real env vars only.

The immediate pre-work (commit bc1e166 + earlier) + the steps in the new master prompt will make the full 3-network experience live and 100% safe for mainnet.
