# COVEX — Full Audit & Improvement Plan
**Date:** 2026-06-12 · **Repo:** THTProtocol/Covex27 @ `c3d5c22` · **Live:** https://hightable.pro (deployed commit = repo HEAD, verified via `/api/status`)

---

## 1. Executive Summary

Covex is a **real, working product**: 10,101 genuine on-chain covenants indexed across TN12/TN10, real KAS tier payments verified at 6 DAA confirmations, a working oracle with ~30 real Groth16 circuits, 8 playable game arenas, and a Rust/Axum + React 19 stack that builds clean. The foundation is honest (stubs are labeled as stubs) and non-custodial.

The two existential facts for the roadmap:

1. **Toccata activates on Kaspa mainnet June 5–20, 2026 — i.e. now.** It ships KIP-17 (extended opcodes), KIP-20 (covenant IDs), KIP-16 (on-chain Groth16 + RISC0 STARK verifier precompiles), and KIP-21 (sequencing commitments). Covex is *already* built on TN12/SilverScript — it is positioned to be **the** covenant explorer at the exact moment covenants reach mainnet. This window will not stay open: KaspaCom's official-adjacent explorer (tn10-covenants.kaspa.com) is further ahead on indexing depth and API ergonomics.
2. **The biggest problems are not missing features — they are performance and a handful of broken wires.** The explorer downloads a 15–37 MB JSON blob on nearly every page, the JS bundle is 16.8 MB, and three frontend features call endpoints that don't exist.

---

## 2. Bugs & Broken Functionality (verified live on hightable.pro)

### P0 — Critical (user-visible breakage / unusable performance)

| # | Bug | Evidence | Fix |
|---|-----|----------|-----|
| 1 | **`/api/covenants` returns 15.5 MB; `?limit=5` returns 37.5 MB.** The `limit` param is ignored by the backend and *bypasses* the server-side api_filter (explicit limit disables the default 5000 cap). | Live probe: `limit=5` → 37,469,873 bytes | Implement real `LIMIT/OFFSET` in the SQL query in `backend/src/main.rs` covenants handler; strip `custom_ui_html`/`script_hex` from list responses in Rust (not the Python filter); add `?fields=` support |
| 2 | **Every covenant detail page downloads the entire covenant set.** `CovenantInteractive.jsx:237` fetches `/api/covenants` (no limit, 15 MB) to render ONE covenant. `CovenantFix.jsx:195` and `Explorer.jsx:112` (`limit=20000`) same pattern. | repo code + live response sizes | Add `GET /api/covenants/:id` single-covenant endpoint (exists already for search) and use it; paginate the Explorer with infinite scroll |
| 3 | **Compile button silently broken.** `Deploy.jsx:276` POSTs to `/api/compile` → **404** (verified live). `compiler.rs` exists but no route is mounted. | `curl /api/compile` → 404 | Mount `.route("/compile", post(...))` → `compiler::compile_dsl()` |
| 4 | **UI Builder save/load broken.** `UiBuilder.jsx:30,54` calls `/api/covenants/:id/trust-config` and `/api/covenants/:id/ui-config` — neither route exists on the backend. | repo cross-check; routes absent in `main.rs` | Point UiBuilder at the existing `/terminal-config/:id` endpoints, or add the missing routes |
| 5 | **16.8 MB JS bundle (6.1 MB gzipped), single chunk.** ~2–8 s download before the app renders; Three.js, snarkjs, chess engines, kaspa-wasm, all 8 game arenas and every page load up-front for every visitor. | curl timing: 1.75 s (gzip) / 8.1 s (raw) | Vite `manualChunks` + `React.lazy()` per route; lazy-load game arenas, snarkjs, Three.js; serve Brotli; consider WASM async init |

### P1 — High (functional gaps, trust issues)

