import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const TYPE_META = {
  covenant_discovered: { label: 'New covenant', dot: '#49EACB', text: 'text-kaspa-green' },
  covenant_deployed: { label: 'Deployed', dot: '#49EACB', text: 'text-kaspa-green' },
  tier_upgraded: { label: 'Tier paid', dot: '#E8AF34', text: 'text-amber-300' },
  resolution_signed: { label: 'Resolved', dot: '#C084FC', text: 'text-purple-300' },
  game_update: { label: 'Match', dot: '#38BDF8', text: 'text-sky-300' },
  game_move: { label: 'Move', dot: '#38BDF8', text: 'text-sky-300' },
};

function ago(ts) {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/**
 * Live network activity marquee. Events stream in over the websocket feed
 * (poll fallback) and glide across an edge-faded glass strip. Hover pauses.
 */
export default function LiveTicker({ network }) {
  const [events, setEvents] = useState([]);
  // Pause the scroll on ANY interaction so a live covenant is always clickable. CSS :hover
  // pausing alone is desktop-only - on touch there is no hover, so a moving link is impossible
  // to tap. touchstart pauses the marquee, then the tap lands on a now-stationary link.
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = () =>
      fetch(`/api/events?network=${network}&limit=20`)
        .then((r) => r.json())
        .then((d) => { if (mounted) setEvents(Array.isArray(d.events) ? d.events : []); })
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);

    let ws;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const d = msg?.data;
          if (!d || !d.event_type || (d.network && d.network !== network)) return;
          if (!mounted) return;
          setEvents((prev) => [{ id: `ws-${Date.now()}-${Math.random()}`, ...d }, ...prev].slice(0, 20));
        } catch { /* ignore non-JSON frames */ }
      };
    } catch { /* ws unavailable, polling covers it */ }

    return () => { mounted = false; clearInterval(id); try { ws && ws.close(); } catch { /* best-effort; failure is non-fatal here */ } };
  }, [network]);

  if (events.length === 0) return null;

  const Item = ({ e }) => {
    const t = TYPE_META[e.event_type] || { label: e.event_type, dot: '#9CA3AF', text: 'text-gray-300' };
    return (
      <Link
        to={e.covenant_id ? `/covenant/${encodeURIComponent(e.covenant_id)}` : '#'}
        className="ticker-item group/item"
      >
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ backgroundColor: t.dot }} />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.dot }} />
        </span>
        <span className={`text-[11px] font-bold tracking-wide ${t.text}`}>{t.label}</span>
        {e.detail && <span className="text-[11px] text-gray-400 max-w-[150px] truncate group-hover/item:text-gray-200 transition-colors">{e.detail}</span>}
        {e.amount_kaspa > 0 && (
          <span className="text-[11px] font-mono font-semibold text-white/90">{e.amount_kaspa.toLocaleString()} <span className="text-white/40">KAS</span></span>
        )}
        <span className="text-[10px] font-mono text-gray-600">{ago(e.timestamp)}</span>
      </Link>
    );
  };

  return (
    <div className="w-full max-w-3xl mx-auto mb-5">
      <div
        className="ticker-shell group"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div className="ticker-badge">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-kaspa-green opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-kaspa-green" />
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-kaspa-green">Live</span>
        </div>
        <div className="ticker-mask">
          <div className="ticker-track" style={{ animationPlayState: paused ? 'paused' : 'running' }}>
            {events.map((e) => <Item key={`a-${e.id}`} e={e} />)}
            {events.map((e) => <Item key={`b-${e.id}`} e={e} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
