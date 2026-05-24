import React, { useState, useEffect } from 'react';
import { getAllTemplates, getTemplatesByCategory, searchTemplates, getComponentForTemplate, getTemplateById, CATEGORIES } from '../data/covenantTemplates';

const API = {
  async fetchGame(covenantId) {
    const r = await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/game-state`);
    return r.json();
  },
};

export default function InteractiveGameRenderer({ covenantId, covenant, userAddress }) {
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const PER_PAGE = 24;

  useEffect(() => {
    API.fetchGame(covenantId).then(data => {
      if (data.success) {
        setGameState(data);
        setSelectedGame(data.game_type || 'chess');
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [covenantId]);

  const handleCreate = async (gameType) => {
    if (!userAddress) { setMessage('Connect wallet first'); return; }
    setCreating(true);
    setMessage('');
    try {
      const r = await fetch(`/api/covenants/${encodeURIComponent(covenantId)}/create-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_type: gameType,
          creator_addr: userAddress,
          pot_amount_kas: covenant?.amount_kaspa || 0,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setGameState({ status: 'waiting', player1: userAddress, pot_amount_kas: covenant?.amount_kaspa || 0, game_type: gameType });
        setSelectedGame(gameType);
        setMessage('Game created! Waiting for opponent to join.');
      } else {
        setMessage(d.error || 'Failed to create game');
      }
    } catch (e) { setMessage('Network error'); }
    setCreating(false);
  };

  if (loading) return <div className="text-center text-gray-400 py-16 animate-pulse">Loading game state...</div>;

  // No game created — show full template gallery with category tabs + search
  if (!gameState) {
    const filtered = searchQuery
      ? searchTemplates(searchQuery)
      : activeCategory
        ? getTemplatesByCategory(activeCategory)
        : getAllTemplates();

    const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
    const totalPages = Math.ceil(filtered.length / PER_PAGE);

    return (
      <div className="space-y-6">
        <div className="text-center mb-2">
          <h3 className="text-xl font-bold text-white mb-1">Interactive Covenant Templates</h3>
          <p className="text-gray-400 text-sm">85+ ready-made templates across 8 categories. Choose one to create your game.</p>
        </div>

        {/* Search */}
        <div className="relative max-w-md mx-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
            placeholder="Search templates..."
            className="w-full px-4 py-3 bg-zinc-800/80 rounded-xl border border-zinc-700/60 text-white text-sm placeholder-gray-500 focus:border-[#49EACB] focus:ring-1 focus:ring-[#49EACB]/30 outline-none transition-all pl-10"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => { setActiveCategory(null); setPage(0); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${!activeCategory ? 'bg-[#49EACB] text-black' : 'bg-zinc-800/50 text-gray-400 hover:text-white border border-zinc-700/50'}`}
          >
            All
          </button>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              onClick={() => { setActiveCategory(key); setPage(0); }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${activeCategory === key ? 'text-white border-2' : 'bg-zinc-800/50 text-gray-400 hover:text-white border border-zinc-700/50'}`}
              style={activeCategory === key ? { backgroundColor: cat.color + '15', borderColor: cat.color + '50' } : {}}
            >
              <span>{cat.icon}</span> {cat.label}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {paged.map(tpl => {
            const cat = CATEGORIES[tpl.category] || {};
            return (
              <button
                key={tpl.id}
                onClick={() => handleCreate(tpl.id)}
                disabled={creating}
                className="p-4 border border-zinc-700/60 bg-zinc-900/70 rounded-2xl text-left hover:border-[#49EACB]/40 hover:shadow-[0_0_20px_rgba(73,234,203,0.1)] transition-all group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl group-hover:scale-110 transition-transform">{tpl.icon}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                    style={{ color: cat.color || '#6B7280', borderColor: (cat.color || '#6B7280') + '40', backgroundColor: (cat.color || '#6B7280') + '10' }}>
                    {cat.label || tpl.category}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white mb-1 truncate">{tpl.name}</h4>
                <p className="text-xs text-gray-500 mb-2 line-clamp-2">{tpl.desc}</p>
                <span className="text-[10px] text-[#49EACB]/70 font-mono">{tpl.players} {tpl.players === '1' ? 'player' : 'players'}</span>
              </button>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${page === i ? 'bg-[#49EACB] text-black' : 'bg-zinc-800 text-gray-400 hover:text-white'}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Info footer */}
        <p className="text-center text-[10px] text-gray-600">
          {filtered.length} templates available · FREE tier can view and interact with all · Paid tiers unlock custom branding
        </p>

        {message && <div className="p-3 bg-[#49EACB]/10 border border-[#49EACB]/30 rounded-lg text-sm text-[#49EACB] text-center">{message}</div>}
        {creating && <div className="text-center text-gray-400 py-4 animate-pulse">Creating game...</div>}
      </div>
    );
  }

  // Load the template + component for existing game
  const template = getTemplateById(selectedGame);
  const GameComponent = getComponentForTemplate(selectedGame);
  const meta = template || { name: 'Interactive Game', icon: '🎮', category: 'general' };
  const cat = CATEGORIES[meta.category] || {};

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{meta.icon || '🎮'}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
          style={{ color: cat.color || '#6B7280', borderColor: (cat.color || '#6B7280') + '40', backgroundColor: (cat.color || '#6B7280') + '10' }}>
          {cat.label || meta.category}
        </span>
        <span className="text-xs font-bold text-[#49EACB] uppercase tracking-wider">{meta.name}</span>
      </div>
      <GameComponent covenantId={covenantId} covenant={covenant} userAddress={userAddress} />
    </div>
  );
}
