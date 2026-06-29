import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// CovenantInteractive is the per-covenant page that decides, for a spendable covenant, whether to
// offer an in-browser non-custodial REDEEM or route the holder to the /recover flow. That decision
// is the load-bearing safety gate: an oracle/resolver kind must NOT be offered as a non-custodial
// redeem the spender cannot complete. We test the exported pure predicate that drives it directly
// (real behavior, the same function the JSX renders against), plus an SSR mount smoke that the
// heavy component imports + renders its loading state without leaking a key.
//
// WalletContext transitively pulls bare kaspa-wasm (unresolvable under vitest's node env); mock it.

vi.mock('../../components/WalletContext', () => ({
  useWallet: () => ({
    address: '',
    balance: null,
    sendPayment: vi.fn(),
    buildUri: vi.fn(),
    signMessage: vi.fn(),
    connecting: false,
  }),
  getCurrentNetwork: () => 'mainnet',
  NETWORK_LABELS: { mainnet: 'Mainnet', 'testnet-10': 'Testnet 10', 'testnet-12': 'Testnet 12' },
}));

const { default: CovenantInteractive, isLocallySignableRedeem, NONCUSTODIAL_REDEEM_KINDS } = await import('../CovenantInteractive.jsx');

describe('isLocallySignableRedeem - redeem vs recover routing gate', () => {
  it('routes the non-custodial primitives to the in-browser redeem path', () => {
    for (const k of NONCUSTODIAL_REDEEM_KINDS) {
      expect(isLocallySignableRedeem(k)).toBe(true);
    }
    // The documented set is exactly these locally-signable kinds.
    expect(NONCUSTODIAL_REDEEM_KINDS).toEqual([
      'singlesig', 'hashlock', 'timelock', 'rcsv', 'multisig', 'htlc', 'channel',
    ]);
  });

  it('does NOT offer a non-custodial redeem for oracle / resolver kinds (routes to /recover)', () => {
    // These need the redeem script + (for oracle kinds) the resolver co-signature, so they must
    // route to the recovery flow, never the "redeem with my key" path.
    for (const k of ['oracle_escrow', 'oracle_enforced', 'oracle_escrow_refundable', 'binary_oracle_select', 'timedecay', 'deadman', 'merkle_membership', 'zk_game_settle']) {
      expect(isLocallySignableRedeem(k)).toBe(false);
    }
  });

  it('matches on the BASE kind so suffixed ids are routed correctly', () => {
    // rcsv is stored as 'rcsv:<min_sequence>' - still locally signable.
    expect(isLocallySignableRedeem('rcsv:10')).toBe(true);
    // an oracle kind with a request-id suffix is still NOT locally signable.
    expect(isLocallySignableRedeem('oracle_escrow:deadbeef')).toBe(false);
  });

  it('is null/garbage-safe', () => {
    expect(isLocallySignableRedeem(null)).toBe(false);
    expect(isLocallySignableRedeem(undefined)).toBe(false);
    expect(isLocallySignableRedeem('')).toBe(false);
    expect(isLocallySignableRedeem('totally_unknown_kind')).toBe(false);
  });
});

describe('CovenantInteractive - SSR mount smoke (no key leak)', () => {
  it('mounts on a covenant route and renders its loading state without leaking a key', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/covenant/deadbeefcafebabe']}>
        <Routes>
          <Route path="/covenant/:id" element={<CovenantInteractive />} />
        </Routes>
      </MemoryRouter>,
    );
    // It rendered something (the loading skeleton / shell), not an empty string.
    expect(html.length).toBeGreaterThan(50);
    // No private key hex is ever rendered.
    expect(html).not.toMatch(/\b[0-9a-f]{64}\b/i);
    expect(html).not.toMatch(/private[_-]?key/i);
  });
});
