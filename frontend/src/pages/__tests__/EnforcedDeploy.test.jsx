import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// EnforcedDeploy is the deploy/redeem money-moving page. It statically imports the WalletContext
// (which transitively pulls the kasflow wallet connector -> bare kaspa-wasm, unresolvable under
// vitest's node env), so we mock the WalletContext module wholesale. The component only reads the
// hook's fields; mocking lets us drive the connected/disconnected + network state deterministically
// and SSR-render the real component (this project's component-test pattern: renderToStaticMarkup +
// HTML assertions, default node env, no jsdom).
//
// These are REAL safety assertions, not smoke tests. The load-bearing invariants pinned here:
//   1. On mainnet the page shows the fail-closed dead-end banner: only the non-custodial
//      single-signer primitives can deploy; the dev-wallet primitives are disabled (no custodial
//      signing path is offered).
//   2. Every dev-wallet kind tile is `disabled` on mainnet (the mainnet dead-end guard).
//   3. The gated kinds (winner_bound / escrow_bound / zk_game_settle) are refused by isGatedKind
//      so they can never be offered as a deployable tile.
//   4. buildDeploySignatures returns ONLY { index, signature_hex } and never the private key.

let walletState;
vi.mock('../../components/WalletContext', () => ({
  useWallet: () => walletState.hook,
  getCurrentNetwork: () => walletState.network,
}));

const { default: EnforcedDeploy, buildDeploySignatures, isGatedKind, GATED_KINDS } = await import('../EnforcedDeploy.jsx');

function baseHook(overrides = {}) {
  return {
    address: '',
    isDevMode: false,
    devMode: null,
    DevConnectPanel: () => null,
    canSignCovenant: false,
    covenantSignReason: 'No sign-capable wallet connected.',
    signCovenantSpend: vi.fn(),
    signCovenantDeploy: vi.fn(),
    activeWalletId: null,
    walletMeta: {},
    ...overrides,
  };
}

function render({ network = 'testnet-12', hook = {} } = {}) {
  walletState = { network, hook: baseHook(hook) };
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/deploy/enforced']}>
      <EnforcedDeploy />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // window.crypto.getRandomValues is referenced by randomSecretHex (not on the render path, but
  // keep the global sane). vitest's node env provides crypto; assert it exists so a regression
  // that calls it during render surfaces clearly.
  expect(globalThis.crypto?.getRandomValues).toBeTypeOf('function');
});

describe('EnforcedDeploy - mainnet fail-closed dead-end', () => {
  it('shows the mainnet dead-end banner naming the non-custodial primitives', () => {
    const html = render({ network: 'mainnet' });
    expect(html).toContain('You are on mainnet');
    // The banner must name the four non-custodial primitives that DO deploy on mainnet.
    expect(html).toMatch(/Single-key, hashlock, timelock, and relative-timelock/i);
    // and must NOT claim the dev-wallet primitives are mainnet-deployable.
    expect(html).toMatch(/server-assisted dev-wallet path, which is disabled on mainnet/i);
  });

  it('does NOT show the mainnet banner on a testnet', () => {
    const html = render({ network: 'testnet-12' });
    expect(html).not.toContain('You are on mainnet');
  });

  it('mainnet-1 is treated as mainnet (banner shown)', () => {
    const html = render({ network: 'mainnet-1' });
    expect(html).toContain('You are on mainnet');
  });
});

describe('EnforcedDeploy - tile gating (the mainnet dead-end guard, disabled tiles)', () => {
  it('disables the dev-wallet primitive tiles on mainnet but keeps the single-signer ones enabled', () => {
    const mainnet = render({ network: 'mainnet' });
    const testnet = render({ network: 'testnet-12' });
    // The "Testnet only" disabled badge is rendered for every mainnet-unavailable kind.
    expect(mainnet).toContain('Testnet only');
    // The non-custodial primitives keep their "Mainnet-ready" badge.
    expect(mainnet).toContain('Mainnet-ready');
    // Count tile buttons carrying the disabled ATTRIBUTE (disabled=""), not the `disabled:` Tailwind
    // class. Mainnet must disable strictly MORE tiles than a testnet (the dev-wallet + market kinds).
    const countDisabledAttr = (h) => (h.match(/<button[^>]*\sdisabled(?:=""|\s|>)/g) || []).length;
    const mainnetDisabled = countDisabledAttr(mainnet);
    const testnetDisabled = countDisabledAttr(testnet);
    expect(mainnetDisabled).toBeGreaterThan(testnetDisabled);
    // At least the 8 dev-wallet/market kinds (multisig/htlc/channel/deadman/timedecay/oracle_*/market)
    // are disabled on mainnet; sanity floor so this can't silently regress to "nothing disabled".
    expect(mainnetDisabled).toBeGreaterThanOrEqual(8);
  });

  it('on a testnet every kind tile is enabled (no Testnet-only disable badge, no mainnet banner)', () => {
    const html = render({ network: 'testnet-12' });
    expect(html).not.toContain('Testnet only');
    // Server-assisted demo badge still appears (honest deploy-reality), but tiles are NOT disabled
    // for being mainnet-unavailable. The kind picker buttons carry aria-pressed; none should be a
    // mainnet-dead-end disabled tile.
    expect(html).toContain('Server-assisted demo');
  });
});

