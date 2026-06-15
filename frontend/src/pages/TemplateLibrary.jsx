import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  COVENANT_TEMPLATES, 
  TEMPLATE_CATEGORIES, 
  getTemplatesByCategory,
  getTemplateById 
} from '../lib/templates/templates';
import { X } from 'lucide-react';
import { useWallet } from '../components/WalletContext';

/**
 * Covenant Template Library
 * One-click beautiful, correct covenants.
 */
export default function TemplateLibrary() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [communityTemplates, setCommunityTemplates] = useState([]);
  const [tplSearch, setTplSearch] = useState('');
  const [tplCat, setTplCat] = useState('All');

  const filteredTemplates = selectedCategory === 'All'
    ? COVENANT_TEMPLATES 
    : getTemplatesByCategory(selectedCategory);

  // Load real published custom UIs from creators (activates the backend marketplace)
  useEffect(() => {
    fetch('/api/marketplace/templates')
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(data => {
        setCommunityTemplates(data.templates || []);
      })
      .catch(() => setCommunityTemplates([]));
  }, []);

  const handleUseTemplate = (template) => {
    if (!address) {
      alert("Please connect your wallet first to use templates.");
      return;
    }

    // Generate the config
    const config = template.generateConfig(address);

    // Store in session so Terminal can pick it up (shared config integration)
    sessionStorage.setItem('pending_covenant_config', JSON.stringify(config));
    sessionStorage.setItem('selected_template_id', template.id);

    // Navigate to Terminal with template pre-loaded
    // Paid users go to their paid builder area; free users go to free deploy
    const tier = localStorage.getItem('covex_paid_tier');
    if (tier && tier !== 'FREE') {
      navigate('/premium?template=' + template.id);
    } else {
      navigate('/deploy?template=' + template.id);
    }
  };

  const handlePreview = (template) => {
    setSelectedTemplate(template);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">Covenant Templates</h1>
        <p className="text-gray-300 max-w-2xl mx-auto">
          Choose a ready-made template. One click loads everything: correct circuit, oracle settings, 
          fees, and a beautiful UI. Customize further in Covenant Studio if you want.
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 justify-center mb-10">
        <button
          onClick={() => setSelectedCategory('All')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition ${
            selectedCategory === 'All' 
              ? 'bg-[#49EACB] text-black' 
              : 'bg-white/5 text-gray-300 hover:bg-white/10'
          }`}
        >
          All
        </button>
        {TEMPLATE_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              selectedCategory === cat 
                ? 'bg-[#49EACB] text-black' 
                : 'bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map(template => (
          <div 
            key={template.id}
            className="bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 flex flex-col hover:border-[#49EACB]/40 transition group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-4xl">{template.icon}</div>
              <div className="text-right">
                <div className="text-xs px-3 py-1 rounded-full bg-white/5 text-gray-400 inline-block">
                  {template.difficulty}
                </div>
              </div>
            </div>

            <h3 className="text-xl font-bold text-white mb-2">{template.name}</h3>
            <p className="text-gray-400 text-sm flex-1 mb-4">{template.description}</p>

            <div className="flex flex-wrap gap-1 mb-4">
              {template.tags.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400">
                  {tag}
                </span>
              ))}
            </div>

            <div className="text-xs text-gray-500 mb-4">
              {template.estimatedTime} • {template.recommendedTier} tier recommended
            </div>

            <div className="flex gap-3 mt-auto">
              <button
                onClick={() => handlePreview(template)}
                className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-white/20 hover:bg-white/5 transition"
              >
                Preview
              </button>
              <button
                onClick={() => handleUseTemplate(template)}
                className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-[#49EACB] text-black hover:bg-[#3dd9b8] active:scale-[0.985] transition"
              >
                Use Template
              </button>
            </div>
          </div>
        ))}
      </div>

      <CommunityPublished />

      {/* Preview Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6" onClick={() => setSelectedTemplate(null)}>
          <div className="bg-[#111] border border-white/10 rounded-3xl max-w-lg w-full p-8" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="text-5xl mb-4">{selectedTemplate.icon}</div>
                <h2 className="text-2xl font-bold text-white">{selectedTemplate.name}</h2>
              </div>
              <button onClick={() => setSelectedTemplate(null)} className="text-gray-400 hover:text-white"><X size={14} /></button>
            </div>

            <p className="text-gray-300 mb-6">{selectedTemplate.description}</p>

            <div className="text-sm space-y-2 mb-6">
              <div><span className="text-gray-400">Category:</span> {selectedTemplate.category}</div>
              <div><span className="text-gray-400">Difficulty:</span> {selectedTemplate.difficulty}</div>
              <div><span className="text-gray-400">Recommended Tier:</span> {selectedTemplate.recommendedTier}</div>
              <div><span className="text-gray-400">Setup Time:</span> {selectedTemplate.estimatedTime}</div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setSelectedTemplate(null)}
                className="flex-1 py-3 rounded-xl border border-white/20"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  setSelectedTemplate(null);
                  handleUseTemplate(selectedTemplate);
                }}
                className="flex-1 py-3 rounded-xl bg-[#49EACB] text-black font-bold"
              >
                Use This Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Covex templates from the backend marketplace — a comprehensive, searchable catalog. */}
      {communityTemplates.length > 0 && (() => {
        const cats = ['All', ...Array.from(new Set(communityTemplates.map(t => t.category).filter(Boolean)))];
        const q = tplSearch.trim().toLowerCase();
        const shown = communityTemplates.filter(t =>
          (tplCat === 'All' || t.category === tplCat) &&
          (!q || `${t.name} ${t.description} ${t.category} ${t.id}`.toLowerCase().includes(q))
        );
        const ENFORCED_KINDS = ['singlesig', 'hashlock', 'timelock', 'multisig'];
        const hrefFor = (t) => {
          // Genuine on-chain primitives → the free enforced-deploy builder.
          if (ENFORCED_KINDS.includes(t.kind)) return `/deploy/enforced?kind=${t.kind}`;
          // Games → the live arena explorer (where you stake & play).
          if (t.kind === 'game' || t.category === 'Games') return '/explorer';
          // ZK proofs, oracle markets and advanced patterns → the sandbox with the
          // matching circuit preloaded (real build destination, no more dead-end).
          const p = new URLSearchParams({ circuit: t.id || '', kind: t.kind || '', name: t.name || '' });
          return `/sandbox?${p.toString()}`;
        };
        return (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-[2px] text-kaspa-green mb-1">COVEX OFFICIAL · {communityTemplates.length} TEMPLATES</div>
              <h2 className="text-2xl font-bold text-white">Official Covenant Templates</h2>
            </div>
            <input
              value={tplSearch}
              onChange={e => setTplSearch(e.target.value)}
              placeholder="Search templates…"
              className="text-sm bg-black/40 border border-white/10 rounded-xl px-3 py-2 w-full sm:w-64 outline-none focus:border-kaspa-green/40"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {cats.map(c => (
              <button key={c} onClick={() => setTplCat(c)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${tplCat === c ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green' : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}>
                {c}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="glass-panel rounded-2xl py-10 text-center border border-white/[0.06]"><p className="text-gray-400 text-sm">No templates match your search.</p></div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((t, idx) => {
              const realityStyle = t.reality === 'on-chain'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : t.reality === 'hybrid'
                ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30';
              return (
                <div key={t.id || idx} className="glass-panel rounded-2xl p-5 flex flex-col border border-white/[0.06] hover:border-kaspa-green/30 transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500">{t.category || 'Covenant'}</div>
                    {t.reality && <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase ${realityStyle}`}>{t.reality}</span>}
                  </div>
                  <div className="font-bold text-white mb-1">{t.name || t.id}</div>
                  <p className="text-xs text-gray-400 mb-3 leading-relaxed line-clamp-3 flex-1">{t.description}</p>
                  <a href={hrefFor(t)}
                    className="text-center py-2 rounded-xl bg-[#49EACB] text-black text-sm font-bold hover:brightness-110 transition-all">
                    Use Template
                  </a>
                </div>
              );
            })}
          </div>
          )}
          <p className="text-[10px] text-center text-gray-500 mt-4">Showing {shown.length} of {communityTemplates.length} official templates — each labeled with its real on-chain / hybrid / oracle-attested enforcement.</p>
        </div>
        );
      })()}

      <div className="mt-16 text-center text-xs text-gray-500">
        Templates use the official Covex shared configuration protocol.<br />
        All templates are fully compatible with Covenant Studio for further customization.
      </div>
    </div>
  );
}


