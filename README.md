<div align="center">
  <br>

  <pre>
 ██████╗ ██████╗ ██╗   ██╗███████╗██╗  ██╗
██╔════╝██╔═══██╗██║   ██║██╔════╝╚██╗██╔╝
██║     ██║   ██║██║   ██║█████╗   ╚███╔╝ 
██║     ██║   ██║╚██╗ ██╔╝██╔══╝   ██╔██╗ 
╚██████╗╚██████╔╝ ╚████╔╝ ███████╗██╔╝ ██╗
 ╚═════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝
  </pre>

  <img src="https://raw.githubusercontent.com/THTProtocol/Covex27/master/frontend/public/covex-logo-full.jpg" alt="Covex - Verifiable Interactive Covenants" width="256" />

  <h3>The Production Platform for Verifiable Interactive Covenants on the Kaspa BlockDAG</h3>

  <p><strong>Complete indexing • Intelligent classification • Rich interactive interfaces • Hybrid ZK + Oracle resolution • Full on-chain transparency</strong></p>

  <br>
  <p>
    <a href="https://hightable.pro"><strong>hightable.pro</strong></a> ·
    <a href="https://hightable.pro/docs">API Docs</a> ·
    <a href="https://hightable.pro/treasury">Treasury Transparency</a> ·
    <a href="docs/COVEX_MASTER_BUILD_PLAN.md">Roadmap</a>
  </p>
</div>

---

Covex indexes every SilverScript covenant on Kaspa, makes each one interactive through your own wallet, and gives creators the tools to design, verify, and showcase covenants with ZK circuits and oracle resolution. Non-custodial end to end: keys never leave your wallet, the platform never holds funds.

## What Covex does

| Pillar | What you get |
|--------|--------------|
| **Explorer** | Every covenant on TN12, TN10, and (post-Toccata) mainnet, discovered on-chain by three independent indexers. Paginated API, keyword search, category filters, live activity ticker, lifecycle timelines, address portfolios. Free forever. |
| **Interaction** | Connect KasWare, Kastle, Kasperia, or OKX and execute any covenant: stake, join, claim, resolve. Game arenas (chess, poker, connect4, checkers, reversi, blackjack, RPS, tic-tac-toe) settle real pots with oracle-signed or ZK-verified outcomes. |
| **Creation** | A free covenant creator plus paid Studio tiers: 19 real circuits (Groth16, hybrid, attested), configurable fees and payouts, visual page templates, a layers designer, and SilverScript compilation through the Covex DSL. |
| **Transparency** | Every covenant page shows its lifecycle, resolution trust badge (ZK verified / Oracle attested / On-chain script), receiving addresses, fees, and creator portfolio. The platform treasury, ranking formula, and payment history are public at [/treasury](https://hightable.pro/treasury). |

## Architecture

```
frontend/   React 19 + Vite, Tailwind v4, route-level code splitting
backend/    Rust (Axum), kaspa-wrpc-client, SQLite WAL, three indexers:
              crawler (selected-parent chain walk for aa20-aa23 payloads)
              live indexer (10s UTXO polling)
              payment guardian (15s treasury watch, 6 DAA confirmations)
zk/         30+ circom circuits with Groth16 artifacts, snarkjs verifiers,
            pluggable oracle (strict ZK / hybrid / attested per circuit)
examples/   Runnable end-to-end covenant examples
docs/       Master build plan, audits, operations runbook
```

**Networks:** Testnet-12 (Toccata, primary), Testnet-10, mainnet-ready (activates with the Toccata hard fork; wallet extensions only, dev keys are hard-rejected on mainnet).

## Public API

The same API that powers the explorer. No key required for reads, paginated, rate-limited on writes.

```bash
# List covenants (max 200 per page)
curl "https://hightable.pro/api/covenants?network=testnet-12&limit=10"

# Keyword search (pipe = OR)
curl "https://hightable.pro/api/covenants?q=chess|poker&limit=10"

# Full covenant detail
curl "https://hightable.pro/api/covenants/<txid>"

# Live activity feed
curl "https://hightable.pro/api/events?network=testnet-12&limit=20"

# Address portfolio
curl "https://hightable.pro/api/address/<kaspa_address>"

# Compile Covex DSL to SilverScript bytecode
curl -X POST https://hightable.pro/api/compile   -H "Content-Type: application/json" -d '{"source":"contract T { ... }"}'
```

Interactive docs: **[hightable.pro/docs](https://hightable.pro/docs)** · Spec: [/api/openapi.json](https://hightable.pro/api/openapi.json)

## Tiers

One-time KAS payment per covenant, verified on-chain (6 DAA confirmations to the public treasury). Higher tier = better tools + higher explorer placement. Ranking is deterministic and documented at [/treasury](https://hightable.pro/treasury).

| Tier | Price | Unlocks |
|------|-------|---------|
| FREE | 0 | Browse, interact, basic covenant creation |
| BUILDER | 100 KAS | Covex Terminal, custom UIs, fee configuration |
| PRO | 500 KAS | Featured placement, full circuit catalog |
| MAX | 1000 KAS | Top placement, TVL-weighted ranking boost |

## Development

```bash
# Backend (Rust 1.80+)
cd backend && cargo build --release
# requires a Kaspa wRPC node; see .env.example for KASPA_WRPC_URL et al.

# Frontend
cd frontend && npm install && npm run dev   # proxies /api to :3005
```

Mainnet deployments refuse to start unless `COVEX_ORACLE_KEY` is set; the compiled-in oracle key is testnet-only.

## Documentation

- [Master Build Plan](docs/COVEX_MASTER_BUILD_PLAN.md): the phased roadmap (Explorer 2.0, Covenant Page Studio, on-chain KIP-16 verification, KCC-20)
- [Current Audit](docs/COVEX_AUDIT_AND_IMPROVEMENT_PLAN_2026-06-12.md): full platform audit and live test results
- [Building on Covex](docs/BUILDING_ON_COVEX.md): integrate the API
- [Operations Runbook](docs/OPERATIONS_RUNBOOK.md)

## Trust model, stated plainly

- All listed covenants are real on-chain discoveries; nothing is fabricated.
- Resolution today is oracle-signed (single oracle), with ZK circuits verified before signing where artifacts exist. Each covenant page shows exactly which mode applies. On-chain Groth16/STARK verification via KIP-16 replaces oracle trust progressively after Toccata mainnet activation.
- The platform never holds user funds and cannot move them. Tier payments go to a public treasury address anyone can audit.

---

Built on [Kaspa](https://kaspa.org) · [rusty-kaspa](https://github.com/kaspanet/rusty-kaspa) · [SilverScript](https://github.com/kaspanet/silverscript)
