<div align="center">
<br/>

```
 ██████╗ ██╗   ██╗██╗   ██╗███████╗██╗  ██╗
██╔════╝██║   ██║██║   ██║██╔════╝╚██╗██╔╝
██║     ██║   ██║██║   ██║█████╗   ╚███╔╝ 
██║     ██║   ██║╚██╗ ██╔╝██╔══╝   ██╔██╗ 
╚██████╗╚██████╔╝ ╚████╔╝ ███████╗██╔╝ ██╗
 ╚═════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝
```

<br/>

**Covex v1.0.0 Ultimate Release**

*Index. Compile. Deploy. All on the BlockDAG.*

<br/>

[![Language](https://img.shields.io/badge/Language-Rust_1.80+-orange?style=for-the-badge&labelColor=0a0a0a&color=orange)](https://rust-lang.org)
[![Network](https://img.shields.io/badge/Network-Kaspa_TN12-00ff41?style=for-the-badge&labelColor=0a0a0a&color=00ff41)](https://kaspa.org)
[![Build](https://img.shields.io/badge/Build-Stable-success?style=for-the-badge&labelColor=0a0a0a&color=00ff41)](https://github.com/THTProtocol/Covex27)
[![Storage](https://img.shields.io/badge/Storage-SQLite-blue?style=for-the-badge&labelColor=0a0a0a&color=blue)](https://sqlite.org)
[![Frontend](https://img.shields.io/badge/Frontend-React_19-blue?style=for-the-badge&labelColor=0a0a0a&color=blue)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge&labelColor=0a0a0a&color=6366f1)](LICENSE)

<br/>

[![Repo](https://img.shields.io/badge/Repo-THTProtocol%2FCovex27-181717?style=flat-square&labelColor=111111&color=111111)](https://github.com/THTProtocol/Covex27)
&nbsp;
[![Kaspa](https://img.shields.io/badge/Kaspa_Explorer-explorer.kaspa.org-3B82F6?style=flat-square&labelColor=111111&color=111111)](https://explorer.kaspa.org)
&nbsp;
[![X](https://img.shields.io/badge/@THTProtocol-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/THTProtocol)

<br/>
<br/>

```
Every covenant. Every block. Indexed. Verified.
Stateful. Fast. Production-grade.
SQLite-powered indexer. SaaS-ready.
```

</div>

---

<br/>

## What is Covex?

Covex is a **stateful covenant indexer and SaaS platform** for the [Kaspa BlockDAG](https://kaspa.org). It connects to a Kaspa wRPC node, continuously indexes covenant UTXOs into a local SQLite database, and serves a premium glassmorphism React UI for browsing, compiling, and deploying SilverScript covenants.

```
Chain is the truth. Covex is the window.
```

<br/>

---

## Features

### Production-Grade Covenant Indexer
- Continuous wRPC-based scanning of the Kaspa BlockDAG for covenant UTXOs at 10 BPS
- Covenant detection via script opcode introspection (OP_BLAKE2B patterns: aa20-aa23)
- KIP-17 (extended script opcodes) and KIP-20 (covenant IDs) support
- Toccata hard-fork compatible (TN12 live; mainnet activation June 2026)
- Reorg-resilient stateful architecture with SQLite persistence
- Background tokio task with configurable scan interval
- **Zero fake data.** Only real covenants indexed from the live TN12 node.

### On-Chain Payment Verification
- Zero-trust payment verification: all payments confirmed on-chain via wRPC
- Automatic tier upgrades upon payment confirmation (6+ DAA confirmations)
- Tier-specific address monitoring with memo/tag logic
- One-time KAS payments: Explorer (Free), Creator (100 KAS), PRO (500 KAS), MAX (1000 KAS)
- Payment verifier background task with DAA-based confirmation tracking
- Prominent "Pay with QR Code" button that generates a QR code for exact treasury address + amount

### Non-Custodial Wallet Connect Hub
- Full Wallet Connect section with KasWare, Kaspium, OneKey, Tangem, and KDX support
- Rusty Kaspa WASM SDK integration for signing without key storage
- One-click connect, balance display, transaction preview, and signing
- URI deep-link fallback for any kaspa: or kaspatest: compatible wallet
- All covenant interactions (deploy, interact, claim) route through connected wallet

### Premium Three.js BlockDAG Background
- Full-screen animated BlockDAG background with live Three.js + WebGL
- Multi-level DAG topology with parent-child edges, flowing data particles
- Glowing heaviest consensus chain with pulsing halo and gold tip markers
- Mouse-responsive parallax with gentle orbit rotation
- Elegant, subtle glassmorphism UI layered on top

### Interactive Customizable UI Builder
- Tier-based UI builder for paid covenants (Creator/PRO/MAX)
- Real-time live preview with primary color, background style, layout selection
- Component toggles: wallet button, parameter form, featured banner
- MAX tier unlocks custom logo URL and editorial layout
- Generated UI is fully interactable with glassmorphism design

### SilverScript Compiler Bridge
- Reliable bridge to native silverc compiler for real-time compilation
- Bytecode preview and script template hash output
- Security linting and AST validation
- Temporary file management with automatic cleanup

### Premium Glassmorphism UI
- React 19 + Vite + Tailwind v4 + Framer Motion + Three.js
- True glassmorphism: backdrop-blur, rgba backgrounds, thin borders
- Responsive design for all device sizes with zero lag
- Tier-based SaaS access control with pricing page
- Full Terms and Conditions, Legal modal, and What Is Kaspa reference panel

### Production-Grade Architecture
- Rust backend: Axum 0.7 + tokio + rusqlite + kaspa-wrpc-client 0.15.0
- SQLite with bundled feature for zero-setup durability
- Rate-limited API with CORS, 5MB request body cap
- Docker-ready with docker-compose.yml for backend + frontend
- Zero-proxy wRPC WebSocket direct connection to Kaspa node
- Mainnet/Testnet toggle via single .env variable (KASPA_NETWORK)

<br/>

---

## Architecture

```
    Kaspa Node (kaspad)
          |
          | wRPC WebSocket
          v
    +----------------------+
    |   Rust Indexer       |   tokio::spawn loop  
    |   Background Task    |   polls every ~12s
    +-----------+----------+
                |  INSERT OR REPLACE
                v
          +-------------+
          |  SQLite DB  |   covex.db
          +------+------+
                 |  SELECT
                 v
    +----------------------+
    |   Axum API Server    |   :3001
    |   /api/covenants     |
    |   /api/compile       |
    +-----------+----------+
                |  JSON
                v
    +----------------------+
    |   React Frontend     |   :5173
    |   Vite + Tailwind v4 |
    |   Three.js BlockDAG  |
    +----------------------+
```

<br/>

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| DAG Indexer | kaspa-wrpc-client v0.15.0 | Polls node for covenant UTXOs |
| Storage | rusqlite v0.31 (bundled) | Durable on-disk covenant store |
| API Server | axum 0.7 + tower-http | REST endpoints on :3001 |
| Compiler | silverc binary | Compile .sil to bytecode |
| Frontend | React 19 + Vite + Tailwind v4 | Glassmorphism UI |
| Background | Three.js | Live BlockDAG visualization |

<br/>

---

## Pricing

| Tier | Price | Includes |
|---|---|---|
| Explorer | Free | Browse, search, read-only covenant view |
| Creator | 100 KAS | Interactive UI generation + standard listing |
| PRO | 500 KAS | Featured + higher ranking + advanced UI tools |
| MAX | 1,000 KAS | Top placement + full UI design suite + custom branding |

All covenants appear in the public registry. Paid tiers add interactive UI panels and increased visibility. One-time payment, permanent listing.

<br/>

---

## Getting Started

### Requirements

- Rust toolchain 1.80+
- Node.js 20+
- Kaspa node with wRPC enabled (kaspad or kaspa-node)
- silverc compiler (for covenant creation)

### Install

```bash
git clone https://github.com/THTProtocol/Covex27.git
cd Covex27
cp .env.example .env
```

### Configure

```bash
# .env
KASPA_NETWORK=testnet-12
KASPA_WRPC_URL=ws://127.0.0.1:17110
BIND_ADDR=0.0.0.0:3001
DB_PATH=../covex.db
RUST_LOG=covex27_backend=debug,kaspa_wrpc=info
```

### Build & Run

```bash
# Backend
cd backend
cargo build --release
./target/release/covex27-backend

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # Vite on :5173, proxies /api/* -> :3001
```

### Verify

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/covenants
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"covenant Test {}"}'
```

<br/>

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/health | Server health |
| GET | /api/status | Node connection + DAG info |
| GET | /api/covenants | All indexed covenants from SQLite |
| GET | /api/utxos | Covenant UTXO entries |
| GET | /api/tiers | Pricing tier definitions |
| POST | /api/compile | Compile SilverScript code |
| POST | /api/generate-ui | Generate interactive covenant UI |
| GET | /api/verify-payment | Verify on-chain payment |

<br/>

---

## Security

- **No admin keys:** Covex holds no privileged keys over any covenant.
- **No custody:** All KAS is held in UTXO covenant scripts on-chain.
- **Immutable covenants:** SilverScript covenant scripts are final the moment they hit the chain.
- **Non-custodial platform:** Covex never stores or has access to private keys. All signing happens in your wallet.

<br/>

---

## License

Covex is released under the MIT License.

```
Covex v1.0.0 Ultimate Release
Live DAG background. Prominent Kaspa panel.
Real covenants only. Customizable interactive UI builder.
Working wallet connect. Clean design. Perfect.
```