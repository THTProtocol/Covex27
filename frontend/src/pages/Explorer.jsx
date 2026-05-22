import React, { useEffect, useState } from 'react';

const Explorer = () => {
  const [covenants, setCovenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/covenants')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data.covenants) ? data.covenants : [];
        setCovenants(list);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError("Could not load covenants");
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold mb-2">Covenant Explorer</h1>
      <p className="text-gray-400 mb-8">Live covenants on Kaspa Testnet-12 (Toccata)</p>

      {loading && <p className="text-lg">Loading from the BlockDAG...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && covenants.length === 0 && (
        <div className="bg-zinc-900 p-8 rounded-xl text-center">
          <p className="text-xl">No covenants detected yet.</p>
          <p className="text-gray-500 mt-2">The Kaspa node is still syncing. Covenants will appear automatically.</p>
        </div>
      )}

      {covenants.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {covenants.map((c, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl hover:border-emerald-500 transition-colors">
              <h3 className="font-semibold text-lg">{c.name || 'Unnamed Covenant'}</h3>
              <p className="text-sm text-gray-400 mt-1">{c.description || 'No description'}</p>
              {c.tier && <span className="inline-block mt-3 px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">{c.tier}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Explorer;
