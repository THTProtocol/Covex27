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
  
  <h3>The Premier Covenant Indexing Platform for Kaspa</h3>
  
  [![Language](https://img.shields.io/badge/Language-Rust_1.80+-orange?style=for-the-badge&labelColor=0a0a0a&color=orange)](https://rust-lang.org)
  [![Network](https://img.shields.io/badge/Network-Kaspa_TN12-00ff41?style=for-the-badge&labelColor=0a0a0a&color=00ff41)](https://kaspa.org)
  [![Build](https://img.shields.io/badge/Build-Stable-success?style=for-the-badge&labelColor=0a0a0a&color=00ff41)](https://github.com/THTProtocol/Covex27)
  [![Storage](https://img.shields.io/badge/Storage-SQLite-blue?style=for-the-badge&labelColor=0a0a0a&color=blue)](https://sqlite.org)
  [![Frontend](https://img.shields.io/badge/Frontend-React_19-blue?style=for-the-badge&labelColor=0a0a0a&color=blue)](https://react.dev)
  [![License](https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge&labelColor=0a0a0a&color=6366f1)](LICENSE)
  
  <br/>
  
  ```
  Index. Deploy. Interact. All on the BlockDAG.
  ```
</div>

---

## What is Covex?

Covex is a **stateful covenant indexer and SaaS platform** for the [Kaspa BlockDAG](https://kaspa.org). It continuously indexes covenant UTXOs from a Kaspa wRPC node into a local SQLite database, serving a premium glassmorphism frontend for browsing, compiling, and deploying SilverScript covenants.

> Chain is the truth. Covex is the window.

---

## Features

### Real-Time Covenant Indexing
- **10 BPS Scanning**: Continuous wRPC-based scanning at 10 blocks per second
- **Script Opcode Detection**: Advanced opcode introspection via OP_BLAKE2B patterns (aa20-aa23)
- **KIP Compliance**: Full KIP-17 (extended opcodes) and KIP-20 (covenant IDs) support
- **Toccata Hard-Fork Ready**: TN12 live with mainnet activation scheduled for Q3 2026
- **Reorg-Resilient**: Stateful SQLite persistence for data integrity across reorgs

### Tiered Transparency Model
- **FREE tier**: All covenants visible with basic read-only view, prominent DANGER/UNVERIFIED banner, limited disclosure (tx_id, script_hash, amount, type only)
- **Paid tiers (CREATOR/PRO/MAX)**: Full disclosure after payment - all receiving addresses, complete logic summary, full parameter list, verified badge, enhanced UI with customization hooks

### Secure Payment Processing
- **Zero-Trust Verification**: All payments confirmed directly on-chain via wRPC
- **Auto-Upgrade**: DAA-based confirmation tracking (6+ confirmations)
- **Multi-Tier Pricing**: Explorer (Free), Creator (100 KAS), PRO (500 KAS), MAX (1000 KAS)
- **QR Payment Generation**: One-click treasury address + exact amount QR codes
- **Covenant-Specific Upgrades**: "Upgrade this Covenant" button on every detail page - pay to unlock interactive UI for that specific covenant

### Non-Custodial Wallet Integration
- **Hot Wallet Priority**: KasWare, Kaspium, Kastle, OneKey, Tangem, KDX with real favicon logos displayed in wallet modal
- **URI Deep-Link Fallback**: `kaspatest:` and `kaspa:` compatible
- **QR Code Payment**: Prominent QR code option for every payment flow
- **End-to-End Security**: All signing happens in the user's wallet

### Interactive UI Builder
- **Real-Time Customization**: Live preview of color schemes, backgrounds, and layouts
- **Tier-Based Unlock**: Creator unlocks UI generator, PRO adds featured placement, MAX enables full design suite
- **Automatic Basic UI**: Every indexed covenant gets a basic interactive panel with danger banner

### SilverScript Compilation
- **Native Compiler Bridge**: Direct `silverc` integration
- **Bytecode Preview**: Visual feedback with script template hash display
- **AST Validation**: Security linting before deployment

### Premium Glassmorphism Interface
- **Tech Stack**: React 19 + Vite + Tailwind v4 + Framer Motion
- **Glass Effects**: Backdrop-blur, rgba backgrounds, thin border designs
- **Three.js BlockDAG Animation**: Live animated DAG background with consensus chain highlighting, particle flow, and graceful WebGL fallback

### Enterprise-Grade Infrastructure
- **Rust Backend**: Axum 0.7 + tokio + rusqlite + kaspa-wrpc-client 0.15.0
- **SQLite Persistence**: Bundled feature with zero-setup durability
- **Rate-Limited Security**: CORS protection with 5MB request body cap
- **Docker Support**: Production-ready docker-compose.yml

---

## Quick Start

### Prerequisites
- Rust toolchain 1.80+
- Node.js 20+
- Kaspa node with wRPC enabled (kaspad or kaspa-node)
- silverc compiler for covenant compilation

### Installation
```bash
git clone https://github.com/THTProtocol/Covex27.git
cd Covex27
cp .env.example .env
```

### Configuration
```bash
KASPA_NETWORK=testnet-12           # or mainnet
KASPA_WRPC_URL=ws://127.0.0.1:17110
BIND_ADDR=0.0.0.0:3001
DB_PATH=../covex.db
RUST_LOG=covex27_backend=debug,kaspa_wrpc=info
```

### Build and Run
```bash
# Backend
cd backend
cargo build --release
./target/release/covex27-backend &

# Frontend
cd ../frontend
npm install
npm run dev  # http://localhost:5173
```

### Verification
```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/covenants
```

---

## Architecture

```
    Kaspa Node (kaspad)
          |
          | wRPC WebSocket
          v
    +------------------------+
    |   Rust Indexer         | <-- tokio::spawn loop (10s intervals)
    |   Background Task      |
    +-----------+------------+
                | INSERT OR REPLACE
                v
         +-------------+
         |  SQLite DB  | <-- covex.db (persistent)
         +------+------+
                | SELECT
                v
    +------------------------+     JSON
    |   Axum API Server      | <------------+
    |   /api/covenants       |              |
    |   /api/compile         |              |
    +-----------+------------+              |
                |                           |
                v                           |
    +------------------------+              |
    |   React Frontend       | <------------+
    |   Vite + Tailwind v4   |
    |   Three.js BlockDAG    |
    +------------------------+
```

---

## Technology Stack

| Layer       | Technology              | Purpose                             |
|-------------|-------------------------|-------------------------------------|
| Indexer     | kaspa-wrpc-client 0.15  | Real-time covenant UTXO polling     |
| Storage     | rusqlite 0.31           | Persistent covenant database        |
| API         | Axum 0.7                | RESTful endpoints                   |
| Compiler    | silverc                 | SilverScript to bytecode            |
| Frontend    | React 19 + Vite         | Interactive UI                      |
| Animation   | Three.js                | Live BlockDAG visualization         |

---

## Pricing

| Tier    | Cost     | Features                                                        |
|---------|----------|----------------------------------------------------------------|
| Explorer| Free     | Browse, search, read-only covenant view                         |
| Creator | 100 KAS  | Interactive UI generation, verified badge, standard listing     |
| PRO     | 500 KAS  | Featured placement, advanced UI tools, covenant images          |
| MAX     | 1000 KAS | Top placement, full UI design suite, custom branding            |

> All covenants appear in the public registry. Paid tiers unlock interactive UIs and enhanced visibility. One-time payment, permanent listing. No subscriptions.

---

## Security

- **No Private Key Storage**: Covex never accesses user private keys
- **Immutable Deployments**: Covenant scripts are final upon chain confirmation
- **Client-Side Signing**: All transactions signed in user's wallet
- **Zero Trust**: Payment verification conducted entirely on-chain
- **No Fake Data**: Zero hardcoded covenants - only real on-chain data from the wRPC indexer

---

## API Endpoints

| Method | Endpoint              | Description                              |
|--------|----------------------|------------------------------------------|
| GET    | /api/health          | Server health check                      |
| GET    | /api/status          | Node connection and DAG info             |
| GET    | /api/covenants       | Indexed covenant retrieval               |
| GET    | /api/utxos           | Covenant UTXO entries                    |
| GET    | /api/tiers           | Pricing tier definitions                 |
| POST   | /api/compile         | SilverScript compilation                 |
| POST   | /api/generate-ui     | Interactive covenant UI generation       |
| GET    | /api/verify-payment  | On-chain payment verification            |
| GET    | /api/covenant/:id/ui | Generated UI for a specific covenant     |

---

## License

Covex is released under the MIT License. See [LICENSE](LICENSE) for details.

---

## Support

For issues, [open an issue](https://github.com/THTProtocol/Covex27/issues) on GitHub.

```
Covex v1.0.0 Absolute Final Release
Zero fake data. Covenant-specific upgrade flow.
Premium wallet modal with real logos and QR codes.
Smooth Three.js BlockDAG background with graceful fallback.
Best README in the Kaspa ecosystem.
```
