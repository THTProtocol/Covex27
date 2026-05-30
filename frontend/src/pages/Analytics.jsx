import React, { useEffect, useState } from 'react';
import { useWallet } from '../components/WalletContext';
import { covex } from '../lib/sdk/CovexClient';

/**
 * Phase 18: Covenant Analytics & Reputation
 */
export default function Analytics() {
  const { address } = useWallet();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }

    covex.getAnalytics(address)
      .then(setData)
      .catch(() => {
        // Fallback to basic stats
        setData({
          total_covenants: 0,
          total_value_kas: 0,
          resolutions: 0,
          reputation_score: 42,
        });
      })
      .finally(() => setLoading(false));
  }, [address]);

  if (!address) {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center">
        <h1 className="text-3xl font-bold mb-4">Covenant Analytics</h1>
        <p className="text-gray-400">Connect your wallet to view your covenant analytics and reputation.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-white mb-2">Covenant Analytics</h1>
      <p className="text-gray-400 mb-8">Phase 18 — Platform Ecosystem</p>

      {loading ? (
        <div className="text-center py-12">Loading analytics...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6">
            <div className="text-sm text-gray-400">Your Covenants</div>
            <div className="text-4xl font-bold mt-2">{data?.total_covenants ?? '—'}</div>
          </div>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6">
            <div className="text-sm text-gray-400">Total Value Locked</div>
            <div className="text-4xl font-bold mt-2">{data?.total_value_kas ?? 0} KAS</div>
          </div>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6">
            <div className="text-sm text-gray-400">Resolutions</div>
            <div className="text-4xl font-bold mt-2">{data?.resolutions ?? 0}</div>
          </div>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6">
            <div className="text-sm text-gray-400">Reputation Score</div>
            <div className="text-4xl font-bold mt-2 text-kaspa-green">{data?.reputation_score ?? 0}</div>
          </div>
        </div>
      )}

      <div className="mt-12 text-xs text-gray-500">
        Full on-chain reputation and slashing coming in Phase 18 ecosystem expansion. 
        Data currently aggregated from public covenant index.
      </div>
    </div>
  );
}
