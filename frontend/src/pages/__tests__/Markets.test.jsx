import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { signMarketResolve } from '../../lib/ownership';

// Markets is the conditional-outcome (prediction-market) money page. WalletContext transitively
// pulls bare kaspa-wasm (unresolvable under vitest's node env), so mock it. We assert the
// load-bearing safety behaviors:
//   1. signMarketResolve (the resolve money path) GATES on a connected creator wallet, signs a
//      message, and returns ONLY { signer_address, signature, nonce } - NEVER a private key.
//   2. The order CTA is disabled until a payout address (connected wallet) is supplied.
//   3. The compliance disclosure is present (legal honesty).
//   4. No private key hex is ever rendered.

let walletState;
vi.mock('../../components/WalletContext', () => ({
  useWallet: () => walletState,
}));

const Markets = await import('../Markets.jsx');
const { PlaceOrderCard, MarketView } = Markets;

const BOOK = {
  outcome_a: 'Argentina',
  outcome_b: 'Austria',
  resolved: false,
  odds: { a: 1.8, b: 2.1 },
  fee_bps: 3000,
  rebate_bps: 5000,
};

function renderOrderCard(overrides = {}) {
  walletState = { address: '', signMessage: vi.fn() };
  const props = {
    book: BOOK,
    odds: BOOK.odds,
    resolved: false,
    side: 0,
    setSide: vi.fn(),
    stake: '1',
    setStake: vi.fn(),
    addr: '',
    setAddr: vi.fn(),
    busy: '',
    onPlaceBet: vi.fn(),
    onMatch: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(
    <MemoryRouter>
      <PlaceOrderCard {...props} />
    </MemoryRouter>,
  );
}

describe('signMarketResolve - resolve money path never leaks a key', () => {
  it('refuses without a connected creator wallet (fail-closed)', async () => {
    const signMessage = vi.fn();
    await expect(signMarketResolve('mkt1', 0, '', signMessage)).rejects.toThrow(/Connect the market creator wallet/i);
    expect(signMessage).not.toHaveBeenCalled();
  });

  it('refuses when the wallet cannot sign messages', async () => {
    await expect(signMarketResolve('mkt1', 0, 'kaspa:qrcreator', null)).rejects.toThrow(/cannot sign messages/i);
  });

  it('signs the canonical resolve message and returns ONLY {signer_address, signature, nonce}', async () => {
    const PRIV = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    // A real signMessage returns a signature, NEVER the key. Capture the message it is asked to sign.
    let signedMessage = null;
    const signMessage = vi.fn(async (m) => { signedMessage = m; return 'a'.repeat(128); });
    const out = await signMarketResolve('mkt-42', 1, 'kaspa:qrcreator', signMessage);

    // The signed message is the canonical covex-market-resolve binding (market + outcome + nonce).
    expect(signedMessage).toMatch(/^covex-market-resolve:mkt-42:1:/);
    // The returned proof carries exactly the three verification fields, and the creator address.
    expect(Object.keys(out).sort()).toEqual(['nonce', 'signature', 'signer_address']);
    expect(out.signer_address).toBe('kaspa:qrcreator');
    expect(out.signature).toBe('a'.repeat(128));
    // The signed message + the proof must NEVER contain a private key.
    expect(signedMessage).not.toContain(PRIV);
    expect(JSON.stringify(out)).not.toContain(PRIV);
    // The nonce is bound into the signed message (freshness).
    expect(signedMessage).toContain(out.nonce);
  });

  it('throws (no silent success) if the wallet returns no signature', async () => {
    const signMessage = vi.fn(async () => null);
    await expect(signMarketResolve('mkt1', 0, 'kaspa:qrcreator', signMessage)).rejects.toThrow(/did not return a signature/i);
  });
});

describe('PlaceOrderCard - order is gated on a payout address', () => {
  it('disables the back-outcome CTA when no payout address is set', () => {
    const html = renderOrderCard({ addr: '' });
    // The primary "Back ..." button is disabled until an address is present.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
    // It renders the two outcome labels (the order surface).
    expect(html).toContain('Argentina');
    expect(html).toContain('Austria');
  });

  it('enables the back-outcome CTA once a valid stake + address are supplied', () => {
    const disabledHtml = renderOrderCard({ addr: '', stake: '1' });
    const enabledHtml = renderOrderCard({ addr: 'kaspatest:qrbettor', stake: '5' });
    // Isolate the Back CTA <button> (it carries the selected outcome label) in each render and
    // assert its disabled attribute flips with the address gate. The button opening tag runs from
    // '<button' up to the '>Back "Argentina"' text.
    const backBtn = (h) => {
      const idx = h.indexOf('Back &quot;Argentina&quot;');
      expect(idx).toBeGreaterThan(-1);
      return h.slice(h.lastIndexOf('<button', idx), idx);
    };
    // Match the disabled ATTRIBUTE (disabled="") specifically, not the Tailwind `disabled:` utility
    // class that appears in className either way.
    const hasDisabledAttr = (tag) => /\sdisabled(=""|\s|>)/.test(tag);
    // No address -> the Back CTA carries the disabled attribute (gated).
    expect(hasDisabledAttr(backBtn(disabledHtml))).toBe(true);
    // Valid address + stake -> the Back CTA has NO disabled attribute (the order can be placed).
    expect(hasDisabledAttr(backBtn(enabledHtml))).toBe(false);
  });

  it('renders the compliance disclosure (legal honesty)', () => {
    const html = renderOrderCard();
    expect(html).toMatch(/responsible for compliance in your jurisdiction/i);
    expect(html).toMatch(/regulated as gambling or event-contracts/i);
  });

  it('never renders a private key hex', () => {
    const html = renderOrderCard({ addr: 'kaspatest:qrbettor' });
    expect(html).not.toMatch(/\b[0-9a-f]{64}\b/i);
  });
});

describe('MarketView - SSR loading state leaks nothing', () => {
  it('renders a loading skeleton (book/market fetched in an effect that does not run in SSR)', () => {
    walletState = { address: '', signMessage: vi.fn() };
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <MarketView marketId="mkt-1" />
      </MemoryRouter>,
    );
    // The loading state is the aria-busy skeleton; no key material anywhere.
    expect(html).toMatch(/aria-busy="true"/);
    expect(html).not.toMatch(/\b[0-9a-f]{64}\b/i);
  });
});
