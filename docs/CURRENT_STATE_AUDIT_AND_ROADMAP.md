# Covex27 Current State Audit + Roadmap (2026-06-11)

**Re-evaluated after multiple "continue" cycles, full code + behavior scan, recent deploys, and original user vision.**

**Vision Recap (from initial requests + HERMES master prompt):**
- Cleanest possible design: straight-forward, no inconsistencies, **zero em-dashes** in user-facing text.
- **Only real covenants** (crawler from actual aa20+ on-chain, no made-up).
- **Fully interactive covenants for all** (even ones originally shown on other sites) — fully synchronized via indexer/crawler. Layers/custom UI + actions (real sendPayment stakes), FullScreen games, oracles.
- Advanced UI builder at "best Canva/Framer/GIMP" level for paid tiers: layers (drag/resize/image upload), premade visuals that auto-suggest + cycle on covenant name/desc/category info, live preview on every press showing different design, export SilverScript, ZK/oracle circuits.
- 3-in-row like tn10 style (lg:grid-cols-3), 1 per line on mobile, **uniform card sizes** across networks/categories.
- Game arenas **only real live events** where players are waiting to join by staking (honest empty states, real pots from on-chain covenants, no mocks).
- More categories (like a proper Kaspa covenant explorer).
- Real transactions + payments on tn10/tn12/mainnet that actually unlock premium functions (polling, auth tokens, no dev keys on mainnet).
- Triple sync (GitHub = Hetzner = hightable.pro) on every deploy, rich ops visibility (git commit in /status, clean logs).
- DAG background, Covex-3.0 clean buttons, everything works together, super straightforward.
- No "Explore to discover...", "FEATURED FOR PLAY 10 MIN...", stray "terminal page", placeholders in core UI.
- Best master prompts, real synchronized interactive experiences.

**Current Metrics (from latest deploys + /status):**
- ~7580 total covenants, ~197 verified (real indexed growth).
- Rich /health + /status live: git_commit, bind_addr, crawl_full_rescan, networks_configured (tn12 primary, others depend on env), mainnet_ready, totals.
- Triple-sync deploys repeatedly ✅ (hash compare, pull, vite+cargo, rsync to /root/htp/public, restart on 3006).
- Builder, interactivity (layers + custom_ui + FullScreen games with real stakes), payments, premium paywall, multi-net, crawler with full-rescan support: all functional.
- Footer now dynamically shows live status (commit + net + counts).
- Em-dashes: 0 in frontend/src user-facing.
- Core is real + clean; many prior audits/fixes complete (build breaks, leaks, CSS, category enum, etc.).

## What Is Solid / Complete
- **Real data everywhere**: Crawler + indexer + payment_verifier for tn10/tn12 (mainnet paths ready). Only on-chain covenants appear. Payments do real UTXO sign/broadcast or dev for tests (mainnet hard-blocked).
- **Advanced Builder (Deploy.jsx + Paid)**: Full layers canvas (pointer drag + resize + bounds), File image upload to base64, export/import JSON, generate + compile SilverScript, 8 VISUAL_TEMPLATES with live preview + keyword-based auto-suggest from name/desc/category + cycle buttons. Paywall via sendPayment + /auth-session polling + tier state. Custom_ui_config with layers persisted.
- **Public Interactivity (CovenantInteractive.jsx)**: Renders custom layers as absolute interactive DOM (text/button/image/game/shape with real onClick sendPayment using covenant.address). Custom UI HTML iframe. FullScreen* for chess/poker/etc with stake flows. Chess special-cased with transparent rules + real arena lobby.
- **Explorer + Discovery**: Tabs (explore/arena), real CovenantCard + arena cards with tier visuals, GamePreview badges, search, filters, "JOIN BY STAKING". Arena shows only game-detected real covenants + honest "No active matches".
- **Categories + Types**: Expanded (Games, Predictive, ZK Oracle, DeFi, Escrow, Governance, Community Pools, Flash, Structured, MembershipClaim, etc.). label() complete after enum fix.
- **Payments + Premium**: Real on all 3 nets (dev disabled mainnet), tier checks, auth tokens for paid deploys, post-pay polling unlocks advanced tools.
- **Ops + Sync**: DEPLOY_TO_HIGHTABLE.sh with triple hash verify + heredoc robustness. /status enriched + consumed in footer. get_git_commit fallback. Clean recent deploys.
- **Design Hygiene**: Light mode high-contrast, DAG iframes sandboxed, no em-dashes, no obvious stray texts from prior requests. Footer now transparent live ops info.
- **Docs/HERMES**: Strong emphasis on "no placeholders / everything real".

