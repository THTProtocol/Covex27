// Mark-color presets for the two icon-driven arenas: Tic-Tac-Toe (X / O) and
// Rock Paper Scissors (the three hand accents). These games have no board or
// felt, so the creator-customizable surface is the mark / accent palette.
//
// Persisted into custom_ui_config.games.tictactoe { marks } and
// custom_ui_config.games.rps { accents }. Visual only: never touches win
// detection or the best-of-3 logic. Missing ids fall back to the originals.

// Tic-Tac-Toe X / O color pairs. `x` is player 1, `o` is player 2.
export const TTT_MARKS = [
  { id: 'classic', name: 'Teal / Gold', x: '#49EACB', o: '#E8AF34' },
  { id: 'safe', name: 'Blue / Orange (colorblind-safe)', x: '#2f7bed', o: '#f59e0b' },
  { id: 'royal', name: 'Indigo / Rose', x: '#6f7bff', o: '#f2557a' },
  { id: 'mono', name: 'Cream / Slate', x: '#e7d8b4', o: '#94a3b8' },
];

// Rock Paper Scissors accent triples (rock / paper / scissors glow colors).
export const RPS_ACCENTS = [
  { id: 'classic', name: 'Teal / Gold / Rose', rock: '#49EACB', paper: '#E8AF34', scissors: '#F2557A' },
  { id: 'safe', name: 'Blue / Orange / Slate (colorblind-safe)', rock: '#2f7bed', paper: '#f59e0b', scissors: '#94a3b8' },
  { id: 'sunset', name: 'Sunset', rock: '#ffae57', paper: '#f2557a', scissors: '#a855f7' },
  { id: 'ocean', name: 'Ocean', rock: '#49EACB', paper: '#6f9bff', scissors: '#34d399' },
];

export const DEFAULT_TTT_MARKS = 'classic';
export const DEFAULT_RPS_ACCENTS = 'classic';

export function resolveTttMarks(id) {
  return TTT_MARKS.find((t) => t.id === id) || TTT_MARKS[0];
}
export function resolveRpsAccents(id) {
  return RPS_ACCENTS.find((t) => t.id === id) || RPS_ACCENTS[0];
}
