import React, { useState, useEffect, useCallback } from 'react';

const API = {
  async fetchGame(cId) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/game-state`)).json(); },
  async saveMove(cId, moves, turn) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/make-move`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({player:'', moves: JSON.stringify(moves), current_turn: turn}) }); },
  async joinGame(cId, p2) { return (await fetch(`/api/covenants/${encodeURIComponent(cId)}/join-game`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({player2: p2}) })).json(); },
  async resolveWinner(cId, w, c) { await fetch(`/api/covenants/${encodeURIComponent(cId)}/resolve-winner`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({winner:w, claimer:c}) }); },
};

const VARIANT_META = {
  escrow:             { name: 'Two-Party Escrow', icon: '🤝', desc: 'Mutual release. Both must approve.' },
  arbitrated:         { name: 'Arbitrated Escrow', icon: '⚖️', desc: '2-of-3 approval with arbitrator.' },
  timed:              { name: 'Timed Escrow', icon: '⏰', desc: 'Auto-release after timelock expires.' },
  milestone:          { name: 'Milestone Escrow', icon: '📋', desc: 'Phase-based release. Approve each milestone.' },
  linear_vesting:     { name: 'Linear Vesting', icon: '📈', desc: 'Tokens unlock linearly over time.' },
  cliff:              { name: 'Cliff Vesting', icon: '🧗', desc: 'Full lock then full release.' },
  reversible:         { name: 'Reversible Vesting', icon: '↩️', desc: 'Admin can revoke vesting.' },
  subscription:       { name: 'Subscription Escrow', icon: '🔄', desc: 'Recurring auto-release.' },
  puzzle:             { name: 'Puzzle Bounty', icon: '🧩', desc: 'Solve puzzle to claim.' },
  bugbounty:          { name: 'Bug Bounty', icon: '🐛', desc: 'Report bugs. Get paid from pool.' },
  predict_yesno:      { name: 'Prediction (Yes/No)', icon: '📊', desc: 'Bet on binary outcome.' },
  predict_multi:      { name: 'Prediction (Multi)', icon: '📈', desc: 'Multiple outcome bets.' },
  tournament:         { name: 'Tournament Bracket', icon: '🏁', desc: 'Bracket elimination. Tiered prizes.' },
  hackathon:          { name: 'Hackathon Pool', icon: '💻', desc: 'Multi-prize submission pool.' },
  crowdfund:          { name: 'Crowdfund Goal', icon: '🎯', desc: 'All-or-nothing fundraising.' },
  sports:             { name: 'Sports Bet', icon: '⚽', desc: 'Oracle-resolved match bet.' },
  multisig:           { name: 'Multi-Sig Wallet', icon: '🔑', desc: 'M-of-N signature approval.' },
  multisig_custom:    { name: 'Custom Multi-Sig', icon: '⚙️', desc: 'Configurable threshold.' },
  communitypool:      { name: 'Community Pool', icon: '🏊', desc: 'Weighted voting on proposals.' },
  liquidity:          { name: 'Liquidity Pool', icon: '🌊', desc: 'Simple AMM with fee distribution.' },
  staking:            { name: 'Staking Pool', icon: '📈', desc: 'Lock KAS for yield.' },
  grantdao:           { name: 'Grant DAO', icon: '🎓', desc: 'Token-weighted grant voting.' },
  revenuesplit:       { name: 'Revenue Split', icon: '📊', desc: 'Auto-split by fixed percentages.' },
  timelock:           { name: 'Timelock', icon: '🔒', desc: 'Lock until block height or timestamp.' },
  streaming:          { name: 'Streaming Payment', icon: '💧', desc: 'Per-block continuous stream.' },
  conditional:        { name: 'Conditional Payment', icon: '❓', desc: 'Oracle-determined payout.' },
  htlc:               { name: 'HTLC', icon: '⛓️', desc: 'Atomic swap-compatible timelock.' },
  charitypool:        { name: 'Charity Pool', icon: '💝', desc: 'Community-voted disbursement.' },
  savings:            { name: 'Savings Lock', icon: '🏦', desc: 'Self-lock with penalty.' },
  inheritance:        { name: 'Digital Inheritance', icon: '📜', desc: 'Auto-transfer after inactivity.' },
  subscription_simple:{ name: 'Subscription', icon: '📆', desc: 'Recurring auto-payment.' },
  kickstarter:        { name: 'Fundraiser', icon: '🚀', desc: 'Goal-based all-or-nothing.' },
  payroll:            { name: 'Payroll', icon: '💼', desc: 'Batch salary auto-pay.' },
  royalty:            { name: 'Royalty Split', icon: '🎨', desc: 'Multi-creator distribution.' },
  will:               { name: 'Decentralized Will', icon: '⚰️', desc: 'Multi-sig inheritance.' },
  airdrop:            { name: 'Airdrop Manager', icon: '🪂', desc: 'Batch token distribution.' },
  trivia:             { name: 'Trivia Challenge', icon: '❓', desc: 'Answer questions. Most points wins.' },
};

