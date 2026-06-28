// Unified per-covenant game appearance resolver.
//
// A covenant creator picks how their game arena LOOKS (chess board + pieces,
// poker felt + card back + chips, blackjack felt + card back, connect4 board +
// discs, checkers board + pieces, reversi board + discs, tictactoe marks, rps
// accents). The selection is saved into the covenant's custom_ui_config under a
// single `games` object keyed by the canonical arena key:
//
//   custom_ui_config.games.poker     = { felt, card_back, chips }
//   custom_ui_config.games.chess     = { board_theme, piece_set }
//   ...one entry per game type...
//
// Backward-compat: the original chess look lived at custom_ui_config.chess (no
// `games` wrapper). We still read it, and prefer games.chess when both exist, so
// covenants deployed before this change keep their saved chess look and never
// regress visually.
//
// Visual only: nothing here resolves logic, clocks, payouts or enforcement. Every
// resolver falls back to the exact original colors when no config is present, so
// existing covenants render identically to before by default.

import {
  resolveBoardTheme as resolveChessBoard,
  resolvePieceSet as resolveChessPieces,
  DEFAULT_BOARD_THEME as DEF_CHESS_BOARD,
  DEFAULT_PIECE_SET as DEF_CHESS_PIECES,
} from './chessTheme';
import {
  resolvePokerFelt, resolvePokerCardBack, resolvePokerChips,
  DEFAULT_POKER_FELT, DEFAULT_POKER_CARD_BACK, DEFAULT_POKER_CHIPS,
} from './pokerTheme';
import {
  resolveBlackjackFelt, resolveBlackjackCardBack,
  DEFAULT_BLACKJACK_FELT, DEFAULT_BLACKJACK_CARD_BACK,
} from './blackjackTheme';
import {
  resolveConnect4Board, resolveConnect4Discs,
  DEFAULT_CONNECT4_BOARD, DEFAULT_CONNECT4_DISCS,
} from './connect4Theme';
import {
  resolveCheckersBoard, resolveCheckersPieces,
  DEFAULT_CHECKERS_BOARD, DEFAULT_CHECKERS_PIECES,
} from './checkersTheme';
import {
  resolveReversiBoard, resolveReversiDiscs,
  DEFAULT_REVERSI_BOARD, DEFAULT_REVERSI_DISCS,
} from './reversiTheme';
import {
  resolveTttMarks, resolveRpsAccents,
  DEFAULT_TTT_MARKS, DEFAULT_RPS_ACCENTS,
} from './markGameTheme';

// Canonical arena keys (mirror PLAYABLE_GAME_KEYS / GAME_REGISTRY).
export const GAME_KEYS = ['chess', 'poker', 'blackjack', 'connect4', 'checkers', 'reversi', 'tictactoe', 'rps'];

// Normalize any game_type / circuit id / loose label to a canonical arena key.
// Accepts 'chess', 'chess_blitz', 'chess_v1', 'poker_6max', 'reversi_v1',
// 'othello', 'connect four', etc. Returns null when nothing matches.
export function normalizeGameKey(input) {
  const s = String(input || '').toLowerCase();
  if (!s) return null;
  if (/chess/.test(s)) return 'chess';
  if (/poker|hold.?em/.test(s)) return 'poker';
  if (/blackjack|black.?jack/.test(s)) return 'blackjack';
  if (/connect.?4|connect.?four/.test(s)) return 'connect4';
  if (/checkers|draughts/.test(s)) return 'checkers';
  if (/reversi|othello/.test(s)) return 'reversi';
  if (/tic.?tac.?toe|tictactoe/.test(s)) return 'tictactoe';
  // `rps` may stand alone or carry a variant suffix like rps_v1 / rps-bo3.
  if (/rock.?paper|(^|[^a-z])rps([^a-z]|$)/.test(s)) return 'rps';
  return null;
}

