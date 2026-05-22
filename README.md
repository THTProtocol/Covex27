<div align="center">

```
   ▄████▄   ▒█████  ██▒   █▓▓█████ ▒██   ██▒
  ▒██▀ ▀█  ▒██▒  ██▓██░   █▒▓█   ▀ ▒▒ █ █ ▒░
  ▒▓█    ▄ ▒██░  ██▒▓██  █▒░▒███   ░░  █   ░
  ▒▓▓▄ ▄██▒▒██   ██░ ▒██ █░░▒▓█  ▄  ░ █ █ ▒
  ▒ ▓███▀ ░░ ████▓▒░  ▒▀█░  ░▒████▒▒██▒ ▒██▒
  ░ ░▒ ▒  ░░ ▒░▒░▒░   ░ ▐░  ░░ ▒░ ░▒▒ ░ ░▓ ░
    ░  ▒     ░ ▒ ▒░   ░ ░░   ░ ░  ░░░   ░▒ ░
  ░        ░ ░ ░ ▒      ░░     ░    ░    ░
  ░ ░          ░ ░       ░     ░  ░ ░    ░
  ░                     ░
```

### Covex — Kaspa Covenant Indexer

> DAG is the truth. Covex is the window.

---

[![Rust](https://img.shields.io/badge/Rust-1.80+-orange?logo=rust&logoColor=white&style=flat-square)](https://rust-lang.org)
[![Network](https://img.shields.io/badge/Network-Testnet_10-49EACB?style=flat-square)](https://kaspa.org)
[![Frontend](https://img.shields.io/badge/Frontend-React_19-61DAFB?logo=react&style=flat-square)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

</div>

---

## What is Covex?

Covex indexes **SilverScript covenant UTXOs** from the Kaspa BlockDAG into a local
SQLite database and serves them through a React frontend with a payment-gated
interactive UI Builder.

> Live on **Kaspa Testnet-10** at [hightable.pro](https://hightable.pro)

---

## Architecture

```
   Browser                     kaspad (TN10)
      │                       ╱         ╲
      │  HTTPS              ╱   wRPC      ╲
      ▼                   ▼      :17110    ▼
   ┌──────┐          ┌──────────┐     ┌──────────┐
   │Nginx │          │  Historic│     │   Live   │
   │ :443 │          │  Crawler │     │ Indexer  │
   └──┬───┘          └────┬─────┘     └────┬─────┘
      │                   │                │
      │  /api/*           └───────┬────────┘
      ▼                           │
   ┌──────────┐                   ▼
   │  Axum    │             ┌──────────┐
   │  :3005   │◄─────────── │ SQLite   │
   └──────────┘             │ covex.db │
                            └──────────┘
```

| Component | Technology | Role |
|:----------|:-----------|:-----|
| Backend | Rust + Axum 0.7 + Tokio | API server, crawler, indexer, payment verifier |
| Database | SQLite (`rusqlite` 0.31) | Covenant store with 8 tables, checkpointed crawler state |
| Frontend | React 19 + Vite + Tailwind v4 | Glass-morphism SPA with Framer Motion |
| Proxy | Nginx 1.24 | Static delivery + reverse proxy |

---

## Features

- **Historic BlockDAG Crawler** — walks the selected-parent DAG backward from tip to
  genesis, scanning every block for covenant opcodes (`aa20`–`aa23`), checkpointed to SQLite
- **Live Mempool Indexer** — polls seed addresses via wRPC every 10s, auto-generates
  basic UIs for every discovered covenant
- **Payment-Gated UI Builder** — one-time KAS payments (Creator 100 / PRO 500 / MAX 1000)
  unlock progressive customization tiers with live preview panel
- **On-Chain Payment Verifier** — monitors treasury address, matches UTXOs to covenant
  creators, auto-upgrades after 6 DAA confirmations
- **Non-Custodial Wallet Suite** — KasWare, Kaspium, Kastle, KDX with inline SVG logos,
  URI fallback, QR codes. Keys stay in user's wallet

---

## Quick Start

```bash
git clone https://github.com/THTProtocol/Covex27.git && cd Covex27
cp deploy/.env.production .env

# Backend
cd backend && cargo build --release
./target/release/covex27-backend &

# Frontend
cd ../frontend && npm install && npm run build
# nginx serves dist/ -- or run dev server: npm run dev
```

**Node requirement:** kaspad must have UTXO index + wRPC Borsh enabled:
```bash
kaspad --testnet --utxoindex --rpclisten-borsh=0.0.0.0:17110
```

---

## API

| Endpoint | Returns |
|:---------|:--------|
| `GET /health` | `"OK"` |
| `GET /status` | `{"total_covenants":N, "active_covenants":N, ...}` |
| `GET /covenants` | `{"total":N, "covenants":[...]}` |
| `GET /tiers` | `{"tiers":[...]}` |

---

```
Covex v1.0.0 — Live on Kaspa Testnet-10
Rust · Axum · SQLite · React · Nginx
Crawler · Indexer · Verifier · Builder
```
