import { useState, useEffect } from 'react';
import { X, Copy, Check, Code2, Link2, Share2, ExternalLink } from 'lucide-react';

// Share & embed a covenant. Gives a creator (or anyone) a direct link, a copy-paste
// <iframe> snippet to drop the covenant into their OWN website, and a social share.
// The embedded widget (/embed/covenant/:id) is read-only and opens Covex in a new tab
// for the actual wallet interaction, so embedding is safe (no framed signing).
export default function ShareEmbedModal({ open, onClose, id, network, name }) {
  const [theme, setTheme] = useState('dark');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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

  const CopyBtn = ({ text, k }) => (
    <button onClick={() => copy(text, k)}
      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-kaspa-green/15 border border-kaspa-green/30 text-kaspa-green hover:bg-kaspa-green/25 transition-colors">
      {copied === k ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg glass-panel rounded-2xl border border-white/10 p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
              <Share2 size={17} className="text-kaspa-green" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Share &amp; embed</h2>
              <p className="text-[11px] text-gray-400">Put this covenant anywhere. People interact through Covex.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        {/* Direct link */}
        <div className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center gap-1.5"><Link2 size={12} /> Direct link</p>
          <div className="flex items-center gap-2">
            <input readOnly value={directUrl} onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-gray-200 font-mono" />
            <CopyBtn text={directUrl} k="link" />
          </div>
          <div className="mt-2 flex gap-2">
            <a href={tweet} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-300 hover:text-kaspa-green px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-kaspa-green/30 transition-colors">
              Share on X <ExternalLink size={11} />
            </a>
            <a href={directUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-300 hover:text-kaspa-green px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-kaspa-green/30 transition-colors">
              Open page <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* Embed */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5"><Code2 size={12} /> Embed on your website</p>
            <div className="flex items-center gap-1 text-[10px] rounded-lg border border-white/10 p-0.5">
              {['dark', 'light'].map((t) => (
                <button key={t} onClick={() => setTheme(t)}
                  className={`px-2 py-0.5 rounded-md font-semibold capitalize transition-colors ${theme === t ? 'bg-kaspa-green/20 text-kaspa-green' : 'text-gray-400 hover:text-gray-200'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <textarea readOnly value={snippet} onFocus={(e) => e.target.select()} rows={3}
              className="flex-1 min-w-0 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-gray-200 font-mono resize-none" />
            <CopyBtn text={snippet} k="embed" />
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5">Paste this into any HTML page. The widget is read-only and opens Covex in a new tab for wallet actions, so your visitors stay safe.</p>

          {/* Live preview */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-4 mb-1.5">Live preview</p>
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30 flex justify-center p-3">
            <iframe key={theme} src={embedUrl} width="400" height="360" style={{ border: 0, borderRadius: 16, maxWidth: '100%' }} title="Covenant embed preview" loading="lazy" />
          </div>
        </div>
      </div>
    </div>
  );
}
