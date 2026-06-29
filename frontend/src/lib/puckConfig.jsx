/* eslint-disable react-refresh/only-export-components -- this module intentionally co-exports its component(s) with related constants/hooks/helpers (e.g. a Provider plus its useX hook). That only affects dev Fast Refresh granularity, never the production build or tests; splitting these into separate files is not warranted here. */
/**
 * Puck component catalog for covenant pages. Creators compose pages ONLY from
 * these platform-authored blocks: props are plain JSON, no user HTML or JS ever
 * reaches the DOM (the single sanctioned HTML surface is the RichText block, which
 * runs a strict markdown allowlist sanitizer), so published pages are phishing/XSS
 * safe by design. The mandatory transparency panel lives outside Puck and cannot
 * be removed.
 *
 * THEME: every structural surface (panel, border, muted text, divider, CTA tint)
 * is a `.cvx-*` class from styles/covexPuck.css with a matching `.light` override,
 * so blocks render premium in BOTH dark and light without per-render theme logic.
 * CTAs route through ui/Button (which is already light-aware); card-shaped blocks
 * route through ui/Card. Creator-chosen accent HEX stays inline (they picked it).
 *
 * LIVE DATA: blocks read the live, server-derived covenant state passed to
 * <Puck>/<Render metadata={{ live }}>. Any text field may embed tokens like
 * {{amount_kaspa}}, {{status}}, {{tx_count}}, {{network}}, {{fee_pct}},
 * {{pool_total}}, {{pool_yes}}, {{pool_no}}, {{odds_yes}}, {{odds_no}},
 * {{total_locked}}, {{kickoff}}, {{settle_at}}, {{timelock}}, {{oracle_pubkey}}.
 * Structured blocks also read live.actions / live.pool / live.odds off metadata.
 * Tokens are resolved at render time only; creators can never inject HTML/JS and
 * never set a fund destination here (that is always derived server-side).
 *
 * HONESTY: the EnforcementBadge reflects the SERVER-derived enforcement_reality as
 * a static label only (never a fund flow). No block may make an enforcement claim
 * the record does not support.
 *
 * IMAGES: image fields accept https:// (or data:image/) URLs only; anything else
 * renders a neutral placeholder. The look (gradients, glow, glass) is built from
 * platform design tokens so a page reads premium even with no uploaded image.
 */
import * as React from 'react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Check, Quote, X, MessageCircle, Send, GitBranch, Globe, Trophy, ChevronDown } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import { renderSafeMarkdown } from './safeMarkdown';
import { colorField, iconField, imageField } from './puckFields.jsx';
import { DynamicLucideIcon } from './lucideLazy.jsx';
import './../styles/covexPuck.css';

const align = (a) => (a === 'center' ? 'text-center mx-auto' : a === 'right' ? 'text-right ml-auto' : 'text-left');

