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
 *
 * IMAGES: image fields accept https:// (or data:image/) URLs only; anything
 * else renders a neutral placeholder. The look (gradients, glow, glass) is
 * built from the platform design tokens so a page reads premium even with no
 * uploaded image at all.
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

const isHttpsImg = (u) => typeof u === 'string' && (u.startsWith('https://') || u.startsWith('data:image/'));

// A creator-placed CTA NEVER carries a destination. It posts a typed intent the
// covenant page validates and routes; the real address + scriptHash are always
// derived server-side from the indexed covenant record. (See CovenantInteractive.)
const ctaClick = (action, amount) => (e) => {
  e.preventDefault();
  try {
    window.parent.postMessage({ type: 'COVENANT_ACTION', action: action || 'interact', outcome: 'yes', amountKas: amount || null }, '*');
  } catch (_) { /* no-op */ }
};

// Curated full-page background presets: pure CSS gradients (no external images,
// no copyright). A page looks designed before a creator adds any imagery.
export const BG_PRESETS = {
  'kaspa-hero': { name: 'Kaspa Hero', css: 'radial-gradient(120% 90% at 50% -10%, rgba(73,234,203,0.16) 0%, rgba(73,234,203,0.04) 38%, rgba(5,5,10,0.92) 72%), #05050A' },
  'gold-prestige': { name: 'Gold Prestige', css: 'radial-gradient(120% 90% at 50% -10%, rgba(232,175,52,0.16) 0%, rgba(232,175,52,0.04) 38%, rgba(5,5,10,0.92) 72%), #05050A' },
  'purple-mystic': { name: 'Purple Mystic', css: 'radial-gradient(120% 90% at 50% -10%, rgba(168,85,247,0.16) 0%, rgba(73,234,203,0.05) 42%, rgba(5,5,10,0.92) 74%), #05050A' },
  'aurora': { name: 'Aurora', css: 'linear-gradient(135deg, rgba(73,234,203,0.10) 0%, rgba(168,85,247,0.08) 45%, rgba(5,5,10,0.95) 100%), #05050A' },
  'midnight': { name: 'Midnight', css: '#05050A' },
};
const BG_PRESET_OPTIONS = Object.entries(BG_PRESETS).map(([value, v]) => ({ label: v.name, value }));

// Gradient fills for the CTA banner (accent-tinted over near-black).
const CTA_GRADS = {
  'kaspa': 'linear-gradient(135deg, rgba(73,234,203,0.28) 0%, rgba(73,234,203,0.06) 100%), #0a0a0f',
  'gold': 'linear-gradient(135deg, rgba(232,175,52,0.24) 0%, rgba(232,175,52,0.05) 100%), #0a0a0f',
  'purple': 'linear-gradient(135deg, rgba(168,85,247,0.22) 0%, rgba(73,234,203,0.08) 100%), #0a0a0f',
  'blue': 'linear-gradient(135deg, rgba(59,130,246,0.20) 0%, rgba(73,234,203,0.07) 100%), #0a0a0f',
};

const HL = { 'kaspa-green': '#49EACB', 'kaspa-gold': '#E8AF34', 'purple': '#A855F7', 'blue': '#3B82F6' };

// Map a column count to literal Tailwind classes (kept as literals so JIT keeps them).
const COL_CLASS = { '2': 'sm:grid-cols-2', '3': 'sm:grid-cols-2 lg:grid-cols-3', '4': 'sm:grid-cols-2 lg:grid-cols-4' };

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

const placeholder = (label) => (
  <div className="mx-4 mb-3 h-40 rounded-2xl border border-dashed border-white/15 flex items-center justify-center text-xs text-gray-500">{label}</div>
);

