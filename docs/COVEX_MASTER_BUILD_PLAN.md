# COVEX MASTER BUILD PLAN
**Version 1.0 · 2026-06-12 · supersedes §8 of COVEX_AUDIT_AND_IMPROVEMENT_PLAN_2026-06-12.md as the canonical roadmap**

---

## North Star

> **Covex is the place where Kaspa covenants live.** Every covenant on the BlockDAG is discoverable, inspectable, and interactive for free. Creators pay for the tools to make their covenant beautiful, verifiable, and visible — never for trust, which is free and mandatory.

Three product pillars, in priority order:

1. **The Explorer** — canonical, fast, complete. Every covenant, every lifecycle event, every address. Free forever. This is the moat: whoever indexes covenants best at Toccata mainnet launch becomes the default.
2. **The Interaction Layer** — any visitor can connect a wallet and execute any covenant (stake, join, claim, resolve) from a transparent, auto-generated interface. Games are the flagship demo of this.
3. **The Studio (paid)** — tiered tools to design covenant pages, compose ZK circuits and oracles, and buy visibility. Higher tier = better tools + better placement, with promotion always labeled.

**Non-negotiable principles** (from HERMES + this plan):
- Nothing fake. No success screens without on-chain truth. No mock data. Stubs are labeled or invisible.
- Mainnet = wallet extensions only (KasWare, Kastle, Kasperia, OKX). Mnemonics/dev keys exist only on testnets, never rendered on MAIN.
- Transparency is not a feature, it's the default: fees, payout structure, resolution method, oracle identity — always visible, never hideable, on every covenant page.
- The platform never custodies funds. Reads UTXOs, verifies payments on-chain, signs nothing with user value.

**Timing context:** Toccata (KIP-16/17/20/21) activates on mainnet June 5–20, 2026 — now. SilverScript is TN12-only and experimental. Plan assumes: TN12 stays the lab, mainnet becomes the product the moment covenant txs appear there.

---

## Phase 0 — STABILIZE (Week 1) · "Nothing fake, nothing slow, nothing silent"

Goal: the existing product, debugged. Every item here is a known, verified defect. No new features.

### 0.1 Kill the fake success (P0, trust)
- `Deploy.jsx` wizard step 3: "Create Covenant" must be **disabled until a wallet is connected** (real extension on MAIN; extension or dev wallet on testnets). On click without prerequisites → explicit error state, never a success screen.
- Success screen renders **only after** broadcast returns a txid; show the txid, link it, and poll the indexer until the covenant appears ("Broadcast ✓ → Indexed ✓").
- Sweep all FullScreen game components for remaining demo/fake-oracle-signature fallback code paths; delete them.

### 0.2 Kill the 15–37 MB API (P0, performance)
- Backend `covenants` handler: real `LIMIT/OFFSET/ORDER BY` in SQL; hard cap `limit ≤ 200`; strip `custom_ui_html`/`script_hex` from list responses in Rust; add `?fields=` selector.
- New `GET /api/covenants/:id` (already exists for search — make it the only thing detail pages call).
- Frontend: `Explorer.jsx` → paginated/infinite scroll (first page 24 cards); `CovenantInteractive.jsx`, `CovenantFix.jsx`, `Dashboard.jsx`, `PaidBuilder.jsx` → single-covenant/creator-scoped fetches only.
- Decommission `api_filter.py` (covex-api-filter.service) once Rust does the stripping — one less moving part.
- Target: covenant detail page interactive in **< 1.5 s** on cold load.

### 0.3 Kill the 16.8 MB bundle (P0, performance)
- Route-level `React.lazy()` + Vite `manualChunks`: three.js, snarkjs, chess/game engines, each arena, kaspa-wasm → separate async chunks. The dev-wallet's ~11 MB WASM must never load unless the modal opens (verify it doesn't today).
- Enable Brotli in nginx; `Cache-Control: immutable` on hashed assets.
- Target: initial JS **< 500 KB gzipped**, LCP < 2 s.

### 0.4 Wire the dead endpoints (P0, broken buttons)
- Mount `POST /api/compile` → `compiler::compile_dsl()` (used by the wizard/advanced editor for preview-compile).
- Fix `UiBuilder.jsx` → use `/api/terminal-config/:id` + `/api/terminal-config-challenge/:id` (or add the `/trust-config`/`/ui-config` aliases server-side).

