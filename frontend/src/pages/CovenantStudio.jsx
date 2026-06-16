import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Puck } from '@measured/puck';
import '@measured/puck/puck.css';
import { ArrowLeft, Save, Eye, Sparkles, Zap } from 'lucide-react';
import { useWallet } from '../components/WalletContext';
import { signCovenantOwnership } from '../lib/ownership';
import puckConfig, { LIVE_TOKENS } from '../lib/puckConfig';

const EMPTY_PAGE = { content: [], root: { props: {} } };

/**
 * Drag and drop page builder for a covenant. Creators compose from the
 * platform component catalog only; the result is stored as JSON next to the
 * covenant's terminal config and rendered read-only on the public page.
 * The transparency panel on the public page is never part of this canvas.
 */
export default function CovenantStudio() {
  const { id } = useParams();
  const { address, signMessage } = useWallet();
  const [covenant, setCovenant] = useState(null);
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }
  }, [toast]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/covenants/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        const c = d.covenant || null;
        setCovenant(c);
        const existing = c?.custom_ui_config?.puck_data;
        setInitialData(existing && existing.content ? existing : EMPTY_PAGE);
      })
      .catch(() => setCovenant(null))
      .finally(() => setLoading(false));
  }, [id]);

  const isCreator = !!(address && covenant && (covenant.creator_addr === address || covenant.address === address));

  // Live preview data so the creator sees real on-chain figures while designing
  // (the same tokens resolve on the public page). Read-only; never a destination.
  const liveData = useMemo(() => {
    if (!covenant) return {};
    const locked = Number(covenant.amount_kaspa || 0);
    return {
      name: covenant.name || covenant.covenant_type || 'Covenant',
      status: covenant.is_active === false ? 'Settled' : 'Active',
      network: covenant.network || 'testnet-12',
      amount_kaspa: locked,
      total_locked: `${locked.toLocaleString()} KAS`,
      tx_count: covenant.tx_count || 0,
      fee_pct: covenant.fee_pct != null ? covenant.fee_pct : '',
      rebate_pct: covenant.rebate_pct != null ? covenant.rebate_pct : '',
      creator: (covenant.creator_addr || covenant.address || '').slice(0, 12),
      daa_score: covenant.block_daa_score || 0,
      verified_tier: covenant.verified_tier || 'FREE',
    };
  }, [covenant]);

  const save = useCallback(async (data) => {
    setSaving(true);
    try {
      // Prove ownership: sign the server challenge with the creator wallet.
      const proof = await signCovenantOwnership(id, address, signMessage);
      const res = await fetch(`/api/terminal-config/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...proof,
          name: covenant?.name,
          description: covenant?.description,
          theme: covenant?.custom_ui_config?.theme || null,
          puck_data: data,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && (d.success || d.ok)) {
        setToast({ type: 'success', msg: 'Page published. Visitors now see your design.' });
      } else {
        setToast({ type: 'error', msg: d.error || 'Save failed. Check covenant ownership and try again.' });
      }
    } catch (e) {
      setToast({ type: 'error', msg: e?.message || 'Network error while saving.' });
    } finally {
      setSaving(false);
    }
  }, [id, address, signMessage, covenant]);

  if (loading) {
    return <div className="flex justify-center py-32"><div className="w-8 h-8 rounded-full border-2 border-kaspa-green/30 border-t-kaspa-green animate-spin" /></div>;
  }
  if (!covenant) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <p className="text-white font-bold mb-2">Covenant not found</p>
        <Link to="/" className="text-kaspa-green text-sm underline">Back to Explorer</Link>
      </div>
    );
  }
  if (!isCreator) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <Sparkles size={28} className="text-kaspa-green mx-auto mb-4" />
        <p className="text-white font-bold mb-2">Page Studio is creator-only</p>
        <p className="text-sm text-gray-400 mb-6">Connect the wallet that deployed this covenant to design its public page with drag and drop blocks.</p>
        <Link to={`/covenant/${encodeURIComponent(id)}`} className="text-kaspa-green text-sm underline">View the covenant instead</Link>
      </div>
    );
  }

  return (
    <div className="covex-studio relative" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.08] bg-[#0A0A0D]">
        <Link to={`/covenant/${encodeURIComponent(id)}`} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white">
          <ArrowLeft size={13} /> Back to covenant
        </Link>
        <p className="text-xs font-bold text-white truncate">{covenant.name || 'Covenant'} · Page Studio</p>
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <Eye size={12} /> Drag blocks from the left. Publish saves instantly.
        </div>
      </div>
      <Puck
        config={puckConfig}
        data={initialData || EMPTY_PAGE}
        metadata={{ live: liveData }}
        onPublish={save}
        overrides={{
          headerActions: ({ children }) => (
            <>
              {children}
              {saving && <span className="text-xs text-gray-400 flex items-center gap-1"><Save size={12} /> Saving...</span>}
            </>
          ),
        }}
      />
      {/* Live token cheat sheet: shows creators the on-chain values they can drop
          into any text field as {{token}}. They resolve live on the public page. */}
      <details className="fixed bottom-4 left-4 z-[90] w-72 rounded-2xl border border-white/[0.1] bg-[#0A0A0D]/95 backdrop-blur shadow-2xl">
        <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-xs font-bold text-kaspa-green list-none">
          <Zap size={13} /> Live data tokens
        </summary>
        <div className="px-4 pb-3 max-h-64 overflow-y-auto">
          <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">Type any token below into a text field (for example <span className="font-mono text-gray-300">{'{{total_locked}}'}</span>). It updates live from the chain.</p>
          <ul className="space-y-1">
            {LIVE_TOKENS.map((t) => (
              <li key={t.token} className="flex items-center justify-between gap-2 text-[11px]">
                <code className="text-kaspa-green font-mono">{`{{${t.token}}}`}</code>
                <span className="text-gray-500 text-right">{t.desc}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100]">
          <div className={`px-5 py-3.5 rounded-2xl shadow-2xl border text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-900/60 border-emerald-500/30 text-emerald-200' : 'bg-red-900/60 border-red-500/30 text-red-200'}`}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
