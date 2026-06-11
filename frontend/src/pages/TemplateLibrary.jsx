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

  const filteredTemplates = selectedCategory === 'All' 
    ? COVENANT_TEMPLATES 
    : getTemplatesByCategory(selectedCategory);

  // Load real published custom UIs from creators (activates the backend marketplace)
  useEffect(() => {
    fetch('/marketplace/templates')
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(data => {
        const list = (data.templates || []).slice(0, 12);
        setCommunityTemplates(list);
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

      {/* Real community published custom UIs from the backend marketplace (paid creators publish via Fix/Terminal) */}
      {communityTemplates.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs uppercase tracking-[2px] text-kaspa-green mb-1">COMMUNITY PUBLISHED</div>
              <h2 className="text-2xl font-bold text-white">Custom UIs from Real Creators</h2>
            </div>
            <div className="text-xs text-gray-500">Pulled live from published covenants</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {communityTemplates.map((t, idx) => (
              <div key={idx} className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5 flex flex-col">
                <div className="text-xs text-emerald-400 mb-1">PUBLISHED CUSTOM UI</div>
                <div className="font-bold text-white mb-1 truncate">{t.name || t.id || 'Untitled Published'}</div>
                <div className="text-xs text-gray-400 mb-3">by {t.author || 'creator'}</div>
                <div className="mt-auto flex gap-2">
                  <a 
                    href={t.id && t.id.length > 20 ? `/covenant/${encodeURIComponent(t.id)}` : '#'} 
                    className="flex-1 text-center py-2 rounded-xl border border-white/20 text-sm hover:bg-white/5"
                  >
                    View Covenant
                  </a>
                  <button 
                    onClick={() => {
                      if (t.id) sessionStorage.setItem('highlight_covenant', t.id);
                      window.location.href = t.id && t.id.length > 20 ? `/covenant/${encodeURIComponent(t.id)}` : '/templates';
                    }}
                    className="flex-1 py-2 rounded-xl bg-[#49EACB] text-black text-sm font-bold"
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-center text-gray-500 mt-3">These are real custom interfaces published by paid-tier creators using the advanced builder.</p>
        </div>
      )}

      <div className="mt-16 text-center text-xs text-gray-500">
        Templates use the official Covex shared configuration protocol.<br />
        All templates are fully compatible with Covenant Studio for further customization.
      </div>
    </div>
  );
}
