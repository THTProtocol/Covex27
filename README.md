<div align="center">
  <br>
  <br>

  <pre>
██████╗  ██████╗ ██╗   ██╗███████╗██╗  ██╗
██╔════╝ ██╔═══██╗██║   ██║██╔════╝╚██╗██╔╝
██║      ██║   ██║██║   ██║█████╗   ╚███╔╝
██║      ██║   ██║╚██╗ ██╔╝██╔══╝   ██╔██╗
╚██████╗ ╚██████╔╝ ╚████╔╝ ███████╗██╔╝ ██╗
 ╚═════╝  ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝
  </pre>

  <h3 style="margin-top: -10px;">Kaspa Covenant Indexer & SaaS Platform</h3>

  <br>

  <a href="https://hightable.pro"><img src="https://img.shields.io/badge/live-76%20covenants-49EACB?style=for-the-badge&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAADISURBVHgBfZI9CsJAEEbHyiJY+AdWYiMWgmAh3kA8gOANIoj2XsA7iEcQO0uw0FbYQkhlsRBGjUQkK4kf6hN4w7zZb3ZmWID/i7IsBUFgep5HvV6P5XKpK4ryIEmSJNfrtTkYDPB9HzAMw3F4sVhwl4fDgXmeR57nMZ/PEccx9H0/mu4mSRJNURSWZRkURcFxHCfPcxbDl5RS4TAMo+s6FhcXiqKQJEk0HA7RNE0QBAEhxK+5iKKoYhgG9vt97X0HXyB1PwAqkPAAAAAASUVORK5CYII=" alt="Live"></a>
  <a href="https://hightable.pro"><img src="https://img.shields.io/badge/network-Toccata%20TN12-49EACB?style=for-the-badge" alt="Network"></a>
  <a href="https://github.com/THTProtocol/Covex27/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-49EACB?style=for-the-badge" alt="License"></a>
  <a href="#"><img src="https://img.shields.io/badge/kaspad-v0.15-49EACB?style=for-the-badge" alt="kaspad"></a>

  <br>
  <br>

  > **Live:** [hightable.pro](https://hightable.pro) &nbsp; • &nbsp; **Code:** 2,504 lines Rust &nbsp; • &nbsp; **Frontend:** React 19 + Vite 8
  >
  > Non-custodial indexing layer for native Kaspa SilverScript covenants. One binary. One DB. Zero middlemen.

  <br>

  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0A0A0D,100:49EACB&height=1&section=header" width="100%" alt=""/>

  ---

  <br>
  **Built by HIGH TABLE PROTOCOL**
  <br>
  <br>
</div>

---

## Overview

Covex is a high-performance covenant indexer for the Kaspa **Toccata Testnet-12** BlockDAG. It crawls the historic chain, polls live UTXOs, and classifies SilverScript covenants (`aa20`–`aa23` opcodes) — then serves them through a tier-weighted REST API with a premium React/Tailwind explorer frontend.

**Key guarantees:** non-custodial (keys never leave your wallet), on-chain verification only (no synthetic data), single Rust binary with zero external dependencies beyond SQLite and kaspad.

76 covenants indexed live at [hightable.pro](https://hightable.pro).

<br>

---

## Architecture

```mermaid
graph LR
    Browser["Browser"] --> Nginx["Nginx :443"]
    Nginx -->|"/api/→:3005/"| Backend["Axum API :3005"]
    Backend --> DB[("SQLite")]

    Crawler["Historic Crawler"] --> Kaspa[("kaspad :17217")]
    Indexer["Live Indexer"] --> Kaspa
    Verifier["Payment Verifier"] --> Kaspa

    Crawler --> DB
    Indexer --> DB
    Verifier --> DB

    Wallet["Wallet"] -.-> Kaspa

    subgraph Process["covex27-backend"]
        Backend
        Crawler
        Indexer
        Verifier
    end

    style Kaspa fill:#49EACB,stroke:#0A0A0D,color:#000
    style Wallet fill:#49EACB,stroke:#0A0A0D,color:#000
    style DB fill:#1A1A2E,stroke:#49EACB,color:#49EACB
    style Process fill:#11111A,stroke:#333,color:#E0E0E0
    style Nginx fill:#1A1A2E,stroke:#666,color:#E0E0E0
```

<br>

### How the subsystems work together

**Step 1 — Historic Crawler** (`crawler.rs`): Every tick, the crawler fetches the virtual tip DAA via `get_block_dag_info()`, then walks the selected-parent chain backward up to 2,000 blocks per batch. For each block, it downloads full transaction data via `get_block(hash, true)` and scans `tx.payload` for `aa20`–`aa23` covenant opcodes. Tier is determined from the **second output only**: `tx.outputs[1]` must match the treasury P2PKH script (`76a914<hash160>88ac`) and its sompi amount must exceed tier thresholds (100/500/1,000 KAS). Found covenants are inserted via `UNIQUE` constraint — duplicates silently skipped. Progress checkpointed to `crawler_state.last_scanned_daa` after every batch.

**Step 2 — Live Indexer** (`indexer.rs`): Polls `get_utxos_by_addresses()` every 10 seconds for configured seed addresses. Filters out standard wallet outputs (P2PKH ≤50 hex, Schnorr P2PK 68 hex, P2SH 46 hex) via `is_standard_output()`, then checks for covenant opcodes via `looks_like_covenant()`. Each new covenant triggers a `tokio::spawn` for basic UI generation — the polling loop never blocks.

**Step 3 — Payment Verifier** (`payment_verifier.rs`): Monitors treasury UTXOs every 15 seconds. Matches `from_address` to `creator_addr` in the covenants table. Waits for **6 DAA confirmations**. Then: upgrades the covenant record (`verified_tier`, `verified_payment_tx`, `full_logic_summary`, `custom_ui_enabled = 1`), regenerates enhanced UI, and creates a visibility record with tier-appropriate priority (MAX=100, PRO=50, CREATOR=10).

**Step 4 — Native Visibility Engine**: The `get_all_covenants()` function sorts at the **SQL level**:

```sql
ORDER BY
  CASE verified_tier
    WHEN 'MAX' THEN 100 WHEN 'PRO' THEN 50 WHEN 'CREATOR' THEN 10 ELSE 0
  END DESC, timestamp DESC
```

The React frontend renders in the exact order returned. **No frontend re-sorting.**

<br>

---

## Covenant Classification

Both crawler and indexer classify every detected covenant. The crawler inspects `tx.payload`; the indexer inspects output script public key hex. Their classification logic is isomorphic:

```mermaid
graph LR
    Hex["raw hex"] --> P1{"starts 'aa20'<br>+ ends '87'?"}
    P1 -->|Yes| P2SH["p2sh-covenant"]
    P1 -->|No| P2{"contains 'aa21'?"}
    P2 -->|Yes| Extended["extended-covenant"]
    P2 -->|No| P3{"contains 'aa22'?"}
    P3 -->|Yes| MultiSig["multi-sig-covenant"]
    P3 -->|No| P4{"contains '51'?"}
    P4 -->|Yes| Spendable["spendable-covenant"]
    P4 -->|No| Generic["generic-covenant"]

    Hex --> Cat{"category?"}
    Cat -->|"'aa21' present"| Escrow["Escrow & Custody"]
    Cat -->|"'aa22' present"| Tournament["Tournaments"]
    Cat -->|"'aa20'/'aa21' + no '51'"| Skill["Skill Contests"]
    Cat -->|default| General["General"]

    style Hex fill:#1A1A2E,stroke:#49EACB,color:#49EACB
    style P2SH fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Extended fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style MultiSig fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Spendable fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Generic fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Escrow fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Tournament fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Skill fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style General fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
```

<br>

---

## Pricing & Trust

Covex operates a four-tier on-chain verification model. Tier is determined by the amount of KAS sent to the treasury address in a covenant deployment transaction — specifically `tx.outputs[1]` (the second output).

| | **FREE** | **CREATOR** | **PRO** | **MAX** |
|:---|:---:|:---:|:---:|:---:|
| **One-time fee** | `0` | `100 KAS` | `500 KAS` | `1,000 KAS` |
| **Card glow** | — | — | Border | Border + pulse |
| **Expanded details** | — | — | Partial | Full |
| **Interactive UI** | — | ✓ | ✓ | ✓ |
| **Trust builder** | — | — | ✓ | ✓ |
| **Developer notes** | — | — | ✓ | ✓ |
| **Custom interaction buttons** | — | — | ✓ | ✓ |
| **Verified source badge** | — | — | ✓ | ✓ |
| **Custom branding** | — | — | — | ✓ |

<br>

Treasury: `kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m`

---

## Technology Stack

| Layer | Technology | Detail |
|:---|:---|:---|
| **Node** | `kaspad` v0.15 + `--netsuffix=12` | Toccata TN12 full node with `--utxoindex`, wRPC Borsh on `:17217` |
| **Backend** | Rust (2021 edition) · Axum 0.7 · Tokio 1 | Single binary with 4 concurrent tasks |
| **wRPC Client** | `kaspa-wrpc-client` 0.15 | Borsh-encoded WebSocket to kaspad |
| **Consensus** | `kaspa-consensus-core` 0.15 (vendored) | Patched sighash for covenant payload hashing |
| **Database** | SQLite via `rusqlite` 0.31 (bundled) | 6 tables, 15 indexes, `Arc<Mutex<Connection>>` |
| **Hashing** | SHA-256 (`sha2` 0.10) | 20-byte hex digest for script hash computation |
| **Signing** | `secp256k1` 0.29 · `workflow-serializer` 0.18 | Rust-native transaction signing |
| **Frontend** | React 19 · Vite 8 · Tailwind CSS v4 | Static SPA, cyberpunk neon design system |
| **WASM** | `@onekeyfe/kaspa-wasm` | BIP39 key derivation, local tx building and signing for dev mode |
| **Reverse Proxy** | Nginx + Let's Encrypt | TLS termination, `/api/` → `:3005/` proxy, SPA fallback |
| **Deploy** | systemd + bash | `kaspad-toccata.service`, `covex-backend.service`, idempotent scripts |

---

## API Reference

All endpoints return JSON. Nginx strips the `/api/` prefix before forwarding to the backend.

| Method | Path | Description |
|:---|:---|:---|
| `GET` | `/` | `{"status":"ok","app":"Covex v1.0.0","network":"testnet-12"}` |
| `GET` | `/health` | Plain text `OK` — uptime monitoring |
| `GET` | `/covenants` | Tier-sorted array. Each record: `tx_id`, `address`, `amount_kaspa`, `script_hash`, `script_hex`, `covenant_type`, `category`, `creator_addr`, `verified_tier`, `full_logic_summary`, `block_daa_score`, `timestamp`, `ui_config`, `trust_config`, `has_verified_source` |
| `GET` | `/status` | `{"total_covenants":N,"active_covenants":N,"verified_covenants":N,"node_connected":true}` |
| `GET` | `/tiers` | Four tier definitions with pricing, features, colors |
| `POST` | `/covenants/:id/ui-config` | **Secured.** Saves trust config (source URL, notes, interaction schema). Validates wallet address matches on-chain `creator_addr`. PRO/MAX only |
| `GET` | `/covenants/:id/trust-config` | Returns trust configuration or `null` |
| `POST` | `/broadcast` | Broadcast signed tx hex → wRPC. Returns `tx_id`. Zero DB writes |
| `POST` | `/sign-and-broadcast` | Rust-native tx builder + signer — accepts `private_key_hex`, `deployer_addr`, `script_hex`, `tier` |
| `GET` | `/utxos/:address` | UTXOs from kaspad |
| `GET` | `/balance/:address` | Balance from kaspad |

---

## Wallet Integration

Eight wallet providers detected via `window.*` globals (THTProtocol/27 pattern). Desktop/mobile split with 5-second retry loop at 200ms intervals to handle extension injection race conditions.

| Wallet | Detection | Platform |
|:---|:---|:---|
| KasWare | `window.kasware` | Desktop |
| Kastle | `window.kastle` | Desktop |
| Kasperia | `window.kasperia` | Desktop |
| OKX | `window.okxwallet.kaspa` | Desktop + Mobile |
| KaspaCom | `window.kaspa.connect` | Desktop + Mobile |
| Kasanova | `window.kasanova` | Mobile |
| Kaspium | `window.kaspium` | Mobile |
| Tangem | `window.tangem` | Mobile |

**TN12 Mnemonic Dev Mode**: Derives keys locally via `@onekeyfe/kaspa-wasm` — `Mnemonic.fromPhrase()` → `.toSeed('')` → `XPrv` → `derivePath("m/44'/111111'/0'/0/0")` → `toAddress('testnet-12')`. All message signing and transaction building is local. No browser extension required.

---

## Quick Start

```bash
# 1. Start Toccata node (~6–8 min bootstrap)
kaspad --testnet --netsuffix=12 --utxoindex \
  --appdir=/mnt/covex-data/kaspa-data/tn12 \
  --rpclisten-borsh=0.0.0.0:17217

# 2. Configure environment
export KASPA_NETWORK=testnet-12
export KASPA_WRPC_URL=ws://127.0.0.1:17217
export BIND_ADDR=0.0.0.0:3005
export DB_PATH=covex.db
export COVENANT_TREASURY_ADDRESS=kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m

# 3. Build & run backend
cd backend && cargo build --release && ./target/release/covex27-backend

# 4. Build frontend
cd frontend && npm install && npm run build
# Serve dist/ via Nginx or any static server
```

**One-command deploy:**
```bash
bash deploy/deploy-hetzner.sh   # Fresh install
bash deploy/deploy_all.sh       # Production update (idempotent)
```

---

## Database

Auto-created on first startup by `db::open_db()`. All state lives in the 6-table SQLite schema below.

```
covenants                         generated_uis              visibilities
 ├─ tx_id (PK)                    ├─ id (PK, AUTO)           ├─ covenant_id (PK)
 ├─ address                       ├─ covenant_id             ├─ tier
 ├─ amount_kaspa                  ├─ owner_address           ├─ featured
 ├─ script_hash                   ├─ tier                    ├─ priority
 ├─ script_hex                    ├─ ui_html                 └─ custom_domain
 ├─ covenant_type                 ├─ ui_config
 ├─ category                      ├─ slug (UNIQUE)           crawler_state
 ├─ creator_addr                  ├─ is_published            ├─ id (PK, CHECK=1)
 ├─ description                   ├─ featured                └─ last_scanned_daa
 ├─ verified_tier                 └─ ui_generated_at
 ├─ verified_payment_tx
 ├─ verified_at                   payments
 ├─ custom_ui_enabled             ├─ id (PK, AUTO)
 ├─ full_logic_summary            ├─ tx_id (UNIQUE)
 ├─ receiving_addresses           ├─ from_address
 ├─ is_active                     ├─ to_address
 ├─ block_daa_score               ├─ amount_sompi
 └─ timestamp                     ├─ tier
                                  ├─ confirmations
accounts                          ├─ status
 ├─ address (PK)                  ├─ covenant_id
 ├─ tier                          └─ timestamp
 ├─ payment_tx_id
 ├─ paid_at
 ├─ expires_at
 ├─ is_active
 └─ created_at
```

Crawl state checkpointed to `crawler_state` (single row, `id=1`) — restart picks up where it left off.

---

## Repository

```
Covex27/
├── backend/
│   ├── Cargo.toml                        # Rust deps, vendored kaspa-consensus-core patch
│   └── src/
│       ├── main.rs                       # Entry point, Axum router, 11 endpoints
│       ├── covenant_types.rs             # Enums, pricing, UI generation configs
│       ├── crawler.rs                    # Historic BlockDAG walker — selected-parent chain
│       ├── db.rs                         # Schema, CRUD, tier-weighted SQL sort, trust config
│       ├── indexer.rs                    # Live UTXO poller + auto UI generation
│       ├── payment_verifier.rs           # Treasury monitor, 6-conf upgrades, UI regeneration
│       ├── ui_generator.rs               # Basic/enhanced HTML UI with wallet integration
│       ├── signer.rs                     # Rust-native tx builder + signer for covenants
│       ├── broadcast.rs                  # Tx relay — broadcast only, zero DB writes
│       └── dev_wallets.rs               # Dev wallet identities for testing
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Explorer.jsx              # Covenant browser — native sort, tier badges
│       │   ├── CovenantInteractive.jsx   # Detail view — interact/trust/builder tabs
│       │   ├── Deploy.jsx                # SilverScript deployment — WASM tx builder
│       │   ├── Pricing.jsx               # Tier pricing with checkout flow
│       │   ├── Dashboard.jsx             # Creator dashboard
│       │   └── Terms.jsx                 # Terms of service
│       └── components/
│           ├── WalletContext.jsx          # Wallet state + TN12 dev mode
│           ├── WalletButton.jsx           # Multi-wallet detection + connection UI
│           ├── DevWalletModal.jsx         # BIP39 mnemonic / hex key derivation
│           ├── UiBuilder.jsx              # Trust-verification builder (source, notes, buttons)
│           ├── PremiumBuilder.jsx         # Gated UI customization (glow, layout, color)
│           ├── DagBackground.jsx          # Live BlockDAG iframe
│           └── WhatIsKaspa.jsx            # Educational Kaspa overview
├── deploy/
│   ├── deploy-hetzner.sh                 # Fresh deployment
│   ├── deploy_all.sh                     # Production update (idempotent)
│   ├── covex-backend.service             # systemd unit template
│   └── nginx-covex.conf                  # Nginx reverse proxy
├── scripts/
│   └── generate_covex_health_report.sh   # Health diagnostic
├── .env                                   # Local environment
└── README.md
```

<br>

---

<p align="center">
  <a href="https://hightable.pro"><strong>hightable.pro</strong></a>
  <br>
  <br>
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:49EACB,100:0A0A0D&height=1&section=footer" width="100%" alt=""/>
</p>

---

## License

MIT

---

<div align="center">
  <br>
  <strong>Covex</strong> — Built by <strong>HIGH TABLE PROTOCOL</strong> for the Kaspa ecosystem.
  <br>
  Toccata is coming. The window is open.
  <br>
  <br>
</div>
