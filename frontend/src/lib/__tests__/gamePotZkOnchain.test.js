import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import {
  potState,
  isZkGameSettle,
  zkOnchainGamesEnabled,
  fetchZkSettlement,
  settlePotZkOnchain,
} from '../gamePot';

// These pin the ADDITIVE on-chain ZK (KIP-16) games settlement path. They must not change the
// behaviour of the live default (referee hashlock); the existing gamePot.test.js still guards that.
//
// The path is double-gated: the build flag (VITE_ZK_ONCHAIN_GAMES, read via zkOnchainGamesEnabled)
// AND the per-pot game.settle_mode === 'zk_game_settle'. Both must hold before any claim is offered.

const P1 = 'kaspatest:player1';
const P2 = 'kaspatest:player2';
const KEY = '11'.repeat(32);          // an in-browser private key (hex)
const SIG = 'bb'.repeat(64);

const zkGame = (over = {}) => ({
  player1: P1,
  player2: P2,
  pot_amount_kas: 10,
  status: 'active',
  winner: null,
  pot_tx: null,
  pot_payout_tx: null,
  settle_mode: 'zk_game_settle',
  ...over,
});

// Build a fetch mock returning queued JSON responses in order and recording calls.
function mockFetch(responses) {
  const calls = [];
  const impl = vi.fn(async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { json: async () => next };
  });
  return { impl, calls };
}

describe('potState: zk_game_settle mode awareness (does not disturb hashlock default)', () => {
  it('reads settle_mode=zk_game_settle as the on-chain ZK mode', () => {
    const st = potState(zkGame({ pot_tx: 'abc' }), P2);
    expect(st.mode).toBe('zk_game_settle');
    expect(st.phase).toBe('locked');
  });

  it('a pot with NO settle_mode still defaults to hashlock (live default untouched)', () => {
    const st = potState({ ...zkGame(), settle_mode: null, pot_tx: 'abc' }, P2);
    expect(st.mode).toBe('hashlock');
  });

  it('the zk-pot winner sees a claimable pot; the loser sees settling-other', () => {
    const finished = zkGame({ pot_tx: 'p', status: 'finished', winner: 'player2' });
    expect(potState(finished, P2).phase).toBe('claimable');
    expect(potState(finished, P1).phase).toBe('settling-other');
  });

  it('an unresolved zk pot offers the FUNDER a timelock refund (it has a CSV refund branch)', () => {
    const g = zkGame({ pot_tx: 'p', status: 'finished', winner: null });
    expect(potState(g, P1).phase).toBe('refundable');
    expect(potState(g, P2).phase).toBe('frozen');
  });
});

describe('isZkGameSettle', () => {
  it('is true only for settle_mode === zk_game_settle', () => {
    expect(isZkGameSettle(zkGame())).toBe(true);
    expect(isZkGameSettle({ settle_mode: 'hashlock' })).toBe(false);
    expect(isZkGameSettle({ settle_mode: 'oracle_escrow' })).toBe(false);
    expect(isZkGameSettle(null)).toBe(false);
  });
});

describe('zkOnchainGamesEnabled build flag', () => {
  const orig = import.meta.env.VITE_ZK_ONCHAIN_GAMES;
  afterEach(() => { import.meta.env.VITE_ZK_ONCHAIN_GAMES = orig; });

  it('defaults OFF (unset env -> false)', () => {
    delete import.meta.env.VITE_ZK_ONCHAIN_GAMES;
    expect(zkOnchainGamesEnabled()).toBe(false);
  });

  it('turns on for "1" / "true"', () => {
    import.meta.env.VITE_ZK_ONCHAIN_GAMES = '1';
    expect(zkOnchainGamesEnabled()).toBe(true);
    import.meta.env.VITE_ZK_ONCHAIN_GAMES = 'true';
    expect(zkOnchainGamesEnabled()).toBe(true);
  });

  it('stays off for any other value', () => {
    import.meta.env.VITE_ZK_ONCHAIN_GAMES = '0';
    expect(zkOnchainGamesEnabled()).toBe(false);
    import.meta.env.VITE_ZK_ONCHAIN_GAMES = 'no';
    expect(zkOnchainGamesEnabled()).toBe(false);
  });
});

