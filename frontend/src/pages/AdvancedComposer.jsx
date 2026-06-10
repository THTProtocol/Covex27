import React, { useState, useEffect } from 'react';
import AdvancedPrimitivesComposer from '../lib/advanced-primitives/AdvancedPrimitivesComposer';
import MultiOracleConfigurator from '../lib/multi-oracle/MultiOracleConfigurator';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';

/**
 * Advanced Covenant Composer
 * Full visual + engineering tool for complex primitives.
 * GATED: only server-verified paid users can access the advanced composer.
 * Free users are redirected to Pricing. The best covenant creation tools live behind the paywall.
 */
export default function AdvancedComposer() {
  const navigate = useNavigate();
  const { address } = useWallet();

  // === SERVER AUTH GATE (same pattern as PremiumBuilder) ===
  const [auth, setAuth] = useState({ token: null, tier: null, loading: true });

  useEffect(() => {
    if (!address) {
      setAuth({ token: null, tier: 'FREE', loading: false });
      return;
    }
    setAuth(p => ({ ...p, loading: true }));
    const net = (typeof window !== 'undefined' && localStorage.getItem('kaspaNetwork')) || 'testnet-12';
    fetch('/api/auth-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, network: net })
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('auth failed')))
      .then(data => {
        if (data?.token && data?.tier && data.tier !== 'FREE') {
          setAuth({ token: data.token, tier: data.tier, loading: false });
        } else {
          setAuth({ token: null, tier: 'FREE', loading: false });
        }
      })
      .catch(() => setAuth({ token: null, tier: 'FREE', loading: false }));
  }, [address]);

  // Redirect free / unauthed to pricing (paywall)
  useEffect(() => {
    if (!auth.loading && (!auth.token || auth.tier === 'FREE')) {
      // Small delay so the UI doesn't flash; replace to avoid back-button loops
      const t = setTimeout(() => navigate('/pricing', { replace: true }), 10);
      return () => clearTimeout(t);
    }
  }, [auth.loading, auth.token, auth.tier, navigate]);

  const [advancedConfig, setAdvancedConfig] = useState({});
  const [multiOracleConfig, setMultiOracleConfig] = useState({});

  const handleSaveAndUse = () => {
    if (!address) {
      alert("Connect wallet first");
      return;
    }

    // Merge with base config and save to session (shared config protocol)
    const baseConfig = {
      version: "1.0",
      covenant: {
        id: crypto.randomUUID(),
        name: "Advanced Multi-Primitive Covenant",
        description: "Complex agreement built with advanced primitives and multi-oracle support",
        creatorAddress: address,
        reusable: true,
        allowTopups: true,
      },
      resolution: {
        mode: "oracle",
        circuit: { type: "merkle_membership" },
        oracle: { 
          provider: "multi", 
          multiOracle: multiOracleConfig 
        },
        payoutModel: { type: "proportional", feeBasisPoints: 150 },
        advancedPrimitives: advancedConfig,
      },
      ui: {
        templateId: "advanced-composer-v1",
        theme: { primaryColor: "#A855F7" }
      }
    };

    sessionStorage.setItem('pending_covenant_config', JSON.stringify(baseConfig));
    // This page is only reachable by paid users (server gate). Always send to the full paid Terminal/Studio.
    navigate('/premium?advanced=true');
  };

  if (auth.loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 text-center text-gray-400">
        Checking access...
      </div>
    );
  }

  // Extra safety: if somehow reached without paid, the redirect effect handles it.
  // Render nothing (or minimal) while redirecting.
  if (!auth.token || auth.tier === 'FREE') {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16 text-center">
        <p className="text-gray-400">Redirecting to Pricing...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white">Advanced Covenant Composer <span className="text-xs align-super text-emerald-400">PAID</span></h1>
        <p className="text-gray-300 mt-2 max-w-2xl">
          Build sophisticated agreements using time locks, multi-party approvals, cross-conditions, 
          dispute systems, and advanced payout logic. Advanced primitives for complex covenants - paid only.
        </p>
      </div>

      <AdvancedPrimitivesComposer 
        onChange={setAdvancedConfig} 
      />

      <div className="mt-8">
        <MultiOracleConfigurator 
          value={{ multiOracle: multiOracleConfig }} 
          onChange={setMultiOracleConfig} 
        />
      </div>

      <div className="mt-8 flex justify-end">
        <button 
          onClick={handleSaveAndUse}
          className="px-8 py-3 rounded-2xl bg-[#A855F7] text-white font-bold text-lg hover:bg-[#9333EA] active:scale-[0.985] transition"
        >
          Save Primitives &amp; Load into Terminal
        </button>
      </div>

      <div className="mt-6 text-xs text-gray-500 text-center">
        These settings will be merged into your covenant configuration using the shared config protocol and can be further refined in the Terminal (Covenant Studio) or sent to paid builder. Advanced visual tools for best-in-class covenants require paid access.
      </div>
    </div>
  );
}
