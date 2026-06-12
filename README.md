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

  <h3>The Covenant Explorer & Studio for Kaspa Mainnet</h3>

  <p><strong>Index every covenant · Make every covenant interactive · Design, verify, and monetize covenants — built for the Toccata mainnet era</strong></p>

  <p>
    <a href="https://hightable.pro"><b>hightable.pro</b></a> ·
    <a href="https://hightable.pro/docs">API</a> ·
    <a href="https://hightable.pro/whitepaper">Whitepaper</a> ·
    <a href="https://hightable.pro/treasury">Treasury</a> ·
    <a href="#whitepaper">Whitepaper (below)</a>
  </p>
</div>

---

> **Status (2026-06-12):** Kaspa mainnet runs at 10 BPS since the Crescendo hard fork (May 2025). Native L1 **covenants** arrive with the **Toccata** hard fork, scheduled for the **June 5–20, 2026** mainnet activation window (KIP-16/17/20/21). Covex runs a real mainnet node today and is indexing for that activation: **the mainnet covenant explorer is honestly empty until the first real covenant lands** — no placeholder data. Covenants are live now on Toccata **Testnet-12**, where Covex already indexes 7,800+ of them. Covex is positioned to be the canonical explorer the moment covenants reach mainnet.

---

## 1. What Covex is

Covex is the place where **Kaspa covenants live**. A covenant is a SilverScript program embedded in a Kaspa UTXO that constrains how that UTXO may be spent — escrows, vaults, prediction markets, on-chain games, vesting, multisig, atomic swaps, and more. Today these are programmable UTXOs; with Toccata they become a first-class L1 smart-contract surface.

Covex does four things, in order of how a user meets them:

| Pillar | What it means | Free? |
|--------|---------------|-------|
| **Explore** | Every covenant on the chain, discovered on-chain by independent indexers. Paginated API, keyword search, 17 categories, live activity feed, per-covenant lifecycle & action history, address portfolios. | Free forever |
| **Interact** | Connect a Kaspa wallet and act on any covenant directly: stake, join, claim, resolve. On-chain game arenas (chess and 7 more) settle real pots with oracle-signed or ZK-verified outcomes, syncing live over WebSockets. | Free forever |
| **Create** | A free covenant creator plus paid Studio tiers: a Puck drag-and-drop page builder, 240 procedural design presets + a design-code terminal, real circuits (Groth16 + oracle), fee/payout config, background images, and SilverScript compilation. | Free + paid tiers |
| **Trust** | Every covenant page shows its lifecycle, resolution-trust badge (ZK-verified / Oracle-attested / On-chain script), receiving addresses, fees, and creator portfolio. The platform treasury, ranking formula, and payment history are public. | Always on |

**Non-custodial, end to end.** Keys never leave your wallet. The platform reads UTXOs and verifies payments on-chain; it never holds funds and cannot move them.

---

## 2. Architecture

Covex is a Rust indexing/oracle backend, a React explorer/studio frontend, and the Kaspa nodes it reads. The diagram below is the real production topology on `hightable.pro`.

