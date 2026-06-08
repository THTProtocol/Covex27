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

  <img src="https://raw.githubusercontent.com/THTProtocol/Covex27/master/frontend/public/covex-logo-full.jpg" alt="Covex — Verifiable Interactive Covenants" width="256" />

  <h3>The Production Platform for Verifiable Interactive Covenants on the Kaspa BlockDAG</h3>

  <p><strong>Complete indexing • Intelligent classification • Rich interactive interfaces • Hybrid ZK + Oracle resolution • Full on-chain transparency</strong></p>

  <br>

  <a href="https://hightable.pro"><img src="https://img.shields.io/badge/LIVE-hightable.pro-49EACB?style=for-the-badge&logo=kaspa" alt="Live on Kaspa BlockDAG"></a>
  <a href="https://hightable.pro"><img src="https://img.shields.io/badge/Production-Kaspa_BlockDAG-49EACB?style=for-the-badge" alt="Production on Kaspa BlockDAG"></a>
  <a href="https://github.com/THTProtocol/Covex27/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-49EACB?style=for-the-badge" alt="MIT License"></a>
  <a href="https://github.com/THTProtocol/Covenant-Studio"><img src="https://img.shields.io/badge/Covenant_Studio-Visual_Editor-49EACB?style=for-the-badge" alt="Covenant Studio"></a>

  <br><br>

  <p><strong>Every SilverScript covenant (aa20–aa23) on the Kaspa BlockDAG is discovered, classified, enriched with metadata, given a rich interface, and equipped with a spectrum of verifiable resolution paths — from full Groth16 ZK to hybrid property proofs to multi-oracle attested outcomes. All covenant data and disclosures live on-chain. $KAS payments, $KAS stakes, $KAS resolutions.</strong></p>

</div>

---

## Architecture Overview — The Complete System

Covex is the production indexing, classification, interface synthesis, configuration, and resolution layer for interactive covenants on the Kaspa BlockDAG.

It runs as a cohesive, always-on production service:

- A high-performance Rust backend (Axum + Tokio) with multiple specialized long-running engines.
- A modern React frontend (Vite) delivering the Explorer, the Covex Terminal, pro full-screen arenas, and Covenant Studio integration.
- Continuous discovery against a production Kaspa node via wRPC (Borsh).
- SQLite as the live materialized view of the on-chain covenant universe.
- A pluggable Resolution Oracle that understands the full spectrum of proving modes.

```mermaid
flowchart TB
    subgraph Client["CLIENT LAYER — Production Interfaces"]
        E[Explorer — Tier-sorted discovery + full disclosure]
        T[Covex Terminal — Configuration, ZK selection, Pro Arenas]
        CS[Covenant Studio — Visual circuit & UI composer]
        A[Pro Arenas — Chess FIDE, Poker, Blackjack, more]
        V[Covenant Viewer — Free interactive + paid enhanced]
    end

    subgraph Gateway["GATEWAY"]
        N[nginx — static assets + /api reverse proxy]
    end

    subgraph Core["CORE SERVICES — Rust Production Backend"]
        direction TB
        DISC[Discovery Engine]
        subgraph Discovery["Three Specialized Indexers"]
            C[Chain Crawler — selected-parent historic walk]
            I[Live Seed Indexer — 10s UTXO poll on covenant seeds]
            P[Payment Guardian — 15s treasury monitor + 6 DAA confirmation]
        end
        CLS[Unified Covenant Classifier + Metadata Engine]
        ORC[Resolution Oracle — Pluggable Hybrid Proving Engine]
        CMP[SilverScript Compiler + UI Synthesizer]
        AUTH[Server-Verified Paywall + One-Pay-One-Deploy]
    end

    subgraph State["STATE LAYER"]
        DB[(SQLite — covenants, generated_uis, payments, accounts, auth_tokens, crawler_state)]
    end

    subgraph Kaspa["KASPA BLOCKDAG — Production"]
        K[wRPC to production node]
        S[SilverScript covenants in tx.payload aa20-aa23]
        U[UTXOs + DAA confirmations]
    end

    E -->|HTTPS| N
    T --> N
    CS --> N
    A --> N
    V --> N
    N -->|/api/*| Core

    DISC --> DB
    ORC --> DB
    CMP --> DB
    AUTH --> DB

    C --> K
    I --> K
    P --> K
    ORC --> K
    CMP --> S
```

