<div align="center">

  <img src="docs/assets/covex-logo-full.png" alt="Covex" width="220">

  <br><br>

  <a href="https://hightable.pro"><img src="https://img.shields.io/website?url=https%3A%2F%2Fhightable.pro&label=hightable.pro&up_message=live&down_message=down&style=flat-square" alt="Live site"></a>
  <img src="https://img.shields.io/badge/networks-mainnet%20·%20TN12%20·%20TN10-1f6feb?style=flat-square" alt="Networks">
  <img src="https://img.shields.io/badge/backend-Rust%20·%20Axum-b7410e?style=flat-square" alt="Backend">
  <img src="https://img.shields.io/badge/frontend-React%2019%20·%20Vite-61dafb?style=flat-square" alt="Frontend">
  <img src="https://img.shields.io/badge/data-100%25%20on--chain%2C%20zero%20placeholders-2da44e?style=flat-square" alt="Data policy">

  <h3>The Covenant Explorer &amp; Studio for Kaspa Mainnet</h3>

  <p><strong>Index every covenant · Make every covenant interactive · Design, verify, and monetize covenants. Built for the Toccata mainnet era.</strong></p>

  <p>
    <a href="https://hightable.pro"><b>hightable.pro</b></a> ·
    <a href="https://hightable.pro/docs">API docs</a> ·
    <a href="https://hightable.pro/whitepaper">Whitepaper</a> ·
    <a href="https://hightable.pro/treasury">Treasury</a> ·
    <a href="#7-whitepaper">Whitepaper (below)</a>
  </p>
</div>

---

> **Status (2026-06-12):** Kaspa mainnet runs at 10 BPS since the Crescendo hard fork (May 2025). Native L1 **covenants** arrive with the **Toccata** hard fork, scheduled for the **June 5 to 20, 2026** mainnet activation window (KIP-16/17/20/21). Covex runs a real mainnet node today and is indexing for that activation: **the mainnet covenant explorer is honestly empty until the first real covenant lands**. No placeholder data, ever. Covenants are live now on Toccata **Testnet-12**, where Covex already indexes 7,800+ of them.

---

## 1. What Covex is

Covex is the place where **Kaspa covenants live**. A covenant is a SilverScript program embedded in a Kaspa UTXO that constrains how that UTXO may be spent: escrows, vaults, prediction markets, on-chain games, vesting, multisig, atomic swaps, and more. Today these are programmable UTXOs; with Toccata they become a first-class L1 smart-contract surface.

```mermaid
mindmap
  root((COVEX))
    Explore
      Every covenant discovered on-chain
      17 categories, search, pagination
      Live activity feed and ticker
      Address portfolios
      Lifecycle and action history
    Interact
      Connect any Kaspa wallet
      Stake, join, claim, resolve
      Game arenas settling real pots
      WebSocket live sync
    Create
      Free covenant creator
      Puck drag-and-drop page studio
      240 procedural design presets
      Real circuits, Groth16 and oracle
      SilverScript compilation
    Trust
      Non-custodial end to end
      Trust badge on every covenant
      Public treasury and ranking formula
      Honesty gate on mainnet
```

| Pillar | What it means | Free? |
|--------|---------------|-------|
| **Explore** | Every covenant on the chain, discovered on-chain by independent indexers. Paginated API, keyword search, 17 categories, live activity feed, per-covenant lifecycle and action history, address portfolios. | Free forever |
| **Interact** | Connect a Kaspa wallet and act on any covenant directly: stake, join, claim, resolve. On-chain game arenas (chess and 7 more) settle real pots with oracle-signed or ZK-verified outcomes, syncing live over WebSockets. | Free forever |
| **Create** | A free covenant creator plus paid Studio tiers: a Puck drag-and-drop page builder, 240 procedural design presets plus a design-code terminal, real circuits (Groth16 and oracle), fee/payout config, background images, and SilverScript compilation. | Free + paid tiers |
| **Trust** | Every covenant page shows its lifecycle, resolution-trust badge (ZK-verified / Oracle-attested / On-chain script), receiving addresses, fees, and creator portfolio. The platform treasury, ranking formula, and payment history are public. | Always on |

**Non-custodial, end to end.** Keys never leave your wallet. The platform reads UTXOs and verifies payments on-chain; it never holds funds and cannot move them.

### Live numbers

Real indexed data as of **2026-06-12**. Nothing here is seeded, simulated, or projected; every figure is queryable from the public API right now.

| Network | Covenants indexed | Provably paid | TVL |
|---------|------------------:|--------------:|----:|
| Testnet-12 (Toccata) | 7,841 | 2 | 38.06M KAS |
| Testnet-10 | 3,176 | 0 | 15,349 KAS |
| Mainnet | 0 (gated until Toccata activation) | 0 | 0 |