export const puckConfig = {
  root: {
    fields: {
      pageLogo: { type: 'text', label: 'Logo URL (https, optional)' },
      accentColor: { type: 'text', label: 'Accent hex' },
      backgroundPreset: { type: 'select', label: 'Page background', options: BG_PRESET_OPTIONS },
      fontFamily: { type: 'select', label: 'Font', options: [{ label: 'Inter (sans)', value: 'inter' }, { label: 'JetBrains Mono', value: 'mono' }] },
    },
    defaultProps: { pageLogo: '', accentColor: '#49EACB', backgroundPreset: 'kaspa-hero', fontFamily: 'inter' },
    render: ({ children, pageLogo, accentColor, backgroundPreset, fontFamily }) => {
      const bg = (BG_PRESETS[backgroundPreset] || BG_PRESETS['kaspa-hero']).css;
      const font = fontFamily === 'mono' ? "'JetBrains Mono', ui-monospace, monospace" : "'Inter', system-ui, -apple-system, sans-serif";
      return (
        <div className="relative" style={{ background: bg, fontFamily: font, ['--page-accent']: accentColor || '#49EACB' }}>
          {isHttpsImg(pageLogo) && (
            <div className="flex items-center px-6 py-4">
              <img src={pageLogo} alt="covenant brand logo" className="h-9 max-w-[200px] object-contain" />
            </div>
          )}
          {children}
        </div>
      );
    },
  },
  categories: {
    hero: { title: 'Hero & banners', components: ['HeroImage', 'CTABanner', 'StatBanner'] },
    layout: { title: 'Layout', components: ['Hero', 'Spacer', 'Divider', 'TwoColumns'] },
    content: { title: 'Content', components: ['Heading', 'Paragraph', 'BulletList', 'FAQItem', 'ImageBlock', 'ImageGallery', 'FeatureGrid', 'LogoStrip'] },
    covenant: { title: 'Covenant (live)', components: ['StatRow', 'OddsBar', 'OddsHighlightCard', 'PoolMeter', 'StakeCTA', 'FeeNotice'] },
  },
  components: {
    HeroImage: {
      label: 'Hero (image)',
      fields: {
        backgroundImageUrl: { type: 'text', label: 'Background image URL (https, optional)' },
        overlayOpacity: { type: 'select', options: [{ label: 'Light', value: '0.4' }, { label: 'Medium', value: '0.55' }, { label: 'Strong', value: '0.7' }, { label: 'Max', value: '0.82' }] },
        title: { type: 'text' },
        subtitle: { type: 'textarea' },
        ctaLabel: { type: 'text', label: 'Button label (blank to hide)' },
        ctaAction: { type: 'select', options: [{ label: 'Open interact', value: 'interact' }, { label: 'Place a bet', value: 'bet' }, { label: 'Lock / spend', value: 'spend' }] },
        accentColor: { type: 'text', label: 'Accent hex' },
        alignment: { type: 'radio', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] },
      },
      defaultProps: { backgroundImageUrl: '', overlayOpacity: '0.55', title: '{{name}}', subtitle: 'A live, on-chain Kaspa covenant. {{total_locked}} secured on {{network}}.', ctaLabel: 'Enter covenant', ctaAction: 'interact', accentColor: '#49EACB', alignment: 'center' },
      render: ({ backgroundImageUrl, overlayOpacity, title, subtitle, ctaLabel, ctaAction, accentColor, alignment, puck }) => {
        const live = puck?.metadata?.live || {};
        const ac = accentColor || '#49EACB';
        const ov = parseFloat(overlayOpacity) || 0.55;
        const bg = isHttpsImg(backgroundImageUrl)
          ? `linear-gradient(135deg, rgba(5,5,10,${ov}) 0%, rgba(5,5,10,${Math.min(1, ov + 0.18)}) 100%), url(${backgroundImageUrl}) center/cover no-repeat`
          : `radial-gradient(120% 130% at 50% 0%, ${ac}28 0%, rgba(5,5,10,0.86) 55%), #0a0a0f`;
        const center = alignment !== 'left';
        return (
          <div className={`relative overflow-hidden mb-6 h-[340px] md:h-[480px] flex flex-col justify-center px-7 md:px-14 ${center ? 'items-center text-center' : 'items-start text-left'}`} style={{ background: bg }}>
            <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 140px 24px rgba(0,0,0,0.55)' }} />
            <h1 className="relative text-3xl md:text-5xl font-black leading-[1.05] mb-3 drop-shadow" style={{ color: ac }}>{resolveTokens(title, live)}</h1>
            {subtitle && <p className="relative text-gray-200 text-base md:text-lg max-w-2xl mb-6 leading-relaxed">{resolveTokens(subtitle, live)}</p>}
            {ctaLabel && (
              <a href="#interact" onClick={ctaClick(ctaAction)} className="relative inline-block px-8 py-4 rounded-2xl bg-kaspa-green text-black font-extrabold text-base md:text-lg hover:brightness-125 transition-all cursor-pointer shadow-[0_0_0_1px_rgba(73,234,203,0.35),0_18px_50px_-18px_rgba(73,234,203,0.5)]">
                {resolveTokens(ctaLabel, live)}
              </a>
            )}
          </div>
        );
      },
    },
    CTABanner: {
      label: 'CTA Banner',
      fields: {
        headline: { type: 'text' },
        description: { type: 'textarea' },
        buttonLabel: { type: 'text' },
        buttonAction: { type: 'select', options: [{ label: 'Open interact', value: 'interact' }, { label: 'Place a bet', value: 'bet' }, { label: 'Lock / spend', value: 'spend' }] },
        backgroundGradient: { type: 'select', options: [{ label: 'Kaspa', value: 'kaspa' }, { label: 'Gold', value: 'gold' }, { label: 'Purple', value: 'purple' }, { label: 'Blue', value: 'blue' }] },
      },
      defaultProps: { headline: 'Ready to join?', description: 'Stake in your own wallet. Non-custodial, settled on-chain.', buttonLabel: 'Get started', buttonAction: 'interact', backgroundGradient: 'kaspa' },
      render: ({ headline, description, buttonLabel, buttonAction, backgroundGradient, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className="relative overflow-hidden mx-2 md:mx-4 mb-5 rounded-3xl px-7 md:px-12 py-10 md:py-12 flex flex-col md:flex-row items-center justify-between gap-6" style={{ background: CTA_GRADS[backgroundGradient] || CTA_GRADS.kaspa }}>
            <div className="text-center md:text-left">
              <h2 className="text-2xl md:text-4xl font-black text-white leading-tight">{resolveTokens(headline, live)}</h2>
              {description && <p className="text-gray-200 text-base mt-2 max-w-md">{resolveTokens(description, live)}</p>}
            </div>
            {buttonLabel && (
              <a href="#interact" onClick={ctaClick(buttonAction)} className="shrink-0 inline-block px-8 py-3.5 rounded-2xl bg-kaspa-green text-black font-bold text-base hover:scale-105 transition-transform cursor-pointer">
                {resolveTokens(buttonLabel, live)}
              </a>
            )}
          </div>
        );
      },
    },
    StatBanner: {
      label: 'Big Stat',
      fields: {
        statValue: { type: 'text', label: 'Value (supports {{tokens}})' },
        statLabel: { type: 'text' },
        description: { type: 'textarea' },
        iconEmoji: { type: 'text', label: 'Emoji (optional)' },
        highlightColor: { type: 'select', options: [{ label: 'Kaspa green', value: 'kaspa-green' }, { label: 'Gold', value: 'kaspa-gold' }, { label: 'Purple', value: 'purple' }, { label: 'Blue', value: 'blue' }] },
      },
      defaultProps: { statValue: '{{total_locked}}', statLabel: 'Total value locked', description: '', iconEmoji: '🔒', highlightColor: 'kaspa-green' },
      render: ({ statValue, statLabel, description, iconEmoji, highlightColor, puck }) => {
        const live = puck?.metadata?.live || {};
        const c = HL[highlightColor] || HL['kaspa-green'];
        return (
          <div className="mx-2 md:mx-4 mb-5 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-8 md:p-12 flex flex-col items-center justify-center text-center">
            {iconEmoji && <div className="text-5xl md:text-6xl mb-3">{iconEmoji}</div>}
            <div className="text-4xl md:text-6xl font-black mb-2 leading-none" style={{ color: c }}>{resolveTokens(statValue, live)}</div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">{resolveTokens(statLabel, live)}</div>
            {description && <p className="text-gray-300 text-sm md:text-base max-w-md mt-4 leading-relaxed">{resolveTokens(description, live)}</p>}
          </div>
        );
      },
    },
    FeatureGrid: {
      label: 'Feature Grid',
      fields: {
        columns: { type: 'select', options: [{ label: '2', value: '2' }, { label: '3', value: '3' }, { label: '4', value: '4' }] },
        features: {
          type: 'array',
          arrayFields: { iconEmoji: { type: 'text', label: 'Emoji' }, headline: { type: 'text' }, description: { type: 'textarea' } },
          defaultItemProps: { iconEmoji: '✦', headline: 'Feature', description: 'Describe this feature.' },
        },
      },
      defaultProps: {
        columns: '3',
        features: [
          { iconEmoji: '🔒', headline: 'On-chain enforced', description: 'Funds move only by satisfying the script. No oracle, no trust in Covex.' },
          { iconEmoji: '⚡', headline: 'Kaspa speed', description: 'Settles on the BlockDAG at 10 blocks per second.' },
          { iconEmoji: '🛡️', headline: 'Non-custodial', description: 'You sign in your own wallet. Keys never leave your device.' },
        ],
      },
      render: ({ columns, features, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className={`grid grid-cols-1 ${COL_CLASS[columns] || COL_CLASS['3']} gap-4 px-2 md:px-4 mb-5`}>
            {(features || []).map((f, i) => (
              <div key={i} className="rounded-2xl p-6 border border-white/[0.08] bg-white/[0.02] hover-lift-premium transition-all">
                {f.iconEmoji && <div className="w-12 h-12 rounded-xl bg-kaspa-green/10 flex items-center justify-center text-2xl mb-4">{f.iconEmoji}</div>}
                <h3 className="text-lg font-bold text-white mb-1.5">{resolveTokens(f.headline, live)}</h3>
                <p className="text-sm text-gray-300 leading-relaxed">{resolveTokens(f.description, live)}</p>
              </div>
            ))}
          </div>
        );
      },
    },
    ImageGallery: {
      label: 'Image Gallery',
      fields: {
        columns: { type: 'select', options: [{ label: '2', value: '2' }, { label: '3', value: '3' }, { label: '4', value: '4' }] },
        images: { type: 'array', arrayFields: { url: { type: 'text', label: 'Image URL (https)' }, caption: { type: 'text' } }, defaultItemProps: { url: '', caption: '' } },
      },
      defaultProps: { columns: '3', images: [{ url: '', caption: '' }, { url: '', caption: '' }, { url: '', caption: '' }] },
      render: ({ columns, images }) => {
        const imgs = (images || []).filter((i) => isHttpsImg(i.url));
        if (imgs.length === 0) return placeholder('Add your own https image URLs - pictures relevant to this covenant');
        return (
          <div className={`grid grid-cols-2 ${COL_CLASS[columns] || COL_CLASS['3']} gap-3 px-2 md:px-4 mb-5`}>
            {imgs.map((im, i) => (
              <a key={i} href={im.url} target="_blank" rel="noopener noreferrer" className="group relative block aspect-video rounded-xl overflow-hidden border border-white/[0.08]">
                <img src={im.url} alt={im.caption || 'gallery image'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                {im.caption && <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-[11px] text-gray-200 px-2 py-1.5">{im.caption}</span>}
              </a>
            ))}
          </div>
        );
      },
    },
    LogoStrip: {
      label: 'Logo Strip',
      fields: {
        title: { type: 'text' },
        logos: { type: 'array', arrayFields: { url: { type: 'text', label: 'Logo URL (https)' } }, defaultItemProps: { url: '' } },
      },
      defaultProps: { title: 'Trusted by', logos: [{ url: '' }, { url: '' }, { url: '' }, { url: '' }] },
      render: ({ title, logos }) => {
        const ls = (logos || []).filter((l) => isHttpsImg(l.url));
        return (
          <div className="px-2 md:px-4 mb-5 py-6">
            {title && <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-6">{title}</p>}
            {ls.length === 0 ? placeholder('Add https logo URLs') : (
              <div className="flex flex-wrap items-center justify-center gap-4">
                {ls.map((l, i) => (
                  <div key={i} className="h-16 px-4 flex items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-all">
                    <img src={l.url} alt="partner logo" className="max-h-10 max-w-[120px] object-contain opacity-80 hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    Hero: {
      label: 'Hero (text)',
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
        if (!isHttpsImg(url)) return placeholder('Add your own image URL (https) - a picture relevant to this covenant');
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
          <div className="grid grid-cols-3 gap-3 px-2 md:px-4 mb-5">
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
        const oddsA = a > 0 ? (total / a) : 0;
        const oddsB = b > 0 ? (total / b) : 0;
        return (
          <div className="mx-2 md:mx-4 mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
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
    OddsHighlightCard: {
      label: 'Odds Card (live)',
      fields: {
        outcomeName: { type: 'text' },
        multiplier: { type: 'text', label: 'Payout x (supports {{tokens}})' },
        poolSize: { type: 'text', label: 'Pool (supports {{tokens}})' },
        isWinner: { type: 'radio', options: [{ label: 'Winner', value: 'yes' }, { label: 'Normal', value: 'no' }] },
        accentColor: { type: 'text', label: 'Accent hex' },
      },
      defaultProps: { outcomeName: 'YES', multiplier: '{{odds_yes}}', poolSize: '{{pool_yes}}', isWinner: 'no', accentColor: '#49EACB' },
      render: ({ outcomeName, multiplier, poolSize, isWinner, accentColor, puck }) => {
        const live = puck?.metadata?.live || {};
        const ac = accentColor || '#49EACB';
        const win = isWinner === 'yes';
        return (
          <div className="mx-2 md:mx-4 mb-5 rounded-2xl p-6 md:p-7 border-2 transition-all"
            style={win
              ? { borderColor: `${ac}80`, background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))', boxShadow: `0 0 24px ${ac}40, inset 0 1px 0 rgba(255,255,255,0.05)` }
              : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">{resolveTokens(outcomeName, live)}</span>
              {win && <span className="text-lg" style={{ color: ac }}>🏆</span>}
            </div>
            <div className="text-4xl md:text-5xl font-black leading-none" style={{ color: ac }}>{resolveTokens(multiplier, live)}x</div>
            <div className="mt-4 pt-4 border-t border-white/[0.08]">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Pool</p>
              <p className="text-lg font-semibold text-white">{resolveTokens(poolSize, live)}</p>
            </div>
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
          <div className="mx-2 md:mx-4 mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
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
        const onClick = (e) => {
          e.preventDefault();
          try {
            window.parent.postMessage({ type: 'COVENANT_ACTION', action: action || 'interact', outcome: outcome || 'yes', amountKas: toNum(amount, live) || null }, '*');
          } catch (_) { /* no-op */ }
        };
        return (
          <div className="px-2 md:px-4 mb-5 text-center">
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
        <div className="mx-2 md:mx-4 mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
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
