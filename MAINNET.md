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
- dev_wallets.rs: the mainnet section hardcodes only the public `TREASURY_ADDRESS_MAINNET` (where KAS is sent). No mainnet private keys live in source. All mainnet signing goes through wallet extensions, and any signer paths that need a key resolve it from environment variables only.

## Pre-flight env validator

The backend ships with a `validate_mainnet_env()` pre-flight check (added in T8) that runs at startup. It is a fail-closed gate: misconfigured mainnet env aborts the process before any indexer, signer, or HTTP listener comes up.

### What it checks

When `KASPA_NETWORK=mainnet`, the validator requires:

- `KASPA_NETWORK` is exactly `mainnet` (case-sensitive). Any other value is treated as non-mainnet and the validator is a no-op.
- `COVENANT_TREASURY_ADDRESS` is set and non-empty.
- The treasury does NOT start with `kaspatest:` (testnet address on a mainnet binary is rejected).
- The treasury (lowercased) does NOT contain any of the following placeholder substrings: `placeholder`, `example`, `dev_wallet`, `devwallet`, `your_address`, `youraddress`, `todo`, `xxxxxx`. This list is the exact set enforced by `validate_mainnet_env` in `backend/src/main.rs` (lines 81-90); update this doc and the code together if it ever changes.
- The treasury does NOT exact-match, and does NOT end with the bech32 body of, any of the known testnet/dev addresses pulled from `dev_wallets.rs`: `TREASURY_ADDRESS_TN12`, `TREASURY_ADDRESS_TN10`, `DEV_WALLET_1_ADDRESS_TN12`, `DEV_WALLET_2_ADDRESS_TN12`, `DEV_WALLET_1_ADDRESS_TN10`, `DEV_WALLET_2_ADDRESS_TN10`. The body-suffix check catches the case where someone strips the `kaspatest:` prefix and re-prefixes with `kaspa:`.

The check is independent of consensus and only inspects process env. It does not prove the treasury key is held by the operator; it only prevents the obvious foot-guns (forgot to set it, pasted a testnet address, reused a known dev/testnet address, or left a placeholder-looking literal in).

### What FATAL exit looks like

On failure the process logs a single line to stderr and exits with status 1 before binding any port. Example:

```
FATAL: validate_mainnet_env: COVENANT_TREASURY_ADDRESS starts with 'kaspatest:' but KASPA_NETWORK=mainnet -- refusing to start
```

There is no partial-start, no degraded mode, no retry. `systemctl status covex-backend` will show the unit in `failed` state and the FATAL line will be the last entry in `journalctl -u covex-backend`.

### How to verify locally before flipping mainnet

Flipping `KASPA_NETWORK=mainnet` in prod is an owner-gated step (see the security section above; mainnet has zero dev keys and the toccata covenant fork on the node side is a separate gate). Before that flip, dry-run the validator locally:

```bash
cd backend

# 1. Negative case: forgot to set treasury -- should exit 1 with FATAL.
KASPA_NETWORK=mainnet cargo run --release 2>&1 | head -5

# 2. Negative case: testnet address on mainnet -- should exit 1 with FATAL.
KASPA_NETWORK=mainnet \
  COVENANT_TREASURY_ADDRESS=kaspatest:qrxxx \
  cargo run --release 2>&1 | head -5

# 3. Negative case: placeholder literal -- should exit 1 with FATAL.
#    Must contain one of: placeholder, example, dev_wallet, devwallet,
#    your_address, youraddress, todo, xxxxxx (case-insensitive).
KASPA_NETWORK=mainnet \
  COVENANT_TREASURY_ADDRESS=kaspa:your_address_placeholder \
  cargo run --release 2>&1 | head -5

# 4. Positive case: real mainnet treasury -- validator passes, startup continues
#    (will then fail on wRPC if no mainnet node is reachable, which is fine).
KASPA_NETWORK=mainnet \
  COVENANT_TREASURY_ADDRESS=kaspa:qr6vs4wy4m3za6mzchj05x3902qrtklkyn8s0u8g2gv6mrctzdzx7pnhqxka2 \
  cargo run --release 2>&1 | head -20
```

Cases 1 through 3 must all print the `FATAL: validate_mainnet_env: ...` line and exit. Case 4 should get past the validator into the normal indexer-start log lines.

Honest note: this validator only protects the env-config surface. It does NOT verify the node is actually on mainnet, does NOT verify the treasury private key is recoverable, and does NOT replace the owner-driven decision to flip `KASPA_NETWORK=mainnet` on the production systemd unit. That flip remains a manual, owner-gated step.

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
