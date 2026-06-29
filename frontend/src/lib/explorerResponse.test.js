import { describe, it, expect } from 'vitest';
import { readCovenantsResponse } from './explorerResponse';

// Honesty gate: a backend DB error arrives as HTTP 200 + {error}. It must NEVER be
// rendered as a fabricated "no covenants yet" empty state.
describe('readCovenantsResponse', () => {
  it('treats a 200 + {error} body as an ERROR, not an empty list', () => {
    const r = readCovenantsResponse({ total: 0, covenants: [], error: 'database is locked' });
    expect(r.error).toBeTruthy();
    expect(r.covenants).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('returns the covenants and total on a healthy response', () => {
    const r = readCovenantsResponse({ total: 2, covenants: [{ tx_id: 'a' }, { tx_id: 'b' }] });
    expect(r.error).toBeNull();
    expect(r.covenants).toHaveLength(2);
    expect(r.total).toBe(2);
  });

  it('treats a genuinely empty network as empty with NO error (so the honest empty state can render)', () => {
    const r = readCovenantsResponse({ total: 0, covenants: [] });
    expect(r.error).toBeNull();
    expect(r.covenants).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('never throws on a malformed body and yields an empty list', () => {
    expect(readCovenantsResponse({}).covenants).toEqual([]);
    expect(readCovenantsResponse(null).covenants).toEqual([]);
    expect(readCovenantsResponse(undefined).covenants).toEqual([]);
    expect(readCovenantsResponse({ covenants: 'nope' }).covenants).toEqual([]);
  });

  it('ignores an empty or whitespace error string (treats it as no error)', () => {
    expect(readCovenantsResponse({ covenants: [], error: '' }).error).toBeNull();
    expect(readCovenantsResponse({ covenants: [], error: '   ' }).error).toBeNull();
  });

  it('derives total from the list length when total is absent or non-numeric', () => {
    expect(readCovenantsResponse({ covenants: [{ tx_id: 'a' }] }).total).toBe(1);
    expect(readCovenantsResponse({ covenants: [{ tx_id: 'a' }], total: 'NaN' }).total).toBe(1);
  });
});