```bash
# verify these numbers yourself, live:
curl "https://hightable.pro/api/covenants?network=testnet-12&limit=1" | jq .stats
```

"Provably paid" means a covenant deployed through the Covex paid flow with an on-chain treasury payment confirmed at 6 DAA. It is never inferred from chain heuristics.

---

## 2. Architecture

Covex is a Rust indexing/oracle backend, a React explorer/studio frontend, and the Kaspa nodes it reads. This is the real production topology on `hightable.pro`, not an aspiration diagram.

```mermaid
flowchart TB
    subgraph KASPA["Kaspa BlockDAG"]
        direction LR
        MN["Mainnet"]
        T12["Testnet-12, Toccata"]
        T10["Testnet-10"]
    end

    subgraph PC["Operator PC, WSL"]
        WSLNODE["mainnet kaspad :17110"]
    end

    subgraph SRV["Hetzner server, hightable.pro"]
        K12["kaspad TN12<br/>wRPC :17217"]
        K10["kaspad TN10<br/>wRPC :17210"]
        TUN["reverse SSH tunnel<br/>loopback :17310"]
        subgraph BE["covex-backend, Rust / Axum :3006"]
            IDX["3 indexers per network<br/>crawler · live indexer · payment guardian"]
            API["HTTP API + WebSocket /ws"]
            ORC["oracle verify-and-sign<br/>Groth16 strict / hybrid / attested"]
        end
        DB[("SQLite WAL<br/>covex.db")]
        NG["nginx :443"]
        SPA["React SPA, static dist"]
    end

    BROWSER["Browser: explorer, studio, arena<br/>KasWare · Kastle · Kasperia · OKX wallets"]

    MN --- WSLNODE
    WSLNODE -- "ssh -R, self-healing" --> TUN
    T12 --- K12
    T10 --- K10
    K12 -- "wRPC borsh" --> IDX
    K10 -- "wRPC borsh" --> IDX
    TUN -- "wRPC borsh" --> IDX
    IDX --> DB
    DB --> API
    ORC --> API
    NG -- "/api/* strips prefix" --> API
    NG -- "/" --> SPA
    BROWSER -- "HTTPS / WSS" --> NG
```

### From deploy to display

```mermaid
sequenceDiagram
    autonumber
    actor Creator
    participant Wallet
    participant Studio as Covex Studio
    participant Node as Kaspa node, wRPC
    participant Indexers as Crawler + Live indexer
    participant Guardian as Payment guardian
    participant DB as SQLite
    participant Explorer as Explorer / API

    Creator->>Studio: design covenant, pick circuits and fees
    Studio->>Wallet: request signature
    Wallet->>Node: submit covenant UTXO transaction
    Node-->>Indexers: aa20-aa23 envelope appears on-chain
    Indexers->>DB: insert + classify into 17 categories
    opt paid tier
        Creator->>Wallet: one-time KAS payment to public treasury
        Guardian->>DB: 6 DAA confirmations, tier upgraded once
    end
    Explorer->>DB: /api/covenants, /api/events, /api/games
    Explorer-->>Creator: live page, ticker and arena sync over /ws
```

On mainnet, bare P2SH commitments are **not** counted as covenants until Toccata activation. That is the honesty gate: the explorer stays empty rather than inflating numbers.

### Stack

- **Frontend:** React 19 + Vite, Tailwind v4, React Router 7, route-level code splitting, `@measured/puck` page builder, `react-chessboard` + `chess.js`, in-browser `snarkjs`, `@kasflow/wallet-connector`.
- **Backend:** Rust, Axum 0.7, `kaspa-wrpc-client` (Borsh wRPC), vendored `kaspa-consensus-core` with the TN12 sighash fix, SQLite WAL, Tokio background tasks, `secp256k1` Schnorr signing.
- **ZK/Oracle:** circom + circomlib circuits, `snarkjs` verification via a Node child process, a pluggable oracle registry (strict Groth16 / hybrid / attested per circuit).
- **Infra:** Hetzner + systemd + nginx; mainnet node on the operator PC via a self-healing reverse SSH tunnel; nightly verified database backups with a weekly restore drill; triple-synced deploys (GitHub = server = hightable.pro).

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

## 4. Tiers &amp; visibility

