import { useState, useCallback } from 'react';
import { Link2, Check } from '../lib/routeIcons.js';

/**
 * "Copy invite link" for a game waiting on an opponent. Copies the covenant page
 * URL (this page) so the creator can hand it to one specific person, who joins by
 * matching the stake. Honest: it is just the covenant link, no custody, no claim.
 */
export default function InviteLink({ stake, className = '' }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href : '';

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the link is still visible in the address bar */
    }
  }, [url]);

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={copy}
        className="px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-200 light:text-emerald-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
      >
        {copied ? <Check size={13} /> : <Link2 size={13} />}
        {copied ? 'Link copied' : 'Copy invite link'}
      </button>
      <p className="text-[11px] text-gray-300 light:text-slate-600 text-center max-w-[280px] leading-snug">
        Share this link - your opponent joins by matching {stake} KAS.
      </p>
    </div>
  );
}
