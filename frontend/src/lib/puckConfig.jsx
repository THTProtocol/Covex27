/**
 * Puck component catalog for covenant pages. Creators compose pages ONLY from
 * these platform-authored blocks: props are plain JSON, no user HTML or JS
 * ever reaches the DOM, so published pages are phishing/XSS safe by design.
 * The mandatory transparency panel lives outside Puck and cannot be removed.
 *
 * LIVE DATA: blocks read the live, server-derived covenant state passed to
 * <Puck>/<Render metadata={{ live }}>. Any text field may embed tokens like
 * {{amount_kaspa}}, {{status}}, {{tx_count}}, {{network}}, {{fee_pct}},
 * {{pool_yes}}, {{pool_no}}, {{odds_yes}}, {{odds_no}}, {{total_locked}}.
 * Tokens are resolved at render time only; creators can never inject HTML/JS
 * and never set a fund destination here (that is always derived server-side).
 */

const align = (a) => (a === 'center' ? 'text-center mx-auto' : a === 'right' ? 'text-right ml-auto' : 'text-left');

// Replace {{token}} occurrences in a string with live covenant values. Unknown
// tokens are left as typed (so a literal "{{foo}}" never silently vanishes).
const resolveTokens = (str, live) => {
  if (typeof str !== 'string' || !live || str.indexOf('{{') === -1) return str;
  return str.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, key) => {
    const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), live);
    return v === undefined || v === null ? m : String(v);
  });
};