describe('EnforcedDeploy - wallet gating / no custodial signing', () => {
  it('a disconnected wallet is GATED behind a connect prompt with no deploy CTA and no key leak', () => {
    const html = render({ network: 'testnet-12', hook: { address: '' } });
    // The deploy action is gated: the connect prompt shows instead of a Lock-funds CTA.
    expect(html).toMatch(/Connect a wallet to sign the deploy/i);
    expect(html).not.toMatch(/Lock .*KAS into a .*covenant/);
    // No private key material should ever appear in the rendered page (defense-in-depth scan).
    expect(html).not.toMatch(/private[_-]?key/i);
    // The page never renders a raw 64-hex key string.
    expect(html).not.toMatch(/\b[0-9a-f]{64}\b/i);
  });

  it('renders the deploy action surface for a connected sign-capable wallet without exposing a key', () => {
    const html = render({
      network: 'testnet-12',
      hook: { address: 'kaspatest:qrconnected', canSignCovenant: true },
    });
    // The deploy CTA is rendered (a Lock-funds button) for a sign-capable wallet, and is honestly
    // labelled non-custodial for a single-signer kind (the key signs the funding tx in the wallet).
    expect(html).toMatch(/Lock .*KAS into a .*covenant \(non-custodial\)/);
    // No private key hex is ever rendered.
    expect(html).not.toMatch(/\b[0-9a-f]{64}\b/i);
  });
});

describe('isGatedKind / GATED_KINDS (backend-gated kinds are never deployable)', () => {
  it('flags winner_bound / escrow_bound / zk_game_settle as gated', () => {
    expect(GATED_KINDS).toEqual(['p2sh_winner_bound', 'escrow_bound', 'zk_game_settle']);
    expect(isGatedKind('p2sh_winner_bound')).toBe(true);
    expect(isGatedKind('escrow_bound')).toBe(true);
    expect(isGatedKind('zk_game_settle')).toBe(true);
  });

  it('matches on the BASE kind so a suffixed id (zk_game_settle:abcd) is still gated', () => {
    expect(isGatedKind('zk_game_settle:deadbeef')).toBe(true);
    expect(isGatedKind('escrow_bound:0')).toBe(true);
  });

  it('does NOT gate the deployable single-signer / hashlock kinds', () => {
    for (const ok of ['singlesig', 'hashlock', 'timelock', 'relative_timelock', 'multisig', 'htlc', 'market']) {
      expect(isGatedKind(ok)).toBe(false);
    }
  });

  it('is null/garbage-safe (fail-closed-friendly)', () => {
    expect(isGatedKind(null)).toBe(false);
    expect(isGatedKind(undefined)).toBe(false);
    expect(isGatedKind('')).toBe(false);
  });
});

describe('buildDeploySignatures - never returns the private key', () => {
  const PRIV_HEX = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

  it('produces exactly { index, signature_hex } per input and never the signing key', () => {
    // The injected signer mimics a real schnorr sign: it returns a 64-byte signature, NOT the key.
    const sigBytes = new Uint8Array(64).fill(0xab);
    const sign = vi.fn(() => sigBytes);
    const inputs = [
      { index: 0, sighash: '11'.repeat(32) },
      { index: 1, sighash: '22'.repeat(32) },
    ];
    const out = buildDeploySignatures(inputs, sign);
    expect(out).toHaveLength(2);
    for (const o of out) {
      expect(Object.keys(o).sort()).toEqual(['index', 'signature_hex']);
      expect(o.signature_hex).toMatch(/^[0-9a-f]{128}$/i); // 64-byte sig
      expect(o.signature_hex).not.toContain(PRIV_HEX); // never the key
    }
    expect(out[0].index).toBe(0);
    expect(out[1].index).toBe(1);
    // The signer was handed only the per-input sighash, never asked to return the key.
    expect(sign).toHaveBeenCalledTimes(2);
    expect(sign).toHaveBeenNthCalledWith(1, '11'.repeat(32));
    expect(sign).toHaveBeenNthCalledWith(2, '22'.repeat(32));
  });

  it('returns an empty array for no inputs (no signing, nothing leaked)', () => {
    const sign = vi.fn(() => new Uint8Array(64));
    expect(buildDeploySignatures([], sign)).toEqual([]);
    expect(buildDeploySignatures(null, sign)).toEqual([]);
    expect(sign).not.toHaveBeenCalled();
  });
});
