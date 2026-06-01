# Hermes Master Prompt - Phase 2: Visual & Experience Overhaul (Final)

You are Hermes, a highly capable autonomous software engineering agent.

## Mission
Fully execute **Phase 2: Visual & Experience Overhaul** for Covex (https://github.com/THTProtocol/Covex27) until it is polished, easy to use, and production-ready.

All changes must result in **GitHub, the Hetzner server (Hightable), and https://hightable.pro being 100% identical**.

## Core Requirements (Non-Negotiable)

### 1. Explorer Tier Visibility (User's Explicit Request)
- On the public Explore page, **regular visitors must NOT see any tier labels** ("BUILDER", "PRO", "MAX", "FREE", or any badge/text indicating the tier).
- Higher-tier covenants must be **prioritised and more visible** purely through:
  - Better visual treatment (subtle colored card borders, glows, elevation, or styling based on tier payment).
  - Better placement and sorting (paid covenants appear first, sorted by tier rank + TVL).
- **Only the covenant creator** (when their wallet is connected and matches `creator_addr`) may see their own tier badge.
- The goal is a merit-based / prioritised feel: better-funded covenants simply look and rank more prominently without disclosing "this one is MAX".

Current implementation already has conditional badge rendering based on `isOwner`. Do not regress this. If the live site still shows tier labels to everyone, fix it immediately.

### 2. Design System & Theme
- Adopt shadcn/ui properly (components.json, cn() utility) + hybrid approach.
- Keep Kaspa green (#49EACB) as primary accent.
- Dark mode = current cypherpunk default.
- Add working light mode (lighter cypherpunk variant with strong green accents).
- Theme toggle in top navigation bar on all pages.
- Use new components (Button, Card, Badge, Input, etc.) consistently.

### 3. Explorer Improvements (Highest Priority)
- Much better display of interactive covenants.
- "My Covenants" / owner filter when wallet connected.
- Dedicated "Advanced Interactive Demos" section with examples (ZK Chess, Poker with covenant + oracle/ZK, etc.).
- Strong mobile responsiveness.
- Stats bar (total covenants, paid count, TVL).
- No public tier disclosure (as per #1).

### 4. Paid Experience Polish
- Clean up PaidBuilder and related paid pages using new design system.
- Better empty states, success banners, tier indicators (visible to owner).
- Keep CovexTerminal mostly untouched (surface only).

### 5. Pricing & Supporting Pages
- Redesign Pricing with clear value for BUILDER / PRO / MAX (no "Creator").
- Improve Kaspa page for consistency.
- Global polish (navigation, states, mobile).

### 6. Naming & Cleanup
- Use BUILDER (not CREATOR) everywhere.
- Zero remaining "CREATOR" tier references in frontend.

### 7. Diagnostic & Health (Critical - User's Latest Request)
Perform a thorough analysis of the live system:

- Why are new covenants slow or not appearing?
- Is the backend correctly connected to the TN12 (Toccata) node?
- Is it accidentally pulling from TN10 or another testnet?
- Is the TN12 kaspad node actually running and healthy on the server?
- Check wRPC connection, crawler progress (`last_scanned_daa`), recent logs, DB file handles (watch for zombie/deleted inodes).
- Verify the indexer is using the correct seed addresses and treasury for the active network.

If issues are found (wrong network, dead node, misconfigured DB path, stale processes, etc.), **fix them**.

Document your findings clearly.

### 8. Sync & Deployment (Mandatory at the End)
- After all code changes: commit + push to GitHub master.
- Provide the **exact command** the user must run on their local machine:
  ```bash
  cd /path/to/local/Covex27
  git pull origin master
  export PASSWORD="your_current_rotated_server_password"
  ./DEPLOY_TO_HIGHTABLE.sh
  ```
- This script pulls, rebuilds frontend, and reloads nginx on the server.
- After deploy, **verify**:
  - GitHub SHA == Hetzner server SHA (`/root/Covex27`) == live hightable.pro
- Confirm no tier labels are visible to non-owners on the public explorer.
- Confirm higher tiers are visually prioritised.
- Confirm the diagnostic findings and any fixes.

## Execution Rules
- Work on master.
- Commit frequently with clear messages.
- Use existing shadcn hybrid components.
- Preserve cypherpunk + Kaspa green personality.
- Everything must build and work at the end.
- Be thorough on the diagnostic.

Start now. When complete, output a final summary + the deploy command + sync confirmation.

Begin execution.