import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Terminal, Layers, Sparkles, Zap, Shield, Globe,
  Download, Upload, Copy, Trash2, ScrollText, Code2,
  Eye, EyeOff, Server, Gauge, Cpu, FileCode, Braces,
  Diamond, Gem, Crown
} from 'lucide-react';
import CovenantPreview from './CovenantPreview';

// ─── God-tier styling constants ────────────────────────
const NEON = '#49EACB';
const GOLD = '#E8AF34';
const SILVER = '#C0C0C0';
const VOID = '#020206';
const DIM = '#0d0d14';

// ─── Command parser ────────────────────────────────────
const CMDS = {
  help: { usage: 'help', desc: 'Display this command list', minTier: 0 },
  status: { usage: 'status', desc: 'Display covenant and network status', minTier: 0 },
  load: { usage: 'load covenant:<tx_id>', desc: 'Load a covenant by transaction ID', minTier: 1 },
  import: { usage: 'import ui-json', desc: 'Paste custom UI code/configuration in JSON format', minTier: 1 },
  configure: { usage: 'configure fee|reusable|claim-pct|top-up', desc: 'Configure covenant parameters: fee%, reusability, claim splits, pot top-ups', minTier: 1 },
  claim: { usage: 'claim zk|oracle|auto', desc: 'Set claim method: ZK proof, trusted oracle, or auto-detect', minTier: 1 },
  visualize: { usage: 'visualize live', desc: 'Toggle live WYSIWYG preview of current config', minTier: 1 },
  infuse: { usage: 'infuse css', desc: 'Inject custom CSS into the covenant page', minTier: 2 },
  export: { usage: 'export html [--eternal]', desc: 'Export current design as standalone HTML', minTier: 1 },
  verify: { usage: 'verify sig', desc: 'Verify a cryptographic signature', minTier: 0 },
  history: { usage: 'history', desc: 'Show command history for this session', minTier: 0 },
  clear: { usage: 'clear', desc: 'Clear the terminal screen', minTier: 0 },
  divine: { usage: 'divine', desc: 'Toggle transcendent Divine Mode', minTier: 3 },
};

// ─── Banner ASCII art ───────────────────────────────────
const BANNER = `\
  ┌─────────────────────────────────────────────────────────┐
  │  ⚡ COVEX TERMINAL v2.7 — The Celestial Vault ⚡       │
  │  Covenant Command Interface · Kaspa BlockDAG TN-12      │
  │  ${NEON}██╗  ██╗ █████╗ ███████╗██████╗  █████╗ │
  │  ${NEON}██║ ██╔╝██╔══██╗██╔════╝██╔══██╗██╔══██╗│
  │  ${NEON}█████╔╝ ███████║███████╗██████╔╝███████║│
  │  ${NEON}██╔═██╗ ██╔══██║╚════██║██╔═══╝ ██╔══██║│
  │  ${NEON}██║  ██╗██║  ██║███████║██║     ██║  ██║│
  │  ${NEON}╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝│
  │                                                     │
  │  Type ${NEON}help${GOLD} to begin. ${NEON}CTRL+C${GOLD} is disabled here.  │
  └─────────────────────────────────────────────────────────┘`;

// ─── Sub-components ─────────────────────────────────────

function TerminalLine({ children, type = 'output' }) {
  const colors = {
    input: 'text-[#49EACB]',
    output: 'text-gray-300',
    error: 'text-red-400',
    info: 'text-[#E8AF34]',
    success: 'text-emerald-400',
    muted: 'text-gray-600',
    prompt: 'text-[#49EACB]',
  };
  return (
    <div className={`font-mono text-xs leading-relaxed whitespace-pre-wrap break-all ${colors[type] || colors.output}`}>
      {children}
    </div>
  );
}

function ScanlineOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.03]" style={{
      background: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${NEON} 2px, ${NEON} 3px)`
    }} />
  );
}

export default function CovexTerminal({ covenant, walletAddress, config, onConfigChange, onSave, tier, effectiveTierVal }) {
  const [lines, setLines] = useState([{ type: 'info', text: BANNER }]);
  const [input, setInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [livePreview, setLivePreview] = useState(false);
  const [loadedConfig, setLoadedConfig] = useState(config || {});
  const [divineMode, setDivineMode] = useState(false);
  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  const isPro = effectiveTierVal >= 2;
  const isMax = effectiveTierVal >= 3;

  // Sync loadedConfig when parent pushes new config
  useEffect(() => {
    if (config && Object.keys(config).length > 0) {
      setLoadedConfig(config);
    }
  }, [config]);

  // ─── Auto-scroll ─────────────────────────────────────
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  // ─── Focus input on mount and click ──────────────────
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ─── Command execution engine ────────────────────────
  const execCmd = useCallback((raw) => {
    const input = raw.trim();
    if (!input) return;

    // Add to history
    setCmdHistory(prev => [...prev, input]);
    setHistoryIdx(-1);

    // Add input line
    setLines(prev => [...prev, { type: 'input', text: `${GOLD}covex${NEON} > ${input}` }]);

    // Parse command
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    const respond = (type, text) => {
      setLines(prev => [...prev, { type, text }]);
    };

    switch (cmd) {
      case 'help': {
        const lines = [`${GOLD}══════ DIVINE COMMANDS ══════`];
        Object.entries(CMDS).forEach(([name, meta]) => {
          const locked = meta.minTier > effectiveTierVal;
          const prefix = locked ? '🔒 ' : '  ';
          lines.push(`${prefix}${NEON}${meta.usage.padEnd(36)}${GOLD} :: ${meta.desc}${locked ? ` ${SILVER}(requires ${['','CREATOR','PRO','MAX'][meta.minTier]})` : ''}`);
        });
        lines.push(`${GOLD}═══════════════════════════`);
        respond('info', lines.join('\n'));
        break;
      }

      case 'status':
        respond('info', [
          `${GOLD}═══ COVEX STATUS ═══`,
          `${SILVER}Covenant:     ${covenant?.name || (covenant?.tx_id || 'N/A').slice(0, 16)}...`,
          `${SILVER}Tier:         ${tier}`,
          `${SILVER}Locked KAS:   ${(covenant?.amount_kaspa || 0).toLocaleString()} KAS`,
          `${SILVER}Category:     ${covenant?.category || 'General'}`,
          `${SILVER}Network:      Kaspa Testnet-12 (Toccata)`,
          `${SILVER}Node:         Connected via wRPC on port 17217`,
          `${SILVER}Session:      Active`,
        ].join('\n'));
        break;

      case 'load': {
        const idArg = args.join(' ');
        const match = idArg.match(/covenant:(\S+)/);
        if (!match) return respond('error', 'Error: Invalid syntax. Use: load covenant:<tx_id>');
        const txId = match[1];
        respond('info', `Loading covenant ${txId}...`);
        fetch(`/api/covenants/${encodeURIComponent(txId)}`)
          .then(r => r.json())
          .then(d => {
            if (d.success && d.covenant) {
              respond('success', `Covenant loaded: ${d.covenant.name || txId.slice(0, 12)}...`);
              respond('info', `  Type: ${d.covenant.covenant_type} | Tier: ${d.covenant.verified_tier || 'FREE'} | Locked: ${d.covenant.amount_kaspa} KAS`);
            } else {
              respond('error', `Covenant not found: ${txId}`);
            }
          })
          .catch(() => respond('error', 'Failed to load covenant: Network error'));
        break;
      }

      case 'import': {
        respond('info', `${GOLD}Paste your custom UI JSON configuration below. Type ${NEON}--done${GOLD} on a new line to apply.`);
        setLines(prev => [...prev, { type: 'input', text: `${GOLD}covex${NEON} > (paste mode — type ${NEON}--done${GOLD} to finish)` }]);
        // Multi-line paste mode
        const pasteHandler = (e) => {
          if (e.key === 'Enter') {
            const val = inputRef.current?.value || '';
            if (val.trim() === '--done') {
              respond('success', 'JSON import parsed. Applying configuration...');
              try {
                const parsed = JSON.parse(pasteBuffer.current);
                if (onConfigChange) {
                  onConfigChange(parsed);
                  setLoadedConfig(parsed);
                  setLivePreview(true);
                  respond('info', '  Design imported. Live preview active.');
                }
              } catch (err) {
                respond('error', `Invalid JSON: ${err.message}`);
              }
              // Remove paste mode listener
              document.removeEventListener('keydown', pasteHandler, true);
            } else {
              pasteBuffer.current += val;
            }
            inputRef.current.value = '';
          }
        };
        pasteBuffer.current = '';
        document.addEventListener('keydown', pasteHandler, true);
        break;
      }

      // ─── NEW: Covenant configuration commands ──────────

      case 'configure': {
        const sub = args[0];
        if (!sub) {
          respond('info', [
            `${GOLD}═══ CONFIGURE COVENANT ═══`,
            `${SILVER}Usage: ${NEON}configure fee <0-100>${SILVER}  — Set fee percentage kept in covenant on claim`,
            `${SILVER}Usage: ${NEON}configure reusable${SILVER}     — Toggle single-use / reusable mode`,
            `${SILVER}Usage: ${NEON}configure claim-pct <0-100>${SILVER} — Set winner's claim percentage (rest stays)`,
            `${SILVER}Usage: ${NEON}configure top-up${SILVER}        — Toggle new player pot top-up`,
            ``,
            `${SILVER}Current: Fee=${loadedConfig.fee || 0}% | ${loadedConfig.reusable ? 'Reusable' : 'Single-use'} | Claim=${loadedConfig.claimPct || 100}% | Top-up: ${loadedConfig.allowTopUp ? 'ON' : 'OFF'}`,
          ].join('\\n'));
          break;
        }
        if (sub === 'fee') {
          const val = parseInt(args[1]);
          if (isNaN(val) || val < 0 || val > 100) return respond('error', 'Error: fee must be a number between 0 and 100');
          if (val > 5) respond('info', `${GOLD}Note: Reasonable maximum is 5%. Values above this may be rejected by the covenant.`);
          const newCfg = { ...loadedConfig, fee: val };
          setLoadedConfig(newCfg);
          if (onConfigChange) onConfigChange(newCfg);
          respond('success', `Fee configured: ${NEON}${val}%${GOLD} kept in covenant on every claim.`);
        } else if (sub === 'reusable') {
          const newVal = !loadedConfig.reusable;
          const newCfg = { ...loadedConfig, reusable: newVal };
          setLoadedConfig(newCfg);
          if (onConfigChange) onConfigChange(newCfg);
          respond('success', newVal ? 'Covenant set to reusable mode. Multiple independent game sessions allowed.' : 'Covenant set to single-use mode.');
        } else if (sub === 'claim-pct') {
          const val = parseInt(args[1]);
          if (isNaN(val) || val < 0 || val > 100) return respond('error', 'Error: claim percentage must be 0-100');
          const newCfg = { ...loadedConfig, claimPct: val };
          setLoadedConfig(newCfg);
          if (onConfigChange) onConfigChange(newCfg);
          respond('success', `Claim percentage: Winner takes ${NEON}${val}%${GOLD}, ${100 - val}% stays in covenant.`);
        } else if (sub === 'top-up') {
          const newVal = !loadedConfig.allowTopUp;
          const newCfg = { ...loadedConfig, allowTopUp: newVal };
          setLoadedConfig(newCfg);
          if (onConfigChange) onConfigChange(newCfg);
          respond('success', newVal ? 'Pot top-up enabled. New players can add funds at any time.' : 'Pot top-up disabled. Only initial deposit permitted.');
        } else {
          respond('error', `Unknown config option: ${sub}. Use: fee, reusable, claim-pct, or top-up.`);
        }
        break;
      }

      case 'claim': {
        const method = args[0];
        if (!method || !['zk', 'oracle', 'auto'].includes(method)) {
          respond('info', [
            `${GOLD}═══ CLAIM METHOD ═══`,
            `${SILVER}Usage: ${NEON}claim zk${SILVER}      — Full ZK proof verification (RISC Zero zkVM)`,
            `${SILVER}Usage: ${NEON}claim oracle${SILVER}  — Trusted oracle signed outcome (fallback)`,
            `${SILVER}Usage: ${NEON}claim auto${SILVER}    — Auto-detect (ZK first, fallback to oracle)`,
            ``,
            `${SILVER}Current: ${loadedConfig.claimMethod || 'auto'}`,
          ].join('\\n'));
          break;
        }
        const newCfg = { ...loadedConfig, claimMethod: method };
        setLoadedConfig(newCfg);
        if (onConfigChange) onConfigChange(newCfg);
        const desc = method === 'zk' ? 'ZK proof (RISC Zero zkVM + Groth16) — fully trustless' :
                     method === 'oracle' ? 'Trusted oracle (signed outcome) — instant UX fallback' :
                     'Auto-detect: ZK first, fallback to oracle';
        respond('success', `Claim method set: ${NEON}${method}${GOLD} — ${desc}`);
        break;
      }

      case 'visualize': {
        setLivePreview(prev => !prev);
        respond('success', livePreview ? 'Live preview: OFF' : 'Live preview: ON — WYSIWYG rendering active');
        break;
      }

      case 'infuse': {
        if (!isMax) return respond('error', `Access denied. ${NEON}infuse${SILVER} requires MAX tier. Ascend to MAX to wield custom CSS.`);
        respond('info', `${GOLD}Enter custom CSS (MAX tier). Type ${NEON}--done${GOLD} on a new line to infuse.`);
        const cssHandler = (e) => {
          if (e.key === 'Enter') {
            const val = inputRef.current?.value || '';
            if (val.trim() === '--done') {
              const css = cssBuffer.current;
              if (onConfigChange) {
                const newCfg = { ...loadedConfig, customCSS: css };
                setLoadedConfig(newCfg);
                onConfigChange(newCfg);
                respond('success', `Custom CSS infused (${css.length} chars). Applied to covenant.`);
              }
              document.removeEventListener('keydown', cssHandler, true);
            } else {
              cssBuffer.current += val + '\n';
            }
            inputRef.current.value = '';
          }
        };
        cssBuffer.current = '';
        document.addEventListener('keydown', cssHandler, true);
        break;
      }

      case 'export': {
        const isEternal = args.includes('--eternal');
        const name = loadedConfig?.titleOverride || covenant?.name || 'Covenant';
        const pc = loadedConfig?.primaryColor || '#49EACB';
        const border = loadedConfig?.borderRadius || '0.75rem';
        const pad = loadedConfig?.padding === 'compact' ? '12px' : loadedConfig?.padding === 'spacious' ? '32px' : '20px';
        const bg = loadedConfig?.bgStyle === 'dark' ? '#0A0A0D' : loadedConfig?.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' : '#111116';
        respond('info', `Forging ${isEternal ? 'Eternal Covenant' : 'export'} for ${name}...`);
        setTimeout(() => {
          const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${isEternal ? '⚡ ETERNAL ' : ''}${name} — Covex Covenant</title>
<style>
  * { box-sizing:border-box;margin:0;padding:0; }
  body { min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;
    background:${isEternal ? `radial-gradient(ellipse at 50% 0%, ${pc}08, transparent 60%), ` : ''}#020206;
    font-family:${loadedConfig?.font === 'mono' ? 'monospace' : loadedConfig?.font === 'serif' ? 'serif' : 'sans-serif'};
    color:#e5e5e5;
  }
  ${isEternal ? 'body::before{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent,transparent 2px,' + pc + '08 2px,' + pc + '08 3px);z-index:999;}' : ''}
  .card { max-width:540px;width:100%;padding:${pad};border-radius:${border};background:${bg};
    border:1px solid ${pc}40;${loadedConfig?.showGlow ? `box-shadow:0 0 20px ${pc}30,0 4px 12px rgba(0,0,0,0.3);` : ''} }
  .badge { text-align:center;padding:0.5rem 0;margin-bottom:1rem;border-radius:0.5rem;
    font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
    background:${pc}20;color:${pc};border:1px solid ${pc}40; }
  .title { font-weight:700;font-size:1.2rem;margin-bottom:0.25rem;color:#fff; }
  .subtitle { color:#6b7280;font-size:0.65rem;font-family:monospace;margin-bottom:1rem; }
  .desc { color:#9ca3af;font-size:0.75rem;margin-bottom:1rem;line-height:1.6; }
  .grid { display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1rem; }
  .stat { padding:0.6rem;border-radius:0.5rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05); }
  .stat-label { color:#6b7280;font-size:0.6rem;text-transform:uppercase; }
  .stat-val { font-size:0.75rem;font-weight:700;font-family:monospace;color:${pc}; }
  .btn { width:100%;padding:0.6rem;border-radius:0.5rem;background:${pc};color:#000;font-weight:700;
    font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;border:none;cursor:pointer;
    box-shadow:0 0 15px ${pc}30;transition:all 0.2s; }
  .btn:hover { box-shadow:0 0 30px ${pc}60; }
  .footer { text-align:center;margin-top:1rem;font-size:0.6rem;color:#555;font-family:monospace; }
  ${isEternal ? '.glow-text { text-shadow:0 0 10px ' + pc + '80,0 0 30px ' + pc + '40; }' : ''}
  ${loadedConfig?.customCSS || ''}
</style>
</head>
<body>
<div class="card">
  ${loadedConfig?.featureBadge ? '<div class="badge">' + loadedConfig.featureBadge + '</div>' : ''}
  ${loadedConfig?.logoUrl ? '<div style="text-align:center;margin-bottom:1rem"><img src="' + loadedConfig.logoUrl + '" alt="logo" style="height:2.5rem;object-fit:contain"></div>' : ''}
  <div class="title${isEternal ? ' glow-text' : ''}">${name}</div>
  <div class="subtitle">${(covenant?.tx_id || '').slice(0, 16)}... — ${isEternal ? 'FORGED IN ETERNAL NEON' : 'Covex Covenant'}</div>
  <div class="desc">${loadedConfig?.descOverride || covenant?.description || 'Covenant deployed on the Kaspa BlockDAG TN-12.'}</div>
  <div class="grid">
    <div class="stat"><div class="stat-label">Locked KAS</div><div class="stat-val">${(covenant?.amount_kaspa || 0).toLocaleString()} KAS</div></div>
    <div class="stat"><div class="stat-label">Type</div><div class="stat-val" style="color:#d1d5db">${covenant?.covenant_type || 'P2SH'}</div></div>
    <div class="stat"><div class="stat-label">Tier</div><div class="stat-val">${tier}</div></div>
    <div class="stat"><div class="stat-label">Category</div><div class="stat-val" style="color:#d1d5db">${covenant?.category || 'General'}</div></div>
  </div>
  ${covenant?.script_hash ? '<div style="margin-bottom:0.75rem;padding:0.5rem;border-radius:0.5rem;background:rgba(0,0,0,0.4);font-family:monospace;font-size:0.6rem;word-break:break-all"><span style="color:#6b7280">Script:</span> <span style="color:' + pc + '">' + covenant.script_hash.slice(0, 32) + '...</span></div>' : ''}
  ${covenant?.creator_addr ? '<div style="margin-bottom:0.75rem;padding:0.5rem;border-radius:0.5rem;background:rgba(0,0,0,0.4);font-family:monospace;font-size:0.6rem"><span style="color:#6b7280">Creator:</span> <span style="color:#d1d5db">' + covenant.creator_addr.slice(0, 20) + '...</span></div>' : ''}
  <button class="btn" onclick="window.open('${window.location.origin}','_blank')">${isEternal ? '⚡ View Eternal Covenant on Covex' : 'View on Covex'}</button>
  <div class="footer">${isEternal ? 'Forged in Eternal Neon · Covex Terminal · Kaspa BlockDAG TN-12' : 'Generated by Covex Terminal · Kaspa BlockDAG TN-12'}</div>
</div>
</body>
</html>`;
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}_${isEternal ? 'eternal_covenant' : 'covex_export'}.html`;
          a.click();
          URL.revokeObjectURL(url);
          respond('success', `⚡ ${isEternal ? 'Eternal Covenant' : 'Export'} forged: ${a.download}`);
        }, 400);
        break;
      }

      case 'verify':
        respond('info', `${SILVER}Signature verification gateway initializing...`);
        respond('muted', '  Feature: On-chain signature verification. Connect wallet and provide signature to verify.');
        break;

      case 'history':
        if (cmdHistory.length === 0) return respond('muted', 'No commands yet in this session.');
        respond('info', cmdHistory.map((c, i) => `  ${String(i + 1).padStart(3)}  ${c}`).join('\n'));
        break;

      case 'clear':
        setLines([{ type: 'info', text: BANNER }]);
        break;

      case 'divine': {
        if (!isMax) return respond('error', `Access denied. ${NEON}divine${SILVER} mode requires MAX tier. Ascend to MAX to wield transcendent power.`);
        setDivineMode(prev => !prev);
        respond('success', divineMode
          ? `${SILVER}Divine Mode: ${NEON}OFF${SILVER}. Returning to mortal realms.`
          : `${GOLD}DIVINE MODE: ${NEON}ACTIVATED${GOLD}. Volumetric bloom, particle streams, unlimited effects unleashed. You are now commanding digital reality itself.`
        );
        break;
      }

      default:
        // Suggest nearest commands
        const suggestions = Object.keys(CMDS).filter(c => c.startsWith(cmd) || cmd.startsWith(c));
        if (suggestions.length > 0) {
          respond('error', `Unknown command: ${cmd}. Did you mean: ${suggestions.map(s => NEON + s).join(', ')}?`);
        } else {
          respond('error', `Unknown command: ${cmd}. Type ${NEON}help${GOLD} for available commands.`);
        }
    }
  }, [lines, livePreview, loadedConfig, effectiveTierVal, tier, covenant, onConfigChange, cmdHistory, isPro, isMax]);

  const pasteBuffer = useRef('');
  const cssBuffer = useRef('');

  // ─── Input handler ────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      execCmd(e.target.value);
      e.target.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const newIdx = historyIdx === -1 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(newIdx);
        e.target.value = cmdHistory[newIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx >= 0) {
        const newIdx = historyIdx + 1;
        if (newIdx >= cmdHistory.length) {
          setHistoryIdx(-1);
          e.target.value = '';
        } else {
          setHistoryIdx(newIdx);
          e.target.value = cmdHistory[newIdx];
        }
      }
    }
  }, [execCmd, cmdHistory, historyIdx]);

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* ═════ TOP BAR ═════ */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#49EACB]/[0.04] border border-[#49EACB]/[0.08]">
        <div className="flex items-center gap-2">
          <Diamond size={16} className="text-[#49EACB]" />
          <span className="text-sm font-semibold text-white tracking-wide">Covex Terminal</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#49EACB]/10 text-[#49EACB] border border-[#49EACB]/20">{tier}</span>
          {divineMode && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#E8AF34]/10 text-[#E8AF34] border border-[#E8AF34]/20 animate-pulse">DIVINE</span>}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><Cpu size={10} className="text-[#49EACB]" /> wRPC 17217</span>
          <span className="flex items-center gap-1"><Sparkles size={10} className="text-[#E8AF34]" /> Custom UI deploy</span>
          <span className="flex items-center gap-1">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#49EACB] opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#49EACB]" />
            </span>
            Active
          </span>
        </div>
      </div>

      {/* ═════ MAIN GRID ═════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 min-h-[65vh]">
        {/* ── TERMINAL CONSOLE ─────────────────────────── */}
        <div className="flex flex-col rounded-xl border border-[#49EACB]/10 overflow-hidden relative"
          style={{
            background: `linear-gradient(180deg, ${VOID} 0%, ${DIM} 100%)`,
            ...(divineMode ? { boxShadow: `0 0 40px ${NEON}20, 0 0 80px ${NEON}08, inset 0 0 60px ${NEON}05` } : {}),
          }}>
          <ScanlineOverlay />
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#49EACB]/10 bg-[#49EACB]/[0.02] z-10">
            <Terminal size={13} className="text-[#49EACB]" />
            <span className="text-[11px] font-semibold text-[#49EACB] font-mono">covex@kaspad:~$</span>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#49EACB]/40" />
              <div className="w-2 h-2 rounded-full bg-[#49EACB]/60" />
              <div className="w-2 h-2 rounded-full bg-[#49EACB]" />
              <span className="text-[9px] text-gray-600 ml-2 font-mono">tn-12</span>
            </div>
          </div>

          {/* Terminal output */}
          <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 space-y-1 z-10 cursor-text"
            style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}
            onClick={() => inputRef.current?.focus()}>
            {lines.map((line, i) => (
              <TerminalLine key={i} type={line.type}>{line.text}</TerminalLine>
            ))}
          </div>

          {/* Input line */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-[#49EACB]/10 bg-[#49EACB]/[0.02] z-10">
            <span className="text-xs font-mono font-bold text-[#E8AF34]">covex</span>
            <span className="text-xs font-mono font-bold text-[#49EACB]">{'>'}</span>
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-[#49EACB] placeholder:text-[#49EACB]/20"
              placeholder="Type help to begin..."
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
            <span className="text-[9px] text-gray-600 font-mono hidden sm:inline">↑↓ history</span>
          </div>
        </div>

        {/* ── LIVE PREVIEW PANE ────────────────────────── */}
        <div className="flex flex-col rounded-xl border border-[#E8AF34]/10 overflow-hidden bg-[#E8AF34]/[0.01]">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E8AF34]/10">
            <Eye size={13} className={livePreview ? 'text-[#E8AF34]' : 'text-gray-600'} />
            <span className="text-[11px] font-semibold text-white">Live Preview</span>
            <button
              onClick={() => setLivePreview(!livePreview)}
              className={`ml-auto px-2 py-0.5 rounded text-[9px] font-mono transition-colors ${
                livePreview ? 'bg-[#49EACB]/10 text-[#49EACB] border border-[#49EACB]/20' : 'bg-white/[0.02] text-gray-600 border border-white/5'
              }`}
            >
              {livePreview ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {livePreview ? (
              <CovenantPreview config={loadedConfig} covenant={covenant}>
                <div className="mt-3 pt-3 border-t border-[#49EACB]/10">
                  <p className="text-[9px] text-gray-500 mb-2 font-mono">Terminal Session Active</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      ['Template', loadedConfig?.templateName || '—'],
                      ['Category', loadedConfig?.templateCategory || '—'],
                      ['Commands', String(cmdHistory.length)],
                      ['CSS', loadedConfig?.customCSS ? `${loadedConfig.customCSS.length} chars` : 'None'],
                    ].map(([k, v]) => (
                      <div key={k} className="p-2 rounded bg-white/[0.02] border border-white/5">
                        <p className="text-[8px] text-gray-500">{k}</p>
                        <p className="text-[10px] text-white font-mono truncate">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CovenantPreview>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                <Terminal size={28} className="opacity-30" />
                <p className="text-[11px] text-center font-mono">Live preview OFF</p>
                <p className="text-[9px] text-center">Type <span className="text-[#49EACB]">visualize live</span> to enable</p>
              </div>
            )}
          </div>

          {/* Quick commands */}
          <div className="flex flex-wrap gap-1 p-2 border-t border-[#E8AF34]/10">
            {[
              { label: 'status', cmd: 'status' },
              { label: 'templates', cmd: 'templates' },
              { label: 'help', cmd: 'help' },
              { label: 'export', cmd: 'export html' },
              { label: 'visualize', cmd: 'visualize live' },
            ].map(({ label, cmd }) => (
              <button
                key={label}
                onClick={() => {
                  setInput(cmd);
                  setTimeout(() => execCmd(cmd), 50);
                }}
                className="px-2 py-1 rounded text-[9px] font-mono bg-white/[0.02] border border-white/5 text-gray-500 hover:text-[#49EACB] hover:border-[#49EACB]/20 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═════ BOTTOM STATUS BAR ═════ */}
      <div className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.01] border border-white/[0.04] text-[9px] font-mono text-gray-600">
        <span className="flex items-center gap-1"><Gauge size={10} /> {cmdHistory.length} commands</span>
        <span className="flex items-center gap-1"><Shield size={10} /> {tier} access</span>
        <span className="flex items-center gap-1"><Globe size={10} /> TN-12 Toccata</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#49EACB] animate-pulse" />
          Session active
        </span>
      </div>
    </div>
  );
}
