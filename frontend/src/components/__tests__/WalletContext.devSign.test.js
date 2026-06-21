import { describe, it, expect, vi } from 'vitest';

// WalletContext statically imports @kasflow/wallet-connector/react, which
// transitively pulls @kasflow/passkey-wallet -> bare @onekeyfe/kaspa-wasm. That
// bare package has no Node-resolvable entry (only a "module" field), so vitest's
// SSR resolver throws before any test runs. We only test the PURE
// signMessageWithWasm helper (it takes the wasm module as an argument), so the
// real heavy modules are never needed: stub the import graph so it loads.
vi.mock('@kasflow/wallet-connector/react', () => ({}));
vi.mock('@onekeyfe/kaspa-wasm', () => ({ default: () => {}, initSync: () => {} }));
vi.mock('@onekeyfe/kaspa-wasm/kaspa_bg.wasm.bin?url', () => ({ default: '' }));

const { signMessageWithWasm } = await import('../WalletContext.jsx');

// Regression guard for the CRITICAL key leak: devSignMessage previously did
// `pk.signMessage ? pk.signMessage(message) : pk.toString()`. PrivateKey has NO
// signMessage instance method, so it fell through to pk.toString() and returned
// the RAW PRIVATE KEY hex, which then got POSTed to the server. The fix routes
// through the wasm TOP-LEVEL signMessage. These tests pin that behavior so the
// leak cannot silently return: the mock mirrors real wasm by making
// PrivateKey.toString() return the key, so any regression to the toString()
// fallback would surface the key and fail.

const PRIV_HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
// A 64-byte (128 hex char) signature, the real Kaspa message-signature length.
const FAKE_SIG = 'a'.repeat(128);

function makeWasm(opts = {}) {
  const freed = { count: 0 };
  class PrivateKey {
    constructor(hex) { this.hex = hex; }
    toString() { return this.hex; } // mirrors real wasm: would leak the key
    free() { freed.count += 1; }
  }
  const wasm = {
    PrivateKey,
    ...(opts.omitSignMessage ? {} : {
      signMessage: ({ message, privateKey }) => {
        // Real wasm takes the top-level form { message, privateKey } and returns a sig.
        expect(typeof message).toBe('string');
        expect(privateKey).toBeInstanceOf(PrivateKey);
        return FAKE_SIG;
      },
    }),
  };
  return { wasm, freed };
}

describe('signMessageWithWasm (dev wallet message signing)', () => {
  it('returns a 64-byte hex signature, never the private key', () => {
    const { wasm } = makeWasm();
    const sig = signMessageWithWasm(wasm, PRIV_HEX, 'hello kaspa');
    expect(sig).toBe(FAKE_SIG);
    // 64 bytes = 128 hex chars, and it is a hex string.
    expect(sig).toMatch(/^[0-9a-f]{128}$/i);
    expect(sig.length).toBe(128);
  });

  it('never returns the dev private key hex (no toString fallback)', () => {
    const { wasm } = makeWasm();
    const sig = signMessageWithWasm(wasm, PRIV_HEX, 'PAYMENT:kaspa:1');
    expect(sig).not.toBe(PRIV_HEX);
    expect(sig).not.toContain(PRIV_HEX);
  });

  it('frees the PrivateKey after signing', () => {
    const { wasm, freed } = makeWasm();
    signMessageWithWasm(wasm, PRIV_HEX, 'hello');
    expect(freed.count).toBe(1);
  });

  it('throws (does not leak the key) when wasm signMessage is unavailable', () => {
    const { wasm, freed } = makeWasm({ omitSignMessage: true });
    expect(() => signMessageWithWasm(wasm, PRIV_HEX, 'hello')).toThrow(/signMessage unavailable/);
    // It must throw BEFORE constructing/leaking the key, so nothing was freed and
    // certainly nothing returned the key.
    expect(freed.count).toBe(0);
  });

  it('throws when the wasm module failed to load', () => {
    expect(() => signMessageWithWasm(null, PRIV_HEX, 'hello')).toThrow(/failed to load/);
  });
});
