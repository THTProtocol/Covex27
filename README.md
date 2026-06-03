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

  <h3 style="margin-top: -10px;">The Platform for Verifiable Interactive Covenants on Kaspa</h3>

  <br>

  <a href="https://hightable.pro"><img src="https://img.shields.io/badge/live-hightable.pro-49EACB?style=for-the-badge" alt="Live"></a>
  <a href="https://hightable.pro"><img src="https://img.shields.io/badge/network-Toccata%20TN12-49EACB?style=for-the-badge" alt="Network"></a>
  <a href="https://github.com/THTProtocol/Covex27/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-49EACB?style=for-the-badge" alt="License"></a>
  <a href="https://github.com/THTProtocol/Covenant-Studio"><img src="https://img.shields.io/badge/Covenant%20Studio-UI%20Editor-49EACB?style=for-the-badge" alt="Covenant Studio"></a>

  <br><br>

  > **Non-custodial.** Real SilverScript covenants on the Kaspa BlockDAG.<br>
  > **Verifiable.** ZK proofs + oracle attestation for fair game and claim resolution.<br>
  > **Beautiful.** Pro full-screen experiences (chess.com-smooth after matched stakes) + rich custom UIs.

  <br>

  **Live:** [hightable.pro](https://hightable.pro)

</div>

---

## What is Covex?

Covex is the leading platform for building and experiencing **interactive, verifiable covenants** on Kaspa.

It combines:
- A high-performance indexer and explorer for native Kaspa SilverScript covenants (`aa20`–`aa23`).
- The **Covex Terminal** — a powerful configuration and deployment tool for paid users.
- First-class support for **ZK-attested and oracle-signed resolution** so games and claims are fair and provable.
- Professional, full-screen playable experiences (starting with chess after both players stake equal amounts) that feel like top consumer apps.

Covex makes it possible to deploy real on-chain logic with rich, custom frontends and cryptographic fairness — all while staying fully non-custodial.

**Covenant Studio** (companion project) lets you visually design beautiful game UIs and templates, then paste the generated code into the Covex Terminal.

---

## Core Principles

- **On-chain truth only** — Covenants live on the Kaspa BlockDAG. Covex only indexes, serves, and helps you attach UIs and resolution logic.
- **Free entry, paid visibility** — Anyone can deploy a basic covenant for free. Paid tiers (BUILDER / PRO / MAX) unlock the full Terminal and give your covenant better placement on the Explorer.
- **Verifiable outcomes** — Use real ZK circuits (Merkle Membership is production-ready) or trusted oracle attestation for game results, claims, and eligibility.
- **Pro UX** — Full-screen, smooth, high-quality game experiences (chess.com level and beyond) once stakes are matched.
- **Developer friendly** — Clear separation between covenant logic (Terminal) and presentation (Covenant Studio).

---

## Current Tech Stack

### Backend (Rust)
- **Runtime**: Tokio + Axum 0.7 (single binary)
- **Kaspa Integration**: `kaspad` (Toccata TN12) via wRPC Borsh (`kaspa-wrpc-client`, `kaspa-rpc-core`)
- **Consensus**: Vendored & patched `kaspa-consensus-core`
- **Database**: SQLite (`rusqlite`) — 6 tables with tier-weighted native SQL sorting
- **Components**:
  - Historic Crawler (selected-parent BlockDAG walk + payload scanning)
  - Live Indexer (UTXO polling on seed addresses)
  - Payment Verifier (6 DAA treasury confirmations → tier upgrade)
  - Oracle Service (`/api/oracle/verify-and-sign`) — real Groth16 verification via snarkjs + outcome signing
  - SilverScript Compiler + UI Generator
- **Signing/Broadcast**: Native secp256k1 + transaction construction

### Frontend
- **Framework**: Vite 8 + React 19 + TypeScript
- **Styling**: Tailwind CSS v4 + hybrid shadcn/ui components (Button, Card, Badge, etc.) + rich custom cyberpunk design system (glass panels, Kaspa-green glows, high visual density)
- **Key Libraries**:
  - `chess.js` + `react-chessboard` (pro full-screen chess)
  - Framer Motion
  - Lucide icons
  - `@onekeyfe/kaspa-wasm` (dev-mode key derivation & tx building)
- **Multi-wallet**: KasWare, Kastle, OKX, Kasperia, Kasanova, Kaspium, KaspaCom, Tangem + local WASM dev mode
- **Theme**: Dark cypherpunk (default) + lighter cypherpunk light mode, both with strong #49EACB accents. Theme toggle in nav.

### ZK & Verifiable Resolution
- **Circuits**: circom + Groth16 (snarkjs)
  - Merkle Membership: Fully production (real proofs + live oracle path)
  - Range Proof: Circuit + ceremony complete, oracle wired
  - Chess v1 & others: Client-side perfect rule enforcement + oracle attestation path today; real ZK circuits as they mature
- **Oracle**: Node.js snarkjs verifier + Schnorr-style outcome signatures consumable by covenants
- **Integration**: Deeply wired into Covex Terminal and pro game arenas (submit result → get signed outcome)

### Infrastructure & Deployment
- **Node**: kaspad `--testnet --netsuffix=12 --utxoindex` (wRPC on 17217)
- **Hosting**: Hetzner (Nginx reverse proxy + static SPA)
- **Process Management**: systemd (kaspad + covex-backend)
- **CI/Deploy**: Idempotent bash scripts (`DEPLOY_TO_HIGHTABLE.sh`)
- **Monitoring**: Health endpoints, crawler state, covenant counts

### Covenant Layer (Kaspa)
- Native SilverScript (`aa20`–`aa23` opcodes in transaction payloads)
- One-time tier payments to treasury (BUILDER 100 KAS, PRO 500 KAS, MAX 1000 KAS)
- On-chain fee parameters, outcome enums, and payout branches enforced by the covenant script

---

## Tiers (BUILDER / PRO / MAX)

| Tier     | One-time Fee | Explorer Visibility          | Covex Terminal + Custom UIs | Pro Full-Screen Games | ZK / Oracle Config |
|----------|--------------|------------------------------|-----------------------------|-----------------------|--------------------|
| **FREE** | 0 KAS       | Standard                     | —                           | —                     | —                  |
| **BUILDER** | 100 KAS  | Good                         | Full access                 | Yes                   | Yes                |
| **PRO**  | 500 KAS     | Featured                     | Full access                 | Yes                   | Yes                |
| **MAX**  | 1000 KAS    | Top priority + TVL boost     | Full access                 | Yes                   | Yes                |

All paid tiers get **identical** powerful tools in the Terminal. The difference is purely visibility on the Explorer.

Free basic covenant deployment is always available to everyone (including paid users).

---

## Pro Games & Verifiable Resolution

Covex ships production-grade, full-screen playable experiences:

- **Chess**: After both players stake the same amount, launch a chess.com-smooth full-screen arena (large board, real clocks, move list, legal moves only, resign). On game end, submit the result directly to the live oracle for a signed attestation that can be used to resolve the covenant.
- **Poker, Blackjack, and others**: Same matched-stakes → professional full-screen table pattern, with oracle-backed resolution (ZK hand-ranking and outcome circuits in progress).

Resolution today is **oracle-attested** (real cryptographic verification of ZK proofs where available, followed by a signed outcome). This signature serves as a witness for covenant unlocking. Full on-chain ZK verification is the natural next step as the Kaspa covenant language evolves.

---

## How It Works (User Flow)

1. **Deploy** a basic covenant for free (or upgrade an existing one).
2. **Pay a tier** (BUILDER/PRO/MAX) on that specific covenant → unlocks the Covex Terminal.
3. In the **Terminal**:
   - Configure fees, reusability, top-ups, claim percentages.
   - Choose resolution method (ZK proof or Oracle).
   - Select or attach a circuit (Merkle, Range, Chess, etc.).
   - Paste rich UI code from Covenant Studio or use built-in pro game arenas.
4. Players interact through the custom (or pro full-screen) UI.
5. On resolution: Submit proof/result → Oracle verifies and signs → Use signature to unlock/payout on-chain.

Everything stays non-custodial. Keys never leave the user's wallet.

---

## For Developers & Builders

- Use **Covenant Studio** to visually design and customize game templates.
- Use the **Covex Terminal** (inside any paid covenant) to define the on-chain rules and attach your UI.
- Real examples and proving scripts live in the `examples/` and `zk/` directories.
- All covenant state and configuration is queryable via the public API.

See the live site and Terminal for the best current examples.

---

## Live & Resources

- **Explorer & Terminal**: [https://hightable.pro](https://hightable.pro)
- **Covenant Studio**: [github.com/THTProtocol/Covenant-Studio](https://github.com/THTProtocol/Covenant-Studio)
- **Repo**: This repository (Covex27)
- **Treasury (TN12)**: `kaspatest:qpyfz03k6quxwf2jglwkhczvt758d8xrq99gl37p6h3vsqur27ltjhn68354m`

---

**Covex** — Making fair, beautiful, verifiable on-chain experiences possible on the Kaspa BlockDAG.

Built by HIGH TABLE PROTOCOL.