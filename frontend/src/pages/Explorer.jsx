import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Terminal, Database, Search, Zap, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useWallet } from '../components/WalletContext';

const TIER_STYLES = {
  MAX: { variant: 'max', label: 'MAX' },
  PRO: { variant: 'pro', label: 'PRO' },
  BUILDER: { variant: 'builder', label: 'BUILDER' },
  FREE: { variant: 'outline', label: 'FREE' },
};

const formatKaspa = (kas) => (kas == null ? 'N/A' : `${Number(kas).toLocaleString()} KAS`);

const truncate = (s, n = 10) => (s && s.length > n * 2 ? `${s.slice(0, n)}...${s.slice(-n)}` : s || 'N/A');

export default function Explorer() {
  const [covenants, setCovenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { address } = useWallet();
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/covenants')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data.covenants) ? data.covenants : [];
        setCovenants(list);
        setLoading(false);
      })
      .catch((err) => {
        setError('Could not load covenants from the BlockDAG');
        setLoading(false);
      });
  }, []);

  // Separate user's own paid covenants
  const myPaidCovenants = address
    ? covenants.filter(
        (c) =>
          c.creator_addr?.toLowerCase() === address.toLowerCase() &&
          (c.verified_tier === 'BUILDER' || c.verified_tier === 'PRO' || c.verified_tier === 'MAX')
      )
    : [];

  const filteredCovenants = covenants.filter((c) => {
    const matchesSearch =
      !searchQuery ||
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.category || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (activeTab === 'interactive') {
      return matchesSearch && (c.ui_config?.custom_ui_enabled || c.has_custom_ui);
    }
    if (activeTab === 'my-paid' && address) {
      return matchesSearch && myPaidCovenants.some((m) => m.tx_id === c.tx_id);
    }
    return matchesSearch;
  });

  const interactiveCovenants = filteredCovenants.filter(
    (c) => c.ui_config?.custom_ui_enabled || c.has_custom_ui
  );

  return (
    <div className="max-w-6xl mx-auto px-6 pt-20 pb-16">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
          Covenant Explorer
        </h1>
        <p className="text-gray-400">
          Discover and interact with live SilverScript covenants on Kaspa Testnet-12
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-white/10 pb-1">
        {[
          { id: 'all', label: 'All Covenants', icon: Database },
          { id: 'interactive', label: 'Interactive & Demos', icon: Zap },
          ...(address ? [{ id: 'my-paid', label: 'My Paid Covenants', icon: Users }] : []),
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#49EACB]/10 text-[#49EACB] border-b-2 border-[#49EACB]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={15} />
              {tab.label}
              {tab.id === 'my-paid' && myPaidCovenants.length > 0 && (
                <Badge variant="builder" className="ml-1">{myPaidCovenants.length}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Search - now using shadcn Input */}
      <div className="mb-6 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <Input
            placeholder="Search by name, description, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading covenants from the BlockDAG...</div>}
      {error && <div className="p-4 text-red-400 border border-red-500/30 rounded-xl">{error}</div>}

      {/* My Paid Covenants Section (when selected) */}
      {activeTab === 'my-paid' && address && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-[#49EACB]" />
            <h2 className="text-xl font-semibold">Your Paid Tier Covenants</h2>
          </div>
          {myPaidCovenants.length === 0 ? (
            <Card className="p-8 text-center border-[#49EACB]/20">
              <p className="text-gray-400 mb-4">
                You have not deployed any paid-tier covenants yet, or they haven't been indexed.
              </p>
              <Button onClick={() => navigate('/paid-builder')}>
                Go to Paid Builder
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPaidCovenants.map((c) => (
                <CovenantCard key={c.tx_id} covenant={c} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredCovenants.length > 0 ? (
          filteredCovenants.map((c, index) => <CovenantCard key={c.tx_id || index} covenant={c} />)
        ) : (
          <div className="col-span-full text-center py-12 text-gray-400">
            No covenants found matching your criteria.
          </div>
        )}
      </div>

      {/* Interactive Demos Section */}
      {(activeTab === 'all' || activeTab === 'interactive') && (
        <div className="mt-12">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="text-[#49EACB]" size={20} />
            <h2 className="text-2xl font-semibold">Advanced Interactive Demos</h2>
          </div>
          <p className="text-gray-400 mb-6 max-w-2xl">
            These are examples of the kind of rich, verifiable experiences that can be built on top of real on-chain covenants using Covex.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Chess with ZK */}
            <Card className="border-[#49EACB]/30 hover:border-[#49EACB]/60 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Chess with ZK Verification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-400 mb-4">
                  Full FIDE chess game. Winner is proven via ZK circuit. Loser or draw is attested. Winner can claim the entire pot on-chain.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate('/premium')}>
                    View in Terminal
                  </Button>
                  <Button variant="secondary" size="sm" disabled>
                    Demo (coming soon)
                  </Button>
                </div>
              </div>
            </Card>

            {/* Poker */}
            <Card className="border-[#49EACB]/30 hover:border-[#49EACB]/60 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Multi-Player Poker with Oracle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-400 mb-4">
                  Real poker table backed by a covenant. Hands resolved via trusted oracle + optional ZK range proofs. Pot distributed automatically.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate('/premium')}>
                    View in Terminal
                  </Button>
                  <Button variant="secondary" size="sm" disabled>
                    Demo (coming soon)
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function CovenantCard({ covenant }) {
  const tier = (covenant.verified_tier || 'FREE').toUpperCase();
  const style = TIER_STYLES[tier] || TIER_STYLES.FREE;
  const isInteractive = covenant.ui_config?.custom_ui_enabled || covenant.has_custom_ui;

  return (
    <Link to={`/covenant/${encodeURIComponent(covenant.tx_id)}`}>
      <Card className="h-full hover:border-[#49EACB]/40 transition-all group">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg group-hover:text-[#49EACB] transition-colors line-clamp-1">
              {covenant.name || covenant.covenant_type || 'Unnamed Covenant'}
            </CardTitle>
            <Badge variant={style.variant}>{style.label}</Badge>
          </div>
          <div className="text-[10px] text-gray-500 font-mono mt-1">
            {truncate(covenant.tx_id)}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 line-clamp-3 mb-4">
            {covenant.description || covenant.full_logic_summary || 'No description provided.'}
          </p>

          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>Locked: {formatKaspa(covenant.amount_kaspa)}</span>
            {isInteractive && <span className="text-[#49EACB] font-medium">Interactive UI</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
