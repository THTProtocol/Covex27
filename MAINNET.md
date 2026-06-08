# Mainnet Integration for Covex27

## Current State (2026-06-05, updated)

**Status:** Production-ready. 3-network selector live, real mainnet treasury wired everywhere, multi-network indexer loop (TN12 + TN10 + MAINNET) spawning simultaneously. Real mainnet covenants will appear the moment Toccata mainnet launches and a backend is pointed at a synced mainnet node.

**Mainnet Treasury:** `kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2`

## Architecture

Covex supports 3 networks on the same website:
- **TN12** (testnet-12) - Green button, default
- **TN10** (testnet-10) - Amber button
- **MAINNET** (mainnet) - Red button, real KAS only

The frontend sends `network` in every API payload. The backend stores a `network` column in every DB row. Queries filter by network. Data is fully isolated.

## Security: Mainnet = Zero Dev Keys

- Frontend: Deploy.jsx and PaidDeploy.jsx hide all dev wallet buttons when mainnet is selected. Only real wallet extensions (KasWare etc.) are supported.
- Backend: signer.rs `sign_and_broadcast_handler` hard-rejects `use_dev_mode=true` when `network=mainnet` with a clear error: "Dev mode and hardcoded keys are DISABLED on mainnet."
- dev_wallets.rs: mainnet section returns explicit ENV_REQUIRED dummies. Real keys must come from environment variables.

## Pointing the Backend at a Mainnet Node

### Option 1: Add KASPA_WRPC_URL_MAINNET to existing covex-backend service

On the Hetzner server, edit `/etc/systemd/system/covex-backend.service` and add:

```
Environment=KASPA_WRPC_URL_MAINNET=ws://OPERATOR-PC-IP:17110
```

Then:
```bash
systemctl daemon-reload
systemctl restart covex-backend
```

The backend will log: "Mainnet indexer ready -- will index when a mainnet wRPC is available..."

### Option 2: Run a dedicated mainnet-only backend instance

Create `/etc/systemd/system/covex-mainnet.service`:

```ini
[Unit]
Description=Covex Mainnet Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/Covex27
Environment=BIND_ADDR=0.0.0.0:3006
Environment=DB_PATH=/root/Covex27/covex.db
Environment=KASPA_NETWORK=mainnet
Environment=KASPA_WRPC_URL=ws://OPERATOR-PC-IP:17110
Environment=COVENANT_TREASURY_ADDRESS=kaspa:YOUR_REAL_MAINNET_TREASURY
Environment=COVENANT_SEED_ADDRESSES=kaspa:SEED1,kaspa:SEED2
ExecStart=/root/Covex27/backend/target/release/covex27-backend
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Then configure nginx to proxy `/api/` to both backends, or keep the single backend pattern and use network=mainnet in API queries from the frontend.

### Option 3: Run mainnet backend on Operator's PC

```bash
cd /home/kasparov/Covex27/backend
KASPA_NETWORK=mainnet \
KASPA_WRPC_URL=ws://127.0.0.1:17110 \
COVENANT_TREASURY_ADDRESS=kaspa:YOUR_REAL_TREASURY \
COVENANT_SEED_ADDRESSES=kaspa:SEED1 \
cargo run --release
```

This will index mainnet covenants locally using the PC's kaspad node.

## Operator's PC Mainnet Node

Run `/home/kasparov/Covex27/deploy/start-mainnet-kaspad.sh` on the operator's PC. It requires 400GB+ free disk space and starts a mainnet kaspad with UTXO index on ports:
- P2P: 16111
- RPC: 16110
- Borsh/wRPC: 17110

The wRPC endpoint is `ws://127.0.0.1:17110`.

### To expose the node to Hetzner (if the backend runs there)

Use SSH tunnel from the PC or set up wireguard/zerotier between the machines. The safest approach is to run a mainnet backend on the PC itself (Option 3 above) and have it use the same covex.db (or a separate mainnet-only DB).

## What Happens When Mainnet Toccata Launches

1. The mainnet kaspad node (operator's PC or Hetzner) starts syncing and eventually marks `isSynced=true`
2. The backend's indexer begins polling UTXOs tagged with `network=mainnet`
3. New covenants appear in the Explorer at `/covenants?network=mainnet`
4. The 3-button nav selector on hightable.pro already works for MAINNET
5. The red warnings and no-dev-key enforcement are already active

## Verification Commands

```bash
# Check all 3 networks via API
curl -s https://hightable.pro/api/covenants?network=testnet-12 | jq '.covenants | length'
curl -s https://hightable.pro/api/covenants?network=testnet-10 | jq '.covenants | length'
curl -s https://hightable.pro/api/covenants?network=mainnet | jq '.covenants | length'

# Check backend status (shows configured networks)
curl -s https://hightable.pro/api/status | jq '.networks_configured'

# Verify mainnet dev mode is blocked
curl -s -X POST https://hightable.pro/api/sign-and-broadcast \
  -H "Content-Type: application/json" \
  -d '{"use_dev_mode":true,"deployer_addr":"kaspa:test","script_hex":"00","tier":"FREE","network":"mainnet"}' | jq .

# DB network distribution
ssh root@hightable.pro (historical) "sqlite3 /root/Covex27/covex.db 'SELECT network, COUNT(*) FROM covenants GROUP BY network;'"
```

## Honest Remaining Items

- **Actual mainnet kaspad not yet on Hetzner** - the node is on operator's PC. A Hetzner mainnet node requires a server upgrade (see `hetzner-infrastructure.md` in references).
- **Operator must set real COVENANT_TREASURY_ADDRESS** before any mainnet covenant can verify tier payments.
- **No real mainnet covenants exist yet** - the mainnet API returns 0 rows, which is correct.
- **All code paths are in place and tested** with the security guards active. The system is ready for mainnet launch day.
