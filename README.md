# COVEX | The Kaspa Covenant Explorer

Covex operates natively on Kaspa Mainnet (currently deployed on TN12 for testing). It utilizes a high-performance Rust wRPC indexer to scan the BlockDAG for covenant UTXOs in real-time, paired with a React glassmorphism UI.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    React Frontend                     │
│  ┌─────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │ Explorer │ │ Interactive  │ │ DAG Background    │  │
│  │  Table   │ │  Detail Page │ │  Canvas Animation │  │
│  └────┬─────┘ └──────┬───────┘ └───────────────────┘  │
│       │              │                                 │
│       ▼              ▼                                 │
│  /api/utxos    Wallet URI (kaspatest:...?amount=...)  │
│       │                                                │
├───────┼────────────────────────────────────────────────┤
│       │              Rust Backend (:3001)               │
│  ┌────┴──────────────────────────────────────────┐    │
│  │  Axum REST Server → KaspaRpcClient (wRPC)      │    │
│  │  Scans covenant UTXOs via get_utxos_by_address │    │
│  └──────────────────────┬────────────────────────┘    │
│                         │                              │
├─────────────────────────┼──────────────────────────────┤
│                         ▼                              │
│               Kaspa Node (kaspad)                      │
│          TN12 (ws://127.0.0.1:17110)                   │
│          Mainnet (ws://127.0.0.1:16110)                │
└──────────────────────────────────────────────────────┘
```

**Stack:**

| Layer | Technology |
|---|---|
| DAG Indexer | Rust + `kaspa-wrpc-client` + `axum` |
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Animation | Canvas API (custom BlockDAG renderer) |
| Routing | React Router v7 |
| Styling | Glassmorphism (backdrop-blur + border-white/10) |

---

## Features

- **Real-time Covenant Discovery** — Scans the Kaspa BlockDAG for covenant-bearing UTXOs using the native wRPC protocol. No third-party indexing service required.

- **Interactive DAG Background** — Animated canvas of 80+ nodes with a visible Consensus Path (Kaspa green, `#49EACB`), mimicking the visual language of kaspa.org.

- **Wallet Deep-Linking** — Premium covenant detail pages generate `kaspatest:` / `kaspa:` URIs with embedded amounts, allowing users to execute covenants directly from their wallet.

- **Hosted Covenant Listings** — Pay-to-list model: covenant authors pay 100 KAS to the Covex treasury to feature their interactive UI on the explorer.

- **Network-Agnostic** — Toggle between Mainnet and TN12 with a single environment variable (`KASPA_NETWORK`).

---

## Quick Start

### Prerequisites

- Rust toolchain (1.80+)
- Node.js 20+
- A running Kaspa node with wRPC enabled (kaspad or kaspa-node)

### 1. Clone

```bash
git clone https://github.com/THTProtocol/Covex27.git
cd Covex27
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env: set KASPA_NETWORK=testnet-12 (default) or mainnet
```

### 3. Start the Rust backend

```bash
cd backend
cargo run --release
# Listening on http://0.0.0.0:3001
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Vite dev server on http://localhost:5173
# Proxies /api/* → http://127.0.0.1:3001
```

### 5. Open the explorer

```
http://localhost:5173
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `KASPA_NETWORK` | `testnet-12` | Network ID: `mainnet`, `testnet-12`, `testnet-11`, `testnet-10`, `devnet` |
| `KASPA_WRPC_URL` | `ws://127.0.0.1:17110` | wRPC websocket endpoint (port 16110 for mainnet) |
| `BIND_ADDR` | `0.0.0.0:3001` | Axum HTTP listen address |
| `RUST_LOG` | `covex27_backend=debug,kaspa_wrpc=info` | Tracing filter |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/status` | Node connection status, tip DAA score, network info |
| `GET` | `/api/utxos` | All covenant UTXOs discovered from seed addresses |

---

## Pages

| Route | Page | Description |
|---|---|---|
| `/` | Explorer | Glassmorphism data table of covenant UTXOs with "Scan Node" button |
| `/covenant/:id` | Covenant Interactive | Detail page with wallet URI generator for funded covenants |
| `/host` | Host Covenant | Pay 100 KAS to list a covenant UI on the explorer |
| `/terms` | Terms & Conditions | Legal terms regarding non-custodial usage |

---

## Security & Disclaimer

Covex is a **read-only explorer**. It never holds, transmits, or controls private keys. All covenant execution happens client-side via wallet deep-links (`kaspatest:` / `kaspa:` URIs). Users are solely responsible for verifying transaction details in their wallet before signing.

---

## License

MIT — see [LICENSE](LICENSE) for details.
