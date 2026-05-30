import React from 'react';

export default function HowCovexWorks() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 text-white">
      <h1 className="text-4xl font-bold mb-8">How Covex Works</h1>

      <div className="space-y-8 text-lg">
        <div>
          <h2 className="text-2xl font-semibold text-[#49EACB] mb-2">1. Design in Covenant Studio</h2>
          <p>Use the visual editor (Covenant Studio) to create beautiful interactive UIs for your covenant (chess, custom dashboards, etc.). Export the bundle.</p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-[#49EACB] mb-2">2. Pay Once for a Tier (BUILDER / PRO / MAX)</h2>
          <p>Send KAS one-time to the treasury. BUILDER (100 KAS) unlocks the full Terminal. Higher tiers give your covenant better visibility and ranking on the Explorer.</p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-[#49EACB] mb-2">3. Configure & Deploy in the Covex Terminal</h2>
          <p>Paste your UI from Studio, choose ZK circuit or oracle, set fees, generate SilverScript, and deploy your covenant on-chain.</p>
        </div>

        <div>
          <h2 className="text-2xl font-semibold text-[#49EACB] mb-2">4. Players Interact Directly</h2>
          <p>Users visit your covenant page and play/interact using the custom UI you provided. Everything is non-custodial.</p>
        </div>
      </div>

      <p className="mt-12 text-sm text-gray-400">No subscriptions. One-time payment. Full Terminal access on all paid tiers. Only visibility differs.</p>
    </div>
  );
}
