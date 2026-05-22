<div align="center">

<br>

```
██████╗ ██████╗ ██╗   ██╗███████╗██╗  ██╗
██╔════╝██╔═══██╗██║   ██║██╔════╝╚██╗██╔╝
██║     ██║   ██║██║   ██║█████╗   ╚███╔╝ 
██║     ██║   ██║╚██╗ ██╔╝██╔══╝   ██╔██╗ 
╚██████╗╚██████╔╝ ╚████╔╝ ███████╗██╔╝ ██╗
 ╚═════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝
```
### The Stateful Kaspa Covenant Indexer and SaaS Platform

[![Network](https://img.shields.io/badge/network-testnet--12_(Toccata)-49EACB)](https://kaspa.org)
[![Language](https://img.shields.io/badge/language-Rust-orange)](https://rust-lang.org)
[![Framework](https://img.shields.io/badge/framework-Axum_+_Tokio-informational)](https://github.com/tokio-rs/axum)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

<br>

> **DAG is the truth. Covex is the window.**
>
> Index, discover, customize, and deploy UTXO smart contracts on the Kaspa BlockDAG — with no custody, no token approvals, and no off-chain servers.

<br>

---
**Built by HIGH TABLE PROTOCOL**
<br>

</div>

---

## Overview

Covex is a high-performance, non-custodial indexer for Kaspa native UTXO smart contracts (Covenants). It connects to a local **kaspad Toccata node** (Testnet-12 with `--netsuffix=12`) via wRPC on port `17217`, discovers covenant deployments across the SilverScript-enabled BlockDAG, and automatically generates interactive HTML UIs for every detected contract. The entire system runs as a single Rust binary.

The backend spawns three concurrent background tasks on startup: a **historic crawler** that walks the selected-parent chain backward from the virtual tip to discover past covenants, a **live indexer** that polls seed addresses every 10 seconds for new UTXOs, and a **payment verifier** that monitors the treasury address for on-chain tier purchases. Every covenant record is stored in a local SQLite database with full script disclosure, tier metadata, premium UI configuration, and generated UI pages.

A separate React + Vite frontend provides the browser-facing covenant explorer with **native tier-weighted sorting** and **premium UI styling** (neon glow borders for PRO/MAX, expanded detail panels for MAX), pricing page, dashboard, and wallet integration. The frontend and backend are independent — the backend is a pure JSON API, and the frontend is a static SPA.

### Network Support

| Network | Status | wRPC Port | Address Prefix | Fork |
|:---|:---|:---|:---|:---|
| Testnet-12 (Toccata) | **Active** | `17217` | `kaspatest:` | SilverScript aa20-aa23 opcodes |
| Mainnet | Planned | — | `kaspa:` | TBD |

**Critical**: SilverScript covenants (`aa20`/`aa21`/`aa22`/`aa23` opcodes) only exist on TN12 (Toccata fork). Testnet-10 has no covenant support. The kaspad node **must** run with `--testnet --netsuffix=12 --utxoindex --rpclisten-borsh=0.0.0.0:17217`.

---

## Architecture

Covex runs inside a single Rust process. The Axum HTTP server binds to `127.0.0.1:3005` and exposes five JSON endpoints. Three `tokio::spawn` background loops share a single `KaspaRpcClient` connection to the local kaspad node. All state lives in a SQLite database at the project root, protected by a `Mutex<Connection>` handed to every subsystem via `Arc`. Generated UIs are stored as HTML strings in the `generated_uis` table and served directly — no SSR, no hydration, no build step.

```mermaid
graph LR
    Browser[Browser] --> Backend[Covex27-API :3005]
    Backend --> DB[("SQLite covex.db")]

    Indexer[Indexer] --> Kaspa[("kaspad Toccata :17217")]
    Crawler[Crawler] --> Kaspa
    Verifier[Payment Verifier] --> Kaspa

    Indexer --> DB
    Crawler --> DB
    Verifier --> DB

    Wallet[Wallet] -.-> Kaspa

    subgraph Process["covex27-backend (single process)"]
        Backend
        Indexer
        Crawler
        Verifier
    end

    style Kaspa fill:#49EACB,stroke:#0A0A0D,color:#000
    style Wallet fill:#49EACB,stroke:#0A0A0D,color:#000
    style DB fill:#1A1A2E,stroke:#49EACB,color:#49EACB
    style Process fill:#11111A,stroke:#333,color:#E0E0E0
```

### Subsystem Detail

**Historic Crawler** (`crawler.rs`, 225 lines) — Polls `get_block_dag_info()` every tick to find the virtual tip DAA score. Walks the selected-parent chain backward up to `MAX_WALK_DISTANCE` blocks per tick (default 500), calling `get_block()` for each parent hash. Every transaction output is checked against `looks_like_covenant()`, which matches `aa20`/`aa21`/`aa22`/`aa23` script prefixes. Inserted covenants use a `UNIQUE` constraint so duplicate blocks are silently skipped. The checkpoint (`crawler_state.last_scanned_daa`) is persisted after every batch — the crawler resumes from that DAA on restart.

**Live Indexer** (`indexer.rs`, 170 lines) — Loops on a 10-second interval. Calls `get_utxos_by_addresses()` for each seed address configured in `COVENANT_SEED_ADDRESSES`. Every returned UTXO is classified by script opcodes (`classify_covenant`) and category (`CovenantCategory::from_script_ops`), then inserted into the `covenants` table. After insertion, a `tokio::spawn` fires off basic UI generation — the indexer loop continues immediately, never blocked on HTML rendering.

**Payment Verifier** (`payment_verifier.rs`, 151 lines) — Loops on a 15-second interval. Queries UTXOs for the treasury address. Each UTXO's `amount_sompi` is checked against `tier_from_amount()` thresholds (100/500/1,000 KAS). The `from_address` field is matched to a creator address in the covenants table. Once the DAA score delta reaches 6 confirmations, `upgrade_covenant_record()` sets `verified_tier`, `verified_payment_tx`, `full_logic_summary`, `receiving_addresses`, and `custom_ui_enabled`. An enhanced UI is then regenerated and saved to `generated_uis`, and a visibility record is created with priority based on tier (MAX=100, PRO=50, CREATOR=10).

**UI Generator** (`ui_generator.rs`, 187 lines) — Produces self-contained HTML pages with embedded CSS and JavaScript. Two modes: `generate_basic_ui()` (red danger banner, limited fields: tx_id, script_hash, amount, type) for FREE/EXPLORER tiers, and `generate_enhanced_ui()` (green verified banner, full disclosure including creator, receiving addresses, logic summary) for CREATOR/PRO/MAX. Both modes include wallet detection (KasWare, Kaspium, OneKey), amount and recipient form fields, and a `kaspa_sendTransaction` integration. The cyberpunk-styled CSS uses glass-panel backdrop-blur, neon green borders (`#49EACB`), and dark radial gradient backgrounds.

### Native Visibility Engine

The `get_all_covenants()` function in `db.rs` performs **native SQLite-tier sorting** using a `CASE` expression that assigns tier weights:

| Tier | Weight | ui_config.glow | ui_config.expanded | Premium Styling |
|:---|:---|:---|:---|:---|
| MAX | 100 | `true` | `true` | Neon glow border, full detail panel, script hash, creator, logic summary |
| PRO | 50 | `true` | `false` | Neon glow border, script hash + type shown |
| CREATOR | 10 | `false` | `false` | Standard verified badge |
| FREE / EXPLORER | 0 | `false` | `false` | Compact card only |

The SQL query:

```sql
SELECT ... FROM covenants WHERE is_active = 1
ORDER BY
  CASE verified_tier
    WHEN 'MAX' THEN 100 WHEN 'PRO' THEN 50 WHEN 'CREATOR' THEN 10 ELSE 0
  END DESC, timestamp DESC;
```

Each covenant's API response includes a `ui_config` object — `{glow, expanded, priority, label}` — computed by `db::ui_config_for_tier()`. The React `Explorer.jsx` frontend **never re-sorts** the payload; it renders in the exact order returned by the backend. Premium MAX and PRO covenants receive:

- **MAX**: `shadow-[0_0_15px_#49EACB] border-[#49EACB]` — full expanded panel with script hash, creator address, block DAA, covenant type, and logic summary
- **PRO**: `shadow-[0_0_10px_#49EACB] border-[#49EACB]` — compact card with script hash and type visible
- **CREATOR**: Blue verified badge with bordered card
- **FREE**: Minimal gray card, limited to name, description, category, and amount

---

## Covenant Classification

Covex classifies every detected UTXO by analyzing its script public key hex. The classification pipeline runs in `crawler.rs` and `indexer.rs`:

```mermaid
graph LR
    ScriptHex["script_hex"] --> CheckPrefix{prefix match?}
    CheckPrefix -->|"aa20 + endsWith('87')"| P2SH["p2sh-covenant"]
    CheckPrefix -->|"aa20 or aa21"| Extended["generic-covenant"]
    CheckPrefix -->|"aa22"| MultiSig["multi-sig-covenant"]
    CheckPrefix -->|"contains '51'"| Spendable["spendable-covenant"]
    CheckPrefix -->|fallback| Generic["generic-covenant"]

    ScriptHex --> CategoryCheck{category?}
    CategoryCheck -->|"'51' present"| Skill["Skill Contests"]
    CategoryCheck -->|"'aa21' present"| Escrow["Escrow & Custody"]
    CategoryCheck -->|"'aa22' present"| Tournament["Tournaments"]
    CategoryCheck -->|fallback| General["General"]

    style ScriptHex fill:#1A1A2E,stroke:#49EACB,color:#49EACB
    style P2SH fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Extended fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style MultiSig fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Spendable fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Generic fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Skill fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Escrow fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Tournament fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style General fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
```

The `CovenantCategory` enum defines nine categories. Four are currently detectable from script opcodes; the remaining five are reserved for future SilverScript features:

| Category | Opcode Pattern | Status |
|:---|:---|:---|
| Skill Contests | `51` in script body | Active |
| Escrow & Custody | `aa21` prefix | Active |
| Tournaments | `aa22` prefix | Active |
| General | No opcode match | Active (fallback) |
| Predictive Markets | — | Planned |
| Community Pools | — | Planned |
| Flash Covenants | — | Planned |
| Structured Settlement | — | Planned |
| Governance | — | Planned |

---

## Technology Stack

| Layer | Technology | Purpose |
|:---|:---|:---|
| Node | kaspad v0.15 with `--netsuffix=12` | wRPC (Borsh encoding) — Toccata Testnet-12 full node with `--utxoindex` |
| Backend | Rust 1.80 · Axum 0.7 · Tokio 1 | Async HTTP server with three concurrent background tasks |
| wRPC Client | kaspa-wrpc-client 0.15 | Borsh-encoded WebSocket RPC to kaspad on `ws://127.0.0.1:17217` |
| Database | SQLite via rusqlite 0.31 | 6 tables, 15 indexes, `Mutex<Connection>` shared via `Arc` |
| Tier Sorting | SQL CASE expression | Native DB-level weighted sort (MAX=100, PRO=50, CREATOR=10, FREE=0) |
| Hashing | SHA-256 (sha2 0.10) | Script hash computation for covenant deduplication |
| Frontend | React 18 + Vite 5 | Static SPA — cyberpunk covenant browser with premium tier styling |
| Styling | Tailwind CSS + custom neon | `#49EACB` glow borders, purple/amber/blue tier badges, dark theme |
| Deployment | systemd + bash | Two service units (kaspad-toccata + covex-backend), unified deploy script |

---

## Database Schema

SQLite at `covex.db`. Auto-created on first startup by `db::open_db()`.

```
covenants              payments              accounts
├─ tx_id (PK)          ├─ id (PK, AUTO)      ├─ address (PK)
├─ address             ├─ tx_id (UNIQUE)     ├─ tier
├─ amount_kaspa        ├─ from_address       ├─ payment_tx_id
├─ script_hash         ├─ to_address         ├─ paid_at
├─ script_hex          ├─ amount_sompi       ├─ expires_at
├─ covenant_type       ├─ tier               ├─ is_active
├─ category            ├─ confirmations      └─ created_at
├─ creator_addr        ├─ status
├─ description         ├─ covenant_id (FK)
├─ verified_tier       └─ timestamp          crawler_state
├─ verified_payment_tx                       ├─ id (PK, CHECK=1)
├─ verified_at          generated_uis        └─ last_scanned_daa
├─ custom_ui_enabled    ├─ id (PK, AUTO)
├─ full_logic_summary   ├─ covenant_id       visibilities
├─ receiving_addresses  ├─ owner_address     ├─ covenant_id (PK)
├─ is_active            ├─ tier              ├─ tier
├─ block_daa_score      ├─ ui_html           ├─ featured
└─ timestamp            ├─ ui_config         ├─ priority
                        ├─ slug (UNIQUE)     └─ custom_domain
                        ├─ is_published
                        ├─ featured
                        └─ ui_generated_at
```

Crawl state is checkpointed to `crawler_state` (single row, id=1). The crawler reads `last_scanned_daa` on startup and updates it after every batch — no full rescan on restart.

---

## API Reference

All endpoints return JSON. The `/covenants` endpoint returns **natively sorted** results — highest-tier covenants first.

| Method | Path | Response |
|:---|:---|:---|
| `GET` | `/` | `{"status":"ok","app":"Covex v1.0.0","network":"testnet-12"}` |
| `GET` | `/health` | `OK` (plain text, used by uptime monitors) |
| `GET` | `/covenants` | `{"total":N,"covenants":[...]}` — each record includes `tx_id`, `address`, `amount_kaspa`, `script_hash`, `script_hex`, `covenant_type`, `category`, `creator_addr`, `verified_tier`, `full_logic_summary`, `receiving_addresses`, `block_daa_score`, `timestamp`, `name`, `tier`, `ui_config` (with `glow`, `expanded`, `priority`, `label`) |
| `GET` | `/status` | `{"status":"ok","network":"testnet-12","node_connected":true,"total_covenants":N,"active_covenants":N,"verified_covenants":N}` |
| `GET` | `/tiers` | Array of four tier definitions with `name`, `label`, `price_kas`, `price_sompi`, `features[]`, `color`, `featured` |

**Critical**: The `/covenants` response is sorted server-side by `CASE verified_tier WHEN 'MAX' THEN 100 WHEN 'PRO' THEN 50 WHEN 'CREATOR' THEN 10 ELSE 0 END DESC, timestamp DESC`. The frontend **must not re-sort** the array — it renders in the exact order received.

---

## SaaS Pricing Tiers

Covenant creators purchase verification and visibility by sending KAS to the Covex treasury address. The payment verifier detects the deposit, waits for 6 BlockDAG confirmations, and upgrades the account and covenant record.

| Tier | Price (KAS) | Price (sompi) | Weight | ui_config | Key Capabilities |
|:---|:---|:---|:---|:---|:---|
| `EXPLORER` | `0` | `0` | 0 | `{glow:false, expanded:false}` | Browse all covenants, basic UI with limited disclosure |
| `CREATOR` | `100` | `10,000,000,00` | 10 | `{glow:false, expanded:false}` | Full disclosure, verified badge, form builder, wallet integration |
| `PRO` | `500` | `50,000,000,00` | 50 | `{glow:true, expanded:false}` | Featured listing, priority indexing, neon glow border, higher search ranking |
| `MAX` | `1,000` | `100,000,000,00` | 100 | `{glow:true, expanded:true}` | Top placement, full detail panel, custom domain, premium branding, neon glow border, expanded view by default |

Tier detection: `tier_from_amount()` checks `amount_sompi >= 100_000_000_00` for MAX, `>= 50_000_000_00` for PRO, `>= 10_000_000_00` for CREATOR.

Treasury: `kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m`

---

## Toccata TN12 Node Setup

The Toccata fork enables SilverScript covenant opcodes (`aa20`, `aa21`, `aa22`, `aa23`). A properly configured node is required for the crawler and indexer to discover real covenants.

```bash
# Create data directory
mkdir -p /mnt/covex-data/kaspa-data/tn12

# Start Toccata node (use systemd or background process)
kaspad --testnet --netsuffix=12 --utxoindex \
  --appdir=/mnt/covex-data/kaspa-data/tn12 \
  --rpclisten-borsh=0.0.0.0:17217
```

**Bootstrap time**: ~6–8 minutes from cold start. Headers download first (~1.4M IBD), then blocks. The backend crawler starts discovering covenants only after IBD completes.

**Verify sync**:
```bash
# For systemd
journalctl -u kaspad --no-pager -n 5 | grep "IBD\|synced\|isSynced"
```

---

## Deployment

### Prerequisites

- Rust 1.80+ stable toolchain
- Node.js 20+ and npm
- kaspad Toccata node synced to Testnet-12 with `--testnet --netsuffix=12 --utxoindex --rpclisten-borsh=0.0.0.0:17217`

### Quick Deploy

```bash
sudo bash deploy/deploy-hetzner.sh
```

Installs all system dependencies, builds the Rust backend (release) and React frontend, and creates the systemd service unit.

### Unified Deploy (production update)

```bash
sudo bash deploy/deploy_all.sh
```

Hard-resets to `origin/master`, rebuilds backend and frontend, reconfigures kaspad and covex27-api systemd services, and runs a health report. Fully idempotent.

### Environment

```bash
KASPA_NETWORK=testnet-12
KASPA_WRPC_URL=ws://127.0.0.1:17217
BIND_ADDR=127.0.0.1:3005
DB_PATH=../covex.db
COVENANT_TREASURY_ADDRESS=kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m
COVENANT_SEED_ADDRESSES=
CRAWL_START_DAA=1
RUST_LOG=covex27_backend=info,kaspa_wrpc=warn
```

### Manual Build

```bash
cd backend
cargo build --release
./target/release/covex27-backend
```

On startup the binary opens the SQLite database, connects to kaspad via wRPC, spawns three background tasks (indexer, crawler, payment verifier), then binds the HTTP server.

### Systemd Unit

```ini
[Unit]
Description=Covex27 Backend (Toccata TN12)
After=network.target kaspad.service
Wants=kaspad.service

[Service]
Type=simple
User=root
WorkingDirectory=/mnt/HC_Volume_105579109/Covex27
ExecStart=/mnt/HC_Volume_105579109/Covex27/backend/target/release/covex27-backend
Restart=always
RestartSec=5
Environment="KASPA_NETWORK=testnet-12"
Environment="KASPA_WRPC_URL=ws://127.0.0.1:17217"
Environment="BIND_ADDR=127.0.0.1:3005"
Environment="DB_PATH=/mnt/HC_Volume_105579109/Covex27/covex.db"
```

### Frontend Deployment

```bash
cd frontend
npm run build
rm -rf /root/htp/public/*
cp -r dist/* /root/htp/public/
```

Production URL: **https://hightable.pro**

---

## Repository

```
Covex27/
├── backend/
│   ├── Cargo.toml                  # Rust dependencies (Axum, Tokio, kaspa-wrpc-client 0.15)
│   └── src/
│       ├── main.rs                 # Entry point, router, 5 JSON endpoints, ui_config injection
│       ├── covenant_types.rs       # Enums, tiers, UI config structs, pricing logic
│       ├── crawler.rs              # Historic BlockDAG crawler (selected-parent chain walk)
│       ├── db.rs                   # SQLite schema, CRUD, tier-weighted sorting, ui_config_for_tier()
│       ├── indexer.rs              # Live UTXO poller + auto basic UI generation
│       ├── payment_verifier.rs     # Treasury monitor + tier upgrades + enhanced UI trigger
│       └── ui_generator.rs         # Basic & enhanced HTML UI rendering with wallet integration
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Explorer.jsx        # Covenant browser — native sort + premium neon styling
│       │   ├── CreateCovenant.jsx  # Covenant deployment form with payment gate
│       │   ├── HostCovenant.jsx    # Covenant hosting interface
│       │   ├── CovenantInteractive.jsx  # Interactive covenant detail view
│       │   ├── Dashboard.jsx       # Creator dashboard
│       │   ├── Pricing.jsx         # Tier pricing page
│       │   └── Terms.jsx           # Terms of service
│       └── components/
│           ├── WalletContext.jsx    # Wallet state management (KasWare, Kaspium, OneKey)
│           ├── WalletButton.jsx    # Wallet connection UI
│           ├── WalletModal.jsx     # Wallet selection modal
│           ├── Hero.jsx            # Landing page hero section
│           └── DagBackground.jsx   # Animated BlockDAG background
├── deploy/
│   ├── .env.production             # Production environment template (TN12)
│   ├── deploy-hetzner.sh           # Fresh deployment (deps, build, configure)
│   ├── deploy_all.sh               # Unified production update (reset, rebuild, restart)
│   ├── covex-backend.service       # systemd unit for backend (TN12)
│   └── nginx-covex.conf            # Nginx reverse proxy config
├── scripts/
│   └── generate_covex_health_report.sh  # Production health diagnostic report
├── .env                            # Local environment (TN12)
└── README.md
```

---

## License

MIT

---

**Covex** — Built by **HIGH TABLE PROTOCOL** for the Kaspa ecosystem. Running on Toccata Testnet-12.
