# HERMES_COVEX_MASTER_PROMPT.md
# THE SINGLE CANONICAL MASTER PROMPT - MAKE COVEX THE BEST COVENANT EXPLORER IN THE WORLD
# Copy-paste into a fresh Hermes session. Execute end-to-end with zero shortcuts.

You are Hermes - the most capable autonomous software engineering agent. Your sole mission: make Covex (hightable.pro) the absolute best Kaspa covenant explorer in existence. No demos. No placeholders. No broken promises. Everything real, premium, and working.

## CONTEXT - WHAT COVEX IS AND WHERE IT LIVES

Covex runs at https://hightable.pro. It has:
- Frontend: React Vite app in `/mnt/HC_Volume_105579109/Covex27/frontend/` (deployed to `/root/htp/public/`)
- Backend: Rust axum + rusqlite on port 3006 (PM2 `htp-server`)
- Nginx: proxies `/api/*` through filter proxy `127.0.0.1:3008` to strip 73MB `custom_ui_html` fields
- Networks: TN12 (4,333 covenants) + TN10 (3,172 covenants) indexed live; mainnet ready
- API filter proxy: `/root/api_filter.py` systemd service `covex-api-filter` strips `custom_ui_html` + `script_hex` + enforces `?limit=` (currently 5000)
- GitHub: `THTProtocol/Covex27` master branch
- Local dev: `/home/kasparov/Covex27`

**CRITICAL RULE**: Never deploy `/home/kasparov/Covex` (dead Express repo). Only Covex27. Verify with: `curl -s https://hightable.pro/ | grep title` must show "Covex | Multi-Network Covenant Platform".

## THE VISION - WHAT THE USER DEMANDS

"Covex is the best covenant explorer in the world. All covenants are interactive. All design tools are Canva-level. All categories are auto-detected. All payments work. The design is breathtaking. Every covenant looks premium. The sandbox is the most powerful covenant creator ever built."

## NON-NEGOTIABLE IMPLEMENTATION RULES

### 1. ONLY REAL COVENANTS, NO MADE UP ONES
Every list, grid, card, and filter MUST require `c.tx_id && c.tx_id.length > 20`. Never seed demo data. Never hardcode waiting chess matches. Indexed covenants (never created via Covex) ARE real and must display beautifully.

### 2. ARENA = SKILL GAMES ONLY, WAITING FOR OPPONENTS
Arena is a SEPARATE button in the controls bar (alongside Explore/Search). It shows ONLY:
- Skill games: chess, connect4, poker, blackjack, checkers, tic-tac-toe, reversi, RPS
- Created on Covex (verified_tier >= BUILDER or has custom_ui_config)
- Active (is_active !== false)
- Waiting (participant_count < 2)
- Has stake (amount_kaspa > 0)
- Has real tx_id
Premium (MAX/PRO) pinned to absolute top. Empty state: "No active matches right now - When a game creator is waiting for an opponent, their match appears here."

### 3. PAID COVENANTS AT THE VERY TOP OF EXPLORER
Sort order: MAX first, PRO second, BUILDER third, FREE last. Within each tier: highest `amount_kaspa` (TVL) at top. Cards must show tier badge (Crown/Star/Shield) with gradient header stripes.

### 4. VISUAL TEMPLATE GALLERY (CANVA-LIKE)
Free tier Deploy page MUST have premade visual templates that users cycle through. Each template applies a complete look (background, panel style, borders, text color, accent) with a live preview card. Must include at minimum: Dark Glass, Neon Night, Gold Rush, Ocean Depth, Blood Moon, Emerald Forest, Minimal White, Industrial.

### 5. ALL COVENANTS FULLY INTERACTIVE
Every covenant page at `/covenant/:tx_id` must render the covenant's custom UI if it exists, or a clean default interactive panel. Indexed covenants (from other explorers/sites) must be fully viewable with all available data. The normalize/display pipeline must handle any Rust backend field format.

### 6. CATEGORIES MUST MATCH BACKEND DATA
The Rust backend categorizes covenants into: Predictive Markets (409), general (34), Flash Covenants (31), Tournaments (21), Community Pools (2), ZK Oracle Tools (1), Escrow & Custody (1), Structured Settlement (1). Frontend category labels and filters MUST match these exact names. Never invent categories not in the data.

### 7. DESIGN TOOLS (GIMP-LIKE + CANVA-LIKE)
The sandbox (/premium) for paid users must have:
- Visual template gallery (8+ premade designs with live preview cycling)
- Color picker with preset swatches
- Font selection (at minimum: JetBrains Mono, Inter, system-ui)
- Image upload/URL for covenant banner/header
- Layout presets (glass, solid, game lobby, escrow panel)
- Live preview that updates with every change
- Device preview toggle (desktop/mobile)
- The public-facing card must show the custom image/banner if set

### 8. NO BROKEN FEATURES
- No broken SilverScript that doesn't compile
- No dead API endpoints called in production
- No "Phase 1", "sandbox", or "coming soon" text in UI
- No em-dashes (—) in user-facing text (replace with " - " or colons)
- No "→" arrows in JSX (use literal "-->" or just text)

### 9. ALL 3 NETWORKS, ALL 3 PLACES SYNCHRONIZED
TN12 + TN10 + Mainnet must all work on the same site. After every change:
```bash
cd /home/kasparov/Covex27/frontend && npm run build  # must pass with ✓ built in Xs
git add -A && git commit -m "descriptive message" && git push origin master
ssh root@hightable.pro 'cd /mnt/HC_Volume_105579109/Covex27 && git fetch origin && git reset --hard origin/master && cd frontend && npm run build && rsync -av --delete dist/ /root/htp/public/'
```

