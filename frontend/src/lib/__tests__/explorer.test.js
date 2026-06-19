import { describe, it, expect } from 'vitest';
import { explorerBase, explorerTxUrl, explorerAddressUrl } from '../explorer.js';

// Network-accurate explorer routing is a correctness gate: pointing a testnet tx at the mainnet
// explorer renders "not found", so each network must route to its own kaspa.stream explorer.
describe('explorer URLs', () => {
  it('routes each network to its own kaspa.stream explorer', () => {
    expect(explorerBase('mainnet')).toBe('https://kaspa.stream');
    expect(explorerBase('mainnet-1')).toBe('https://kaspa.stream');
    expect(explorerBase('testnet-10')).toBe('https://tn10.kaspa.stream');
    expect(explorerBase('testnet-12')).toBe('https://tn12.kaspa.stream');
  });

  it('falls back to mainnet for an unknown or missing network', () => {
    expect(explorerBase('bogus-net')).toBe('https://kaspa.stream');
    expect(explorerBase(undefined)).toBe('https://kaspa.stream');
  });

  it('strips the :0 outpoint suffix from a Covex tx id before linking', () => {
    expect(explorerTxUrl('deadbeef:0', 'mainnet')).toBe('https://kaspa.stream/txs/deadbeef');
    expect(explorerTxUrl('abc123', 'testnet-12')).toBe('https://tn12.kaspa.stream/txs/abc123');
  });

  it('builds address URLs on the covenant network and encodes the address', () => {
    expect(explorerAddressUrl('kaspatest:abc', 'testnet-10')).toBe('https://tn10.kaspa.stream/addresses/kaspatest%3Aabc');
    expect(explorerAddressUrl('kaspatest:abc', 'testnet-12')).toBe('https://tn12.kaspa.stream/addresses/kaspatest%3Aabc');
  });
});
