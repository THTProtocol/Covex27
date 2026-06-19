import { useId } from 'react';
import { QrCode } from 'lucide-react';

/**
 * Strictly sanitize + SCOPE a creator's custom CSS before it is ever injected.
 * Previously config.customCSS was written verbatim into a <style> in the PARENT
 * document via dangerouslySetInnerHTML - a CSS-injection / data-exfiltration
 * surface (a creator could style :root, @import a remote sheet, set
 * background:url(...) beacons, or break out with </style>). Now we:
 *   - reject the whole sheet if it contains @import, expression(), behavior:,
 *     -moz-binding, javascript:, </style, or non-https/non-data url() values;
 *   - prefix EVERY top-level selector with the unique #scopeId of THIS preview,
 *     so nothing can reach outside the card (no global :root / html / body / *).
 * The result only ever styles this component's own subtree.
 */
function sanitizeAndScopeCss(css, scopeSel) {
  if (typeof css !== 'string' || !css.trim()) return '';
  // Hard reject the entire sheet on any dangerous construct.
  if (/@import|expression\s*\(|behavior\s*:|-moz-binding|javascript:|<\/?\s*style|<!--|-->/i.test(css)) return '';
  // url() may only reference https: or data: (no http:, no relative beacons).
  const urls = css.match(/url\(\s*([^)]*)\)/gi) || [];
  for (const u of urls) {
    const inner = u.replace(/url\(\s*|\s*\)/gi, '').replace(/^['"]|['"]$/g, '').trim();
    if (!/^(https:|data:)/i.test(inner)) return '';
  }
  // Scope each rule's selector(s) under scopeSel. We only keep simple `selector {decls}`
  // rules; @media/@supports blocks and @keyframes are dropped (rare in a card preview,
  // and they complicate safe scoping). Selectors are prefixed so they cannot escape.
  let out = '';
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(css)) !== null) {
    const sel = m[1].trim();
    const decls = m[2].trim();
    if (!sel || sel.startsWith('@')) continue; // drop at-rules
    const scoped = sel.split(',').map((s) => `${scopeSel} ${s.trim()}`).join(', ');
    out += `${scoped}{${decls}}\n`;
  }
  return out;
}

/**
 * Shared CovenantPreview, renders covenant data with custom_ui_config styling.
 * Used by both the PremiumBuilder live preview pane and the public covenant page.
 * Ensures builder preview === exactly what visitors see.
 */