// Parse a token-or-literal into a number (strips KAS, %, commas, etc.).
const toNum = (v, live) => {
  const resolved = resolveTokens(String(v == null ? '' : v), live);
  const n = parseFloat(resolved.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Available live tokens, surfaced to creators in the Studio helper panel.
export const LIVE_TOKENS = [
  { token: 'name', desc: 'Covenant name' },
  { token: 'status', desc: 'Active or Settled' },
  { token: 'network', desc: 'Kaspa network' },
  { token: 'amount_kaspa', desc: 'KAS currently locked' },
  { token: 'total_locked', desc: 'KAS locked, formatted' },
  { token: 'tx_count', desc: 'On-chain actions seen' },
  { token: 'fee_pct', desc: 'House fee percent' },
  { token: 'rebate_pct', desc: 'Loser rebate percent' },
  { token: 'pool_yes', desc: 'YES pool size (markets)' },
  { token: 'pool_no', desc: 'NO pool size (markets)' },
  { token: 'odds_yes', desc: 'YES payout multiple (markets)' },
  { token: 'odds_no', desc: 'NO payout multiple (markets)' },
  { token: 'creator', desc: 'Creator address, short' },
];

export const puckConfig = {
  categories: {
    layout: { title: 'Layout', components: ['Hero', 'Spacer', 'Divider', 'TwoColumns'] },
    content: { title: 'Content', components: ['Heading', 'Paragraph', 'BulletList', 'FAQItem', 'ImageBlock'] },
    covenant: { title: 'Covenant (live)', components: ['StatRow', 'OddsBar', 'PoolMeter', 'StakeCTA', 'FeeNotice'] },
  },
  components: {
    Hero: {
      label: 'Hero Banner',
      fields: {
        title: { type: 'text' },
        subtitle: { type: 'textarea' },
        alignment: { type: 'radio', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] },
        accent: { type: 'text', label: 'Accent hex (optional)' },
      },
      defaultProps: { title: 'My Covenant', subtitle: 'Stake, play, and settle on the Kaspa BlockDAG.', alignment: 'center', accent: '' },
      render: ({ title, subtitle, alignment, accent, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className={`py-10 px-4 ${align(alignment)}`}>
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-3" style={accent ? { color: accent } : {}}>{resolveTokens(title, live)}</h1>
            {subtitle && <p className="text-gray-300 max-w-xl text-base leading-relaxed mx-auto">{resolveTokens(subtitle, live)}</p>}
          </div>
        );
      },
    },
    Heading: {
      fields: { text: { type: 'text' }, size: { type: 'select', options: [{ label: 'Large', value: 'lg' }, { label: 'Medium', value: 'md' }] } },
      defaultProps: { text: 'Section title', size: 'md' },
      render: ({ text, size, puck }) => (
        <h2 className={`font-bold text-white px-4 mt-6 mb-2 ${size === 'lg' ? 'text-2xl' : 'text-xl'}`}>{resolveTokens(text, puck?.metadata?.live || {})}</h2>
      ),
    },
    Paragraph: {
      fields: { text: { type: 'textarea' } },
      defaultProps: { text: 'Describe how your covenant works, who can join, and how it resolves.' },
      render: ({ text, puck }) => <p className="text-sm text-gray-300 leading-relaxed px-4 mb-3 whitespace-pre-wrap">{resolveTokens(text, puck?.metadata?.live || {})}</p>,
    },
    BulletList: {
      fields: { items: { type: 'array', arrayFields: { text: { type: 'text' } }, defaultItemProps: { text: 'A rule of this covenant' } } },
      defaultProps: { items: [{ text: 'Players stake equal amounts' }, { text: 'Winner takes the pot minus fees' }] },
      render: ({ items, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <ul className="px-8 mb-3 space-y-1.5">
            {(items || []).map((i, idx) => (
              <li key={idx} className="text-sm text-gray-300 list-disc">{resolveTokens(i.text, live)}</li>
            ))}
          </ul>
        );
      },
    },
    FAQItem: {
      fields: { question: { type: 'text' }, answer: { type: 'textarea' } },
      defaultProps: { question: 'How do payouts work?', answer: 'The oracle signs the outcome and the covenant script releases the pot accordingly.' },
      render: ({ question, answer, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className="mx-4 mb-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <p className="text-sm font-bold text-white mb-1">{resolveTokens(question, live)}</p>
            <p className="text-xs text-gray-400 leading-relaxed">{resolveTokens(answer, live)}</p>
          </div>
        );
      },
    },
    ImageBlock: {
      fields: { url: { type: 'text', label: 'Image URL (https)' }, caption: { type: 'text' }, rounded: { type: 'radio', options: [{ label: 'Rounded', value: 'yes' }, { label: 'Square', value: 'no' }] } },
      defaultProps: { url: '', caption: '', rounded: 'yes' },
      render: ({ url, caption, rounded }) => {
        const safe = typeof url === 'string' && (url.startsWith('https://') || url.startsWith('data:image/'));
        if (!safe) return <div className="mx-4 mb-3 h-32 rounded-xl border border-dashed border-white/15 flex items-center justify-center text-xs text-gray-500">Add an https image URL</div>;
        return (
          <figure className="mx-4 mb-3">
            <img src={url} alt={caption || 'covenant image'} className={`w-full max-h-96 object-cover border border-white/10 ${rounded === 'yes' ? 'rounded-2xl' : ''}`} />
            {caption && <figcaption className="text-[11px] text-gray-500 mt-1 text-center">{caption}</figcaption>}
          </figure>
        );
      },
    },
    StatRow: {
      label: 'Stats Row (live)',
      fields: { stats: { type: 'array', arrayFields: { label: { type: 'text' }, value: { type: 'text', label: 'Value (supports {{tokens}})' } }, defaultItemProps: { label: 'Stat', value: '0' } } },
      defaultProps: { stats: [{ label: 'Locked', value: '{{total_locked}}' }, { label: 'Status', value: '{{status}}' }, { label: 'Actions', value: '{{tx_count}}' }] },
      render: ({ stats, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className="grid grid-cols-3 gap-3 px-4 mb-4">
            {(stats || []).slice(0, 6).map((s, i) => (
              <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-gray-500">{resolveTokens(s.label, live)}</p>
                <p className="text-lg font-bold text-white">{resolveTokens(s.value, live)}</p>
              </div>
            ))}
          </div>
        );
      },
    },
    OddsBar: {
      label: 'Odds Bar (live)',
      fields: {
        labelA: { type: 'text', label: 'Outcome A label' },
        valueA: { type: 'text', label: 'A pool/weight (supports {{tokens}})' },
        colorA: { type: 'text', label: 'A color hex' },
        labelB: { type: 'text', label: 'Outcome B label' },
        valueB: { type: 'text', label: 'B pool/weight (supports {{tokens}})' },
        colorB: { type: 'text', label: 'B color hex' },
        showOdds: { type: 'radio', options: [{ label: 'Show payout x', value: 'yes' }, { label: 'Hide', value: 'no' }] },
      },
      defaultProps: { labelA: 'YES', valueA: '{{pool_yes}}', colorA: '#49EACB', labelB: 'NO', valueB: '{{pool_no}}', colorB: '#F472B6', showOdds: 'yes' },
      render: ({ labelA, valueA, colorA, labelB, valueB, colorB, showOdds, puck }) => {
        const live = puck?.metadata?.live || {};
        const a = toNum(valueA, live);
        const b = toNum(valueB, live);
        const total = a + b;
        const pctA = total > 0 ? Math.round((a / total) * 100) : 50;
        const pctB = 100 - pctA;
        // Payout multiple for a side = total pool / that side's pool (parimutuel style).
        const oddsA = a > 0 ? (total / a) : 0;
        const oddsB = b > 0 ? (total / b) : 0;
        return (
          <div className="mx-4 mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between mb-2 text-sm font-bold">
              <span style={{ color: colorA || '#49EACB' }}>{resolveTokens(labelA, live)} {pctA}%</span>
              <span style={{ color: colorB || '#F472B6' }}>{pctB}% {resolveTokens(labelB, live)}</span>
            </div>
            <div className="h-4 w-full rounded-full overflow-hidden flex bg-white/5 border border-white/10">
              <div className="h-full transition-all duration-500" style={{ width: `${pctA}%`, background: colorA || '#49EACB' }} />
              <div className="h-full transition-all duration-500" style={{ width: `${pctB}%`, background: colorB || '#F472B6' }} />
            </div>
            {showOdds === 'yes' && (
              <div className="flex items-center justify-between mt-2 text-[11px] font-mono text-gray-400">
                <span>{oddsA > 0 ? `${oddsA.toFixed(2)}x` : '-'} payout</span>
                <span>pool {total > 0 ? total.toLocaleString() : '0'}</span>
                <span>{oddsB > 0 ? `${oddsB.toFixed(2)}x` : '-'} payout</span>
              </div>
            )}
          </div>
        );
      },
    },
    PoolMeter: {
      label: 'Pool Meter (live)',
      fields: {
        label: { type: 'text' },
        value: { type: 'text', label: 'Current (supports {{tokens}})' },
        max: { type: 'text', label: 'Target / max (supports {{tokens}})' },
        suffix: { type: 'text', label: 'Unit suffix' },
        color: { type: 'text', label: 'Bar color hex' },
      },
      defaultProps: { label: 'Total value locked', value: '{{amount_kaspa}}', max: '1000', suffix: 'KAS', color: '#49EACB' },
      render: ({ label, value, max, suffix, color, puck }) => {
        const live = puck?.metadata?.live || {};
        const v = toNum(value, live);
        const m = toNum(max, live);
        const pct = m > 0 ? Math.min(100, Math.round((v / m) * 100)) : 0;
        return (
          <div className="mx-4 mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex items-end justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">{resolveTokens(label, live)}</p>
              <p className="text-lg font-black text-white">{v.toLocaleString()} <span className="text-xs font-medium text-gray-400">{suffix}</span></p>
            </div>
            <div className="h-2.5 w-full rounded-full overflow-hidden bg-white/5 border border-white/10">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color || '#49EACB' }} />
            </div>
            {m > 0 && <p className="text-[10px] text-gray-500 mt-1 text-right">{pct}% of {m.toLocaleString()} {suffix}</p>}
          </div>
        );
      },
    },
    StakeCTA: {
      label: 'Action Button',
      fields: {
        label: { type: 'text' },
        helper: { type: 'text' },
        action: { type: 'select', label: 'On click', options: [
          { label: 'Open interact panel', value: 'interact' },
          { label: 'Place a bet (markets)', value: 'bet' },
          { label: 'Lock funds / spend', value: 'spend' },
        ] },
        outcome: { type: 'radio', label: 'Bet outcome', options: [{ label: 'YES', value: 'yes' }, { label: 'NO', value: 'no' }] },
        amount: { type: 'text', label: 'Suggested amount (KAS)' },
      },
      defaultProps: { label: 'Stake and join', helper: 'Opens the interact panel. Non-custodial, signs in your wallet.', action: 'interact', outcome: 'yes', amount: '' },
      render: ({ label, helper, action, outcome, amount, puck }) => {
        const live = puck?.metadata?.live || {};
        // Same-origin React render (not the sandboxed iframe), so a click posts a
        // typed COVENANT_ACTION the covenant page validates and routes. The page
        // ALWAYS derives the real destination + scriptHash from the indexed
        // covenant record; this payload only carries intent (never an address).
        const onClick = (e) => {
          e.preventDefault();
          try {
            window.parent.postMessage({ type: 'COVENANT_ACTION', action: action || 'interact', outcome: outcome || 'yes', amountKas: toNum(amount, live) || null }, '*');
          } catch (_) { /* no-op */ }
        };
        return (
          <div className="px-4 mb-4 text-center">
            <a href="#interact" onClick={onClick} className="inline-block px-8 py-4 rounded-2xl bg-kaspa-green text-black font-extrabold text-lg hover:brightness-110 transition-all cursor-pointer">
              {resolveTokens(label, live)}
            </a>
            {helper && <p className="text-[11px] text-gray-500 mt-2">{resolveTokens(helper, live)}</p>}
          </div>
        );
      },
    },
    FeeNotice: {
      label: 'Fee Transparency',
      fields: { feeText: { type: 'textarea', label: 'Fee breakdown text' } },
      defaultProps: { feeText: 'Winner receives 96% of the pot. Creator earns 2%. 2% returns to the covenant for the next round.' },
      render: ({ feeText, puck }) => (
        <div className="mx-4 mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <p className="text-[10px] uppercase tracking-widest text-amber-300 mb-1 font-bold">Fees, in plain words</p>
          <p className="text-xs text-amber-100/80 leading-relaxed">{resolveTokens(feeText, puck?.metadata?.live || {})}</p>
        </div>
      ),
    },
    TwoColumns: {
      fields: { left: { type: 'textarea' }, right: { type: 'textarea' } },
      defaultProps: { left: 'Left column text', right: 'Right column text' },
      render: ({ left, right, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className="grid sm:grid-cols-2 gap-4 px-4 mb-4">
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{resolveTokens(left, live)}</p>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{resolveTokens(right, live)}</p>
          </div>
        );
      },
    },
    Spacer: {
      fields: { size: { type: 'select', options: [{ label: 'Small', value: 'sm' }, { label: 'Medium', value: 'md' }, { label: 'Large', value: 'lg' }] } },
      defaultProps: { size: 'md' },
      render: ({ size }) => <div className={size === 'lg' ? 'h-16' : size === 'sm' ? 'h-4' : 'h-8'} />,
    },
    Divider: {
      fields: {},
      defaultProps: {},
      render: () => <hr className="border-white/[0.08] mx-4 my-4" />,
    },
  },
};

export default puckConfig;
