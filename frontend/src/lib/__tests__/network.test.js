import { describe, it, expect } from 'vitest';
import { isMainnet } from '../network';

describe('isMainnet (single source of truth for the mainnet gate)', () => {
  it('is true for the canonical mainnet ids', () => {
    expect(isMainnet('mainnet')).toBe(true);
    expect(isMainnet('mainnet-1')).toBe(true);
  });

  it('is true for ANY mainnet-prefixed suffix (closes the exact-match fail-open)', () => {
    // The whole reason this helper exists: a future 'mainnet-2' (or any mainnet-* string) must
    // be gated as mainnet, not silently treated as testnet by an exact === 'mainnet' check.
    expect(isMainnet('mainnet-2')).toBe(true);
    expect(isMainnet('mainnet-foo')).toBe(true);
  });

  it('is false for testnets and empty / nullish values', () => {
    expect(isMainnet('testnet-10')).toBe(false);
    expect(isMainnet('testnet-12')).toBe(false);
    expect(isMainnet('')).toBe(false);
    expect(isMainnet(null)).toBe(false);
    expect(isMainnet(undefined)).toBe(false);
  });
});
