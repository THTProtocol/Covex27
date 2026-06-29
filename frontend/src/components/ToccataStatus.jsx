import { useEffect, useState } from 'react';
import { Timer, CheckCircle2 } from '../lib/routeIcons.js';

// The Toccata covenant hard fork activates on Kaspa mainnet at this DAA score.
const TOCCATA_DAA = 474165565;

// Kaspa runs at ~10 blocks per second post-Crescendo, so the virtual DAA score
// advances by ~10 per second. That makes the time-to-activation an ESTIMATE, not
// a promise; we label it as such.
const DAA_PER_SECOND = 10;

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Fork-aware Toccata activation status. Reads the live mainnet DAA score the
 * Covex backend node sees (/api/status node_sync.mainnet.tip_daa) and flips,
 * with no manual edit, from a scheduled countdown to an "activated" state when
 * the chain crosses the activation DAA. Falls back to honest static copy when
 * the live score is unavailable, so the page never lies and never goes blank.
 */
export default function ToccataStatus() {
  // null = unknown (no live data yet); a number = the live mainnet tip DAA.
  const [tip, setTip] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      fetch('/api/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!mounted || !d) return;
          const t = Number(d?.node_sync?.mainnet?.tip_daa || 0);
          setTip(t > 0 ? t : null);
        })
        .catch(() => { /* keep the static fallback */ });
    };
    load();
    const id = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const remaining = tip != null ? TOCCATA_DAA - tip : null;
  const activated = remaining != null && remaining <= 0;
  const eta = remaining != null && remaining > 0 ? formatEta(remaining / DAA_PER_SECOND) : null;

  const targetStr = TOCCATA_DAA.toLocaleString();

  // ── Activated: the chain has crossed the activation DAA. ──────────────────
  if (activated) {
    return (
      <div className="mb-5 rounded-2xl border border-kaspa-green/30 bg-kaspa-green/[0.06] light:bg-kaspa-green/10 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-kaspa-green opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-kaspa-green" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle2 size={16} className="text-kaspa-green shrink-0" />
              <span className="text-sm sm:text-base font-bold text-white light:text-slate-900 break-words">Toccata has activated on Kaspa mainnet</span>
            </div>
            <p className="text-[11px] text-gray-300 light:text-slate-600 mt-1 leading-relaxed break-words">
              The covenant hard fork crossed its activation score of DAA {targetStr}. Live mainnet tip the Covex node sees: {tip.toLocaleString()}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Pre-fork with a live score: show the estimated countdown. ─────────────
  if (eta) {
    return (
      <div className="mb-5 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] light:bg-amber-500/10 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Timer size={16} className="text-amber-400 shrink-0" />
              <span className="text-sm sm:text-base font-bold text-white light:text-slate-900 break-words">Toccata activates on Kaspa mainnet in about {eta}</span>
            </div>
            <p className="text-[11px] text-gray-300 light:text-slate-600 mt-1 leading-relaxed break-words">
              Activation score is DAA {targetStr}; the live mainnet tip the Covex node sees is {tip.toLocaleString()}, about {remaining.toLocaleString()} DAA below it. The time is an estimate at 10 blocks per second.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Fallback: no live score available. Honest static copy. ────────────────
  return (
    <div className="mb-5 rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.01] light:bg-slate-50 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Timer size={16} className="text-[#49EACB] shrink-0" />
        <p className="text-[11px] sm:text-xs text-gray-300 light:text-slate-600 leading-relaxed break-words min-w-0">
          The Toccata covenant hard fork activates on Kaspa mainnet at DAA score {targetStr} (scheduled for about 30 June 2026).
        </p>
      </div>
    </div>
  );
}