/** Real published covenant designs from /api/marketplace/templates. */
function CommunityPublished() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch('/api/marketplace/templates')
      .then((r) => r.json())
      // Only genuine community-published covenants (have a covenant_id) belong here; the official
      // Covex templates (id-only) render in the "Official Covenant Templates" section above.
      .then((d) => setItems(Array.isArray(d.templates) ? d.templates.filter((t) => t.covenant_id) : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  return (
    <div className="mt-16">
      <h2 className="text-2xl font-bold text-white mb-2 text-center">Community Published</h2>
      <p className="text-gray-400 text-sm text-center mb-8">Custom covenant designs published by paid creators, live from the marketplace.</p>
      {!loaded ? null : items.length === 0 ? (
        <div className="glass-panel rounded-2xl py-12 text-center border border-white/[0.06]">
          <p className="text-gray-300 text-sm font-semibold mb-1">No community designs published yet</p>
          <p className="text-gray-500 text-xs">Paid creators can publish their covenant page designs from the Studio. The first ones will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((t, i) => (
            <a key={t.covenant_id || i} href={`/covenant/${encodeURIComponent(t.covenant_id)}`} className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-kaspa-green/30 transition-all block">
              <p className="font-bold text-white mb-1 truncate">{t.slug || t.covenant_id}</p>
              <p className="text-xs text-gray-400">Published covenant design</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
