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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16">
      <div className="mb-8 px-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-2">
          Covenant Explorer
        </h1>
        <p className="text-gray-400 text-sm sm:text-base">
          Discover and interact with live SilverScript covenants on Kaspa Testnet-12
        </p>
      </div>

      {/* Tabs - Mobile friendly */}
      <div className="flex flex-wrap gap-1 sm:gap-2 mb-6 border-b border-white/10 pb-1 overflow-x-auto">
        {[
          { id: 'all', label: 'All', icon: Database },
          { id: 'interactive', label: 'Interactive', icon: Zap },
          ...(address ? [{ id: 'my-paid', label: 'My Paid', icon: Users }] : []),
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#49EACB]/10 text-[#49EACB] border-b-2 border-[#49EACB]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              {tab.id === 'my-paid' && myPaidCovenants.length > 0 && (
                <Badge variant="builder" className="ml-1 text-[10px]">{myPaidCovenants.length}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-6 max-w-md px-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <Input
            placeholder="Search covenants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 text-sm"
          />
        </div>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading from the BlockDAG...</div>}
      {error && <div className="p-4 text-red-400 border border-red-500/30 rounded-xl">{error}</div>}

      {/* My Paid Section */}
      {activeTab === 'my-paid' && address && (
        <div className="mb-8 px-1">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-[#49EACB]" />
            <h2 className="text-lg sm:text-xl font-semibold">Your Paid Tier Covenants</h2>
          </div>
          {myPaidCovenants.length === 0 ? (
            <Card className="p-6 sm:p-8 text-center border-[#49EACB]/20">
              <p className="text-gray-400 mb-4 text-sm">No paid-tier covenants found for this wallet yet.</p>
              <Button onClick={() => navigate('/paid-builder')} className="text-sm">
                Go to Paid Builder
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPaidCovenants.map((c) => (
                <CovenantCard key={c.tx_id} covenant={c} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Main Grid - Responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 px-1">
        {filteredCovenants.length > 0 ? (
          filteredCovenants.map((c, index) => <CovenantCard key={c.tx_id || index} covenant={c} />)
        ) : (
          <div className="col-span-full text-center py-12 text-gray-400 text-sm">
            No covenants found.
          </div>
        )}
      </div>

      {/* Interactive Demos */}
      {(activeTab === 'all' || activeTab === 'interactive') && (
        <div className="mt-10 sm:mt-12 px-1">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="text-[#49EACB]" size={20} />
            <h2 className="text-xl sm:text-2xl font-semibold">Advanced Interactive Demos</h2>
          </div>
          <p className="text-gray-400 mb-6 text-sm max-w-2xl">
            Examples of rich, verifiable experiences built on real on-chain covenants.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <Card className="border-[#49EACB]/30">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  Chess with ZK Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="text-gray-400 mb-4">
                  Full FIDE chess. Winner proven via ZK. Winner claims the pot on-chain.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate('/premium')}>View in Terminal</Button>
                  <Button variant="secondary" size="sm" disabled>Demo (soon)</Button>
                </div>
              </div>
            </Card>

            <Card className="border-[#49EACB]/30">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  Poker with Covenant + Oracle
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="text-gray-400 mb-4">
                  Real poker table. Hands resolved via oracle + ZK proofs.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate('/premium')}>View in Terminal</Button>
                  <Button variant="secondary" size="sm" disabled>Demo (soon)</Button>
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
      <Card className="h-full hover:border-[#49EACB]/40 transition-all group active:scale-[0.985] sm:active:scale-100">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="text-base sm:text-lg group-hover:text-[#49EACB] transition-colors line-clamp-2">
              {covenant.name || covenant.covenant_type || 'Unnamed Covenant'}
            </CardTitle>
            <Badge variant={style.variant} className="text-[10px] shrink-0">{style.label}</Badge>
          </div>
          <div className="text-[10px] text-gray-500 font-mono mt-1 break-all">
            {truncate(covenant.tx_id)}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs sm:text-sm text-gray-400 line-clamp-3 mb-4">
            {covenant.description || covenant.full_logic_summary || 'No description provided.'}
          </p>

          <div className="flex justify-between items-center text-xs text-gray-500">
            <span className="tabular-nums">{formatKaspa(covenant.amount_kaspa)}</span>
            {isInteractive && <span className="text-[#49EACB] font-medium text-[10px]">Interactive</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