## EXECUTION PLAN (FOLLOW IN ORDER, BE THOROUGH)

### PHASE 1: INFRASTRUCTURE VERIFICATION (5 min)
- SSH to Hetzner: verify `covex-api-filter` running, check `curl -s http://127.0.0.1:3008/covenants?limit=5 | wc -c` < 5000 bytes
- Verify backend: `curl -s http://127.0.0.1:3006/health` returns OK
- Check PM2: `pm2 status` - htp-server must be online
- Verify nginx: `nginx -t && systemctl status nginx`
- Check git: `git log --oneline -1` on Hetzner matches GitHub master

### PHASE 2: CODE QUALITY PASS (10 min)
- Read `frontend/src/App.jsx` to understand routes
- Read `frontend/src/pages/Explorer.jsx` to understand card rendering, arena filter, sort order
- Read `frontend/src/pages/Deploy.jsx` to understand free-tier creation flow + templates
- Read `frontend/src/pages/PremiumBuilder.jsx` to understand sandbox/terminal
- Read `frontend/src/pages/Pricing.jsx` to understand payment flow → `/premium` redirect
- Run: `grep -rn '—' frontend/src/ --include="*.jsx" | grep -v node_modules | grep -v '//'` to find any remaining user-facing em dashes - fix them
- Fix any `→` arrow in JSX user-facing text to use `-->`

### PHASE 3: DESIGN SYSTEM ENHANCEMENT (20 min)
In `Deploy.jsx`, enhance the visual template gallery:
- Add 8+ templates with distinct color schemes
- Each template preview shows: background, card panel, text color, accent, border style
- Add left/right arrow cycling + thumbnail strip
- Live preview updates when user types name/description
- Add a "Regenerate" button that randomizes template

### PHASE 4: EXPLORER CARD ENHANCEMENT (15 min)
In `Explorer.jsx`, enhance CovenantCard to show:
- Visual header with tier gradient + category-specific color stripe
- Decorative dots pattern in header
- Status badge (ACTIVE green / SETTLED gray)
- All available metadata: creator (truncated), script hash (truncated), covenant type, DAA/timestamp
- Category label displayed prominently
- Ensure `min-h-[320px]` for uniform card heights across all rows
- Paid covenants get extra glow + hover elevation

### PHASE 5: FULL PAYMENT FLOW VERIFICATION (10 min)
In `Pricing.jsx`, verify:
- Payment triggers `sendPayment` to correct treasury (per-network)
- On success: saves a `payment_broadcast_tx` HINT to sessionStorage (payer address + txid + broadcastAt) so the Sandbox can show an honest "broadcast, awaiting on-chain confirmation" banner, then navigates to `/premium` (which is a Navigate to `/sandbox?paid=1`). The marker is never trusted for tier gating; tier access is decided only by `/api/paid-status` once the chain confirms.
- `/premium` (PremiumBuilder) reads sessionStorage, verifies via `/api/auth-session`, grants sandbox access
- No intermediate `/paid-builder` page - direct to sandbox

### PHASE 6: BUILD, COMMIT, PUSH, DEPLOY (5 min)
```bash
cd /home/kasparov/Covex27/frontend && npm run build
# Must pass: ✓ built in Xs
cd /home/kasparov/Covex27 && git add -A && git commit -m "feat: master of masters - premium cards, Canva templates, em-dash purge, all categories, full sandbox" && git push origin master
ssh root@hightable.pro 'cd /mnt/HC_Volume_105579109/Covex27 && git fetch origin && git reset --hard origin/master && cd frontend && npm run build && rsync -av --delete dist/ /root/htp/public/ && echo DEPLOYED'
```

### PHASE 7: LIVE VERIFICATION (5 min)
- Browse https://hightable.pro/ - confirm premium cards, all 4,333 covenants, arena button, sort order
- Browse https://hightable.pro/deploy - confirm 3-step flow, template gallery, 10 categories
- Browse https://hightable.pro/pricing - confirm tier cards, payment flow
- Check no "Circuit Schema", "Phase 1", "FEATURED FOR PLAY", "Explore to discover" text anywhere
- Verify no JS errors: browser console must be clean

## SUCCESS CRITERIA (MUST ACHIEVE BEFORE STOPPING)
- All 4,333+ covenants displayed with premium cards, paid at top by TVL
- Arena shows only skill games waiting for opponents (or empty state)
- Deploy page has Canva-like visual template gallery with 8+ designs
- Categories match backend data (Predictive Markets, Flash Covenants, Tournaments, etc.)
- No em-dashes in user-facing text
- No broken SilverScript, no dead endpoints, no "Phase" references
- Payment redirects directly to /premium sandbox
- GitHub master, Hetzner, hightable.pro all at identical commit
- Build clean, zero JS errors on live site
- Site title: "Covex | Multi-Network Covenant Platform"

## COMPLETED IN PREVIOUS RUNS (DO NOT REGRESS)
- FEATURED FOR PLAY chess block deleted (both instances)
- "Explore to discover and play" text deleted
- "Creators: Manage via Fix" links deleted
- Demo waiting cards (50 KAS, 25 KAS) deleted
- FullScreenChess demo overlay removed
- Circuit Schema renamed to ZK Circuit Configuration
- Broken SilverScript removed from PremiumBuilder deploy payload
- PremiumBuilder renamed to "Sandbox" (full customization terminal)
- API filter proxy: 5000 limit, strips custom_ui_html and script_hex
- Explorer cards: tier gradients, dots pattern, status badges, full metadata
- Arena: separate button, real on-chain filter, premium pinned top
- 3-network infrastructure verified: 4,333 TN12 + 3,172 TN10

BEGIN NOW. Use tools. No speculation. No demos. Every change verified on live hightable.pro.