// SAFE_COLOR: creator-supplied color strings flow straight into inline `style`
// (and into template-literal gradients / box-shadows), so they are a CSS-injection
// surface. We accept ONLY a strict shape: #hex (3-8 digits), rgb()/rgba(),
// hsl()/hsla(), or a small fixed named-color allowlist. Anything containing
// url(), expression(), javascript:, a semicolon, a comment, or stray braces/
// parens is rejected and falls back to the brand teal.
const NAMED_COLORS = new Set([
  'transparent', 'currentcolor', 'inherit',
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
  'pink', 'teal', 'cyan', 'magenta', 'gray', 'grey', 'gold', 'silver',
  'lime', 'navy', 'maroon', 'olive', 'aqua', 'fuchsia', 'indigo', 'violet',
  'crimson', 'salmon', 'coral', 'tomato', 'turquoise', 'slateblue', 'skyblue',
]);
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$|^rgba?\(\s*[\d.,\s%/]+\)$|^hsla?\(\s*[\d.,\s%/deg]+\)$/;
const FALLBACK_COLOR = '#49EACB';
export const SAFE_COLOR = (c, fallback = FALLBACK_COLOR) => {
  const v = typeof c === 'string' ? c.trim() : '';
  if (!v) return fallback;
  if (/[;{}<>\\]|url\(|expression|javascript:|\/\*|\*\//i.test(v)) return fallback;
  if (COLOR_RE.test(v)) return v;
  if (NAMED_COLORS.has(v.toLowerCase())) return v;
  return fallback;
};

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
  const n = parseFloat(resolved.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const isHttpsImg = (u) => typeof u === 'string' && (u.startsWith('https://') || u.startsWith('data:image/'));
// Only an absolute https link is ever emitted as an href (no javascript:/data:/relative).
const isHttpsLink = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u.trim());

// Video embeds: a STRICT two-provider allowlist (YouTube, Vimeo). The creator never
// supplies a raw src or iframe markup; we extract the video id and BUILD the embed URL
// ourselves from a fixed template, so a hostile string can never become an arbitrary
// frame. Anything that is not a recognised YouTube/Vimeo URL returns null (no embed).
export const parseVideoEmbed = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return null;
  // YouTube: watch?v=ID | youtu.be/ID | /embed/ID  (ID is exactly 11 url-safe chars)
  let m = v.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#].*)?$/i);
  if (m) return { src: `https://www.youtube-nocookie.com/embed/${m[1]}`, title: 'YouTube video' };
  // Vimeo: vimeo.com/ID | player.vimeo.com/video/ID  (ID is digits)
  m = v.match(/^https:\/\/(?:www\.)?(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d{6,12})(?:[?&#].*)?$/i);
  if (m) return { src: `https://player.vimeo.com/video/${m[1]}`, title: 'Vimeo video' };
  return null;
};

// Render a stored lucide icon name -> component, with an optional emoji fallback
// (legacy blocks stored an emoji string). Honest, inert, no markup injected. The
// lucide barrel is loaded LAZILY (see ./lucideLazy.jsx) so it never lands on the
// homepage critical path; DynamicLucideIcon repaints once the chunk arrives, so a
// creator's chosen icon always appears on the live covenant page.
function IconOrEmoji({ name, emoji, size = 22, className }) {
  return <DynamicLucideIcon name={name} emoji={emoji} size={size} className={className} />;
}

// A creator-placed CTA NEVER carries a destination. It posts a typed intent the
// covenant page validates and routes; the real address + scriptHash are always
// derived server-side from the indexed covenant record. (See CovenantInteractive.)
const ctaClick = (action, outcome, amount, live) => (e) => {
  e.preventDefault();
  try {
    window.parent.postMessage({
      type: 'COVENANT_ACTION',
      action: action || 'interact',
      outcome: outcome || 'yes',
      amountKas: amount != null ? (toNum(amount, live) || null) : null,
    }, '*');
  } catch { /* no-op */ }
};

// Curated full-page background presets: pure CSS gradients (no external images,
// no copyright). Each carries a light-mode variant so the page background flips
// cleanly instead of staying near-black on a light page.
export const BG_PRESETS = {
  'kaspa-hero': { name: 'Kaspa Hero', css: 'radial-gradient(120% 90% at 50% -10%, rgba(73,234,203,0.16) 0%, rgba(73,234,203,0.04) 38%, rgba(5,5,10,0.92) 72%), #05050A', light: 'radial-gradient(120% 90% at 50% -10%, rgba(13,148,136,0.12) 0%, rgba(13,148,136,0.03) 40%, #f8fafc 74%), #f8fafc' },
  'gold-prestige': { name: 'Gold Prestige', css: 'radial-gradient(120% 90% at 50% -10%, rgba(232,175,52,0.16) 0%, rgba(232,175,52,0.04) 38%, rgba(5,5,10,0.92) 72%), #05050A', light: 'radial-gradient(120% 90% at 50% -10%, rgba(180,83,9,0.1) 0%, rgba(180,83,9,0.03) 40%, #fffbeb 74%), #fffbeb' },
  'purple-mystic': { name: 'Purple Mystic', css: 'radial-gradient(120% 90% at 50% -10%, rgba(168,85,247,0.16) 0%, rgba(73,234,203,0.05) 42%, rgba(5,5,10,0.92) 74%), #05050A', light: 'radial-gradient(120% 90% at 50% -10%, rgba(126,34,206,0.1) 0%, rgba(13,148,136,0.04) 44%, #faf5ff 76%), #faf5ff' },
  'aurora': { name: 'Aurora', css: 'linear-gradient(135deg, rgba(73,234,203,0.10) 0%, rgba(168,85,247,0.08) 45%, rgba(5,5,10,0.95) 100%), #05050A', light: 'linear-gradient(135deg, rgba(13,148,136,0.08) 0%, rgba(126,34,206,0.06) 45%, #f8fafc 100%), #f8fafc' },
  'midnight': { name: 'Midnight', css: '#05050A', light: '#f8fafc' },
};
const BG_PRESET_OPTIONS = Object.entries(BG_PRESETS).map(([value, v]) => ({ label: v.name, value }));

// CTA banner surface class per gradient choice (light handled in covexPuck.css).
const CTA_CLASS = { kaspa: 'cvx-cta-kaspa', gold: 'cvx-cta-gold', purple: 'cvx-cta-purple', blue: 'cvx-cta-blue' };
// ui/Button variant per CTA gradient so the button matches the banner mood.
const CTA_BTN_VARIANT = { kaspa: 'kaspa', gold: 'gold', purple: 'kaspa', blue: 'kaspa' };

// Stat highlight accent: a theme-flipping class for the two brand hues, else inline.
const HL_CLASS = { 'kaspa-green': 'cvx-accent-teal', 'kaspa-gold': 'cvx-accent-gold' };
const HL_INLINE = { purple: '#A855F7', blue: '#3B82F6' };

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
  { token: 'fee_pct', desc: 'Creator fee percent' },
  { token: 'rebate_pct', desc: 'Loser rebate percent' },
  { token: 'pool_total', desc: 'Total KAS staked in the pool' },
  { token: 'pool_yes', desc: 'YES pool size (markets)' },
  { token: 'pool_no', desc: 'NO pool size (markets)' },
  { token: 'odds_yes', desc: 'YES payout x, implied from stakes' },
  { token: 'odds_no', desc: 'NO payout x, implied from stakes' },
  { token: 'kickoff', desc: 'Event kickoff time (markets)' },
  { token: 'settle_at', desc: 'Settlement / resolve time' },
  { token: 'timelock', desc: 'Absolute timelock DAA (timelock covenants)' },
  { token: 'oracle_pubkey', desc: 'external resolver x-only key' },
  { token: 'creator', desc: 'Creator address, short' },
];

const placeholder = (label) => (
  <div className="cvx-placeholder mx-4 mb-3 h-40 rounded-2xl flex items-center justify-center text-xs px-4 text-center">{label}</div>
);

const skeletonRows = (n, h = 'h-10') => (
  <div className="space-y-2">{Array.from({ length: n }).map((_, i) => <div key={i} className={`skeleton ${h} w-full`} />)}</div>
);

// Count-up hook for AnimatedCounter: animates 0 -> target once on mount. Respects
// reduced motion by snapping to the final value.
function useCountUp(target, ms = 1100) {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
    if (reduce || !(target > 0)) { setVal(target); return undefined; }
    let raf; const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

export const puckConfig = {
  root: {
    fields: {
      pageLogo: { type: 'text', label: 'Logo URL (https, optional)' },
      accentColor: colorField('Accent color'),
      backgroundPreset: { type: 'select', label: 'Page background', options: BG_PRESET_OPTIONS },
      fontFamily: { type: 'select', label: 'Font', options: [{ label: 'Inter (sans)', value: 'inter' }, { label: 'JetBrains Mono', value: 'mono' }] },
    },
    defaultProps: { pageLogo: '', accentColor: '#49EACB', backgroundPreset: 'kaspa-hero', fontFamily: 'inter' },
    render: ({ children, pageLogo, accentColor, backgroundPreset, fontFamily }) => {
      const preset = BG_PRESETS[backgroundPreset] || BG_PRESETS['kaspa-hero'];
      const font = fontFamily === 'mono' ? "'JetBrains Mono', ui-monospace, monospace" : "'Inter', system-ui, -apple-system, sans-serif";
      const accent = SAFE_COLOR(accentColor);
      // Theme-aware background: the dark css is the default; .light overrides via the
      // data attribute selector injected once below, so the page bg flips cleanly.
      return (
        <div
          className="cvx-page relative"
          data-bg={backgroundPreset}
          style={{ background: preset.css, fontFamily: font, ['--page-accent']: accent }}
        >
          <style>{`.light .cvx-page[data-bg="${backgroundPreset}"]{background:${preset.light} !important;}`}</style>
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
    hero: { title: 'Hero & banners', components: ['HeroImage', 'CTABanner', 'StatBanner', 'EnforcementBadge'] },
    layout: { title: 'Layout', components: ['Hero', 'GoldenGrid', 'TwoColumns', 'Spacer', 'Divider', 'SectionBackground', 'Tabs', 'Accordion'] },
    content: { title: 'Content', components: ['Heading', 'Paragraph', 'RichText', 'BulletList', 'FAQItem', 'ImageBlock', 'Video', 'ImageGallery', 'Carousel', 'FeatureGrid', 'LogoStrip', 'Timeline', 'PricingTier', 'Testimonials', 'SocialLinks', 'Footer'] },
    covenant: { title: 'Covenant (live)', components: ['StatRow', 'AnimatedCounter', 'OddsBar', 'OddsHighlightCard', 'PoolMeter', 'PoolChart', 'ActivityFeed', 'Leaderboard', 'Marquee', 'Countdown', 'StakeCTA', 'FeeNotice'] },
  },
  components: {
    HeroImage: {
      label: 'Hero (image)',
      fields: {
        backgroundImageUrl: imageField('Background image (https or upload, optional)'),
        overlayOpacity: { type: 'select', options: [{ label: 'Light', value: '0.4' }, { label: 'Medium', value: '0.55' }, { label: 'Strong', value: '0.7' }, { label: 'Max', value: '0.82' }] },
        title: { type: 'text' },
        subtitle: { type: 'textarea' },
        ctaLabel: { type: 'text', label: 'Button label (blank to hide)' },
        ctaAction: { type: 'select', options: [{ label: 'Open interact', value: 'interact' }, { label: 'Back an outcome', value: 'bet' }, { label: 'Lock / spend', value: 'spend' }] },
        accentColor: colorField('Accent color'),
        alignment: { type: 'radio', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] },
      },
      defaultProps: { backgroundImageUrl: '', overlayOpacity: '0.55', title: '{{name}}', subtitle: 'A live, on-chain Kaspa covenant. {{total_locked}} secured on {{network}}.', ctaLabel: 'Enter covenant', ctaAction: 'interact', accentColor: '#49EACB', alignment: 'center' },
      render: ({ backgroundImageUrl, overlayOpacity, title, subtitle, ctaLabel, ctaAction, accentColor, alignment, puck }) => {
        const live = puck?.metadata?.live || {};
        const ac = SAFE_COLOR(accentColor);
        const ov = parseFloat(overlayOpacity) || 0.55;
        const hasImg = isHttpsImg(backgroundImageUrl);
        const center = alignment !== 'left';
        const overlayStyle = hasImg
          ? { background: `linear-gradient(135deg, rgba(5,5,10,${ov}) 0%, rgba(5,5,10,${Math.min(1, ov + 0.18)}) 100%), url(${backgroundImageUrl}) center/cover no-repeat` }
          : { ['--cvx-hero-accent']: `${ac}28`, ['--cvx-hero-accent-l']: 'rgba(13,148,136,0.16)' };
        return (
          <div
            className={`relative overflow-hidden mb-6 h-[340px] md:h-[480px] flex flex-col justify-center px-7 md:px-14 ${hasImg ? '' : 'cvx-hero-fallback'} ${center ? 'items-center text-center' : 'items-start text-left'}`}
            style={overlayStyle}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 140px 24px rgba(0,0,0,0.35)' }} />
            <h1 className="relative text-3xl md:text-5xl font-black leading-[1.05] mb-3 drop-shadow" style={{ color: ac }}>{resolveTokens(title, live)}</h1>
            {subtitle && <p className={`relative text-base md:text-lg max-w-2xl mb-6 leading-relaxed cvx-hero-sub ${hasImg ? 'text-gray-200' : 'cvx-body'}`}>{resolveTokens(subtitle, live)}</p>}
            {ctaLabel && (
              <Button variant="kaspa" size="xl" shimmer className="relative" onClick={ctaClick(ctaAction, 'yes', null, live)}>
                {resolveTokens(ctaLabel, live)}
              </Button>
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
        buttonAction: { type: 'select', options: [{ label: 'Open interact', value: 'interact' }, { label: 'Back an outcome', value: 'bet' }, { label: 'Lock / spend', value: 'spend' }] },
        backgroundGradient: { type: 'select', options: [{ label: 'Kaspa', value: 'kaspa' }, { label: 'Gold', value: 'gold' }, { label: 'Purple', value: 'purple' }, { label: 'Blue', value: 'blue' }] },
      },
      defaultProps: { headline: 'Ready to join?', description: 'Stake in your own wallet. Non-custodial, settled on-chain. See the enforcement badge on this page (script-enforced, oracle-cosigned, or full-zk verified off-chain).', buttonLabel: 'Get started', buttonAction: 'interact', backgroundGradient: 'kaspa' },
      render: ({ headline, description, buttonLabel, buttonAction, backgroundGradient, puck }) => {
        const live = puck?.metadata?.live || {};
        const cls = CTA_CLASS[backgroundGradient] || CTA_CLASS.kaspa;
        const variant = CTA_BTN_VARIANT[backgroundGradient] || 'kaspa';
        return (
          <div className={`relative overflow-hidden mx-2 md:mx-4 mb-5 rounded-3xl px-7 md:px-12 py-10 md:py-12 flex flex-col md:flex-row items-center justify-between gap-6 ${cls}`}>
            <div className="text-center md:text-left">
              <h2 className="text-2xl md:text-4xl font-black leading-tight cvx-cta-title">{resolveTokens(headline, live)}</h2>
              {description && <p className="cvx-body text-base mt-2 max-w-md">{resolveTokens(description, live)}</p>}
            </div>
            {buttonLabel && (
              <Button variant={variant} size="lg" shimmer className="shrink-0" onClick={ctaClick(buttonAction, 'yes', null, live)}>
                {resolveTokens(buttonLabel, live)}
              </Button>
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
        icon: iconField('Icon'),
        highlightColor: { type: 'select', options: [{ label: 'Kaspa green', value: 'kaspa-green' }, { label: 'Gold', value: 'kaspa-gold' }, { label: 'Purple', value: 'purple' }, { label: 'Blue', value: 'blue' }] },
      },
      defaultProps: { statValue: '{{total_locked}}', statLabel: 'Total value locked', description: '', icon: 'Lock', highlightColor: 'kaspa-green' },
      render: ({ statValue, statLabel, description, icon, highlightColor, puck }) => {
        const live = puck?.metadata?.live || {};
        const hlClass = HL_CLASS[highlightColor];
        const inline = hlClass ? undefined : { color: HL_INLINE[highlightColor] || HL_INLINE.purple };
        return (
          <Card className="mx-2 md:mx-4 mb-5 cvx-stat-surface p-8 md:p-12 flex flex-col items-center justify-center text-center">
            <div className="mb-3"><IconOrEmoji name={icon} size={44} className={hlClass} /></div>
            <div className={`text-4xl md:text-6xl font-black mb-2 leading-none ${hlClass || ''}`} style={inline}>{resolveTokens(statValue, live)}</div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] cvx-muted">{resolveTokens(statLabel, live)}</div>
            {description && <p className="cvx-body text-sm md:text-base max-w-md mt-4 leading-relaxed">{resolveTokens(description, live)}</p>}
          </Card>
        );
      },
    },
    EnforcementBadge: {
      label: 'Enforcement Badge',
      fields: {
        note: { type: 'text', label: 'Caption (optional)' },
      },
      defaultProps: { note: 'How this covenant is enforced' },
      // Honest by construction: the chip reflects ONLY the server-derived
      // enforcement_reality. It is a static disclosure label, never a fund flow.
      // - on-chain     = Kaspa consensus enforces the script (strongest)
      // - oracle/hybrid= an external resolver the deployer binds by pubkey co-signs the outcome
      // - full-zk      = a real proof verified off-chain (by you/the counterparty/any verifier)
      // - else         = metadata label only (no enforcement claim)
      render: ({ note, puck }) => {
        const live = puck?.metadata?.live || {};
        const er = String(live.enforcement_reality || '').toLowerCase();
        let variant = 'metadata';
        let label = 'Metadata only';
        let desc = 'A descriptive label; not enforced by the protocol.';
        if (er === 'on-chain') { variant = 'on-chain'; label = 'On-chain enforced'; desc = 'Kaspa consensus enforces the script. Funds move only by satisfying it.'; }
        else if (er === 'full-zk') { variant = 'full-zk'; label = 'Full ZK verified'; desc = 'A real zero-knowledge proof, verified fail-closed off-chain by you, the counterparty, or any external verifier, gating a 2-of-2 cosign. For the circom suite the proof is verified off-chain.'; }
        else if (er === 'hybrid' || er.includes('oracle')) { variant = 'oracle'; label = 'Resolver-attested'; desc = 'Custody and payout are on-chain; the outcome is attested by an external resolver the deployer binds by pubkey at deploy. Covex never attests real-world facts.'; }
        return (
          <div className="mx-2 md:mx-4 mb-5 flex flex-col items-center text-center gap-2">
            <Badge variant={variant} dot className="text-sm px-3 py-1">{label}</Badge>
            {note && <p className="text-[11px] cvx-muted">{resolveTokens(note, live)}</p>}
            <p className="text-[11px] cvx-faint max-w-md">{desc}</p>
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
          arrayFields: { icon: iconField('Icon'), headline: { type: 'text' }, description: { type: 'textarea' } },
          defaultItemProps: { icon: 'Sparkles', headline: 'Feature', description: 'Describe this feature.' },
        },
      },
      defaultProps: {
        columns: '3',
        features: [
          // NOTE: the "no oracle, no trust" line is qualified to a script-enforced
          // covenant only, so a resolver-attested market can never ship it unqualified.
          { icon: 'Lock', headline: 'On-chain enforced', description: 'When the covenant is script-enforced, funds move only by satisfying the script, no oracle, no trust in Covex. When it is resolver-resolved or resolver-attested instead, the deployer-bound resolver (bound by pubkey at deploy) is the trust assumption, not Covex. See the enforcement badge on this page (script-enforced, oracle-cosigned, or full-zk verified off-chain).' },
          { icon: 'Zap', headline: 'Kaspa speed', description: 'Settles on the BlockDAG at 10 blocks per second.' },
          { icon: 'ShieldCheck', headline: 'Non-custodial', description: 'You sign in your own wallet. Keys never leave your device. The enforcement badge on this page shows whether the script, the oracle, or a verified ZK proof gates payout.' },
        ],
      },
      render: ({ columns, features, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className={`grid grid-cols-1 ${COL_CLASS[columns] || COL_CLASS['3']} gap-4 px-2 md:px-4 mb-5`}>
            {(features || []).map((f, i) => (
              <Card key={i} hover className="p-6">
                <div className="cvx-icon-chip mb-4"><IconOrEmoji name={f.icon} emoji={f.iconEmoji} size={24} /></div>
                <h3 className="text-lg font-bold cvx-title mb-1.5">{resolveTokens(f.headline, live)}</h3>
                <p className="text-sm cvx-body leading-relaxed">{resolveTokens(f.description, live)}</p>
              </Card>
            ))}
          </div>
        );
      },
    },
    PricingTier: {
      label: 'Pricing Tiers',
      fields: {
        columns: { type: 'select', options: [{ label: '2', value: '2' }, { label: '3', value: '3' }] },
        tiers: {
          type: 'array',
          arrayFields: {
            name: { type: 'text' },
            price: { type: 'text', label: 'Price (supports {{tokens}})' },
            cadence: { type: 'text', label: 'Cadence (e.g. per entry)' },
            featured: { type: 'radio', options: [{ label: 'Featured', value: 'yes' }, { label: 'Normal', value: 'no' }] },
            glow: { type: 'select', label: 'Glow', options: [{ label: 'Builder', value: 'builder' }, { label: 'Pro', value: 'pro' }, { label: 'Max', value: 'max' }] },
            perks: { type: 'textarea', label: 'Perks (one per line)' },
            ctaLabel: { type: 'text', label: 'Button label (blank to hide)' },
            ctaAction: { type: 'select', options: [{ label: 'Open interact', value: 'interact' }, { label: 'Lock / spend', value: 'spend' }] },
            amount: { type: 'text', label: 'Suggested amount (KAS, optional)' },
          },
          defaultItemProps: { name: 'Entry', price: '10', cadence: 'KAS per entry', featured: 'no', glow: 'builder', perks: 'One entry to the pool\nNon-custodial stake\nLive on the explorer', ctaLabel: 'Join', ctaAction: 'interact', amount: '' },
        },
      },
      defaultProps: {
        columns: '3',
        tiers: [
          { name: 'Bronze', price: '10', cadence: 'KAS per entry', featured: 'no', glow: 'builder', perks: 'One entry to the pool\nNon-custodial stake', ctaLabel: 'Join', ctaAction: 'interact', amount: '10' },
          { name: 'Silver', price: '50', cadence: 'KAS per entry', featured: 'yes', glow: 'pro', perks: 'Five-weight entry\nNon-custodial stake\nPriority on the board', ctaLabel: 'Join', ctaAction: 'interact', amount: '50' },
          { name: 'Gold', price: '100', cadence: 'KAS per entry', featured: 'no', glow: 'max', perks: 'Ten-weight entry\nNon-custodial stake\nTop of the leaderboard', ctaLabel: 'Join', ctaAction: 'interact', amount: '100' },
        ],
      },
      render: ({ columns, tiers, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className={`grid grid-cols-1 ${COL_CLASS[columns] || COL_CLASS['3']} gap-4 px-2 md:px-4 mb-5`}>
            {(tiers || []).map((t, i) => {
              const featured = t.featured === 'yes';
              const perks = String(t.perks || '').split('\n').map((s) => s.trim()).filter(Boolean);
              return (
                <Card key={i} hover accent={featured ? '#49EACB' : undefined} className={`pricing-tier-card p-6 flex flex-col ${featured ? `tier-glow-${t.glow || 'pro'}` : ''}`}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] cvx-muted">{resolveTokens(t.name, live)}</p>
                  <div className="mt-2 mb-1 flex items-end gap-1.5">
                    <span className="text-3xl md:text-4xl font-black cvx-title">{resolveTokens(t.price, live)}</span>
                    {t.cadence && <span className="text-xs cvx-muted mb-1.5">{resolveTokens(t.cadence, live)}</span>}
                  </div>
                  <ul className="mt-3 space-y-1.5 flex-1">
                    {perks.map((p, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm cvx-body">
                        <Check size={15} className="cvx-accent-teal shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{resolveTokens(p, live)}</span>
                      </li>
                    ))}
                  </ul>
                  {t.ctaLabel && (
                    <Button variant={featured ? 'kaspa' : 'glass'} size="lg" className="mt-5 w-full" onClick={ctaClick(t.ctaAction, 'yes', t.amount, live)}>
                      {resolveTokens(t.ctaLabel, live)}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        );
      },
    },
    Testimonials: {
      label: 'Quotes / Testimonials',
      fields: {
        columns: { type: 'select', options: [{ label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }] },
        quotes: {
          type: 'array',
          arrayFields: { quote: { type: 'textarea' }, author: { type: 'text' }, role: { type: 'text', label: 'Role / handle' } },
          defaultItemProps: { quote: 'A clean, honest, non-custodial way to settle on Kaspa.', author: 'Anon', role: 'Player' },
        },
      },
      defaultProps: {
        columns: '2',
        quotes: [
          { quote: 'A clean, honest, non-custodial way to settle on Kaspa.', author: 'Anon', role: 'Player' },
          { quote: 'Everything is on the explorer. No trust required.', author: 'Builder', role: 'Creator' },
        ],
      },
      render: ({ columns, quotes, puck }) => {
        const live = puck?.metadata?.live || {};
        const colCls = columns === '1' ? '' : (COL_CLASS[columns] || COL_CLASS['2']);
        return (
          <div className={`grid grid-cols-1 ${colCls} gap-4 px-2 md:px-4 mb-5`}>
            {(quotes || []).map((q, i) => (
              <Card key={i} className="p-6">
                <Quote size={22} className="cvx-accent-teal mb-3" aria-hidden="true" />
                <p className="cvx-body text-base leading-relaxed mb-4">{resolveTokens(q.quote, live)}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold cvx-title">{resolveTokens(q.author, live)}</span>
                  {q.role && <span className="text-xs cvx-muted">· {resolveTokens(q.role, live)}</span>}
                </div>
              </Card>
            ))}
          </div>
        );
      },
    },
    SocialLinks: {
      label: 'Social Links',
      fields: {
        alignment: { type: 'radio', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] },
        x: { type: 'text', label: 'X / Twitter URL (https)' },
        discord: { type: 'text', label: 'Discord URL (https)' },
        telegram: { type: 'text', label: 'Telegram URL (https)' },
        github: { type: 'text', label: 'GitHub URL (https)' },
        website: { type: 'text', label: 'Website URL (https)' },
      },
      defaultProps: { alignment: 'center', x: '', discord: '', telegram: '', github: '', website: '' },
      render: ({ alignment, x, discord, telegram, github, website }) => {
        // Only absolute https links render; every anchor is target=_blank + rel hardened.
        // (This lucide build has no Twitter/GitHub brand glyphs; use X + GitBranch.)
        const links = [
          { url: x, Icon: X, label: 'X' },
          { url: discord, Icon: MessageCircle, label: 'Discord' },
          { url: telegram, Icon: Send, label: 'Telegram' },
          { url: github, Icon: GitBranch, label: 'GitHub' },
          { url: website, Icon: Globe, label: 'Website' },
        ].filter((l) => isHttpsLink(l.url));
        if (links.length === 0) return placeholder('Add at least one https social link in the editor.');
        return (
          <div className={`flex flex-wrap gap-3 px-4 mb-5 ${alignment === 'center' ? 'justify-center' : 'justify-start'}`}>
            {links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={l.label}
                className="cvx-social inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all">
                <l.Icon size={16} aria-hidden="true" /> {l.label}
              </a>
            ))}
          </div>
        );
      },
    },
    Footer: {
      label: 'Footer',
      fields: {
        text: { type: 'text', label: 'Footer text (supports {{tokens}})' },
        showNetwork: { type: 'radio', options: [{ label: 'Show network', value: 'yes' }, { label: 'Hide', value: 'no' }] },
      },
      defaultProps: { text: '{{name}} · Non-custodial covenant on Kaspa', showNetwork: 'yes' },
      render: ({ text, showNetwork, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className="cvx-footer mx-4 mt-6 mb-2 pt-6 pb-8 text-center">
            <p className="text-xs">{resolveTokens(text, live)}</p>
            {showNetwork === 'yes' && <p className="text-[11px] cvx-faint mt-1.5">Settled on {resolveTokens('{{network}}', live)} · {resolveTokens('{{total_locked}}', live)} locked</p>}
          </div>
        );
      },
    },
    ImageGallery: {
      label: 'Image Gallery',
      fields: {
        columns: { type: 'select', options: [{ label: '2', value: '2' }, { label: '3', value: '3' }, { label: '4', value: '4' }] },
        images: { type: 'array', arrayFields: { url: imageField('Image (https or upload)'), caption: { type: 'text' } }, defaultItemProps: { url: '', caption: '' } },
      },
      defaultProps: { columns: '3', images: [{ url: '', caption: '' }, { url: '', caption: '' }, { url: '', caption: '' }] },
      render: ({ columns, images }) => {
        const imgs = (images || []).filter((i) => isHttpsImg(i.url));
        if (imgs.length === 0) return placeholder('Add your own https image URLs - pictures relevant to this covenant');
        return (
          <div className={`grid grid-cols-2 ${COL_CLASS[columns] || COL_CLASS['3']} gap-3 px-2 md:px-4 mb-5`}>
            {imgs.map((im, i) => (
              <a key={i} href={im.url} target="_blank" rel="noopener noreferrer nofollow" className="group relative block aspect-video rounded-xl overflow-hidden border border-white/[0.08] light:border-slate-200">
                <img src={im.url} alt={im.caption || 'gallery image'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" decoding="async" />
                {im.caption && <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-[11px] text-gray-200 px-2 py-1.5">{im.caption}</span>}
              </a>
            ))}
          </div>
        );
      },
    },
    Carousel: {
      label: 'Carousel',
      fields: {
        images: { type: 'array', arrayFields: { url: imageField('Image (https or upload)'), caption: { type: 'text' } }, defaultItemProps: { url: '', caption: '' } },
        autoplay: { type: 'radio', options: [{ label: 'Autoplay', value: 'yes' }, { label: 'Manual', value: 'no' }] },
      },
      defaultProps: { images: [{ url: '', caption: '' }, { url: '', caption: '' }], autoplay: 'no' },
      render: ({ images, autoplay }) => <CarouselBlock images={images} autoplay={autoplay} />,
    },
    LogoStrip: {
      label: 'Logo Strip',
      fields: {
        title: { type: 'text' },
        logos: { type: 'array', arrayFields: { url: imageField('Logo (https or upload)') }, defaultItemProps: { url: '' } },
      },
      defaultProps: { title: 'Trusted by', logos: [{ url: '' }, { url: '' }, { url: '' }, { url: '' }] },
      render: ({ title, logos }) => {
        const ls = (logos || []).filter((l) => isHttpsImg(l.url));
        return (
          <div className="px-2 md:px-4 mb-5 py-6">
            {title && <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] cvx-muted mb-6">{title}</p>}
            {ls.length === 0 ? placeholder('Add https logo URLs') : (
              <div className="flex flex-wrap items-center justify-center gap-4">
                {ls.map((l, i) => (
                  <div key={i} className="cvx-panel-soft h-16 px-4 flex items-center justify-center rounded-xl transition-all">
                    <img src={l.url} alt="partner logo" className="max-h-10 max-w-[120px] object-contain opacity-80 hover:opacity-100 transition-opacity" loading="lazy" decoding="async" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    Marquee: {
      label: 'Marquee / Ticker',
      fields: {
        items: { type: 'array', arrayFields: { text: { type: 'text', label: 'Item (supports {{tokens}})' } }, defaultItemProps: { text: 'Live on {{network}}' } },
        badge: { type: 'text', label: 'Badge label' },
      },
      defaultProps: {
        badge: 'LIVE',
        items: [
          { text: '{{total_locked}} locked' },
          { text: '{{tx_count}} on-chain actions' },
          { text: 'Status: {{status}}' },
          { text: 'Network: {{network}}' },
        ],
      },
      render: ({ items, badge, puck }) => {
        const live = puck?.metadata?.live || {};
        const its = (items || []).map((i) => resolveTokens(i.text, live)).filter(Boolean);
        if (its.length === 0) return null;
        // Duplicate the row so the -50% scroll wraps seamlessly (matches .ticker-track).
        const loop = [...its, ...its];
        return (
          <div className="mx-2 md:mx-4 mb-5">
            <div className="ticker-shell">
              <div className="ticker-badge">
                <span className="w-1.5 h-1.5 rounded-full bg-kaspa-green animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-kaspa-green">{badge || 'LIVE'}</span>
              </div>
              <div className="ticker-mask">
                <div className="ticker-track">
                  {loop.map((t, i) => (
                    <span key={i} className="ticker-item"><span className="text-xs cvx-body">{t}</span></span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      },
    },
    Timeline: {
      label: 'Timeline / Roadmap',
      fields: {
        title: { type: 'text' },
        steps: {
          type: 'array',
          arrayFields: {
            label: { type: 'text' },
            detail: { type: 'textarea' },
            state: { type: 'select', options: [{ label: 'Done', value: 'done' }, { label: 'Active', value: 'active' }, { label: 'Upcoming', value: 'upcoming' }] },
          },
          defaultItemProps: { label: 'Milestone', detail: 'Describe this milestone.', state: 'upcoming' },
        },
      },
      defaultProps: {
        title: 'Roadmap',
        steps: [
          { label: 'Deployed', detail: 'Covenant locked on the Kaspa BlockDAG.', state: 'done' },
          { label: 'Open', detail: 'Players join and stake.', state: 'active' },
          { label: 'Settle', detail: 'Outcome resolves and the pool pays out.', state: 'upcoming' },
        ],
      },
      render: ({ title, steps, puck }) => {
        const live = puck?.metadata?.live || {};
        const list = steps || [];
        const dotColor = (s) => (s === 'done' ? '#49EACB' : s === 'active' ? '#E8AF34' : 'rgba(148,163,184,0.6)');
        return (
          <div className="mx-2 md:mx-4 mb-5">
            {title && <h3 className="text-lg font-bold cvx-title mb-4 px-1">{resolveTokens(title, live)}</h3>}
            <div className="relative pl-6">
              <div className="cvx-timeline-rail absolute left-[7px] top-1 bottom-1 w-0.5 rounded-full" />
              <div className="space-y-5">
                {list.map((s, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: dotColor(s.state), background: s.state === 'upcoming' ? 'transparent' : dotColor(s.state) }} />
                    <p className="text-sm font-bold cvx-title">{resolveTokens(s.label, live)}{s.state === 'active' && <span className="ml-2 text-[10px] font-bold uppercase tracking-widest cvx-accent-gold">Now</span>}</p>
                    {s.detail && <p className="text-xs cvx-muted mt-0.5 leading-relaxed">{resolveTokens(s.detail, live)}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      },
    },
    SectionBackground: {
      label: 'Section Background',
      fields: {
        preset: { type: 'select', label: 'Background', options: BG_PRESET_OPTIONS },
        glow: { type: 'radio', options: [{ label: 'Aurora glow', value: 'yes' }, { label: 'No glow', value: 'no' }] },
        rounded: { type: 'radio', options: [{ label: 'Rounded', value: 'yes' }, { label: 'Flush', value: 'no' }] },
      },
      defaultProps: { preset: 'aurora', glow: 'yes', rounded: 'yes' },
      render: ({ preset, glow, rounded, puck }) => {
        const p = BG_PRESETS[preset] || BG_PRESETS.aurora;
        const Inner = puck?.renderDropZone || (() => null);
        return (
          <div className={`relative overflow-hidden mb-5 ${rounded === 'yes' ? 'mx-2 md:mx-4 rounded-3xl' : ''}`} data-sec={preset} style={{ background: p.css }}>
            <style>{`.light [data-sec="${preset}"]{background:${p.light} !important;}`}</style>
            {glow === 'yes' && (
              <div className="covex-aurora" style={{ width: '70%', height: '60%', left: '50%', top: '-10%', transform: 'translateX(-50%)' }} aria-hidden="true" />
            )}
            <div className="relative z-10 py-4">
              <Inner zone="section" />
            </div>
          </div>
        );
      },
    },
    Tabs: {
      label: 'Tabs',
      fields: {
        tabs: {
          type: 'array',
          arrayFields: { label: { type: 'text' }, body: { type: 'textarea' } },
          defaultItemProps: { label: 'Tab', body: 'Tab content goes here.' },
        },
      },
      defaultProps: {
        tabs: [
          { label: 'How it works', body: 'Stake in your own wallet. Funds lock to the covenant script.' },
          { label: 'Payouts', body: 'The pool pays out per the disclosed rules. Everything is on the explorer.' },
        ],
      },
      render: ({ tabs, puck }) => <TabsBlock tabs={tabs} live={puck?.metadata?.live || {}} />,
    },
    Accordion: {
      label: 'Accordion / FAQ',
      fields: {
        title: { type: 'text' },
        items: {
          type: 'array',
          arrayFields: { q: { type: 'text', label: 'Question' }, a: { type: 'textarea', label: 'Answer' } },
          defaultItemProps: { q: 'How do payouts work?', a: 'The disclosed rules release the pool. Custody and payout are on-chain.' },
        },
      },
      defaultProps: {
        title: 'Frequently asked',
        items: [
          { q: 'Is this non-custodial?', a: 'Yes. You sign in your own wallet; keys never leave your device.' },
          { q: 'How is the outcome enforced?', a: 'See the enforcement badge on this page (script-enforced, oracle-cosigned, or full-zk verified off-chain). Custody and payout are on-chain and verifiable on the explorer.' },
        ],
      },
      render: ({ title, items, puck }) => <AccordionBlock title={title} items={items} live={puck?.metadata?.live || {}} />,
    },
    Hero: {
      label: 'Hero (text)',
      fields: {
        title: { type: 'text' },
        subtitle: { type: 'textarea' },
        alignment: { type: 'radio', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] },
        accent: colorField('Accent color (optional)'),
      },
      defaultProps: { title: 'My Covenant', subtitle: 'Stake, play, and settle on the Kaspa BlockDAG.', alignment: 'center', accent: '' },
      render: ({ title, subtitle, alignment, accent, puck }) => {
        const live = puck?.metadata?.live || {};
        const accentSafe = accent && accent.trim() ? SAFE_COLOR(accent) : '';
        return (
          <div className={`py-10 px-4 ${align(alignment)}`}>
            <h1 className="text-3xl sm:text-4xl font-black cvx-title mb-3" style={accentSafe ? { color: accentSafe } : {}}>{resolveTokens(title, live)}</h1>
            {subtitle && <p className="cvx-body max-w-xl text-base leading-relaxed mx-auto">{resolveTokens(subtitle, live)}</p>}
          </div>
        );
      },
    },
    Heading: {
      label: 'Heading',
      fields: { text: { type: 'text' }, size: { type: 'select', options: [{ label: 'Large', value: 'lg' }, { label: 'Medium', value: 'md' }] } },
      defaultProps: { text: 'Section title', size: 'md' },
      render: ({ text, size, puck }) => (
        <h2 className={`font-bold cvx-title px-4 mt-6 mb-2 ${size === 'lg' ? 'text-2xl' : 'text-xl'}`}>{resolveTokens(text, puck?.metadata?.live || {})}</h2>
      ),
    },
    Paragraph: {
      label: 'Paragraph',
      fields: { text: { type: 'textarea' } },
      defaultProps: { text: 'Describe how your covenant works, who can join, and how it resolves.' },
      render: ({ text, puck }) => <p className="text-sm cvx-body leading-relaxed px-4 mb-3 whitespace-pre-wrap">{resolveTokens(text, puck?.metadata?.live || {})}</p>,
    },
    RichText: {
      label: 'Rich Text (markdown)',
      fields: { markdown: { type: 'textarea', label: 'Markdown (links forced https, no raw HTML)' } },
      defaultProps: { markdown: '**Bold**, *italic*, `code`, and [links](https://kaspa.org) are supported.\n\n- Bullet one\n- Bullet two' },
      // The ONLY HTML surface in the catalog. snarkdown -> strict allowlist sanitizer
      // (p/strong/em/ul/ol/li/a/code/br only; https links; no on*/style/script/iframe).
      render: ({ markdown, puck }) => {
        const live = puck?.metadata?.live || {};
        const html = renderSafeMarkdown(resolveTokens(String(markdown || ''), live));
        if (!html) return null;
        return <div className="cvx-prose text-sm px-4 mb-4" dangerouslySetInnerHTML={{ __html: html }} />;
      },
    },
    BulletList: {
      label: 'Bullet List',
      fields: { items: { type: 'array', arrayFields: { text: { type: 'text' } }, defaultItemProps: { text: 'A rule of this covenant' } } },
      defaultProps: { items: [{ text: 'Players stake equal amounts' }, { text: 'Winner receives the staked amount minus fees' }] },
      render: ({ items, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <ul className="px-8 mb-3 space-y-1.5">
            {(items || []).map((i, idx) => (
              <li key={idx} className="text-sm cvx-body list-disc">{resolveTokens(i.text, live)}</li>
            ))}
          </ul>
        );
      },
    },
    FAQItem: {
      label: 'FAQ Item',
      fields: { question: { type: 'text' }, answer: { type: 'textarea' } },
      defaultProps: { question: 'How do payouts work?', answer: 'The disclosed rules release the pool. Custody and payout are on-chain and verifiable on the explorer.' },
      render: ({ question, answer, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className="cvx-panel mx-4 mb-2 rounded-xl p-4">
            <p className="text-sm font-bold cvx-title mb-1">{resolveTokens(question, live)}</p>
            <p className="text-xs cvx-muted leading-relaxed">{resolveTokens(answer, live)}</p>
          </div>
        );
      },
    },
    ImageBlock: {
      label: 'Image',
      fields: { url: imageField('Image (https or upload)'), caption: { type: 'text' }, rounded: { type: 'radio', options: [{ label: 'Rounded', value: 'yes' }, { label: 'Square', value: 'no' }] } },
      defaultProps: { url: '', caption: '', rounded: 'yes' },
      render: ({ url, caption, rounded }) => {
        if (!isHttpsImg(url)) return placeholder('Add your own image URL (https) - a picture relevant to this covenant');
        return (
          <figure className="mx-4 mb-3">
            <img src={url} alt={caption || 'covenant image'} className={`w-full max-h-96 object-cover border border-white/10 light:border-slate-200 ${rounded === 'yes' ? 'rounded-2xl' : ''}`} />
            {caption && <figcaption className="text-[11px] cvx-faint mt-1 text-center">{caption}</figcaption>}
          </figure>
        );
      },
    },
    Video: {
      label: 'Video (YouTube / Vimeo)',
      fields: {
        url: { type: 'text', label: 'Video URL (YouTube or Vimeo only)' },
        caption: { type: 'text' },
        aspect: { type: 'radio', options: [{ label: '16:9', value: '16x9' }, { label: '4:3', value: '4x3' }] },
      },
      defaultProps: { url: '', caption: '', aspect: '16x9' },
      // The embed src is ALWAYS a platform-built provider URL (parseVideoEmbed), never the
      // creator's raw string, and the frame is cross-origin (youtube-nocookie / vimeo) and
      // sandboxed, so it can neither reach this document nor be pointed anywhere else.
      render: ({ url, caption, aspect }) => {
        const embed = parseVideoEmbed(url);
        if (!embed) return placeholder('Paste a YouTube or Vimeo link (https). Only those two providers embed, in a sandboxed frame.');
        const pad = aspect === '4x3' ? '75%' : '56.25%';
        return (
          <figure className="mx-4 mb-3">
            <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 light:border-slate-200 cvx-panel" style={{ paddingTop: pad }}>
              <iframe
                src={embed.src}
                title={caption || embed.title}
                className="absolute inset-0 w-full h-full"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-popups-to-escape-sandbox"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
              />
            </div>
            {caption && <figcaption className="text-[11px] cvx-faint mt-1 text-center">{caption}</figcaption>}
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
              <div key={i} className="cvx-panel rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest cvx-faint">{resolveTokens(s.label, live)}</p>
                <p className="text-lg font-bold cvx-title">{resolveTokens(s.value, live)}</p>
              </div>
            ))}
          </div>
        );
      },
    },
    AnimatedCounter: {
      label: 'Animated Counter (live)',
      fields: {
        label: { type: 'text' },
        value: { type: 'text', label: 'Value (supports {{tokens}})' },
        suffix: { type: 'text', label: 'Suffix (e.g. KAS)' },
        decimals: { type: 'select', options: [{ label: '0', value: '0' }, { label: '2', value: '2' }] },
        color: colorField('Number color'),
      },
      defaultProps: { label: 'Total value locked', value: '{{total_locked}}', suffix: 'KAS', decimals: '0', color: '#49EACB' },
      render: ({ label, value, suffix, decimals, color, puck }) => <CounterBlock label={label} value={value} suffix={suffix} decimals={decimals} color={color} live={puck?.metadata?.live || {}} />,
    },
    OddsBar: {
      label: 'Split Bar (live)',
      fields: {
        labelA: { type: 'text', label: 'Outcome A label' },
        valueA: { type: 'text', label: 'A pool/weight (supports {{tokens}})' },
        colorA: colorField('A color'),
        labelB: { type: 'text', label: 'Outcome B label' },
        valueB: { type: 'text', label: 'B pool/weight (supports {{tokens}})' },
        colorB: colorField('B color'),
        showOdds: { type: 'radio', options: [{ label: 'Show payout x', value: 'yes' }, { label: 'Hide', value: 'no' }] },
      },
      defaultProps: { labelA: 'YES', valueA: '{{pool_yes}}', colorA: '#49EACB', labelB: 'NO', valueB: '{{pool_no}}', colorB: '#F472B6', showOdds: 'yes' },
      render: ({ labelA, valueA, colorA, labelB, valueB, colorB, showOdds, puck }) => {
        const live = puck?.metadata?.live || {};
        const cA = SAFE_COLOR(colorA, '#49EACB');
        const cB = SAFE_COLOR(colorB, '#F472B6');
        const a = toNum(valueA, live);
        const b = toNum(valueB, live);
        const total = a + b;
        const pctA = total > 0 ? Math.round((a / total) * 100) : 50;
        const pctB = 100 - pctA;
        const lo = live.odds && typeof live.odds === 'object' ? live.odds : null;
        const oddsNet = lo && lo.basis === 'net-after-fee-rebate';
        const oddsA = lo && Number(lo.yes) > 0 ? Number(lo.yes) : (a > 0 ? (total / a) : 0);
        const oddsB = lo && Number(lo.no) > 0 ? Number(lo.no) : (b > 0 ? (total / b) : 0);
        const oddsWord = oddsNet ? 'payout' : 'before fees';
        return (
          <div className="cvx-panel mx-2 md:mx-4 mb-5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2 text-sm font-bold">
              <span style={{ color: cA }}>{resolveTokens(labelA, live)} {pctA}%</span>
              <span style={{ color: cB }}>{pctB}% {resolveTokens(labelB, live)}</span>
            </div>
            <div className="cvx-track h-4 w-full rounded-full overflow-hidden flex">
              <div className="h-full transition-all duration-500" style={{ width: `${pctA}%`, background: cA }} />
              <div className="h-full transition-all duration-500" style={{ width: `${pctB}%`, background: cB }} />
            </div>
            {showOdds === 'yes' && (
              <div className="flex items-center justify-between mt-2 text-[11px] font-mono cvx-muted">
                <span>{oddsA > 0 ? `${oddsA.toFixed(2)}x` : '-'} {oddsWord}</span>
                <span>pool {total > 0 ? total.toLocaleString() : '0'}</span>
                <span>{oddsB > 0 ? `${oddsB.toFixed(2)}x` : '-'} {oddsWord}</span>
              </div>
            )}
          </div>
        );
      },
    },
    OddsHighlightCard: {
      label: 'Highlight Card (live)',
      fields: {
        outcomeName: { type: 'text' },
        multiplier: { type: 'text', label: 'Payout x (supports {{tokens}})' },
        poolSize: { type: 'text', label: 'Pool (supports {{tokens}})' },
        isWinner: { type: 'radio', options: [{ label: 'Winner', value: 'yes' }, { label: 'Normal', value: 'no' }] },
        accentColor: colorField('Accent color'),
      },
      defaultProps: { outcomeName: 'YES', multiplier: '{{odds_yes}}', poolSize: '{{pool_yes}}', isWinner: 'no', accentColor: '#49EACB' },
      render: ({ outcomeName, multiplier, poolSize, isWinner, accentColor, puck }) => {
        const live = puck?.metadata?.live || {};
        const ac = SAFE_COLOR(accentColor);
        const win = isWinner === 'yes';
        const mult = resolveTokens(multiplier, live);
        return (
          <Card key={win ? 'w' : 'n'} accent={win ? ac : undefined} className="mx-2 md:mx-4 mb-5 p-6 md:p-7"
            style={win ? { boxShadow: `0 0 24px ${ac}40` } : undefined}>
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-widest cvx-muted">{resolveTokens(outcomeName, live)}</span>
              {win && <Trophy size={18} style={{ color: ac }} aria-hidden="true" />}
            </div>
            <div className="text-4xl md:text-5xl font-black leading-none" style={{ color: ac }}>{mult ? `${mult}x` : '-'}</div>
            <div className="mt-4 pt-4 border-t cvx-divider">
              <p className="text-[10px] uppercase tracking-widest cvx-faint mb-1">Pool</p>
              <p className="text-lg font-semibold cvx-title">{resolveTokens(poolSize, live)}</p>
            </div>
          </Card>
        );
      },
    },
    PoolMeter: {
      label: 'Progress Meter (live)',
      fields: {
        label: { type: 'text' },
        value: { type: 'text', label: 'Current (supports {{tokens}})' },
        max: { type: 'text', label: 'Target / max (supports {{tokens}})' },
        suffix: { type: 'text', label: 'Unit suffix' },
        color: colorField('Bar color'),
      },
      defaultProps: { label: 'Total value locked', value: '{{amount_kaspa}}', max: '1000', suffix: 'KAS', color: '#49EACB' },
      render: ({ label, value, max, suffix, color, puck }) => {
        const live = puck?.metadata?.live || {};
        const barColor = SAFE_COLOR(color);
        const v = toNum(value, live);
        const m = toNum(max, live);
        const pct = m > 0 ? Math.min(100, Math.round((v / m) * 100)) : 0;
        return (
          <div className="cvx-panel mx-2 md:mx-4 mb-5 rounded-2xl p-4">
            <div className="flex items-end justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest cvx-faint">{resolveTokens(label, live)}</p>
              <p className="text-lg font-black cvx-title">{v.toLocaleString()} <span className="text-xs font-medium cvx-muted">{suffix}</span></p>
            </div>
            <div className="cvx-track h-2.5 w-full rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            {m > 0 && <p className="text-[10px] cvx-faint mt-1 text-right">{pct}% of {m.toLocaleString()} {suffix}</p>}
          </div>
        );
      },
    },
    ActivityFeed: {
      label: 'Activity Feed (live)',
      fields: {
        title: { type: 'text' },
        emptyText: { type: 'text', label: 'Shown when no activity yet' },
        maxRows: { type: 'select', label: 'Rows', options: [{ label: '3', value: '3' }, { label: '5', value: '5' }, { label: '8', value: '8' }] },
        accentColor: colorField('Accent color'),
      },
      defaultProps: { title: 'Live activity', emptyText: 'No on-chain actions yet. Be the first to interact.', maxRows: '5', accentColor: '#49EACB' },
      render: ({ title, emptyText, maxRows, accentColor, puck }) => {
        const live = puck?.metadata?.live || {};
        const ac = SAFE_COLOR(accentColor);
        // Honest by construction: rows come ONLY from server-derived live.actions
        // (the indexed on-chain action log). No row is ever fabricated. While the
        // live feed is still loading (live.loading), show skeleton rows.
        const rows = Array.isArray(live.actions) ? live.actions.slice(0, parseInt(maxRows, 10) || 5) : [];
        const loading = !!live.loading && rows.length === 0;
        const count = live.tx_count != null ? Number(live.tx_count) || 0 : rows.length;
        const fmtAmt = (a) => {
          const n = Number(a);
          return Number.isFinite(n) && n !== 0 ? `${n.toLocaleString()} KAS` : '';
        };
        return (
          <div className="cvx-panel mx-2 md:mx-4 mb-5 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b cvx-divider">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ac }} />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] cvx-body">{resolveTokens(title, live)}</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border cvx-divider cvx-muted">{count.toLocaleString()} on-chain</span>
            </div>
            {loading ? (
              <div className="p-4">{skeletonRows(parseInt(maxRows, 10) || 5)}</div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-7 text-center text-xs cvx-faint">{resolveTokens(emptyText, live)}</div>
            ) : (
              <ul className="divide-y cvx-divider">
                {rows.map((r, i) => {
                  const label = resolveTokens(String(r.label || r.type || r.action || 'Action'), live);
                  const who = r.address ? String(r.address).slice(0, 10) : (r.from ? String(r.from).slice(0, 10) : '');
                  const amt = fmtAmt(r.amount ?? r.amount_kaspa);
                  const when = r.timestamp ? new Date(Number(r.timestamp) * 1000).toLocaleDateString() : (r.daa_score ? `DAA ${Number(r.daa_score).toLocaleString()}` : '');
                  return (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-bold" style={{ background: `${ac}1f`, color: ac }}>{(label[0] || '•').toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold cvx-title truncate">{label}{who && <span className="font-mono cvx-faint font-normal"> · {who}…</span>}</p>
                        {when && <p className="text-[10px] cvx-faint">{when}</p>}
                      </div>
                      {amt && <span className="text-xs font-mono font-bold shrink-0" style={{ color: ac }}>{amt}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      },
    },
    Leaderboard: {
      label: 'Leaderboard (live)',
      fields: {
        title: { type: 'text' },
        rankBy: { type: 'select', label: 'Rank by', options: [{ label: 'Largest stake', value: 'amount' }, { label: 'Most recent', value: 'recent' }] },
        maxRows: { type: 'select', label: 'Rows', options: [{ label: '3', value: '3' }, { label: '5', value: '5' }, { label: '10', value: '10' }] },
        emptyText: { type: 'text', label: 'Shown when no activity yet' },
        accentColor: colorField('Accent color'),
      },
      defaultProps: { title: 'Top stakers', rankBy: 'amount', maxRows: '5', emptyText: 'No stakes on-chain yet. The board fills as players join.', accentColor: '#E8AF34' },
      render: ({ title, rankBy, maxRows, emptyText, accentColor, puck }) => {
        const live = puck?.metadata?.live || {};
        const ac = SAFE_COLOR(accentColor, '#E8AF34');
        const src = Array.isArray(live.actions) ? live.actions : [];
        const loading = !!live.loading && src.length === 0;
        const staked = src.filter((r) => Number(r.amount_kaspa) > 0);
        const ranked = (rankBy === 'recent'
          ? [...staked].sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
          : [...staked].sort((a, b) => (Number(b.amount_kaspa) || 0) - (Number(a.amount_kaspa) || 0))
        ).slice(0, parseInt(maxRows, 10) || 5);
        const top = ranked.length ? Number(ranked[0].amount_kaspa) || 0 : 0;
        const medal = ['#E8AF34', '#C0C0C0', '#CD7F32'];
        return (
          <div className="cvx-panel mx-2 md:mx-4 mb-5 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b cvx-divider">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] cvx-body">{resolveTokens(title, live)}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border cvx-divider cvx-muted">{staked.length.toLocaleString()} on-chain</span>
            </div>
            {loading ? (
              <div className="p-4">{skeletonRows(parseInt(maxRows, 10) || 5)}</div>
            ) : ranked.length === 0 ? (
              <div className="px-4 py-7 text-center text-xs cvx-faint">{resolveTokens(emptyText, live)}</div>
            ) : (
              <ul className="divide-y cvx-divider">
                {ranked.map((r, i) => {
                  const who = r.address ? `${String(r.address).slice(0, 12)}…` : (resolveTokens(String(r.label || 'Action'), live));
                  const amt = Number(r.amount_kaspa) || 0;
                  const pct = top > 0 ? Math.max(6, Math.round((amt / top) * 100)) : 0;
                  const rc = medal[i] || 'rgba(148,163,184,0.6)';
                  return (
                    <li key={i} className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-black" style={{ background: `${rc}22`, color: rc }}>{i + 1}</span>
                        <span className="min-w-0 flex-1 text-xs font-semibold cvx-title font-mono truncate">{who}</span>
                        <span className="text-xs font-mono font-bold shrink-0" style={{ color: ac }}>{amt.toLocaleString()} KAS</span>
                      </div>
                      <div className="cvx-track mt-1.5 ml-9 h-1 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: ac }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      },
    },
    PoolChart: {
      label: 'Pool Chart (live)',
      fields: {
        title: { type: 'text' },
        emptyText: { type: 'text', label: 'Shown when no pool history yet' },
        color: colorField('Line color'),
      },
      defaultProps: { title: 'Pool over time', emptyText: 'No on-chain pool history yet. The curve builds as funds lock in.', color: '#49EACB' },
      render: ({ title, emptyText, color, puck }) => {
        const live = puck?.metadata?.live || {};
        const c = SAFE_COLOR(color, '#49EACB');
        const src = (Array.isArray(live.actions) ? live.actions : [])
          .filter((a) => Number(a.amount_kaspa) > 0)
          .map((a) => ({ t: Number(a.timestamp) || 0, v: Number(a.amount_kaspa) || 0 }))
          .sort((a, b) => a.t - b.t);
        let run = 0;
        const pts = src.map((p) => { run += p.v; return run; });
        const total = Number(live.pool_total ?? live.amount_kaspa ?? run) || run;
        const W = 100, H = 32;
        const hasCurve = pts.length >= 2;
        const max = hasCurve ? Math.max(...pts) : 0;
        const path = hasCurve
          ? pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - (max > 0 ? (v / max) * (H - 2) : 0) - 1}`).join(' ')
          : '';
        const gid = `poolFill-${c.replace(/[^a-zA-Z0-9]/g, '')}`;
        return (
          <div className="cvx-panel mx-2 md:mx-4 mb-5 rounded-2xl p-4">
            <div className="flex items-end justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] cvx-body">{resolveTokens(title, live)}</span>
              <span className="text-lg font-black cvx-title leading-none">{total.toLocaleString()} <span className="text-xs font-medium cvx-muted">KAS</span></span>
            </div>
            {!hasCurve ? (
              <div className="py-6 text-center text-xs cvx-faint">{resolveTokens(emptyText, live)}</div>
            ) : (
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-14" role="img" aria-label="Cumulative pool over time">
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={c} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={`0,${H} ${path} ${W},${H}`} fill={`url(#${gid})`} />
                <polyline points={path} fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
        );
      },
    },
    Countdown: {
      label: 'Countdown',
      fields: {
        title: { type: 'text' },
        targetDate: { type: 'text', label: 'Target date/time (ISO or {{kickoff}} / {{settle_at}})' },
        endedText: { type: 'text', label: 'Shown after the target' },
        accentColor: colorField('Accent color'),
      },
      defaultProps: { title: 'Closes in', targetDate: '{{kickoff}}', endedText: 'This window has closed.', accentColor: '#E8AF34' },
      render: ({ title, targetDate, endedText, accentColor, puck }) => <CountdownBlock title={title} targetDate={targetDate} endedText={endedText} accentColor={accentColor} live={puck?.metadata?.live || {}} />,
    },
    StakeCTA: {
      label: 'Action Button',
      fields: {
        label: { type: 'text' },
        helper: { type: 'text' },
        action: { type: 'select', label: 'On click', options: [
          { label: 'Open interact panel', value: 'interact' },
          { label: 'Back an outcome', value: 'bet' },
          { label: 'Lock funds / spend', value: 'spend' },
        ] },
        outcome: { type: 'radio', label: 'Outcome', options: [{ label: 'YES', value: 'yes' }, { label: 'NO', value: 'no' }] },
        amount: { type: 'text', label: 'Suggested amount (KAS)' },
        variant: { type: 'select', label: 'Style', options: [{ label: 'Kaspa', value: 'kaspa' }, { label: 'Gold', value: 'gold' }, { label: 'Glass', value: 'glass' }] },
      },
      defaultProps: { label: 'Stake and join', helper: 'Opens the interact panel. Non-custodial, signs in your wallet. See the enforcement badge on this page (script-enforced, oracle-cosigned, or full-zk verified off-chain).', action: 'interact', outcome: 'yes', amount: '', variant: 'kaspa' },
      render: ({ label, helper, action, outcome, amount, variant, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className="px-2 md:px-4 mb-5 text-center">
            <Button variant={variant || 'kaspa'} size="xl" shimmer onClick={ctaClick(action, outcome, amount, live)}>
              {resolveTokens(label, live)}
            </Button>
            {helper && <p className="text-[11px] cvx-faint mt-2">{resolveTokens(helper, live)}</p>}
          </div>
        );
      },
    },
    FeeNotice: {
      label: 'Fee Transparency',
      fields: { feeText: { type: 'textarea', label: 'Fee breakdown text' } },
      defaultProps: { feeText: 'Winner receives 96% of the pool. Creator earns 2%. 2% returns to the covenant for the next round.' },
      render: ({ feeText, puck }) => (
        <div className="cvx-fee mx-2 md:mx-4 mb-5 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest cvx-fee-label mb-1 font-bold">Fees, in plain words</p>
          <p className="text-xs cvx-fee-body leading-relaxed">{resolveTokens(feeText, puck?.metadata?.live || {})}</p>
        </div>
      ),
    },
    GoldenGrid: {
      label: 'Golden Grid (layout)',
      fields: {
        ratio: {
          type: 'select',
          label: 'Column proportion',
          options: [
            { label: 'Golden - left wider (1.618 : 1)', value: 'golden' },
            { label: 'Golden - right wider (1 : 1.618)', value: 'reverse' },
            { label: 'Even halves (1 : 1)', value: 'even' },
          ],
        },
        valign: { type: 'radio', label: 'Vertical align', options: [{ label: 'Top', value: 'start' }, { label: 'Center', value: 'center' }] },
      },
      defaultProps: { ratio: 'golden', valign: 'start' },
      // Two drop zones laid out on the golden ratio (phi = 1.618). Creators drop
      // ANY catalog blocks into the left/right columns, so a published covenant
      // site composes on the exact same golden grid the main Covex app uses.
      // Mobile-first: the columns stack below md, then the phi proportion applies.
      render: ({ ratio, valign, puck }) => {
        const Inner = puck?.renderDropZone || (() => null);
        const variant = ratio === 'reverse' ? 'cvx-golden-reverse' : ratio === 'even' ? 'cvx-golden-even' : '';
        const center = valign === 'center' ? 'cvx-golden-center' : '';
        return (
          <div className={`cvx-golden ${variant} ${center} px-2 md:px-4 mb-5`}>
            <div className="min-w-0"><Inner zone="left" /></div>
            <div className="min-w-0"><Inner zone="right" /></div>
          </div>
        );
      },
    },
    TwoColumns: {
      label: 'Two Columns',
      fields: { left: { type: 'textarea' }, right: { type: 'textarea' } },
      defaultProps: { left: 'Left column text', right: 'Right column text' },
      render: ({ left, right, puck }) => {
        const live = puck?.metadata?.live || {};
        return (
          <div className="grid sm:grid-cols-2 gap-4 px-4 mb-4">
            <p className="text-sm cvx-body leading-relaxed whitespace-pre-wrap">{resolveTokens(left, live)}</p>
            <p className="text-sm cvx-body leading-relaxed whitespace-pre-wrap">{resolveTokens(right, live)}</p>
          </div>
        );
      },
    },
    Spacer: {
      label: 'Spacer',
      fields: { size: { type: 'select', options: [{ label: 'Small', value: 'sm' }, { label: 'Medium', value: 'md' }, { label: 'Large', value: 'lg' }] } },
      defaultProps: { size: 'md' },
      render: ({ size }) => <div className={size === 'lg' ? 'h-16' : size === 'sm' ? 'h-4' : 'h-8'} />,
    },
    Divider: {
      label: 'Divider',
      fields: {},
      defaultProps: {},
      render: () => <hr className="cvx-divider mx-4 my-4" />,
    },
  },
};

// ── Stateful block bodies (hoisted to module scope so they never remount). ──

function CarouselBlock({ images, autoplay }) {
  const imgs = (images || []).filter((i) => isHttpsImg(i.url));
  const [emblaRef, embla] = useEmblaCarousel({ loop: true });
  const [sel, setSel] = React.useState(0);
  React.useEffect(() => {
    if (!embla) return undefined;
    const onSel = () => setSel(embla.selectedScrollSnap());
    embla.on('select', onSel); onSel();
    if (autoplay === 'yes' && imgs.length > 1) {
      const iv = setInterval(() => embla.scrollNext(), 4000);
      return () => { clearInterval(iv); embla.off('select', onSel); };
    }
    return () => embla.off('select', onSel);
  }, [embla, autoplay, imgs.length]);
  if (imgs.length === 0) return placeholder('Add https image URLs to build a carousel.');
  return (
    <div className="mx-2 md:mx-4 mb-5">
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] light:border-slate-200" ref={emblaRef}>
        <div className="flex">
          {imgs.map((im, i) => (
            <div key={i} className="relative min-w-0 flex-[0_0_100%]">
              <img src={im.url} alt={im.caption || 'carousel image'} className="w-full aspect-video object-cover" loading="lazy" decoding="async" />
              {im.caption && <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-xs text-gray-200 px-3 py-2">{im.caption}</span>}
            </div>
          ))}
        </div>
      </div>
      {imgs.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {imgs.map((_, i) => (
            <button key={i} type="button" aria-label={`Go to slide ${i + 1}`} onClick={() => embla && embla.scrollTo(i)}
              className="h-1.5 rounded-full transition-all" style={{ width: i === sel ? 20 : 6, background: i === sel ? '#49EACB' : 'rgba(148,163,184,0.5)' }} />
          ))}
        </div>
      )}
    </div>
  );
}

function TabsBlock({ tabs, live }) {
  const list = tabs || [];
  const [active, setActive] = React.useState(0);
  if (list.length === 0) return null;
  const cur = list[Math.min(active, list.length - 1)];
  return (
    <div className="cvx-panel mx-2 md:mx-4 mb-5 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap gap-1 px-3 pt-3 border-b cvx-divider">
        {list.map((t, i) => (
          <button key={i} type="button" data-active={i === active} onClick={() => setActive(i)}
            className="cvx-tab px-3 pb-2.5 text-sm font-semibold transition-colors"
            style={i === active ? { borderBottomColor: '#49EACB' } : undefined}>
            {resolveTokens(t.label, live)}
          </button>
        ))}
      </div>
      <div className="p-4 text-sm cvx-body leading-relaxed whitespace-pre-wrap">{resolveTokens(cur.body, live)}</div>
    </div>
  );
}

function AccordionBlock({ title, items, live }) {
  const list = items || [];
  const [open, setOpen] = React.useState(0);
  return (
    <div className="mx-2 md:mx-4 mb-5">
      {title && <h3 className="text-lg font-bold cvx-title mb-3 px-1">{resolveTokens(title, live)}</h3>}
      <div className="space-y-2">
        {list.map((it, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="cvx-panel rounded-xl overflow-hidden">
              <button type="button" onClick={() => setOpen(isOpen ? -1 : i)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="text-sm font-bold cvx-title">{resolveTokens(it.q, live)}</span>
                <ChevronDown size={16} className="cvx-muted shrink-0 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} aria-hidden="true" />
              </button>
              {isOpen && <p className="px-4 pb-4 text-xs cvx-muted leading-relaxed">{resolveTokens(it.a, live)}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CounterBlock({ label, value, suffix, decimals, color, live }) {
  const target = toNum(value, live);
  const v = useCountUp(target);
  const dp = decimals === '2' ? 2 : 0;
  const c = SAFE_COLOR(color);
  return (
    <div className="mx-2 md:mx-4 mb-5 text-center">
      <div className="text-4xl md:text-6xl font-black leading-none tabular-nums" style={{ color: c }}>
        {v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}
        {suffix && <span className="text-2xl md:text-3xl ml-1.5 cvx-muted">{suffix}</span>}
      </div>
      {label && <p className="text-[11px] font-bold uppercase tracking-[0.2em] cvx-muted mt-2">{resolveTokens(label, live)}</p>}
    </div>
  );
}

function CountdownBlock({ title, targetDate, endedText, accentColor, live }) {
  const ac = SAFE_COLOR(accentColor, '#E8AF34');
  const target = Date.parse(resolveTokens(String(targetDate || ''), live));
  const valid = Number.isFinite(target);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!valid) return undefined;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [valid]);
  const remain = valid ? target - now : 0;
  const ended = valid && remain <= 0;
  const d = Math.floor(remain / 86400000);
  const h = Math.floor((remain % 86400000) / 3600000);
  const m = Math.floor((remain % 3600000) / 60000);
  const s = Math.floor((remain % 60000) / 1000);
  const cells = ended || !valid ? [] : [['Days', d], ['Hrs', h], ['Min', m], ['Sec', s]];
  return (
    <div className="cvx-panel mx-2 md:mx-4 mb-5 rounded-2xl p-5 text-center">
      <p className="text-[10px] uppercase tracking-[0.2em] cvx-muted font-bold mb-3">{resolveTokens(title, live)}</p>
      {!valid ? (
        <p className="text-xs cvx-faint">Set a target date in the editor to start the countdown.</p>
      ) : ended ? (
        <p className="text-base font-bold" style={{ color: ac }}>{resolveTokens(endedText, live)}</p>
      ) : (
        <div className="flex items-stretch justify-center gap-2.5">
          {cells.map(([lbl, val]) => (
            <div key={lbl} className="cvx-panel-soft min-w-[58px] rounded-xl px-2 py-2.5">
              <div className="text-2xl md:text-3xl font-black leading-none tabular-nums" style={{ color: ac }}>{String(Math.max(0, val)).padStart(2, '0')}</div>
              <div className="text-[9px] uppercase tracking-widest cvx-faint mt-1">{lbl}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STARTER TEMPLATES
// Each template is valid Puck data { content:[...], root:{props} } built ONLY
// from the catalog above, with sensible defaults and {{token}} bindings drawn
// strictly from LIVE_TOKENS. The first-run picker in CovenantStudio defaults the
// selection by covenant_type (see matchTemplate). A vitest asserts every block
// type exists and every token used is a real LIVE_TOKEN.
// ═══════════════════════════════════════════════════════════════════════════

// Small helper so template definitions read cleanly: a Puck content item.
const blk = (type, props) => ({ type, props: { id: `${type}-${Math.random().toString(36).slice(2, 9)}`, ...props } });

const ROOT = (over) => ({ props: { pageLogo: '', accentColor: '#49EACB', backgroundPreset: 'kaspa-hero', fontFamily: 'inter', ...over } });

// UI website-template tiering.
// ─────────────────────────────
// Owner model: a FREE creator can open the Studio and build a full custom website,
// and the BASE subset of these starter layouts is free to apply. The rest are
// PREMIUM (the full template library), unlocked by any paid tier. `premium: true`
// marks a layout as part of the paid library; absence (or false) means it is in the
// free base set. This flag drives ONLY the picker's lock badge + upgrade prompt; it
// never gates the Studio itself, building from scratch, or any technical capability.
// The free base set is deliberately the broadest starters (incl. the generic default
// matchTemplate() falls back to), so a free creator always has a working layout.
export const STARTER_TEMPLATES = [
  {
    id: 'prediction-market',
    name: 'Conditional Outcome',
    match: ['binary_oracle_select', 'prediction', 'market'],
    desc: 'Two-sided pool with live shares, countdown, and a resolver-attested badge.',
    data: {
      root: ROOT({ backgroundPreset: 'aurora' }),
      content: [
        blk('HeroImage', { backgroundImageUrl: '', overlayOpacity: '0.55', title: '{{name}}', subtitle: 'Stake YES or NO. {{total_locked}} in the pool on {{network}}.', ctaLabel: 'Back an outcome', ctaAction: 'bet', accentColor: '#49EACB', alignment: 'center' }),
        blk('EnforcementBadge', { note: 'How this covenant is enforced' }),
        blk('Marquee', { badge: 'LIVE', items: [{ text: '{{pool_yes}} on YES' }, { text: '{{pool_no}} on NO' }, { text: '{{tx_count}} on-chain actions' }] }),
        blk('OddsBar', { labelA: 'YES', valueA: '{{pool_yes}}', colorA: '#49EACB', labelB: 'NO', valueB: '{{pool_no}}', colorB: '#F472B6', showOdds: 'yes' }),
        blk('Countdown', { title: 'Outcome closes in', targetDate: '{{kickoff}}', endedText: 'Entries are closed. Awaiting settlement.', accentColor: '#E8AF34' }),
        blk('FeeNotice', { feeText: 'Creator fee {{fee_pct}}%. Loser rebate {{rebate_pct}}%. Winners split the rest of the pool.' }),
        blk('Leaderboard', { title: 'Top stakers', rankBy: 'amount', maxRows: '5', emptyText: 'No stakes on-chain yet. The board fills as participants join.', accentColor: '#E8AF34' }),
        blk('Accordion', { title: 'Frequently asked', items: [{ q: 'How is the outcome decided?', a: 'An external resolver the deployer binds by pubkey at deploy attests the result; Covex never attests real-world facts. See the enforcement badge on this page (script-enforced, oracle-cosigned, or full-zk verified off-chain). Custody and payout are on-chain and verifiable on the explorer.' }, { q: 'Is this non-custodial?', a: 'Yes. You sign in your own wallet; keys never leave your device.' }] }),
        blk('Footer', { text: '{{name}} · Resolver-attested conditional-outcome covenant on Kaspa', showNetwork: 'yes' }),
      ],
    },
  },
  {
    id: 'chess-arena',
    name: 'Two-party covenant',
    premium: true,
    match: ['chess', 'game', 'arena', 'poker', 'blackjack'],
    desc: 'Match-first hero, live staked amount, leaderboard, and an enforcement badge.',
    data: {
      root: ROOT({ backgroundPreset: 'purple-mystic' }),
      content: [
        blk('HeroImage', { backgroundImageUrl: '', overlayOpacity: '0.6', title: '{{name}}', subtitle: 'The full stake goes to the winner. {{total_locked}} locked on {{network}}.', ctaLabel: 'Open the match', ctaAction: 'interact', accentColor: '#A855F7', alignment: 'center' }),
        blk('EnforcementBadge', { note: 'How this covenant is enforced' }),
        blk('StatRow', { stats: [{ label: 'Staked', value: '{{total_locked}}' }, { label: 'Status', value: '{{status}}' }, { label: 'Matches', value: '{{tx_count}}' }] }),
        blk('FeatureGrid', { columns: '3', features: [{ icon: 'Swords', headline: 'Skill, not luck', description: 'Play it out on the board. On testnet, the covenant settles when Covex re-derives the winner from the publicly replayable move log and co-signs the payout; the chain still requires the winning player to sign. See the enforcement badge on this page.' }, { icon: 'ShieldCheck', headline: 'Non-custodial', description: 'You sign in your own wallet. Keys never leave your device.' }, { icon: 'Zap', headline: 'Kaspa speed', description: 'Settles on the BlockDAG at 10 blocks per second.' }] }),
        blk('Leaderboard', { title: 'Top winners', rankBy: 'amount', maxRows: '5', emptyText: 'No matches settled on-chain yet. Be the first to play.', accentColor: '#E8AF34' }),
        blk('StakeCTA', { label: 'Stake and play', helper: 'Opens the match. Non-custodial, signs in your wallet. See the enforcement badge on this page.', action: 'interact', outcome: 'yes', amount: '', variant: 'kaspa' }),
        blk('Footer', { text: '{{name}} · Skill-based covenant on Kaspa, settled from a replayable move log', showNetwork: 'yes' }),
      ],
    },
  },
  {
    id: 'escrow-2party',
    name: 'Escrow (2-party)',
    match: ['escrow', 'escrow_2party', '2party'],
    desc: 'Clear two-party escrow terms, timeline, and on-chain enforcement badge.',
    data: {
      root: ROOT({ backgroundPreset: 'midnight' }),
      content: [
        blk('HeroImage', { backgroundImageUrl: '', overlayOpacity: '0.55', title: '{{name}}', subtitle: 'A two-party escrow on Kaspa. {{total_locked}} held by the script until both sides are satisfied.', ctaLabel: 'View escrow', ctaAction: 'interact', accentColor: '#49EACB', alignment: 'center' }),
        blk('EnforcementBadge', { note: 'How this escrow is enforced' }),
        blk('StatRow', { stats: [{ label: 'In escrow', value: '{{total_locked}}' }, { label: 'Status', value: '{{status}}' }, { label: 'Actions', value: '{{tx_count}}' }] }),
        blk('Timeline', { title: 'How it settles', steps: [{ label: 'Funded', detail: 'Buyer locks funds to the escrow script.', state: 'done' }, { label: 'Delivery', detail: 'Seller delivers; both parties confirm.', state: 'active' }, { label: 'Release', detail: 'Funds release to the seller, or refund on timeout.', state: 'upcoming' }] }),
        blk('RichText', { markdown: '**Terms.** Funds are locked to the escrow script and move only by satisfying it. Either the agreed release path or the timeout refund applies. Everything is on the [explorer](https://kaspa.org).' }),
        blk('Accordion', { title: 'Frequently asked', items: [{ q: 'Who holds the funds?', a: 'No one. The Kaspa script holds them; funds move only by satisfying it. See the enforcement badge on this page (script-enforced, oracle-cosigned, or full-zk verified off-chain).' }, { q: 'What if there is a dispute?', a: 'The disclosed release and timeout paths govern. There is no off-chain custody.' }] }),
        blk('Footer', { text: '{{name}} · On-chain escrow on Kaspa', showNetwork: 'yes' }),
      ],
    },
  },
  {
    id: 'vesting-timelock',
    name: 'Vesting / Timelock',
    premium: true,
    match: ['timelock', 'vesting', 'lock', 'rcsv', 'csv'],
    desc: 'Timelock countdown, locked-amount meter, and on-chain enforcement badge.',
    data: {
      root: ROOT({ backgroundPreset: 'gold-prestige', accentColor: '#E8AF34' }),
      content: [
        blk('HeroImage', { backgroundImageUrl: '', overlayOpacity: '0.55', title: '{{name}}', subtitle: '{{total_locked}} locked on {{network}} until the timelock elapses.', ctaLabel: 'View timelock', ctaAction: 'interact', accentColor: '#E8AF34', alignment: 'center' }),
        blk('EnforcementBadge', { note: 'How this timelock is enforced' }),
        blk('AnimatedCounter', { label: 'Locked', value: '{{amount_kaspa}}', suffix: 'KAS', decimals: '0', color: '#E8AF34' }),
        blk('Countdown', { title: 'Unlocks in', targetDate: '{{settle_at}}', endedText: 'The timelock has elapsed. Funds are spendable.', accentColor: '#E8AF34' }),
        blk('StatRow', { stats: [{ label: 'Locked', value: '{{total_locked}}' }, { label: 'Unlock DAA', value: '{{timelock}}' }, { label: 'Status', value: '{{status}}' }] }),
        blk('RichText', { markdown: 'Funds are time-locked by Kaspa consensus. They cannot move before the disclosed unlock point. This is enforced by the script, not by Covex.' }),
        blk('Footer', { text: '{{name}} · Consensus-enforced timelock on Kaspa', showNetwork: 'yes' }),
      ],
    },
  },
  {
    id: 'fundraiser',
    name: 'Fundraiser / Community Pool',
    premium: true,
    match: ['fundraiser', 'pool', 'community', 'donation', 'crowdfund'],
    desc: 'Goal meter, contributor leaderboard, live activity, and a pledge CTA.',
    data: {
      root: ROOT({ backgroundPreset: 'kaspa-hero' }),
      content: [
        blk('HeroImage', { backgroundImageUrl: '', overlayOpacity: '0.55', title: 'Back {{name}}', subtitle: 'Pledge in your own wallet. Non-custodial, on-chain, transparent. {{total_locked}} raised on {{network}}.', ctaLabel: 'Pledge now', ctaAction: 'spend', accentColor: '#49EACB', alignment: 'center' }),
        blk('EnforcementBadge', { note: 'How this pool is enforced' }),
        blk('PoolMeter', { label: 'Raised so far', value: '{{amount_kaspa}}', max: '10000', suffix: 'KAS', color: '#49EACB' }),
        blk('StatRow', { stats: [{ label: 'Raised', value: '{{total_locked}}' }, { label: 'Backers', value: '{{tx_count}}' }, { label: 'Status', value: '{{status}}' }] }),
        blk('Leaderboard', { title: 'Top backers', rankBy: 'amount', maxRows: '5', emptyText: 'No pledges on-chain yet. Be the first to back this.', accentColor: '#E8AF34' }),
        blk('ActivityFeed', { title: 'Recent pledges', emptyText: 'No on-chain pledges yet. Be the first to contribute.', maxRows: '5', accentColor: '#49EACB' }),
        blk('Accordion', { title: 'Frequently asked', items: [{ q: 'Where do the funds go?', a: 'To the disclosed on-chain destination per the covenant rules. See the enforcement badge on this page (script-enforced, oracle-cosigned, or full-zk verified off-chain). Everything is verifiable on the explorer.' }, { q: 'Is it non-custodial?', a: 'Yes. You sign in your own wallet; keys never leave your device.' }] }),
        blk('Footer', { text: '{{name}} · Community pool on Kaspa', showNetwork: 'yes' }),
      ],
    },
  },
  {
    id: 'tournament',
    name: 'Tournament',
    premium: true,
    match: ['tournament', 'bracket', 'league', 'cup'],
    desc: 'Prize-pool hero, entry tiers, bracket timeline, and a leaderboard.',
    data: {
      root: ROOT({ backgroundPreset: 'purple-mystic' }),
      content: [
        blk('HeroImage', { backgroundImageUrl: '', overlayOpacity: '0.6', title: '{{name}}', subtitle: 'Prize pool {{total_locked}} on {{network}}. Enter, climb, and win.', ctaLabel: 'Enter tournament', ctaAction: 'interact', accentColor: '#A855F7', alignment: 'center' }),
        blk('EnforcementBadge', { note: 'How this tournament is enforced' }),
        blk('AnimatedCounter', { label: 'Prize pool', value: '{{amount_kaspa}}', suffix: 'KAS', decimals: '0', color: '#A855F7' }),
        blk('PricingTier', { columns: '3', tiers: [{ name: 'Bronze', price: '10', cadence: 'KAS entry', featured: 'no', glow: 'builder', perks: 'One entry\nNon-custodial stake', ctaLabel: 'Enter', ctaAction: 'interact', amount: '10' }, { name: 'Silver', price: '50', cadence: 'KAS entry', featured: 'yes', glow: 'pro', perks: 'Seeded entry\nNon-custodial stake\nPriority bracket', ctaLabel: 'Enter', ctaAction: 'interact', amount: '50' }, { name: 'Gold', price: '100', cadence: 'KAS entry', featured: 'no', glow: 'max', perks: 'Top seed\nNon-custodial stake\nLargest share', ctaLabel: 'Enter', ctaAction: 'interact', amount: '100' }] }),
        blk('Timeline', { title: 'Bracket', steps: [{ label: 'Sign-ups', detail: 'Players enter and stake.', state: 'active' }, { label: 'Rounds', detail: 'Matches play out.', state: 'upcoming' }, { label: 'Final', detail: 'Champion takes the prize pool.', state: 'upcoming' }] }),
        blk('Leaderboard', { title: 'Standings', rankBy: 'amount', maxRows: '10', emptyText: 'No entries on-chain yet. Sign-ups open now.', accentColor: '#E8AF34' }),
        blk('Footer', { text: '{{name}} · Tournament on Kaspa', showNetwork: 'yes' }),
      ],
    },
  },
  {
    id: 'generic-covenant',
    name: 'Generic On-chain Covenant',
    match: ['generic', 'custom', 'merkle_membership', 'age_verification', 'range_proof'],
    desc: 'A clean, honest default: hero, stats, features, FAQ, and a CTA.',
    data: {
      root: ROOT({ backgroundPreset: 'kaspa-hero' }),
      content: [
        blk('HeroImage', { backgroundImageUrl: '', overlayOpacity: '0.55', title: '{{name}}', subtitle: 'A live, on-chain Kaspa covenant. {{total_locked}} secured on {{network}}.', ctaLabel: 'Enter covenant', ctaAction: 'interact', accentColor: '#49EACB', alignment: 'center' }),
        blk('EnforcementBadge', { note: 'How this covenant is enforced' }),
        blk('StatRow', { stats: [{ label: 'Locked', value: '{{total_locked}}' }, { label: 'Status', value: '{{status}}' }, { label: 'Actions', value: '{{tx_count}}' }] }),
        blk('FeatureGrid', { columns: '3', features: [{ icon: 'Lock', headline: 'On-chain enforced', description: 'When script-enforced, funds move only by satisfying the script. See the enforcement badge on this page (script-enforced, oracle-cosigned, or full-zk verified off-chain).' }, { icon: 'Zap', headline: 'Kaspa speed', description: 'Settles on the BlockDAG at 10 blocks per second.' }, { icon: 'ShieldCheck', headline: 'Non-custodial', description: 'You sign in your own wallet. Keys never leave your device.' }] }),
        blk('Accordion', { title: 'Frequently asked', items: [{ q: 'Is this non-custodial?', a: 'Yes. You sign in your own wallet; keys never leave your device.' }, { q: 'How is it enforced?', a: 'See the enforcement badge on this page (script-enforced, oracle-cosigned, or full-zk verified off-chain). Everything is disclosed and verifiable on the explorer.' }] }),
        blk('StakeCTA', { label: 'Interact', helper: 'Opens the interact panel. Non-custodial, signs in your wallet. See the enforcement badge on this page (script-enforced, oracle-cosigned, or full-zk verified off-chain).', action: 'interact', outcome: 'yes', amount: '', variant: 'kaspa' }),
        blk('Footer', { text: '{{name}} · On-chain covenant on Kaspa', showNetwork: 'yes' }),
      ],
    },
  },
];

// Pick a default template id for a covenant_type/category string (first-run picker).
export function matchTemplate(typeStr) {
  const hay = String(typeStr || '').toLowerCase();
  for (const t of STARTER_TEMPLATES) {
    if (t.match.some((m) => hay.includes(m))) return t.id;
  }
  return 'generic-covenant';
}

export default puckConfig;
