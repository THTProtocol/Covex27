/**
 * format.js - the single source of truth for how Covex renders KAS amounts and
 * truncated hashes/addresses across the app.
 *
 * Before this, KAS was formatted three different ways (Explorer's formatKaspa,
 * CovenantEmbed's formatKas, and raw .toLocaleString() call sites) and hashes
 * were truncated by ~6 hand-rolled helpers that disagreed on the ellipsis (ascii
 * "..." vs the unicode "…") and the head/tail lengths. That drift read as a bug.
 * Centralising it here means the headline value figures and the short-hash chips
 * look identical everywhere.
 *
 * CANONICAL ELLIPSIS: the unicode horizontal ellipsis "…" (U+2026), not "...".
 * One glyph, tighter, and it is what a designed product uses.
 *
 * NOTE ON UNITS: these helpers take an amount already denominated in KAS (whole
 * coins), not sompi. The on-chain values Covex surfaces are pre-converted to KAS
 * upstream, so converting here would double-divide. Keep sompi->KAS conversion
 * at the data boundary, not in the formatter.
 */

export const ELLIPSIS = '…';

/**
 * Format a KAS amount for display. Mirrors the prior Explorer/CovenantEmbed
 * behaviour exactly: compact K/M above 1,000 / 1,000,000, otherwise a localized
 * number with up to 2 fraction digits.
 *
 * @param {number|string|null|undefined} kas amount in KAS (not sompi)
 * @param {{ unit?: boolean, fallback?: string }} [opts]
 *   unit: append " KAS" (Explorer headline style). Default false (bare number).
 *   fallback: returned for null/undefined/non-finite input. Default '0'.
 */
export function formatKas(kas, opts = {}) {
  const { unit = false, fallback = '0' } = opts;
  if (kas == null) return fallback;
  const num = Number(kas);
  if (!Number.isFinite(num)) return fallback;
  const suffix = unit ? ' KAS' : '';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M${suffix}`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K${suffix}`;
  return `${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
}

/**
 * Compact count formatter for stat columns (1.2k, 3.4M). Small counts render in
 * full so they stay precise; large counts abbreviate so they never wrap a tight
 * mobile stat cell.
 */
export function formatCount(n) {
  if (n == null) return '0';
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return Math.round(num).toLocaleString();
}

/**
 * End-truncate a hash/address/txid to head + canonical ellipsis + tail. Used for
 * the short-hash chips in Explorer, the embed, and the wallet pill. Short enough
 * strings are returned untouched so we never add an ellipsis that hides nothing.
 *
 * @param {string} s the hex/address string
 * @param {number} [head=6] leading chars to keep
 * @param {number} [tail=4] trailing chars to keep
 */
export function truncateHash(s, head = 6, tail = 4) {
  if (!s) return '';
  const str = String(s);
  if (str.length <= head + tail + 1) return str;
  return `${str.slice(0, head)}${ELLIPSIS}${str.slice(-tail)}`;
}

/**
 * Middle-truncate variant that keeps a longer head (for addresses where the
 * network prefix carries meaning) and the checksum tail.
 */
export function truncateMiddle(s, head = 12, tail = 6) {
  return truncateHash(s, head, tail);
}
