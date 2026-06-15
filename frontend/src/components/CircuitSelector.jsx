import { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';

// CircuitSelector: a free, searchable, categorized picker over every covenant circuit/primitive.
// Selecting one drives the whole sandbox live (banner + how-it-resolves + payout simulator + the
// builder below all follow). No wallet, no payment to browse and preview.

// Reality -> dot colour, matching the rest of the app's honest reality palette.
const REALITY_DOT = {
  'on-chain': '#49EACB',
  'full-zk': '#49EACB',
  'hybrid': '#F59E0B',
  'oracle-attested': '#38BDF8',
};

export default function CircuitSelector({ circuits, selectedId, onSelect }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');

  const cats = useMemo(
    () => ['All', ...Array.from(new Set(circuits.map((c) => c.category).filter(Boolean))).sort()],
    [circuits]
  );

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return circuits.filter(
      (c) =>
        (cat === 'All' || c.category === cat) &&
        (!s || `${c.name} ${c.id} ${c.description} ${c.category}`.toLowerCase().includes(s))
    );
  }, [circuits, q, cat]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 flex flex-col" style={{ maxHeight: 'clamp(320px, 60vh, 640px)' }}>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Search size={14} className="text-gray-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search circuits, primitives, games…"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 outline-none"
        />
        <span className="text-[10px] text-gray-500 tabular-nums">{shown.length}</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
              cat === c
                ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green'
                : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="overflow-y-auto pr-1 space-y-1.5 flex-1">
        {shown.map((c) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full text-left rounded-xl border px-3 py-2 transition ${
                active
                  ? 'border-kaspa-green bg-kaspa-green/[0.08]'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${c.reality === 'full-zk' ? 'shadow-[0_0_6px_rgba(73,234,203,0.9)]' : ''}`}
                  style={{ background: REALITY_DOT[c.reality] || '#94a3b8' }}
                />
                <span className="text-sm text-white font-medium truncate">{c.name}</span>
                {c.reality === 'full-zk' && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded bg-kaspa-green/15 text-kaspa-green border border-kaspa-green/30 tracking-wide">
                    ZK<Check size={9} />
                  </span>
                )}
                {active && <Check size={13} className="text-kaspa-green ml-auto shrink-0" />}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                {c.category} · {c.reality}
              </div>
            </button>
          );
        })}
        {shown.length === 0 && (
          <div className="text-center text-xs text-gray-500 py-6">No circuits match your search.</div>
        )}
      </div>
    </div>
  );
}