describe('settlePotZkOnchain (gated, stubbed pending the backend settle endpoint)', () => {
  let origFetch;
  let origFlag;
  beforeEach(() => {
    origFetch = global.fetch;
    origFlag = import.meta.env.VITE_ZK_ONCHAIN_GAMES;
  });
  afterEach(() => {
    global.fetch = origFetch;
    import.meta.env.VITE_ZK_ONCHAIN_GAMES = origFlag;
  });

  it('fails closed when the build flag is OFF (never touches the network)', async () => {
    delete import.meta.env.VITE_ZK_ONCHAIN_GAMES;
    const { impl, calls } = mockFetch([]);
    global.fetch = impl;
    await expect(
      settlePotZkOnchain({ covenantId: 'cov1', token: 'tok', privKeyHex: KEY }),
    ).rejects.toThrow(/not enabled in this build|rolling out/i);
    expect(calls).toHaveLength(0);
  });

  it('drives proving -> building -> signing -> broadcast -> paid against the documented shape', async () => {
    import.meta.env.VITE_ZK_ONCHAIN_GAMES = '1';
    // Derive the x-only the flow will assert against so the signer guard passes.
    // (settlePotZkOnchain compares getPublicKey(privKeyHex) to bundle.signer_xonly.)
    const signerXonly = bytesToHex(schnorr.getPublicKey(KEY));
    const sighash = 'aa'.repeat(32);
    const { impl, calls } = mockFetch([
      // settle-zk: the off-device proof + journal + unsigned spend material
      {
        success: true,
        proof_hex: 'deadbeef',
        public_inputs: ['00'.repeat(32), '01'.repeat(32), '02'.repeat(32), '03'.repeat(32), '04'.repeat(32)],
        winner_pubkey: signerXonly,
        covenant_id: 'cov1',
        signer_xonly: signerXonly,
        sighash,
        session_id: 'zk-sess-1',
      },
      // covenant/p2sh/submit-signed: broadcast
      { success: true, spend_tx_id: 'zk_payout_tx' },
    ]);
    global.fetch = impl;

    const steps = [];
    const out = await settlePotZkOnchain({
      covenantId: 'cov1',
      token: 'tok',
      privKeyHex: KEY,
      onStatus: (s) => steps.push(s),
    });

    expect(steps).toEqual(['proving', 'building', 'signing', 'broadcast', 'paid']);
    expect(calls[0].url).toBe('/api/games/cov1/settle-zk');
    expect(calls[0].body).toEqual({ token: 'tok' });
    expect(calls[1].url).toBe('/api/covenant/p2sh/submit-signed');
    // the proof is carried into the winner-branch satisfier so the chain re-verifies it on-chain via
    // OpZkPrecompile. The 5 public inputs are BAKED in the lock script (not witness-supplied), so the
    // submit body carries only proof_hex - the exact field the backend submit-signed handler reads.
    expect(calls[1].body.proof_hex).toBe('deadbeef');
    expect(calls[1].body.zk_proof_hex).toBeUndefined();
    expect(calls[1].body.session_id).toBe('zk-sess-1');
    expect(typeof calls[1].body.signature_hex).toBe('string');
    expect(out.onchain_zk).toBe(true);
    expect(out.spend_tx_id).toBe('zk_payout_tx');
  });

  it('surfaces an honest "rolling out" message when the settle-zk route is not live', async () => {
    import.meta.env.VITE_ZK_ONCHAIN_GAMES = '1';
    const { impl } = mockFetch([{ success: false }]); // no route yet -> default not-available message
    global.fetch = impl;
    await expect(
      settlePotZkOnchain({ covenantId: 'cov1', token: 'tok', privKeyHex: KEY }),
    ).rejects.toThrow(/not available for this pot yet|rolling out/i);
  });

  it('refuses to sign a payout to the wrong key (signer guard fails closed)', async () => {
    import.meta.env.VITE_ZK_ONCHAIN_GAMES = '1';
    const { impl, calls } = mockFetch([
      {
        success: true,
        proof_hex: 'deadbeef',
        public_inputs: ['00'.repeat(32)],
        winner_pubkey: '99'.repeat(32),
        covenant_id: 'cov1',
        signer_xonly: '99'.repeat(32), // NOT derived from KEY
        sighash: 'aa'.repeat(32),
        session_id: 'zk-sess-2',
      },
    ]);
    global.fetch = impl;
    await expect(
      settlePotZkOnchain({ covenantId: 'cov1', token: 'tok', privKeyHex: KEY }),
    ).rejects.toThrow(/does not match the address/i);
    expect(calls).toHaveLength(1); // only settle-zk hit; we never broadcast
  });
});

describe('fetchZkSettlement validates the documented response shape', () => {
  let origFetch;
  beforeEach(() => { origFetch = global.fetch; });
  afterEach(() => { global.fetch = origFetch; });

  it('throws when the proof/inputs/winner_pubkey are missing', async () => {
    const { impl } = mockFetch([{ success: true, proof_hex: 'ab' }]); // no public_inputs/winner_pubkey
    global.fetch = impl;
    await expect(fetchZkSettlement({ covenantId: 'c', token: 't' })).rejects.toThrow(/missing the proof/i);
  });
});
