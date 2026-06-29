import { describe, it, expect, vi } from 'vitest';

// WalletContext statically imports the kasflow connector graph, which transitively
// pulls bare @onekeyfe/kaspa-wasm with no Node-resolvable entry. Stub the import
// graph exactly like WalletContext.devSign.test.js so the module loads; we only
// exercise the pure humanizeExtensionError helper here.
vi.mock('@kasflow/wallet-connector/react', () => ({}));
vi.mock('@onekeyfe/kaspa-wasm', () => ({ default: () => {}, initSync: () => {} }));
vi.mock('@onekeyfe/kaspa-wasm/kaspa_bg.wasm.bin?url', () => ({ default: '' }));

const { humanizeExtensionError } = await import('../WalletContext.jsx');

// GAP C(2): when a wallet extension IS connected and the send THROWS, sendPayment must
// surface the humanized extension reason (method:'extension') rather than the generic
// "No wallet connected to sign this transaction." These pin the humanizer so the real
// reason (rejected / insufficient / locked) is never collapsed into "no wallet".
describe('humanizeExtensionError (wallet-extension send failures)', () => {
  it('maps EIP-1193 4001 to a "you declined" message', () => {
    expect(humanizeExtensionError({ code: 4001, message: 'User rejected the request.' }))
      .toMatch(/declined the transaction/i);
  });

  it('maps a plain "User denied" string to "you declined"', () => {
    expect(humanizeExtensionError('User denied transaction signature')).toMatch(/declined/i);
  });

  it('maps nested { error: { code: 4001 } } shapes to "you declined"', () => {
    expect(humanizeExtensionError({ error: { code: 4001, message: 'cancelled' } })).toMatch(/declined/i);
  });

  it('surfaces an insufficient-funds reason', () => {
    expect(humanizeExtensionError(new Error('insufficient funds for transfer'))).toMatch(/insufficient funds/i);
  });

  it('surfaces a locked-wallet reason', () => {
    expect(humanizeExtensionError(new Error('wallet is locked'))).toMatch(/locked/i);
  });

  it('passes through an unknown reason verbatim (never the generic no-wallet text)', () => {
    const out = humanizeExtensionError(new Error('node rpc timeout xyz'));
    expect(out).toMatch(/node rpc timeout xyz/);
    expect(out).not.toMatch(/no wallet connected/i);
  });

  it('falls back to a generic wallet-could-not-complete message for an empty error', () => {
    const out = humanizeExtensionError({});
    expect(out).toMatch(/could not complete/i);
    expect(out).not.toMatch(/no wallet connected/i);
  });
});