The three indexers run in parallel for complete coverage. The Classifier is the single source of truth. The Oracle is deliberately pluggable so every circuit can declare its honest reality label.

---

## The Discovery Engine — Three Specialized Production Indexers

Covex never misses a covenant. Three complementary engines run continuously in the background.

### 1. Chain Crawler — Historic Completeness
Walks the selected-parent chain backward from the current virtual tip (up to 1M blocks of history).  
Scans every transaction’s `payload` for the SilverScript covenant opcodes (`aa20`, `aa21`, `aa22`, `aa23`).  
Extracts script, amount, creator, classifies immediately, records tier from treasury payment in Output[1] when present.  
Triggers basic UI generation on first sight.  
Persists `last_scanned_daa` so it resumes exactly where it left off across restarts.

### 2. Live Seed Indexer — Real-Time Birth Detection
Polls configured seed addresses every 10 seconds.  
Filters out ordinary wallet outputs using `is_standard_output` + `looks_like_covenant` heuristics.  
Any new covenant UTXO is classified, inserted, and immediately given a generated interface.  
Complements the crawler for covenants created after the current crawl tip.

### 3. Payment Guardian — Tier Verification & Visibility Upgrades
Polls the official covenant treasury address every 15 seconds.  
Matches incoming $KAS payments to the covenant creator address.  
Waits for 6 DAA confirmations on the Kaspa BlockDAG before acting.  
Upgrades `verified_tier` (BUILDER / PRO / MAX), sets visibility priority, enables full disclosure, and regenerates enhanced UIs.  
Also powers the server-side paywall (see below).

Together the three engines guarantee:

- Historic covenants are never lost.
- New covenants appear within seconds of on-chain confirmation.
- Tiered visibility and disclosure are always backed by confirmed $KAS treasury payments.

```mermaid
flowchart LR
    DAG[Kaspa BlockDAG] --> C[Chain Crawler]
    DAG --> I[Live Seed Indexer]
    DAG --> P[Payment Guardian]

    C --> CLS[Unified Classifier]
    I --> CLS
    P --> CLS

    CLS --> DB[(Live Covenant State)]
    P --> TIER[Tier + Disclosure Upgrade]
    TIER --> DB
```

---

## Covenant Intelligence — The Unified Classifier

Both the Crawler and the Live Indexer feed the exact same classification logic (`backend/src/covenant_types.rs`).

Two outputs are produced for every covenant:

- `CovenantCategory` (user-facing, shown in Explorer cards and filters)
- `covenant_type` (granular, used for Terminal suggestions, UI generation, and API)

### Category Decision Tree

```mermaid
flowchart TD
    S[script_hex] --> E{empty?}
    E -->|yes| GEN[General]
    E -->|no| LEN{length < 80 bytes?}
    LEN -->|yes| FLASH[Flash]
    LEN -->|no| AA21{contains aa21?}
    AA21 -->|yes + 51+52| GOV[Governance]
    AA21 -->|yes| ESC[Escrow & Custody]
    AA21 -->|no| AA22{contains aa22?}
    AA22 -->|yes| TRN[Tournament]
    AA22 -->|no| AA23{contains aa23?}
    AA23 -->|yes| CP[Community Pool]
    AA23 -->|no| AA20{contains aa20?}
    AA20 -->|no| GEN
    AA20 -->|yes| PRED{contains 52 or 53?}
    PRED -->|yes| PRD[Predictive Market]
    PRED -->|no| LONG{length > 120?}
    LONG -->|yes| STR[Structured Settlement]
    LONG -->|no| VSK{contains 51 + length > 90?}
    VSK -->|yes| VER[Verifiable Skill / ZK Game]
    VSK -->|no| MCL{length < 140 + 51?}
    MCL -->|yes| MBR[Membership & Claim]
    MCL -->|no| SK{contains 51?}
    SK -->|yes| SKL[Skill Contest]
    SK -->|no| VER
```

