import React, { useState } from 'react';
import AdvancedPrimitivesComposer from '../lib/advanced-primitives/AdvancedPrimitivesComposer';
import MultiOracleConfigurator from '../lib/multi-oracle/MultiOracleConfigurator';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';

/**
 * Advanced Covenant Composer
 * Full visual + engineering tool for complex primitives.
 */
export default function AdvancedComposer() {
  const navigate = useNavigate();
  const { address } = useWallet();
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
    // Paid users go to premium, free users to deploy
    const tier = localStorage.getItem('covex_paid_tier');
    if (tier && tier !== 'FREE') {
      navigate('/premium?advanced=true');
    } else {
      navigate('/deploy?advanced=true');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white">Advanced Covenant Composer</h1>
        <p className="text-gray-300 mt-2 max-w-2xl">
          Build sophisticated agreements using time locks, multi-party approvals, cross-conditions, 
          dispute systems, and advanced payout logic. This is the engineering power surface.
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
        These settings will be merged into your covenant configuration using the shared config protocol and can be further refined in the Terminal or sent to Covenant Studio.
      </div>
    </div>
  );
}
