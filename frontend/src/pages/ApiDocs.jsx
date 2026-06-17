import { useState, useEffect } from 'react';
import { Code2, Copy, Check, BookOpen } from 'lucide-react';

/**
 * Builder-facing API documentation rendered from the live /api/openapi.json.
 * Every endpoint shows a copyable curl that reproduces what the explorer uses.
 */
// Real shape of GET /api/covenants (keys verified against the live response). Values are
// illustrative; the structure is exactly what the endpoint returns.
const EXAMPLE_RESPONSE = `{
  "covenants": [
    {
      "name": "p2sh-commitment",
      "network": "testnet-12",
      "category": "P2SH Commitments",
      "covenant_type": "p2sh-commitment",
      "enforcement_reality": "on-chain",
      "amount_kaspa": 200,
      "script_hash": "aa20…87",
      "address": "kaspatest:qr…",
      "tier": "FREE",
      "is_active": true,
      "timestamp": 1750000638
    }
  ],
  "total": 12000,
  "limit": 60,
  "offset": 0,
  "stats": { "total": 12000, "paid": 5, "tvl_kas": 1000000 }
}`;

export default function ApiDocs() {
  const [spec, setSpec] = useState(null);
  const [copiedPath, setCopiedPath] = useState(null);

  useEffect(() => {
    fetch('/api/openapi.json').then((r) => r.json()).then(setSpec).catch(() => {});
  }, []);

  const curlFor = (path, method) => {
    const sample = path
      .replace('{covenant_id}', '<covenant_txid>')
      .replace('{addr}', '<kaspa_address>');
    if (method === 'post') {
      return `curl -X POST https://hightable.pro/api${sample} \\\n  -H "Content-Type: application/json" \\\n  -d '{"source":"contract T { ... }"}'`;
    }
    const q = sample.includes('covenants') && !sample.includes('<') ? '?network=testnet-12&limit=10' : '';
    return `curl https://hightable.pro/api${sample}${q}`;
  };

  const copy = (path, text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1500);
    });
  };

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="covex-aurora" aria-hidden="true" style={{ top: 0, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 520, height: 240, maxWidth: '90vw' }} />
      <div className="relative z-10 flex items-center gap-3 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center shrink-0">
          <BookOpen size={22} className="text-kaspa-green" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black text-white">Covex API</h1>
          <p className="text-sm text-gray-400 break-words">The same indexer API that powers this explorer. Free to use. Paginated. No key required for reads.</p>
        </div>
      </div>
      <p className="relative z-10 text-xs font-mono text-gray-500 mb-8 break-words">
        Base URL: https://hightable.pro/api · Spec: <a href="/api/openapi.json" className="text-kaspa-green underline" target="_blank" rel="noreferrer">openapi.json</a>
      </p>

      {/* Quick reference - every fact verified against the live spec + backend route table. */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {[
          ['Networks', <>The <code className="text-white">network=</code> query accepts <span className="text-white">testnet-12</span> (default), <span className="text-white">testnet-10</span>, and <span className="text-white">mainnet</span>. Mainnet is configured and indexing-ready but returns <span className="text-white">0 covenants until the Toccata upgrade (2026 window, no confirmed day)</span> activates on-chain covenants - that is expected, not an error.</>],
          ['Auth & limits', <>No API key for reads. Requests are rate-limited per IP (a burst returns <code className="text-white">429</code> "rate limit exceeded"). Lists paginate with <code className="text-white">limit</code> (max 200, default 60) and <code className="text-white">offset</code>.</>],
          ['Search', <>Keyword search supports OR alternatives with a pipe: <code className="text-white">q=chess|poker</code>. Fetch a single covenant by txid at <code className="text-white">/covenants/&lt;txid&gt;</code>.</>],
          ['Honesty', <>Every covenant carries an <code className="text-white">enforcement_reality</code>, one of <span className="text-white">on-chain</span> / <span className="text-white">hybrid</span> / <span className="text-white">oracle-attested</span> / <span className="text-white">decorative</span> (a metadata-only marker). The finer "zero-knowledge" label in the UI is a resolution-trust badge for the proof-verified circuits, layered on top - not a separate API value. The API never claims more enforcement than the chain provides.</>],
        ].map(([title, body]) => (
          <div key={title} className="glass-panel rounded-2xl p-4 border border-white/[0.06] hover-lift">
            <p className="text-[10px] font-bold uppercase tracking-widest text-kaspa-green mb-2">{title}</p>
            <p className="text-xs text-gray-300 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      {/* Example response shape (real keys from GET /covenants). */}
      <div className="glass-panel rounded-2xl p-4 border border-white/[0.06] mb-8">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Example response · GET /covenants</p>
        <pre className="text-[11px] font-mono text-gray-300 bg-black/40 border border-white/[0.06] rounded-xl p-3 overflow-x-auto whitespace-pre">{EXAMPLE_RESPONSE}</pre>
      </div>

      {!spec ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-kaspa-green/30 border-t-kaspa-green animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          {Object.entries(spec.paths || {}).map(([path, methods]) =>
            Object.entries(methods).map(([method, op]) => {
              const curl = curlFor(path, method);
              return (
                <div key={method + path} className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover-lift">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${method === 'get' ? 'bg-kaspa-green/15 text-kaspa-green' : 'bg-amber-500/15 text-amber-300'}`}>{method}</span>
                    <code className="text-sm text-white font-mono break-all min-w-0">{path}</code>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{op.summary}</p>
                  {(op.parameters || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {op.parameters.map((p) => (
                        <span key={p.name} className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[10px] font-mono text-gray-300" title={p.description || ''}>
                          {p.name}{p.required ? '*' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <pre className="text-[11px] font-mono text-gray-300 bg-black/40 border border-white/[0.06] rounded-xl p-3 overflow-x-auto whitespace-pre">{curl}</pre>
                    <button
                      onClick={() => copy(method + path, curl)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-gray-300"
                      title="Copy curl"
                    >
                      {copiedPath === method + path ? <Check size={13} className="text-kaspa-green" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
          <div className="glass-panel rounded-2xl p-5 border border-kaspa-green/20 flex items-start gap-3">
            <Code2 size={18} className="text-kaspa-green shrink-0 mt-0.5" />
            <p className="text-xs text-gray-300 leading-relaxed">
              Point any app at this API to reproduce the explorer views. Lists cap at 200 items per page; use offset to walk the full set. Keyword search supports OR alternatives with a pipe, for example q=chess|poker. POST endpoints are rate limited per IP.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