### 0.5 No silent buttons (P1, UX)
- Global toast/error system (one component, used everywhere).
- "OPEN WALLET TO EXECUTE": no wallet → "No Kaspa wallet detected — install KasWare/Kastle" with links; amount ≤ 0 → inline validation; insufficient balance → say so.
- "Send 100 KAS Now": same treatment.
- Every wallet call wrapped: rejection, timeout, wrong-network → human-readable message.

### 0.6 Explorer data correctness (P1)
- Category filter: reconcile the 33 filter chips with actual `category` values in DB (Chess filter currently returns silent empty grid). Every filter result set gets a proper empty state ("No covenants in this category yet").
- Deduplicate covenant rows (same tx_id listed twice with different names): `UNIQUE(tx_id, network)` constraint + UPSERT in crawler/indexer; one-time cleanup migration.
- Keyword search: SQLite FTS5 over name + description + category (search currently only accepts address/txid).

### 0.7 UI consistency pass (P2)
- One global navbar (network switcher + all links on every page, including /kaspa).
- Fix z-index: wizard step indicator behind navbar; /templates titles bleeding through header.
- Light mode: CONNECT WALLET button and wallet-picker drawer contrast (currently dark-on-dark).
- Footer: show the *selected* network + its covenant count; report the **built** commit (burn `GIT_COMMIT` into the binary/bundle at build time) instead of reading the server repo's HEAD at runtime.
- Uniform card heights (grid-auto-rows + line-clamp); fix "View covenant --" broken glyph; templates "Preview" button → actually open the preview modal.
- `/advanced` redirect → land on /pricing **with a banner** explaining why.

### 0.8 Server & security hardening (P1, ops)
- `/healthz` → proxy to backend (currently returns the SPA shell, so monitoring lies).
- CORS: restrict to `hightable.pro` origins.
- Per-IP token-bucket rate limiting on `/api/oracle/*`, `/api/sign-and-broadcast`, `/api/compile`, `/api/auth-session`.
- Mainnet boot check: refuse to start mainnet indexer/oracle unless `COVEX_ORACLE_KEY` env is set (no hardcoded default on MAIN).
- Server hygiene: rotate root password (exposed), `PasswordAuthentication no`, create non-root `deploy` user, **expand disk** (79% full; mainnet kaspad needs 400 GB+ — order a bigger Hetzner volume now).
- Replace password-based deploy script with key-based SSH (done) and then a GitHub Actions workflow: push to master → build → rsync → restart → smoke-test `/api/status`.

**Phase 0 acceptance:** no fetch > 1 MB anywhere in normal browsing; every button produces visible feedback; deploy wizard cannot reach success without a broadcast txid; lighthouse perf > 85; monitoring actually monitors.

---

## Phase 1 — EXPLORER 2.0 (Weeks 2–5) · "The canonical covenant explorer at the moment covenants reach mainnet"

Goal: when Toccata covenants appear on mainnet, Covex is the best place to see them — better than tn10-covenants.kaspa.com. Model the API on their OpenAPI spec (captured in audit/openapi.json) and beat them on UX.

### 1.1 Covenant identity & lineage (the heart of an explorer)
- Adopt **KIP-20 canonical covenant IDs** as primary identity (keep tx_id as alias).
- Index the full lifecycle: deploy → spend → continuation → resolution. New tables: `covenant_actions(covenant_id, action_type, tx_id, daa_score, amount_delta, timestamp)`.
- Detail page gets a **lifecycle timeline** (Deployed → Funded → Active → Resolved → Settled) + action history list + active UTXOs.
- New endpoints (KaspaCom parity): `GET /covenants/by-id/:id`, `/covenants/:id/actions`, `/covenants/:id/utxos`, `GET /tx/:txid`, `GET /tx/:txid/settlement-status`.

### 1.2 Activity & address views
- `GET /api/events` — global recent-actions feed → **live ticker** on the homepage ("2.5 KAS staked on Chess #4421 · 12s ago").
- Address portfolio pages: `/address/:addr` — covenants created, participated in, events, balances. Public.
- Per-network stats in `/api/analytics` (per-network counts, TVL honesty: label testnet TVL as testnet).