### Production Category Table

| Category              | Detection Rule                          | Primary Use Cases                              | Typical Resolution Style      |
|-----------------------|-----------------------------------------|------------------------------------------------|-------------------------------|
| Verifiable Skill      | aa20 + 51 + >90 bytes                   | Chess, poker, skill games with proofs          | Hybrid / Full ZK + Oracle     |
| Skill                 | aa20 + 51                               | Classic one-winner contests                    | Oracle-attested               |
| Predictive            | aa20 + 52/53                            | Binary/ternary outcome markets                 | Oracle-attested / Hybrid      |
| Membership & Claim    | aa20 + specific length + 51             | Merkle proofs, range proofs, eligibility       | Full ZK / Hybrid              |
| Structured            | aa20 + >120 bytes                       | Complex timelock / conditional settlements     | Hybrid + Timelock circuits    |
| Escrow                | aa21 (no multi-outcome markers)         | 2-party or multi-party time-locked custody     | Timelock + Oracle             |
| Governance            | aa21 + 51 + 52                          | DAO-style multi-outcome voting                 | Multi-oracle / Governance ZK  |
| Tournament            | aa22                                    | Threshold multi-sig tournaments                | Multi-sig + Oracle            |
| Community Pool        | aa23                                    | Lotteries, shared funds, prize pools           | VRF + Oracle                  |
| Flash                 | Any aa2x + <80 bytes                    | Simple one-shot logic                          | Direct / Oracle               |
| General               | Fallback                                | Unclassified or novel patterns                 | Attested                      |

BUILDER+ users can supply a free-form `custom_category` in the Terminal that overrides the auto-detected label everywhere while the underlying classification remains for internal routing.

---

## Transparency by Design — Every Covenant Carries Its Truth

Every indexed covenant (free or paid) stores and surfaces:

- `disclosed_wallets`: creator address, covenant treasury address, oracle public keys — always visible for top-tier covenants.
- `reality`: explicit label (`full-zk` | `hybrid` | `oracle-attested` | `risc0-stub`) for the chosen circuit.
- `has_artifacts`: whether real circom/RISC0 artifacts exist for this circuit.
- `custom_circuit_def`, `theme`, `name`, `description` (set at creation or via Terminal/Studio).
- `verified_tier` and visibility priority derived strictly from confirmed $KAS treasury payments.

Paid covenants receive “PAID VERIFIED • TOP VISIBILITY” placement and a complete disclosure section. Free covenants remain fully interactive (claim, timeout resolve, state viewer, basic visuals) but sit lower in sort order with limited disclosure.

No misleading claims. Reality labels are honest and machine-readable.

---

## The Verified Paywall — One-Pay-One-Deploy with $KAS

Free basic covenant deployment is always available.

BUILDER (100 $KAS), PRO (500 $KAS), MAX (1000 $KAS) payments are sent to the official covenant treasury on the Kaspa BlockDAG.

The Payment Guardian detects these payments, waits for 6 DAA confirmations, and records the tier against the creator address.

When a user with a verified payment calls `POST /api/auth-session`:

- The server checks the on-chain record for that exact address.
- A short-lived, single-use auth token is issued (never stored in localStorage).
- The token is consumed on first deploy via `/api/auth-session/consume`.
- Deployment capacity is tracked server-side (`accounts.deployments_used`).

This is cryptographically enforced at the point of deploy. Only addresses that have actually paid on-chain can obtain the elevated capabilities (Terminal access, custom UI, pro arenas, higher visibility).

---

## The Resolution Oracle — Pluggable Hybrid Proving Engine

The single most advanced component of the platform.

`POST /api/oracle/verify-and-sign`

Accepts a circuit identifier + proof object (or requested outcome) and returns a signed outcome usable directly as a witness in a Kaspa spend transaction that unlocks the covenant.

### The Hybrid Model — Three Honest Paths

