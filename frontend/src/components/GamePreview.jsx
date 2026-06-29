// Game-detection helpers for the Explorer. Explorer.jsx imports detectGameType
// and hasCustomUI from here. The interactive GamePreview modal component that
// used to live in this file was removed: it was no longer rendered anywhere
// (its sole importer pulls in just these helpers, and GameThemeConfig.jsx has
// its own unrelated local GamePreview). Only the pure detection helpers remain.

// Normalize varied game_type / name spellings into a canonical game key. The
// canonical playable-game set lives in lib/playableGames.js (PLAYABLE_GAME_KEYS).
const normalizeGameKey = (raw) => {
  if (!raw) return null;
  const g = String(raw).toLowerCase();
  if (g.includes('chess')) return 'chess';
  if (g.includes('poker')) return 'poker';
  if (g.includes('blackjack') || g === 'bj' || g === '21') return 'blackjack';
  if (g.includes('checker') || g.includes('draught')) return 'checkers';
  if (g.includes('connect4') || g.includes('connect_4') || g.includes('connect-four')) return 'connect4';
  if (g.includes('reversi') || g.includes('othello')) return 'reversi';
  if (g === 'rps' || g.includes('rock_paper') || g.includes('rock-paper') || g.includes('rockpaper')) return 'rps';
  if (g.includes('tictactoe') || g.includes('tic_tac_toe') || g.includes('tic-tac-toe') || g === 'ttt') return 'tictactoe';
  return null;
};

// Detect game type from covenant data. Returns a canonical game key, or null
// when the covenant is not a recognized game (it may still be a ZK circuit).
const detectGameType = (covenant) => {
  // Try config game_type first - this is the authoritative declaration.
  try {
    const cfg = typeof covenant.custom_ui_config === 'string'
      ? JSON.parse(covenant.custom_ui_config)
      : covenant.custom_ui_config;
    const fromCfg = normalizeGameKey(cfg?.game_type);
    if (fromCfg) return fromCfg;
  } catch { /* best-effort; failure is non-fatal here */ }

  // Fallback: name / description / category sniffing.
  const name = (covenant.name || covenant.covenant_type || '').toLowerCase();
  const desc = (covenant.description || '').toLowerCase();
  const category = (covenant.category || '').toLowerCase();
  const combined = `${name} ${desc} ${category}`;
  return normalizeGameKey(combined);
};

// Has actual custom UI HTML (from Covenant Studio / custom paste)
const hasCustomUI = (covenant) => {
  // List endpoints send a lightweight has_custom_ui flag; detail responses still
  // include the full custom_ui_html payload.
  if (covenant.has_custom_ui !== undefined) return !!covenant.has_custom_ui;
  return covenant.custom_ui_html && covenant.custom_ui_html.length > 50;
};

export { detectGameType, hasCustomUI };
