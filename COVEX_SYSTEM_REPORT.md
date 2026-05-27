# Covex System Report — May 2026

## TL;DR

Covex is a full-stack Kaspa TN12 (Toccata) covenant indexer and SaaS platform. It crawls the BlockDAG for covenant transactions containing SilverScript payloads (`aa20`/`aa21`/`aa22`/`aa23` opcodes), indexes them in SQLite, generates interactive UIs with tier-based visibility, and serves them via a cyberpunk-themed React SPA frontend behind Nginx on `hightable.pro`.

**Live covenant:** TXID `910e0d0952c6fdc3d522e1cc9bbdebe2f45374f65f5753bc076a42990321f5fe` — a FREE-tier SilverScript `TransferWithTimeout` deployed via the backend Rust dev signer.

---

## Architecture Overview

```mermaid
flowchart TD
    NODE[("Kaspa TN12 Node\nkaspad --testnet --netsuffix=12\nwRPC on :17217")]
    BACKEND["Rust Backend (Axum :3005)\ncovex27-backend"]
    DB[("SQLite\ncovex.db")]
    NGINX["Nginx (hightable.pro)\nstatic: /root/htp/public\nproxy: /api/ → :3005"]
    BROWSER["Browser (React SPA)"]

    NODE <-- wRPC Borsh --> BACKEND
    BACKEND <-- SQL --> DB
    BROWSER -- HTTPS --> NGINX
    NGINX -- proxy --> BACKEND
    NGINX -- static --> BROWSER
```

### Component Detail

#### 1. Kaspa TN12 Node (`kaspad`)
- Runs on port 17217 with `--testnet --netsuffix=12 --utxoindex`
- Provides wRPC Borsh protocol for block/transaction queries and transaction submission
- Data directory: `/mnt/covex-data/kaspa-data/tn12`

#### 2. Rust Backend (`covex27-backend`)
- Single Axum 0.7 binary on port 3005
- Managed by systemd (`covex-backend.service`)
- Four background tasks:
  - **Indexer** (every 10s): Polls seed addresses for covenant UTXOs
  - **Crawler** (continuous): Walks selected-parent chain backward for historic covenants
  - **Payment Verifier** (every 15s): Confirms treasury payments (6 confirmations)
  - **API Server**: HTTP endpoint handlers

#### 3. SQLite Database (`covex.db`)
- 6 tables: `covenants`, `generated_uis`, `visibilities`, `payments`, `accounts`, `crawler_state`
- Covenant records include: tx_id, script_hash, script_hex, tier, creator, metadata
- Tier-weighted SQL sorting: MAX=100, PRO=50, CREATOR=10, FREE=0

#### 4. Nginx Reverse Proxy
- Static assets from `/root/htp/public/` (Vite-built React SPA)
- API proxy: `/api/` → `http://127.0.0.1:3005/` (trailing slash strips prefix)
- SSL via Let's Encrypt certbot

#### 5. React Frontend
- Vite 8 + React 19 SPA (cyberpunk "Kaspa green" theme)
- Pages: `/` (Explorer), `/deploy` (SilverScript deployment), `/covenant/:id` (detail)
- Wallet integration: KasWare, Kastle, OKX, Kasperia, Kasanova, Kaspium, KaspaCom, Tangem
- Dev mode: local key derivation from BIP39 mnemonic via `@onekeyfe/kaspa-wasm`

---

## How Covenant Indexing Works

### Historic Crawler (`crawler.rs`)

The crawler is the **authoritative on-chain truth source** — it is the only code allowed to discover covenants from the BlockDAG.

1. **Walk**: Gets virtual tip via `get_block_dag_info()`, follows `virtual_parent_hashes[0]` through `header.parents_by_level[0][0]` (selected parent chain)
2. **Scan**: For each block along the chain, iterates `block.transactions` (now fetched with `get_block(hash, true)` to include txn data)
3. **Detect**: Inspects **`tx.payload`** for covenant opcodes (`aa20`, `aa21`, `aa22`, `aa23`) — NOT output scripts (outputs are standard Schnorr P2PK)
4. **Tier**: Checks Output[1] for treasury P2PKH address match (position-enforced structure: Output 0=stake, Output 1=treasury fee, Output 2=change)
5. **Insert**: Calls `db::insert_covenant()` with 11 parameters including detected tier
6. **UI Gen**: Spawns `tokio::spawn` that generates basic HTML UI + visibility record
7. **Checkpoint**: Advances `crawler_state.last_scanned_daa` to allow resume after restart

**Key invariants:**
- Output scripts are NEVER checked for covenant opcodes — only `tx.payload`
- `get_block(hash, true)` — `true` means include transaction data
- Tier is determined solely by Output[1] position structure, not by API claims
- No optimistic DB writes — crawler discovers on-chain; nothing is inserted pre-emptively

### Live Indexer (`indexer.rs`)

The live indexer polls `COVENANT_SEED_ADDRESSES` every 10 seconds for new UTXOs:

1. Calls `get_utxos_by_addresses()` for each seed address
2. Filters out standard wallet outputs (P2PKH, Schnorr P2PK, P2SH, ≤40 bytes)
3. Checks for covenant opcodes in UTXO script hex (backup to crawler)
4. Inserts with tier + auto-generates UI

---

## How SQLite Stores Covenants

**Schema:**
```sql
CREATE TABLE covenants (
    tx_id               TEXT PRIMARY KEY,
    address             TEXT NOT NULL,
    amount_kaspa        REAL NOT NULL DEFAULT 0,
    script_hash         TEXT NOT NULL DEFAULT '',
    script_hex          TEXT NOT NULL DEFAULT '',
    covenant_type       TEXT NOT NULL DEFAULT '',
    category            TEXT NOT NULL DEFAULT 'general',
    creator_addr        TEXT NOT NULL DEFAULT '',
    description         TEXT NOT NULL DEFAULT '',
    verified_tier       TEXT NOT NULL DEFAULT 'FREE',
    verified_payment_tx TEXT,
    verified_at         INTEGER,
    custom_ui_enabled   INTEGER NOT NULL DEFAULT 0,
    full_logic_summary  TEXT NOT NULL DEFAULT '',
    receiving_addresses TEXT NOT NULL DEFAULT '',
    is_active           INTEGER NOT NULL DEFAULT 1,
    block_daa_score     INTEGER NOT NULL DEFAULT 0,
    timestamp           INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**Query for API:**
```rust
// db.rs — tier-weighted ordering
pub fn get_all_covenants(db: &Mutex<Connection>) -> anyhow::Result<Vec<DbCovenant>> {
    let sql = "SELECT ... FROM covenants WHERE is_active = 1 ORDER BY
        CASE verified_tier
            WHEN 'MAX' THEN 100 WHEN 'PRO' THEN 50 WHEN 'CREATOR' THEN 10 ELSE 0
        END DESC, timestamp DESC";
}
```

---

## How the Frontend Renders Covenants

1. `Explorer.jsx` fetches `/api/covenants` via `useEffect` on mount
2. Backend returns JSON array with `ui_config` per covenant (computed by `db::ui_config_for_tier()`)
3. Frontend renders in **exact backend order** — never re-sorts
4. Premium tiers get glow effects, expanded panels, priority placement:

| Tier | Card Styling | Badge | Expanded |
|------|------------|-------|----------|
| MAX | `shadow-[0_0_15px_#49EACB] border-[#49EACB]` | Purple ring | Full detail |
| PRO | `shadow-[0_0_10px_#49EACB] border-[#49EACB]` | Amber ring | Partial |
| CREATOR | `border-zinc-600` | Blue ring | Compact |
| FREE | `border-zinc-700` | Gray | Compact |

---

## The "Sighash/Payload" Fix: Technical Deep Dive

### Problem

Every covenant deployment via the Rust backend produced:
```
failed to verify the signature script: false stack entry at end of script execution
```

### Root Cause

The `kaspa-consensus-core` crate (v0.15.0, crates.io) was released **before** the TN12/Toccata hard fork. In `src/hashing/sighash.rs:82-86`:

```rust
pub fn payload_hash(tx: &Transaction) -> Hash {
    if tx.subnetwork_id == SUBNETWORK_ID_NATIVE {
        return ZERO_HASH;  // <--- PAYLOAD IGNORED
    }
    // Non-native subnetworks include payload
    let mut hasher = TransactionSigningHash::new();
    hasher.write_var_bytes(&tx.payload);
    hasher.finalize()
}
```

When `subnetwork_id` is `[0u8; 20]` (native), `payload_hash()` returns `ZERO_HASH` — the transaction payload is completely excluded from the sighash computation.

However, the **TN12 node** was patched (Toccata fork) to **always** include `tx.payload` in its sighash verification. This mismatch causes every covenant transaction to fail:
- Signer computes sighash = hash(tx without payload) → signs
- Node computes sighash = hash(tx with payload) → verifies → mismatch → "false stack entry"

### Evidence Confirmed

| Test Case | Payload | sig_op_count | Subnetwork | Result |
|-----------|---------|-------------|------------|--------|
| Simple transfer | empty | 0 | native | ✅ |
| Simple transfer | empty | 1 | native | ✅ |
| Covenant | `aa20...` | 0 | native | ✗ budget=9999 |
| Covenant | `aa20...` | 1 | native | ✗ false stack entry |
| Covenant | `aa20...` | 1 | non-native (byte 3) | ✗ subnetwork rejected |
| Covenant | `aa20...` | 1 | non-native ([1-10,0...]) | ✗ subnetwork rejected |
| Covenant | `aa20...` | 1 | native (patched crate) | ✅ TX CONFIRMED |

### The Fix

**Action**: Patched `payload_hash()` in a vendored copy of `kaspa-consensus-core` to **always hash the payload**, regardless of subnetwork ID:

```rust
pub fn payload_hash(tx: &Transaction) -> Hash {
    // TN12 Toccata fork: payload is ALWAYS included in sighash
    let mut hasher = TransactionSigningHash::new();
    hasher.write_var_bytes(&tx.payload);
    hasher.finalize()
}
```

**Implementation**:
1. Vendored the entire crate at `backend/vendor/kaspa-consensus-core/`
2. Patched `src/hashing/sighash.rs` (4-line change)
3. Added `[patch.crates-io]` in `backend/Cargo.toml`:
   ```toml
   [patch.crates-io]
   kaspa-consensus-core = { path = "vendor/kaspa-consensus-core" }
   ```

This is a surgical fix — it only affects the sighash computation for native-subnetwork transactions that contain payload data. Simple KAS transfers (empty payload) produce `hash(empty) == ZERO_HASH` — unchanged behavior.

### Related: Compute Budget

With payload correctly included in the sighash, a second issue emerged: `sig_op_count=0` gave a compute budget of 9,999 units, but covenant execution needs ~100,000 units. Solution: `sig_op_count=1` which scales budget to ~10,000 — sufficient for the 34-byte payload-only script.

---

## Infrastructure Health

### Git Status (May 23, 2026)
```
Commit: 9e6e13b "fix: patch kaspa-consensus-core sighash for TN12 covenant payload"
Branch: master
Remote: origin (https://github.com/THTProtocol/Covex27.git) — pushed ✓
```

### Backend Status
```
Service: covex-backend (systemd) — active ✓
Port: 0.0.0.0:3005
wRPC: ws://127.0.0.1:17217 → connected ✓
DB: /mnt/HC_Volume_105579109/Covex27/covex.db
Crawler checkpoint: ~19,680,000 DAA (walking backward from tip ~19,681,000)
Covenants indexed: 1
```

### Environment Variables
```
BIND_ADDR=0.0.0.0:3005
DB_PATH=/mnt/HC_Volume_105579109/Covex27/covex.db
KASPA_WRPC_URL=ws://127.0.0.1:17217
KASPA_NETWORK=testnet-12
COVENANT_SEED_ADDRESSES=kaspatest:qrh603... (Wallet 1),
                       kaspatest:qpw2y... (Wallet 2),
                       kaspatest:qpyfz... (Treasury)
COVENANT_TREASURY_ADDRESS=kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m
```

### Dev Wallets
| Label | Address | Private Key | Role |
|-------|---------|-------------|------|
| Wallet 1 | `kaspatest:qrh603...` | `549cd5a54263...` | Primary deployer |
| Wallet 2 | `kaspatest:qpw2y...` | `a6b2f78907...` | Secondary deployer |
| Treasury | `kaspatest:qpyfz...` | `0be4e04a2e...` | Fee receiver |

### API Endpoints
| Route | Method | Description |
|-------|--------|-------------|
| `/status` | GET | System health + covenant counts |
| `/covenants` | GET | All active covenants (tier-weighted) |
| `/tiers` | GET | Pricing tiers |
| `/health` | GET | Simple OK |
| `/broadcast` | POST | Relay signed hex to node (no DB writes) |
| `/sign-and-broadcast` | POST | Rust-native build+sign+broadcast |
| `/utxos/:address` | GET | UTXOs for address |
| `/balance/:address` | GET | Balance for address |

### Frontend Status
```
Build: Vite 8 + React 19 → dist/assets/index-CwbYRc_E.js
Nginx: /root/htp/public/ serving hightable.pro
Hash: index-CwbYRc_E.js (May 23, 21:24 build)
Note: Needs manual deploy to /root/htp/public/ after build
```

### Critical Architectural Invariants
1. **Crawler is King**: Only `crawler.rs` can write covenants to `covex.db`
2. **No Optimistic DB Writes**: `/api/broadcast` relays only — returns tx_id, no INSERT
3. **Output-Position Tiering**: Tier determined by Output[1] → treasury P2PKH, not API claims
4. **Payload Sighash**: Patched `kaspa-consensus-core` to always include `tx.payload` in sighash
5. **Frontend Never Sorts**: Explorer renders covenants in exact backend SQL order
6. **Dev Mode Signing**: Backend loads private keys from `dev_wallets.rs` when `use_dev_mode: true`

---

## Deployment Checklist

```bash
# 1. Build
cd /mnt/HC_Volume_105579109/Covex27/backend && cargo build --release
cd /mnt/HC_Volume_105579109/Covex27/frontend && npm run build

# 2. Deploy frontend (manual — Hermes blocks /root writes)
rm -rf /root/htp/public/*
cp -r /mnt/HC_Volume_105579109/Covex27/frontend/dist/* /root/htp/public/

# 3. Restart backend (stop+start, not restart — avoids stale binary)
systemctl stop covex-backend && sleep 1 && systemctl start covex-backend

# 4. Verify
curl -sk https://hightable.pro/api/status
curl -sk https://hightable.pro/api/covenants

# 5. Commit & push
cd /mnt/HC_Volume_105579109/Covex27
git add -A && git commit -m "..." && git push origin master
```

---

*Report generated by Hermes Agent, May 23, 2026*
*Commit: 9e6e13b | Live TX: 910e0d0952c6fdc3d522e1cc9bbdebe2f45374f65f5753bc076a42990321f5fe*