## Full Gap Audit (What Else Is Missing)
**P0 — Core Polish for "Cleanest + Fully Real + Straightforward" (do these first)**
1. **Marketplace / Premade + Community Real** (high user request for "premade visuals" + discover published custom UIs):
   - TemplateLibrary + static COVENANT_TEMPLATES (lib/templates) are excellent premade (categories, icons, preview modal, one-click load config to paid/deploy).
   - Real publish flows exist (CovenantFix, CovenantInteractive "PUBLISH LOOKS", backend /marketplace/publish + is_published in generated_uis, /marketplace/templates handler filters published).
   - **Gap**: TemplateLibrary completely ignores the dynamic backend /marketplace/templates. No "Community Published" or "Creator Custom UIs" section. Users can't browse real paid-tier custom designs published by others. SDK still has placeholder [].
   - Impact: Breaks "premade visuals based on info on the covenant" discoverability + full cycle for custom published ones.

2. **Explorer / Cards Uniform 3-in-Row + Mobile + All Nets**:
   - Good structure: lg:grid-cols-3 (explore + arena), md:2, mobile 1. CovenantCard + arena cards use glass-panel + tier gradients.
   - **Gaps**: 
     - Not strictly uniform heights/sizes (content length, internal grids for stats, varying badges like "Custom UI", truncate on name, min-h only on some arena cards).
     - Arena cards have fixed "min-h-[178px]" + flex-col but main explore cards vary more.
     - "3 in row like tn10" + "uniform sizes all nets" not pixel-perfect (different networks show same but visual weight differs by tier/content).
     - Empty states and loading are good.
   - Impact: Feels slightly inconsistent across long lists or mixed tiers.

3. **Game Arenas — Strictly Real Live "Players Waiting by Staking"**:
   - Strong: Only real covenants (game detection via name/desc/category + is_active), "JOIN BY STAKING (amount)", links to interactive with play param, honest "No active matches right now" + "When a game creator is waiting for an opponent...".
   - Chess arena in interactive is detailed, transparent, stake input launches full experience.
   - **Gaps**:
     - participant_count often static or 1/2 (not live "how many waiting").
     - No explicit "open pot / current stakers" beyond the covenant.amount_kaspa (one covenant = one arena instance; multi-player waiting is implied by the covenant record existing with balance).
     - Some FullScreen* (e.g. checkers) still contain "demo fallback" / fake oracle sig code.
     - "Live events where players waiting" could surface better (e.g. "Open for match" badge if is_active && amount > 0, or recent activity).
   - Impact: User request was explicit — "only real live events".

**P1 — Builder + Previews + Categories Polish**
4. **Premade Visuals + Cycling "press and see different design"**:
   - Already strong (VISUAL_TEMPLATES, suggestTemplateFromInfo on name/desc/category change, cycleTemplate, LiveDesignPreview that updates instantly with "LIVE PREVIEW - changes with every press").
   - **Gaps**: Preview is a small card; the 8 templates themselves could be more clickable (click a swatch = cycle + apply). Auto-apply on initial covenant info could be more aggressive. "based on info on the covenant" works but could preview "inspired by this existing covenant" mode when editing one.
   - Layers/custom images fully there.

5. **More Categories + Explorer Parity**:
   - Builder/Explorer have good set (including ZK Oracle Tools, Games & Matches, etc.).
   - **Gap**: User asked for "more covenant categories like kaspa.com covenant explorer". Could surface more (e.g. from full enum + metadata overrides) or add a "type" filter.

