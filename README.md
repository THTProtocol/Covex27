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

  <h3 style="margin-top: -10px;">Kaspa Covenant Explorer & Visibility Platform</h3>

  <br>

  <a href="https://hightable.pro"><img src="https://img.shields.io/badge/live-76%20covenants-49EACB?style=for-the-badge&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAADISURBVHgBfZI9CsJAEEbHyiJY+AdWYiMWgmAh3kA8gOANIoj2XsA7iEcQO0uw0FbYQkhlsRBGjUQkK4kf6hN4w7zZb3ZmWID/i7IsBUFgep5HvV6P5XKpK4ryIEmSJNfrtTkYDPB9HzAMw3F4sVhwl4fDgXmeR57nMZ/PEccx9H0/mu4mSRJNURSWZRkURcFxHCfPcxbDl5RS4TAMo+s6FhcXiqKQJEk0HA7RNE0QBAEhxK+5iKKoYhgG9vt97X0HXyB1PwAqkPAAAAAASUVORK5CYII=" alt="Live"></a>
  <a href="https://hightable.pro"><img src="https://img.shields.io/badge/network-Toccata%20TN12-49EACB?style=for-the-badge" alt="Network"></a>
  <a href="https://github.com/THTProtocol/Covex27/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-49EACB?style=for-the-badge" alt="License"></a>
  <a href="https://github.com/THTProtocol/Covenant-Studio"><img src="https://img.shields.io/badge/studio-template%20editor-49EACB?style=for-the-badge" alt="Covenant Studio"></a>

  <br>
  <br>

  > **Live:** [hightable.pro](https://hightable.pro) &nbsp; • &nbsp; **Code:** 2,504 lines Rust &nbsp; • &nbsp; **Frontend:** React 19 + Vite 8
  >
  > Non-custodial covenant explorer and visibility platform for native Kaspa SilverScript covenants. One binary. One DB. Zero middlemen. Deploy custom interactive UIs through the Covex Terminal.
  >
  > **Covenant Studio:** [github.com/THTProtocol/Covenant-Studio](https://github.com/THTProtocol/Covenant-Studio) — Separate companion app for designing and customizing game templates. Edit in the Studio, paste code into the Covex Terminal.

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

### Clean Architecture: Two Separate Projects

Covex follows a strict separation of concerns across two independent repositories:

| Project | Repo | Purpose |
|---|---|---|
| **Covex** | [Covex27](https://github.com/THTProtocol/Covex27) | Covenant explorer + visibility platform + Terminal deployment tool. Does NOT contain any game templates, galleries, or built-in UIs. Users paste custom UI code into the Covex Terminal to attach it to their covenant. |
| **Covenant Studio** | [Covenant-Studio](https://github.com/THTProtocol/Covenant-Studio) | Visual template editor. Users design and customize game templates (chess, checkers, connect4, poker), then click "Generate Code" and copy the full UI code. This code is then pasted into the Covex Terminal. |

**Workflow**: Design in Covenant Studio → Copy generated code → Paste into Covex Terminal → Deploy to your covenant.

All paid tiers (Creator, PRO, MAX) have the exact same Terminal and custom UI capabilities. The only difference between paid tiers is visibility on the Explorer. Higher tier = better placement + TVL-weighted boost for MAX.

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
  END DESC, amount_kaspa DESC, timestamp DESC
```

The React frontend renders in the exact order returned. **No frontend re-sorting.**

<br>

---

## Covenant Classification

Both crawler and indexer classify every detected covenant using the `CovenantCategory` enum — 9 categories, driven by a shared `from_script_ops()` function. The crawler inspects `tx.payload`; the indexer inspects output script public key hex. The classification flows through **three stages** below, and PRO/MAX tier creators can override the detected category with a **custom label** via the Trust Builder.

### Stage 1 — Opcode Dispatch

Every covenant payload hits a five-way opcode fork. Fast-path: payloads shorter than 80 bytes are classified as **Flash** covenants.

```mermaid
graph LR
    Hex["payload hex"] --> Size{"raw_len < 80?"}
    Size -->|Yes| Flash["Flash Covenant"]
    Size -->|No| O1{"contains 'aa21'?"}
    O1 -->|Yes| A21["→ aa21 branch"]
    O1 -->|No| O2{"contains 'aa22'?"}
    O2 -->|Yes| A22["→ aa22 branch"]
    O2 -->|No| O3{"contains 'aa23'?"}
    O3 -->|Yes| Pool["Community Pool"]
    O3 -->|No| O4{"contains 'aa20'?"}
    O4 -->|Yes| A20["→ aa20 branch"]
    O4 -->|No| General["General"]

    style Hex fill:#1A1A2E,stroke:#49EACB,color:#49EACB
    style Flash fill:#EF4444,stroke:#EF4444,color:#FFF
    style Pool fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style General fill:#1A1A2E,stroke:#666,color:#E0E0E0
```

### Stage 2 — aa21 / aa20 Sub-Branches

**aa21 branch** (time-based custody patterns):

```mermaid
graph LR
    A21["payload w/ aa21"] --> Gov{"has '51' + '52'?"}
    Gov -->|Yes| Governance["Governance"]
    Gov -->|No| Escrow["Escrow & Custody"]

    style A21 fill:#1A1A2E,stroke:#49EACB,color:#49EACB
    style Governance fill:#A855F7,stroke:#A855F7,color:#FFF
    style Escrow fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
```

**aa20 branch** (single-outcome patterns):

```mermaid
graph LR
    A20["payload w/ aa20"] --> P1{"has '52' or '53'?"}
    P1 -->|Yes| Predictive["Predictive Market"]
    P1 -->|No| P2{"raw_len > 120?"}
    P2 -->|Yes| Settlement["Structured Settlement"]
    P2 -->|No| Skill["Skill Contest"]

    style A20 fill:#1A1A2E,stroke:#49EACB,color:#49EACB
    style Predictive fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Settlement fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
    style Skill fill:#1A1A2E,stroke:#49EACB,color:#E0E0E0
```

### Stage 3 — Custom Category Override (PRO / MAX)

Paid-tier covenant creators can set a custom category name via the **Trust Builder** (`UiBuilder.jsx` → `POST /api/covenants/:id/ui-config` with `custom_category` field). The backend validates wallet ownership against on-chain `creator_addr` and writes the override to both `generated_uis.ui_config` and `covenants.category`.

Custom categories are free-form strings. If set, they replace the auto-detected category on the Explorer card and detail page. If left blank, the auto-detected category remains. This allows DAO treasuries, insurance pools, lotteries, or any niche use case to surface under a descriptive label.

### Category Summary

| Category | Detection Rule | Overridable |
|:---|:---|:---:|
| **Flash** | Any `aa20`–`aa23` + payload < 80 raw bytes | — |
| **Governance** | `aa21` + `51` (OP_1) + `52` (OP_2) — multi-outcome voting | — |
| **Escrow & Custody** | `aa21`, no multi-outcome markers | — |
| **Tournament** | `aa22` | — |
| **Community Pool** | `aa23` | — |
| **Predictive Markets** | `aa20` + `52` (OP_2) or `53` (OP_3) | — |
| **Structured Settlement** | `aa20`, payload > 120 bytes, no OP_2/OP_3 | — |
| **Skill Contests** | `aa20`/`aa21` with `51` (OP_1), single-outcome | — |
| **General** | Fallback (opcodes present, no specific pattern) | — |
| **Custom** | Creator-defined free-form string | ✓ PRO/MAX |

Classification types (the `covenant_type` column, assigned by the `classify()` / `classify_covenant()` functions):

| Type | Detection |
|:---|:---|
| `p2sh-covenant` | Starts `aa20` AND ends `87` |
| `extended-covenant` | Contains `aa21` |
| `multi-sig-covenant` | Contains `aa22` |
| `community-pool-covenant` | Contains `aa23` |
| `spendable-covenant` | Contains `51` (indexer only) |
| `generic-covenant` | No opcode match (fallback) |

<br>

---

## Pricing & Trust

Covex operates a four-tier on-chain verification model. Tier is determined by the amount of KAS sent to the treasury address in a covenant deployment transaction — specifically `tx.outputs[1]` (the second output). Prices are one-time, not recurring.

**All paid tiers (Creator, PRO, MAX) give identical access to the same Covex Terminal for deploying custom interactive UIs. The ONLY difference between paid tiers is visibility ranking on the Explorer. Higher tier = better placement. No other features are tier-gated.**

| | **FREE** | **CREATOR** | **PRO** | **MAX** |
|:---|:---:|:---:|:---:|:---:|
| **One-time fee** | `0` | `100 KAS` | `500 KAS` | `1,000 KAS` |
| **Custom covenant** | — | 1 covenant | 1 covenant | 1 covenant |
| **Terminal access** | — | ✓ | ✓ | ✓ |
| **Custom UI deployment** | — | ✓ | ✓ | ✓ |
| **Explorer placement** | Standard | Basic | Featured | Top priority |
| **TVL ranking boost** | — | — | — | ✓ |

### Covenant Architecture

All paid covenants are user-configurable through the Covex Terminal:

- **Fee percentage**: 0% up to 5% kept in the covenant on every claim
- **Reusable by default**: Multiple independent game sessions on the same covenant as long as funds remain
- **Partial claims**: Configure winner claim percentage (rest stays in covenant for future games)
- **Top-up capability**: Allow new players to add funds to the pot
- **Owner safeguards**: Close covenant only after cooldown + no active games (anti-sabotage)

### ZK Proofs & Claim Verification

Covex is fully ZK-ready for trustless covenant execution:

- **ZK stack**: RISC Zero zkVM + Groth16 verifier
- **Claim workflow**: "Claim Now" triggers automatic ZK proof generation when possible
- **Fallback**: Covex trusted oracle (signed outcome) for instant UX while ZK infrastructure matures

### Covex Terminal

The central deployment tool for all paid users. After upgrading, access the Terminal tab on your covenant detail page to:

- Paste custom UI code/configuration from any external source
- Configure covenant parameters (fee percentage, claim rules, top-up settings)
- Set claim method (ZK proof, trusted oracle, or auto-detect)
- Apply custom CSS and branding
- Export self-contained HTML covenant pages

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
│           ├── CovexTerminal.jsx           # Terminal deployment tool for custom UIs
│           ├── CovenantPreview.jsx          # Covenant page preview renderer
│           ├── DagBackground.jsx            # Live BlockDAG iframe
│           └── WhatIsKaspa.jsx              # Educational Kaspa overview
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

---

## Covex Terminal & Current Architecture (2026)

The Covex Terminal (`frontend/src/components/CovexTerminal.jsx`) is the primary professional interface for paid-tier creators. It replaced earlier builder concepts and is deliberately neutral — it is an engineering configuration surface, not a game launcher.

### Core Capabilities
- **ZK Circuit Selection**: 12 circuit types (Chess v1/v2, Poker, Blackjack, Dice, Connect 4, Checkers, Go, Backgammon, Battleship, Sudoku, Custom). Each auto-selects the appropriate `zk_circuit` and `zk_verifier_key`.
- **Resolution Modes** (three options wired end-to-end):
  - `zk`: Uses `OpZkVerify` in generated SilverScript with circuit-specific verifier keys (e.g. `0xCHESSv1_8x8_STANDARD_AUDITED`).
  - `oracle`: Covex Oracle with `OpCheckSig`.
  - `custom_oracle`: User-supplied oracle public key.
- **Full SilverScript Generator**: Produces complete, production-ready covenants including `fee_basis_points`, `platform_share`, `creator_share`, outcome enums, payout branches, and resolution opcodes.
- **Custom UI Attachment**: Accepts full HTML/JS/CSS bundles (designed in Covenant Studio) and persists them via `POST /api/terminal-config/:covenant_id`.
- **Chess v1 ZK Arena** (built-in functional demo for the chess_v1 circuit):
  - Uses `react-chessboard` + `chess.js` for real legal play.
  - Supports stake amount selection with live 2% covenant creator fee calculation.
  - Full match flow, resignation, and automatic game-over detection (checkmate, stalemate, 50-move rule, threefold repetition, insufficient material).
  - "Submit ZK Proof" commits the complete PGN + final FEN and shows explicit payout breakdown (winner receives 98% of pot).

All configuration (game_type, resolution_mode, zk_circuit, custom_ui_code, fee, reusable, allow_topups) is saved server-side and merged by the Explorer API so custom UIs appear on live covenant cards.

### Backend Persistence Layer
- `GET/POST /api/terminal-config/:covenant_id` handlers in `main.rs`.
- Data stored in `generated_uis` table (`ui_html` + `ui_config` JSON containing the full Terminal state).
- `/api/covenants` response automatically merges `custom_ui_html` and `custom_ui_config` for every covenant that has Terminal-saved data.
- This powers live previews (ChessMini, etc.) without any on-chain data for the UI layer.

### Paid-Tier Flow (Strict Enforcement)
1. `/pricing` — Real on-chain payment to treasury (Creator 100 KAS, PRO 500 KAS, MAX 1 000 KAS).
2. After confirmed payment → user is sent to `/paid-builder` ("Your Covenants" list).
3. Primary action on every covenant card is **"Go to Terminal"**.
4. Free `/deploy` is hard-blocked for anyone with a paid tier in localStorage + backend verification.
5. All paid users get identical Terminal power — higher tiers only affect Explorer ranking weight.

### Hosting & Production Reality
- Single Hetzner box (178.105.76.81).
- Main application: `root /root/htp/public` served at `https://hightable.pro`.
- Covenant Studio: `alias /root/htp/studio/` served reliably at `https://hightable.pro/studio/` (path-based, no dependency on the `studio.hightable.pro` DNS record).
- Nginx SPA routing + proper asset handling for both apps.
- Backend (Rust Axum) runs on :3005, proxied under `/api/`.
- WebSocket support for live updates.

This architecture gives creators a complete, on-chain-enforceable experience: professional configuration in Covex Terminal → rich visuals from Covenant Studio → ZK or oracle resolution → automatic Explorer visibility based on tier.

