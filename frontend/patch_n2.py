import io

# ---------- App.jsx: routes + footer API link ----------
p='src/App.jsx'
s=io.open(p,encoding='utf-8').read()
old="const DemoCovenant = lazy(() => import('./pages/DemoCovenant'));"
new=old+"""
const AddressPortfolio = lazy(() => import('./pages/AddressPortfolio'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));"""
assert old in s
s=s.replace(old,new)
old='              <Route path="/analytics" element={<Analytics />} />'
new=old+"""
              <Route path="/address/:addr" element={<AddressPortfolio />} />
              <Route path="/docs" element={<ApiDocs />} />"""
assert old in s
s=s.replace(old,new)
old='              <div>Non-custodial. Keys stay in your wallet.</div>'
new="""              <div>
                Non-custodial. Keys stay in your wallet.
                <span className="mx-2 opacity-30">|</span>
                <Link to="/docs" className="hover:text-kaspa-green transition-colors">API</Link>
                <span className="mx-2 opacity-30">|</span>
                <Link to="/templates" className="hover:text-kaspa-green transition-colors">Templates</Link>
                <span className="mx-2 opacity-30">|</span>
                <Link to="/terms" className="hover:text-kaspa-green transition-colors">Terms</Link>
              </div>"""
assert old in s
s=s.replace(old,new)
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('App.jsx OK')

# ---------- Explorer.jsx: ticker + trust badge on cards + creator link ----------
p='src/pages/Explorer.jsx'
s=io.open(p,encoding='utf-8').read()
old="import GamePreview, { detectGameType, hasCustomUI } from '../components/GamePreview';"
new=old+"""
import LiveTicker from '../components/LiveTicker';
import TrustBadge from '../components/TrustBadge';"""
assert old in s
s=s.replace(old,new)

# mount ticker under the stats panel
old="""        {/* Category filter: single button that reveals all types/options when pressed (clean, not always listing everything) */}"""
new="""        <LiveTicker network={kaspaNetwork} />

        {/* Category filter: single button that reveals all types/options when pressed (clean, not always listing everything) */}"""
assert old in s
s=s.replace(old,new)

# trust badge in card next to category label
old="""          {categoryLabel}"""
new="""          {categoryLabel}
        </div>
        <div className="absolute bottom-2 left-3">
          <TrustBadge covenant={c} size="sm" />"""
assert old in s
s=s.replace(old,new,1)
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('Explorer.jsx OK')

# ---------- CovenantInteractive.jsx: lifecycle timeline + transparency facts ----------
p='src/pages/CovenantInteractive.jsx'
s=io.open(p,encoding='utf-8').read()
old="import { useParams, Link, useSearchParams } from 'react-router-dom';"
if old not in s:
    # fallback import anchor
    import re
    m=re.search(r"import .* from 'react-router-dom';", s)
    old=m.group(0)
s=s.replace(old, old+"\nimport TrustBadge from '../components/TrustBadge';",1)

anchor="""          {/* Verification / Transparency badge - for chess always full transparent pro view, no paid nag, no limited text */}"""
timeline="""          {/* Lifecycle timeline + resolution trust: always visible, never hideable */}
          {covenant && (
            <div className="mb-6 glass-panel rounded-xl p-4 border border-white/[0.06]">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Covenant Lifecycle</p>
                <TrustBadge covenant={covenant} size="md" />
              </div>
              <div className="flex items-center gap-0 overflow-x-auto">
                {[
                  { label: 'Deployed', done: true, sub: covenant.timestamp ? new Date(covenant.timestamp * 1000).toLocaleDateString() : `DAA ${covenant.block_daa_score || 0}` },
                  { label: 'Indexed', done: true, sub: covenant.network },
                  { label: covenant.verified_tier !== 'FREE' ? `Verified ${covenant.verified_tier}` : 'Unverified', done: covenant.verified_tier !== 'FREE', sub: covenant.verified_tier !== 'FREE' ? 'on-chain payment' : 'free tier' },
                  { label: covenant.is_active === false ? 'Settled' : 'Active', done: true, sub: covenant.is_active === false ? 'pot distributed' : `${covenant.amount_kaspa || 0} KAS locked` },
                ].map((st, i, arr) => (
                  <div key={st.label} className="flex items-center shrink-0">
                    <div className="flex flex-col items-center text-center px-1">
                      <div className={`w-3 h-3 rounded-full mb-1.5 ${st.done ? 'bg-kaspa-green shadow-[0_0_8px_rgba(73,234,203,0.6)]' : 'bg-white/15 border border-white/20'}`} />
                      <span className={`text-[11px] font-semibold ${st.done ? 'text-white' : 'text-gray-500'}`}>{st.label}</span>
                      <span className="text-[9px] text-gray-500 font-mono">{st.sub}</span>
                    </div>
                    {i < arr.length - 1 && <div className={`h-px w-10 sm:w-16 mx-1 mb-7 ${st.done ? 'bg-kaspa-green/40' : 'bg-white/10'}`} />}
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono">
                <Link to={`/address/${encodeURIComponent(covenant.creator_addr || covenant.address || '')}`} className="text-gray-400 hover:text-kaspa-green transition-colors">
                  Creator portfolio: {(covenant.creator_addr || '').slice(0, 22)}...
                </Link>
                <span className="text-gray-500">Network: {covenant.network}</span>
              </div>
            </div>
          )}

          {/* Verification / Transparency badge - for chess always full transparent pro view, no paid nag, no limited text */}"""
assert anchor in s
s=s.replace(anchor,timeline,1)
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('CovenantInteractive.jsx OK')

# ---------- TemplateLibrary.jsx: Community Published section ----------
p='src/pages/TemplateLibrary.jsx'
s=io.open(p,encoding='utf-8').read()
old="import { useState"
assert old in s
if 'useEffect' not in s.split('\n')[0]:
    s=s.replace("import { useState","import { useEffect, useState",1)
anchor="""      {/* Preview Modal */}"""
community="""      {/* Community Published custom UIs from the live marketplace */}
      <CommunityPublished />

      {/* Preview Modal */}"""
assert anchor in s
s=s.replace(anchor,community,1)
s+="""

/** Real published covenant designs from /api/marketplace/templates. */
function CommunityPublished() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch('/api/marketplace/templates')
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.templates) ? d.templates : []))
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
            <a key={t.covenant_id || i} href={`/covenant/${encodeURIComponent(t.covenant_id)}`} className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-kaspa-green/30 transition-all">
              <p className="font-bold text-white mb-1 truncate">{t.slug || t.covenant_id}</p>
              <p className="text-xs text-gray-400">Published covenant design</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
"""
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('TemplateLibrary.jsx OK')
