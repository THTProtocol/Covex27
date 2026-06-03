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
  <a href="https://github.com/THTProtocol/Covenant-Studio"><img src="https://img.shields.io/badge/Covenant%20Studio-Visual%20Editor-49EACB?style=for-the-badge" alt="Covenant Studio"></a>

  <br><br>

  > **Non-custodial.** Real SilverScript covenants (`aa20`–`aa23`) on the Kaspa BlockDAG.<br>
  > **Verifiable.** Production ZK (Merkle) + oracle attestation for fair games, claims, and outcomes.<br>
  > **Pro UX.** Full-screen, chess.com-smooth playable games that unlock only after both sides stake equal amounts.<br>
  > **Powerful tooling.** The Covex Terminal for configuration + rich custom UIs from Covenant Studio.

  <br>

  **Live:** [hightable.pro](https://hightable.pro) — Hundreds of real covenants indexed and interactive.

</div>

---

## What Covex Represents

Covex is the complete platform for **serious, fair, and beautiful interactive experiences** built directly on Kaspa native covenants.

It solves the hard parts:
- Discovering and making visible real on-chain SilverScript covenants.
- Attaching rich, custom, full-screen frontends.
- Providing cryptographic or attested resolution so games and claims are actually fair (not "trust us").
- Giving creators powerful tools (Terminal) without forcing them to run infrastructure.

**Free for basic deployment. Paid tiers (BUILDER / PRO / MAX) are purely for better visibility + full access to the Terminal and pro game experiences.**

Everything is non-custodial. The covenants live on the BlockDAG. Covex indexes, classifies, serves, and helps you attach the experience layer.

---

## High-Level Architecture

```
Browser (Explorer / Terminal / Full-Screen Games)
          │
          ▼
Nginx (static + /api proxy)
          │
          ▼
Rust Backend (Axum :3005)
  ├── Historic Crawler (BlockDAG walk, payload scan)
  ├── Live Indexer (UTXO polling on seeds)
  ├── Payment Verifier (6 DAA treasury upgrades → tier)
  ├── Oracle Service (snarkjs verify + sign outcomes)
  ├── SilverScript Compiler + UI Generator
  └── API (covenants, terminal-config, oracle, sign-and-broadcast)
          │
          ▼
SQLite (covex.db) — tier-weighted native queries
          │
          ▼
kaspad TN12 (wRPC Borsh :17217) — the source of truth
```

Two independent repos:

- **Covex27** (this repo): The indexer, explorer, Terminal, oracle, and pro game experiences.
- **Covenant-Studio**: Visual editor for designing game UIs and templates. "Generate Code" → paste into Covex Terminal.

**Workflow for a pro game covenant**:
Design UI in Studio → Deploy basic covenant (free) → Pay BUILDER/PRO/MAX on that covenant → Open Terminal → Configure resolution (ZK or Oracle), pick circuit, set fees → Paste rich UI or use built-in full-screen arena → Players stake equal amounts → Launch full-screen pro game → Submit result → Oracle attests + signs → Use signature to resolve on-chain.

---

## Current Technology Stack (2026)

### Kaspa Layer
- **Node**: kaspad (Toccata Testnet-12) with `--utxoindex`
- **Covenant primitive**: SilverScript opcodes `aa20`–`aa23` inside transaction `payload` (not output scripts)
- **wRPC**: Borsh protocol for fast structured queries

### Backend (Single Rust Binary)
- Tokio + Axum 0.7 (high-performance async HTTP + background tasks)
- `kaspa-wrpc-client`, `kaspa-rpc-core`, vendored+patched `kaspa-consensus-core`
- SQLite (`rusqlite`) — 6 core tables, heavy use of native SQL for tier sorting and visibility
- Four long-running tasks:
  - Historic Crawler (selected-parent chain walk + `tx.payload` opcode detection)
  - Live Indexer (periodic `get_utxos_by_addresses` on configured seeds)
  - Payment Verifier (monitors treasury, 6 DAA confirmation, upgrades `verified_tier`)
  - Oracle (Node.js child process running snarkjs for real Groth16 verification + outcome signing)
- Native transaction construction + secp256k1 signing (no external deps for signing)
- Centralized classification in `covenant_types.rs` (used by crawler + indexer)

### Frontend
- Vite 8 + React 19 + Tailwind CSS v4
- Hybrid design system: shadcn/ui primitives (`Button`, `Card`, `Badge`...) + rich custom cyberpunk components (glass-panel, glow shadows, high information density)
- Pro game experiences:
  - `react-chessboard` + `chess.js` for full FIDE enforcement + chess.com-smooth full-screen arena (clocks, move list, resign, large board)
  - Similar patterns prepared for poker / other games
- Multi-wallet detection (8 providers) + `@onekeyfe/kaspa-wasm` dev mode (BIP39 → local keys/tx building)
- Theme system (dark cypherpunk default + lighter cypherpunk variant, both with strong #49EACB)

### ZK + Verifiable Resolution
- **circuits**: circom (Groth16)
- **prover/verifier**: snarkjs (run via Node child processes in the oracle)
- **Production-ready**:
  - Merkle Membership (full end-to-end: prove in browser/scripts → oracle verifies → signed outcome usable as covenant witness)
  - Range Proof (circuit + ceremony complete, oracle handler ready)
- **Game integration**: Client-side perfect rule enforcement (chess.js etc.) + one-click "Submit Result to Oracle" in the pro full-screen arenas. The oracle returns a signature that resolves the covenant outcome.
- Future: Real on-chain ZK verification when silverc gains better primitives.

### Infrastructure & Ops
- Hetzner dedicated server
- Nginx (SPA + API proxy + SSL)
- systemd units for kaspad + covex-backend
- Idempotent deploy scripts (`DEPLOY_TO_HIGHTABLE.sh`)
- Absolute DB path resolution (prevents "zombie inode" bugs after deploys)
- Health, status, and covenant count endpoints

### Covenant Configuration (Terminal)
- Fees (0-5%)
- Reusability
- Top-ups
- Partial claims
- Resolution mode: `zk` / `oracle` / `custom_oracle`
- ZK circuit selection + verifier key (from the registry in `CovexTerminal.jsx`)
- Custom UI paste area (from Covenant Studio or hand-crafted)
- Auto-generates SilverScript with proper outcome branches and resolution comments

---

## Covenant Classification (How the Indexer & Crawler Understand Covenants)

Both the **Historic Crawler** and **Live Indexer** run the same classification logic on the raw `script_hex` (from `tx.payload` or UTXO script).

The logic lives in `backend/src/covenant_types.rs` (`CovenantCategory::from_script_ops` and `CovenantCategory::covenant_type`).

### Broad Category (user-facing on Explorer cards)
Current rich set (expanded for ZK/games/claims era):

| Category              | Detection Heuristic                              | Typical Use Case                     |
|-----------------------|--------------------------------------------------|--------------------------------------|
| **Verifiable Games (ZK/Oracle)** | aa20 + OP_1 (51) + longer payload (>90 bytes) or complex game logic | Chess, Poker, skill games with real resolution |
| **Skill Contests**    | aa20/aa21 + OP_1 (51), single outcome            | Classic one-winner contests          |
| **Membership & Claims** | Short-to-medium aa20 with claim patterns        | Merkle membership, range proofs, eligibility, airdrops |
| **Predictive Markets**| aa20 containing 52 or 53 (OP_2 / OP_3)           | Binary/ternary outcome markets       |
| **Structured Settlement** | aa20 + payload > 120 bytes (timelock/DAA logic) | Escrow with time or block conditions |
| **Escrow & Custody**  | aa21 without multi-outcome markers               | 2-party or multi-party time-locked   |
| **Governance**        | aa21 + 51 + 52 (multi-outcome voting)            | DAO votes, multi-party decisions     |
| **Tournaments**       | aa22                                             | Multi-sig threshold tournaments      |
| **Community Pools**   | aa23                                             | Shared funds, lotteries, pools       |
| **Flash Covenants**   | Any aa2x + raw payload < 80 bytes                | Simple one-shot logic                |
| **General**           | Fallback                                         | Everything else                      |

**Custom override**: BUILDER+ users can set a free-form `custom_category` in the Terminal. This replaces the auto-detected label on the Explorer and detail page (stored in both `covenants.category` and the UI config).

### Granular covenant_type (used internally + API)
More precise types for developers and the Terminal:

- `p2sh-covenant`
- `extended-covenant`
- `multi-sig-covenant`
- `community-pool-covenant`
- `complex-interactive-covenant` (rich games/ZK logic)
- `verifiable-skill-covenant`
- `skill-covenant`
- `governance-covenant`
- `generic-covenant`

This classification happens **before** any UI generation or tier payment. It gives the Explorer its smart organization and helps the Terminal suggest appropriate circuits and templates.

---

## How Everything Flows Together (Full Followthrough)

1. **On-chain birth**  
   A user (or the backend signer) creates a transaction with a SilverScript payload in `tx.payload` containing `aa20`–`aa23` and the desired logic. Output[1] can contain the tier payment to the treasury.

2. **Detection**  
   - Crawler walks the selected-parent chain backward, fetches full blocks, scans payloads.
   - Live Indexer polls UTXOs on seed addresses every 10s and filters for covenant scripts.
   - Both call the centralized `from_script_ops` + `covenant_type`.

3. **Tier & Visibility**  
   Payment Verifier watches the treasury every 15s. On 6 DAA confirmation it upgrades `verified_tier`, enables `custom_ui_enabled`, and records visibility priority (MAX=100, PRO=50, BUILDER=10).

4. **UI Generation**  
   Basic (FREE) or enhanced (paid) HTML is generated and stored. Paid users can later override with rich code from Studio + Terminal config (fees, resolution mode, zk_circuit, etc.).

5. **Pro Experiences (new in 2026)**  
   In the Covex Terminal (or pasted custom UI) the user configures a game. Once two parties have staked equal amounts into the covenant pot, the full-screen professional arena becomes available.
   - Chess: chess.com-smooth (large board, real clocks, move list, perfect FIDE enforcement via chess.js).
   - Result submission calls the live oracle → signed outcome returned.

6. **Resolution**  
   - ZK path: Browser/scripts produce Groth16 proof → submitted to `/api/oracle/verify-and-sign` → snarkjs verifies → oracle signs outcome.
   - Oracle path: Same endpoint (for game results, claims, etc.).
   - The signature + outcome can be used as witness data when spending/unlocking the covenant UTXO.

7. **Explorer**  
   Always renders the SQL-sorted list. Paid covenants get visual priority (borders/glows) but **no tier labels are shown to regular visitors** — only the creator sees their own badge when their wallet is connected.

---

## Database Schema (Simplified)

Core tables: `covenants`, `generated_uis`, `visibilities`, `payments`, `accounts`, `crawler_state`.

The `covenants` table is the source of truth for what the Explorer shows. `generated_uis.ui_config` holds the rich Terminal configuration (including `zk_circuit`, `resolution_mode`, custom UI code, etc.).

---

## API Highlights

- `GET /api/covenants` — tier-sorted list (the main feed for the Explorer)
- `GET /api/covenants/:id`
- `GET/POST /api/terminal-config/:id` — the heart of paid configuration
- `POST /api/oracle/verify-and-sign` — submit proof or game result, get signed outcome
- `POST /api/sign-and-broadcast` — convenient Rust-native covenant deployment

Full list and auth rules are in the code and live on the site.

---

## Wallet Support

Desktop + mobile detection for:
KasWare, Kastle, Kasperia, OKX, KaspaCom, Kasanova, Kaspium, Tangem.

Full local dev mode via WASM (no extension required for testing).

---

## Quick Start (for running your own)

See `deploy/` scripts and the `Quick Start` section in the old detailed docs if you want to self-host. The production instance runs on hightable.pro with the official TN12 treasury.

---

**Covex** — Real covenants. Verifiable outcomes. Pro experiences. On the Kaspa BlockDAG.

Built by HIGH TABLE PROTOCOL.

Live: [hightable.pro](https://hightable.pro)  
Studio: [github.com/THTProtocol/Covenant-Studio](https://github.com/THTProtocol/Covenant-Studio)  
Repo: This repository

---

*This README describes the current production state. Classification logic, pro game UIs, and oracle flows are actively used on the live site.*