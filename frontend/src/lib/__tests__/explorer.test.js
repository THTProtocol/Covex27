import { describe, it, expect } from 'vitest';
import { explorerBase, explorerTxUrl, explorerAddressUrl } from '../explorer.js';

// Network-accurate explorer routing is a correctness gate: pointing a testnet tx at the mainnet
// explorer renders "not found", and accidentally defaulting to mainnet would mislead users.
describe('explorer URLs', () => {
  it('routes each network to its own explorer', () => {
    expect(explorerBase('mainnet')).toBe('https://explorer.kaspa.org');
    expect(explorerBase('testnet-10')).toBe('https://explorer-tn10.kaspa.org');
    expect(explorerBase('testnet-12')).toBe('https://tn12.kaspa.stream');
  });

  it('falls back to testnet-12 for an unknown or missing network, never mainnet by accident', () => {
    expect(explorerBase('bogus-net')).toBe('https://tn12.kaspa.stream');
    expect(explorerBase(undefined)).toBe('https://tn12.kaspa.stream');
  });

  it('strips the :0 outpoint suffix from a Covex tx id before linking', () => {
    expect(explorerTxUrl('deadbeef:0', 'mainnet')).toBe('https://explorer.kaspa.org/txs/deadbeef');
    expect(explorerTxUrl('abc123', 'testnet-12')).toBe('https://tn12.kaspa.stream/txs/abc123');
  });

  it('builds address URLs on the covenant network and encodes the address', () => {
    expect(explorerAddressUrl('kaspatest:abc', 'testnet-12')).toBe('https://tn12.kaspa.stream/addresses/kaspatest%3Aabc');
  });
});
