import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

/* ───────────────────────────────────────────────────────────────────
   Host Covenant — pay 100 KAS to list an interactive covenant UI
   ─────────────────────────────────────────────────────────────────── */

// Covex treasury address — replace with actual treasury
const TREASURY_ADDRESS = 'kaspatest:qzr8q7tq8w3n2x3a4y5z6w7x8c9d0eqqqqqqqqqqqqqqqqqqqqqqqqqq';

// 100 KAS in sompi
const LISTING_FEE_SOMPI = 100_000_000_00; // 100 * 10^8
const LISTING_FEE_KAS = 100;

const TEMPLATES = [
  { value: '', label: 'Select a template…' },
  { value: 'standard', label: 'Standard — Basic detail card with locked amount' },
  { value: 'premium', label: 'Premium — Full interactive UI with amount input & wallet link' },
  { value: 'pool', label: 'Community Pool — Multi-party contribution tracker' },
  { value: 'escrow', label: 'Escrow Game — Conditional release with oracle hook' },
  { value: 'prediction', label: 'Prediction Market — Binary outcome settlement display' },
];

/* ── Validators ────────────────────────────────────────────────── */

function isValidTxid(txid) {
  return /^[0-9a-fA-F]{64}$/.test(txid);
}

/* ── Main component ────────────────────────────────────────────── */

export default function HostCovenant() {
  const [txid, setTxid] = useState('');
  const [template, setTemplate] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => {
    const e = {};
    if (txid && !isValidTxid(txid)) e.txid = 'Must be a 64-character hex transaction ID';
    if (submitted && !template) e.template = 'Please select a template';
    if (submitted && !txid) e.txid = 'Covenant TXID is required';
    return e;
  }, [txid, template, submitted]);

  const isValid = txid && isValidTxid(txid) && template;

  const walletUri = useMemo(() => {
    if (!isValid) return null;
    return `kaspatest:${TREASURY_ADDRESS}?amount=100`;
  }, [isValid]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    // If valid, the button is an <a> tag that opens the wallet — no further action needed
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-10 space-y-8">
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

      {/* Header */}
      <div className="glass p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-kaspa-green/10 border border-kaspa-green/30 flex items-center justify-center">
            <svg className="h-5 w-5 text-kaspa-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              Host Your Covenant
            </h1>
            <p className="text-sm text-gray-500">
              Pay {LISTING_FEE_KAS} KAS to list your interactive covenant UI on Covex
            </p>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-4 pt-2">
          {[
            ['Infinite Views', 'Your covenant UI is publicly browsable forever on Covex.'],
            ['Wallet Deep-Links', 'Users can execute your covenant with one tap via kaspatest: URIs.'],
            ['Premium UI', 'Glassmorphism detail page with amount inputs and real-time data.'],
          ].map(([title, desc]) => (
            <div key={title} className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
              <p className="text-xs font-semibold text-white mb-1">{title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="glass p-8 space-y-6">
        {/* Covenant TXID */}
        <div>
          <label
            htmlFor="txid"
            className="block text-xs text-gray-400 font-medium mb-2"
          >
            Covenant TXID
          </label>
          <input
            id="txid"
            type="text"
            value={txid}
            onChange={(e) => {
              setTxid(e.target.value);
              if (submitted) setSubmitted(false);
            }}
            placeholder="Enter the 64-character transaction ID…"
            className={`
              w-full px-4 py-3 rounded-xl font-mono text-sm
              bg-black/30 border
              ${errors.txid && submitted
                ? 'border-red-500/50 focus:border-red-400'
                : 'border-white/10 focus:border-kaspa-green/50'
              }
              text-white placeholder:text-gray-600
              focus:outline-none focus:ring-1
              ${errors.txid && submitted
                ? 'focus:ring-red-500/20'
                : 'focus:ring-kaspa-green/20'
              }
              transition-colors
            `}
          />
          {errors.txid && submitted && (
            <p className="text-xs text-red-400 mt-1.5">{errors.txid}</p>
          )}
        </div>

        {/* UI Template Type */}
        <div>
          <label
            htmlFor="template"
            className="block text-xs text-gray-400 font-medium mb-2"
          >
            UI Template Type
          </label>
          <select
            id="template"
            value={template}
            onChange={(e) => {
              setTemplate(e.target.value);
              if (submitted) setSubmitted(false);
            }}
            className={`
              w-full px-4 py-3 rounded-xl text-sm
              bg-black/30 border
              ${errors.template && submitted
                ? 'border-red-500/50 focus:border-red-400'
                : 'border-white/10 focus:border-kaspa-green/50'
              }
              text-white
              focus:outline-none focus:ring-1
              ${errors.template && submitted
                ? 'focus:ring-red-500/20'
                : 'focus:ring-kaspa-green/20'
              }
              transition-colors appearance-none
              bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
              bg-[length:12px]
              bg-[right_16px_center]
              bg-no-repeat
            `}
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value} disabled={!t.value} className="bg-[#111116] text-white">
                {t.label}
              </option>
            ))}
          </select>
          {errors.template && submitted && (
            <p className="text-xs text-red-400 mt-1.5">{errors.template}</p>
          )}
        </div>

        {/* Fee summary */}
        <div className="p-4 rounded-xl bg-kaspa-green/[0.04] border border-kaspa-green/20 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Listing Fee</span>
            <span className="text-white font-mono tabular-nums">{LISTING_FEE_KAS} KAS</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Treasury Address</span>
            <span className="text-gray-500 font-mono text-xs truncate max-w-[200px]">
              {TREASURY_ADDRESS.slice(0, 20)}…
            </span>
          </div>
          <div className="border-t border-kaspa-green/10 pt-2 flex justify-between text-sm">
            <span className="text-gray-400">Total</span>
            <span className="text-kaspa-green font-semibold font-mono tabular-nums">
              {LISTING_FEE_KAS} KAS
            </span>
          </div>
        </div>

        {/* Pay button */}
        {isValid ? (
          <a
            href={walletUri}
            className="
              w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl
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
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            Pay {LISTING_FEE_KAS} KAS to List
          </a>
        ) : (
          <button
            type="submit"
            className="
              w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl
              bg-white/[0.04] text-gray-600 font-semibold text-sm
              border border-white/5 cursor-pointer
              hover:bg-white/[0.06] hover:text-gray-400
              active:scale-[0.97]
              transition-all duration-200
            "
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            Fill Form to Pay
          </button>
        )}

        {/* Wallet URI preview */}
        {walletUri && (
          <div className="p-4 rounded-xl bg-black/30 border border-white/5 font-mono text-xs text-gray-400 break-all">
            <span className="text-gray-600">URI: </span>
            {walletUri}
          </div>
        )}
      </form>

      {/* Disclaimer */}
      <div className="glass p-5 text-xs text-gray-600 leading-relaxed">
        <p>
          Listings are processed after payment confirmation on the Kaspa network.
          Covex does not guarantee listing placement and reserves the right to
          remove listings that violate our Terms &amp; Conditions.
          The {LISTING_FEE_KAS} KAS listing fee is non-refundable.
        </p>
      </div>
    </div>
  );
}
