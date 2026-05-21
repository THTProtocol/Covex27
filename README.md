<div align="center">
  
  <br/>
  
  ```
   ██████╗ ██████╗ ██╗   ██╗██╗  ██╗███████╗
  ██╔════╝██╔═══██╗██║   ██║╚██╗██╔╝╚══███╔╝
  ██║     ██║   ██║██║   ██║ ╚███╔╝   ███╔╝ 
  ██║     ██║   ██║██║   ██║ ██╔██╗  ███╔╝  
  ╚██████╗╚██████╔╝╚██████╔╝██╔╝ ██╗███████╗
   ╚═════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝
  ```
  
  <br/>
  
  **COVEX - Covenant Explorer for Kaspa**
  
  *The Premier Stateful Indexer for Covenant-Based Applications*
  
  <br/>
  
  [![Language](https://img.shields.io/badge/Language-Rust_1.80+-orange?style=for-the-badge&labelColor=0a0a0a&color=orange)](https://rust-lang.org)
  [![Network](https://img.shields.io/badge/Network-Kaspa_TN12-00ff41?style=for-the-badge&labelColor=0a0a0a&color=00ff41)](https://kaspa.org)
  [![Build](https://img.shields.io/badge/Build-Stable-success?style=for-the-badge&labelColor=0a0a0a&color=00ff41)](https://github.com/THTProtocol/Covex27)
  [![Storage](https://img.shields.io/badge/Storage-SQLite-blue?style=for-the-badge&labelColor=0a0a0a&color=blue)](https://sqlite.org)
  [![Frontend](https://img.shields.io/badge/Frontend-React_19-blue?style=for-the-badge&labelColor=0a0a0a&color=blue)](https://react.dev)
  [![License](https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge&labelColor=0a0a0a&color=6366f1)](LICENSE)
  
  <br/>
  
  ```
  Index. Compile. Deploy. All on the BlockDAG.
  ```
  
</div>

<br/>

## What is COVEX?

COVEX is a **stateful covenant indexer and SaaS platform** for the [Kaspa BlockDAG](https://kaspa.org). It continuously indexes covenant UTXOs from a Kaspa wRPC node into a local SQLite database, providing a premium glassmorphism UI for browsing, compiling, and deploying SilverScript covenants.

```
Chain is the truth. COVEX is the window.
```

<br/>

## 🌟 Key Features

### Production-Grade Covenant Indexer
- Continuous wRPC-based scanning of the Kaspa BlockDAG at 10 BPS
- Covenant detection via script opcode introspection (OP_BLAKE2B patterns)
- KIP-17 (extended script opcodes) and KIP-20 (covenant IDs) support
- Reorg-resilient stateful architecture with SQLite persistence
- **Zero synthetic data**—only real covenants indexed from the live TN12 node

### On-Chain Payment Verification
- Zero-trust payment verification confirmed on-chain via wRPC
- Automatic tier upgrades with DAA confirmation tracking
- One-time KAS payments for tier access (Explorer, Creator, PRO, MAX)
- QR code generation for exact treasury address and payment amounts

### Non-Custodial Wallet Connect Hub
- Full Wallet Connect support (KasWare, Kaspium, OneKey, Tangem, KDX)
- Rusty Kaspa WASM SDK integration for signing without key storage
- All covenant interactions route through your connected wallet
- URI deep-link fallback for any `kaspa:` or `kaspatest:` compatible wallet

### Interactive Customizable UI Builder
- Tier-based UI builder for paid covenants
- Real-time live preview with primary color and layout selection
- Component toggles and MAX tier custom branding options
- Generated UI is fully interactable with glassmorphism design

### SilverScript Compiler Bridge
- Bridge to native `silverc` compiler for real-time compilation
- Bytecode preview and script template hash output
- Security linting and AST validation
- Temporary file management with automatic cleanup

### Premium Glassmorphism UI
- React 19 + Vite + Tailwind v4 + Framer Motion
- True glassmorphism design with backdrop-blur effects
- Responsive design for all device sizes with zero lag
- Tier-based SaaS access control with pricing page

### Production-Grade Architecture
- Rust backend: Axum + tokio + rusqlite + kaspa-wrpc-client 0.15.0
- SQLite with bundled feature for zero-setup durability
- Rate-limited API with CORS and 5MB request body cap
- Docker-ready with `docker-compose.yml` for backend + frontend
- Mainnet/Testnet toggle via `.env` variable (KASPA_NETWORK)

<br/>

## 🚀 Quick Start

### Requirements

- Rust toolchain 1.80+
- Node.js 20+
- Kaspa node with wRPC enabled (`kaspad` or `kaspa-node`)
- `silverc` compiler (for covenant creation)

### Installation

```bash
git clone https://github.com/THTProtocol/Covex27.git
cd Covex27
cp .env.example .env
```

### Configuration

Edit the `.env` file:

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

### Verify Installation

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/covenants
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"covenant Test {}"}'
```

<br/>

## 🏗️ Architecture

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

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| DAG Indexer | kaspa-wrpc-client v0.15.0 | Polls node for covenant UTXOs |
| Storage | rusqlite v0.31 (bundled) | Durable on-disk covenant store |
| API Server | axum 0.7 + tower-http | REST endpoints on :3001 |
| Compiler | silverc binary | Compile .sil to bytecode |
| Frontend | React 19 + Vite + Tailwind v4 | Glassmorphism UI |
| Background | Three.js | Live BlockDAG visualization |

<br/>

## 💰 Pricing

| Tier | Price | Includes |
|---|---|---|
| Explorer | Free | Browse, search, read-only covenant view |
| Creator | 100 KAS | Interactive UI generation + standard listing |
| PRO | 500 KAS | Featured + higher ranking + advanced UI tools |
| MAX | 1,000 KAS | Top placement + full UI design suite + custom branding |

All covenants appear in the public registry. Paid tiers add interactive UI panels and increased visibility. One-time payment, permanent listing.

<br/>

## 🔐 Security

- **No admin keys:** COVEX holds no privileged keys over any covenant.
- **No custody:** All KAS is held in UTXO covenant scripts on-chain.
- **Immutable covenants:** SilverScript covenant scripts are final the moment they hit the chain.
- **Non-custodial platform:** COVEX never stores or has access to private keys. All signing happens in your wallet.

<br/>

- **No admin keys:** COVEX holds no privileged keys over any covenant.
- **No custody:** All KAS is held in UTXO covenant scripts on-chain.
- **Immutable covenants:** SilverScript covenant scripts are final the moment they hit the chain.
- **Non-custodial platform:** COVEX never stores or has access to private keys. All signing happens in your wallet.

<br/>

## 📚 API Reference

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

## 📄 License

COVEX is released under the MIT License.

```
COVEX v1.0.0 Ultimate Release
Live DAG background. Prominent Kaspa panel.
Real covenants only. Customizable interactive UI builder.
Working wallet connect. Clean design. Perfect.
```