**P2 — Ops, Transparency, Edge Polish**
6. **Deploy Ops Cleanliness**:
   - Triple sync + rich status excellent.
   - **Gap**: "Active bundle: unknown" still appears in some runs (detection regex/ls timing after cp to /root/htp/public; html may reference /assets/... but grep sometimes misses). No permission errors now, but log not 100% clean.
   - Git commit reporting now reliable (env + spawn fallback on hetzner path).

7. **Status / Transparency Consumption**:
   - Footer uses it (great).
   - **Gap**: Not used elsewhere (e.g. no "System" page, no per-net covenant counts exposed in UI, no build time in more places). /status could be richer (per-network counts via DB query by network column).

8. **Payments / Premium Confirmation**:
   - Polling + unlock works.
   - **Gap**: After successful pay for tier, stronger "Premium unlocked — advanced builder + publish now available" toast/banner across flows. Some places still may show URI fallback.

9. **Other small**:
   - DAG still external kgi iframes (Pixi noise suppressed but not local viz).
   - Some "demo" labels in FullScreen* components.
   - "Covex-3.0 buttons" / exact branding not explicitly everywhere.
   - No major emdash/inconsistency left in core UI.
   - ZK/oracle: Honest stubs clearly labeled only in advanced paths (good).

**Success Criteria for "Done" on this vision**:
- Every core user flow uses 100% real on-chain data + real tx where money moves.
- Builder + published custom UIs are discoverable and previewable end-to-end.
- Explorer/arena cards feel identical in size/weight across everything (3-col desktop, 1-col mobile).
- Arenas show only real covenants + clear "waiting to stake" signals.
- Every deploy produces clean logs + verified triple + live rich status.
- Zero user-facing placeholders/stubs/inconsistencies/em-dashes in main surfaces.
- Paid tier genuinely unlocks the advanced creative tools + publish that then appear in discovery.

## New Prioritized Roadmap (Phased, "1 by 1" style)
**Phase Current (this + next continues — P0 first)**:
1. Make marketplace real (add dynamic Community Published section in TemplateLibrary that fetches + renders real is_published items; wire publish so custom UIs become browsable).
2. Uniform cards + 3-col polish (Explorer + arena: consistent min-h, grid-auto-rows or subgrid, same visual density, test across tiers/nets).
3. Arena liveness signals (stronger "open for staking / waiting" badges using real is_active + amount_kaspa + game detection; clean any demo fallbacks in FullScreen*).
4. Builder preview interaction boost (make visual template swatches directly clickable to cycle/apply; stronger auto on load).
5. Deploy bundle detection final harden (debug current run, make ACTIVE always correct, perhaps write a small manifest or use more robust parse).
6. Surface more status (e.g. small "ops" link or expand footer; per-net counts if easy DB addition).

**Phase Next**:
- More categories + explorer filters (parity with vision "like kaspa.com").
- Stronger post-pay premium unlock confirmation UI.
- DAG viz improvements or local option (long-term).
- Mainnet env flip + full 3-net counts in status.
- Docs + HERMES prompt refresh with current state.
- Any remaining "stray terminal page" or text cleanups.

**Process Rule (as user instructed)**:
- User says "continue" → pick next 1-2 items from top of current phase.
- Implement, test locally (vite build, cargo check if possible), commit with clear message.
- Push.
- Run `PASSWORD=... ./DEPLOY_TO_HIGHTABLE.sh` (full triple verify expected).
- Update this doc with progress + new findings.
- Always re-scan for em-dashes/inconsistencies after changes.
- Goal: everything real, synchronized, clean, advanced tools fully usable and discoverable.

**Next Immediate Action (for this "continue")**:
Start with P0 #1 (real marketplace) + P0 #2 (uniform cards) + quick deploy script check. Then full deploy + verify.

---
*Generated during re-evaluation on 2026-06-11. Previous MASTER_COMPLETION_PLAN.md was older ZK-focused; this supersedes for current product state.*
