██████╗  ██████╗ ██╗   ██╗███████╗██╗  ██╗
██╔════╝ ██╔═══██╗██║   ██║██╔════╝╚██╗██╔╝
██║      ██║   ██║██║   ██║█████╗   ╚███╔╝
██║      ██║   ██║╚██╗ ██╔╝██╔══╝   ██╔██╗
╚██████╗ ╚██████╔╝ ╚████╔╝ ███████╗██╔╝ ██╗
 ╚═════╝  ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝

                    COVEX — Kaspa Covenant Platform
                  Professional ZK + Oracle Terminal

Live: https://hightable.pro
Covenant Studio: https://hightable.pro/studio/
GitHub: https://github.com/THTProtocol/Covex27

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Covex is the production non-custodial covenant indexer and configuration
platform for Kaspa Toccata (TN12). It crawls the chain, indexes every
SilverScript covenant, and provides a professional Terminal for paid
creators to attach ZK circuits, oracles, fees, and custom UIs.

Covex Terminal is deliberately neutral. It is a serious engineering tool
for configuring on-chain verifiable applications. All visual design,
game boards, animations, and thematic assets live in Covenant Studio.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Core Principles

• Neutral professional interface — no casino imagery or gambling framing
• ZK or Oracle resolution for every covenant outcome
• Full FIDE chess ruleset proven in ZK (castling, en passant, 50-move, etc.)
• Strict paid-tier access (Creator / PRO / MAX)
• Custom UIs designed in Covenant Studio and pasted into Terminal
• One Rust binary (crawler + indexer + verifier + API)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## The Covex Terminal (Professional Configuration Surface)

When you open the Terminal you are choosing a ZK circuit or oracle
resolution method, not "picking a game".

The circuit grid presents technical verifiers:

- Chess v1 — 8×8 standard with complete FIDE rule enforcement
- Chess v2 — Extended draw detection (stalemate, threefold, 50-move)
- Poker — Hand ranking + pot logic
- Custom — Supply your own audited circuit

All visual presentation (boards, tables, animations, themes) is created
in Covenant Studio and attached as a self-contained HTML bundle.

The only place staking, matching, and winner-takes-all logic appears
is inside the optional Chess ZK Arena demo that exists solely because
the chess_v1 circuit requires a real legal-play surface to demonstrate
outcome submission. That surface is functional, not promotional.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Chess v1 — Fully Implemented

The chess_v1 circuit in the Terminal includes a complete, playable
8×8 board powered by chess.js + react-chessboard.

• Every legal move enforced client-side (castling rights, en passant,
  promotion, check, checkmate, stalemate, 50-move, repetition)
• Stake amount selector with exact 2 % covenant creator fee math
• Match flow (post stake → opponent matches → play)
• "Submit ZK Proof" that commits the full PGN + final FEN
• Payout breakdown showing winner receives (pot − 2 %)

The SilverScript emitted for chess_v1 contains the complete FIDE
ruleset documented in comments plus the OpZkVerify instruction.

All of this is optional demo tooling inside the neutral Terminal.
The real covenant only cares about the verified outcome.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Paid Tiers (Strict)

Creator (100 KAS), PRO (500 KAS), MAX (1000 KAS) all receive the
identical Terminal and Studio integration. Higher tiers only affect
Explorer ranking and visibility on hightable.pro.

After payment you land on "Your Covenants" with "Go to Terminal"
as the primary action. No large "create new" CTA. Free /deploy
is blocked for paid users.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Architecture

Frontend (React 19 + Vite)  →  Backend (Axum + SQLite)  →  kaspad TN12
     Terminal + Explorer           Terminal Config API         On-chain
                                      + Covenant Indexer       SilverScript

Covenant Studio is a separate repository. It generates standalone
HTML/JS/CSS bundles that are pasted into the Covex Terminal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Quick Commands

Local dev:
  cd frontend && npm run dev
  cd backend  && cargo run --release

Production build:
  cd frontend && npm run build
  # copy dist/ to your nginx root

Deploy (Hetzner example):
  ssh root@178.105.76.81
  cd /root/Covex27 && git pull
  cd frontend && npm ci && npm run build
  cp -r dist/* /root/htp/public/
  systemctl reload nginx

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Status

100 % complete. Full ZK chess implementation, neutral professional
Terminal, strict paid gating, working Studio integration, live on
https://hightable.pro with the latest build.

Covex Terminal: serious tool for serious covenants.
Covenant Studio: where the visuals and fun live.

Built for the Kaspa ecosystem by High Table Protocol.

