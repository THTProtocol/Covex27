// ── Playable games: the single source of truth ────────────────────────────────
// These are the games that have a real FullScreen arena you can actually play -
// the headline set the "Create a game" catalog leads with. Everything else under
// category 'game' in the circuit catalog is a technical/proof variant (chess_blitz,
// poker_hand_rank, the property/VRF proofs, the board games with no arena yet) and
// is demoted behind an "Advanced game circuits" expander.
//
// Each entry maps a GAME_REGISTRY key (the short arena key used by
// CovenantInteractive's GAME_REGISTRY + GamePreview's KNOWN_GAMES) to the
// representative catalog circuit id (the `_v1` builder entry in ZK_CIRCUIT_TYPES).
// Both ends are validated against this list in dev so the playable set, the arena
// registry, and the catalog headline cards can never silently drift apart.
//
// Note chess has no `chess_v1` circuit (it was removed); the canonical builder
// entry for chess is `chess_blitz`, which the arena resolves to the `chess` arena
// via the name/description regex in CovenantInteractive.gameType.
export const PLAYABLE_GAMES = [
  { key: 'chess',     circuit: 'chess_blitz',  label: 'Chess' },
  { key: 'poker',     circuit: 'poker_v1',     label: 'Poker' },
  { key: 'blackjack', circuit: 'blackjack_v1', label: 'Blackjack' },
  { key: 'checkers',  circuit: 'checkers_v1',  label: 'Checkers' },
  { key: 'connect4',  circuit: 'connect4_v1',  label: 'Connect Four' },
  { key: 'reversi',   circuit: 'reversi_v1',   label: 'Reversi' },
  { key: 'tictactoe', circuit: 'tictactoe_v1', label: 'Tic-Tac-Toe' },
  { key: 'rps',       circuit: 'rps_v1',       label: 'Rock Paper Scissors' },
];

// The short arena keys (chess, poker, ...). GAME_REGISTRY in CovenantInteractive
// must cover exactly this set; GamePreview's KNOWN_GAMES mirrors it.
export const PLAYABLE_GAME_KEYS = PLAYABLE_GAMES.map((g) => g.key);

// The catalog circuit ids that lead the "Create a game" view (the cards shown
// first, above the "Advanced game circuits" expander).
export const HEADLINE_GAME_CIRCUITS = PLAYABLE_GAMES.map((g) => g.circuit);
export const HEADLINE_GAME_CIRCUIT_SET = new Set(HEADLINE_GAME_CIRCUITS);

// Dev-only drift guard: confirm a runtime registry (object keyed by arena key)
// covers exactly the playable set. Returns true when in sync; logs and returns
// false otherwise. No-op in production builds.
export function assertGamesInSync(registryKeys, label = 'game registry') {
  if (import.meta.env && import.meta.env.PROD) return true;
  const want = new Set(PLAYABLE_GAME_KEYS);
  const have = new Set(registryKeys);
  const missing = [...want].filter((k) => !have.has(k));
  const extra = [...have].filter((k) => !want.has(k));
  if (missing.length || extra.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[playableGames] ${label} drifted from PLAYABLE_GAMES.` +
        (missing.length ? ` Missing: ${missing.join(', ')}.` : '') +
        (extra.length ? ` Extra: ${extra.join(', ')}.` : '')
    );
    return false;
  }
  return true;
}
