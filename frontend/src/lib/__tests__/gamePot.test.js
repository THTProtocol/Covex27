import { describe, it, expect } from 'vitest';
import { potState } from '../gamePot';

// Two seat addresses (the exact bytes do not matter; potState only compares strings).
const P1 = 'kaspatest:player1';
const P2 = 'kaspatest:player2';

const baseGame = (over = {}) => ({
  player1: P1,
  player2: P2,
  pot_amount_kas: 10,
  status: 'active',
  winner: null,
  pot_tx: null,
  pot_payout_tx: null,
  settle_mode: null,
  ...over,
});

describe('potState settlement-mode awareness', () => {
  it('defaults a locked pot with no settle_mode to the de-oracle hashlock path', () => {
    const st = potState(baseGame({ pot_tx: 'abc' }), P2);
    expect(st.mode).toBe('hashlock');
    expect(st.phase).toBe('locked');
  });

  it('reads settle_mode=oracle_escrow for legacy pots', () => {
    const st = potState(baseGame({ pot_tx: 'abc', settle_mode: 'oracle_escrow' }), P2);
    expect(st.mode).toBe('oracle_escrow');
  });

  it('only the funder can lock; mode is carried through', () => {
    expect(potState(baseGame(), P1).phase).toBe('lockable');
    expect(potState(baseGame(), P2).phase).toBe('unavailable');
  });
});

describe('potState winner / loser at settlement', () => {
  const finishedHashlock = baseGame({
    pot_tx: 'pot1',
    status: 'finished',
    winner: 'player2',
    settle_mode: 'hashlock',
  });

  it('the winner sees a claimable hashlock pot', () => {
    const st = potState(finishedHashlock, P2);
    expect(st.phase).toBe('claimable');
    expect(st.mode).toBe('hashlock');
    expect(st.winnerAddr).toBe(P2);
  });

  it('the loser does NOT see a claim control (settling-other)', () => {
    const st = potState(finishedHashlock, P1);
    expect(st.phase).toBe('settling-other');
  });

  it('the player1 winner is matched by side alias', () => {
    const g = baseGame({ pot_tx: 'p', status: 'finished', winner: 'white', settle_mode: 'hashlock' });
    expect(potState(g, P1).phase).toBe('claimable');
    expect(potState(g, P2).phase).toBe('settling-other');
  });
});

describe('potState refund vs frozen on an unresolved result', () => {
  it('a hashlock pot with no winner offers the FUNDER a CSV refund', () => {
    const g = baseGame({ pot_tx: 'p', status: 'finished', winner: null, settle_mode: 'hashlock' });
    expect(potState(g, P1).phase).toBe('refundable');
    // The non-funder just sees nothing actionable about a refund (frozen-style read).
    expect(potState(g, P2).phase).toBe('frozen');
  });

  it('a legacy oracle_escrow pot with no winner is frozen (no refund branch)', () => {
    const g = baseGame({ pot_tx: 'p', status: 'finished', winner: null, settle_mode: 'oracle_escrow' });
    expect(potState(g, P1).phase).toBe('frozen');
    expect(potState(g, P2).phase).toBe('frozen');
  });
});

describe('potState terminal + empty', () => {
  it('a paid pot is terminal', () => {
    const st = potState(baseGame({ pot_tx: 'p', pot_payout_tx: 'pay', status: 'finished', winner: 'player2' }), P2);
    expect(st.phase).toBe('paid');
    expect(st.payoutTx).toBe('pay');
  });

  it('a missing game is unavailable', () => {
    expect(potState(null, P1).phase).toBe('unavailable');
  });
});
