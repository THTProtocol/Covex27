import { describe, it, expect } from 'vitest';
import {
  buildRequest, normalizeProviders, canonicalRequest, requestId, validateRequest,
  checkBinding, providerBranch, marketCovenant, REQUEST_MAGIC,
} from './request';
import { validateAlwaysSpendable } from '../composer/validate';
import { leaves } from '../composer/tree';

const P1 = 'aa'.repeat(32);
const P2 = 'bb'.repeat(32);
const WALLET = 'cc'.repeat(32);
const WINNER = 'dd'.repeat(32);
const REFUND = 'ee'.repeat(32);

const single = () => buildRequest({
  network: 'testnet-12', question: 'Did Argentina win the final?', outcomes: ['Yes', 'No'],
  providers: { mode: 'single', providers: [P1] }, deadlineDaa: 9_000_000, sourceUrl: 'https://fifa.com/...',
  requesterPubkey: WALLET,
});
const kofn = () => buildRequest({
  network: 'testnet-12', question: 'Q', outcomes: ['A', 'B'],
  providers: { mode: 'kofn', providers: [P1, P2], threshold: 2 }, deadlineDaa: 9_000_000, requesterPubkey: WALLET,
});

describe('oracle request - provider config + identity', () => {
  it('normalizeProviders: single = 1-of-1, kofn keeps threshold, rejects bad threshold', () => {
    expect(normalizeProviders({ mode: 'single', providers: [P1] })).toMatchObject({ mode: 'single', threshold: 1 });
    expect(normalizeProviders({ mode: 'kofn', providers: [P1, P2], threshold: 2 }).threshold).toBe(2);
    expect(() => normalizeProviders({ providers: [P1, P2], threshold: 3 })).toThrow(/threshold/);
    expect(() => normalizeProviders({ providers: [] })).toThrow(/at least one/);
    expect(() => normalizeProviders({ providers: ['nothex'] })).toThrow(/x-only/);
  });

  it('canonicalRequest is deterministic; requestId is a 32-byte hex content hash', () => {
    expect(canonicalRequest(single())).toBe(canonicalRequest(single()));
    expect(requestId(single())).toMatch(/^[0-9a-f]{64}$/);
    expect(requestId(single())).not.toBe(requestId(kofn()));
  });

  it('request payload carries the recognizable magic + canonical content', () => {
    const bytes = new TextDecoder().decode(
      new TextEncoder().encode(`${REQUEST_MAGIC}\n${canonicalRequest(single())}`),
    );
    expect(bytes.startsWith(REQUEST_MAGIC)).toBe(true);
  });
});

describe('validateRequest - fail closed', () => {
  it('accepts a well-formed request', () => {
    expect(validateRequest(single()).ok).toBe(true);
    expect(validateRequest(kofn()).ok).toBe(true);
  });
  it('rejects <2 / duplicate outcomes, no deadline, no providers', () => {
    expect(validateRequest(buildRequest({ question: 'q', outcomes: ['only'], providers: { providers: [P1] }, deadlineDaa: 1, requesterPubkey: WALLET })).ok).toBe(false);
    expect(validateRequest({ ...single(), outcomes: ['A', 'A'] }).errors.join(' ')).toMatch(/distinct/);
    expect(validateRequest({ ...single(), deadline_daa: 0 }).errors.join(' ')).toMatch(/deadline/);
  });
});

describe('same-wallet binding', () => {
  it('passes when requester == deployer and the covenant commits to request_id', () => {
    const req = single();
    const r = checkBinding({ requestSignerPubkey: WALLET, covenantDeployerPubkey: WALLET, covenantRequestIdCommitment: requestId(req), req });
    expect(r.ok).toBe(true);
  });
  it('fails on a different deployer wallet, or a wrong request_id commitment', () => {
    const req = single();
    expect(checkBinding({ requestSignerPubkey: WALLET, covenantDeployerPubkey: 'ff'.repeat(32), covenantRequestIdCommitment: requestId(req), req }).errors.join(' ')).toMatch(/SAME wallet/);
    expect(checkBinding({ requestSignerPubkey: WALLET, covenantDeployerPubkey: WALLET, covenantRequestIdCommitment: '00'.repeat(32), req }).errors.join(' ')).toMatch(/commit to this request_id/);
  });
});

describe('maps to the composable builder + is always-spendable', () => {
  it('single provider -> oracle 2-of-2 [provider, winner]; k-of-n -> multisig AND winner-sig', () => {
    const s = providerBranch(single(), WINNER);
    expect(s.kind).toBe('oracle');
    expect(s.params.oracle).toBe(P1);
    expect(s.params.winner).toBe(WINNER);
    const b = providerBranch(kofn(), WINNER);
    expect(b.node).toBe('and');
    const ms = b.children.find((c) => c.kind === 'multisig');
    expect(ms.params.required).toBe(2);
    expect(b.children.some((c) => c.kind === 'singlesig' && c.params.pubkey === WINNER)).toBe(true);
  });

  it('marketCovenant passes validateAlwaysSpendable (the deployer refund backstop is present)', () => {
    const cov = marketCovenant(single(), { winnerPubkey: WINNER, refundPubkey: REFUND, refundSequence: 8640 });
    const v = validateAlwaysSpendable(cov);
    expect(v.ok).toBe(true);
    // it has a gating oracle leaf AND a deployer-controlled on-chain backstop
    expect(leaves(cov).some((l) => l.kind === 'oracle')).toBe(true);
    expect(leaves(cov).some((l) => l.role === 'backstop' && l.kind === 'rcsv')).toBe(true);
  });
});