| # | Issue | Evidence | Fix |
|---|-------|----------|-----|
| 6 | `/healthz` returns the SPA's index.html (nginx fallback) — external monitoring will report "healthy" even if the backend is dead. | live probe: 200, 3949 b HTML | Proxy `/healthz` to the backend `/health`; add `/livez` `/readyz` like KaspaCom |
| 7 | Marketplace is an empty shell: `/api/marketplace/templates` returns `{"templates":[],"total":0}`; `TemplateLibrary` never fetches it (team's own audit, P0 #1). | live probe + `docs/CURRENT_STATE_AUDIT_AND_ROADMAP.md` | Wire publish → browse loop (already started in commit c3d5c22) |
| 8 | Game state not persisted — `skill_games` table exists but games reset on page reload; `participant_count` static. | code audit | Wire game state save/restore; live "waiting players" counts |
| 9 | Some FullScreen game components contain "demo fallback" fake oracle signature paths. | team audit P0 #3; code audit | Remove all demo/fake signature code paths before mainnet |
| 10 | **CORS fully permissive** (`CorsLayer::permissive()`, `main.rs:270`) and **no rate limiting** (only `ConcurrencyLimitLayer(64)`); oracle verify spawns Node child processes — cheap DoS vector. | code audit | Restrict origin to hightable.pro; per-IP token-bucket on `/api/oracle/*`, `/api/sign-and-broadcast`, `/api/compile` |
| 11 | Default **oracle private key hardcoded** (`oracle.rs:115`, env-overridable) and dev wallet keys in source (`dev_wallets.rs`, testnet-only, mainnet hard-rejected — OK but messy). | code audit | Fail startup on mainnet unless `COVEX_ORACLE_KEY` set; move dev keys to `.env` |
| 12 | No input size limit on stored custom UI HTML (`generated_uis.ui_html` unbounded TEXT) and custom UI rendered via iframe — XSS/phishing surface and DB bloat. | code audit | Size cap + sanitization now; replace raw-HTML approach with component-based pages (see §6) |

### P2 — Medium

- `/api/balance/:address` works live but is missing from some frontend flows that need it (PaidDeploy balance check pattern inconsistent).
- Network selector stored in localStorage with no validation; mismatched network params confuse state.
- `is_active` never set to false → explorer will accumulate dead covenants forever; no archival policy.
- Mixer endpoints are stubs (deposit/nullifier recorded, zero actual privacy) — clearly labeled, but should be feature-flagged off in UI until real.
- Chess full-ZK zkey generation impractical (21+ h); Hybrid mode fine — document the trust difference in the UI.
- RISC0 guests are stubs (no toolchain installed) — fine for now; becomes real with KIP-16 (see §5).
- Single centralized oracle; "decentralized liveness" endpoint always returns healthy (honest Phase-3 stub).
- Dev PTAU (powers-of-tau) used for circuits — **no production MPC ceremony**, so current "ZK" circuits are not trustless even when real.

### What demonstrably works (verified live + in code)

Explorer with real on-chain data (10,101 covenants, 6,447 verified) · covenant detail + custom UI rendering · free deploy with 8 visual templates · tier payments (FREE/BUILDER 100/PRO 500/MAX 1000 KAS) with on-chain verification · Terminal config with Schnorr ownership challenge · oracle verify-and-sign with pluggable verifiers (~30 real Groth16 circuits + hybrid/attested fallbacks) · compute-payout · sign-and-broadcast (native Rust, vendored sighash fix for TN12) · multi-network indexers (crawler + live indexer + payment guardian) · `/api/tiers`, `/api/analytics`, `/api/deploy-capacity`, `/api/balance` all respond correctly.

---

## 3. Architecture Snapshot

- **Frontend:** React 19 + Vite 8, Tailwind v4, React Router v7 (16 routes), Three.js, snarkjs in-browser, @kasflow/wallet-connector + KasWare/OneKey.
- **Backend:** Rust, Axum 0.7, kaspa-wrpc-client 0.15 (wRPC/Borsh to local nodes), vendored kaspa-consensus-core with TN12 sighash fix, SQLite (WAL) with 11 tables, three background loops (chain crawler walking selected-parent chain for `aa20–aa23` payloads; 10 s live indexer; 15 s payment guardian).
- **ZK:** circom/circomlib, ~30 compiled circuits with artifacts, snarkjs verification via Node child-process, 150+ attested-only "circuits", RISC0 stubs, dev PTAU.
- **Ops:** Hetzner + PM2 + nginx + a Python `api_filter.py` response-stripping shim (fragile — replace with proper Rust-side field selection), triple-sync deploy script.
- **Networks:** TN12 primary (live), TN10 secondary, mainnet wired but `mainnet_ready: false` awaiting Toccata.

---

## 4. Kaspa Ecosystem Knowledge Base (GitHub)

### Official (github.com/kaspanet)
| Repo | What it is | Relevance to Covex |
|------|-----------|--------------------|
| **rusty-kaspa** (822★, Rust) | Reference full node + libraries (consensus, txscript, wRPC, WASM SDK) | Core dependency; watch `crescendo`/Toccata branches for opcode changes; un-vendor consensus-core once sighash fix lands upstream |
| **silverscript** (39★, Rust) | Official CashScript-inspired covenant language + compiler + **source-level debugger** (`sil-debug`) + KCC20 book | Covex compiles to this. ⚠️ Officially "experimental, **TN12-only**, breaking changes without notice" — pin versions, build a compatibility test suite. The CLI debugger could power an in-browser script debugger (killer paid feature) |
| **vprogs** (47★, Rust) | Framework for **based provable computation** (tx scheduler, execution runtime, storage) — the zk-app layer over KIP-21 | The future of "zk circuits on covenants"; Covex's zk tier should track this, not roll its own |
| **kips** (52★) | KIPs 1–21. Key: **KIP-10** (introspection, live since Crescendo May 2025), **KIP-16** (zk verifier opcodes: Groth16 + RISC0 STARK precompiles), **KIP-17** (extended script opcodes — covenant backbone), **KIP-20** (covenant IDs/lineage), **KIP-21** (partitioned sequencing commitments) | Toccata = 16+17+20+21. Covex must adopt KIP-20 canonical covenant IDs for explorer identity |
| **kaspa-python-sdk** (Rust/Py) | Native Python bindings | Useful for ops scripts/indexer tooling |
| **docs** (64★, MDX) | Official documentation | Link from Covex education pages |
| kaspad (Go, deprecated) · kasparov (old API server) · faucet · dnsseeder · research · whitepaper | Legacy/support | Reference only |

### Community / Ecosystem
| Repo / Org | Relevance |
|------------|-----------|
| **KASPACOM/** (org behind tn10-covenants.kaspa.com) — `kaspa-covenants` repo is **private**; public: `kaspacom-web-wallet`, `x402-KAS` (micropayments protocol), `kaspacom-defi-mcp` (MCP tools for agents), `swap-sdk`, `krc721` | Your direct competitor/peer. Their x402-KAS pattern is exactly what Covex's paid API tier should use |
| **kasware-wallet/extension** (50★, TS) | The main browser wallet — Covex already integrates; track their covenant-signing APIs |
| **aspectron/kaspa-ng** (101★, Rust) | Desktop node/wallet + **BlockDAG visualizer** — open-source inspiration for a local DAG background viz (replacing the external kgi iframes) |
| **lAmeR1/kaspa-explorer** (42★) + kaspa-rest-server (powers api.kaspa.org) | Reference REST API surface & explorer UX |
| **supertypo/simply-kaspa-indexer** (31★, Rust) | High-performance PostgreSQL Kaspa indexer — consider as the base when SQLite hits its ceiling |
| **K-Kluster/Kasia** (68★) | Encrypted P2P messaging on Kaspa — potential integration for covenant participant chat |
| **Kasplex** (zkEVM based-rollup L2, USDC/USDT live) · **Igra Labs** (EVM based ZK rollup, public nodes, DAO, mainnet target ~March) · **Sparkle** (Sutton's original based-zk concept) · **QUEX** (TEE oracle feeds) | The L2/oracle landscape. Covex covenants could eventually consume QUEX oracle feeds; Igra/Kasplex are where EVM-style apps go — Covex's moat is **native L1 covenants** |

---

## 5. tn10-covenants.kaspa.com (KaspaCom Covenant Explorer) — What to Steal

Their indexer API (`tn10-indexer.kaspa.com`, OpenAPI 0.1.0, full spec captured in `audit/openapi.json`) is the best blueprint available. Features Covex should adopt, in priority order:

1. **Canonical covenant IDs + lineage timelines** — `/covenants/by-id/:id`, `/covenants/:id/actions` returning *deploy → spend → continuation* chains. This is KIP-20 made visible, and it's the heart of a covenant explorer. Covex currently shows covenants as static rows with no lifecycle.
2. **Real pagination everywhere** (`limit`/`offset` on every list endpoint) — fixes Covex bug #1 by design.
3. **"API Calls For Builders" tab + Swagger UI** — every explorer view shows the exact `curl` to reproduce it ("Copy these into curl or point an app at the same indexer API this explorer uses"). Cheap to build, massive developer goodwill, and it markets the paid API.
4. **Pay-per-call API monetization** — `/payments/challenges`, payment **channels** (open/sync/close), direct payment **proofs** (client broadcasts KAS, submits txid as proof), receipts, `/payments/pricing` listing free vs priced routes. This is a complete, working x402-style revenue system for the data/API layer — a natural Covex paid tier that doesn't even require UI work from customers.
5. **`/covenant-templates` summary endpoint** — template registry with counts and active balances (their indexed templates include `KCC20V2/V3`, `KCC20Sale/SaleV2`, `KCC20BuyOrder`, `KCC20FeeTicket` "fixed-denomination fee-ticket covenant", `KCC20V2Vesting`, wrappers).
6. **KCC-20 token layer** (the official SilverScript token standard — see the KCC20 book at kaspanet.github.io/silverscript) — holders, balances per address, markets with best bid/ask & spread, orderbook depth, OHLCV **candles**, trade tape, quote validation, vesting. Covex doesn't need a full DEX, but indexing KCC-20 covenants and showing holders/activity per token is table stakes once Toccata lands.
7. **Address-centric portfolio pages** — `/addresses/:addr/covenants|events|utxos|kcc20/balances|orders|trades`. Covex has creator analytics but no public "what does this address hold/do" view.
8. **Global `/events` feed + `/freshness`** — recent actions across all covenants with suggested polling cadence; proper `/health`, `/livez`, `/readyz`.
9. **Settlement status** — `/tx/:txid/settlement-status` ("is my tx indexed, decoded, current?") — perfect for post-stake UX feedback.

---

## 6. The Covenant Page Designer (paid tiers) — Recommended Stack

Your vision: paid users design an entire beautiful page for their interactive covenant, with full fee transparency, published on the explorer. The current approach (free-form layers canvas + raw custom HTML in an iframe) works but caps out on both polish and safety. Recommended open-source stack:

- **Page designer: [Puck](https://puckeditor.com) (MIT, React-native, actively maintained).** Drag-drop editor where *you* define the component catalog; pages serialize to pure JSON stored in your DB and render read-only via `<Render>`. Users can never inject HTML/JS — they only configure components you wrote. Runner-up: Craft.js (MIT, same model, but dormant since ~2023).
- **Rich text ("describe what it does"): [BlockNote](https://github.com/TypeCellOS/BlockNote)** (Notion-style, React, typed JSON blocks, built on Tiptap) — embedded as a Puck component. Runner-up: Tiptap directly (MIT everywhere).
- **Interactive transaction widgets: custom platform-authored React components, not a form builder.** A curated catalog registered in Puck: `ConnectWallet`, `StakeButton`, `ExecuteCovenant` (fee breakdown + confirmation), `PotStats`, `ArenaJoin`, `OracleStatus`, `CountdownTimer`, `HolderList`. Use **react-jsonschema-form** (Apache-2.0) inside `ExecuteCovenant` to auto-generate parameter forms from each covenant's schema.
- **Mandatory transparency panel:** a non-removable, non-editable Puck root component on every published page that auto-renders from indexed on-chain data: covenant ID + script hash, network, payout structure (%, who gets what), platform/creator fees, resolution method (oracle vs ZK-verified vs on-chain), oracle pubkey, current pot. *Designers can style around it, never hide it.* This is your differentiator and your anti-rug-pull defense.
- **Why not GrapesJS/Builder.io/Webstudio:** GrapesJS outputs arbitrary user HTML/CSS (XSS/phishing on a crypto explorer = catastrophic; this is also the flaw in Covex's current custom-HTML iframe). Builder.io's editor is proprietary SaaS. Webstudio is AGPL and not embeddable. Survey of Zora/Manifold/Juicebox confirms: no serious crypto platform lets users ship freeform HTML — they all do branded slots + canonical transaction widgets.

**Migration:** keep the existing layers data; write a one-time converter from `custom_ui_config` layers → Puck JSON; deprecate raw `custom_ui_html` (grandfather existing ones behind sandboxed iframes with strict CSP until converted).

---

## 7. Design Ideas

1. **Tier visual language:** subtle card treatments — FREE (flat), BUILDER (teal edge glow), PRO (animated gradient border), MAX (gold/aurora border + featured carousel slot). Visibility = sort weight + carousel + "Featured" row, all clearly labeled "Promoted" for honesty.
2. **Uniform 3-col card grid** (already your P0): fixed-height cards via CSS grid `grid-auto-rows` + line-clamped descriptions; identical stat layout (Pot · Participants · Category · Network) on every card.
3. **Covenant lifecycle visual:** horizontal timeline on detail pages (Deployed → Funded → Active → Resolved → Settled) driven by indexed actions — pairs with the KIP-20 lineage work.
4. **Local DAG hero/background:** replace external kgi iframes with a lightweight in-house canvas viz (kaspa-ng's visualizer as reference) — blocks streaming in real time via wRPC, covenant txs highlighted in teal.
5. **Trust at a glance:** per-covenant badges — `ZK-verified` (green shield), `Oracle-attested` (yellow), `Unverified` (gray) — with a click-through explainer. Surface the resolution mode honestly; it builds more trust than hiding the oracle.
6. **Live activity ticker** (from the new `/events` feed): "0.5 KAS staked on Chess Arena #4421 · 12s ago" — makes the explorer feel alive.
7. **Kaspa-native branding:** lean into Kaspa teal (#70C7BA) as the accent on your dark glass aesthetic; Plus Jakarta Sans / JetBrains Mono (what KaspaCom uses) or keep your current type but add a mono face for addresses/scripts with click-to-copy + middle-ellipsis everywhere.
8. **Studio onboarding:** template-first flow — pick a template (Escrow, Arena, Vesting, Pool…), see a fully designed page instantly, then customize. Templates double as marketing.

---

## 8. Phased Improvement Plan

### Phase 0 — Stop the bleeding (days)
1. Pagination + single-covenant endpoint; kill the 15–37 MB responses (bugs #1, #2). Move field-stripping from `api_filter.py` into Rust.
2. Mount `/api/compile`; fix UiBuilder endpoint paths (bugs #3, #4).
3. Code-split the bundle: route-level `React.lazy`, lazy snarkjs/Three.js/arenas; target < 500 KB gz initial. (bug #5)
4. Real `/healthz` proxy; restrict CORS; per-IP rate limiting on expensive endpoints; enforce `COVEX_ORACLE_KEY` on mainnet.
5. Remove demo/fake oracle fallbacks from FullScreen games; cap + sanitize stored UI HTML.

### Phase 1 — Explorer 2.0 (2–4 weeks) — *be the canonical covenant explorer when Toccata lands*
6. KIP-20 canonical covenant IDs + **action lineage timeline** (deploy/spend/continuation) per covenant.
7. Global events feed, address portfolio pages, tx settlement-status endpoint.
8. **OpenAPI + Swagger UI + "API calls" tab** on every explorer view.
9. Finish marketplace loop (publish → browse, already started); uniform card grid; arena liveness signals.
10. Mainnet flip rehearsal: env-gated mainnet indexer, real treasury key from vault, `mainnet_ready` checklist automated.

### Phase 2 — Covenant Page Studio (4–8 weeks) — *the paid product*
11. Puck-based designer + widget catalog + BlockNote + mandatory transparency panel (§6); converter from existing layers format.
12. Tier-gated capabilities: FREE = default auto-generated page; BUILDER = Studio + 3 templates; PRO = full catalog + custom theming + featured slot; MAX = top placement, multiple pages, custom domain slug (`hightable.pro/c/<name>`).
13. SilverScript debugger-as-a-service (wrap `sil-debug`) in the advanced composer — step through covenant scripts in-browser (unique paid feature, no one else has this).

### Phase 3 — Monetize the data layer (parallel, 2–4 weeks)
14. Pay-per-call API à la KaspaCom: payment challenges → direct KAS payment proofs → receipts; later payment channels (port/learn from `KASPACOM/x402-KAS`). Free tier for explorer browsing, priced tier for bulk/builder routes.
15. Transparent treasury page: live tier revenue, fee flows, payout history — eat your own transparency dogfood.

### Phase 4 — Trust upgrade (Toccata-dependent, 1–3 months)
16. **Migrate oracle-attested resolutions to on-chain verification via KIP-16** (Groth16 + RISC0 STARK precompiles). This converts Covex's biggest architectural weakness (single centralized oracle) into its biggest headline: "covenants resolved by proofs, not promises." Start with the circuits that already have artifacts (merkle, range, timelock, pot-split).
17. Real MPC trusted-setup ceremony for the production circuits (current dev PTAU is not trustless); or prefer RISC0 STARK paths (no trusted setup).
18. Multi-oracle threshold signing for whatever remains attested; deprecate the liveness stub.
19. Track `vprogs` for based-zk app support; integrate QUEX TEE feeds as an external-data oracle option for predictive covenants.

### Phase 5 — Ecosystem depth (ongoing)
20. KCC-20 indexing: token pages, holders, vesting schedules; covenant-template registry with counts/balances.
21. Postgres migration (simply-kaspa-indexer as reference) when SQLite/full-rescan becomes the bottleneck.
22. Kasia-based encrypted chat between covenant participants; KasWare/OneKey deep-link flows; mobile polish (PWA already manifest-ready).

---

## 9. Live Browser Click-Through Findings (added 2026-06-12, Chrome session)

Full interactive pass over hightable.pro: every nav link, tab, filter, the deploy wizard (all 3 steps), dev-wallet flow, payment flow, network switcher, theme toggle, templates, dashboard. Zero JavaScript console errors across the whole session — the breakage is in wiring and UX states, not crashes.

### New bugs found by clicking (not visible in code/API audit)

| # | Severity | Bug | Detail |
|---|----------|-----|--------|
| B1 | **P0 — trust** | **Fake "Covenant Created!" success on mainnet with no wallet.** | Deploy wizard (MAIN network, wallet disconnected) → fill Basics → Configure → Visual Design → "Create Covenant" → full-screen green-check **"Covenant Created!"** with **zero network requests fired** and nothing on-chain; "View in Explorer" then shows 0 covenants. Directly violates the project's own "everything real, no fake success" rule. The button must hard-require a connected wallet and fail loudly. |
| B2 | P1 | **Money CTAs fail silently.** | Covenant detail "OPEN WALLET TO EXECUTE" (no wallet, empty amount) → no toast, no validation, nothing. Pricing "Send 100 KAS Now" with 0-balance dev wallet → nothing. Both need explicit error states ("no wallet detected → install KasWare", "insufficient balance"). |
| B3 | P1 | **Category filter returns silent empty grid.** | Explorer → type filter → "Chess" → entire covenant list disappears with **no "no results" message**, while the header still claims "6,939 total". Either filter values don't match indexed categories, or results render nothing. Same missing-empty-state risk for all 33 filter chips. |
| B4 | P1 | **Templates "Preview" button does nothing.** | /templates → Chess "Preview" → card highlights, no preview modal/render. "Use Template" untested past click-through. |
| B5 | P1 | **Marketplace still not wired.** | /templates has no "Community Published" section; `/api/marketplace/templates` is never fetched (the c3d5c22 commit message says this work was started — it isn't live). |
| B6 | P2 | **Two different deploy experiences per network.** | On TN12, /deploy = SilverScript editor + dev-wallet gate; on MAIN, /deploy = 3-step "Create Your Covenant" wizard. Confusing product split — unify into one flow with network-conditional signing. |
| B7 | P2 | **Light-mode contrast failures.** | "CONNECT WALLET" button renders dark-on-dark (nearly invisible); Connect Wallet drawer shows wallet names as dark text on dark cards inside a white drawer (unreadable). Theme toggle otherwise works. |
| B8 | P2 | **Navbar inconsistency.** | On /kaspa the network switcher (TN12/TN10/MAIN) and "Fix" link disappear from the header; page title also changes. One global navbar everywhere. |
| B9 | P2 | **Z-index/overlay glitches.** | Deploy wizard step indicator (1-2-3 circles) renders *behind* the fixed navbar; /templates large card titles ("Predict", "Vote", "Revenue") bleed through the navbar when scrolling. |
| B10 | P2 | **Footer ignores selected network.** | With MAIN selected, footer still reads "testnet-12 • 10.1k covenants". Also `/status` `git_commit` reports the server repo's HEAD, not the running binary's build commit (a docs-only `git reset` on the server changed the footer commit without any rebuild). |
| B11 | P2 | **Duplicate explorer rows.** | Same covenant (id `b261d39f5d…`, script `fc5c7959…`) listed twice with different names ("skill-covenant" and "BUILDER") — looks like two DB rows for one on-chain covenant (metadata overwrite vs insert). |
| B12 | P3 | /advanced silently redirects to /pricing with no explanation banner. Search tab needed a pixel-precise click (small hit area). "View covenant --" cards show a broken arrow glyph. |

### Confirmed live (already in §2)
- Explorer fires `/api/covenants?limit=20000` on every homepage load; covenant detail pages spend **8–15 s on "INITIALIZING PROTOCOL SEQUENCE..."** downloading the full 15 MB list to show one covenant.
- Dev-wallet modal pulls an additional ~11 MB kaspa-wasm module on demand.

### What works well (verified by interaction)
Type-filter panel UI · search with helpful "No Results" guidance · Arena honest empty state · dev wallet generate/connect (TN12) with balance display · free deploy with honest "DEPLOYMENT FAILED — No UTXOs found" error · payment screen (tier/amount/treasury/QR) · network switcher correctly disconnects wallet on switch · **mainnet correctly hard-blocks dev wallets** ("REAL WALLET ONLY" banner) · mainnet explorer honest "node still syncing" empty state · /kaspa education page · templates gallery rendering · dashboard/fix wallet-gated states · wallet detection (KasWare, Kastle, Kasperia, OKX detected) · zero console errors.

## 10. Key Risks

- **SilverScript instability:** officially experimental, TN12-only, breaking changes without notice. Pin compiler versions; regression-test every covenant template against new releases; expect a migration when mainnet opcode semantics finalize.
- **Toccata timing:** mainnet window is June 5–20, 2026 — if activation slips or differs from TN12 semantics, the vendored sighash fix and compiled scripts may need rework.
- **Oracle centralization:** until Phase 4, every "ZK" game resolution trusts one key on one server. Label it honestly in the UI (badge system, §7.5) and prioritize KIP-16 migration.
- **Custom HTML pages:** current iframe approach is a phishing/XSS liability that grows with adoption — sunset it on the Studio timeline, don't carry it to mainnet.
- **Competition:** KaspaCom has the indexer-API lead and (private) official-adjacent covenant tooling. Covex's defensible ground: interactivity (arenas, stakes, live games), the page Studio, and transparency UX — double down there rather than racing on raw indexing.

---

*Supporting artifacts: `audit/openapi.json` (KaspaCom indexer spec), `audit/bundle.js` / `audit/tn10-bundle.js` (analyzed bundles), agent reports in session transcript. Sources for ecosystem claims: Michael Sutton's Toccata outlook (Medium), kaspanet/kips, kaspanet/silverscript & vprogs READMEs, kas.live countdown, KEF Kasplex L2 article, kaspa.org Igra node rollout, kasmedia coverage.*
