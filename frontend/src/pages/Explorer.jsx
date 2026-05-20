import { useState, useEffect, useCallback } from 'react';

/* ───────────────────────────────────────────────────────────────────
   Explorer — main data table with glassmorphism
   ─────────────────────────────────────────────────────────────────── */

const KAS = (sompi) => (sompi / 100_000_000).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const truncate = (s, n = 10) =>
  s.length > n * 2 + 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;

const STATE_LABEL = {
  coinbase: 'Coinbase',
  active: 'Active',
};

function stateFrom(isCoinbase) {
  return isCoinbase ? 'coinbase' : 'active';
}

/* ── Skeleton row ───────────────────────────────────────────────── */

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-white/[0.06] rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

/* ── Main component ──────────────────────────────────────────────── */

export default function Explorer() {
  const [utxos, setUtxos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/utxos');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUtxos(data.utxos ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-scan on mount
  useEffect(() => {
    scan();
  }, [scan]);

  const isEmpty = !loading && !error && utxos.length === 0;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-10">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-white tracking-tight">
            Covenants
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time covenant UTXOs from the Kaspa DAG
          </p>
        </div>

        <button
          onClick={scan}
          disabled={loading}
          className={`
            px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
            flex items-center gap-2
            ${loading
              ? 'bg-white/[0.04] text-gray-500 cursor-not-allowed'
              : 'bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/30 hover:bg-kaspa-green/20 hover:border-kaspa-green/50 active:scale-[0.97]'
            }
          `}
        >
          {/* Spinner icon when loading */}
          {loading ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12a9 9 0 11-2.2-6" />
              <path d="M21 3v6h-6" />
            </svg>
          )}
          {loading ? 'Scanning…' : 'Scan Node'}
        </button>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          Failed to fetch UTXOs: {error}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────── */}
      {isEmpty && (
        <div className="glass px-10 py-16 text-center">
          <p className="text-gray-500 text-sm">No covenant UTXOs found.</p>
          <p className="text-gray-600 text-xs mt-1">
            Ensure the backend is running and a wRPC node is reachable.
          </p>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────── */}
      {utxos.length > 0 && (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['ID', 'Type', 'Locked KAS', 'State', 'Address'].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                  : utxos.map((utxo) => (
                      <tr
                        key={`${utxo.tx_id}-${utxo.index}`}
                        className="hover:bg-white/[0.03] transition-colors"
                      >
                        {/* ID — link to detail page */}
                        <td className="px-6 py-4 font-mono text-xs text-kaspa-green">
                          <a
                            href={`/covenant/${utxo.tx_id}`}
                            className="hover:underline"
                          >
                            {truncate(utxo.tx_id, 8)}
                          </a>
                        </td>

                        {/* Type */}
                        <td className="px-6 py-4">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-kaspa-gold/10 text-kaspa-gold border border-kaspa-gold/20">
                            UTXO
                          </span>
                        </td>

                        {/* Locked KAS */}
                        <td className="px-6 py-4 font-mono text-sm text-white tabular-nums">
                          {KAS(utxo.amount_sompi)}
                        </td>

                        {/* State */}
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              utxo.is_coinbase
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {STATE_LABEL[stateFrom(utxo.is_coinbase)]}
                          </span>
                        </td>

                        {/* Address */}
                        <td className="px-6 py-4 font-mono text-xs text-gray-400">
                          {truncate(utxo.address, 8)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-white/5 text-xs text-gray-600">
            {utxos.length} UTXO{utxos.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
