# Plan: ZK/Game Type Prominence + Covenant Studio Expansion

## Goal 1: Make ZK / Game Type the Most Prominent Section in Covex Terminal

### Current State
CovexTerminal.jsx has 4 sections ordered: A (Config) → B (Custom UI) → C (Outcome Resolution) → D (SilverScript)

ZK/Game Type is buried inside Section C as a sub-option of "ZK Proof" resolution mode. The game type dropdown (chess_v1, chess_v2, generic_game, custom) only appears when `resolutionMode === 'zk'`.

### Proposed Changes
1. **Extract ZK/Game Type into its own top section** — move it to Section A (above Covenant Configuration) with maximum visual weight
2. **Replace dropdown with a game type card grid** — visually rich selection cards with emoji, circuit info, and real preview hints
3. **Add game-specific SilverScript generation** — each game type gets its own covenant template (not just ChessReusableCovenant)
4. **Game type determines resolution mode** — selecting a game pre-configures the appropriate resolution approach

### Files to Change
- `frontend/src/components/CovexTerminal.jsx` — major restructure:
  - Add Section 0: "Game Type & ZK Circuit" (before current Section A)
  - Add `gameType` state + card grid component (similar to ResolutionCard but larger/bolder)
  - Game options: Chess v1, Chess v2, Checkers, Connect 4, Poker, Dice, Go, Backgammon, Battleship, Sudoku, Reversi, Tic-Tac-Toe, Blackjack, Custom
  - Each game maps to a ZK circuit ID and has a distinct SilverScript template
  - Remove ZK circuit dropdown from Section C — the game type already sets it
  - Keep the ZK Proof resolution card in Section C but make it read-only / auto-selected when a game type with ZK is chosen
  - Section A becomes "Covenant Configuration" (reorder to be after game type)

### Design Approach
- Section header: "Game Type & ZK Circuit" with Zap + gamepad icon
- Game cards in a 4-column grid (or 3-col on narrow screens)
- Each card: emoji (large), game name, ZK circuit badge, selected glow
- "Custom Game" card for non-standard games
- Selected game info panel below cards: circuit ID, verifier key, complexity level

## Goal 2: Expand Covenant Studio to 30+ Templates

### Current State
12 templates in `src/templates/index.js` with config objects. All share one generic `generateGameCode()` function producing an 8x8 grid with no game-specific logic.

### Strategy
Templates need game-specific JS logic AND game-specific UI. We can't have a 100-line-per-template approach — that won't scale. Instead:

**Option A: Template-specific generate functions** — each template gets its own `generate()` function. More code but better UX.
**Option B: Parameterized generator** — add `boardSize`, `gameLogic`, `pieces` to config. Less code but constrains per-template differentiation.

**Decision: Hybrid** — keep the shared CSS/HTML skeleton in `generateGameCode()`, but add template-specific JavaScript blocks and board configurations. Add a `gameConfig` field to each template with:
- `boardSize`: {rows, cols} for grid dimensions
- `pieces`: JS code block for piece rendering
- `logic`: JS code block for game rules
- `uiExtras`: optional HTML blocks for game-specific UI (card hands, dice area, etc.)

### New Templates (18+ to reach 30+)

Already existing (12): chess, checkers, connect4, poker, blackjack, dice, tictactoe, reversi, go, backgammon, battleship, sudoku

New to add (20):
1. **snakes-ladders** — Snakes & Ladders (10x10, roll-to-move)
2. **ludo** — Ludo (cross-shaped board, 4 players)
3. **roulette** — Roulette wheel (betting table, spin animation)
4. **craps** — Craps dice game (betting zones, 2 D6)
5. **baccarat** — Baccarat (card table, banker/player/tie)
6. **dominoes** — Dominoes (tile matching, scoring)
7. **mahjong-solitaire** — Mahjong Solitaire (tile matching, layered)
8. **minesweeper** — Minesweeper (grid, flag/reveal, numbers)
9. **word-guess** — Word Guessing Game (Wordle-style, 5-letter, color feedback)
10. **memory-match** — Memory Card Match (flip pairs, timed)
11. **rock-paper-scissors** — RPS (3 buttons, score tracking)
12. **coin-flip** — Coin Flip (animation, call heads/tails)
13. **hi-lo** — High-Low card game (next card higher or lower)
14. **war** — War card game (draw, compare, win pile)
15. **racing** — Dice Racing (2-4 lanes, roll to advance)
16. **slot-machine** — Slot Machine (3 reels, spin, paylines)
17. **lottery** — Lottery Ball Draw (number grid, ball animation)
18. **trivia-quiz** — Trivia Quiz (Q&A, timer, score)
19. **prediction-market** — Binary Prediction Market (yes/no, odds bar)
20. **2048** — 2048 sliding puzzle (4x4, merge tiles)

### Files to Change
- `src/templates/index.js` — add 20 new template configs (total goes from ~224 to ~750 lines)
- `src/pages/GeneratedCode.jsx` — enhance `generateGameCode()` with game-specific JS/logic blocks
- `src/pages/Home.jsx` — no changes needed (auto-renders from TEMPLATES)
- `src/pages/Editor.jsx` — add game-specific config options (board size, player count) to editor

### Template Config Fields
```js
{
  id, name, emoji, description,
  category: 'board' | 'card' | 'dice' | 'casino' | 'puzzle' | 'party',
  config: {
    ...existing fields,
    boardSize: { rows: 8, cols: 8 },  // for grid games
    playerCount: 2,
    // game-specific defaults
  },
  gameScript: 'snakes-ladders',  // key for game logic block
}
```

### Implementation Order
1. Add 20 templates to `templates/index.js` (data-only, no logic changes)
2. Enhance `generateGameCode()` with conditional game logic blocks
3. Add category filter to Home page (board/card/dice/casino/puzzle/party tabs)
4. Build + verify

## Verification
- **Covex**: `cd frontend && npm run build` — no broken imports, clean output
- **Covenant-Studio**: `npx vite build` — all templates render, no console errors
- Manual: open Covex Terminal, verify Game Type section is prominent at top, cards render, selection works
- Manual: open Covenant-Studio, verify 32 templates visible, generate one from each category, paste into Covex

## Risks
- Regressions in CovexTerminal save/load flow when section order changes
- Template data expansion could break the existing Editor's `{...DEFAULT_CONFIG, ...template.config}` merge
- Large PRs are harder to review — split into 2-3 commits (Covex reorder, CS templates, CS generator logic)
