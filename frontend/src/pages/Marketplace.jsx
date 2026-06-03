import React, { useState } from 'react';
import { useWallet } from '../components/WalletContext';
import { COVENANT_TEMPLATES } from '../lib/templates/templates';

/**
 * Template Library (formerly Marketplace)
 * Browse and use high-quality pre-built covenant templates from the community and Covenant Studio.
 * Real monetization for template creators coming in a future phase.
 */
export default function TemplateLibrary() {
  const { address } = useWallet();
  const [saved, setSaved] = useState([]);

  const handleUseTemplate = (template) => {
    if (!address) {
      alert("Connect your wallet to load this template into the Terminal.");
      return;
    }
    const config = template.generateConfig(address);
    sessionStorage.setItem('pending_covenant_config', JSON.stringify(config));
    window.location.href = '/paid-deploy?template=' + template.id;
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-3">Covenant Template Library</h1>
        <p className="text-gray-300 max-w-xl mx-auto">
          Start fast with professional, audited covenant templates. Load them directly into the Covex Terminal,
          customize, and deploy. Created by the community using Covenant Studio.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {COVENANT_TEMPLATES.map((template) => {
          const isSaved = saved.some(s => s.id === template.id);
          return (
            <div key={template.id} className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 flex flex-col">
              <div className="text-4xl mb-4">{template.icon}</div>
              <h3 className="text-xl font-bold text-white mb-2">{template.name}</h3>
              <p className="text-gray-400 text-sm flex-1 mb-4">{template.description}</p>

              <div className="flex items-center justify-between text-xs mb-4">
                <span className="text-emerald-400">Community</span>
                <span className="text-gray-500">Recommended: {template.recommendedTier}</span>
              </div>

              <button
                onClick={() => handleUseTemplate(template)}
                className="w-full py-3 rounded-xl text-sm font-bold bg-[#49EACB] text-black hover:bg-[#3dd9b8] transition"
              >
                Load into Terminal
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-12 text-center text-sm text-gray-500">
        More templates (including paid ones from creators) will be added as the creator community grows.
      </div>
    </div>
  );
}
