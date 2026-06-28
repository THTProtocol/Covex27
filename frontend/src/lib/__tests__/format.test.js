import { describe, it, expect } from 'vitest';
import { formatKas, formatCount, truncateHash, truncateMiddle, ELLIPSIS } from '../format.js';

describe('formatKas', () => {
  it('renders bare numbers under 1,000 with up to 2 fraction digits', () => {
    expect(formatKas(0)).toBe('0');
    expect(formatKas(12.5)).toBe('12.5');
    expect(formatKas(999.999)).toBe('1,000'); // toLocaleString rounds to 2dp
  });

  it('abbreviates thousands and millions like the legacy Explorer/Embed helpers', () => {
    expect(formatKas(1500)).toBe('1.5K');
    expect(formatKas(2_500_000)).toBe('2.50M');
  });

  it('appends the KAS unit only when asked (Explorer headline style)', () => {
    expect(formatKas(1500, { unit: true })).toBe('1.5K KAS');
    expect(formatKas(42, { unit: true })).toBe('42 KAS');
  });

  it('returns the fallback for null / undefined / non-finite', () => {
    expect(formatKas(null)).toBe('0');
    expect(formatKas(undefined)).toBe('0');
    expect(formatKas(NaN)).toBe('0');
    expect(formatKas(null, { fallback: 'N/A' })).toBe('N/A');
    // the Explorer formatKaspa contract: null -> 'N/A', unit appended
    expect(formatKas(undefined, { unit: true, fallback: 'N/A' })).toBe('N/A');
  });
});

describe('formatCount', () => {
  it('keeps small counts exact and abbreviates large ones', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1500)).toBe('1.5k');
    expect(formatCount(2_000_000)).toBe('2M');
  });
});

describe('truncateHash / truncateMiddle', () => {
  const tx = '0123456789abcdef0123456789abcdef';

  it('uses the canonical unicode ellipsis, never ascii dots', () => {
    const out = truncateHash(tx);
    expect(out).toContain(ELLIPSIS);
    expect(out).not.toContain('...');
    expect(ELLIPSIS).toBe('…');
  });

  it('keeps the requested head and tail', () => {
    expect(truncateHash(tx, 6, 4)).toBe(`012345${ELLIPSIS}cdef`);
    expect(truncateMiddle(tx, 12, 6)).toBe(`0123456789ab${ELLIPSIS}abcdef`);
  });

  it('returns short strings untouched and empty for falsy input', () => {
    expect(truncateHash('abc', 6, 4)).toBe('abc');
    expect(truncateHash('')).toBe('');
    expect(truncateHash(null)).toBe('');
  });
});
