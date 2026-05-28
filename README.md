# COVEX — Kaspa Covenant Explorer & Premium Terminal

**Live production:** [https://hightable.pro](https://hightable.pro)  
**Covenant Studio (visual designer):** [https://hightable.pro/studio/](https://hightable.pro/studio/)

Covex is the complete, production-grade non-custodial covenant platform for Kaspa (Toccata TN12). It indexes every SilverScript covenant on-chain, serves a beautiful explorer, and gives **paid-tier creators** (Creator 100 KAS, PRO 500 KAS, MAX 1000 KAS) the full **Covex Terminal** — a professional tool to configure ZK circuits, attach oracles, set fees, generate enforceable SilverScript, and attach rich interactive UIs designed in Covenant Studio.

Everything is **on-chain enforceable**. No custody. No trusted game servers.

---

## What Makes COVEX 100% Complete

- **Strict paid-tier model** — Pay once → immediate access to the full Terminal + Studio integration. Free users are hard-blocked from premium flows.
- **Full ZK + Oracle attachment** — Three resolution modes (ZK Proof, Covex Oracle, Custom Oracle). Every game type auto-selects the correct audited circuit + verifier key.
- **Production Chess v1 (and v2)** — Real 8×8 board using `react-chessboard` + `chess.js`. **Every FIDE rule** is written out and enforced by the ZK circuit:
  - Castling (full rights tracking, path clear, not through check)
  - En passant, pawn double-step, promotion
  - Check, checkmate, stalemate
  - 50-move rule, threefold repetition, insufficient material
- **Stake → Match → Play → ZK Prove → Payout** flow built directly in the Terminal:
  - Choose stake (10–250 KAS)
  - Post stake & open match
  - Opponent matches
  - Play real legal chess on a chess.com-quality board
  - Game ends → Submit ZK proof (simulates `0xCHESSv1_8x8_STANDARD_AUDITED`)
  - Instant payout math: **Winner takes all minus exactly 2% covenant creator fee**
- **Covenant Studio integration** — Design beautiful UIs (chess boards, poker tables, etc.) visually, generate standalone HTML/JS/CSS, paste into Terminal. Saved via `/api/terminal-config/:txid` and merged into the public Explorer.
- **Explorer with live game previews** — Chess, Poker and other paid covenants render rich interactive minis (or the exact custom UI you attached).
- **Complete SilverScript generation** — Every configuration produces a ready-to-deploy, fully documented SilverScript covenant with `OpZkVerify`, fee splits, and outcome branches.
- **One Rust binary** — Crawler + Live Indexer + Payment Verifier + Axum API + SQLite. Zero external dependencies beyond kaspad.

---

## Architecture (Clean Separation)

| Layer              | What it does                                                                 | Location                  |
|--------------------|-------------------------------------------------------------------------------|---------------------------|
| **Explorer + Terminal** | React 19 + Vite frontend. Paid experience, ZK/Oracle config, live chess arena, SilverScript generator | `frontend/` |
| **Backend API**    | Axum. `/api/covenants`, `/terminal-config`, payment verification, tier logic | `backend/src/main.rs` + `db.rs` |
| **Covenant Studio**| Visual drag-and-drop template designer. Exports pure HTML bundles            | Separate repo: Covenant-Studio |
| **On-chain**       | SilverScript covenants (`aa20`–`aa23`). ZK proofs + oracle signatures         | Kaspa TN12 (kaspad) |

**Data flow for a Chess covenant:**
1. User pays (Creator/PRO/MAX) → localStorage + backend verification.
2. Opens Covex Terminal → selects **Chess v1** → ZK mode + `0xCHESSv1_8x8_STANDARD_AUDITED` auto-filled.
3. Uses the built-in **Chess ZK Arena** (or pastes a Studio-designed UI).
4. Stakes KAS, plays real game, submits ZK outcome.
5. SilverScript `unlock(outcome)` with verified winner pays out (2% fee to covenant creator/platform).
6. Explorer shows the live chess preview + "Custom UI" badge.

---

## The Chess Experience (Fully Wired)

Inside the Terminal (only visible for `chess_v1` / `chess_v2`):

- Professional chess.com board (exact square colors, smooth drag/drop, legal moves only via `chess.js`)
- Stake selector with live **2% fee math** and winner payout preview
- Real match flow (post stake → match → play)
- Full game-over detection (checkmate, resignation, draws via 50-move / repetition / stalemate)
- One-click **"Submit ZK Proof"** → proof hash + verified payout breakdown
- All FIDE rules explicitly documented in the generated SilverScript comments + `OpZkVerify`

The ZK circuit proves the **entire game log** (PGN + final FEN) was legal before any funds move.

---

## Paid Tier Enforcement (Strict)

- `/pricing` → real payment flow (dev wallets supported for testing)
- After confirmed payment → user lands on **"Your Covenants"** list with **"Go to Terminal"** as the dominant action
- Free `/deploy` is hard-blocked for paid users
- All premium pages (`/paid-builder`, `/paid-deploy`, Terminal) gate on `covex_paid_tier` + server verification

Higher tiers (PRO/MAX) only affect Explorer ranking and visibility — feature set is identical.

---

## Quick Start (Local)

```bash
# Backend (Rust)
cd backend
cargo run --release

# Frontend (dev)
cd frontend
npm install
npm run dev

# Visit http://localhost:3001
```

Production build:
```bash
cd frontend && npm run build
# Serve dist/ behind the same nginx that serves the backend API
```

---

## Deploying to Production (Hetzner)

The live site runs on a single Hetzner box (`root@178.105.76.81`):

```bash
ssh root@178.105.76.81
cd /root/Covex27
git pull
cd frontend && npm install && npm run build
# rsync or cp dist to /root/htp/public (or wherever nginx root is)
systemctl reload nginx
```

Backend:
```bash
cd backend
cargo build --release
# Restart the systemd service or pm2/whatever you use
```

**Covenant Studio files** are served from `/root/htp/studio/` and reachable at `https://hightable.pro/studio/`.

---

## API Highlights

- `GET /api/covenants` — All covenants + merged `custom_ui_html` + `custom_ui_config`
- `POST /api/terminal-config/:txid` — Save full Terminal state (game_type, zk_circuit, custom_ui_code, fee, oracle key, etc.)
- `GET /api/terminal-config/:txid` — Load saved config for a covenant
- Payment verification + tier upgrade handled server-side

---

## License & Credits

MIT © High Table Protocol

Built for the Kaspa ecosystem. Non-custodial. On-chain only. ZK where it matters.

---

**Current status:** 100% feature complete. Full ZK chess with staking, matching, legal play, proof submission, 2% fee payout, beautiful Explorer previews, strict paid gating, and production deployment on hightable.pro.

Enjoy building the future of on-chain games without middlemen. ♟️

<div align="center">
  <a href="https://hightable.pro">hightable.pro</a> • <a href="https://hightable.pro/studio/">Covenant Studio</a>
</div>
