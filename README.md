<div align="center">

<img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjE2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiM0OUVBQ0I7c3RvcC1vcGFjaXR5OjEiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiMwQTBBMEQ7c3RvcC1vcGFjaXR5OjEiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48dGV4dCB4PSI0MCIgeT0iNjAiIGZvbnQtZmFtaWx5PSJtb25vc3BhY2UiIGZvbnQtc2l6ZT0iNDgiIGZpbGw9InVybCgjZykiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7ilojilqjil6Ig4paI4pag4peiIOKWiOKWqOKXoiDilojilqril6Ig4paI4pao4peiPC90ZXh0Pjwvc3ZnPg==" alt="COVEX" width="600" />

<!--  Fallback  ASCII  for  non-image  renderers  -->
<pre style="color:#49EACB;line-height:1.2;font-size:12px;letter-spacing:2px;display:none">
   ▄▄▄▄▄▄▄▄        ▄▄▄▄▄▄▄▄     ▄▄   ▄▄  ▄▄▄▄▄▄▄▄▄▄  ▄▄   ▄▄  ▄▄  ▄▄  ▄▄
  ▄█▀▀▀▀▀▀▀██      ▄█▀▀▀▀▀███    ████  ██  ██▀▀▀▀▀▀▀▀  ██   ██  ██  ██  ██
  ██▄            ▄█▀     ███   ██ ██ ██  ██           ██   ██   ██▄██  ██
  ▀█████████▄    ██      ▀██  ██  ██ ██  ██████████▄  ▀██▄██▀    ▀██▀   ██
    ▀▀▀▀▀▀██▄    ██▄     ██  █████████  ██▀▀▀▀▀▀▀▀    ▀██▀           ██
  ▄       ██▀    ▀████████▀   ▀██████▀   ▀██████████    ██            ██
  ▀████████▀       ▀▀▀▀▀▀      ▀▀▀▀▀      ▀▀▀▀▀▀▀▀    ▀▀            ▀▀
</pre>

<br />

<h2 style="color:#49EACB;font-weight:800;letter-spacing:4px;text-transform:uppercase;margin:0">
  Covex
</h2>
<h3 style="color:#8B9DB5;font-weight:400;margin:4px 0 0 0">
  The Stateful Kaspa Covenant Indexer
</h3>

<br />

> **DAG is the truth. &ensp;Covex is the window.**

<br />

<p align="center">
  <a href="https://rust-lang.org"><img src="https://img.shields.io/badge/Rust-1.80+-%2349EACB?style=for-the-badge&logo=rust&logoColor=white&labelColor=0A0A0D" /></a>
  <a href="https://kaspa.org"><img src="https://img.shields.io/badge/Network-Testnet_10-%2349EACB?style=for-the-badge&logo=kash&logoColor=%2349EACB&labelColor=0A0A0D" /></a>
  <a href="https://github.com/THTProtocol/Covex27/actions"><img src="https://img.shields.io/badge/Build-Production-%2349EACB?style=for-the-badge&logo=githubactions&logoColor=white&labelColor=0A0A0D" /></a>
  <a href="https://sqlite.org"><img src="https://img.shields.io/badge/Storage-SQLite-%2349EACB?style=for-the-badge&logo=sqlite&logoColor=white&labelColor=0A0A0D" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/Frontend-React_19-%2349EACB?style=for-the-badge&logo=react&logoColor=white&labelColor=0A0A0D" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-%2349EACB?style=for-the-badge&logo=open-source-initiative&logoColor=white&labelColor=0A0A0D" /></a>
</p>

<br />

```
   Index  →  Discover  →  Customize  →  Deploy   •   All on the BlockDAG.
```

</div>

---

## 🪟 &nbsp; What is Covex?