export default function CovenantPreview({ config, covenant, children, className = '' }) {
  if (!config) config = {};
  const rawScopeId = useId();
  // useId returns ":r0:"-style ids; make a CSS-safe class token.
  const scopeClass = `cvx-pv-${String(rawScopeId).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scopedCss = config.customCSS ? sanitizeAndScopeCss(config.customCSS, `.${scopeClass}`) : '';

  const pc = config.primaryColor || '#49EACB';
  const bg = config.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' :
             config.bgStyle === 'dark' ? '#0A0A0D' :
             config.bgStyle === 'solid' ? '#111116' : '#111116';
  const borderColor = `${pc}${config.borderOpacity || '20'}`;
  const borderW = config.borderStyle === 'none' ? '0px' :
                  config.borderStyle === 'thin' ? '1px' :
                  config.borderStyle === 'normal' ? '2px' : '3px';
  const padMap = { compact: '12px', normal: '20px', spacious: '32px' };
  const pad = padMap[config.padding] || '20px';
  const radiusMap = { none: '0', sm: '0.375rem', md: '0.75rem', lg: '1rem', xl: '1.5rem', '2xl': '2rem', full: '9999px' };
  const radius = radiusMap[config.borderRadius] || '0.75rem';
  const shadowMap = {
    none: 'none',
    soft: '0 4px 12px rgba(0,0,0,0.3)',
    neon: `0 0 20px ${pc}30, inset 0 0 30px ${pc}05`,
    elevated: '0 8px 32px rgba(0,0,0,0.4)',
  };
  const glowInt = { low: '15', medium: '30', high: '60' };
  const glowVal = glowInt[config.glowIntensity] || '30';
  const shadow = config.showGlow ? shadowMap[config.shadow || 'soft'] : shadowMap.soft;
  // Animation map. Each option maps to a DISTINCT visual: 'shimmer' and 'glitch'
  // used to silently fall back to animate-pulse (dishonest UI), so they now drive
  // their own keyframes injected inline below (no new CSS file, scoped via the
  // unique scopeClass). prefers-reduced-motion disables all of them.
  const animMap = { none: '', pulse: 'animate-pulse', shimmer: 'cvx-anim-shimmer', float: 'animate-bounce', glitch: 'cvx-anim-glitch' };
  const anim = animMap[config.animation] || '';
  // Inline keyframes for shimmer/glitch, scoped to THIS preview so they cannot
  // leak into the parent document. Only emitted when actually used.
  const needsAnimCss = anim === 'cvx-anim-shimmer' || anim === 'cvx-anim-glitch';
  const animCss = needsAnimCss ? `
    @keyframes ${scopeClass}-shimmer {
      0% { background-position: -150% 0; }
      100% { background-position: 250% 0; }
    }
    .${scopeClass}.cvx-anim-shimmer {
      background-image: linear-gradient(110deg, transparent 35%, ${pc}22 50%, transparent 65%);
      background-size: 250% 100%;
      background-repeat: no-repeat;
      animation: ${scopeClass}-shimmer 2.6s ease-in-out infinite;
    }
    @keyframes ${scopeClass}-glitch {
      0%, 92%, 100% { transform: translate(0, 0); filter: none; }
      93% { transform: translate(-1px, 0); filter: hue-rotate(8deg); }
      95% { transform: translate(1px, -1px); filter: hue-rotate(-8deg); }
      97% { transform: translate(-1px, 1px); filter: hue-rotate(6deg); }
    }
    .${scopeClass}.cvx-anim-glitch { animation: ${scopeClass}-glitch 3.2s steps(1, end) infinite; }
    @media (prefers-reduced-motion: reduce) {
      .${scopeClass}.cvx-anim-shimmer, .${scopeClass}.cvx-anim-glitch { animation: none; background-image: none; }
    }
  ` : '';
  const fontStyle = { fontFamily: config.font === 'mono' ? 'monospace' : config.font === 'serif' ? 'serif' : 'sans-serif' };
  const badgeMap = { pill: 'rounded-lg', banner: 'rounded-none', tag: 'inline-block px-3' };
  const badgeCls = badgeMap[config.badgeStyle] || 'rounded-lg';

  return (
    <div
      className={`${scopeClass} rounded-xl overflow-hidden transition-all ${anim} ${className}`}
      style={{
        background: bg,
        border: borderW === '0px' ? 'none' : `${borderW} solid ${borderColor}`,
        boxShadow: shadow,
        padding: pad,
        borderRadius: radius,
        ...fontStyle,
      }}
    >
      {/* Custom CSS (MAX tier): sanitized + scoped to THIS preview's subtree only.
          Never reaches the parent document's :root/html/body and cannot @import or
          beacon out. See sanitizeAndScopeCss above. */}
      {scopedCss && <style dangerouslySetInnerHTML={{ __html: scopedCss }} />}
      {/* Per-instance keyframes for shimmer/glitch (only emitted when active). */}
      {animCss && <style dangerouslySetInnerHTML={{ __html: animCss }} />}
      {/* Feature Badge */}
      {config.featureBadge && (
        <div
          className={`text-center py-1.5 mb-3 text-[10px] font-bold uppercase tracking-widest ${badgeCls}`}
          style={{ backgroundColor: `${pc}20`, color: pc, border: `1px solid ${pc}40` }}
        >
          {config.featureBadge}
        </div>
      )}

      {/* Logo */}
      {config.logoUrl && (
        <div className="flex justify-center mb-3">
          <img src={config.logoUrl} alt="Logo" className="h-8 object-contain rounded" onError={(e) => (e.target.style.display='none')} />
        </div>
      )}

      {/* Title */}
      <h4 className="font-bold text-sm text-white mb-1">
        {config.titleOverride || covenant?.name || covenant?.covenant_type || 'Covenant'}
      </h4>
      <p className="text-[10px] text-gray-300 mb-2" style={{ fontFamily: 'monospace' }}>
        {(covenant?.tx_id || '').slice(0, 16)}...
      </p>

      {/* Description */}
      <p className="text-xs text-gray-200 mb-3">
        {config.descOverride || covenant?.description || 'No description provided.'}
      </p>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
          <p className="text-[9px] text-gray-300">Locked KAS</p>
          <p className="text-xs font-bold" style={{ color: pc, fontFamily: 'monospace' }}>
            {(covenant?.amount_kaspa || 0).toLocaleString()} KAS
          </p>
        </div>
        <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
          <p className="text-[9px] text-gray-300">Type</p>
          <p className="text-xs text-gray-300">{covenant?.covenant_type || 'P2SH'}</p>
        </div>
      </div>

      {/* Extra stats */}
      {(config.showScriptHash !== false || config.showCreator !== false || config.showBlockDaa || config.showTimestamp) && (
        <div className={`mb-3 p-2 rounded-lg border border-white/5 space-y-1 ${config.font === 'mono' ? 'font-mono' : ''}`}>
          {config.showScriptHash !== false && (
            <div className="flex justify-between text-[9px]">
              <span className="text-gray-300">Script Hash</span>
              <span style={{ color: pc }}>{(covenant?.script_hash || '').slice(0, 14)}...</span>
            </div>
          )}
          {config.showCreator !== false && (
            <div className="flex justify-between text-[9px]">
              <span className="text-gray-300">Creator</span>
              <span className="text-gray-200">{(covenant?.creator_addr || '').slice(0, 14)}...</span>
            </div>
          )}
          {config.showBlockDaa && (
            <div className="flex justify-between text-[9px]">
              <span className="text-gray-300">Block DAA</span>
              <span className="text-gray-200">{covenant?.block_daa_score || 0}</span>
            </div>
          )}
          {config.showTimestamp && (
            <div className="flex justify-between text-[9px]">
              <span className="text-gray-300">Created</span>
              <span className="text-gray-200">{covenant?.timestamp ? new Date(covenant.timestamp * 1000).toLocaleDateString() : 'N/A'}</span>
            </div>
          )}
        </div>
      )}

      {/* Terminal layout */}
      {config.layout === 'terminal' && (
        <div className="p-3 rounded-lg bg-black/60 border border-[#49EACB]/20 font-mono text-xs mb-3">
          <p style={{ color: pc }}>$ covenant --query {covenant?.tx_id?.slice(0, 8)}...</p>
          <p style={{ color: pc }}>$ locked: {(covenant?.amount_kaspa || 0).toFixed(2)} KAS</p>
          <p className="animate-pulse" style={{ color: pc }}>█</p>
        </div>
      )}

      {/* Floating layout */}
      {config.layout === 'floating' && (
        <div className="mb-3" style={{ boxShadow: `0 8px 32px ${pc}15` }}>
          <div className="p-3 rounded-xl bg-black/30 border border-white/5 text-[10px] text-gray-200">
            Floating panel, elevated UI for premium covenants.
          </div>
        </div>
      )}

      {/* Widgets section, disabled (VisualDesigner removed) */}
      {false && (config.widgets && config.widgets.length > 0) && (
        <div className="space-y-2 mb-3">
          {config.widgets.map((wid) => (
            <div key={wid}>
              {renderWidgetPreview(wid, null, pc, covenant)}
            </div>
          ))}
        </div>
      )}

      {/* QR Code */}
      {config.showQR && (
        <div className="mb-3 p-3 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center">
          <div className="w-16 h-16 bg-white/10 rounded flex items-center justify-center text-[9px] text-gray-300">
            <QrCode size={24} />
          </div>
        </div>
      )}

      {/* Children slot (for buttons, interaction panels, etc.) */}
      {children}

      {/* Default Button if no children. This is a visual mock of the covenant's own action
          button (the preview shows how the deployed card will look), so it is intentionally
          non-interactive here: type=button (never submits) + aria-hidden + not tab-focusable. */}
      {!children && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className={`w-full py-2 rounded-lg text-xs font-bold uppercase tracking-wide cursor-default ${
            config.buttonStyle === 'outline' ? 'bg-transparent border-2' :
            config.buttonStyle === 'ghost' ? 'bg-transparent' :
            config.buttonStyle === 'pill' ? 'rounded-full' : ''
          }`}
          style={config.buttonStyle === 'outline' || config.buttonStyle === 'ghost'
            ? { border: config.buttonStyle === 'outline' ? `2px solid ${pc}` : 'none', color: pc }
            : { backgroundColor: pc, color: '#000' }}
        >
          Execute Covenant
        </button>
      )}
    </div>
  );
}