```
                                   ┌──────────────────────────────────────────────┐
                                   │                KASPA NETWORK                  │
                                   │   Mainnet (Toccata)   TN12 (Toccata)   TN10   │
                                   └───────┬───────────────────┬─────────────┬─────┘
                                           │ wRPC (Borsh/WS)    │ wRPC        │ wRPC
        operator PC (WSL)                  │                    │             │
   ┌───────────────────────┐  reverse SSH  │                    │             │
   │  mainnet kaspad        │──── tunnel ───┘                    │             │
   │  :17110  ──ssh -R──►   │  :17310 (server loopback)          │             │
   └───────────────────────┘                                     │             │
                                                                 │             │
   ┌─────────────────────────────────────────────────────────────┴─────────────┴───────────┐
   │  HETZNER SERVER (hightable.pro)                                                          │
   │                                                                                          │
   │   kaspad (TN12)            kaspad-tn10                  [mainnet via :17310 tunnel]       │
   │   wRPC :17217              wRPC :17210                                                    │
   │        │                        │                              │                         │
   │        └────────────┬───────────┴──────────────────────────────┘                         │
   │                     ▼                                                                     │
   │        ┌──────────────────────────────────────────────────────────┐                      │
   │        │  covex-backend  (Rust / Axum, systemd, :3006)             │                      │
   │        │                                                           │                      │
   │        │  3 background indexers PER network:                       │                      │
   │        │   • Crawler        selected-parent walk, finds aa20-aa23  │                      │
   │        │   • Live indexer   10s UTXO poll at seed addresses        │                      │
   │        │   • Payment guard   15s treasury poll, 6-DAA tier confirm │                      │
   │        │                                                           │                      │
   │        │  HTTP API (/covenants, /events, /games, /oracle, /compile │                      │
   │        │   /address, /treasury data, /openapi.json, /status ...)   │                      │
   │        │  WebSocket /ws  (live ticker + game move/spectator sync)   │                      │
   │        │  Oracle  verify-and-sign  (Groth16 strict / hybrid / attest)│                    │
   │        │  Signer + broadcast  (native Schnorr -> wRPC submit)      │                      │
   │        └───────────────┬───────────────────────────────┬──────────┘                      │
   │                        │                                │                                 │
   │                        ▼                                ▼                                 │
   │        ┌────────────────────────────┐      ┌──────────────────────────────┐              │
   │        │  SQLite (WAL)  covex.db      │      │  /root/htp/public  (SPA dist) │              │
   │        │  14 tables: covenants,       │      │  React build, served static   │              │
   │        │  payments, accounts, events, │      └──────────────────────────────┘              │
   │        │  generated_uis, skill_games, │                     ▲                              │
   │        │  visibilities, crawler_state │                     │                              │
   │        │  auth_tokens, mixer_*, ...   │                     │                              │
   │        └────────────────────────────┘                      │                              │
   │                        ▲                                    │                              │
   │                        │                                    │                              │
   │        ┌───────────────┴────────────────────────────────────┴──────────────┐             │
   │        │  nginx  :443/:80                                                    │             │
   │        │   location /          -> SPA (index.html, no-cache; /assets 1y)     │             │
   │        │   location /api/      -> http://127.0.0.1:3006/   (strips /api)     │             │
   │        │   location /api/ws    -> :3006/ws  (Upgrade/Connection headers)     │             │
   │        │   location /healthz   -> :3006/health                              │             │
   │        └────────────────────────────────────────────────────────────────────┘             │
   └──────────────────────────────────────────┬───────────────────────────────────────────────┘
                                              │ HTTPS / WSS
                                              ▼
                              ┌────────────────────────────────┐
                              │  Browser  (hightable.pro)       │
                              │  React SPA: Explorer, Studio,    │
                              │  Arena, wallet (KasWare/Kastle/  │
                              │  Kasperia/OKX...), live ticker    │
                              │  Local canvas/iframe DAG backdrop │
                              └────────────────────────────────┘
```

### Deploy → display data flow

1. **Deploy.** A creator builds a covenant in the Studio, the wallet signs, and `broadcast.rs` submits the covenant UTXO transaction to a Kaspa node over wRPC.
2. **Discover.** Within seconds the crawler/live-indexer sees the `aa20–aa23` envelope on-chain and writes the covenant to SQLite. (On mainnet, bare P2SH commitments are **not** counted as covenants until Toccata activation — honesty gate.)
3. **Classify.** The covenant is sorted into one of 17 categories by opcode signature.
4. **Pay (optional).** A tier payment to the public treasury is detected by the payment guardian; at 6 DAA confirmations the covenant is upgraded (once) to BUILDER/PRO/MAX with full disclosure.
5. **Serve.** The React explorer reads `/api/covenants`, `/api/events`, `/api/games`; nginx proxies `/api/*` to the backend; Axum returns JSON from SQLite.
6. **Live.** Game moves and new matches publish over `/ws`; clients subscribe via `/api/ws` for real-time boards, spectators, and the activity ticker.

### Stack

- **Frontend:** React 19 + Vite, Tailwind v4, React Router 7, route-level code splitting, `@measured/puck` page builder, `react-chessboard` + `chess.js`, in-browser `snarkjs`, `@kasflow/wallet-connector`.
- **Backend:** Rust, Axum 0.7, `kaspa-wrpc-client` (Borsh wRPC), vendored `kaspa-consensus-core` with the TN12 sighash fix, SQLite WAL, Tokio background tasks, `secp256k1` Schnorr signing.
- **ZK/Oracle:** circom + circomlib circuits, `snarkjs` verification via a Node child process, a pluggable oracle registry (strict Groth16 / hybrid / attested per circuit).
- **Infra:** Hetzner + systemd + nginx; mainnet node on the operator PC via a self-healing reverse SSH tunnel; triple-synced deploys (GitHub = server = hightable.pro).

---

## 3. Public API

The same API that powers the explorer. No key required for reads. Paginated (max 200/page). Rate-limited on writes.

```bash
# List covenants (per network)
curl "https://hightable.pro/api/covenants?network=mainnet&limit=20"

# Keyword search (pipe = OR)
curl "https://hightable.pro/api/covenants?q=escrow|vesting&limit=10"

# One covenant, full detail + lifecycle
curl "https://hightable.pro/api/covenants/<txid>"
curl "https://hightable.pro/api/covenants/<txid>/actions"

# Live activity feed
curl "https://hightable.pro/api/events?network=mainnet&limit=20"

# Address portfolio
curl "https://hightable.pro/api/address/<kaspa_address>"

# Compile Covex DSL / SilverScript to bytecode
curl -X POST https://hightable.pro/api/compile \
  -H "Content-Type: application/json" -d '{"source":"contract T { ... }"}'
```

