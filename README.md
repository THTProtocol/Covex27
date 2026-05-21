<div align="center">
  <br/>
  
  ```
   ██████╗  ██████╗ ██╗   ██╗███████╗██╗  ██╗
  ██╔════╝ ██╔═══██╗██║   ██║██╔════╝╚██╗██╔╝
  ██║      ██║   ██║██║   ██║█████╗   ╚███╔╝ 
  ██║      ██║   ██║╚██╗ ██╔╝██╔══╝   ██╔██╗ 
  ╚██████╗ ╚██████╔╝ ╚████╔╝ ███████╗██╔╝ ██╗
   ╚═════╝  ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝
  ```
  
  <h3>The Premier Covenant Indexing and Management Platform for Kaspa</h3>
  
  [![Language](https://img.shields.io/badge/Language-Rust_1.80+-orange?style=for-the-badge&labelColor=0a0a0a&color=orange)](https://rust-lang.org)
  [![Network](https://img.shields.io/badge/Network-Kaspa_TN12-00ff41?style=for-the-badge&labelColor=0a0a0a&color=00ff41)](https://kaspa.org)
  [![Build](https://img.shields.io/badge/Build-Stable-success?style=for-the-badge&labelColor=0a0a0a&color=00ff41)](https://github.com/THTProtocol/COVEX)
  [![Storage](https://img.shields.io/badge/Storage-SQLite-blue?style=for-the-badge&labelColor=0a0a0a&color=blue)](https://sqlite.org)
  [![Frontend](https://img.shields.io/badge/Frontend-React_19-blue?style=for-the-badge&labelColor=0a0a0a&color=blue)](https://react.dev)
  [![License](https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge&labelColor=0a0a0a&color=6366f1)](LICENSE)
  
  <br/>
  
  ```
  Index. Compile. Deploy. All on the BlockDAG.
  ```
</div>

---

## 🚀 What is COVEX?

COVEX is a **stateful covenant indexer and SaaS platform** for the [Kaspa BlockDAG](https://kaspa.org). It continuously indexes covenant UTXOs from a Kaspa wRPC node into a local SQLite database, providing a premium glassmorphism UI for browsing, compiling, and deploying SilverScript covenants.

```
Chain is the truth. COVEX is the window.
```

---

## 🌟 Advanced Features

### 📊 Real-Time Covenant Indexing
- **10 BPS Scanning**: Continuous wRPC-based scanning at 10 Blocks Per Second
- **Script Opcode Introspection**: Advanced detection via OP_BLAKE2B patterns (aa20-aa23)
- **KIP Compliance**: Full KIP-17 (extended opcodes) and KIP-20 (covenant IDs) support
- **Toccata Hard-Fork Ready**: TN12 live with mainnet activation scheduled for Q3 2026
- **Reorg-Resilient Architecture**: Stateful design with SQLite persistence for data integrity

### 🔐 Secure Payment Processing
- **Zero-Trust Verification**: All payments confirmed directly on-chain via wRPC
- **Tiered Access Model**: Automatic upgrades with DAA-based confirmation tracking
- **Multi-Tier Pricing**: Explorer (Free) → Creator (100 KAS) → PRO (500 KAS) → MAX (1000 KAS)
- **QR Payment Generation**: One-click treasury address + exact amount QR codes

### 🦊 Non-Custodial Wallet Integration
- **Universal Wallet Connect**: KasWare, Kaspium, OneKey, Tangem, and KDX support
- **WASM SDK Integration**: In-browser signing without key storage
- **Deep-Link Fallback**: URI schemes for `kaspa:` and `kaspatest:` compatible wallets
- **End-to-End Security**: All covenant interactions routed through user's connected wallet

### 🎨 Interactive UI Builder
- **Real-Time Customization**: Live preview of color schemes, layouts, and components
- **Tier-Based Access**: Advanced tools unlocked with Creator/PRO/MAX tiers
- **Component Management**: Toggle wallet buttons, parameter forms, and featured banners
- **MAX Tier Branding**: Custom logo URLs and editorial layout controls

### ⚡ SilverScript Compilation
- **Native Compiler Bridge**: Direct integration with `silverc` binary for real-time compilation
- **Bytecode Preview**: Visual feedback on generated script templates
- **AST Validation**: Security linting and syntax checking before deployment
- **Ephemeral File Management**: Automatic cleanup of temporary compilation artifacts

### 💎 Premium Glassmorphism Interface
- **Modern Tech Stack**: React 19 + Vite + Tailwind v4 + Framer Motion
- **True Glass Effects**: Backdrop-blur, rgba backgrounds, and thin border designs
- **Responsive Architecture**: Zero-lag experience across all device sizes
- **Three.js BlockDAG Visualization**: Live animated DAG background with consensus chain highlighting

### ⚙️ Enterprise-Grade Infrastructure
- **Rust Backend**: Axum 0.7 + tokio + rusqlite + kaspa-wrpc-client 0.15.0
- **SQLite Persistence**: Bundled feature for zero-setup durability and reliability
- **Rate-Limited Security**: CORS protection with 5MB request body cap
- **Docker Orchestration**: Production-ready `docker-compose.yml` for seamless deployment
- **Network Agnostic**: Toggle between mainnet/testnet with single `.env` variable

---

## 🚀 Quick Start

### Prerequisites
- Rust toolchain 1.80+
- Node.js 20+
- Kaspa node with wRPC enabled (`kaspad` or `kaspa-node`)
- `silverc` compiler for covenant compilation

### Installation
```bash
# Clone repository
git clone https://github.com/THTProtocol/COVEX.git
cd COVEX

# Environment setup
cp .env.example .env
```

### Configuration
Edit your `.env` file with appropriate settings:
```bash
KASPA_NETWORK=testnet-12           # or mainnet
KASPA_WRPC_URL=ws://127.0.0.1:17110 # Your Kaspa node endpoint
BIND_ADDR=0.0.0.0:3001             # API server binding
DB_PATH=../covex.db                # SQLite database path
RUST_LOG=covex27_backend=debug,kaspa_wrpc=info
```

### Building and Running
```bash
# Backend compilation (in background)
cd backend
cargo build --release
./target/release/covex27-backend &

# Frontend development server
cd ../frontend
npm install
npm run dev  # Access at http://localhost:5173
```

### Verification Commands
```bash
# Health check
curl http://localhost:3001/api/health

# View indexed covenants
curl http://localhost:3001/api/covenants

# Test compilation
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"covenant Test {}"}'
```

---

## 🏗️ Architecture Overview

```
    Kaspa Node (kaspad)
          │
          │ wRPC WebSocket
          ▼
    ┌──────────────────────┐
    │   Rust Indexer       │ ◄── tokio::spawn loop (12s intervals)
    │   Background Task    │
    └──────────┬───────────┘
               │ INSERT OR REPLACE
               ▼
         ┌─────────────┐
         │  SQLite DB  │ ◄── covex.db (persistent storage)
         └──────┬──────┘
                │ SELECT
                ▼
    ┌──────────────────────┐     JSON
    │   Axum API Server    │ ◄────────────┐
    │   /api/covenants     │              │
    │   /api/compile       │              │
    └──────────┬───────────┘              │
               │                          │
               ▼                          │
    ┌──────────────────────┐              │
    │   React Frontend     │ ◄────────────┘
    │   Vite + Tailwind v4 │
    │   Three.js BlockDAG  │
    └──────────────────────┘
```

---

## 🛠 Technology Stack

| Layer        | Technology              | Purpose                              |
|--------------|-------------------------|--------------------------------------|
| Indexer      | kaspa-wrpc-client 0.15  | Real-time covenant UTXO polling      |
| Storage      | rusqlite 0.31           | Persistent covenant database         |
| API          | Axum 0.7                | RESTful endpoints                    |
| Compiler     | silverc                 | SilverScript → Bytecode compilation  |
| Frontend     | React 19 + Vite         | Interactive user interface           |
| Visualization| Three.js                | Live BlockDAG rendering              |

---

## 💰 Pricing Tiers

| Tier     | Cost    | Features                                                   |
|----------|---------|------------------------------------------------------------|
| Explorer | Free    | Browse, search, read-only covenant view                    |
| Creator  | 100 KAS | Interactive UI generation + standard listing               |
| PRO      | 500 KAS | Featured placement + advanced UI tools                     |
| MAX      | 1000 KAS| Top placement + full UI design suite + custom branding     |

> All covenants appear in the public registry. Paid tiers enhance visibility and interactivity. One-time payment, permanent listing.

---

## 🔒 Security Model

- **No Private Key Storage**: COVEX never holds or accesses user private keys
- **Immutable Deployments**: Covenant scripts are final upon chain confirmation
- **Client-Side Signing**: All transactions signed directly in user's wallet
- **Zero Trust Architecture**: Payment verification conducted entirely on-chain

---

## 📡 API Endpoints

| Method | Endpoint              | Description                          |
|--------|-----------------------|--------------------------------------|
| GET    | `/api/health`         | Server health check                  |
| GET    | `/api/status`         | Node connection and DAG information  |
| GET    | `/api/covenants`      | Indexed covenant retrieval           |
| GET    | `/api/utxos`          | Covenant UTXO entries                |
| GET    | `/api/tiers`          | Pricing tier definitions             |
| POST   | `/api/compile`        | SilverScript compilation service     |
| POST   | `/api/generate-ui`    | Interactive covenant UI generation   |
| GET    | `/api/verify-payment` | On-chain payment verification        |

---

## 📄 License

COVEX is released under the MIT License. See [LICENSE](LICENSE) for full details.

---

## 🤝 Contributing

We welcome contributions from the Kaspa community! Please see our [Contribution Guidelines](CONTRIBUTING.md) for details on how to get involved.

---

## 📞 Support

For technical issues, please [open an issue](https://github.com/THTProtocol/COVEX/issues) on GitHub.

```
COVEX v1.0.0 Ultimate Release
Live DAG background. Prominent Kaspa panel.
Real covenants only. Customizable interactive UI builder.
Working wallet connect. Clean design. Perfect.
```