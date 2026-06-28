// Blackjack table look-and-feel presets. Same idea as pokerTheme: the creator
// picks the felt and card-back ONCE; the choice persists into
// custom_ui_config.games.blackjack { felt, card_back } and renders in both the
// builder preview and the deployed public covenant page.
//
// Visual only: nothing here touches the shoe commitment, hit/stand/double logic,
// dealer rules or payouts. Unknown or missing ids fall back to the classic Covex
// teal felt, so an old covenant keeps rendering exactly as before.

// Felt presets. `surface` is the table-felt color; `frame` is the subtle inner
// border tint (rgba) drawn around the felt.
export const BLACKJACK_FELTS = [
  { id: 'kaspa', name: 'Kaspa Teal', surface: '#0d4f48', frame: 'rgba(73,234,203,0.10)' },
  { id: 'emerald', name: 'Casino Green', surface: '#0c5a36', frame: 'rgba(120,230,170,0.12)' },
  { id: 'royal', name: 'Royal Blue', surface: '#123a6b', frame: 'rgba(150,190,255,0.12)' },
  { id: 'crimson', name: 'Crimson', surface: '#5e1620', frame: 'rgba(255,170,170,0.12)' },
  { id: 'slate', name: 'Graphite', surface: '#1f2630', frame: 'rgba(180,200,220,0.10)' },
];

// Card-back presets, shared shape with pokerTheme so the PlayingCard `back`
// prop is identical across card games.
export const BLACKJACK_CARD_BACKS = [
  { id: 'kaspa', name: 'Kaspa', back: '#0b2a26', accent: '#49EACB', frame: '#E8AF34' },
  { id: 'midnight', name: 'Midnight', back: '#101a33', accent: '#6f9bff', frame: '#c9d6ff' },
  { id: 'royal', name: 'Royal Red', back: '#2a0d12', accent: '#f2557a', frame: '#E8AF34' },
  { id: 'ink', name: 'Ink', back: '#161616', accent: '#9aa0a6', frame: '#c0c0c0' },
];

export const DEFAULT_BLACKJACK_FELT = 'kaspa';
export const DEFAULT_BLACKJACK_CARD_BACK = 'kaspa';

export function resolveBlackjackFelt(id) {
  return BLACKJACK_FELTS.find((t) => t.id === id) || BLACKJACK_FELTS[0];
}
export function resolveBlackjackCardBack(id) {
  return BLACKJACK_CARD_BACKS.find((t) => t.id === id) || BLACKJACK_CARD_BACKS[0];
}
