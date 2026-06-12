import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';

const TYPE_LABEL = {
  covenant_discovered: { label: 'New covenant', color: 'text-kaspa-green' },
  tier_upgraded: { label: 'Tier upgraded', color: 'text-amber-300' },
  resolution_signed: { label: 'Resolved', color: 'text-purple-300' },
  covenant_deployed: { label: 'Deployed', color: 'text-kaspa-green' },
};

function ago(ts) {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Horizontal live activity feed driven by /api/events. */
export default function LiveTicker({ network }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = () =>
      fetch(`/api/events?network=${network}&limit=20`)
        .then((r) => r.json())
        .then((d) => { if (mounted) setEvents(Array.isArray(d.events) ? d.events : []); })
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, [network]);

  if (events.length === 0) return null;

  return (
    <div className="w-full max-w-3xl mx-auto mb-4 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto whitespace-nowrap scrollbar-none">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-kaspa-green shrink-0">
          <Activity size={12} className="animate-pulse" /> Live
        </span>
        {events.slice(0, 12).map((e) => {
          const t = TYPE_LABEL[e.event_type] || { label: e.event_type, color: 'text-gray-300' };
          return (
            <Link
              key={e.id}
              to={e.covenant_id ? `/covenant/${encodeURIComponent(e.covenant_id)}` : '#'}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:border-kaspa-green/40 transition-colors"
            >
              <span className={`text-[11px] font-semibold ${t.color}`}>{t.label}</span>
              {e.detail && <span className="text-[11px] text-gray-300 max-w-[140px] truncate">{e.detail}</span>}
              {e.amount_kaspa > 0 && (
                <span className="text-[11px] font-mono text-white">{e.amount_kaspa} KAS</span>
              )}
              <span className="text-[10px] text-gray-500">{ago(e.timestamp)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
