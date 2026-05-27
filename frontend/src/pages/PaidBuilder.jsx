import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../components/WalletContext';
import {
  ArrowLeft, Terminal, Cpu, Zap, ShieldCheck, ExternalLink, BookOpen,
  Code, Key, Wrench, Rocket, ChevronRight, Layers, Sparkles,
  RefreshCw, Loader2, Link2, Palette, Repeat, Percent, Gauge,
  Play, FileCode, ArrowRight
} from 'lucide-react';

const TRUNC = (s, n = 8) => s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-4)}` : s || 'N/A';

const GUIDE_SECTIONS = [
  {
    icon: Cpu, title: 'ZK Circuits',
    content: 'Select a Game Type in the Terminal to auto-configure the matching ZK circuit. Pre-audited circuits available for Chess (Win/Loss/Draw), Poker (hand ranking proofs), Blackjack (card value verification), Dice (randomness proof), Sudoku (solution verification), and Backgammon (multi-stake outcomes). Each circuit verifies the game outcome without revealing player inputs or private state. For custom games, paste your own verifier key.',
    why: 'ZK proofs let players verify outcomes on-chain trustlessly -- no oracle needed.'
  },
  {
    icon: Link2, title: 'Oracle Integration',
    content: 'Set custom oracle keys in Terminal for external data feeds. Three resolution modes: Standard Oracle (default trusted party), Custom Oracle Key (your own feed), or ZK Proof Verification (no oracle needed). Oracles submit outcome attestations on-chain. For sports results, weather data, or API-driven outcomes, configure the oracle endpoint and key in Terminal.',
    why: 'Oracles bridge off-chain data onto Kaspa so your covenant can react to real-world events.'
  },
  {
    icon: Palette, title: 'Custom UI & Covenant Studio',
    content: 'Design your covenant page in Covenant Studio (localhost:5173). Choose from pre-built templates (game lobbies, betting interfaces, escrow dashboards), customize branding, colors, and widget layouts, then paste the generated HTML/JS/CSS into Terminal. The UI renders instantly on your covenant page. No frontend coding required -- templates handle all the Web3 interactions.',
    why: 'A polished interactive UI increases user engagement and covenant usage.'
  },
  {
    icon: Repeat, title: 'Reusability & Top-Ups',
    content: 'Toggle "Reusable" in Terminal to accept multiple interactions on the same covenant. Non-reusable covenants are single-use escrow-style -- one interaction and done. Enable "Allow Top-Ups" to let users add more KAS to an active covenant. This is critical for games that run multiple rounds or accept multiple participants.',
    why: 'Reusable covenants with top-ups create sustainable, long-running game economies.'
  },
  {
    icon: Percent, title: 'Fees & Payout Logic',
    content: 'Set platform fee percentage (0-10%) in Terminal. Fees are deducted from each resolved covenant payout automatically. Define payout split logic (winner-takes-all, proportional, or custom) in your SilverScript. For multi-party outcomes, ensure your script handles edge cases like draws, timeouts, and forfeits.',
    why: 'Transparent fee structure builds trust. Clear payout logic prevents disputes.'
  },
  {
    icon: Gauge, title: 'Testing & Best Practices',
    content: 'Always test with small amounts on TN12 before going to mainnet. Use the Kaspa Testnet faucet for test KAS. Verify your ZK circuit against multiple edge-case inputs. Test your custom UI across devices (desktop + mobile). Confirm oracle endpoints are stable and respond within timeout windows. Deploy incrementally: first the SilverScript, then terminal config, then UI.',
    why: 'Thorough testing on testnet prevents irreversible mistakes on mainnet.'
  },
  {
    icon: FileCode, title: 'SilverScript Generator',
    content: 'After configuring your covenant in Terminal, click "Generate SilverScript" to produce a complete covenant script. The generator auto-includes your game type, circuit references, fee structure, and resolution logic. Review the generated script, then use the Deploy page to broadcast it on-chain. SilverScript is the Kaspa covenant DSL.',
    why: 'The generator eliminates manual script errors and ensures circuit + config alignment.'
  },
  {
    icon: ShieldCheck, title: 'Checklist Before Going Live',
    content: '1. Verify ZK circuit matches your game type. 2. Test oracle endpoint connectivity. 3. Confirm fee percentage is correct. 4. Review payout logic in SilverScript. 5. Test UI on mobile. 6. Deploy a test transaction on TN12. 7. Verify the Terminal config saves correctly. 8. Share your covenant page URL with testers before announcing publicly.',
    why: 'Missing any of these steps leads to broken covenants and lost funds.'
  }
];

export default function PaidBuilder() {
  const navigate = useNavigate();
  const { address, DevConnectPanel } = useWallet();
  const paidTier = localStorage.getItem('covex_paid_tier') || 'CREATOR';

  const [myCovenants, setMyCovenants] = useState([]);
  const [fetchingCovenants, setFetchingCovenants] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Show the "Payment just confirmed" success notification once
  const [justPaid, setJustPaid] = useState(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('payment_just_confirmed');
    if (raw) {
      try {
        setJustPaid(JSON.parse(raw));
        sessionStorage.removeItem('payment_just_confirmed');
      } catch (_) {}
    }
  }, []);

  // Redirect FREE users back to Pricing
  useEffect(() => {
    const tier = localStorage.getItem('covex_paid_tier');
    if (!tier || tier === 'FREE') {
      navigate('/pricing', { replace: true });
    }
  }, [navigate]);

  const fetchMyCovenants = useCallback(() => {
    if (!address) return;
    setFetchingCovenants(true);
    setFetchError(null);
    fetch(`/api/covenants?creator=${encodeURIComponent(address)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        const list = Array.isArray(d.covenants) ? d.covenants : [];
        setMyCovenants(list);
        setFetchingCovenants(false);
      })
      .catch(err => {
        setFetchError(err.message);
        setFetchingCovenants(false);
      });
  }, [address]);

  useEffect(() => {
    if (address) fetchMyCovenants();
  }, [address, fetchMyCovenants]);

  const tierAccent = {
    CREATOR: '#3B82F6',
    PRO: '#E8AF34',
    MAX: '#A855F7'
  }[paidTier] || '#49EACB';

  return (
    <div className="relative z-10 max-w-5xl mx-auto px-6 py-12 animate-in fade-in duration-300">
      <button
        onClick={() => navigate('/pricing')}
        className="flex items-center gap-2 text-gray-300 hover:text-[#49EACB] transition-colors mb-8 text-sm font-medium"
      >
        <ArrowLeft size={16} />
        Back to Pricing
      </button>

      {/* Payment success notification (the "approval notification" the user sees right after confirming payment) */}
      {justPaid && (
        <div className="mb-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 flex items-center gap-4">
          <div className="text-emerald-400"><CheckCircle2 size={28} /></div>
          <div>
            <div className="font-bold text-emerald-400 text-lg">Payment Confirmed!</div>
            <div className="text-sm text-gray-300">You now have <strong>{justPaid.tier}</strong> paid access. Below are all covenants deployed with your wallet. Use the <strong>Go to Terminal</strong> button for full tools.</div>
          </div>
        </div>
      )}

      {/* === Paid Area Header === */}
      <div
        className="bg-gradient-to-r rounded-2xl p-8 mb-8 border relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${tierAccent}10 0%, ${tierAccent}05 50%, transparent 100%)`,
          borderColor: tierAccent + '30'
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${tierAccent}, transparent)` }} />
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: tierAccent + '20', border: `1px solid ${tierAccent}40` }}>
            <Sparkles size={28} style={{ color: tierAccent }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">Your Covenants — {paidTier} Paid Area</h1>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold"
                style={{ backgroundColor: tierAccent + '15', border: `1px solid ${tierAccent}30`, color: tierAccent }}>
                {paidTier}
              </span>
            </div>
            <p className="text-sm text-gray-300">Payment complete. Here are all the covenants you have deployed with this wallet. Click <strong>Go to Terminal</strong> on any covenant to get the full paid experience (ZK, Oracles, Custom UI, SilverScript, etc.).</p>
          </div>
        </div>
      </div>

      {/* No prominent "Deploy New" / "Create New Covenant" button here.
          After paying, the focus is on the user's existing covenants + Terminal access.
          Creating a brand new one is available via the main Deploy nav or from within the Terminal itself. */}

      {/* === Your Created Covenants — the main thing after you pay === */}
      <div className="bg-[#0a0a0a]/95 border border-[#1f1f1f] rounded-2xl p-6 mb-8">
        <div className="flex items-center gap-3 mb-5">
          <Layers size={20} className="text-[#49EACB]" />
          <div>
            <h3 className="font-bold text-xl text-white">Your Created Covenants</h3>
            <p className="text-xs text-gray-300">Click <strong>Go to Terminal</strong> to access ZK, oracles, custom UI, SilverScript generator and all paid tools.</p>
          </div>
        </div>

        {!address && (
          <div className="p-5 text-center border border-white/5 rounded-xl">
            <p className="text-sm text-gray-300 mb-3">Connect your wallet (or use the Dev Wallet button with the test mnemonic) to see the covenants you own.</p>
            <DevConnectPanel compact />
          </div>
        )}

        {address && fetchingCovenants && <div className="py-8 text-center text-gray-400">Loading your covenants…</div>}

        {address && !fetchingCovenants && fetchError && (
          <div className="text-red-400 text-sm p-4 bg-red-500/5 rounded">Error loading: {fetchError} <button onClick={fetchMyCovenants} className="underline ml-2">Retry</button></div>
        )}

        {address && !fetchingCovenants && !fetchError && myCovenants.length === 0 && (
          <div className="text-center py-8 text-gray-300">
            No covenants found for this wallet yet.<br />
            <span className="text-xs text-gray-400">You can create new ones using the "Deploy" link in the top navigation.</span>
          </div>
        )}

        {address && !fetchingCovenants && myCovenants.length > 0 && (
          <div className="space-y-3">
            {myCovenants.map((cov) => (
              <div key={cov.tx_id} className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="font-semibold text-white">{cov.name || cov.covenant_type || 'Unnamed Covenant'}</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">{TRUNC(cov.tx_id)}</div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => navigate(`/covenant/${encodeURIComponent(cov.tx_id)}`)}
                    className="px-5 py-2.5 text-sm rounded-xl border border-white/10 hover:bg-white/5 transition"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => navigate(`/covenant/${encodeURIComponent(cov.tx_id)}?tab=terminal`)}
                    className="px-6 py-2.5 text-sm rounded-xl bg-[#49EACB] text-black font-bold hover:brightness-105 transition flex items-center gap-2"
                  >
                    <Terminal size={16} /> Go to Terminal
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === Quick Links (secondary) === */}
      <div className="flex flex-wrap gap-4">
        <a
          href="http://localhost:5173"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-[#49EACB]/20 bg-[#49EACB]/[0.04] hover:bg-[#49EACB]/[0.08] hover:border-[#49EACB]/40 transition-all"
        >
          <Code size={16} className="text-[#49EACB]" />
          <span className="text-sm font-medium text-white">Open Covenant Studio</span>
          <ExternalLink size={12} className="text-[#49EACB]/60" />
        </a>

        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-white/15 hover:bg-[#161616] transition-all"
        >
          <Layers size={16} className="text-[#49EACB]" />
          <span className="text-sm font-medium text-white">View Dashboard</span>
        </button>

        <button
          onClick={() => navigate('/pricing')}
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-[#1f1f1f] bg-[#111111] hover:border-white/15 hover:bg-[#161616] transition-all text-xs"
        >
          <span className="text-gray-300">Upgrade / Manage Tiers</span>
        </button>
      </div>
    </div>
  );
}