Interactive docs: **[hightable.pro/docs](https://hightable.pro/docs)** · OpenAPI: [/api/openapi.json](https://hightable.pro/api/openapi.json)

---

## 4. Tiers & visibility

One-time KAS payment **per covenant**, verified on-chain (6 DAA confirmations to the public treasury). A covenant is "paid" only if it was deployed through the Covex paid flow — never inferred. Higher tier = better tools + higher placement, by a **public, deterministic** ranking formula (`tier_weight → locked value → recency`), documented at [/treasury](https://hightable.pro/treasury).

| Tier | Price | Unlocks |
|------|-------|---------|
| FREE | 0 | Browse, interact, basic covenant creation |
| BUILDER | 100 KAS | Studio, custom page, fee configuration |
| PRO | 500 KAS | Featured placement, full circuit catalog |
| MAX | 1000 KAS | Top placement, TVL-weighted boost, custom slug |

Verification is a fact, not a purchase: the VERIFIED badge means an on-chain tier payment was confirmed. Nothing else grants it.

---

## 5. Run it

```bash
# Backend (Rust 1.80+); needs a Kaspa wRPC node
cd backend && cargo build --release
#   BIND_ADDR=0.0.0.0:3006  KASPA_NETWORK=testnet-12
#   KASPA_WRPC_URL=ws://127.0.0.1:17217  DB_PATH=./covex.db
#   KASPA_WRPC_URL_MAINNET=ws://127.0.0.1:17310  (mainnet, via tunnel)
#   COVEX_ORACLE_KEY=<hex>  (REQUIRED on mainnet; testnet has a dev default)

# Frontend
cd frontend && npm install && npm run dev   # Vite proxies /api -> :3006
```

Mainnet refuses to start without `COVEX_ORACLE_KEY` — the compiled-in oracle key is testnet-only.

---

<a name="whitepaper"></a>
## 6. Whitepaper

### Covex: A Covenant Explorer and Studio for Kaspa Mainnet

**Abstract.** Kaspa's Toccata hard fork turns the fastest proof-of-work BlockDAG into a covenant-capable L1: native, stateful, multi-transaction programs over UTXOs, with on-chain zero-knowledge verification. The missing layer is human: a place to *see* every covenant, *interact* with any of them safely, and *create* them without writing raw script. Covex is that layer. This paper describes the problem, the design, the trust model, and the path from oracle-assisted resolution today to fully on-chain proof verification under KIP-16.

#### 6.1 Background: covenants on Kaspa

Kaspa is a proof-of-work BlockDAG using the GHOSTDAG/DAGKNIGHT ordering protocol. Since the **Crescendo** hard fork (mainnet, ~May 2025) it produces **10 blocks per second** while preserving Nakamoto-style security, with a roadmap toward 100 BPS. Crescendo also shipped **KIP-10** transaction-introspection opcodes — the first step toward covenants.

The **Toccata** hard fork completes the covenant story. Scheduled to activate on mainnet in the **June 5–20, 2026** window, it bundles four improvement proposals:

- **KIP-17** — extended script-engine opcodes: the covenant backbone.
- **KIP-20** — covenant IDs: stable identity and lineage across a covenant's spends.
- **KIP-16** — zero-knowledge verification opcodes with precompiles (Groth16 and RISC Zero STARK verifiers) for on-chain proof checking.
- **KIP-21** — partitioned sequencing commitments, enabling "based" ZK applications whose proving cost scales only with their own activity.

**SilverScript**, a CashScript-inspired language and compiler, lets developers author covenants and compile them to Kaspa script. It is currently experimental and valid on **Testnet-12**; mainnet validity arrives with Toccata. Covex builds directly on this stack.

#### 6.2 Problem

A programmable UTXO is invisible without infrastructure. At the moment covenants reach mainnet, three gaps appear at once:

1. **Discovery.** Covenants are not contract accounts; they are spend conditions on outputs. Finding them means walking the DAG and recognizing script envelopes — not reading an account list.
2. **Interaction.** A covenant is only useful if counterparties can act on it: fund it, join it, prove an outcome, claim a payout. That requires a UI bound to a wallet and to the covenant's real on-chain parameters.
3. **Authorship.** Writing correct script is hard and unforgiving; one mistake locks funds forever. Most people who want a covenant should never touch raw opcodes.

#### 6.3 Design

**Indexing.** Three independent background workers per network give defense in depth: a *crawler* that walks the selected-parent chain recognizing `aa20–aa23` covenant envelopes; a *live indexer* polling seed addresses every 10 seconds for fresh UTXOs; and a *payment guardian* watching the treasury to confirm tier payments at six DAA confirmations. Discovered covenants are classified by opcode signature into 17 categories (escrow, vesting, atomic swap, multisig, prediction, governance, community pool, skill/verifiable-skill games, P2SH commitments, and more). On mainnet, a bare P2SH commitment is indistinguishable from an ordinary output and is *not* counted as a covenant until Toccata activation — the explorer stays honest rather than inflating numbers.

**Interaction.** Every covenant has a page bound to its on-chain address. Visitors connect any Kaspa wallet (KasWare, Kastle, Kasperia, OKX, and more) and act non-custodially. Game covenants are the proof of concept: two players stake into a covenant, play a real game (chess and seven others) with moves persisted and synced live over WebSockets, and the outcome is resolved and signed; the winner's unlock spends the pot on-chain. The platform never custodies the stake.

**Authorship and the Studio.** Creators compose a covenant's public page from a fixed catalog of platform-authored blocks using a drag-and-drop builder (Puck), or type a theme directly in a design-code terminal; 240 procedural presets give instant, professional starting points. Because pages serialize to validated JSON rendered through an allow-listed component set, **no user-authored HTML or JavaScript ever reaches a visitor's DOM** — eliminating the phishing/XSS surface that plagues open page builders on financial sites. Circuit selection (Groth16 and oracle-attested), fee and payout configuration, background images, and SilverScript compilation complete the authoring surface.

#### 6.4 Trust model

Covex is explicit about what is trustless and what is not.

- **Custody:** fully trustless. The platform reads UTXOs and verifies payments; it holds no keys and cannot move funds. Every value-moving action is signed by the user's wallet.
- **Discovery & display:** trustless in substance — every listed covenant is a real on-chain object; nothing is fabricated. The honesty gate on mainnet enforces this.
- **Resolution:** *currently oracle-assisted.* Game and event outcomes are verified — by a real Groth16 proof where a circuit and artifacts exist, otherwise attested — and signed by the Covex oracle; the signature is checked on-chain at unlock. Each covenant page states which mode applies via a trust badge. This is the one trusted component today, and it is disclosed, not hidden.
- **Visibility:** the ranking formula is public and deterministic; paid placement is labeled, never disguised as organic.

#### 6.5 Roadmap to trustlessness

Toccata's KIP-16 lets covenants verify proofs **on-chain**. Covex's resolution layer is built to migrate onto it: circuits that already have artifacts (Merkle membership, range, timelock, pot-split, VRF) move first to on-chain Groth16 verification; game logic moves to RISC Zero STARK guests, which need no trusted setup. As that migration completes, the oracle's role shrinks from "trusted signer" to "liveness helper," and eventually to optional. The honest badge system makes each step visible to users in real time. Beyond resolution: multi-oracle threshold signing for whatever remains attested, a real MPC ceremony (or STARK paths) to replace the development powers-of-tau, KCC-20 token indexing, a pay-per-call API revenue layer, and a PostgreSQL migration when covenant volume demands it.

#### 6.6 Why now

The platform that indexes mainnet covenants best at the moment they appear becomes the default explorer for the category. Covex is already the leading covenant explorer on Testnet-12 and runs a real mainnet node today, indexing for the Toccata activation window. The goal of this codebase is to be ready — correct, honest, and complete — on day one of covenants on Kaspa mainnet.

---

## 7. Documentation

- [Master Build Plan](docs/COVEX_MASTER_BUILD_PLAN.md) — the phased roadmap
- [Current Audit](docs/COVEX_AUDIT_AND_IMPROVEMENT_PLAN_2026-06-12.md) — full platform audit
- [Building on Covex](docs/BUILDING_ON_COVEX.md) — integrate the API
- [Operations Runbook](docs/OPERATIONS_RUNBOOK.md)

## Sources

Toccata outlook & KIPs: [Michael Sutton, Medium](https://medium.com/@michaelsuttonil/kaspa-covenants-toccata-hard-fork-outlook-a4d81a40900c) · KIPs: [github.com/kaspanet/kips](https://github.com/kaspanet/kips) · Crescendo / 10 BPS: [kaspa.org](https://kaspa.org/crescendo-hard-fork-roadmap-10bps) · SilverScript: [kasmedia](https://kasmedia.com/article/hail-the-silverscript), [github.com/kaspanet/silverscript](https://github.com/kaspanet/silverscript) · Mainnet activation window: [kas.live](https://kas.live/) · Node & SDK: [github.com/kaspanet/rusty-kaspa](https://github.com/kaspanet/rusty-kaspa)

---

Built on [Kaspa](https://kaspa.org) · [rusty-kaspa](https://github.com/kaspanet/rusty-kaspa) · [SilverScript](https://github.com/kaspanet/silverscript)
