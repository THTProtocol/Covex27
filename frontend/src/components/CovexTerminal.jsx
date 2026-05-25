import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Terminal, Layers, Sparkles, Zap, Shield, Globe,
  Download, Upload, Copy, Trash2, ScrollText, Code2,
  Eye, EyeOff, Server, Gauge, Cpu, FileCode, Braces,
  Diamond, Gem, Crown
} from 'lucide-react';
import CovenantPreview from './CovenantPreview';
import { getAllTemplates, getTemplateById, getTemplatesByCategory, CATEGORIES } from '../data/covenantTemplates';

// ─── God-tier styling constants ────────────────────────
const NEON = '#49EACB';
const GOLD = '#E8AF34';
const SILVER = '#C0C0C0';
const VOID = '#020206';
const DIM = '#0d0d14';

// ─── Command parser ────────────────────────────────────
const CMDS = {
  help: { usage: 'help', desc: 'Display this divine command list', minTier: 0 },
  status: { usage: 'status', desc: 'Display covenant and network status', minTier: 0 },
  load: { usage: 'load covenant:<tx_id>', desc: 'Load a covenant by transaction ID', minTier: 1 },
  template: { usage: 'apply template:<id> [--divine]', desc: 'Apply a template from the 308+ pantheon', minTier: 1 },
  templates: { usage: 'templates [category]', desc: 'List available templates (optional category filter)', minTier: 0 },
  import: { usage: 'import designer-export', desc: 'Paste and apply a VisualDesigner JSON export', minTier: 2 },
  visualize: { usage: 'visualize live', desc: 'Toggle live WYSIWYG preview of current config', minTier: 1 },
  infuse: { usage: 'infuse css', desc: 'Inject custom CSS into the covenant page (MAX only)', minTier: 2 },
  export: { usage: 'export html [--eternal]', desc: 'Export current design as standalone HTML', minTier: 1 },
  verify: { usage: 'verify sig', desc: 'Verify a cryptographic signature (future)', minTier: 0 },
  history: { usage: 'history', desc: 'Show command history for this session', minTier: 0 },
  clear: { usage: 'clear', desc: 'Clear the terminal screen', minTier: 0 },
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
  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  const isPro = effectiveTierVal >= 2;
  const isMax = effectiveTierVal >= 3;

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
          `${SILVER}Templates:    308+ in pantheon`,
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
          .catch(() => respond('error', `Failed to load covenant: Network error`));
        break;
      }

      case 'apply':
      case 'template': {
        const argStr = args.join(' ');
        const match = argStr.match(/template:(\S+)/);
        if (!match) return respond('error', 'Error: Use: apply template:<id> [--divine]');
        const templateId = match[1];
        const isDivine = argStr.includes('--divine');
        const tmpl = getTemplateById(templateId);
        if (!tmpl) {
          const results = getAllTemplates().filter(t => t.id.includes(templateId) || t.name.toLowerCase().includes(templateId));
          if (results.length > 0) {
            respond('info', `Did you mean:\n${results.slice(0, 5).map(t => `  ${NEON}${t.id}${SILVER} — ${t.name} [${t.category}]`).join('\n')}`);
          } else {
            respond('error', `Template not found: ${templateId}. Use ${NEON}templates${GOLD} to list all.`);
          }
          break;
        }
        respond('success', `Template ${NEON}${tmpl.id}${GOLD} applied: ${tmpl.name}`);
        respond('info', `  Category: ${CATEGORIES[tmpl.category]?.label || tmpl.category} | Players: ${tmpl.players} | Component: ${tmpl.component}`);
        if (isDivine) respond('info', `  ${GOLD}Divine mode activated. Glory to the BlockDAG.`);
        if (onConfigChange) {
          const newCfg = { ...loadedConfig, templateId: tmpl.id, templateCategory: tmpl.category, templateName: tmpl.name };
          setLoadedConfig(newCfg);
          onConfigChange(newCfg);
          setLivePreview(true);
          respond('info', '  Live preview enabled. WYSIWYG active.');
        }
        break;
      }

      case 'templates': {
        const cat = args[0];
        let list;
        if (cat && CATEGORIES[cat]) {
          list = getTemplatesByCategory(cat);
          respond('info', `${GOLD}═══ ${CATEGORIES[cat].label} (${list.length} templates) ═══`);
        } else if (cat) {
          respond('error', `Unknown category: ${cat}. Available: ${Object.keys(CATEGORIES).join(', ')}`);
          break;
        } else {
          list = getAllTemplates();
          respond('info', `${GOLD}═══ DIVINE TEMPLATE PANTHEON (${list.length} total) ═══`);
        }
        if (list) {
          const cats = {};
          list.forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1; });
          Object.entries(cats).forEach(([c, n]) => {
            const catInfo = CATEGORIES[c];
            respond('info', `  ${catInfo?.icon || '📋'} ${catInfo?.label || c}: ${n} templates`);
          });
          respond('muted', `  Use ${NEON}apply template:<id>${SILVER} to activate. ${NEON}templates <category>${SILVER} to drill down.`);
        }
        break;
      }

      case 'import': {
        if (!isPro) return respond('error', `Access denied. ${NEON}import${SILVER} requires PRO tier or above.`);
        respond('info', `${GOLD}Paste your VisualDesigner JSON export below. Type ${NEON}--done${GOLD} on a new line to apply.`);
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
        respond('info', `Generating ${isEternal ? 'eternal' : 'standard'} HTML export...`);
        setTimeout(() => {
          const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${name}</title><style>body{background:#020206;color:#${NEON.slice(1)};font-family:monospace;padding:2rem;margin:0}h1{font-size:1.5rem}pre{background:#0d0d14;padding:1rem;border-radius:0.5rem;border:1px solid ${NEON}30}</style></head><body><h1>⚡ ${name}</h1><pre>Tier: ${tier}\nLocked: ${covenant?.amount_kaspa || 0} KAS\nCategory: ${covenant?.category || 'General'}\nNetwork: Kaspa TN-12\n${isEternal ? 'FORGED IN ETERNAL NEON' : 'Exported via Covex Terminal'}</pre></body></html>`;
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}_${isEternal ? 'eternal' : 'export'}.html`;
          a.click();
          URL.revokeObjectURL(url);
          respond('success', `Exported: ${a.download} ${isEternal ? GOLD + '(Eternal)' : ''}`);
        }, 300);
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
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><Cpu size={10} className="text-[#49EACB]" /> wRPC 17217</span>
          <span className="flex items-center gap-1"><Sparkles size={10} className="text-[#E8AF34]" /> 308+ templates</span>
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
          style={{ background: `linear-gradient(180deg, ${VOID} 0%, ${DIM} 100%)` }}>
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
