import { describe, it, expect } from 'vitest';
import { explorerBase, explorerTxUrl, explorerAddressUrl } from '../explorer.js';

// Mainnet is the only user-visible network: every explorer link routes to kaspa.stream.
describe('explorer URLs', () => {
  it('routes mainnet to its kaspa.stream explorer', () => {
    expect(explorerBase('mainnet')).toBe('https://kaspa.stream');
    expect(explorerBase('mainnet-1')).toBe('https://kaspa.stream');
  });

  it('falls back to mainnet for an unknown or missing network', () => {
    expect(explorerBase('bogus-net')).toBe('https://kaspa.stream');
    expect(explorerBase(undefined)).toBe('https://kaspa.stream');
  });

  it('strips the :0 outpoint suffix from a Covex tx id before linking', () => {
    expect(explorerTxUrl('deadbeef:0', 'mainnet')).toBe('https://kaspa.stream/txs/deadbeef');
    expect(explorerTxUrl('abc123', 'mainnet')).toBe('https://kaspa.stream/txs/abc123');
  });

  it('builds address URLs on the mainnet explorer and encodes the address', () => {
    expect(explorerAddressUrl('kaspa:abc', 'mainnet')).toBe('https://kaspa.stream/addresses/kaspa%3Aabc');
  });
});