One-time KAS payment **per covenant**, verified on-chain (6 DAA confirmations to the public treasury). A covenant is "paid" only if it was deployed through the Covex paid flow, never inferred. Higher tier = better tools + higher placement, by a **public, deterministic** ranking formula (`tier_weight, then locked value, then recency`), documented at [/treasury](https://hightable.pro/treasury).

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

Mainnet refuses to start without `COVEX_ORACLE_KEY`. The compiled-in oracle key is testnet-only.

---

## 6. Roadmap

```mermaid
timeline
    title Kaspa covenants and where Covex fits
    section Crescendo era
        May 2025 : Crescendo hard fork, 10 BPS mainnet : KIP-10 introspection opcodes, first step toward covenants
    section Testnet era
        2025 to 2026 : SilverScript covenants live on Testnet-12 : Covex ships explorer, studio, arenas, oracle : 11,000+ covenants indexed across TN12 and TN10
    section Toccata
        June 2026 : Mainnet activation window June 5 to 20 : KIP-16, KIP-17, KIP-20, KIP-21 : Covex mainnet indexer armed behind the honesty gate
    section Trustless era
        After activation : Mainnet covenants indexed from the first one : resolutions migrate to on-chain Groth16 and STARK verification : multi-oracle threshold signing, KCC-20 indexing, pay-per-call API
```

The full phased plan lives in [docs/COVEX_MASTER_BUILD_PLAN.md](docs/COVEX_MASTER_BUILD_PLAN.md).

---

<a name="whitepaper"></a>
## 7. Whitepaper

### Covex: A Covenant Explorer and Studio for Kaspa Mainnet

**Abstract.** Kaspa's Toccata hard fork turns a 10 BPS proof-of-work BlockDAG into a covenant-capable L1: native, stateful, multi-transaction programs over UTXOs, with on-chain zero-knowledge verification. The missing layer is human: a place to *see* every covenant, *interact* with any of them safely, and *create* them without writing raw script. Covex is that layer. This paper describes the problem, the design, the trust model, and the path from oracle-assisted resolution today to fully on-chain proof verification under KIP-16.

#### 7.1 Background: covenants on Kaspa

Kaspa is a proof-of-work BlockDAG using the GHOSTDAG/DAGKNIGHT ordering protocol. Since the **Crescendo** hard fork (mainnet, ~May 2025) it produces **10 blocks per second** while preserving Nakamoto-style security, with a roadmap toward 100 BPS. Crescendo also shipped **KIP-10** transaction-introspection opcodes, the first step toward covenants.

The **Toccata** hard fork completes the covenant story. Scheduled to activate on mainnet in the **June 5 to 20, 2026** window, it bundles four improvement proposals:

- **KIP-17**: extended script-engine opcodes, the covenant backbone.
- **KIP-20**: covenant IDs, stable identity and lineage across a covenant's spends.
- **KIP-16**: zero-knowledge verification opcodes with precompiles (Groth16 and RISC Zero STARK verifiers) for on-chain proof checking.
- **KIP-21**: partitioned sequencing commitments, enabling "based" ZK applications whose proving cost scales only with their own activity.

**SilverScript**, a CashScript-inspired language and compiler, lets developers author covenants and compile them to Kaspa script. It is currently experimental and valid on **Testnet-12**; mainnet validity arrives with Toccata. Covex builds directly on this stack.

#### 7.2 Problem

A programmable UTXO is invisible without infrastructure. At the moment covenants reach mainnet, three gaps appear at once:

1. **Discovery.** Covenants are not contract accounts; they are spend conditions on outputs. Finding them means walking the DAG and recognizing script envelopes, not reading an account list.
2. **Interaction.** A covenant is only useful if counterparties can act on it: fund it, join it, prove an outcome, claim a payout. That requires a UI bound to a wallet and to the covenant's real on-chain parameters.
3. **Authorship.** Writing correct script is hard and unforgiving; one mistake locks funds forever. Most people who want a covenant should never touch raw opcodes.

#### 7.3 Design

**Indexing.** Three independent background workers per network give defense in depth: a *crawler* that walks the selected-parent chain recognizing `aa20` to `aa23` covenant envelopes; a *live indexer* polling seed addresses every 10 seconds for fresh UTXOs; and a *payment guardian* watching the treasury to confirm tier payments at six DAA confirmations. Discovered covenants are classified by opcode signature into 17 categories (escrow, vesting, atomic swap, multisig, prediction, governance, community pool, skill and verifiable-skill games, P2SH commitments, and more). On mainnet, a bare P2SH commitment is indistinguishable from an ordinary output and is *not* counted as a covenant until Toccata activation: the explorer stays honest rather than inflating numbers.

**Interaction.** Every covenant has a page bound to its on-chain address. Visitors connect any Kaspa wallet (KasWare, Kastle, Kasperia, OKX, and more) and act non-custodially. Game covenants are the proof of concept: two players stake into a covenant, play a real game (chess and seven others) with moves persisted and synced live over WebSockets, and the outcome is resolved and signed; the winner's unlock spends the pot on-chain. The platform never custodies the stake.

**Authorship and the Studio.** Creators compose a covenant's public page from a fixed catalog of platform-authored blocks using a drag-and-drop builder (Puck), or type a theme directly in a design-code terminal; 240 procedural presets give instant, professional starting points. Because pages serialize to validated JSON rendered through an allow-listed component set, **no user-authored HTML or JavaScript ever reaches a visitor's DOM**, eliminating the phishing/XSS surface that plagues open page builders on financial sites. Circuit selection (Groth16 and oracle-attested), fee and payout configuration, background images, and SilverScript compilation complete the authoring surface.

#### 7.4 Trust model

Covex is explicit about what is trustless and what is not.

```mermaid
flowchart LR
    OUT["Covenant outcome"] --> Q{"Circuit artifacts exist?"}
    Q -- yes --> ZK["Groth16 proof verified<br/>badge: ZK-verified"]
    Q -- no --> AT["Oracle attestation<br/>badge: Oracle-attested"]
    ZK --> SIG["Oracle signs the result"]
    AT --> SIG
    SIG --> CHAIN["Signature checked on-chain at unlock"]
    CHAIN -.-> FUT["Toccata KIP-16: verification<br/>moves fully on-chain"]
```

- **Custody:** fully trustless. The platform reads UTXOs and verifies payments; it holds no keys and cannot move funds. Every value-moving action is signed by the user's wallet.
- **Discovery and display:** trustless in substance. Every listed covenant is a real on-chain object; nothing is fabricated. The honesty gate on mainnet enforces this.
- **Resolution:** *currently oracle-assisted.* Game and event outcomes are verified, by a real Groth16 proof where a circuit and artifacts exist, otherwise attested, and signed by the Covex oracle; the signature is checked on-chain at unlock. Each covenant page states which mode applies via a trust badge. This is the one trusted component today, and it is disclosed, not hidden.
- **Visibility:** the ranking formula is public and deterministic; paid placement is labeled, never disguised as organic.

#### 7.5 Roadmap to trustlessness

Toccata's KIP-16 lets covenants verify proofs **on-chain**. Covex's resolution layer is built to migrate onto it: circuits that already have artifacts (Merkle membership, range, timelock, pot-split, VRF) move first to on-chain Groth16 verification; game logic moves to RISC Zero STARK guests, which need no trusted setup. As that migration completes, the oracle's role shrinks from "trusted signer" to "liveness helper," and eventually to optional. The honest badge system makes each step visible to users in real time. Beyond resolution: multi-oracle threshold signing for whatever remains attested, a real MPC ceremony (or STARK paths) to replace the development powers-of-tau, KCC-20 token indexing, a pay-per-call API revenue layer, and a PostgreSQL migration when covenant volume demands it.

#### 7.6 Why now

The platform that indexes mainnet covenants best at the moment they appear becomes the default explorer for the category. Covex already indexes 7,800+ covenants on Testnet-12 and runs a real mainnet node today, ready for the Toccata activation window. The goal of this codebase is to be ready, correct, honest, and complete, on day one of covenants on Kaspa mainnet.

---

## 8. Documentation

- [Master Build Plan](docs/COVEX_MASTER_BUILD_PLAN.md): the phased roadmap
- [Current Audit](docs/COVEX_AUDIT_AND_IMPROVEMENT_PLAN_2026-06-12.md): full platform audit
- [Building on Covex](docs/BUILDING_ON_COVEX.md): integrate the API
- [Operations Runbook](docs/OPERATIONS_RUNBOOK.md): backups, restore drills, monitoring

## Sources

Toccata outlook and KIPs: [Michael Sutton, Medium](https://medium.com/@michaelsuttonil/kaspa-covenants-toccata-hard-fork-outlook-a4d81a40900c) · KIPs: [github.com/kaspanet/kips](https://github.com/kaspanet/kips) · Crescendo / 10 BPS: [Michael Sutton, Medium](https://medium.com/@michaelsuttonil/unveiling-the-crescendo-hard-fork-roadmap-10bps-and-more-6072329e177f) · SilverScript: [kasmedia](https://kasmedia.com/article/hail-the-silverscript), [github.com/kaspanet/silverscript](https://github.com/kaspanet/silverscript) · Mainnet activation window: [kas.live](https://kas.live/) · Node and SDK: [github.com/kaspanet/rusty-kaspa](https://github.com/kaspanet/rusty-kaspa)

---

Built on [Kaspa](https://kaspa.org) · [rusty-kaspa](https://github.com/kaspanet/rusty-kaspa) · [SilverScript](https://github.com/kaspanet/silverscript)
