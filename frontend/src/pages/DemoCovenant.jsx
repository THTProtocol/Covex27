import { useSearchParams } from 'react-router-dom';
import CovexTerminal from '../components/CovexTerminal';

// Demo covenants for Explorer demo cards.
// Provides a fake covenant object so the Terminal loads with full game arenas.
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

const POKER_DEMO = {
  ...DEMO_COVENANT_BASE,
  tx_id: 'demo-poker-v1-0000000000',
  name: 'Texas Hold\'em Pro Table (Demo)',
  description: 'Poker with hole cards, community, betting, oracle attested result.',
  covenant_type: 'PokerCovenant',
};

const BLACKJACK_DEMO = {
  ...DEMO_COVENANT_BASE,
  tx_id: 'demo-blackjack-v1-0000000',
  name: 'Blackjack Pro Table (Demo)',
  description: 'Play vs dealer with hit/stand. Oracle attested result.',
  covenant_type: 'BlackjackCovenant',
};

const RANGE_DEMO = {
  ...DEMO_COVENANT_BASE,
  tx_id: 'demo-range-v1-0000000000',
  name: 'Range Proof Verifier (Demo)',
  description: 'Prove a value is within bounds without revealing it.',
  covenant_type: 'RangeProofCovenant',
};

const DEMOS = {
  chess: DEMO_COVENANT_BASE,
  poker: POKER_DEMO,
  blackjack: BLACKJACK_DEMO,
  range: RANGE_DEMO,
};

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

  return <CovexTerminal covenant={DEMOS[demo]} />;
}
