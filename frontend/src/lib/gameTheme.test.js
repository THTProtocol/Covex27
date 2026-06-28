import { describe, it, expect } from 'vitest';
import { gameLookFromConfig, normalizeGameKey, GAME_KEYS } from './gameTheme';
import { DEFAULT_POKER_FELT, DEFAULT_POKER_CARD_BACK } from './pokerTheme';
import { DEFAULT_CONNECT4_BOARD, DEFAULT_CONNECT4_DISCS } from './connect4Theme';
import { DEFAULT_BOARD_THEME, DEFAULT_PIECE_SET } from './chessTheme';

describe('normalizeGameKey', () => {
  it('maps circuit ids, variants and loose labels to canonical keys', () => {
    expect(normalizeGameKey('chess_blitz')).toBe('chess');
    expect(normalizeGameKey('chess_v1')).toBe('chess');
    expect(normalizeGameKey('poker_6max')).toBe('poker');
    expect(normalizeGameKey('blackjack_v1')).toBe('blackjack');
    expect(normalizeGameKey('connect4_v1')).toBe('connect4');
    expect(normalizeGameKey('reversi_v1')).toBe('reversi');
    expect(normalizeGameKey('othello')).toBe('reversi');
    expect(normalizeGameKey('tictactoe_v1')).toBe('tictactoe');
    expect(normalizeGameKey('rps_v1')).toBe('rps');
    expect(normalizeGameKey('Connect Four')).toBe('connect4');
  });
  it('returns null for an unknown type', () => {
    expect(normalizeGameKey('not_a_game')).toBeNull();
    expect(normalizeGameKey('')).toBeNull();
    expect(normalizeGameKey(undefined)).toBeNull();
  });
});

describe('gameLookFromConfig resolves a saved theme', () => {
  it('reads a saved poker look from custom_ui_config.games.poker', () => {
    const covenant = { custom_ui_config: { games: { poker: { felt: 'crimson', card_back: 'royal', chips: 'gold' } } } };
    const look = gameLookFromConfig(covenant, 'poker');
    expect(look.feltId).toBe('crimson');
    expect(look.felt.surface).toBe('#5e1620');
    expect(look.cardBackId).toBe('royal');
    expect(look.chipsId).toBe('gold');
  });

  it('reads a saved connect4 look and resolves the disc colors', () => {
    const covenant = { custom_ui_config: { games: { connect4: { board: 'kaspa', discs: 'safe' } } } };
    const look = gameLookFromConfig(covenant, 'connect4_v1'); // circuit id is normalized
    expect(look.boardId).toBe('kaspa');
    expect(look.discsId).toBe('safe');
    expect(look.discs.aMid).toBe('#2f7bed'); // colorblind-safe blue
  });

  it('accepts a stringified custom_ui_config', () => {
    const covenant = { custom_ui_config: JSON.stringify({ games: { checkers: { board: 'classic', pieces: 'redblack' } } }) };
    const look = gameLookFromConfig(covenant, 'checkers');
    expect(look.boardId).toBe('classic');
    expect(look.piecesId).toBe('redblack');
  });

  it('reads the legacy chess location (custom_ui_config.chess) when games.chess is absent', () => {
    const covenant = { custom_ui_config: { chess: { board_theme: 'walnut', piece_set: 'gold' } } };
    const look = gameLookFromConfig(covenant, 'chess');
    expect(look.boardTheme).toBe('walnut');
    expect(look.pieceSet).toBe('gold');
  });

  it('prefers games.chess over the legacy chess location when both exist', () => {
    const covenant = { custom_ui_config: { chess: { board_theme: 'walnut' }, games: { chess: { board_theme: 'kaspa' } } } };
    const look = gameLookFromConfig(covenant, 'chess');
    expect(look.boardTheme).toBe('kaspa');
  });
});

describe('gameLookFromConfig falls back to defaults', () => {
  it('returns default poker look when no config is set', () => {
    const look = gameLookFromConfig({ custom_ui_config: null }, 'poker');
    expect(look.feltId).toBe(DEFAULT_POKER_FELT);
    expect(look.cardBackId).toBe(DEFAULT_POKER_CARD_BACK);
  });

  it('returns default connect4 look for a covenant with no custom_ui_config', () => {
    const look = gameLookFromConfig({}, 'connect4');
    expect(look.boardId).toBe(DEFAULT_CONNECT4_BOARD);
    expect(look.discsId).toBe(DEFAULT_CONNECT4_DISCS);
  });

  it('returns the default chess look when nothing is saved', () => {
    const look = gameLookFromConfig({ custom_ui_config: {} }, 'chess');
    expect(look.boardTheme).toBe(DEFAULT_BOARD_THEME);
    expect(look.pieceSet).toBe(DEFAULT_PIECE_SET);
  });

  it('ignores an unknown id in a saved config and falls back to the default preset', () => {
    const covenant = { custom_ui_config: { games: { poker: { felt: 'does-not-exist' } } } };
    const look = gameLookFromConfig(covenant, 'poker');
    // the raw id is preserved but resolve* returns the first (default) preset
    expect(look.felt.id).toBe(DEFAULT_POKER_FELT);
  });

  it('accepts a bare config object (not wrapped in a covenant) and resolves every game key with defaults', () => {
    for (const key of GAME_KEYS) {
      const look = gameLookFromConfig({}, key);
      expect(look).toBeTruthy();
      expect(typeof look).toBe('object');
    }
  });
});

describe('a creator choice actually changes the rendered surface color', () => {
  // For each game, a saved non-default selection resolves to a color that
  // differs from the default, so the live arena visibly reflects the choice.
  const cases = [
    ['poker', { games: { poker: { felt: 'crimson' } } }, (l) => l.felt.surface, '#5e1620'],
    ['blackjack', { games: { blackjack: { felt: 'royal' } } }, (l) => l.felt.surface, '#123a6b'],
    ['connect4', { games: { connect4: { discs: 'safe' } } }, (l) => l.discs.aMid, '#2f7bed'],
    ['checkers', { games: { checkers: { pieces: 'redblack' } } }, (l) => l.pieces.wSolid, '#d83a30'],
    ['reversi', { games: { reversi: { discs: 'royal' } } }, (l) => l.discs.aSolid, '#3e49cf'],
    ['tictactoe', { games: { tictactoe: { marks: 'safe' } } }, (l) => l.marks.x, '#2f7bed'],
    ['rps', { games: { rps: { accents: 'ocean' } } }, (l) => l.accents.scissors, '#34d399'],
    ['chess', { games: { chess: { board_theme: 'kaspa' } } }, (l) => l.board.dark, '#2f8f80'],
  ];
  it.each(cases)('%s saved theme resolves to a distinct color', (key, cfg, pick, want) => {
    const got = pick(gameLookFromConfig({ custom_ui_config: cfg }, key));
    const def = pick(gameLookFromConfig({}, key));
    expect(got).toBe(want);
    expect(got).not.toBe(def);
  });
});
