// Connect Four look-and-feel presets. The creator picks the board color and the
// two disc colors ONCE; the choice persists into
// custom_ui_config.games.connect4 { board, discs } and renders in both the
// builder preview and the deployed public covenant page.
//
// Visual only: nothing here touches gravity, the 4-in-a-row detection or
// payouts. Unknown or missing ids fall back to the classic blue board with
// red/yellow discs, so an old covenant keeps rendering exactly as before.

// Board presets. `top`/`bottom` are the vertical board-gradient stops; `hole` is
// the empty-slot color; `glow` an rgba accent for the grounding shadow.
export const CONNECT4_BOARDS = [
  { id: 'classic', name: 'Classic Blue', top: '#2563eb', bottom: '#1e3a8a', hole: '#0b1530', holeHover: '#13235a', glow: 'rgba(29,78,216,0.5)' },
  { id: 'kaspa', name: 'Kaspa Teal', top: '#13a094', bottom: '#0c5249', hole: '#06201d', holeHover: '#0a322c', glow: 'rgba(20,160,148,0.5)' },
  { id: 'graphite', name: 'Graphite', top: '#3b4452', bottom: '#1c2128', hole: '#0a0d12', holeHover: '#161b22', glow: 'rgba(90,104,122,0.45)' },
  { id: 'plum', name: 'Plum', top: '#6d28d9', bottom: '#3b1075', hole: '#160827', holeHover: '#241040', glow: 'rgba(109,40,217,0.5)' },
];

// Disc-color pairs. `a` is player 1 (drops first), `b` is player 2. `*Mid` and
// `*Deep` give the radial body so discs keep their moulded look. The default
// red/yellow pair is the original. A colorblind-safe blue/orange pair is offered.
export const CONNECT4_DISCS = [
  {
    id: 'classic', name: 'Red / Yellow',
    aHi: '#ff7a6b', aMid: '#ef4444', aDeep: '#b91c1c', aRim: 'rgba(255,160,150,0.45)',
    bHi: '#fde68a', bMid: '#facc15', bDeep: '#ca8a04', bRim: 'rgba(255,235,150,0.5)',
  },
  {
    id: 'safe', name: 'Blue / Orange (colorblind-safe)',
    aHi: '#7fb4ff', aMid: '#2f7bed', aDeep: '#1d4ed8', aRim: 'rgba(150,190,255,0.5)',
    bHi: '#ffc46b', bMid: '#f59e0b', bDeep: '#b45309', bRim: 'rgba(255,205,140,0.5)',
  },
  {
    id: 'kaspa', name: 'Teal / Gold',
    aHi: '#7af0dd', aMid: '#2bb9a3', aDeep: '#0f7a6b', aRim: 'rgba(140,240,220,0.5)',
    bHi: '#f4d98a', bMid: '#E8AF34', bDeep: '#9c6f12', bRim: 'rgba(244,217,138,0.5)',
  },
  {
    id: 'mono', name: 'Slate / Cream',
    aHi: '#cfd6e0', aMid: '#94a3b8', aDeep: '#475569', aRim: 'rgba(207,214,224,0.5)',
    bHi: '#fbf3df', bMid: '#e7d8b4', bDeep: '#b8a479', bRim: 'rgba(251,243,223,0.5)',
  },
];

export const DEFAULT_CONNECT4_BOARD = 'classic';
export const DEFAULT_CONNECT4_DISCS = 'classic';

export function resolveConnect4Board(id) {
  return CONNECT4_BOARDS.find((t) => t.id === id) || CONNECT4_BOARDS[0];
}
export function resolveConnect4Discs(id) {
  return CONNECT4_DISCS.find((t) => t.id === id) || CONNECT4_DISCS[0];
}
