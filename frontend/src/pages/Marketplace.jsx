import React, { useState } from 'react';
import { useWallet } from '../components/WalletContext';
import { COVENANT_TEMPLATES } from '../lib/templates/templates';
import { covex } from '../lib/sdk/CovexClient';

/**
 * Phase 18: Template Marketplace
 * Creators can browse, publish, and monetize templates.
 */
export default function Marketplace() {
  const { address } = useWallet();
  const [published, setPublished] = useState([]);
  const [publishingId, setPublishingId] = useState(null);

  const handlePublish = async (template) => {
    if (!address) {
      alert("Connect your wallet to publish templates.");
      return;
    }

    setPublishingId(template.id);
    try {
      const config = template.generateConfig(address);
      const res = await fetch('/api/marketplace/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          author: address,
          price_kas: 10,
          config
        })
      });
      const result = await res.json();
      
      if (result.success) {
        setPublished([...published, { ...template, marketplaceId: result.id }]);
        alert(`Template "${template.name}" published successfully! ID: ${result.id}\n\nNote: Full monetization and discovery coming in next iteration.`);
      } else {
        alert("Publish failed: " + (result.error || result.message));
      }
    } catch (e) {
      alert("Failed to publish: " + e.message);
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-3">Covenant Template Marketplace</h1>
        <p className="text-gray-300 max-w-xl mx-auto">
          Discover, use, and publish professional covenant templates. 
          Earn from your creations. Built on the Phase 11 config protocol.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {COVENANT_TEMPLATES.map((template) => {
          const isPublished = published.some(p => p.id === template.id);
          return (
            <div key={template.id} className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 flex flex-col">
              <div className="text-4xl mb-4">{template.icon}</div>
              <h3 className="text-xl font-bold text-white mb-2">{template.name}</h3>
              <p className="text-gray-400 text-sm flex-1 mb-4">{template.description}</p>

              <div className="flex items-center justify-between text-xs mb-4">
                <span className="text-emerald-400">By community</span>
                <span className="text-gray-500">{template.recommendedTier} tier</span>
              </div>

              <button
                onClick={() => handlePublish(template)}
                disabled={isPublished || publishingId === template.id}
                className="w-full py-3 rounded-xl text-sm font-bold bg-[#49EACB] text-black disabled:opacity-60 hover:bg-[#3dd9b8] transition"
              >
                {isPublished ? 'Published ✓' : publishingId === template.id ? 'Publishing...' : 'Publish to Marketplace (10 KAS)'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-12 text-center text-sm text-gray-500">
        Marketplace powered by Covex SDK (Phase 18). Real monetization and on-chain publishing coming with ecosystem growth.
      </div>
    </div>
  );
}