| Reality Label      | What the Prover Must Supply                          | What the Oracle Does                                      | When Used                                      | Example Circuits                     |
|--------------------|------------------------------------------------------|-----------------------------------------------------------|------------------------------------------------|--------------------------------------|
| full-zk            | Complete Groth16 proof (pi_a, pi_b, pi_c + public signals) | Strict snarkjs verification of the proof                  | Small, auditable statements with real artifacts | merkle_membership, range_proof, relative_timelock, hash_preimage |
| hybrid             | ZK proof of a critical property + requested outcome  | Verify the property proof (if present) then attest the remaining outcome | Games with on-chain rules + complex state     | chess_v1 (dual mode), basic_utxo_ownership, script_constraint, vrf_dice_roll, pot_split_math, turn_timer, collateral_liquidation |
| oracle-attested    | requested_outcome only (or light attestation data)   | Sign the attested outcome (multi-oracle threshold supported) | External data, heavy compute, long-tail logic | price feeds, election results, complex game adjudication, black_scholes_approx (stub) |
| risc0-stub         | RISC0 receipt / guest output (when available)        | Accept or verify receipt (stub path today)                | General-purpose verifiable compute            | risc0_chess_eval, risc0_defi_liquidation, risc0_connect4_eval |

The oracle is deliberately pluggable (`backend/src/oracle_verifier.rs`):

```rust
// Simplified view of the registry
StrictGroth16 { script, prefix }   // always run snarkjs
HybridGroth16 { script, prefix }   // Groth16 if proof body present, else attested
Risc0Stub   { guest }
Attested                           // pure oracle signature
```

Adding a new circuit is a one-line registry insert + (optional) verify script + frontend label.

### Signing Construction (verifiable by anyone)

```text
message = "covex-oracle:<covenant_id>:<outcome>:<timestamp>"
signature = SHA256(oracle_private_key || message)
```

The signed outcome + message + timestamp are returned to the UI. The covenant unlock transaction includes this data as witness data. The on-chain SilverScript can verify the oracle public key and the message binding.

Multi-oracle federation (threshold + weighted signatures) is supported in the input schema and liveness endpoints for future decentralized oracle networks.

### Chess Dual Proving Modes (Production Example of Hybrid Strength)

- Mode 0 (Hybrid — recommended for UX): Fast path. Witness supplies a small set of candidate moves and attack data. Circuit checks the claimed terminal condition against the witnessed set.
- Mode 1 (Full ZK — maximum security): Stricter. For “no legal moves” claims the prover must supply a non-empty exhaustive candidate list and the circuit proves the search was complete.

The proving mode is committed inside the public signals so the oracle and any on-chain verifier see exactly which security level was used.

---

## Production ZK Circuit Inventory — Simple Names, Honest Labels

Covex maintains a living registry (`zk/circuit_registry.json`) of 200+ circuits plus a frontend catalog of 207+ entries. Reality and artifact status are explicit.

### Core Full-ZK (real Groth16 artifacts + strict verification today)

- merkle_membership — prove key/value membership in a committed tree
- range_proof — prove a committed value lies inside [min, max] without revealing it
- relative_timelock — prove a DAA-relative timelock on the selected-parent chain
- hash_preimage — classic preimage knowledge

### Kaspa-Native Primitives (Phase 1 — mostly hybrid, real artifacts)

- basic_utxo_ownership — Schnorr + commitment proof that a wallet controls a specific UTXO
- script_constraint — prove that a SilverScript fragment (exact aa* opcode pattern + timelock) exists
- vrf_dice_roll / vrf_random — verifiable randomness for games and lotteries
- nullifier_set — double-spend prevention + privacy set membership
- pot_split_math — prove correct fee / pot_return / winner split math
- turn_timer — per-turn DAA timer enforcement for state machines
- onchain_sig_verify — prove possession of a valid prior oracle signature (on-chain evolution prep)

### Games & Interactive (mostly hybrid — chess is the flagship)

- chess_v1 (dual modes — Hybrid fast + Full ZK exhaustive)
- poker_equity, poker_vrf_deal, verifiable_poker_solver
- tictactoe_v1, connect4_v1, FullScreenReversi, RPS, etc.
- turn_timer + pot_split_math combination for timed pot games

### DeFi & Structured (hybrid + oracle-attested)

- collateral_liquidation, collateral_ltv
- black_scholes_approx, financial_formula, loan_health
- auction_clearing