// Parse custom_ui_config (string or object) and return the per-game raw config
// object stored at games.<key>, with the chess legacy-location fallback. Returns
// {} when nothing is saved so callers always get an object.
function rawGameConfig(config, key) {
  let cfg = config;
  if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = null; } }
  if (!cfg || typeof cfg !== 'object') return {};
  const games = (cfg.games && typeof cfg.games === 'object') ? cfg.games : {};
  const fromGames = (games[key] && typeof games[key] === 'object') ? games[key] : null;
  if (fromGames) return fromGames;
  // Legacy chess look lived directly at custom_ui_config.chess.
  if (key === 'chess' && cfg.chess && typeof cfg.chess === 'object') return cfg.chess;
  return {};
}

// Per-game resolvers. Each returns a fully-resolved look (ids + resolved presets)
// with safe defaults, so an arena can spread the result straight into props.
function resolveChessLook(g) {
  const boardTheme = g.board_theme || DEF_CHESS_BOARD;
  const pieceSet = g.piece_set || DEF_CHESS_PIECES;
  return { boardTheme, pieceSet, board: resolveChessBoard(boardTheme), pieces: resolveChessPieces(pieceSet) };
}
function resolvePokerLook(g) {
  const feltId = g.felt || DEFAULT_POKER_FELT;
  const cardBackId = g.card_back || DEFAULT_POKER_CARD_BACK;
  const chipsId = g.chips || DEFAULT_POKER_CHIPS;
  return { feltId, cardBackId, chipsId, felt: resolvePokerFelt(feltId), cardBack: resolvePokerCardBack(cardBackId), chips: resolvePokerChips(chipsId) };
}
function resolveBlackjackLook(g) {
  const feltId = g.felt || DEFAULT_BLACKJACK_FELT;
  const cardBackId = g.card_back || DEFAULT_BLACKJACK_CARD_BACK;
  return { feltId, cardBackId, felt: resolveBlackjackFelt(feltId), cardBack: resolveBlackjackCardBack(cardBackId) };
}
function resolveConnect4Look(g) {
  const boardId = g.board || DEFAULT_CONNECT4_BOARD;
  const discsId = g.discs || DEFAULT_CONNECT4_DISCS;
  return { boardId, discsId, board: resolveConnect4Board(boardId), discs: resolveConnect4Discs(discsId) };
}
function resolveCheckersLook(g) {
  const boardId = g.board || DEFAULT_CHECKERS_BOARD;
  const piecesId = g.pieces || DEFAULT_CHECKERS_PIECES;
  return { boardId, piecesId, board: resolveCheckersBoard(boardId), pieces: resolveCheckersPieces(piecesId) };
}
function resolveReversiLook(g) {
  const boardId = g.board || DEFAULT_REVERSI_BOARD;
  const discsId = g.discs || DEFAULT_REVERSI_DISCS;
  return { boardId, discsId, board: resolveReversiBoard(boardId), discs: resolveReversiDiscs(discsId) };
}
function resolveTttLook(g) {
  const marksId = g.marks || DEFAULT_TTT_MARKS;
  return { marksId, marks: resolveTttMarks(marksId) };
}
function resolveRpsLook(g) {
  const accentsId = g.accents || DEFAULT_RPS_ACCENTS;
  return { accentsId, accents: resolveRpsAccents(accentsId) };
}

const RESOLVERS = {
  chess: resolveChessLook,
  poker: resolvePokerLook,
  blackjack: resolveBlackjackLook,
  connect4: resolveConnect4Look,
  checkers: resolveCheckersLook,
  reversi: resolveReversiLook,
  tictactoe: resolveTttLook,
  rps: resolveRpsLook,
};

// Resolve the per-game look from a covenant (or a bare custom_ui_config) for a
// given game type. `gameType` may be a canonical key or any circuit id / label;
// it is normalized. Returns the resolved look object for that game, or the chess
// look as a harmless default when the type does not match a known game.
//
// Accepts either a covenant ({ custom_ui_config }) or the config object/string
// directly, so callers can pass whichever they hold.
export function gameLookFromConfig(covenantOrConfig, gameType) {
  const config = (covenantOrConfig && typeof covenantOrConfig === 'object' && 'custom_ui_config' in covenantOrConfig)
    ? covenantOrConfig.custom_ui_config
    : covenantOrConfig;
  const key = normalizeGameKey(gameType) || 'chess';
  const resolver = RESOLVERS[key] || RESOLVERS.chess;
  return resolver(rawGameConfig(config, key));
}
