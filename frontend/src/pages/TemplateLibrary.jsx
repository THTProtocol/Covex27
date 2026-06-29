import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '../lib/routeIcons.js';
import TemplateGrid from '../components/TemplateGrid';

/**
 * Covenant Template Library page.
 * Chrome only: page headline + builder link + the embeddable TemplateGrid for the
 * official Covex starters, then the marketplace catalog and community published lists.
 */

// Display-only relabel for the marketplace categories. The backend returns the raw
// category string ('Games', 'Prediction & Markets') and the rest of the page matches,
// routes, and keys icons off that raw string. This map ONLY changes what the user reads,
// keeping the framing neutral (head-to-head covenants, conditional outcomes) without
// touching any matching or routing key. Categories not listed fall through unchanged.
const CAT_LABEL = {
  'Games': 'Two-party',
  'Prediction & Markets': 'Conditional Outcomes',
};
const catLabel = (c) => CAT_LABEL[c] || c;

export default function TemplateLibrary() {
  const [communityTemplates, setCommunityTemplates] = useState([]);
  const [tplSearch, setTplSearch] = useState('');
  const [tplCat, setTplCat] = useState('All');

  // Load real published custom UIs from creators (activates the backend marketplace)
  useEffect(() => {
    fetch('/api/marketplace/templates')
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(data => {
        setCommunityTemplates(data.templates || []);
      })
      .catch(() => setCommunityTemplates([]));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white light:text-slate-900 mb-4">Template gallery</h1>
        <p className="text-gray-300 light:text-slate-600 max-w-2xl mx-auto mb-6">
          Choose a ready-made template. One click loads everything: correct circuit, oracle settings,
          fees, and a beautiful UI. Customize further in Covenant Studio if you want.
        </p>
        <Link
          to="/sandbox"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#49EACB] light:bg-[#0d9488] text-black light:text-white text-sm font-bold hover:bg-[#3dd9b8] light:hover:bg-[#0b8276] active:scale-[0.985] transition min-h-[44px] sm:min-h-0"
        >
          Open the 5-step builder
          <ArrowRight size={16} />
        </Link>
      </div>

      <TemplateGrid />

      <CommunityPublished />

      {/* Official Covex templates from the backend marketplace: a comprehensive, searchable catalog. */}
      {communityTemplates.length > 0 && (() => {
        const cats = ['All', ...Array.from(new Set(communityTemplates.map(t => t.category).filter(Boolean)))];
        const q = tplSearch.trim().toLowerCase();
        const shown = communityTemplates.filter(t =>
          (tplCat === 'All' || t.category === tplCat) &&
          (!q || `${t.name} ${t.description} ${t.category} ${catLabel(t.category)} ${t.id}`.toLowerCase().includes(q))
        );
        // All genuine on-chain primitive kinds reach the free enforced-deploy builder. The
        // two oracle_* kinds are HYBRID (oracle co-signature is consensus-required): routing
        // them here is fine because DeployDisclosure self-labels them hybrid, never trustless.
        const ENFORCED_KINDS = [
          'singlesig', 'hashlock', 'timelock', 'multisig',
          'htlc', 'channel', 'deadman', 'relative_timelock', 'timedecay',
          'oracle_enforced', 'oracle_escrow',
        ];
        const hrefFor = (t) => {
          // Genuine on-chain primitives reach the free enforced-deploy builder.
          if (ENFORCED_KINDS.includes(t.kind)) return `/deploy/enforced?kind=${t.kind}`;
          // Games reach the live arena explorer (where you stake & play), the home route.
          if (t.kind === 'game' || t.category === 'Games') return '/';
          // ZK proofs, oracle markets and advanced patterns reach the sandbox with the
          // matching circuit preloaded (real build destination, no more dead-end).
          const p = new URLSearchParams({ circuit: t.id || '', kind: t.kind || '', name: t.name || '' });
          return `/sandbox?${p.toString()}`;
        };
        return (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[2px] text-kaspa-green mb-1">COVEX OFFICIAL · {communityTemplates.length} TEMPLATES</div>
              <h2 className="text-2xl font-bold text-white light:text-slate-900">Official Covenant Templates</h2>
            </div>
            <input
              value={tplSearch}
              onChange={e => setTplSearch(e.target.value)}
              placeholder="Search templates…"
              className="text-sm bg-black/40 light:bg-white border border-white/10 light:border-slate-200 text-white light:text-slate-900 rounded-xl px-3 py-2 w-full sm:w-64 outline-none focus:border-kaspa-green/40"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {cats.map(c => (
              <button key={c} onClick={() => setTplCat(c)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${tplCat === c ? 'border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green' : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200'}`}>
                {catLabel(c)}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="glass-panel rounded-2xl py-10 text-center border border-white/[0.06]"><p className="text-gray-400 light:text-slate-500 text-sm">No templates match your search.</p></div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((t, idx) => {
              const realityStyle = t.reality === 'on-chain'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : t.reality === 'hybrid'
                ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30';
              const CAT_ICON = { 'P2SH Commitments': '\u{1F512}', 'Atomic Swaps & HTLC': '\u{1F501}', 'Vesting & Timelocks': '\u{23F3}', 'Multi-sig': '\u{1F511}', 'State Channels': '\u{1F517}', 'Games': '\u{1F3AE}', 'ZK Proofs & Claims': '\u{1F52E}', 'Prediction & Markets': '\u{1F4CA}', 'Financial Tools': '\u{1F4B0}', 'Identity & Gating': '\u{1FAAA}', 'Compute & Cross-chain': '⚙️' };
              const icon = CAT_ICON[t.category] || '\u{1F4DC}';
              const hue = (idx * 47 + String(t.id || t.name || '').length * 17) % 360;
              const accent = `hsl(${hue} 72% 62%)`;
              return (
                <div key={t.id || idx}
                  className="hover-lift group relative flex flex-col rounded-3xl border border-white/[0.08] light:border-slate-200 overflow-hidden bg-gradient-to-br from-[#15151f] via-[#0e0e16] to-[#0a0a0f] light:from-white light:via-white light:to-slate-50 transition-colors duration-300 hover:border-[color:var(--ta)]"
                  style={{ '--ta': `hsl(${hue} 74% 60% / 0.55)` }}>
                  <div className="h-[3px] w-full shrink-0" aria-hidden="true"
                    style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.8 }} />
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <div className="text-4xl leading-none">{icon}</div>
                      {t.reality && <span className={`shrink-0 text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${realityStyle}`}>{t.reality}</span>}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-600 mb-1.5 truncate">{catLabel(t.category) || 'Covenant'}</div>
                    <h3 className="text-lg font-bold text-white light:text-slate-900 mb-1.5 leading-tight break-words">{t.name || t.id}</h3>
                    <p className="text-xs text-gray-400 light:text-slate-500 mb-4 leading-relaxed break-words line-clamp-3">{t.description}</p>
                    <a href={hrefFor(t)}
                      className="mt-auto inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#49EACB] light:bg-[#0d9488] text-black light:text-white text-sm font-bold hover:bg-[#3dd9b8] light:hover:bg-[#0b8276] active:scale-[0.985] transition group-hover:gap-2 min-h-[44px] sm:min-h-0">
                      Use Template <span aria-hidden="true">&rarr;</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
          )}
          <p className="text-[10px] text-center text-gray-500 mt-4">Showing {shown.length} of {communityTemplates.length} official templates, each labeled with its real on-chain / hybrid / resolver-attested enforcement.</p>
        </div>
        );
      })()}

      <div className="mt-16 text-center text-xs text-gray-500 light:text-slate-500">
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
      <h2 className="text-2xl font-bold text-white light:text-slate-900 mb-2 text-center">Community Published</h2>
      <p className="text-gray-400 light:text-slate-500 text-sm text-center mb-8">Custom covenant designs published by paid creators, live from the marketplace.</p>
      {!loaded ? null : items.length === 0 ? (
        <div className="glass-panel rounded-2xl py-12 text-center border border-white/[0.06]">
          <p className="text-gray-300 light:text-slate-700 text-sm font-semibold mb-1">No community designs published yet</p>
          <p className="text-gray-500 light:text-slate-500 text-xs">Paid creators can publish their covenant page designs from the Studio. The first ones will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((t, i) => (
            <a key={t.covenant_id || i} href={`/covenant/${encodeURIComponent(t.covenant_id)}`} className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-kaspa-green/30 transition-all block">
              <p className="font-bold text-white light:text-slate-900 mb-1 truncate">{t.slug || t.covenant_id}</p>
              <p className="text-xs text-gray-400 light:text-slate-500">Published covenant design</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
