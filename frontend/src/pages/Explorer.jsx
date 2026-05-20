import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

const KAS = (s) => (s/1e8).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const TRUNC = (s,n=10) => s.length>n*2+2?`${s.slice(0,n)}...${s.slice(-n)}`:s;

const TIER_COLORS = {
  FREE:  'bg-gray-500/10 text-gray-400 border-gray-500/20',
  BASIC: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PRO:   'bg-kaspa-gold/10 text-kaspa-gold border-kaspa-gold/20',
  ELITE: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

export default function Explorer() {
  const [utxos, setUtxos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const scan = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/utxos');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setUtxos(d.utxos ?? []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  const tiers = ['all','ELITE','PRO','BASIC','FREE'];
  const filtered = filter === 'all' ? utxos : utxos.filter(u => (u.tier||'FREE') === filter);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-10">
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white tracking-tight">Covenants</h1>
          <p className="text-sm text-gray-400 mt-1">{utxos.length} covenant types indexed from the Kaspa BlockDAG</p>
        </div>
        <button onClick={scan} disabled={loading}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${loading?'bg-white/[0.04] text-gray-500 cursor-not-allowed':'bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/30 hover:bg-kaspa-green/20 active:scale-[0.97]'}`}>
          {loading
            ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Scanning</>
            : <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 11-2.2-6"/><path d="M21 3v6h-6"/></svg> Scan Node</>
          }
        </button>
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {tiers.map(t => (
          <button key={t} onClick={()=>setFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${filter===t?'bg-white/10 text-white border border-white/20':'bg-white/[0.03] text-gray-500 border border-white/5 hover:text-gray-300'}`}>
            {t === 'all' ? 'All' : `${t} ${t==='FREE'?'':'('+(t==='ELITE'?10000:t==='PRO'?1000:100)+' KAS)'}`}
          </button>
        ))}
      </div>

      {error && <div className="mb-6 px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      {!loading && !error && utxos.length===0 && (
        <div className="glass px-10 py-16 text-center">
          <p className="text-gray-500 text-sm">No covenant UTXOs found.</p>
          <p className="text-gray-600 text-xs mt-1">Ensure the backend is running and a wRPC node is reachable.</p>
        </div>
      )}

      {filtered.length>0 && (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Covenant','Category','Locked KAS','Tier','Action'].map(h=>(
                    <th key={h} className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(u=>(
                  <tr key={u.tx_id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {u.image ? (
                          <img src={u.image} alt="" className="h-8 w-8 rounded-lg object-cover border border-white/10" />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center">
                            <svg className="h-3.5 w-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          </div>
                        )}
                        <div>
                          <Link to={`/covenant/${u.tx_id}`} className="text-kaspa-green font-mono text-xs hover:underline font-medium">{u.name||TRUNC(u.tx_id)}</Link>
                          {u.description && <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">{u.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-white/5 text-gray-300 border border-white/10">{u.category||'General'}</span>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-white tabular-nums">{KAS(u.amount_sompi)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${TIER_COLORS[u.tier]||TIER_COLORS.FREE}`}>{u.tier||'FREE'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <Link to={`/covenant/${u.tx_id}`} className="text-xs font-medium text-gray-400 hover:text-kaspa-green transition-colors">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-white/5 text-xs text-gray-600">
            {filtered.length} covenant{filtered.length!==1?'s':''}
          </div>
        </div>
      )}
    </div>
  );
}
