// Reversi / Othello look-and-feel presets. The creator picks the board color and
// the two disc colors ONCE; the choice persists into
// custom_ui_config.games.reversi { board, discs } and renders in both the
// builder preview and the deployed public covenant page.
//
// Visual only: nothing here touches the capture-flip rules or payouts. Unknown
// or missing ids fall back to the classic green board with black/white discs, so
// an old covenant keeps rendering exactly as before.

// Board presets. `surface` is the felt background; `line` an rgba grid emboss
// already softened by the cell shadows. `solid` is the picker swatch color.
export const REVERSI_BOARDS = [
  { id: 'classic', name: 'Casino Green', surface: 'radial-gradient(ellipse at 50% 35%, #2f7d4f 0%, #1c5435 70%, #133b25 100%)', solid: '#1f5e3a' },
  { id: 'kaspa', name: 'Kaspa Teal', surface: 'radial-gradient(ellipse at 50% 35%, #2f8f80 0%, #1d5e54 70%, #123b35 100%)', solid: '#23766a' },
  { id: 'midnight', name: 'Midnight Blue', surface: 'radial-gradient(ellipse at 50% 35%, #2c4a7a 0%, #1a3056 70%, #101f3a 100%)', solid: '#22416e' },
  { id: 'graphite', name: 'Graphite', surface: 'radial-gradient(ellipse at 50% 35%, #3b4452 0%, #262c36 70%, #161a20 100%)', solid: '#333a46' },
];

// Disc-color pairs. `a` is player 1 (server 'white' seat, plays the dark disc by
// default), `b` is player 2. Each carries the body radial-gradient, a specular
// highlight and a rim so discs keep their 3D look. The default is black/white.
export const REVERSI_DISCS = [
  {
    id: 'classic', name: 'Black / White',
    aBack: 'radial-gradient(circle at 34% 28%, #3a3a44 0%, #1a1a1a 46%, #000 100%)',
    aSpec: 'radial-gradient(circle at 36% 26%, rgba(120,150,255,0.28) 0%, rgba(120,150,255,0) 42%)',
    aRim: '#000', aSolid: '#15151a',
    bBack: 'radial-gradient(circle at 34% 28%, #ffffff 0%, #ededed 48%, #dcdcdc 100%)',
    bSpec: 'radial-gradient(circle at 36% 26%, rgba(255,244,225,0.85) 0%, rgba(255,244,225,0) 46%)',
    bRim: '#bdbdbd', bSolid: '#efefef',
  },
  {
    id: 'kaspa', name: 'Teal / Cream',
    aBack: 'radial-gradient(circle at 34% 28%, #2bb9a3 0%, #117a6b 46%, #064a40 100%)',
    aSpec: 'radial-gradient(circle at 36% 26%, rgba(180,255,240,0.5) 0%, rgba(180,255,240,0) 44%)',
    aRim: '#053d35', aSolid: '#168f7d',
    bBack: 'radial-gradient(circle at 34% 28%, #fbf3df 0%, #f0e3bf 48%, #ddcc9e 100%)',
    bSpec: 'radial-gradient(circle at 36% 26%, rgba(255,250,235,0.85) 0%, rgba(255,250,235,0) 46%)',
    bRim: '#c2b48c', bSolid: '#f1e6c6',
  },
  {
    id: 'royal', name: 'Indigo / Rose',
    aBack: 'radial-gradient(circle at 34% 28%, #6f7bff 0%, #3a44c8 46%, #1f2480 100%)',
    aSpec: 'radial-gradient(circle at 36% 26%, rgba(200,210,255,0.5) 0%, rgba(200,210,255,0) 44%)',
    aRim: '#191d6e', aSolid: '#3e49cf',
    bBack: 'radial-gradient(circle at 34% 28%, #ff9cb4 0%, #f2557a 48%, #b32f50 100%)',
    bSpec: 'radial-gradient(circle at 36% 26%, rgba(255,225,235,0.8) 0%, rgba(255,225,235,0) 46%)',
    bRim: '#8c2440', bSolid: '#f2557a',
  },
];

export const DEFAULT_REVERSI_BOARD = 'classic';
export const DEFAULT_REVERSI_DISCS = 'classic';

export function resolveReversiBoard(id) {
  return REVERSI_BOARDS.find((t) => t.id === id) || REVERSI_BOARDS[0];
}
export function resolveReversiDiscs(id) {
  return REVERSI_DISCS.find((t) => t.id === id) || REVERSI_DISCS[0];
}
