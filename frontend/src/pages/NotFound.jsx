import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

// Branded 404. Guarded ambient aurora behind a centered hero, big glyph, one honest
// line, two btn-shimmer CTAs back into the working app. Lazy-loaded in App.jsx so this
// lives in its own chunk and never bloats the eager Explorer bundle.
export default function NotFound() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState(null); // null = idle, [] = zero, [...] = matches
  const [err, setErr] = useState(null);

  // Submit hits the live /api/covenants?q= endpoint (same one Explorer uses). If a
  // single covenant comes back, jump straight to its detail page; multiple = render a
  // tiny suggestion list; zero = nudge to the Explorer.
  const onSubmit = useCallback(async (e) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    setErr(null);
    setHits(null);
    try {
      const r = await fetch(`/api/covenants?q=${encodeURIComponent(term)}&limit=10`);
      const d = await r.json();
      const matches = Array.isArray(d.covenants) ? d.covenants : [];
      if (matches.length === 1 && matches[0].tx_id) {
        navigate(`/covenant/${encodeURIComponent(matches[0].tx_id)}`);
        return;
      }
      setHits(matches);
    } catch (e2) {
      setErr(e2?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [q, navigate]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-24 sm:py-32 relative">
      {/* Ambient aurora (no intrinsic size: width/height + centering set inline) */}
      <div
        className="covex-aurora"
        aria-hidden="true"
        style={{ top: 0, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 520, height: 260, maxWidth: '90vw', opacity: 0.5 }}
      />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div
          className="text-7xl sm:text-8xl font-black tracking-tight bg-gradient-to-b from-kaspa-green to-kaspa-green/40 light:from-teal-600 light:to-emerald-600 bg-clip-text text-transparent select-none"
          aria-hidden="true"
        >
          404
        </div>
        <h1 className="mt-4 text-xl sm:text-2xl font-bold text-white light:text-slate-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-gray-400 light:text-slate-500 max-w-md">
          That page does not exist. It may have moved, or the link was mistyped.
        </p>

        <form onSubmit={onSubmit} className="mt-6 w-full max-w-md flex gap-2" role="search">
          <label htmlFor="nf-search" className="sr-only">Search covenants</label>
          <input
            id="nf-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search covenants by name, txid, or category"
            className="flex-1 min-w-0 rounded-md bg-black/40 light:bg-white border border-white/10 light:border-slate-200 px-3 py-2 text-sm text-white light:text-slate-900 placeholder:text-gray-500 light:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-kaspa-green/60"
            autoComplete="off"
          />
          <Button type="submit" variant="kaspa" size="default" disabled={loading || !q.trim()}>
            {loading ? '...' : 'Search'}
          </Button>
        </form>

        {/* Result panels: zero / many. Single-match navigates directly (no panel). */}
        {err && (
          <div className="mt-3 text-xs text-red-400 light:text-red-600">{err}</div>
        )}
        {hits && hits.length === 0 && !err && (
          <div className="mt-4 text-sm text-gray-400 light:text-slate-500">
            Nothing matched.{' '}
            <Link to="/" className="text-kaspa-green underline underline-offset-2 hover:text-kaspa-green/80">
              Browse the Explorer.
            </Link>
          </div>
        )}
        {hits && hits.length > 1 && (
          <ul className="mt-4 w-full max-w-md text-left rounded-md border border-white/10 light:border-slate-200 bg-black/30 light:bg-white/80 divide-y divide-white/5 light:divide-slate-100 overflow-hidden">
            {hits.slice(0, 8).map((c) => (
              <li key={c.tx_id}>
                <Link
                  to={`/covenant/${encodeURIComponent(c.tx_id)}`}
                  className="block px-3 py-2 text-sm hover:bg-white/5 light:hover:bg-slate-50"
                >
                  <span className="text-white light:text-slate-900 font-medium">
                    {c.name || c.category || 'Covenant'}
                  </span>
                  <span className="ml-2 text-xs text-gray-500 light:text-slate-400 font-mono">
                    {String(c.tx_id).slice(0, 16)}...
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="kaspa" size="default" shimmer>
            <Link to="/">Back to Explorer</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/sandbox">Open the Sandbox</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
