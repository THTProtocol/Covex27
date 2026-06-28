import { useState, useRef } from 'react';
import { X, Copy, Check, Code2, Link2, Share2, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { REALITY_BADGE_LABEL } from '../lib/enforcement-copy';
import { useDialog } from '../lib/useDialog';

// Share & embed a covenant. Gives a creator (or anyone) a direct link, a copy-paste
// <iframe> snippet to drop the covenant into their OWN website, and a social share.
// The embedded widget (/embed/covenant/:id) is read-only and opens Covex in a new tab
// for the actual wallet interaction, so embedding is safe (no framed signing).
//
// Three tabs (direct / embed / og-preview) wired as a proper WAI-ARIA tablist:
// role=tablist on the row, role=tab + aria-selected + aria-controls on each tab,
// role=tabpanel + aria-labelledby on each panel, ArrowLeft/Right rotates focus
// among the tab buttons only when one of THEM has focus, so global key handlers
// (Escape, page hotkeys) are not stolen.

const TABS = [
  { id: 'direct', label: 'Direct link', Icon: Link2 },
  { id: 'embed', label: 'Embed', Icon: Code2 },
  { id: 'og', label: 'Open Graph preview', Icon: ImageIcon },
];

// Pure CSS+SVG card. Matches Twitter / Discord / iMessage unfurl proportions
// (1200x630, the OG image aspect) so what creators see here is what their
// audience will see. No deps, no images, no fonts beyond system stack.
function OgCard({ name, reality, directUrl }) {
  const badge = REALITY_BADGE_LABEL[reality] || REALITY_BADGE_LABEL['on-chain'];
  // Honest palette mirrored from TrustBadge so this preview never overclaims:
  // on-chain emerald, full-zk violet (a real Groth16 proof verified off-chain by
  // the external resolver, never chain-enforced), hybrid sky, oracle amber,
  // fallback slate.
  const palette = {
    'on-chain': { fg: '#34d399', bg: 'rgba(16,185,129,0.16)', stroke: 'rgba(16,185,129,0.55)' },
    'full-zk': { fg: '#c4b5fd', bg: 'rgba(139,92,246,0.18)', stroke: 'rgba(139,92,246,0.6)' },
    'oracle-attested': { fg: '#fbbf24', bg: 'rgba(245,158,11,0.16)', stroke: 'rgba(245,158,11,0.55)' },
    hybrid: { fg: '#7dd3fc', bg: 'rgba(14,165,233,0.16)', stroke: 'rgba(14,165,233,0.55)' },
  }[reality] || { fg: '#cbd5e1', bg: 'rgba(148,163,184,0.16)', stroke: 'rgba(148,163,184,0.45)' };
  const host = (() => { try { return new URL(directUrl).host; } catch { return 'covex'; } })();
  const safeName = (name || 'Covenant on Covex').slice(0, 64);
  return (
    <svg viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img"
      aria-label={`Open Graph preview for ${safeName}, ${badge}`}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }}>
      <defs>
        <linearGradient id="ogbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#06121A" />
          <stop offset="100%" stopColor="#0a1e1a" />
        </linearGradient>
        <radialGradient id="ogglow" cx="0.85" cy="0.15" r="0.7">
          <stop offset="0%" stopColor="#70C7BA" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#70C7BA" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#ogbg)" />
      <rect width="1200" height="630" fill="url(#ogglow)" />
      {/* Covex wordmark */}
      <g transform="translate(72, 80)">
        <circle cx="22" cy="22" r="22" fill="#70C7BA" />
        <text x="58" y="32" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
          fontSize="30" fontWeight="800" fill="#e6fffb" letterSpacing="0.5">covex</text>
      </g>
      {/* Reality badge */}
      <g transform="translate(72, 180)">
        <rect x="0" y="0" rx="14" ry="14" width={Math.max(220, badge.length * 16 + 56)} height="46"
          fill={palette.bg} stroke={palette.stroke} strokeWidth="1.5" />
        <circle cx="26" cy="23" r="6" fill={palette.fg} />
        <text x="46" y="30" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
          fontSize="20" fontWeight="700" fill={palette.fg} letterSpacing="0.8">
          {badge.toUpperCase()}
        </text>
      </g>
      {/* Covenant name */}
      <text x="72" y="340" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        fontSize="68" fontWeight="800" fill="#ffffff" letterSpacing="-0.5">
        {safeName}
      </text>
      <text x="72" y="400" fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        fontSize="26" fontWeight="500" fill="#94a3b8">
        A covenant on Kaspa, live on Covex
      </text>
      {/* Domain footer */}
      <g transform="translate(72, 540)">
        <text fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
          fontSize="22" fontWeight="600" fill="#70C7BA">{host}</text>
      </g>
      {/* Subtle frame */}
      <rect x="1" y="1" width="1198" height="628" rx="0" ry="0"
        fill="none" stroke="rgba(112,199,186,0.18)" strokeWidth="2" />
    </svg>
  );
}