### Privacy & Gating

- private_transfer_nullifier, anon_credential, multi_sig_gating, privacy_mixer_v1

### Compute & Advanced Oracles (RISC0 stubs + attested feeds)

- risc0_chess_eval, risc0_chess_endgame, risc0_defi_liquidation, risc0_connect4_eval
- price_btc, weather_feed, election_feed, decentralized_liveness, multi_oracle_v2

All circuits declare `category`, `reality`, `artifacts`, and `use_cases`. The Terminal surfaces only appropriate circuits for the chosen covenant type. The Explorer can surface reality badges.

---

## End-to-End Covenant Lifecycle — A to Z

1. **Design** — Creator opens Covenant Studio or the Covex Terminal. Composes circuit requirements, chooses resolution mode (full-zk / hybrid / oracle-attested), sets fee percent, pot return percent, theme, name, description. For paid users: full disclosure editor.

2. **Compile** — Terminal emits Covex DSL → SilverScript source → silverc compiles to Kaspa Script bytecode (embedded in tx.payload as aa20–aa23).

3. **Fund & Deploy (optional tier payment)** — For elevated tiers the creator first sends the exact $KAS amount to the treasury from the same wallet. Then signs and broadcasts the covenant creation transaction using a supported production wallet (KasWare, Kastle, Kasperia, OKX, KaspaCom, Kasanova, Kaspium, Tangem).

4. **Discovery (seconds)** — Chain Crawler or Live Seed Indexer detects the new covenant, runs the Classifier, writes the record, generates a basic interactive viewer.

5. **Payment Confirmation (6 DAA)** — If a tier payment was made, Payment Guardian detects it, confirms 6 DAA on the BlockDAG, upgrades the covenant record, issues higher visibility, and enables full Terminal features for that creator.

6. **Configuration** — Paid creator opens the Covex Terminal for that covenant (cryptographic ownership challenge via Schnorr or address match). Chooses ZK circuit, resolution mode, custom UI (pasted from Studio), game type, etc. Saved server-side with ownership proof.

7. **Interaction** — Participants connect production wallets, view the rich interface (or pro arena after stake match), read the full disclosed wallets + reality label.

8. **Staking** — For two-sided games both parties send equal $KAS stakes into the covenant address. Once matched, the full-screen professional arena unlocks (chess.com-smooth board, real decrementing clocks, full FIDE rules via chess.js, move list, resign/draw).

9. **Play & Proof Generation** — Game proceeds. For ZK-enabled circuits the client (or studio sandbox) generates the appropriate Groth16 proof or hybrid witness. For attested paths only the final outcome is prepared.

10. **Resolution Submission** — “Submit Result to Oracle” posts to `/api/oracle/verify-and-sign` with `circuit_type`, proof (when present), public inputs, `requested_outcome`, and `proving_mode` (for chess). The pluggable verifier runs the correct path (snarkjs strict, hybrid check, or direct attestation). On success the oracle returns the signed outcome tuple.

11. **On-Chain Unlock** — The winner (or either party on draw) constructs a spend transaction that consumes the covenant UTXO, supplying the oracle signature + message + timestamp as witness data. The SilverScript covenant script verifies the oracle key binding and the outcome, then releases funds according to the pot math (winner share + platform fee to treasury + pot return to covenant for reuse).

12. **Post-Resolution** — Covenant state updates, Explorer reflects resolution, analytics and reputation signals are available. Reusable covenants can accept new stakes.

