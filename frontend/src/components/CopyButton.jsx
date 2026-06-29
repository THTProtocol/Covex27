import { useState, useCallback } from 'react';
import { Copy, Check } from '../lib/icons.js';
import { copyToClipboard, COPY_DWELL_MS } from '../lib/copy';

// One canonical inline copy-to-clipboard button. Drop next to any address / txid /
// script-hash readout across the explorer so every "copy" affordance morphs the same
// way (icon -> check) on the same 1500ms dwell, instead of ten hand-rolled variants.
//
// Stops the surrounding click (covenant cards are <Link>s, so a bare onClick would
// also navigate). Honest, accessible (aria-label + title), light + dark + mobile safe.
//
//   <CopyButton value={covenant.tx_id} label="Copy txid" />
//
export default function CopyButton({
  value,
  label = 'Copy',
  size = 13,
  className = '',
  stopPropagation = true,
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(
    async (e) => {
      if (stopPropagation && e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const ok = await copyToClipboard(value);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), COPY_DWELL_MS.inline);
      }
    },
    [value, stopPropagation],
  );

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={`shrink-0 inline-flex items-center justify-center rounded-md p-1 text-gray-400 light:text-slate-500 hover:text-kaspa-green light:hover:text-emerald-700 hover:bg-white/5 light:hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-kaspa-green/50 active:scale-90 ${className}`}
    >
      {copied ? (
        <Check size={size} className="text-kaspa-green light:text-emerald-700 motion-safe:animate-[copy-pop_0.3s_cubic-bezier(0.16,1,0.3,1)]" />
      ) : (
        <Copy size={size} />
      )}
    </button>
  );
}
