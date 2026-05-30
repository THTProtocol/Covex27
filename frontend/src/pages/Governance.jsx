import React, { useState } from 'react';

/**
 * Phase 18: Light Governance (Functional stub)
 */
export default function Governance() {
  const [votes, setVotes] = useState({});

  const proposals = [
    {
      id: 1,
      title: "Add Age Verification as a recommended circuit",
      description: "Make Age Verification a first-class, recommended option in the Terminal and templates.",
      endsIn: "7 days"
    },
    {
      id: 2,
      title: "Lower platform fee for templates under 50 KAS",
      description: "Reduce the platform cut on small templates to encourage more creators.",
      endsIn: "12 days"
    }
  ];

  const vote = (proposalId, voteType) => {
    setVotes(prev => ({
      ...prev,
      [proposalId]: voteType
    }));
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold text-white mb-4">Covex Governance</h1>
      <p className="text-gray-300 mb-8">
        Phase 18 — Light, transparent governance for the ecosystem.
      </p>

      <div className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 mb-8">
        <h2 className="text-xl font-semibold mb-4">Current Proposals</h2>
        
        <div className="space-y-6">
          {proposals.map(proposal => (
            <div key={proposal.id} className="p-4 border border-white/10 rounded-xl">
              <div className="font-medium text-lg">{proposal.title}</div>
              <div className="text-sm text-gray-400 mt-1">{proposal.description}</div>
              <div className="text-xs text-gray-500 mt-2">Voting ends in {proposal.endsIn}</div>
              
              <div className="mt-4 flex gap-3">
                <button 
                  onClick={() => vote(proposal.id, 'yes')}
                  className={`px-4 py-1.5 text-sm rounded-xl transition ${votes[proposal.id] === 'yes' ? 'bg-emerald-500 text-white' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}
                >
                  Vote Yes
                </button>
                <button 
                  onClick={() => vote(proposal.id, 'no')}
                  className={`px-4 py-1.5 text-sm rounded-xl transition ${votes[proposal.id] === 'no' ? 'bg-red-500 text-white' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                >
                  Vote No
                </button>
                {votes[proposal.id] && (
                  <span className="ml-3 text-xs text-gray-400 self-center">Your vote: {votes[proposal.id]}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-sm text-gray-500">
        This is a functional early governance surface. Votes are stored locally for now. 
        Full on-chain / reputation-weighted governance will be introduced as the ecosystem matures.
      </div>
    </div>
  );
}