Covex is a **production-grade covenant indexer and SaaS platform** built exclusively for the
[Kaspa BlockDAG](https://kaspa.org). It continuously discovers SilverScript covenant UTXOs by
connecting directly to a Kaspa wRPC node, persisting them in a local SQLite database, and
serving a premium glass-morphism React frontend with a **payment-gated interactive UI Builder**.

Currently live on **Kaspa Testnet-10 (TN10)** at [hightable.pro](https://hightable.pro)
with a full historic crawl-and-index pipeline operating at 10 BPS.

> **Covex does not *create* covenants — the DAG does.**
> Covex **indexes** them and generates interactive, customizable user interfaces so anyone
> can browse, interact with, and deploy SilverScript smart contracts on the fastest
> proof-of-work network in the world.

---

## ⚙️ &nbsp; Core Features

<table>
<tr>
<td width="50%">

### 🔍 &nbsp; Historic BlockDAG Crawler
Walks the selected-parent DAG lineage from tip to genesis, scanning every block
for covenant script opcodes (`aa20`–`aa23`). State is checkpointed in SQLite every
tick — survives node restarts and auto-resumes from the last scanned DAA score.

### ⚡ &nbsp; Live Mempool Indexer
Direct wRPC connection to `kaspad` for real-time covenant detection. Polls seed
addresses every 10 seconds, classifies new UTXOs by type (P2SH, extended, multi-sig,
spendable), and auto-generates basic interactive UIs for every discovered covenant.

### 🎨 &nbsp; Payment-Gated UI Builder
One-time KAS payments unlock progressive customization tiers. Live preview panel
with color swatches, layout toggles, title/description overrides, button styling,
and component toggles. Configuration persists in `localStorage` and publishes
instantly.

</td>
<td width="50%">

### 💰 &nbsp; On-Chain Payment Verifier
Monitors the treasury address via wRPC, matches incoming UTXOs to covenant creator
addresses, auto-upgrades covenant records after 6 DAA confirmations, and regenerates
enhanced UIs with full disclosure fields — all zero-trust.

### 🔐 &nbsp; Non-Custodial Wallet Suite
Inline SVG logos for KasWare, Kaspium, Kastle, Kaspa Web, Kasanova, and KDX.
URI deep-link fallback for wallets without browser injection. QR code generation
for every payment flow. **Keys never leave the user's wallet.**

### 🔮 &nbsp; Oracle-Ready Architecture
Designed to handle DLC (Discreet Log Contract) signatures for predictive market
settlement. Multi-sig oracle paths and covenant-based escrow resolution are
first-class architectural concerns — not afterthoughts.

</td>
</tr>
</table>

---

## 🏗️ &nbsp; Architecture

```mermaid
%%{init: {'theme':'dark','themeVariables':{'primaryColor':'#49EACB','primaryTextColor':'#0A0A0D','primaryBorderColor':'#49EACB','lineColor':'#6B7280','secondaryColor':'#111827','tertiaryColor':'#1F2937','background':'#0A0A0D','mainBkg':'#111827','nodeBorder':'#374151','clusterBkg':'#0F172A','clusterBorder':'#1E293B','titleColor':'#49EACB','edgeLabelBackground':'#0F172A'}}}%%
graph TB
    subgraph USER["🌐  USER  ENVIRONMENT"]
        direction LR
        BROWSER["<b>React SPA</b><br/>Vite · Tailwind v4 · Framer Motion<br/>Three.js BlockDAG Viz"]
        WALLET["<b>KasWare / Kaspium</b><br/>Browser · Mobile · Desktop"]
    end

    subgraph EDGE["⚡  EDGE  LAYER"]
        NGINX["<b>Nginx 1.24</b><br/>HTTPS · Gzip · Cache<br/>SPA Fallback · Reverse Proxy"]
    end

    subgraph CORE["🦀  RUST  BACKEND  ·  Port 3005"]
        direction TB
        AXUM["<b>Axum 0.7 API</b><br/>REST Endpoints<br/>CORS · Rate-Limited"]
        IDX["<b>Live Indexer</b><br/>UTXO Polling<br/>10s Intervals"]
        CRAWL["<b>Historic Crawler</b><br/>DAG Walk · Batch Scan<br/>Checkpointed"]
        PAY["<b>Payment Verifier</b><br/>Treasury Monitor<br/>6-Conf Auto-Upgrade"]
    end

    STORE[("<b>SQLite</b><br/>covex.db<br/>Covenants · UI · State")]
    NODE(("<b>kaspad TN10</b><br/>UTXO Index<br/>wRPC Borsh :17110"))

    BROWSER -->|"HTTPS"| NGINX
    WALLET -.->|"SilverScript TX"| NODE
    NGINX -->|"SPA Delivery"| BROWSER
    NGINX -->|"/api/*"| AXUM
    AXUM -->|"Read/Write"| STORE
    IDX -->|"Poll UTXOs"| NODE
    CRAWL -->|"Scan Blocks"| NODE
    PAY -->|"Verify UTXOs"| NODE
    IDX & CRAWL & PAY --->|"INSERT/UPDATE"| STORE

    classDef kaspa fill:#49EACB,stroke:#111,stroke-width:3px,color:#0A0A0D,font-weight:bold
    classDef edge fill:#1E293B,stroke:#334155,stroke-width:2px,color:#E2E8F0
    classDef core fill:#0F172A,stroke:#1E293B,stroke-width:1px,color:#CBD5E1
    class NODE,WALLET kaspa
    class NGINX edge
    class AXUM,IDX,CRAWL,PAY core
```

<br />

### 📊 &nbsp; Data Flow Sequence

```mermaid
%%{init: {'theme':'dark','themeVariables':{'actorBkg':'#0F172A','actorBorder':'#49EACB','actorTextColor':'#E2E8F0','actorLineColor':'#374151','signalColor':'#6B7280','signalTextColor':'#E2E8F0','labelBoxBkgColor':'#111827','labelBoxBorderColor':'#374151','noteBkgColor':'#0F172A','noteBorderColor':'#334155','noteTextColor':'#94A3B8','loopTextColor':'#E2E8F0','activationBkgColor':'#1E293B','sequenceNumberColor':'#0A0A0D'}}}%%
sequenceDiagram
    autonumber
    participant K as ⛓️ Kaspad (wRPC :17110)
    participant C as 🕷️ Historic Crawler
    participant I as 📡 Live Indexer
    participant P as 💰 Payment Verifier
    participant D as 🗄️ SQLite
    participant A as 🌐 Axum API
    participant N as 🔀 Nginx
    participant R as 🖥️ React Frontend

    Note over C,D: ──── BACKGROUND TASKS (tokio::spawn) ────

    loop Every 200ms
        C->>K: get_block_dag_info()
        K-->>C: { virtualDaaScore, parentHashes }
        C->>K: get_block(hash)
        K-->>C: { transactions[], outputs[] }
        C->>C: Inspect scriptPublicKey
        C->>D: INSERT OR IGNORE covenant
        C->>D: UPDATE crawler_state checkpoint
    end

    loop Every 10s
        I->>K: get_utxos_by_addresses(seeds)
        K-->>I: UTXO entries
        I->>I: Classify covenant type
        I->>D: INSERT OR REPLACE covenant
    end

    loop Every 15s
        P->>K: get_utxos_by_addresses(treasury)
        K-->>P: Payment UTXOs
        P->>P: Match by creator_addr
        alt confirmations ≥ 6
            P->>D: Upgrade covenant tier
            P->>D: Regenerate enhanced UI
        end
    end

    Note over A,R: ──── REQUEST/RESPONSE FLOW ────

    R->>N: GET /api/covenants
    N->>A: Proxy /api/* → :3005
    A->>D: SELECT * FROM covenants
    D-->>A: Vec<DbCovenant>
    A-->>N: JSON { total, covenants[] }
    N-->>R: 200 OK · Gzip
    R->>R: Render Explorer Grid
```

---

## 🔧 &nbsp; Technology Stack

| Layer | Technology | Purpose |
|:------|:-----------|:--------|
| **Node** | `kaspad` v1.1.1-toc.1 | Full Kaspa node — UTXO index + wRPC Borsh + Toccata hard-fork support |
| **Runtime** | Rust 1.80 (edition 2021) | Zero-cost abstractions, async I/O, memory safety |
| **Framework** | Axum 0.7 + Tokio | High-performance async HTTP with extractors and layers |
| **Database** | SQLite 3 (`rusqlite` 0.31) | Embedded, zero-config, bundled — perfect for single-node deployments |
| **wRPC** | `kaspa-wrpc-client` 0.15.0 | Borsh-encoded WebSocket RPC — 100× faster than JSON |
| **Frontend** | React 19 + Vite 8 + Tailwind v4 | Glass-morphism UI with Framer Motion animations |
| **3D** | Three.js via `<iframe>` | Live BlockDAG particle visualization from `kgi.kaspad.net` |
| **Proxy** | Nginx 1.24 | TLS termination, Gzip compression, SPA fallback, reverse proxy |
| **Infra** | systemd + PM2 | Process supervision with auto-restart and log rotation |
| **CI/CD** | Git + `deploy-hetzner.sh` | Single-command Hetzner VPS deployment |

---

## 🚀 &nbsp; Node Requirements

Covex requires a full Kaspa node with **UTXO index** and **wRPC Borsh** enabled.
The exact launch command for Testnet-10:

```bash
kaspad \
  --testnet                             \
  --utxoindex                           \
  --rpclisten=0.0.0.0:16110             \
  --listen=0.0.0.0:16111                \
  --rpclisten-borsh=0.0.0.0:17110
```

> **⚠️ &nbsp; Critical:** The `--utxoindex` flag is mandatory — without it the indexer cannot
> resolve script public keys. The `--rpclisten-borsh` flag opens the WebSocket port that
> Covex's `kaspa-wrpc-client` connects to.

---

## ⚡ &nbsp; Quick Start

### Prerequisites

| Tool | Version | Check |
|:-----|:--------|:------|
| Rust | 1.80+ | `rustc --version` |
| Node.js | 20+ | `node --version` |
| kaspad | 1.1.1-toc.1 | `kaspad --version` |

### Build & Deploy

```bash
# 1. Clone
git clone https://github.com/THTProtocol/Covex27.git && cd Covex27

# 2. Configure
cp deploy/.env.production .env

# 3. Build backend (release)
cd backend && cargo build --release

# 4. Build frontend (production bundle)
cd ../frontend && npm install && npm run build

# 5. Start backend
cd .. && ./backend/target/release/covex27-backend &

# 6. Serve frontend (dev) or rely on nginx (production)
cd frontend && npm run dev    # → http://localhost:5173
```

### Production (Hetzner VPS)

```bash
sudo deploy/deploy-hetzner.sh
sudo systemctl restart covex-backend
sudo systemctl reload nginx
```

---

## 📡 &nbsp; API Reference

All endpoints served by Axum on `:3005`, proxied by Nginx at `/api/*`.

| Method | Endpoint | Response |
|:-------|:---------|:---------|
| `GET` | `/health` | `"OK"` |
| `GET` | `/status` | `{"total_covenants":N, "active_covenants":N, "verified_covenants":N, ...}` |
| `GET` | `/covenants` | `{"total":N, "covenants":[...]}` — full indexed covenant list |
| `GET` | `/tiers` | `{"tiers":[...]}` — Explorer/Creator/PRO/MAX definitions |

```bash
# Live example
curl -s https://hightable.pro/api/covenants | jq '.total'
# → 4
```

---

## 💎 &nbsp; Pricing Tiers

| Tier | Cost | Features |
|:-----|:-----|:---------|
| 🔍 &nbsp; **Explorer** | **Free** | Browse all covenants · read-only view · limited disclosure · danger banner |
| 🎨 &nbsp; **Creator** | **100 KAS** | Full disclosure · verified badge · interactive UI Builder · standard listing |
| ⭐ &nbsp; **PRO** | **500 KAS** | Featured placement · advanced UI tools · covenant images · priority indexing |
| 👑 &nbsp; **MAX** | **1,000 KAS** | Top placement · custom branding · full design suite · custom domain embedding |

> 💡 &nbsp; All payments are **one-time** and **non-custodial**. Processed on the DAG via the
> treasury address, verified with 6 DAA confirmations. No subscriptions. No recurring charges.

---

## 🔒 &nbsp; Security

| Principle | Implementation |
|:----------|:---------------|
| **Zero key exposure** | Covex never accesses, stores, or transmits private keys — all signing happens in-user wallet |
| **Client-side signing** | Transactions signed locally via KasWare/Kaspium/Kastle browser injection or URI deep-link |
| **On-chain verification** | Every payment confirmed directly on the BlockDAG via wRPC UTXO inspection — no off-chain trust |
| **Immutable deployment** | Covenant scripts are permanent once confirmed — no administrative override possible |
| **Checkpointed resilience** | Crawler persists DAA scan position to SQLite on every tick — node restarts never lose progress |
| **Transparency tiers** | FREE tier shows DANGER banner with limited disclosure; paid tiers unlock full verified fields |

---

## 📄 &nbsp; License

Covex is released under the **MIT License**. See [LICENSE](LICENSE) for full terms.

<br />

<div align="center">

```
╔══════════════════════════════════════════════════════════════╗
║  Covex v1.0.0  ·  Live on Kaspa Testnet-10  ·  hightable.pro  ║
║  Rust + Axum + SQLite + React + Nginx + systemd              ║
║  Crawler · Indexer · Verifier · Builder · API                ║
║                                                              ║
║  DAG is the truth.  Covex is the window.                     ║
╚══════════════════════════════════════════════════════════════╝
```

</div>