export default function GenericEscrowGame({ covenantId, covenant, userAddress }) {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [escrowData, setEscrowData] = useState({ approvals: {}, stage: 'pending' });
  const [currentPlayer, setCurrentPlayer] = useState('player1');
  const [actionInput, setActionInput] = useState('');

  const variant = covenant?.config?.variant || 'escrow';
  const meta = VARIANT_META[variant] || { name: 'Smart Contract', icon: '📋', desc: 'Interactive covenant on the Kaspa BlockDAG.' };

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        try { const m = typeof data.moves === 'string' ? JSON.parse(data.moves) : data.moves; if (m) { setEscrowData(m); if (m.currentPlayer) setCurrentPlayer(m.currentPlayer); } } catch(_){}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const handleAction = useCallback(async (action, value) => {
    if (!gameState || gameState.winner) return;
    if (!userAddress) { setMessage('Connect wallet'); return; }

    const newApprovals = { ...escrowData.approvals, [userAddress]: action };
    const newStage = action === 'approve' ? 
      (Object.keys(newApprovals).filter(k => newApprovals[k] === 'approve').length >= 2 ? 'released' : escrowData.stage) :
      action === 'reject' ? 'disputed' : escrowData.stage;

    const newData = { ...escrowData, approvals: newApprovals, stage: newStage, currentPlayer: currentPlayer === 'player1' ? 'player2' : 'player1' };
    setEscrowData(newData);
    setCurrentPlayer(newData.currentPlayer);

    API.saveMove(covenantId, newData, newData.currentPlayer).catch(() => {});

    if (newStage === 'released') {
      API.resolveWinner(covenantId, gameState.player2 || userAddress, userAddress || '').catch(() => {});
      setGameState(prev => ({ ...prev, winner: gameState.player2 || userAddress }));
      setMessage('Funds released!');
    } else if (action === 'reject') {
      setMessage('Escrow disputed.');
    } else {
      setMessage(`${action === 'approve' ? 'Approved!' : 'Claim submitted!'}`);
    }
  }, [gameState, escrowData, currentPlayer, userAddress, covenantId]);

  if (loading) return <div className="text-center text-gray-400 py-8">Loading...</div>;
  if (!gameState) return <div className="text-center text-gray-400 py-8">No data.</div>;

  if (gameState.winner) {
    return (
      <div className="p-6 border border-yellow-500/30 bg-yellow-500/5 rounded-2xl text-center">
        <div className="text-5xl mb-3">{meta.icon}</div>
        <p className="text-yellow-400 font-bold text-lg">{meta.name} — Executed</p>
        <code className="text-xs text-yellow-300 mt-2 block">Recipient: {gameState.winner.slice(0, 20)}</code>
        <p className="text-[#49EACB] font-bold mt-2">{gameState.pot_amount_kas} KAS</p>
      </div>
    );
  }

  const approvals = Object.values(escrowData.approvals || {}).filter(v => v === 'approve').length;
  const totalSigners = covenant?.config?.required || 2;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${escrowData.stage === 'pending' ? 'bg-amber-400 animate-pulse' : escrowData.stage === 'released' ? 'bg-green-400' : 'bg-red-400'}`} />
        <span className="text-sm font-bold text-gray-300 uppercase">{escrowData.stage}</span>
        <span className="text-xs text-gray-500">|</span>
        <span className="text-xs text-[#49EACB]">Locked: {gameState.pot_amount_kas} KAS</span>
      </div>

      <div className="p-6 border border-[#49EACB]/20 bg-zinc-900/80 rounded-2xl max-w-md w-full shadow-[0_0_30px_rgba(73,234,203,0.1)]">
        <div className="text-4xl text-center mb-4">{meta.icon}</div>
        <h3 className="text-lg font-bold text-white text-center mb-2">{meta.name}</h3>
        <p className="text-gray-400 text-sm text-center mb-6">{meta.desc}</p>

        {/* Approval progress */}
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>Approvals</span>
            <span>{approvals} / {totalSigners}</span>
          </div>
          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-[#49EACB] rounded-full transition-all" style={{ width: `${(approvals / totalSigners) * 100}%` }} />
          </div>
        </div>

        {/* Signers */}
        <div className="space-y-2 mb-4">
          <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/40 flex items-center justify-between">
            <code className="text-xs text-gray-400">{gameState.player1.slice(0, 14)}...</code>
            <span className="text-[10px] text-gray-500">{escrowData.approvals?.[gameState.player1] || 'pending'}</span>
          </div>
          {gameState.player2 && (
            <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/40 flex items-center justify-between">
              <code className="text-xs text-gray-400">{gameState.player2.slice(0, 14)}...</code>
              <span className="text-[10px] text-gray-500">{escrowData.approvals?.[gameState.player2] || 'pending'}</span>
            </div>
          )}
        </div>

        {escrowData.stage === 'pending' && userAddress && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleAction('approve', true)}
              className="px-4 py-3 bg-[#49EACB] hover:bg-[#3cd8b6] text-black font-bold rounded-xl shadow-[0_0_15px_rgba(73,234,203,0.3)] transition-all text-sm">
              Approve Release
            </button>
            <button onClick={() => handleAction('reject', true)}
              className="px-4 py-3 border border-red-500/30 bg-red-500/5 text-red-400 font-bold rounded-xl hover:bg-red-500/10 transition-all text-sm">
              Dispute / Reject
            </button>
            <button onClick={() => handleAction('claim', true)}
              className="col-span-2 px-4 py-2 border border-zinc-600 text-gray-400 text-sm font-bold rounded-xl hover:border-zinc-400 transition-all">
              Submit Claim
            </button>
          </div>
        )}

        {escrowData.stage === 'disputed' && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
            <p className="text-red-400 text-sm">Disputed. Awaiting arbitrator resolution.</p>
          </div>
        )}
      </div>

      {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center w-full max-w-xs">{message}</div>}
    </div>
  );
}
