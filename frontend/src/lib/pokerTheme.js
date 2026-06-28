// Poker table look-and-feel presets so a covenant creator can pick how their
// poker table renders ONCE and have the same choice show in the builder preview
// and on the deployed public covenant page.
//
// Visual only: nothing here touches the deal commitment, hand ranking, pot math,
// clocks or payouts. The chosen ids are persisted into
// custom_ui_config.games.poker { felt, card_back, chips } and resolved back to
// colors through the helpers below. Unknown or missing ids fall back to the
// classic Covex teal felt, so an old covenant keeps rendering exactly as before.

// Felt color presets. `surface` is the radial table-felt color, `rail` the inner
// rail ring tint (rgba), `line` the betting-line arc color.
export const POKER_FELTS = [
  { id: 'kaspa', name: 'Kaspa Teal', surface: '#0d4f48', rail: 'rgba(15,94,84,0.55)', line: 'rgba(73,234,203,0.14)' },
  { id: 'emerald', name: 'Casino Green', surface: '#0c5a36', rail: 'rgba(16,94,58,0.55)', line: 'rgba(120,230,170,0.16)' },
  { id: 'royal', name: 'Royal Blue', surface: '#123a6b', rail: 'rgba(20,55,110,0.6)', line: 'rgba(150,190,255,0.16)' },
  { id: 'crimson', name: 'Crimson', surface: '#5e1620', rail: 'rgba(120,30,40,0.55)', line: 'rgba(255,170,170,0.16)' },
  { id: 'slate', name: 'Graphite', surface: '#1f2630', rail: 'rgba(60,72,86,0.6)', line: 'rgba(180,200,220,0.14)' },
];

// Card-back presets. `back` is the deepest gradient color, `accent` the DAG mark
// + inner-frame color. Tuned to read clearly in both light and dark chrome.
export const POKER_CARD_BACKS = [
  { id: 'kaspa', name: 'Kaspa', back: '#0b2a26', accent: '#49EACB', frame: '#E8AF34' },
  { id: 'midnight', name: 'Midnight', back: '#101a33', accent: '#6f9bff', frame: '#c9d6ff' },
  { id: 'royal', name: 'Royal Red', back: '#2a0d12', accent: '#f2557a', frame: '#E8AF34' },
  { id: 'ink', name: 'Ink', back: '#161616', accent: '#9aa0a6', frame: '#c0c0c0' },
];

// Chip primary color sets (the dominant chip body color). The shared ChipStack
// component derives its denominations; this picks the headline accent.
export const POKER_CHIPS = [
  { id: 'classic', name: 'Classic', primary: '#49EACB' },
  { id: 'gold', name: 'Gold', primary: '#E8AF34' },
  { id: 'royal', name: 'Royal', primary: '#6f9bff' },
  { id: 'rose', name: 'Rose', primary: '#f2557a' },
];

export const DEFAULT_POKER_FELT = 'kaspa';
export const DEFAULT_POKER_CARD_BACK = 'kaspa';
export const DEFAULT_POKER_CHIPS = 'classic';

export function resolvePokerFelt(id) {
  return POKER_FELTS.find((t) => t.id === id) || POKER_FELTS[0];
}
export function resolvePokerCardBack(id) {
  return POKER_CARD_BACKS.find((t) => t.id === id) || POKER_CARD_BACKS[0];
}
export function resolvePokerChips(id) {
  return POKER_CHIPS.find((t) => t.id === id) || POKER_CHIPS[0];
}
