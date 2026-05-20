import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';

/* ───────────────────────────────────────────────────────────────────
   CovenantInteractive — detail page with wallet URI generator
   ─────────────────────────────────────────────────────────────────── */

const SOMI_PER_KAS = 100_000_000;
const KAS = (sompi) => (sompi / SOMI_PER_KAS).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

/* ── Derive URI scheme from address prefix ──────────────────────── */

function uriScheme(address) {
  if (!address) return 'kaspa';
  if (address.startsWith('kaspatest:')) return 'kaspatest';
  if (address.startsWith('kaspa:')) return 'kaspa';
  return 'kaspa';
}

/* ── Main component ──────────────────────────────────────────────── */

export default function CovenantInteractive() {
  const { id } = useParams();
  const [utxos, setUtxos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/utxos');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setUtxos(data.utxos ?? []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const utxo = useMemo(
    () => utxos.find((u) => u.tx_id === id),
    [utxos, id],
  );

  // ── Validate amount input ──────────────────────────────────

  const parsedAmount = useMemo(() => {
    if (!amountInput.trim()) return { value: 0, valid: true };
    const n = parseFloat(amountInput);
    if (isNaN(n) || n <= 0) return { value: 0, valid: false, reason: 'Enter a positive number' };
    if (n > 1_000_000_000) return { value: 0, valid: false, reason: 'Amount too large' };
    return { value: n, valid: true };
  }, [amountInput]);

  const sompiAmount = Math.floor(parsedAmount.value * SOMI_PER_KAS);
  const scheme = uriScheme(utxo?.address);

  // Build the wallet URI
  const walletUri = useMemo(() => {
    if (!utxo?.address || parsedAmount.value <= 0 || !parsedAmount.valid) return null;
    const decimal = parsedAmount.value.toFixed(8).replace(/\.?0+$/, '');
    return `${scheme}:${utxo.address}?amount=${decimal}`;
  }, [utxo, parsedAmount, scheme]);

  // ── Loading skeleton ───────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-16 animate-pulse space-y-6">
        <div className="h-8 bg-white/[0.06] rounded-lg w-1/2" />
        <div className="h-64 bg-white/[0.03] rounded-2xl" />
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────

  if (error) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="glass px-10 py-12">
          <p className="text-red-400 text-sm">{error}</p>
          <Link
            to="/"
            className="inline-block mt-4 text-kaspa-green text-sm hover:underline"
          >
            ← Back to Explorer
          </Link>
        </div>
      </div>
    );
  }

  if (!utxo) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="glass px-10 py-12">
          <p className="text-gray-400 text-sm">Covenant not found.</p>
          <p className="text-gray-600 text-xs mt-1 font-mono">ID: {id}</p>
          <Link
            to="/"
            className="inline-block mt-4 text-kaspa-green text-sm hover:underline"
          >
            ← Back to Explorer
          </Link>
        </div>
      </div>
    );
  }

  // ── Determine if this is a premium (funded) covenant ──────

  const isFunded = utxo.amount_sompi > 0;

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-10 space-y-8">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-kaspa-green transition-colors"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        Explorer
      </Link>

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="glass p-8 space-y-6">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Covenant UTXO</p>
          <h1 className="text-2xl font-semibold text-white font-mono break-all leading-relaxed">
            {utxo.tx_id}
          </h1>
        </div>

        {/* Detail grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            ['Index', `#${utxo.index}`],
            ['Locked KAS', KAS(utxo.amount_sompi)],
            ['State', utxo.is_coinbase ? 'Coinbase' : 'Active'],
            ['DAA Score', utxo.block_daa_score?.toLocaleString() ?? '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-gray-500 mb-0.5">{label}</p>
              <p className="text-sm text-white font-medium">{value}</p>
            </div>
          ))}
        </div>

        {/* Address */}
        <div>
          <p className="text-xs text-gray-500 mb-1">Address</p>
          <p className="font-mono text-sm text-gray-300 break-all bg-black/30 rounded-lg px-4 py-3 border border-white/5">
            {utxo.address}
          </p>
        </div>
      </div>

      {/* ── Premium Interactive UI ──────────────────────────── */}
      {isFunded ? (
        <div className="glass p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-kaspa-green/10 border border-kaspa-green/30 flex items-center justify-center">
              <svg className="h-4 w-4 text-kaspa-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Execute Covenant</h2>
              <p className="text-xs text-gray-500">Generate a wallet deep-link to interact with this covenant</p>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2">
              Enter KAS amount to lock
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  setAmountError('');
                }}
                placeholder="0.00"
                className="
                  w-full px-4 py-3 rounded-xl
                  bg-black/30 border border-white/10
                  text-white text-lg font-mono
                  placeholder:text-gray-600
                  focus:outline-none focus:border-kaspa-green/50 focus:ring-1 focus:ring-kaspa-green/20
                  transition-colors
                  [appearance:textfield]
                  [&::-webkit-outer-spin-button]:appearance-none
                  [&::-webkit-inner-spin-button]:appearance-none
                "
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                KAS
              </span>
            </div>
            {amountError && (
              <p className="text-xs text-red-400 mt-1.5">{amountError}</p>
            )}
            {parsedAmount.valid && parsedAmount.value > 0 && (
              <p className="text-xs text-gray-500 mt-1.5 font-mono">
                = {sompiAmount.toLocaleString()} sompi
              </p>
            )}
          </div>

          {/* Execute button */}
          {walletUri ? (
            <a
              href={walletUri}
              className="
                inline-flex items-center gap-3 px-6 py-3.5 rounded-xl
                bg-kaspa-green text-black font-semibold text-sm
                shadow-[0_0_30px_rgba(73,234,203,0.25)]
                hover:shadow-[0_0_50px_rgba(73,234,203,0.40)]
                hover:brightness-110
                active:scale-[0.97]
                transition-all duration-200
                no-underline
              "
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Execute Covenant
            </a>
          ) : (
            <button
              disabled
              className="
                inline-flex items-center gap-3 px-6 py-3.5 rounded-xl
                bg-white/[0.04] text-gray-600 font-semibold text-sm
                border border-white/5 cursor-not-allowed
                transition-all duration-200
              "
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Execute Covenant
            </button>
          )}

          {/* URI preview */}
          {walletUri && (
            <div className="mt-4 p-4 rounded-xl bg-black/30 border border-white/5 font-mono text-xs text-gray-400 break-all">
              <span className="text-gray-600">URI: </span>
              {walletUri}
            </div>
          )}
        </div>
      ) : (
        /* ── Unfunded notice ───────────────────────────────── */
        <div className="glass p-8 text-center">
          <p className="text-gray-500 text-sm">
            This covenant has no locked KAS. Fund it to enable interactive execution.
          </p>
        </div>
      )}
    </div>
  );
}
