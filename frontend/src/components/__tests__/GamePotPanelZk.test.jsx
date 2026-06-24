import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// GamePotPanel reads the wallet from WalletContext and explorer URLs from lib/explorer. We mock
// both so the new on-chain ZK (KIP-16) branches render deterministically without a live wallet.
// This project's vitest config is the default node env (no jsdom), so we assert the SSR markup
// (same approach the lib tests assume for pure rendering).
let mockWallet = { address: 'kaspatest:player2', isDevMode: true, devMode: { privateKeyHex: '11'.repeat(32) } };
vi.mock('../WalletContext', () => ({
  useWallet: () => mockWallet,
}));
vi.mock('../../lib/explorer', () => ({
  explorerTxUrl: (tx) => `https://example/tx/${tx}`,
}));

import GamePotPanel from '../GamePotPanel.jsx';

const P1 = 'kaspatest:player1';
const P2 = 'kaspatest:player2';

const zkGame = (over = {}) => ({
  player1: P1,
  player2: P2,
  pot_amount_kas: 10,
  status: 'finished',
  winner: 'player2', // P2 is the connected wallet -> the winner
  pot_tx: 'pot1',
  pot_payout_tx: null,
  settle_mode: 'zk_game_settle',
  ...over,
});

const render = (props) =>
  renderToStaticMarkup(
    <GamePotPanel covenantId="cov1" gameType="chess" seatToken="seat-tok" network="testnet-12" {...props} />,
  );

beforeEach(() => {
  mockWallet = { address: 'kaspatest:player2', isDevMode: true, devMode: { privateKeyHex: '11'.repeat(32) } };
  delete import.meta.env.VITE_ZK_ONCHAIN_GAMES; // default OFF for each test
});

describe('GamePotPanel on-chain ZK mode (gated, additive) honesty + framing', () => {
  it('a winning zk pot is framed as on-chain ZK rolling out and never uses an em/en dash', () => {
    const html = render({ game: zkGame() });
    expect(html).toMatch(/on-chain ZK/i);
    expect(html).toMatch(/rolling out/i);
    expect(html).not.toContain(String.fromCharCode(0x2014)); // em dash (U+2014)
    expect(html).not.toContain(String.fromCharCode(0x2013)); // en dash (U+2013)
  });

  it('does NOT claim it is the default and does NOT say trustless on-chain consensus when the flag is off', () => {
    const html = render({ game: zkGame() });
    // With the build flag OFF there is no claim button; it honestly says the path is not available here.
    expect(html).toMatch(/not enabled in this build|not available/i);
    expect(html).not.toMatch(/Prove and claim/i);
  });

  it('with the build flag ON, offers the winner a "Prove and claim" on-chain ZK action', () => {
    import.meta.env.VITE_ZK_ONCHAIN_GAMES = '1';
    const html = render({ game: zkGame() });
    expect(html).toMatch(/Prove and claim/i);
    // honest framing: winner proves, chain verifies, no referee, no Covex key
    expect(html).toMatch(/the chain verifies the proof/i);
    expect(html).toMatch(/no Covex key/i);
  });

  it('the on-chain ZK copy attributes verification to the chain, not to Covex being on-chain/trustless', () => {
    import.meta.env.VITE_ZK_ONCHAIN_GAMES = '1';
    const html = render({ game: zkGame() });
    expect(html).toMatch(/KIP-16/);
    expect(html).toMatch(/loser cannot forge a winning proof/i);
    // must not overclaim it as the shipped/live default
    expect(html).toMatch(/rolling out|not the live default|gated/i);
  });

  it('does not affect the hashlock default: a hashlock winner still gets the plain Claim button', () => {
    const html = render({ game: { ...zkGame(), settle_mode: 'hashlock' } });
    expect(html).toMatch(/Claim 10 KAS/);
    expect(html).not.toMatch(/Prove and claim/i);
    expect(html).not.toMatch(/KIP-16/);
  });
});