### 1.3 Developer surface (steal KaspaCom's best idea)
- Generate **OpenAPI spec + Swagger UI** for the whole API (utoipa crate fits Axum).
- **"API" tab on every explorer view** showing the exact curl that reproduces it ("point your app at the same indexer this explorer uses").
- Publish the existing `CovexClient.ts` as an npm SDK (`@covex/sdk`) with typed endpoints.
- `BUILDING_ON_COVEX.md` → docs page on the site.

### 1.4 Mainnet activation track (time-critical, runs in parallel)
- Stand up mainnet kaspad (Toccata build) on expanded disk; wire `KASPA_WRPC_URL_MAINNET`; flip `networks_configured.mainnet=true` behind env.
- Wallet-extension-only on MAIN (enforced — verify kasflow connector paths for KasWare/Kastle/Kasperia/OKX all sign covenant payloads correctly post-Toccata).
- Verify vendored sighash fix matches final mainnet consensus; track rusty-kaspa release and un-vendor when upstream lands.
- Mainnet treasury key from env/vault only; payment guardian tested with 1-KAS real payment before enabling tiers.
- **Launch-day checklist** doc + a dry run on TN10's restart.
- SilverScript version pinning + a compatibility test suite (compile all templates against each new compiler release — it's officially unstable).

### 1.5 Marketplace completion (carry-over from team's P0)
- TemplateLibrary fetches `/api/marketplace/templates`; "Community Published" section renders published custom UIs; publish flow round-trips end-to-end.

**Phase 1 acceptance:** a mainnet covenant deployed via wallet appears in explorer < 30 s with full lineage; every view has an API tab; events ticker live; Swagger published; mainnet tiers payable with real KAS.

---

## Phase 2 — COVENANT PAGE STUDIO (Weeks 5–11) · "The paid product: design an entire page for your covenant"

Goal: replace the bespoke layers canvas + raw-HTML iframes with a safe, beautiful, component-based page designer. This is the core paid offering.

### 2.1 Foundation (week 5–6)
- Integrate **Puck (MIT)** as the Studio shell; pages stored as Puck JSON in `generated_uis` (new column, versioned).
- Read-only rendering on covenant pages via `<Render>`: **no user HTML ever touches the DOM**. Existing raw-HTML pages: grandfather behind sandboxed iframe + strict CSP, banner "legacy page", auto-expire at mainnet launch.
- One-time converter: existing layers JSON → Puck JSON (text/image/button/shape layers map 1:1 to catalog components).

### 2.2 The widget catalog (week 6–8) — platform-authored, users configure props only
| Widget | Function |
|--------|----------|
| `ConnectWallet` | kasflow connect, network-aware |
| `StakeButton` / `ExecuteCovenant` | the money path: amount input, **fee breakdown preview**, simulation, wallet sign, txid + settlement polling |
| `PotStats` | live pot, participants, TVL from indexer |
| `CovenantTimeline` | the lifecycle component from Phase 1 |
| `OracleStatus` | resolution mode badge (ZK-verified / Oracle-attested), oracle pubkey, liveness |
| `CountdownTimer` | DAA-score-based deadlines |
| `ArenaJoin` | game-specific join/stake flow |
| `RichText` | **BlockNote** block (Notion-style) for "describe what it does" |
| `ImageBlock`, `HeroSection`, `StatRow`, `FAQ` | layout/branding primitives |
- Param forms inside `ExecuteCovenant` auto-generated from covenant schema via **react-jsonschema-form**.

### 2.3 The Transparency Panel (week 7) — the differentiator
- A **mandatory, non-removable root component** on every published page, auto-populated from on-chain + indexer data: covenant ID, script hash, network, payout structure (who gets what % under each outcome), platform/creator fee %, resolution method, oracle identity, current pot, link to raw script.
- Stylable (colors/position within limits), never hideable. Published pages fail validation without it.
- Server-side validation of submitted Puck JSON against the component allowlist + schema (reject unknown components, oversized payloads — cap 256 KB).

### 2.4 Studio UX (week 8–10)
- Template-first onboarding: pick template → fully designed page instantly → customize. Ship 10 polished page templates matching the covenant templates (Chess, Escrow, Milestone, Prediction, Treasury, …).
- Live preview = actual `<Render>` with real covenant data; viewport toggle (desktop/mobile); theme system (accent color, font pair, dark/light) as design tokens.
- Autosave drafts; publish → versioned; unpublish/rollback.

### 2.5 Unique pro features (week 9–11)
- **In-browser SilverScript debugger**: wrap `sil-debug` (kaspanet/silverscript) server-side; step through covenant execution with stack/variable inspection in the Advanced Composer. Nobody else has this.
- Compile-preview panel using the new `/api/compile` (DSL → bytecode → human-readable opcodes).
- ZK circuit composer (paid): pick from the real circuit registry, wire public inputs to covenant params, test-prove in browser (small circuits) or server-side.

### 2.6 Tier mapping
| Tier | Studio capability | Visibility |
|------|-------------------|------------|
| FREE | Auto-generated default page (always good-looking: template + transparency panel) | Standard listing |
| BUILDER 100 | Studio: 3 templates, core widgets, BlockNote, theme tokens | Standard + "Builder" badge |
| PRO 500 | Full catalog, all templates, ZK composer, debugger, custom theming | Featured carousel slot + higher rank |
| MAX 1000 | Everything + multiple pages per covenant, custom slug (`hightable.pro/c/<name>`), priority indexer refresh | Top placement + TVL-weighted boost |

**Phase 2 acceptance:** a paid user goes from blank to a published, branded, interactive covenant page in < 15 min without writing HTML; zero raw user HTML rendered anywhere; every published page shows the transparency panel; legacy pages migrated or sunset.

---

## Phase 3 — MONETIZATION & VISIBILITY ENGINE (Weeks 8–12, overlaps Phase 2)

### 3.1 Visibility, honestly
- Deterministic ranking: `score = tier_weight × recency × activity (real events) × TVL_factor` — documented publicly on /pricing.
- Featured carousel (PRO/MAX) labeled "Promoted". Tier badges on cards (current design language: flat / teal edge / gradient border / gold border).
- "Verified" remains an on-chain-payment fact, never purchasable separately from a tier.

### 3.2 Pay-per-call API (the second revenue line)
- Free tier: explorer browsing + low-rate API. Priced tier for bulk/builder routes (full covenant dumps, events firehose, websocket).
- Implement x402-style flow modeled on KaspaCom (`/payments/pricing`, `POST /payments/challenges`, direct payment proofs by txid, durable receipts). Reference: KASPACOM/x402-KAS (open source).
- API keys tied to paying address; usage metering; `/payments/receipts/:id`.

### 3.3 Treasury transparency page
- `/treasury`: live tier revenue, payment history (all on-chain anyway), fee flows, oracle fee policy. Eat the transparency dogfood — strongest possible marketing for a trust product.

### 3.4 Lifecycle policies
- Define and publish: do tiers expire? (Recommend: one-time per covenant, as currently modeled.) Inactive-covenant archival (is_active=false after N days at 0 balance + no events; "Show archived" toggle).

**Phase 3 acceptance:** ranking formula public; first paid API customer can self-serve end-to-end; treasury page live.

---

## Phase 4 — TRUST UPGRADE (Months 2–4, Toccata-gated) · "Resolved by proofs, not promises"

Goal: convert the centralized oracle from architecture into stopgap. KIP-16 makes proofs verifiable **on-chain** — Covex's stubs become real.

### 4.1 On-chain verification migration (KIP-16)
- Wave 1 (already have artifacts): merkle_membership, range_proof, relative_timelock, pot_split_math, nullifier_set, vrf_dice → covenant unlock verifies the **Groth16 proof on-chain via the verifier precompile**; oracle signature no longer in the trust path for these.
- Wave 2: game logic via **RISC0 STARK precompile** (no trusted setup — sidesteps the MPC ceremony problem and the 21-hour chess zkey entirely). Replace the 6 stub guests with real RISC0 guests; chess/connect4/poker evaluators as guest programs.
- UI: trust badges everywhere — `ZK-verified on-chain` (green) / `ZK-verified by oracle` (teal) / `Oracle-attested` (yellow) — with click-through explainers. Honesty as feature.

### 4.2 Decentralize what remains attested
- Multi-oracle threshold signing (2-of-3 to start) for attested outcomes; replace the always-healthy liveness stub with real operator heartbeats; publish operator identities.
- Adopt **QUEX TEE oracle feeds** (live on Kaspa ecosystem) as an external-data source for predictive markets.

### 4.3 Track and adopt
- `kaspanet/vprogs` for based provable computation (the long-term home of complex covenant logic).
- KIP-21 sequencing commitments for any future Covex-native zk app.
- Privacy mixer: either build the real nullifier circuit on KIP-16 or **remove it from the UI** until real (no half-private privacy).

**Phase 4 acceptance:** ≥ 6 circuit types resolve fully on-chain on mainnet; every covenant shows an accurate trust badge; no always-true liveness stub in production.

---

## Phase 5 — SCALE & ECOSYSTEM (Months 3–6)

### 5.1 Indexer scale
- Migrate SQLite → **PostgreSQL** (reference: supertypo/simply-kaspa-indexer); WAL SQLite is fine until mainnet volume says otherwise — set the trigger: > 100 K covenants or > 50 req/s sustained.
- WebSocket push (events, pot changes, game moves) replacing polling; Redis cache for hot lists.

### 5.2 KCC-20 & token layer
- Index KCC-20 covenants (the official SilverScript token standard — see the KCC20 book): token pages, holders, balances per address, vesting schedules, template registry (`/covenant-templates` with counts + active balances).
- Read-only markets data first (listings/trades if present on-chain); a DEX is **not** the roadmap — stay the explorer.

### 5.3 Games as a living showcase
- Persist game state (`skill_games` wired); matchmaking lobby with real "waiting" counts; spectator mode; tournament covenant template with brackets.
- Integrate **Kasia** (encrypted P2P messaging on Kaspa) for participant chat on covenant pages.

### 5.4 Experience polish
- Local DAG visualizer (kaspa-ng as reference) replacing external iframes — covenant txs highlighted in teal as they stream.
- PWA install flow (manifest exists); mobile-first pass over Studio and arenas.
- Security audit + public bug bounty **before** mainnet TVL grows (the oracle key, payment guardian, and Studio input paths are the audit scope).

---

## Phase 6 — LAUNCH & GROWTH (continuous from Phase 1 mainnet flip)

- **Launch moment:** Toccata covenants on mainnet + Covex Explorer 2.0 = announcement: "Every Kaspa covenant, live, interactive." Demo video: deploy → design page → opponent joins via wallet → ZK resolution on-chain.
- Docs portal + 10 runnable examples (`examples/` already strong — surface them); "Deploy your first covenant in 5 minutes" tutorial.
- Ecosystem motion: KEF grant application; cross-link with kas.fyi / explorer.kaspa.org; KaspaCom interop (their indexer API and Covex SDK speaking the same shapes helps everyone); presence in kasmedia/dev Discord at the Toccata moment.
- KPIs per phase: P0 — LCP < 2 s, 0 silent failures; P1 — time-to-index < 30 s, API tab usage; P2 — paid conversion %, time-to-published-page; P3 — MRR (tiers + API); P4 — % resolutions on-chain-verified; P5 — DAU, games played, uptime ≥ 99.9 %.
- Ops cadence: staging env on TN10, GitHub Actions deploy, weekly dependency/security review, monthly restore-from-backup drill (SQLite/Postgres + treasury config).

---

## Sequence at a glance

```
Week:        1    2    3    4    5    6    7    8    9   10   11   12   →  M4   M6
Phase 0  ████
Phase 1       ████████████        (mainnet flip when Toccata activates)
Phase 2                 ██████████████████████
Phase 3                           ██████████████
Phase 4                                     ████████████████████████████████
Phase 5                                                    ████████████████████████
Phase 6       ─────────────── continuous from mainnet flip ──────────────────────→
```

Dependencies: 0 → everything; 1.1 (lineage) → 2.2 (`CovenantTimeline` widget) and 5.2; 1.4 (mainnet) → 3.x revenue at scale and 6 launch; KIP-16 activation → 4.1.

## Top 5 risks & mitigations
1. **SilverScript breaking changes** (officially unstable, TN12-only) → pin versions, template compile CI, budget one migration sprint post-mainnet-finalization.
2. **Toccata slip/semantics change** → everything in Phase 1.4 is env-gated; TN12 remains fully functional product regardless.
3. **Oracle = single point of trust until Phase 4** → honest badges now, threshold signing early in Phase 4; treat the oracle key as the crown jewel (env/vault only, rotate).
4. **Disk/infra ceiling** (79 % full, mainnet node needs 400 GB+) → order volume now (Phase 0.8); Postgres trigger defined (5.1).
5. **Solo-operator bus factor** → CI/CD + runbooks (OPERATIONS_RUNBOOK.md exists — keep current), staging env, automated backups tested monthly.