```mermaid
sequenceDiagram
    participant Creator
    participant Wallet as Production Wallet
    participant DAG as Kaspa BlockDAG
    participant Disc as Discovery Engine (3 indexers)
    participant Oracle as Resolution Oracle
    participant Player as Counterparty

    Creator->>Wallet: Create covenant tx (SilverScript + optional tier $KAS to treasury)
    Wallet->>DAG: Broadcast
    DAG-->>Disc: New aa2x payload detected
    Disc->>Disc: Classify + persist + basic UI
    alt Tier payment present
        Disc->>Disc: Payment Guardian (6 DAA) upgrades tier & disclosure
    end
    Creator->>Terminal: Configure circuit, mode, UI, fees (ownership verified)
    Player->>Wallet: Stake $KAS into covenant
    Creator->>Wallet: Stake $KAS into covenant (match)
    Note over Creator,Player: Pro arena unlocks
    Creator->>Creator: Play / generate ZK witness or attested result
    Creator->>Oracle: POST /oracle/verify-and-sign (circuit + proof + outcome)
    Oracle->>Oracle: Pluggable verify (Strict / Hybrid / Attested)
    Oracle-->>Creator: Signed outcome + message + timestamp
    Creator->>Wallet: Spend covenant UTXO with oracle signature as witness
    Wallet->>DAG: Broadcast unlock
    DAG-->>Wallet: Winner receives share, fee to treasury, pot return
```

---

## Covex Terminal & Pro Game Experiences

The Terminal is the command center for every paid covenant.

Capabilities:
- Live covenant state + pot viewer
- Resolution mode selector (full-zk / hybrid / oracle-attested) with honest circuit suggestions
- ZK circuit picker (filtered by category + reality)
- Fee % and pot_return % configuration (enforced by pot_split_math proofs when selected)
- Custom UI code paste area (generated by Covenant Studio)
- Pro full-screen arena launcher (stake matching required)
- Ownership-protected save (Schnorr challenge or address match)

Flagship arena: **Chess**
- 680 px smooth board (react-chessboard)
- Complete FIDE ruleset (chess.js): castling, en passant, 50-move, threefold, insufficient material, etc.
- Dual synchronized 10-minute clocks (100 ms ticks)
- Full PGN move list with navigation
- Resign and draw offer flows
- Direct “Submit to Oracle” that carries PGN + FEN + proving_mode into the hybrid/full-zk chess_v1 path

Additional arenas (FullScreenPoker, FullScreenBlackjack, Connect4, Reversi, RPS, TicTacToe) follow the same stake-match → arena → oracle-submit pattern.

---

## Covenant Studio — Visual Editor for the Next Generation

https://github.com/THTProtocol/Covenant-Studio

Professional visual composer that outputs:
- Ready-to-paste custom UI HTML/JS for the Terminal
- Structured circuit + parameter definitions with reality labels
- Full disclosure metadata
- Theme and branding tokens

Paid users paste the output directly into the Covex Terminal. The system treats Studio-generated UIs as first-class custom interfaces.

---

## Data Model — What Gets Stored

Core tables (SQLite, WAL mode for concurrent readers):

- `covenants` — the source of truth for the Explorer (tx_id PK, script, amounts, creator, verified_tier, disclosed metadata, reality, category, timestamps, network-scoped)
- `generated_uis` — Terminal and auto-generated UI HTML + full config JSON (fee, circuit, resolution_mode, custom code, owner)
- `payments` — every detected treasury payment with confirmations and matched covenant
- `accounts` — per-address tier state and deployment credit consumption
- `auth_tokens` — short-lived, single-use tokens for the paywall
- `crawler_state` — per-network last scanned DAA for exact resume

All reads are network-scoped. The backend can run multiple network indexers in one process when additional wRPC endpoints are configured.

---

## Key Production APIs

- `GET /covenants?network=...&creator=...` — tier-sorted list with custom UI and config joined
- `GET /status`, `/tiers`, `/analytics`
- `POST /auth-session` + `POST /auth-session/consume` — server-verified paywall
- `GET/POST /terminal-config/:covenant_id` — ownership-protected configuration
- `POST /oracle/verify-and-sign` — the heart of resolution (pluggable)
- `POST /sign-and-broadcast` — covenant creation and general transaction submission
- `POST /covenant/:id/compute-payout` — client-side payout preview + unlock witness builder (verifies oracle signature locally)
- Marketplace template endpoints for published Studio configurations

---

## Production Characteristics

