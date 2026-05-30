import React from 'react';

/**
 * Phase 18: Light Governance
 */
export default function Governance() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-white mb-4">Covex Governance</h1>
      <p className="text-gray-300 mb-8">
        Phase 18 — Light, transparent governance for the ecosystem.
      </p>

      <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 mb-8">
        <h2 className="text-xl font-semibold mb-4">Current Proposals (Mock)</h2>
        
        <div className="space-y-4">
          <div className="p-4 border border-white/10 rounded-xl">
            <div className="font-medium">Add Age Verification as a recommended circuit</div>
            <div className="text-sm text-gray-400 mt-1">Status: Voting open • Ends in 7 days</div>
            <div className="mt-3 flex gap-3">
              <button className="px-4 py-1 text-sm bg-emerald-500/20 text-emerald-400 rounded">Vote Yes</button>
              <button className="px-4 py-1 text-sm bg-red-500/20 text-red-400 rounded">Vote No</button>
            </div>
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500">
        Governance is currently advisory. Full on-chain voting with token-weighted or reputation-based systems 
        will be introduced as the ecosystem matures (late Phase 18).
      </div>
    </div>
  );
}
