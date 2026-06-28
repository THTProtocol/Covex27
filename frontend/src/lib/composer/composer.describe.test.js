import { describe as suite, it, expect } from 'vitest';
import { leaf, allOf, either } from './tree';
import { describe as toEnglish, enforcementLabel, summarize } from './describe';

const htlc = either(
  allOf(leaf('hashlock', { hash32: 'a', pubkey: 'b', signer: 'claimant' }), leaf('singlesig', { pubkey: 'b', signer: 'claimant' })),
  leaf('rcsv', { min_sequence: 4320, pubkey: 'c' }, 'backstop'),
);

suite('composer describe + honest labels', () => {
  it('renders plain English with EITHER / AND + flags the backstop', () => {
    const s = toEnglish(htlc);
    expect(s).toMatch(/either/i);
    expect(s).toMatch(/AND/);
    expect(s).toMatch(/refund backstop/);
  });

  it('an all-on-chain composition is labelled on-chain (no overclaim)', () => {
    expect(enforcementLabel(htlc)).toMatch(/On-chain: Kaspa consensus enforces/);
    expect(enforcementLabel(htlc)).not.toMatch(/trustless/i);
  });

  it('an oracle leaf forces the honest resolver-attested label', () => {
    const withOracle = either(
      leaf('oracle', { oracle: 'o', winner: 'w' }),
      leaf('rcsv', { min_sequence: 10, pubkey: 'c', signer: 'deployer' }, 'backstop'),
    );
    expect(enforcementLabel(withOracle)).toMatch(/Resolver-attested.*not trustless/);
  });

  it('summarize lists the conditions + the honest tier', () => {
    const s = summarize(htlc);
    expect(s).toMatch(/condition/);
    expect(s).toMatch(/On-chain/);
  });
});