- All background engines are fire-and-forget Tokio tasks that survive transient wRPC disconnects with exponential backoff.
- Tier upgrades and disclosure are driven exclusively by confirmed on-chain $KAS flows (6 DAA).
- Configuration changes require cryptographic ownership (Schnorr over a fresh nonce or exact address match).
- Oracle signatures are publicly verifiable with only the published oracle public key.
- Reality labels and disclosed wallets are part of the covenant record and shown to every visitor on paid covenants.
- The compiler pipeline (DSL → SilverScript → bytecode) is available both in the Terminal and via the backend `/sign-and-broadcast` path.
- Multi-wallet support is production-only: extension wallets (KasWare and peers) are the primary path; dev hex paths are blocked in signer/UI for the live environment.

---

## Using the Platform — From Zero to Resolved Covenant

1. Visit https://hightable.pro
2. Browse the Explorer — every covenant is already interactive.
3. (Optional) Send 100/500/1000 $KAS to the treasury from your production wallet to unlock BUILDER/PRO/MAX.
4. Connect your wallet → enter the Terminal for a paid covenant or create a new one.
5. Configure resolution, pick a circuit with the desired reality level, paste Studio UI if desired, save (ownership proven).
6. Share the covenant link. Counterparties connect, stake, play or claim.
7. Submit the outcome (or proof) to the Oracle.
8. Use the returned signature in the unlock transaction — funds move according to the configured pot math.

Everything is observable on the Kaspa BlockDAG block explorer and inside the Covex Explorer.

---

## Technology Foundations

- **Kaspa** — BlockDAG, wRPC Borsh, SilverScript (aa20–aa23 payload covenants), DAA scoring, native Schnorr.
- **Backend** — Rust, Tokio, Axum 0.7, rusqlite (WAL), kaspa-wrpc-client + consensus-core 0.15, snarkjs via Node child process for Groth16.
- **Frontend** — Vite + React 19, Tailwind v4, shadcn primitives, chess.js + react-chessboard, @react-three/fiber for 3D, multi-provider wallet connector.
- **ZK** — circom + snarkjs (Groth16), dev PTAU (pot10_final) for new circuits, RISC0 guest stubs, pluggable verifier dispatch.
- **Oracle** — SHA256-based signatures today, multi-oracle threshold schema ready, liveness endpoints.
- **Compiler** — Covex DSL → SilverScript source → silverc bytecode.

---

## Current State — Radical Honesty

- 200+ circuits inventoried with explicit reality labels.
- ~10–15+ circuits have real compiled artifacts (r1cs + wasm + vkey) and wired verify paths (core full-zk + Kaspa Phase 1 primitives + chess dual-mode + a few DeFi).
- The vast majority of the inventory starts as honest hybrid or oracle-attested and can graduate as ceremonies complete and more artifacts are produced.
- Pluggable oracle covers every registered circuit out of the box.
- Chess dual proving modes are fully end-to-end (Hybrid for speed, Full ZK for maximum guarantees).
- On-chain SilverScript examples exist for oracle-signed outcomes and hybrid circuits.
- All metadata (disclosed wallets, reality, artifacts flag) is persisted and surfaced.
- Production paywall, three indexers, Terminal, pro arenas, and payout math are live and in daily use.

“100% of the vision” means exhaustive coverage of the architecture and inventory with a working pluggable foundation — not that every single circuit already has a production MPC ceremony zkey today.

---

## Resources

- **Live Platform**: [hightable.pro](https://hightable.pro)
- **Covenant Studio**: [github.com/THTProtocol/Covenant-Studio](https://github.com/THTProtocol/Covenant-Studio)
- **Full ZK + Oracle Vision & Inventory**: `docs/ZK_ORACLE_FULL_STACK_VISION_AND_ROADMAP.md`
- **On-Chain Evolution Path**: `docs/ONCHAIN_EVOLUTION_PATH.md`
- **Circuit Registry**: `zk/circuit_registry.json`
- **Examples** (chess modes, collateral, VRF, pot split, nullifiers, on-chain sig, etc.): `examples/`

---

**Covex** — Verifiable covenants. Honest resolution. Production on the Kaspa BlockDAG.

Built by HIGH TABLE PROTOCOL.

All covenant data lives on-chain. All resolution paths are explicit. Everything is designed to be understood from A to Z.

---

*This document describes the complete, operating production architecture. The three indexers, the pluggable hybrid oracle, the classifier, the paywall, the Terminal, and the full circuit registry are all active in the live system.*