export default function ShareEmbedModal({ open, onClose, id, network, name, reality }) {
  const [theme, setTheme] = useState('dark');
  const [copied, setCopied] = useState('');
  const [tab, setTab] = useState('direct');
  const tablistRef = useRef(null);
  // Escape-to-close + focus trap + focus restore (the tablist keeps its own ArrowLeft/Right
  // handling; useDialog only governs Tab cycling + Escape).
  const dialogRef = useDialog({ open, onClose });

  if (!open) return null;

  const origin = window.location.origin;
  const net = network ? `?network=${encodeURIComponent(network)}` : '';
  const directUrl = `${origin}/covenant/${encodeURIComponent(id)}${net}`;
  const embedUrl = `${origin}/embed/covenant/${encodeURIComponent(id)}${net ? net + '&' : '?'}theme=${theme}`;
  const title = (name || 'Covenant on Covex').replace(/"/g, '');
  const snippet = `<iframe src="${embedUrl}" width="400" height="360" style="border:0;border-radius:16px;max-width:100%" title="${title}" loading="lazy"></iframe>`;
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${title} - a covenant on Kaspa, live on Covex`)}&url=${encodeURIComponent(directUrl)}`;

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1800); } catch { /* clipboard blocked */ }
  };

  // ArrowLeft/Right cycles tab focus only when a tab button (inside the
  // tablist) is the active element. Global Escape, page shortcuts, and arrow
  // keys outside the tablist are untouched, which is the WAI-ARIA pattern.
  const onTablistKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const root = tablistRef.current;
    if (!root || !root.contains(document.activeElement)) return;
    e.preventDefault();
    const idx = TABS.findIndex((t) => t.id === tab);
    const next = e.key === 'ArrowRight' ? (idx + 1) % TABS.length : (idx - 1 + TABS.length) % TABS.length;
    const nextId = TABS[next].id;
    setTab(nextId);
    // Move focus to the newly-selected tab so the user can keep arrow-keying.
    requestAnimationFrame(() => {
      const btn = root.querySelector(`#share-tab-${nextId}`);
      if (btn) btn.focus();
    });
  };

  const CopyBtn = ({ text, k }) => (
    <button onClick={() => copy(text, k)}
      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-kaspa-green/15 border border-kaspa-green/30 text-kaspa-green hover:bg-kaspa-green/25 transition-colors">
      {copied === k ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-embed-title"
        className="relative w-full max-w-lg glass-panel rounded-2xl border border-white/10 light:border-slate-300 p-5 sm:p-6 max-h-[90vh] overflow-y-auto outline-none"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
              <Share2 size={17} className="text-kaspa-green" />
            </div>
            <div>
              <h2 id="share-embed-title" className="text-base font-bold text-white light:text-slate-900 leading-tight">Share &amp; embed</h2>
              <p className="text-[11px] text-gray-400 light:text-slate-500">Put this covenant anywhere. People interact through Covex.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 light:text-slate-500 light:hover:text-slate-900 light:hover:bg-slate-200 transition-colors"><X size={18} /></button>
        </div>

        {/* Tablist */}
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="Share options"
          onKeyDown={onTablistKey}
          className="flex items-center gap-1 mb-4 p-1 rounded-xl border border-white/10 light:border-slate-300 bg-black/30 light:bg-slate-100 overflow-x-auto"
        >
          {TABS.map(({ id: tabId, label, Icon }) => {
            const selected = tab === tabId;
            return (
              <button
                key={tabId}
                id={`share-tab-${tabId}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`share-panel-${tabId}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(tabId)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  selected
                    ? 'bg-kaspa-green/20 text-kaspa-green border border-kaspa-green/40'
                    : 'text-gray-400 hover:text-gray-200 light:text-slate-500 light:hover:text-slate-800 border border-transparent'
                }`}
              >
                <Icon size={12} /> {label}
              </button>
            );
          })}
        </div>

        {/* Direct link panel */}
        <div
          id="share-panel-direct"
          role="tabpanel"
          aria-labelledby="share-tab-direct"
          hidden={tab !== 'direct'}
        >
          <div className="flex items-center gap-2">
            <input readOnly value={directUrl} onFocus={(e) => e.target.select()}
              aria-label="Direct link to this covenant"
              className="flex-1 min-w-0 rounded-lg bg-black/40 border border-white/10 light:bg-white light:border-slate-300 px-3 py-2 text-xs text-gray-200 light:text-slate-800 font-mono" />
            <CopyBtn text={directUrl} k="link" />
          </div>
          <div className="mt-2 flex gap-2 flex-wrap">
            <a href={tweet} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-300 light:text-slate-600 hover:text-kaspa-green px-2.5 py-1.5 rounded-lg border border-white/10 light:border-slate-300 hover:border-kaspa-green/30 transition-colors">
              Share on X <ExternalLink size={11} />
            </a>
            <a href={directUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-300 light:text-slate-600 hover:text-kaspa-green px-2.5 py-1.5 rounded-lg border border-white/10 light:border-slate-300 hover:border-kaspa-green/30 transition-colors">
              Open page <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* Embed panel */}
        <div
          id="share-panel-embed"
          role="tabpanel"
          aria-labelledby="share-tab-embed"
          hidden={tab !== 'embed'}
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500">Iframe snippet</p>
            <div className="flex items-center gap-1 text-[10px] rounded-lg border border-white/10 light:border-slate-300 p-0.5">
              {['dark', 'light'].map((t) => (
                <button key={t} onClick={() => setTheme(t)}
                  aria-pressed={theme === t}
                  className={`px-2 py-0.5 rounded-md font-semibold capitalize transition-colors ${theme === t ? 'bg-kaspa-green/20 text-kaspa-green' : 'text-gray-400 light:text-slate-500 hover:text-gray-200 light:hover:text-slate-800'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <textarea readOnly value={snippet} onFocus={(e) => e.target.select()} rows={3}
              aria-label="HTML embed snippet"
              className="flex-1 min-w-0 rounded-lg bg-black/40 border border-white/10 light:bg-white light:border-slate-300 px-3 py-2 text-[11px] text-gray-200 light:text-slate-800 font-mono resize-none" />
            <CopyBtn text={snippet} k="embed" />
          </div>
          <p className="text-[10px] text-gray-500 light:text-slate-500 mt-1.5">Paste this into any HTML page. The widget is read-only and opens Covex in a new tab for wallet actions, so your visitors stay safe.</p>

          {/* Live preview */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 light:text-slate-500 mt-4 mb-1.5">Live preview</p>
          <div className="rounded-xl overflow-hidden border border-white/10 light:border-slate-300 bg-black/30 light:bg-slate-100 flex justify-center p-3">
            <iframe key={theme} src={embedUrl} width="400" height="360" style={{ border: 0, borderRadius: 16, maxWidth: '100%' }} title="Covenant embed preview" loading="lazy" />
          </div>
        </div>

        {/* Open Graph preview panel */}
        <div
          id="share-panel-og"
          role="tabpanel"
          aria-labelledby="share-tab-og"
          hidden={tab !== 'og'}
        >
          <p className="text-[10px] text-gray-500 light:text-slate-500 mb-2">
            How this covenant unfurls on social and chat. The enforcement label is the same one Covex shows on the page, never softened for marketing.
          </p>
          <div className="rounded-xl overflow-hidden border border-white/10 light:border-slate-300 bg-black/30 light:bg-slate-100 p-3">
            <OgCard name={name} reality={reality} directUrl={directUrl} />
          </div>
          <p className="text-[10px] text-gray-500 light:text-slate-500 mt-2">
            Renders at 1200 by 630, the standard Open Graph / Twitter card ratio.
          </p>
        </div>
      </div>
    </div>
  );
}
