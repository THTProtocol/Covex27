// Shared chess look-and-feel presets so a covenant creator can pick a board
// theme and piece set ONCE and have the SAME choice render in (a) the Sandbox
// configure-and-preview surface and (b) the deployed public covenant page.
//
// Visual only: nothing here touches move encodings, the FIDE engine, clocks, or
// payouts. The chosen ids are persisted into custom_ui_config.chess (board +
// pieces) and resolved back to colors/glyphs through the helpers below. Unknown
// or missing ids fall back to the classic chess.com defaults, so an old covenant
// without a chess theme keeps rendering exactly as before.

// Board square color presets. Each is { id, name, light, dark }.
export const BOARD_THEMES = [
  { id: 'classic', name: 'Classic Green', light: '#eeeed2', dark: '#769656' },
  { id: 'walnut', name: 'Walnut', light: '#f0d9b5', dark: '#b58863' },
  { id: 'kaspa', name: 'Kaspa Teal', light: '#d9f5ef', dark: '#2f8f80' },
  { id: 'midnight', name: 'Midnight Blue', light: '#dbe6f2', dark: '#4b6584' },
  { id: 'slate', name: 'Slate', light: '#e8eaed', dark: '#6b7280' },
  { id: 'rose', name: 'Tournament Rose', light: '#f3dcdc', dark: '#a05a6a' },
];

// Piece sets. Each maps the 12 piece codes to a glyph and gives the fill colors
// used for the light (white) and dark (black) armies. We ship two Unicode sets
// (solid figurine and outline) that need no external assets, so they render
// identically in the preview and on the live page with zero network cost.
const SOLID = { r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', p: '♟', R: '♜', N: '♞', B: '♝', Q: '♛', K: '♚', P: '♟' };
const OUTLINE = { r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', p: '♟', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔', P: '♙' };

export const PIECE_SETS = [
  { id: 'classic', name: 'Classic', glyphs: OUTLINE, whiteFill: '#f8f8f8', blackFill: '#111111' },
  { id: 'solid', name: 'Solid Figurine', glyphs: SOLID, whiteFill: '#fafafa', blackFill: '#1a1a1a' },
  { id: 'mono-teal', name: 'Kaspa Mono', glyphs: SOLID, whiteFill: '#eafff9', blackFill: '#0f4e46' },
  { id: 'gold', name: 'Gold & Ink', glyphs: OUTLINE, whiteFill: '#f4e3b0', blackFill: '#16202b' },
];

export const DEFAULT_BOARD_THEME = 'classic';
export const DEFAULT_PIECE_SET = 'classic';

export function resolveBoardTheme(id) {
  return BOARD_THEMES.find((t) => t.id === id) || BOARD_THEMES[0];
}

export function resolvePieceSet(id) {
  return PIECE_SETS.find((p) => p.id === id) || PIECE_SETS[0];
}

// Pull a chess look out of a covenant's custom_ui_config (string or object).
// Returns { board, pieces, boardTheme, pieceSet } with safe fallbacks so any
// caller can render without guarding for shape. `boardTheme`/`pieceSet` are the
// raw ids (for persisting back); `board`/`pieces` are the resolved presets.
export function chessLookFromConfig(config) {
  let cfg = config;
  if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = null; } }
  const chess = (cfg && typeof cfg === 'object' && cfg.chess) || {};
  const boardTheme = chess.board_theme || DEFAULT_BOARD_THEME;
  const pieceSet = chess.piece_set || DEFAULT_PIECE_SET;
  return {
    boardTheme,
    pieceSet,
    board: resolveBoardTheme(boardTheme),
    pieces: resolvePieceSet(pieceSet),
  };
}
