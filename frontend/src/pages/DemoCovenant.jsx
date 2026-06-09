import { useSearchParams, useState } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import FullScreenChess from '../components/FullScreenChess';
import CovexTerminal from '../components/CovexTerminal';

// Demo covenants for Explorer demo cards.
// For chess: clean full screen chess lobby as requested (board + timer + rules table + stake).
// Other demos use terminal for now.
const DEMO_COVENANT_BASE = {
  tx_id: 'demo-chess-v1-0000000000',
  name: 'ZK Chess Duel (Demo)',
  description: 'Play chess after equal stakes. Oracle attested result.',
  covenant_type: 'ChessDuelCovenant',
  category: 'game',
  amount_kaspa: 200,
  verified_tier: 'BUILDER',
  creator_addr: 'kaspatest:demo-creator',
  script_hash: '0x0000',
  block_daa_score: 999999,
};

const POKER_DEMO = { ...DEMO_COVENANT_BASE, tx_id: 'demo-poker-v1-0000000000', name: 'Texas Hold\'em Pro Table (Demo)', description: 'Poker with hole cards, community, betting, oracle attested result.', covenant_type: 'PokerCovenant' };
const BLACKJACK_DEMO = { ...DEMO_COVENANT_BASE, tx_id: 'demo-blackjack-v1-0000000', name: 'Blackjack Pro Table (Demo)', description: 'Play vs dealer with hit/stand. Oracle attested result.', covenant_type: 'BlackjackCovenant' };
const RANGE_DEMO = { ...DEMO_COVENANT_BASE, tx_id: 'demo-range-v1-0000000000', name: 'Range Proof Verifier (Demo)', description: 'Prove a value is within bounds without revealing it.', covenant_type: 'RangeProofCovenant' };

const DEMOS = { chess: DEMO_COVENANT_BASE, poker: POKER_DEMO, blackjack: BLACKJACK_DEMO, range: RANGE_DEMO };

function CleanChessDemo() {
  const [chessStake, setChessStake] = useState(50);
  const [showArena, setShowArena] = useState(false);

  if (showArena) {
    return (
      <FullScreenChess 
        stake={chessStake} 
        onClose={() => setShowArena(false)} 
        covenantId={DEMO_COVENANT_BASE.tx_id} 
        creatorAddr={DEMO_COVENANT_BASE.creator_addr} 
        feePercent={2} 
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="text-center mb-6">
        <div className="text-emerald-400 text-sm tracking-[3px] font-bold">10 MIN WINNER TAKES ALL CHESS ARENA (DEMO)</div>
        <div className="text-4xl font-semibold text-white mt-2">Full Screen Chess</div>
      </div>

      {/* Timers */}
      <div className="flex gap-8 justify-center mb-6">
        <div className="text-center p-4 rounded-2xl bg-black/60 border border-emerald-500/30">
          <div className="text-xs text-gray-400">WHITE</div>
          <div className="font-mono text-5xl text-emerald-400">10:00</div>
        </div>
        <div className="text-center p-4 rounded-2xl bg-black/60 border border-emerald-500/30">
          <div className="text-xs text-gray-400">BLACK</div>
          <div className="font-mono text-5xl text-emerald-400">10:00</div>
        </div>
      </div>

      {/* ONE large chess.com board - the full screen game visual */}
      <div className="flex justify-center mb-8">
        <div className="rounded-2xl overflow-hidden border-2 border-emerald-500/30 shadow-2xl">
          <Chessboard
            position="start"
            boardWidth={620}
            customDarkSquareStyle={{ backgroundColor: '#b58863' }}
            customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
            customBoardStyle={{ borderRadius: '6px' }}
            customNotationStyle={{ color: '#3f2a1d', fontSize: '14px', fontWeight: 600 }}
          />
        </div>
      </div>

      {/* Rules table - clean, all rules, straightforward */}
      <div className="max-w-3xl mx-auto mb-8">
        <div className="text-sm font-bold text-emerald-400 mb-2 tracking-widest text-center">RULES</div>
        <table className="w-full text-sm border border-emerald-500/30 rounded-xl overflow-hidden bg-black/40 text-emerald-100">
          <tbody>
            <tr className="border-b border-emerald-500/20"><td className="p-3 font-semibold">Game Length</td><td className="p-3">10 minutes per player. Your clock runs only on your turn.</td></tr>
            <tr className="border-b border-emerald-500/20"><td className="p-3 font-semibold">Staking</td><td className="p-3">Write any amount. Opponent must match exactly.</td></tr>
            <tr className="border-b border-emerald-500/20"><td className="p-3 font-semibold">Join Window</td><td className="p-3">5 minutes to match or your stake returns automatically.</td></tr>
            <tr className="border-b border-emerald-500/20"><td className="p-3 font-semibold">How It Ends</td><td className="p-3">Resign, timeout, or checkmate.</td></tr>
            <tr className="border-b border-emerald-500/20"><td className="p-3 font-semibold">Payout</td><td className="p-3">Winner gets pot minus 2% to creator address (keeps arena alive for next games).</td></tr>
            <tr><td className="p-3 font-semibold">Verification</td><td className="p-3">Every move proven with chess_v1 ZK circuit. Oracle detects lies and rejects invalid results.</td></tr>
          </tbody>
        </table>
        <div className="text-center text-xs text-emerald-300/70 mt-2">Fully transparent • Non-custodial • Direct to covenant on Kaspa</div>
      </div>

      {/* Single straightforward stake input - ready to stake and wait */}
      <div className="max-w-sm mx-auto">
        <div className="text-xs text-gray-400 mb-1.5 text-center tracking-widest">HOW MUCH KAS DO YOU WANT TO STAKE?</div>
        <input 
          type="number" 
          value={chessStake} 
          onChange={e => setChessStake(Math.max(1, parseInt(e.target.value) || 1))} 
          className="w-full text-center text-5xl font-mono p-4 rounded-3xl bg-black/60 border-2 border-emerald-500/40 focus:border-emerald-500 mb-3" 
        />
        <button 
          onClick={() => setShowArena(true)} 
          className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xl rounded-3xl active:scale-[0.985] shadow-lg"
        >
          STAKE AND WAIT FOR OPPONENT
        </button>
        <div className="text-center text-xs text-gray-500 mt-2">Opens the full interactive arena. Opponent matches or funds return in 5 min.</div>
      </div>
    </div>
  );
}

export default function DemoCovenantWrapper() {
  const [searchParams] = useSearchParams();
  const demo = searchParams.get('demo');

  if (!demo || !DEMOS[demo]) {
    return (
      <div className="p-20 text-center">
        <p className="text-gray-300 text-lg">Demo not found. Available: chess, poker, blackjack, range</p>
        <a href="/" className="text-kaspa-green hover:underline mt-4 inline-block">Return to Explorer</a>
      </div>
    );
  }

  if (demo === 'chess') {
    return <CleanChessDemo />;
  }

  return <CovexTerminal covenant={DEMOS[demo]} />;
}
