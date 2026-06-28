// Checkers look-and-feel presets. The creator picks the board light/dark squares
// and the two piece colors ONCE; the choice persists into
// custom_ui_config.games.checkers { board, pieces } and renders in both the
// builder preview and the deployed public covenant page.
//
// Visual only: nothing here touches forced jumps, king promotion or payouts.
// Unknown or missing ids fall back to the classic wood board with cream/charcoal
// pieces, so an old covenant keeps rendering exactly as before.

// Board presets. `dark`/`light` are the two square gradients (full CSS background
// values so wood grain stays). `darkSolid`/`lightSolid` give a flat swatch color
// for the picker chips.
export const CHECKERS_BOARDS = [
  {
    id: 'walnut', name: 'Walnut',
    dark: 'repeating-linear-gradient(115deg, rgba(0,0,0,0.18) 0 3px, rgba(255,255,255,0.025) 3px 7px), linear-gradient(160deg, #6b4226 0%, #4f2f17 100%)',
    light: 'linear-gradient(160deg, #ead2a8 0%, #d9bd8a 100%)',
    darkSolid: '#5a371f', lightSolid: '#e2c79b',
  },
  {
    id: 'classic', name: 'Tournament Green',
    dark: 'linear-gradient(160deg, #4a7a4a 0%, #356135 100%)',
    light: 'linear-gradient(160deg, #f0ead0 0%, #e3dabb 100%)',
    darkSolid: '#3f6e3f', lightSolid: '#ece4c8',
  },
  {
    id: 'kaspa', name: 'Kaspa Teal',
    dark: 'linear-gradient(160deg, #2f8f80 0%, #1d5e54 100%)',
    light: 'linear-gradient(160deg, #d9f5ef 0%, #bfe8e0 100%)',
    darkSolid: '#277567', lightSolid: '#cdeee7',
  },
  {
    id: 'slate', name: 'Slate',
    dark: 'linear-gradient(160deg, #5b6471 0%, #3a4250 100%)',
    light: 'linear-gradient(160deg, #e8eaed 0%, #d4d8de 100%)',
    darkSolid: '#4a5360', lightSolid: '#dee1e6',
  },
];

// Piece-color pairs. `w` is the white/light army, `b` is the dark army. Each is
// the body radial-gradient + rim + top-face gradient so the moulded look stays.
export const CHECKERS_PIECES = [
  {
    id: 'classic', name: 'Cream / Charcoal',
    wBase: 'radial-gradient(circle at 38% 32%, #f5f0e6 0%, #e3d8c2 48%, #cbbfa6 100%)',
    wTop: 'radial-gradient(circle at 42% 34%, #fbf7ee 0%, #ddd0b6 100%)',
    wRim: 'rgba(60,48,28,0.55)', wSolid: '#ece1c8',
    bBase: 'radial-gradient(circle at 38% 32%, #3a3a40 0%, #1c1c20 48%, #0a0a0c 100%)',
    bTop: 'radial-gradient(circle at 42% 34%, #34343a 0%, #121216 100%)',
    bRim: 'rgba(0,0,0,0.7)', bSolid: '#222226',
  },
  {
    id: 'redblack', name: 'Red / Black',
    wBase: 'radial-gradient(circle at 38% 32%, #ff7d6e 0%, #e23b32 48%, #a51f1a 100%)',
    wTop: 'radial-gradient(circle at 42% 34%, #ff9385 0%, #d8443c 100%)',
    wRim: 'rgba(90,20,16,0.6)', wSolid: '#d83a30',
    bBase: 'radial-gradient(circle at 38% 32%, #3a3a40 0%, #1c1c20 48%, #0a0a0c 100%)',
    bTop: 'radial-gradient(circle at 42% 34%, #34343a 0%, #121216 100%)',
    bRim: 'rgba(0,0,0,0.7)', bSolid: '#222226',
  },
  {
    id: 'kaspa', name: 'Teal / Gold',
    wBase: 'radial-gradient(circle at 38% 32%, #7af0dd 0%, #2bb9a3 48%, #0f7a6b 100%)',
    wTop: 'radial-gradient(circle at 42% 34%, #9af6e7 0%, #38c8b1 100%)',
    wRim: 'rgba(10,70,62,0.6)', wSolid: '#2bb9a3',
    bBase: 'radial-gradient(circle at 38% 32%, #f4d98a 0%, #E8AF34 48%, #9c6f12 100%)',
    bTop: 'radial-gradient(circle at 42% 34%, #f8e6ad 0%, #dda52c 100%)',
    bRim: 'rgba(70,50,8,0.6)', bSolid: '#E8AF34',
  },
];

export const DEFAULT_CHECKERS_BOARD = 'walnut';
export const DEFAULT_CHECKERS_PIECES = 'classic';

export function resolveCheckersBoard(id) {
  return CHECKERS_BOARDS.find((t) => t.id === id) || CHECKERS_BOARDS[0];
}
export function resolveCheckersPieces(id) {
  return CHECKERS_PIECES.find((t) => t.id === id) || CHECKERS_PIECES[0];
}
