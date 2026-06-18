/**
 * safeMarkdown: turn a creator's markdown into a STRICT, allowlisted HTML string
 * for the RichText Puck block. snarkdown does the markdown -> HTML pass, then we
 * run a hand-rolled allowlist sanitizer that:
 *   - keeps ONLY p, strong, em, b, i, ul, ol, li, a, code, br;
 *   - drops every attribute except href on <a>;
 *   - forces every <a> to https:// (rejects http:, javascript:, data:, vbscript:,
 *     mailto:, relative, protocol-relative) and stamps it
 *     target="_blank" rel="noopener noreferrer nofollow";
 *   - strips <script>/<style>/<iframe>/<svg>/<img> and any on* handler outright.
 *
 * This never touches the DOM and never returns raw creator HTML: only a string
 * built from a fixed tag/attribute allowlist. The result is rendered with
 * dangerouslySetInnerHTML ONLY inside the read-only Puck tree, where it is the
 * single sanctioned HTML surface (no keys, destinations, or scripts can ride in).
 */
import snarkdown from 'snarkdown';

const ALLOWED_TAGS = new Set(['p', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'a', 'code', 'br']);

// Only absolute https links survive. Everything else (javascript:, data:, vbscript:,
// http:, mailto:, relative, //protocol-relative) is dropped to "#".
const safeHref = (raw) => {
  const v = String(raw || '').trim();
  if (!/^https:\/\//i.test(v)) return '';
  // No quotes / angle brackets / whitespace that could break out of the attribute.
  if (/["'<>`\s]/.test(v)) return '';
  return v;
};

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Rebuild an HTML string from scratch, emitting only allowlisted tags. We tokenize
 * on tags and pass text through unchanged (snarkdown already escaped raw < > & in
 * text). Disallowed tags are dropped (their text content is kept), so a hostile
 * <script>alert(1)</script> becomes the inert text "alert(1)" at worst.
 */
export function sanitizeMarkdownHtml(html) {
  if (typeof html !== 'string' || !html) return '';
  let out = '';
  const tagRe = /<\/?([a-zA-Z0-9]+)((?:[^<>"']|"[^"]*"|'[^']*')*)\/?>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    out += html.slice(last, m.index); // text between tags (already escaped by snarkdown)
    last = tagRe.lastIndex;
    const full = m[0];
    const name = m[1].toLowerCase();
    const isClose = full[1] === '/';
    if (!ALLOWED_TAGS.has(name)) continue; // drop the tag, keep surrounding text
    if (name === 'br') { out += '<br>'; continue; }
    if (isClose) { out += `</${name}>`; continue; }
    if (name === 'a') {
      const hrefMatch = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(m[2] || '');
      const href = safeHref(hrefMatch ? (hrefMatch[2] ?? hrefMatch[3]) : '');
      if (!href) { out += '<a>'; continue; } // unsafe link -> inert anchor, text kept
      out += `<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer nofollow">`;
      continue;
    }
    out += `<${name}>`; // all other allowed tags emitted with zero attributes
  }
  out += html.slice(last);
  // Belt and suspenders: kill any lingering on* handler or javascript: that slipped
  // through (there should be none, since we never copy attributes other than href).
  return out.replace(/on\w+\s*=/gi, '').replace(/javascript:/gi, '');
}

/** Markdown string -> sanitized, allowlisted HTML string. */
export function renderSafeMarkdown(md) {
  if (typeof md !== 'string' || !md.trim()) return '';
  let raw = '';
  try { raw = snarkdown(md); } catch (_) { return ''; }
  return sanitizeMarkdownHtml(raw);
}

export default renderSafeMarkdown;
