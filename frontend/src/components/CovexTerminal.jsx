     1|     1|import { useState, useRef, useCallback, useEffect } from 'react';
     2|     2|import {
     3|     3|  Terminal, Layers, Sparkles, Zap, Shield, Globe,
     4|     4|  Download, Upload, Copy, Trash2, ScrollText, Code2,
     5|     5|  Eye, EyeOff, Server, Gauge, Cpu, FileCode, Braces,
     6|     6|  Diamond, Gem, Crown, ExternalLink, Save, PaintBucket, Settings
     7|     7|} from 'lucide-react';
     8|     8|import CovenantPreview from './CovenantPreview';
     9|     9|
    10|    10|// ─── God-tier styling constants ────────────────────────
    11|    11|const NEON = '#49EACB';
    12|    12|const GOLD = '#E8AF34';
    13|    13|const SILVER = '#C0C0C0';
    14|    14|const VOID = '#020206';
    15|    15|const DIM = '#0d0d14';
    16|    16|
    17|    17|// ─── Command parser ────────────────────────────────────
    18|    18|const CMDS = {
    19|    19|  help: { usage: 'help', desc: 'Display this command list', minTier: 0 },
    20|    20|  status: { usage: 'status', desc: 'Display covenant and network status', minTier: 0 },
    21|    21|  load: { usage: 'load covenant:<tx_id>', desc: 'Load a covenant by transaction ID', minTier: 1 },
    22|    22|  import: { usage: 'import ui-json', desc: 'Paste custom UI code/configuration in JSON format', minTier: 1 },
    23|    23|  configure: { usage: 'configure fee|reusable|claim-pct|top-up', desc: 'Configure covenant parameters: fee%, reusability, claim splits, pot top-ups', minTier: 1 },
    24|    24|  claim: { usage: 'claim zk|oracle|auto', desc: 'Set claim method: ZK proof, trusted oracle, or auto-detect', minTier: 1 },
    25|    25|  visualize: { usage: 'visualize live', desc: 'Toggle live WYSIWYG preview of current config', minTier: 1 },
    26|    26|  infuse: { usage: 'infuse css', desc: 'Inject custom CSS into the covenant page', minTier: 2 },
    27|    27|  export: { usage: 'export html [--eternal]', desc: 'Export current design as standalone HTML', minTier: 1 },
    28|    28|  verify: { usage: 'verify sig', desc: 'Verify a cryptographic signature', minTier: 0 },
    29|    29|  history: { usage: 'history', desc: 'Show command history for this session', minTier: 0 },
    30|    30|  clear: { usage: 'clear', desc: 'Clear the terminal screen', minTier: 0 },
    31|    31|  divine: { usage: 'divine', desc: 'Toggle transcendent Divine Mode', minTier: 3 },
    32|    32|};
    33|    33|
    34|    34|// ─── Banner ASCII art ───────────────────────────────────
    35|    35|const BANNER = `\
    36|    36|  ┌─────────────────────────────────────────────────────────┐
    37|    37|  │  ⚡ COVEX TERMINAL v2.7 — The Celestial Vault ⚡       │
    38|    38|  │  Covenant Command Interface · Kaspa BlockDAG TN-12      │
    39|    39|  │  ${NEON}██╗  ██╗ █████╗ ███████╗██████╗  █████╗ │
    40|    40|  │  ${NEON}██║ ██╔╝██╔══██╗██╔════╝██╔══██╗██╔══██╗│
    41|    41|  │  ${NEON}█████╔╝ ███████║███████╗██████╔╝███████║│
    42|    42|  │  ${NEON}██╔═██╗ ██╔══██║╚════██║██╔═══╝ ██╔══██║│
    43|    43|  │  ${NEON}██║  ██╗██║  ██║███████║██║     ██║  ██║│
    44|    44|  │  ${NEON}╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝│
    45|    45|  │                                                     │
    46|    46|  │  Type ${NEON}help${GOLD} to begin. ${NEON}CTRL+C${GOLD} is disabled here.  │
    47|    47|  └─────────────────────────────────────────────────────────┘`;
    48|    48|
    49|    49|// ─── Sub-components ─────────────────────────────────────
    50|    50|
    51|    51|function TerminalLine({ children, type = 'output' }) {
    52|    52|  const colors = {
    53|    53|    input: 'text-[#49EACB]',
    54|    54|    output: 'text-gray-300',
    55|    55|    error: 'text-red-400',
    56|    56|    info: 'text-[#E8AF34]',
    57|    57|    success: 'text-emerald-400',
    58|    58|    muted: 'text-gray-600',
    59|    59|    prompt: 'text-[#49EACB]',
    60|    60|  };
    61|    61|  return (
    62|    62|    <div className={`font-mono text-xs leading-relaxed whitespace-pre-wrap break-all ${colors[type] || colors.output}`}>
    63|    63|      {children}
    64|    64|    </div>
    65|    65|  );
    66|    66|}
    67|    67|
    68|    68|function ScanlineOverlay() {
    69|    69|  return (
    70|    70|    <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.03]" style={{
    71|    71|      background: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${NEON} 2px, ${NEON} 3px)`
    72|    72|    }} />
    73|    73|  );
    74|    74|}
    75|    75|
    76|    76|export default function CovexTerminal({ covenant, walletAddress, config, onConfigChange, onSave, tier, effectiveTierVal }) {
    77|    77|  const [lines, setLines] = useState([{ type: 'info', text: BANNER }]);
    78|    78|  const [input, setInput] = useState('');
    79|    79|  const [cmdHistory, setCmdHistory] = useState([]);
    80|    80|  const [historyIdx, setHistoryIdx] = useState(-1);
    81|    81|  const [livePreview, setLivePreview] = useState(false);
    82|    82|  const [loadedConfig, setLoadedConfig] = useState(config || {});
    83|    83|  const [divineMode, setDivineMode] = useState(false);
    84|    84|  const terminalRef = useRef(null);
    85|    85|  const inputRef = useRef(null);
    86|    86|
    87|    87|  // ─── Custom UI paste state ────────────────────────────
    88|    88|  const [pasteCode, setPasteCode] = useState('');
    89|    89|  const [saving, setSaving] = useState(false);
    90|    90|  const [savedToast, setSavedToast] = useState(null);
    91|    91|
    92|    92|  const isPro = effectiveTierVal >= 2;
    93|    93|  const isMax = effectiveTierVal >= 3;
    94|    94|
    95|    95|  // ─── Save custom HTML from Studio ──────────────────────
    96|    96|  const handleSaveCustomUI = useCallback(async () => {
    97|    97|    if (!pasteCode.trim()) return;
    98|    98|    setSaving(true);
    99|    99|    try {
   100|   100|      const r = await fetch(`/api/covenants/${encodeURIComponent(covenant?.tx_id)}/custom-ui`, {
   101|   101|        method: 'POST',
   102|   102|        headers: { 'Content-Type': 'application/json' },
   103|   103|        body: JSON.stringify({
   104|   104|          creator_addr: walletAddress || covenant?.creator_addr || '',
   105|   105|          config_json: {
   106|   106|            ...loadedConfig,
   107|   107|            custom_html: pasteCode,
   108|   108|            saved_at: new Date().toISOString(),
   109|   109|          },
   110|   110|        }),
   111|   111|      });
   112|   112|      const d = await r.json();
   113|   113|      if (d.success) {
   114|   114|        setSavedToast('success');
   115|   115|        if (onConfigChange) onConfigChange({ ...loadedConfig, custom_html: pasteCode });
   116|   116|        setLoadedConfig(prev => ({ ...prev, custom_html: pasteCode }));
   117|   117|        setLines(prev => [...prev, { type: 'success', text: 'Custom UI applied! Your covenant now has an interactive interface visible to the public.' }]);
   118|   118|      } else {
   119|   119|        setSavedToast('error');
   120|   120|        setLines(prev => [...prev, { type: 'error', text: `Save failed: ${d.error || 'Unknown error'}` }]);
   121|   121|      }
   122|   122|    } catch (e) {
   123|   123|      setSavedToast('error');
   124|   124|      setLines(prev => [...prev, { type: 'error', text: `Network error: ${e.message}` }]);
   125|   125|    } finally {
   126|   126|      setSaving(false);
   127|   127|      setTimeout(() => setSavedToast(null), 3000);
   128|   128|    }
   129|   129|  }, [pasteCode, covenant, walletAddress, loadedConfig, onConfigChange]);
   130|   130|
   131|   131|  // Sync loadedConfig when parent pushes new config
   132|   132|  useEffect(() => {
   133|   133|    if (config && Object.keys(config).length > 0) {
   134|   134|      setLoadedConfig(config);
   135|   135|    }
   136|   136|  }, [config]);
   137|   137|
   138|   138|  // ─── Auto-scroll ─────────────────────────────────────
   139|   139|  useEffect(() => {
   140|   140|    if (terminalRef.current) {
   141|   141|      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
   142|   142|    }
   143|   143|  }, [lines]);
   144|   144|
   145|   145|  // ─── Focus input on mount and click ──────────────────
   146|   146|  useEffect(() => {
   147|   147|    inputRef.current?.focus();
   148|   148|  }, []);
   149|   149|
   150|   150|  // ─── Command execution engine ────────────────────────
   151|   151|  const execCmd = useCallback((raw) => {
   152|   152|    const input = raw.trim();
   153|   153|    if (!input) return;
   154|   154|
   155|   155|    // Add to history
   156|   156|    setCmdHistory(prev => [...prev, input]);
   157|   157|    setHistoryIdx(-1);
   158|   158|
   159|   159|    // Add input line
   160|   160|    setLines(prev => [...prev, { type: 'input', text: `${GOLD}covex${NEON} > ${input}` }]);
   161|   161|
   162|   162|    // Parse command
   163|   163|    const parts = input.split(/\s+/);
   164|   164|    const cmd = parts[0].toLowerCase();
   165|   165|    const args = parts.slice(1);
   166|   166|
   167|   167|    const respond = (type, text) => {
   168|   168|      setLines(prev => [...prev, { type, text }]);
   169|   169|    };
   170|   170|
   171|   171|    switch (cmd) {
   172|   172|      case 'help': {
   173|   173|        const lines = [`${GOLD}══════ DIVINE COMMANDS ══════`];
   174|   174|        Object.entries(CMDS).forEach(([name, meta]) => {
   175|   175|          const locked = meta.minTier > effectiveTierVal;
   176|   176|          const prefix = locked ? '🔒 ' : '  ';
   177|   177|          lines.push(`${prefix}${NEON}${meta.usage.padEnd(36)}${GOLD} :: ${meta.desc}${locked ? ` ${SILVER}(requires ${['','CREATOR','PRO','MAX'][meta.minTier]})` : ''}`);
   178|   178|        });
   179|   179|        lines.push(`${GOLD}═══════════════════════════`);
   180|   180|        respond('info', lines.join('\n'));
   181|   181|        break;
   182|   182|      }
   183|   183|
   184|   184|      case 'status':
   185|   185|        respond('info', [
   186|   186|          `${GOLD}═══ COVEX STATUS ═══`,
   187|   187|          `${SILVER}Covenant:     ${covenant?.name || (covenant?.tx_id || 'N/A').slice(0, 16)}...`,
   188|   188|          `${SILVER}Tier:         ${tier}`,
   189|   189|          `${SILVER}Locked KAS:   ${(covenant?.amount_kaspa || 0).toLocaleString()} KAS`,
   190|   190|          `${SILVER}Category:     ${covenant?.category || 'General'}`,
   191|   191|          `${SILVER}Network:      Kaspa Testnet-12 (Toccata)`,
   192|   192|          `${SILVER}Node:         Connected via wRPC on port 17217`,
   193|   193|          `${SILVER}Session:      Active`,
   194|   194|        ].join('\n'));
   195|   195|        break;
   196|   196|
   197|   197|      case 'load': {
   198|   198|        const idArg = args.join(' ');
   199|   199|        const match = idArg.match(/covenant:(\S+)/);
   200|   200|        if (!match) return respond('error', 'Error: Invalid syntax. Use: load covenant:<tx_id>');
   201|   201|        const txId = match[1];
   202|   202|        respond('info', `Loading covenant ${txId}...`);
   203|   203|        fetch(`/api/covenants/${encodeURIComponent(txId)}`)
   204|   204|          .then(r => r.json())
   205|   205|          .then(d => {
   206|   206|            if (d.success && d.covenant) {
   207|   207|              respond('success', `Covenant loaded: ${d.covenant.name || txId.slice(0, 12)}...`);
   208|   208|              respond('info', `  Type: ${d.covenant.covenant_type} | Tier: ${d.covenant.verified_tier || 'FREE'} | Locked: ${d.covenant.amount_kaspa} KAS`);
   209|   209|            } else {
   210|   210|              respond('error', `Covenant not found: ${txId}`);
   211|   211|            }
   212|   212|          })
   213|   213|          .catch(() => respond('error', 'Failed to load covenant: Network error'));
   214|   214|        break;
   215|   215|      }
   216|   216|
   217|   217|      case 'import': {
   218|   218|        respond('info', `${GOLD}Paste your custom UI JSON configuration below. Type ${NEON}--done${GOLD} on a new line to apply.`);
   219|   219|        setLines(prev => [...prev, { type: 'input', text: `${GOLD}covex${NEON} > (paste mode — type ${NEON}--done${GOLD} to finish)` }]);
   220|   220|        // Multi-line paste mode
   221|   221|        const pasteHandler = (e) => {
   222|   222|          if (e.key === 'Enter') {
   223|   223|            const val = inputRef.current?.value || '';
   224|   224|            if (val.trim() === '--done') {
   225|   225|              respond('success', 'JSON import parsed. Applying configuration...');
   226|   226|              try {
   227|   227|                const parsed = JSON.parse(pasteBuffer.current);
   228|   228|                if (onConfigChange) {
   229|   229|                  onConfigChange(parsed);
   230|   230|                  setLoadedConfig(parsed);
   231|   231|                  setLivePreview(true);
   232|   232|                  respond('info', '  Design imported. Live preview active.');
   233|   233|                }
   234|   234|              } catch (err) {
   235|   235|                respond('error', `Invalid JSON: ${err.message}`);
   236|   236|              }
   237|   237|              // Remove paste mode listener
   238|   238|              document.removeEventListener('keydown', pasteHandler, true);
   239|   239|            } else {
   240|   240|              pasteBuffer.current += val;
   241|   241|            }
   242|   242|            inputRef.current.value = '';
   243|   243|          }
   244|   244|        };
   245|   245|        pasteBuffer.current = '';
   246|   246|        document.addEventListener('keydown', pasteHandler, true);
   247|   247|        break;
   248|   248|      }
   249|   249|
   250|   250|      // ─── NEW: Covenant configuration commands ──────────
   251|   251|
   252|   252|      case 'configure': {
   253|   253|        const sub = args[0];
   254|   254|        if (!sub) {
   255|   255|          respond('info', [
   256|   256|            `${GOLD}═══ CONFIGURE COVENANT ═══`,
   257|   257|            `${SILVER}Usage: ${NEON}configure fee <0-100>${SILVER}  — Set fee percentage kept in covenant on claim`,
   258|   258|            `${SILVER}Usage: ${NEON}configure reusable${SILVER}     — Toggle single-use / reusable mode`,
   259|   259|            `${SILVER}Usage: ${NEON}configure claim-pct <0-100>${SILVER} — Set winner's claim percentage (rest stays)`,
   260|   260|            `${SILVER}Usage: ${NEON}configure top-up${SILVER}        — Toggle new player pot top-up`,
   261|   261|            ``,
   262|   262|            `${SILVER}Current: Fee=${loadedConfig.fee || 0}% | ${loadedConfig.reusable ? 'Reusable' : 'Single-use'} | Claim=${loadedConfig.claimPct || 100}% | Top-up: ${loadedConfig.allowTopUp ? 'ON' : 'OFF'}`,
   263|   263|          ].join('\\n'));
   264|   264|          break;
   265|   265|        }
   266|   266|        if (sub === 'fee') {
   267|   267|          const val = parseInt(args[1]);
   268|   268|          if (isNaN(val) || val < 0 || val > 100) return respond('error', 'Error: fee must be a number between 0 and 100');
   269|   269|          if (val > 5) respond('info', `${GOLD}Note: Reasonable maximum is 5%. Values above this may be rejected by the covenant.`);
   270|   270|          const newCfg = { ...loadedConfig, fee: val };
   271|   271|          setLoadedConfig(newCfg);
   272|   272|          if (onConfigChange) onConfigChange(newCfg);
   273|   273|          respond('success', `Fee configured: ${NEON}${val}%${GOLD} kept in covenant on every claim.`);
   274|   274|        } else if (sub === 'reusable') {
   275|   275|          const newVal = !loadedConfig.reusable;
   276|   276|          const newCfg = { ...loadedConfig, reusable: newVal };
   277|   277|          setLoadedConfig(newCfg);
   278|   278|          if (onConfigChange) onConfigChange(newCfg);
   279|   279|          respond('success', newVal ? 'Covenant set to reusable mode. Multiple independent game sessions allowed.' : 'Covenant set to single-use mode.');
   280|   280|        } else if (sub === 'claim-pct') {
   281|   281|          const val = parseInt(args[1]);
   282|   282|          if (isNaN(val) || val < 0 || val > 100) return respond('error', 'Error: claim percentage must be 0-100');
   283|   283|          const newCfg = { ...loadedConfig, claimPct: val };
   284|   284|          setLoadedConfig(newCfg);
   285|   285|          if (onConfigChange) onConfigChange(newCfg);
   286|   286|          respond('success', `Claim percentage: Winner takes ${NEON}${val}%${GOLD}, ${100 - val}% stays in covenant.`);
   287|   287|        } else if (sub === 'top-up') {
   288|   288|          const newVal = !loadedConfig.allowTopUp;
   289|   289|          const newCfg = { ...loadedConfig, allowTopUp: newVal };
   290|   290|          setLoadedConfig(newCfg);
   291|   291|          if (onConfigChange) onConfigChange(newCfg);
   292|   292|          respond('success', newVal ? 'Pot top-up enabled. New players can add funds at any time.' : 'Pot top-up disabled. Only initial deposit permitted.');
   293|   293|        } else {
   294|   294|          respond('error', `Unknown config option: ${sub}. Use: fee, reusable, claim-pct, or top-up.`);
   295|   295|        }
   296|   296|        break;
   297|   297|      }
   298|   298|
   299|   299|      case 'claim': {
   300|   300|        const method = args[0];
   301|   301|        if (!method || !['zk', 'oracle', 'auto'].includes(method)) {
   302|   302|          respond('info', [
   303|   303|            `${GOLD}═══ CLAIM METHOD ═══`,
   304|   304|            `${SILVER}Usage: ${NEON}claim zk${SILVER}      — Full ZK proof verification (RISC Zero zkVM)`,
   305|   305|            `${SILVER}Usage: ${NEON}claim oracle${SILVER}  — Trusted oracle signed outcome (fallback)`,
   306|   306|            `${SILVER}Usage: ${NEON}claim auto${SILVER}    — Auto-detect (ZK first, fallback to oracle)`,
   307|   307|            ``,
   308|   308|            `${SILVER}Current: ${loadedConfig.claimMethod || 'auto'}`,
   309|   309|          ].join('\\n'));
   310|   310|          break;
   311|   311|        }
   312|   312|        const newCfg = { ...loadedConfig, claimMethod: method };
   313|   313|        setLoadedConfig(newCfg);
   314|   314|        if (onConfigChange) onConfigChange(newCfg);
   315|   315|        const desc = method === 'zk' ? 'ZK proof (RISC Zero zkVM + Groth16) — fully trustless' :
   316|   316|                     method === 'oracle' ? 'Trusted oracle (signed outcome) — instant UX fallback' :
   317|   317|                     'Auto-detect: ZK first, fallback to oracle';
   318|   318|        respond('success', `Claim method set: ${NEON}${method}${GOLD} — ${desc}`);
   319|   319|        break;
   320|   320|      }
   321|   321|
   322|   322|      case 'visualize': {
   323|   323|        setLivePreview(prev => !prev);
   324|   324|        respond('success', livePreview ? 'Live preview: OFF' : 'Live preview: ON — WYSIWYG rendering active');
   325|   325|        break;
   326|   326|      }
   327|   327|
   328|   328|      case 'infuse': {
   329|   329|        if (!isMax) return respond('error', `Access denied. ${NEON}infuse${SILVER} requires MAX tier. Ascend to MAX to wield custom CSS.`);
   330|   330|        respond('info', `${GOLD}Enter custom CSS (MAX tier). Type ${NEON}--done${GOLD} on a new line to infuse.`);
   331|   331|        const cssHandler = (e) => {
   332|   332|          if (e.key === 'Enter') {
   333|   333|            const val = inputRef.current?.value || '';
   334|   334|            if (val.trim() === '--done') {
   335|   335|              const css = cssBuffer.current;
   336|   336|              if (onConfigChange) {
   337|   337|                const newCfg = { ...loadedConfig, customCSS: css };
   338|   338|                setLoadedConfig(newCfg);
   339|   339|                onConfigChange(newCfg);
   340|   340|                respond('success', `Custom CSS infused (${css.length} chars). Applied to covenant.`);
   341|   341|              }
   342|   342|              document.removeEventListener('keydown', cssHandler, true);
   343|   343|            } else {
   344|   344|              cssBuffer.current += val + '\n';
   345|   345|            }
   346|   346|            inputRef.current.value = '';
   347|   347|          }
   348|   348|        };
   349|   349|        cssBuffer.current = '';
   350|   350|        document.addEventListener('keydown', cssHandler, true);
   351|   351|        break;
   352|   352|      }
   353|   353|
   354|   354|      case 'export': {
   355|   355|        const isEternal = args.includes('--eternal');
   356|   356|        const name = loadedConfig?.titleOverride || covenant?.name || 'Covenant';
   357|   357|        const pc = loadedConfig?.primaryColor || '#49EACB';
   358|   358|        const border = loadedConfig?.borderRadius || '0.75rem';
   359|   359|        const pad = loadedConfig?.padding === 'compact' ? '12px' : loadedConfig?.padding === 'spacious' ? '32px' : '20px';
   360|   360|        const bg = loadedConfig?.bgStyle === 'dark' ? '#0A0A0D' : loadedConfig?.bgStyle === 'glass' ? 'rgba(255,255,255,0.03)' : '#111116';
   361|   361|        respond('info', `Forging ${isEternal ? 'Eternal Covenant' : 'export'} for ${name}...`);
   362|   362|        setTimeout(() => {
   363|   363|          const html = `<!DOCTYPE html>
   364|   364|<html lang="en">
   365|   365|<head>
   366|   366|<meta charset="UTF-8">
   367|   367|<meta name="viewport" content="width=device-width, initial-scale=1.0">
   368|   368|<title>${isEternal ? '⚡ ETERNAL ' : ''}${name} — Covex Covenant</title>
   369|   369|<style>
   370|   370|  * { box-sizing:border-box;margin:0;padding:0; }
   371|   371|  body { min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;
   372|   372|    background:${isEternal ? `radial-gradient(ellipse at 50% 0%, ${pc}08, transparent 60%), ` : ''}#020206;
   373|   373|    font-family:${loadedConfig?.font === 'mono' ? 'monospace' : loadedConfig?.font === 'serif' ? 'serif' : 'sans-serif'};
   374|   374|    color:#e5e5e5;
   375|   375|  }
   376|   376|  ${isEternal ? 'body::before{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent,transparent 2px,' + pc + '08 2px,' + pc + '08 3px);z-index:999;}' : ''}
   377|   377|  .card { max-width:540px;width:100%;padding:${pad};border-radius:${border};background:${bg};
   378|   378|    border:1px solid ${pc}40;${loadedConfig?.showGlow ? `box-shadow:0 0 20px ${pc}30,0 4px 12px rgba(0,0,0,0.3);` : ''} }
   379|   379|  .badge { text-align:center;padding:0.5rem 0;margin-bottom:1rem;border-radius:0.5rem;
   380|   380|    font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;
   381|   381|    background:${pc}20;color:${pc};border:1px solid ${pc}40; }
   382|   382|  .title { font-weight:700;font-size:1.2rem;margin-bottom:0.25rem;color:#fff; }
   383|   383|  .subtitle { color:#6b7280;font-size:0.65rem;font-family:monospace;margin-bottom:1rem; }
   384|   384|  .desc { color:#9ca3af;font-size:0.75rem;margin-bottom:1rem;line-height:1.6; }
   385|   385|  .grid { display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1rem; }
   386|   386|  .stat { padding:0.6rem;border-radius:0.5rem;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05); }
   387|   387|  .stat-label { color:#6b7280;font-size:0.6rem;text-transform:uppercase; }
   388|   388|  .stat-val { font-size:0.75rem;font-weight:700;font-family:monospace;color:${pc}; }
   389|   389|  .btn { width:100%;padding:0.6rem;border-radius:0.5rem;background:${pc};color:#000;font-weight:700;
   390|   390|    font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;border:none;cursor:pointer;
   391|   391|    box-shadow:0 0 15px ${pc}30;transition:all 0.2s; }
   392|   392|  .btn:hover { box-shadow:0 0 30px ${pc}60; }
   393|   393|  .footer { text-align:center;margin-top:1rem;font-size:0.6rem;color:#555;font-family:monospace; }
   394|   394|  ${isEternal ? '.glow-text { text-shadow:0 0 10px ' + pc + '80,0 0 30px ' + pc + '40; }' : ''}
   395|   395|  ${loadedConfig?.customCSS || ''}
   396|   396|</style>
   397|   397|</head>
   398|   398|<body>
   399|   399|<div class="card">
   400|   400|  ${loadedConfig?.featureBadge ? '<div class="badge">' + loadedConfig.featureBadge + '</div>' : ''}
   401|   401|  ${loadedConfig?.logoUrl ? '<div style="text-align:center;margin-bottom:1rem"><img src="' + loadedConfig.logoUrl + '" alt="logo" style="height:2.5rem;object-fit:contain"></div>' : ''}
   402|   402|  <div class="title${isEternal ? ' glow-text' : ''}">${name}</div>
   403|   403|  <div class="subtitle">${(covenant?.tx_id || '').slice(0, 16)}... — ${isEternal ? 'FORGED IN ETERNAL NEON' : 'Covex Covenant'}</div>
   404|   404|  <div class="desc">${loadedConfig?.descOverride || covenant?.description || 'Covenant deployed on the Kaspa BlockDAG TN-12.'}</div>
   405|   405|  <div class="grid">
   406|   406|    <div class="stat"><div class="stat-label">Locked KAS</div><div class="stat-val">${(covenant?.amount_kaspa || 0).toLocaleString()} KAS</div></div>
   407|   407|    <div class="stat"><div class="stat-label">Type</div><div class="stat-val" style="color:#d1d5db">${covenant?.covenant_type || 'P2SH'}</div></div>
   408|   408|    <div class="stat"><div class="stat-label">Tier</div><div class="stat-val">${tier}</div></div>
   409|   409|    <div class="stat"><div class="stat-label">Category</div><div class="stat-val" style="color:#d1d5db">${covenant?.category || 'General'}</div></div>
   410|   410|  </div>
   411|   411|  ${covenant?.script_hash ? '<div style="margin-bottom:0.75rem;padding:0.5rem;border-radius:0.5rem;background:rgba(0,0,0,0.4);font-family:monospace;font-size:0.6rem;word-break:break-all"><span style="color:#6b7280">Script:</span> <span style="color:' + pc + '">' + covenant.script_hash.slice(0, 32) + '...</span></div>' : ''}
   412|   412|  ${covenant?.creator_addr ? '<div style="margin-bottom:0.75rem;padding:0.5rem;border-radius:0.5rem;background:rgba(0,0,0,0.4);font-family:monospace;font-size:0.6rem"><span style="color:#6b7280">Creator:</span> <span style="color:#d1d5db">' + covenant.creator_addr.slice(0, 20) + '...</span></div>' : ''}
   413|   413|  <button class="btn" onclick="window.open('${window.location.origin}','_blank')">${isEternal ? '⚡ View Eternal Covenant on Covex' : 'View on Covex'}</button>
   414|   414|  <div class="footer">${isEternal ? 'Forged in Eternal Neon · Covex Terminal · Kaspa BlockDAG TN-12' : 'Generated by Covex Terminal · Kaspa BlockDAG TN-12'}</div>
   415|   415|</div>
   416|   416|</body>
   417|   417|</html>`;
   418|   418|          const blob = new Blob([html], { type: 'text/html' });
   419|   419|          const url = URL.createObjectURL(blob);
   420|   420|          const a = document.createElement('a');
   421|   421|          a.href = url;
   422|   422|          a.download = `${name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}_${isEternal ? 'eternal_covenant' : 'covex_export'}.html`;
   423|   423|          a.click();
   424|   424|          URL.revokeObjectURL(url);
   425|   425|          respond('success', `⚡ ${isEternal ? 'Eternal Covenant' : 'Export'} forged: ${a.download}`);
   426|   426|        }, 400);
   427|   427|        break;
   428|   428|      }
   429|   429|
   430|   430|      case 'verify':
   431|   431|        respond('info', `${SILVER}Signature verification gateway initializing...`);
   432|   432|        respond('muted', '  Feature: On-chain signature verification. Connect wallet and provide signature to verify.');
   433|   433|        break;
   434|   434|
   435|   435|      case 'history':
   436|   436|        if (cmdHistory.length === 0) return respond('muted', 'No commands yet in this session.');
   437|   437|        respond('info', cmdHistory.map((c, i) => `  ${String(i + 1).padStart(3)}  ${c}`).join('\n'));
   438|   438|        break;
   439|   439|
   440|   440|      case 'clear':
   441|   441|        setLines([{ type: 'info', text: BANNER }]);
   442|   442|        break;
   443|   443|
   444|   444|      case 'divine': {
   445|   445|        if (!isMax) return respond('error', `Access denied. ${NEON}divine${SILVER} mode requires MAX tier. Ascend to MAX to wield transcendent power.`);
   446|   446|        setDivineMode(prev => !prev);
   447|   447|        respond('success', divineMode
   448|   448|          ? `${SILVER}Divine Mode: ${NEON}OFF${SILVER}. Returning to mortal realms.`
   449|   449|          : `${GOLD}DIVINE MODE: ${NEON}ACTIVATED${GOLD}. Volumetric bloom, particle streams, unlimited effects unleashed. You are now commanding digital reality itself.`
   450|   450|        );
   451|   451|        break;
   452|   452|      }
   453|   453|
   454|   454|      default:
   455|   455|        // Suggest nearest commands
   456|   456|        const suggestions = Object.keys(CMDS).filter(c => c.startsWith(cmd) || cmd.startsWith(c));
   457|   457|        if (suggestions.length > 0) {
   458|   458|          respond('error', `Unknown command: ${cmd}. Did you mean: ${suggestions.map(s => NEON + s).join(', ')}?`);
   459|   459|        } else {
   460|   460|          respond('error', `Unknown command: ${cmd}. Type ${NEON}help${GOLD} for available commands.`);
   461|   461|        }
   462|   462|    }
   463|   463|  }, [lines, livePreview, loadedConfig, effectiveTierVal, tier, covenant, onConfigChange, cmdHistory, isPro, isMax]);
   464|   464|
   465|   465|  const pasteBuffer = useRef('');
   466|   466|  const cssBuffer = useRef('');
   467|   467|
   468|   468|  // ─── Input handler ────────────────────────────────────
   469|   469|  const handleKeyDown = useCallback((e) => {
   470|   470|    if (e.key === 'Enter') {
   471|   471|      execCmd(e.target.value);
   472|   472|      e.target.value = '';
   473|   473|    } else if (e.key === 'ArrowUp') {
   474|   474|      e.preventDefault();
   475|   475|      if (cmdHistory.length > 0) {
   476|   476|        const newIdx = historyIdx === -1 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1);
   477|   477|        setHistoryIdx(newIdx);
   478|   478|        e.target.value = cmdHistory[newIdx];
   479|   479|      }
   480|   480|    } else if (e.key === 'ArrowDown') {
   481|   481|      e.preventDefault();
   482|   482|      if (historyIdx >= 0) {
   483|   483|        const newIdx = historyIdx + 1;
   484|   484|        if (newIdx >= cmdHistory.length) {
   485|   485|          setHistoryIdx(-1);
   486|   486|          e.target.value = '';
   487|   487|        } else {
   488|   488|          setHistoryIdx(newIdx);
   489|   489|          e.target.value = cmdHistory[newIdx];
   490|   490|        }
   491|   491|      }
   492|   492|    }
   493|   493|  }, [execCmd, cmdHistory, historyIdx]);
   494|   494|
   495|   495|  return (
   496|   496|    <div className="flex flex-col gap-3 w-full">
   497|   497|      {/* ═════ TOP BAR ═════ */}
   498|   498|      <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#49EACB]/[0.04] border border-[#49EACB]/[0.08]">
   499|   499|        <div className="flex items-center gap-2">
   500|   500|          <Diamond size={16} className="text-[#49EACB]" />
   501|   501|          <span className="text-sm font-semibold text-white tracking-wide">Covex Terminal</span>
   502|   502|          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#49EACB]/10 text-[#49EACB] border border-[#49EACB]/20">{tier}</span>
   503|   503|          {divineMode && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#E8AF34]/10 text-[#E8AF34] border border-[#E8AF34]/20 animate-pulse">DIVINE</span>}
   504|   504|        </div>
   505|   505|        <div className="flex items-center gap-3 text-[10px] text-gray-500">
   506|   506|          <span className="flex items-center gap-1"><Cpu size={10} className="text-[#49EACB]" /> wRPC 17217</span>
   507|   507|          <span className="flex items-center gap-1"><Sparkles size={10} className="text-[#E8AF34]" /> Custom UI deploy</span>
   508|   508|          <span className="flex items-center gap-1">
   509|   509|            <span className="relative inline-flex h-1.5 w-1.5">
   510|   510|              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#49EACB] opacity-75" />
   511|   511|              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#49EACB]" />
   512|   512|            </span>
   513|   513|            Active
   514|   514|          </span>
   515|   515|        </div>
   516|   516|      </div>
   517|   517|
   518|   518|      {/* ═════ COVENANT STUDIO SECTION ═════ */}
   519|   519|      {effectiveTierVal >= 1 && (
   520|   520|        <div className="rounded-xl border border-[#E8AF34]/20 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(232,175,52,0.06), rgba(232,175,52,0.01))' }}>
   521|   521|          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8AF34]/10">
   522|   522|            <PaintBucket size={15} className="text-[#E8AF34]" />
   523|   523|            <div className="flex-1">
   524|   524|              <span className="text-xs font-semibold text-[#E8AF34]">Covenant Studio Integration</span>
   525|   525|              <p className="text-[10px] text-gray-500 mt-0.5">Design your covenant UI in the Studio, then paste the code below to make it live.</p>
   526|   526|            </div>
   527|   527|            <a
   528|   528|              href="http://localhost:3001"
   529|   529|              target="_blank"
   530|   530|              rel="noopener noreferrer"
   531|   531|              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E8AF34] text-black text-[10px] font-bold hover:bg-[#f0c040] transition-all shadow-[0_0_12px_rgba(232,175,52,0.3)] active:scale-95"
   532|   532|            >
   533|   533|              <ExternalLink size={12} />
   534|   534|              Open Covenant Studio
   535|   535|            </a>
   536|   536|          </div>
   537|   537|          <div className="p-4 space-y-3">
   538|   538|            <div>
   539|   539|              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
   540|   540|                Paste code generated from Covenant Studio here:
   541|   541|              </label>
   542|   542|              <textarea
   543|   543|                value={pasteCode}
   544|   544|                onChange={(e) => setPasteCode(e.target.value)}
   545|   545|                placeholder={`<!-- Paste your full HTML + JS + CSS code from Covenant Studio -->\n<!-- This will become the interactive face of your covenant -->`}
   546|   546|                rows={8}
   547|   547|                className="w-full rounded-lg border border-[#49EACB]/10 bg-black/60 text-[#49EACB] text-xs font-mono p-3 resize-y outline-none focus:border-[#49EACB]/30 placeholder:text-[#49EACB]/15"
   548|   548|                style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}
   549|   549|              />
   550|   550|            </div>
   551|   551|            <div className="flex items-center gap-2">
   552|   552|              <button
   553|   553|                onClick={handleSaveCustomUI}
   554|   554|                disabled={saving || !pasteCode.trim()}
   555|   555|                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#49EACB] text-black text-xs font-bold hover:bg-[#3cd8b6] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(73,234,203,0.25)] active:scale-95"
   556|   556|              >
   557|   557|                <Save size={13} />
   558|   558|                {saving ? 'Saving...' : 'Apply Custom UI'}
   559|   559|              </button>
   560|   560|              <button
   561|   561|                onClick={() => { setPasteCode(''); setSavedToast(null); }}
   562|   562|                className="px-3 py-2 rounded-lg border border-white/10 text-gray-500 text-xs hover:text-gray-300 hover:border-white/20 transition-colors"
   563|   563|              >
   564|   564|                Clear
   565|   565|              </button>
   566|   566|              {savedToast === 'success' && (
   567|   567|                <span className="text-[10px] text-emerald-400 font-semibold animate-in fade-in">Custom UI applied & live!</span>
   568|   568|              )}
   569|   569|              {savedToast === 'error' && (
   570|   570|                <span className="text-[10px] text-red-400 font-semibold animate-in fade-in">Save failed — check console</span>
   571|   571|              )}
   572|   572|            </div>
   573|   573|          </div>
   574|   574|        </div>
   575|   575|      )}
   576|   576|
   577|   577|{/* ═════ QUICK CONFIGURATION PANEL (paid only) ═════ */}
      {effectiveTierVal >= 1 && (
        <div className="rounded-xl border border-[#49EACB]/15 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(73,234,203,0.04), rgba(73,234,203,0.00))' }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#49EACB]/10">
            <Settings size={15} className="text-[#49EACB]" />
            <div className="flex-1">
              <span className="text-xs font-semibold text-[#49EACB]">Covenant Configuration</span>
              <p className="text-[10px] text-gray-500 mt-0.5">Name, description, fee, reusability, and claim method for your covenant.</p>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Covenant Name</label>
                <input
                  type="text"
                  value={loadedConfig.covenantName || ''}
                  onChange={(e) => {
                    const cfg = { ...loadedConfig, covenantName: e.target.value };
                    setLoadedConfig(cfg);
                    if (onConfigChange) onConfigChange(cfg);
                  }}
                  placeholder="e.g. Grandmaster Chess Challenge"
                  className="w-full rounded-lg border border-[#49EACB]/10 bg-black/50 text-white text-xs p-2.5 outline-none focus:border-[#49EACB]/30 placeholder:text-gray-600"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Public Description</label>
                <textarea
                  value={loadedConfig.description || ''}
                  onChange={(e) => {
                    const cfg = { ...loadedConfig, description: e.target.value };
                    setLoadedConfig(cfg);
                    if (onConfigChange) onConfigChange(cfg);
                  }}
                  rows={3}
                  placeholder="Describe what your covenant does..."
                  className="w-full rounded-lg border border-[#49EACB]/10 bg-black/50 text-white text-xs p-2.5 outline-none focus:border-[#49EACB]/30 placeholder:text-gray-600 resize-y"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Fee % (0-100)</label>
                  <input
                    type="number" min="0" max="100"
                    value={loadedConfig.fee || 0}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                      const cfg = { ...loadedConfig, fee: val };
                      setLoadedConfig(cfg);
                      if (onConfigChange) onConfigChange(cfg);
                    }}
                    className="w-full rounded-lg border border-[#49EACB]/10 bg-black/50 text-white text-xs p-2.5 outline-none focus:border-[#49EACB]/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Claim % (0-100)</label>
                  <input
                    type="number" min="0" max="100"
                    value={loadedConfig.claimPct || 100}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                      const cfg = { ...loadedConfig, claimPct: val };
                      setLoadedConfig(cfg);
                      if (onConfigChange) onConfigChange(cfg);
                    }}
                    className="w-full rounded-lg border border-[#49EACB]/10 bg-black/50 text-white text-xs p-2.5 outline-none focus:border-[#49EACB]/30"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Reusability</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const cfg = { ...loadedConfig, reusable: false };
                      setLoadedConfig(cfg);
                      if (onConfigChange) onConfigChange(cfg);
                    }}
                    className={`flex-1 py-2 rounded-lg border text-[11px] font-semibold transition-all ${
                      !loadedConfig.reusable
                        ? 'border-[#49EACB]/50 bg-[#49EACB]/10 text-[#49EACB]'
                        : 'border-white/10 bg-transparent text-gray-500 hover:border-white/20'
                    }`}
                  >Single-use</button>
                  <button
                    onClick={() => {
                      const cfg = { ...loadedConfig, reusable: true };
                      setLoadedConfig(cfg);
                      if (onConfigChange) onConfigChange(cfg);
                    }}
                    className={`flex-1 py-2 rounded-lg border text-[11px] font-semibold transition-all ${
                      loadedConfig.reusable
                        ? 'border-[#E8AF34]/50 bg-[#E8AF34]/10 text-[#E8AF34]'
                        : 'border-white/10 bg-transparent text-gray-500 hover:border-white/20'
                    }`}
                  >Reusable</button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Pot Top-up</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const cfg = { ...loadedConfig, allowTopUp: false };
                      setLoadedConfig(cfg);
                      if (onConfigChange) onConfigChange(cfg);
                    }}
                    className={`flex-1 py-2 rounded-lg border text-[11px] font-semibold transition-all ${
                      !loadedConfig.allowTopUp
                        ? 'border-[#49EACB]/50 bg-[#49EACB]/10 text-[#49EACB]'
                        : 'border-white/10 bg-transparent text-gray-500 hover:border-white/20'
                    }`}
                  >Fixed Pot</button>
                  <button
                    onClick={() => {
                      const cfg = { ...loadedConfig, allowTopUp: true };
                      setLoadedConfig(cfg);
                      if (onConfigChange) onConfigChange(cfg);
                    }}
                    className={`flex-1 py-2 rounded-lg border text-[11px] font-semibold transition-all ${
                      loadedConfig.allowTopUp
                        ? 'border-[#E8AF34]/50 bg-[#E8AF34]/10 text-[#E8AF34]'
                        : 'border-white/10 bg-transparent text-gray-500 hover:border-white/20'
                    }`}
                  >Allow Top-ups</button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  <Shield size={10} className="inline mr-1" />
                  Claim Method (ZK Proof / Oracle)
                </label>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      const cfg = { ...loadedConfig, claimMethod: 'zk' };
                      setLoadedConfig(cfg);
                      if (onConfigChange) onConfigChange(cfg);
                    }}
                    className={`flex-1 py-2 rounded-lg border text-center transition-all ${
                      (loadedConfig.claimMethod || 'auto') === 'zk'
                        ? 'border-[#A855F7]/60 bg-[#A855F7]/10 text-white'
                        : 'border-white/10 bg-transparent text-gray-500 hover:border-white/20'
                    }`}
                  >
                    <div className={`text-[11px] font-bold ${(loadedConfig.claimMethod || 'auto') === 'zk' ? 'text-[#A855F7]' : ''}`}>ZK Proof</div>
                    <div className="text-[9px] text-gray-500">RISC Zero zkVM</div>
                  </button>
                  <button
                    onClick={() => {
                      const cfg = { ...loadedConfig, claimMethod: 'oracle' };
                      setLoadedConfig(cfg);
                      if (onConfigChange) onConfigChange(cfg);
                    }}
                    className={`flex-1 py-2 rounded-lg border text-center transition-all ${
                      (loadedConfig.claimMethod || 'auto') === 'oracle'
                        ? 'border-[#E8AF34]/60 bg-[#E8AF34]/10 text-white'
                        : 'border-white/10 bg-transparent text-gray-500 hover:border-white/20'
                    }`}
                  >
                    <div className={`text-[11px] font-bold ${(loadedConfig.claimMethod || 'auto') === 'oracle' ? 'text-[#E8AF34]' : ''}`}>Oracle</div>
                    <div className="text-[9px] text-gray-500">Trusted signer</div>
                  </button>
                  <button
                    onClick={() => {
                      const cfg = { ...loadedConfig, claimMethod: 'auto' };
                      setLoadedConfig(cfg);
                      if (onConfigChange) onConfigChange(cfg);
                    }}
                    className={`flex-1 py-2 rounded-lg border text-center transition-all ${
                      (loadedConfig.claimMethod || 'auto') === 'auto'
                        ? 'border-[#49EACB]/60 bg-[#49EACB]/10 text-white'
                        : 'border-white/10 bg-transparent text-gray-500 hover:border-white/20'
                    }`}
                  >
                    <div className={`text-[11px] font-bold ${(loadedConfig.claimMethod || 'auto') === 'auto' ? 'text-[#49EACB]' : ''}`}>Auto</div>
                    <div className="text-[9px] text-gray-500">ZK first</div>
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  if (onSave) onSave(loadedConfig);
                  setLines(prev => [...prev, { type: 'success', text: 'Configuration saved & live!' }]);
                }}
                className="w-full mt-1 py-2 rounded-lg bg-[#49EACB] text-black text-xs font-bold hover:bg-[#3cd8b6] transition-all shadow-[0_0_12px_rgba(73,234,203,0.2)] active:scale-95"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═════ MAIN GRID ═════ */}
   578|   578|      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 min-h-[65vh]">
   579|   579|        {/* ── TERMINAL CONSOLE ─────────────────────────── */}
   580|   580|        <div className="flex flex-col rounded-xl border border-[#49EACB]/10 overflow-hidden relative"
   581|   581|          style={{
   582|   582|            background: `linear-gradient(180deg, ${VOID} 0%, ${DIM} 100%)`,
   583|   583|            ...(divineMode ? { boxShadow: `0 0 40px ${NEON}20, 0 0 80px ${NEON}08, inset 0 0 60px ${NEON}05` } : {}),
   584|   584|          }}>
   585|   585|          <ScanlineOverlay />
   586|   586|          {/* Header */}
   587|   587|          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#49EACB]/10 bg-[#49EACB]/[0.02] z-10">
   588|   588|            <Terminal size={13} className="text-[#49EACB]" />
   589|   589|            <span className="text-[11px] font-semibold text-[#49EACB] font-mono">covex@kaspad:~$</span>
   590|   590|            <div className="ml-auto flex items-center gap-1.5">
   591|   591|              <div className="w-2 h-2 rounded-full bg-[#49EACB]/40" />
   592|   592|              <div className="w-2 h-2 rounded-full bg-[#49EACB]/60" />
   593|   593|              <div className="w-2 h-2 rounded-full bg-[#49EACB]" />
   594|   594|              <span className="text-[9px] text-gray-600 ml-2 font-mono">tn-12</span>
   595|   595|            </div>
   596|   596|          </div>
   597|   597|
   598|   598|          {/* Terminal output */}
   599|   599|          <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 space-y-1 z-10 cursor-text"
   600|   600|            style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}
   601|   601|            onClick={() => inputRef.current?.focus()}>
   602|   602|            {lines.map((line, i) => (
   603|   603|              <TerminalLine key={i} type={line.type}>{line.text}</TerminalLine>
   604|   604|            ))}
   605|   605|          </div>
   606|   606|
   607|   607|          {/* Input line */}
   608|   608|          <div className="flex items-center gap-2 px-4 py-3 border-t border-[#49EACB]/10 bg-[#49EACB]/[0.02] z-10">
   609|   609|            <span className="text-xs font-mono font-bold text-[#E8AF34]">covex</span>
   610|   610|            <span className="text-xs font-mono font-bold text-[#49EACB]">{'>'}</span>
   611|   611|            <input
   612|   612|              ref={inputRef}
   613|   613|              type="text"
   614|   614|              className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-[#49EACB] placeholder:text-[#49EACB]/20"
   615|   615|              placeholder="Type help to begin..."
   616|   616|              onKeyDown={handleKeyDown}
   617|   617|              autoFocus
   618|   618|              spellCheck={false}
   619|   619|              autoComplete="off"
   620|   620|            />
   621|   621|            <span className="text-[9px] text-gray-600 font-mono hidden sm:inline">↑↓ history</span>
   622|   622|          </div>
   623|   623|        </div>
   624|   624|
   625|   625|        {/* ── LIVE PREVIEW PANE ────────────────────────── */}
   626|   626|        <div className="flex flex-col rounded-xl border border-[#E8AF34]/10 overflow-hidden bg-[#E8AF34]/[0.01]">
   627|   627|          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E8AF34]/10">
   628|   628|            <Eye size={13} className={livePreview ? 'text-[#E8AF34]' : 'text-gray-600'} />
   629|   629|            <span className="text-[11px] font-semibold text-white">Live Preview</span>
   630|   630|            <button
   631|   631|              onClick={() => setLivePreview(!livePreview)}
   632|   632|              className={`ml-auto px-2 py-0.5 rounded text-[9px] font-mono transition-colors ${
   633|   633|                livePreview ? 'bg-[#49EACB]/10 text-[#49EACB] border border-[#49EACB]/20' : 'bg-white/[0.02] text-gray-600 border border-white/5'
   634|   634|              }`}
   635|   635|            >
   636|   636|              {livePreview ? 'ON' : 'OFF'}
   637|   637|            </button>
   638|   638|          </div>
   639|   639|          <div className="flex-1 overflow-y-auto p-4">
   640|   640|            {livePreview ? (
   641|   641|              <CovenantPreview config={loadedConfig} covenant={covenant}>
   642|   642|                <div className="mt-3 pt-3 border-t border-[#49EACB]/10">
   643|   643|                  <p className="text-[9px] text-gray-500 mb-2 font-mono">Terminal Session Active</p>
   644|   644|                  <div className="grid grid-cols-2 gap-1.5">
   645|   645|                    {[
   646|   646|                      ['Template', loadedConfig?.templateName || '—'],
   647|   647|                      ['Category', loadedConfig?.templateCategory || '—'],
   648|   648|                      ['Commands', String(cmdHistory.length)],
   649|   649|                      ['CSS', loadedConfig?.customCSS ? `${loadedConfig.customCSS.length} chars` : 'None'],
   650|   650|                    ].map(([k, v]) => (
   651|   651|                      <div key={k} className="p-2 rounded bg-white/[0.02] border border-white/5">
   652|   652|                        <p className="text-[8px] text-gray-500">{k}</p>
   653|   653|                        <p className="text-[10px] text-white font-mono truncate">{v}</p>
   654|   654|                      </div>
   655|   655|                    ))}
   656|   656|                  </div>
   657|   657|                </div>
   658|   658|              </CovenantPreview>
   659|   659|            ) : (
   660|   660|              <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
   661|   661|                <Terminal size={28} className="opacity-30" />
   662|   662|                <p className="text-[11px] text-center font-mono">Live preview OFF</p>
   663|   663|                <p className="text-[9px] text-center">Type <span className="text-[#49EACB]">visualize live</span> to enable</p>
   664|   664|              </div>
   665|   665|            )}
   666|   666|          </div>
   667|   667|
   668|   668|          {/* Quick commands */}
   669|   669|          <div className="flex flex-wrap gap-1 p-2 border-t border-[#E8AF34]/10">
   670|   670|            {[
   671|   671|              { label: 'status', cmd: 'status' },
   672|   672|              { label: 'templates', cmd: 'templates' },
   673|   673|              { label: 'help', cmd: 'help' },
   674|   674|              { label: 'export', cmd: 'export html' },
   675|   675|              { label: 'visualize', cmd: 'visualize live' },
   676|   676|            ].map(({ label, cmd }) => (
   677|   677|              <button
   678|   678|                key={label}
   679|   679|                onClick={() => {
   680|   680|                  setInput(cmd);
   681|   681|                  setTimeout(() => execCmd(cmd), 50);
   682|   682|                }}
   683|   683|                className="px-2 py-1 rounded text-[9px] font-mono bg-white/[0.02] border border-white/5 text-gray-500 hover:text-[#49EACB] hover:border-[#49EACB]/20 transition-colors"
   684|   684|              >
   685|   685|                {label}
   686|   686|              </button>
   687|   687|            ))}
   688|   688|          </div>
   689|   689|        </div>
   690|   690|      </div>
   691|   691|
   692|   692|      {/* ═════ BOTTOM STATUS BAR ═════ */}
   693|   693|      <div className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.01] border border-white/[0.04] text-[9px] font-mono text-gray-600">
   694|   694|        <span className="flex items-center gap-1"><Gauge size={10} /> {cmdHistory.length} commands</span>
   695|   695|        <span className="flex items-center gap-1"><Shield size={10} /> {tier} access</span>
   696|   696|        <span className="flex items-center gap-1"><Globe size={10} /> TN-12 Toccata</span>
   697|   697|        <span className="ml-auto flex items-center gap-1">
   698|   698|          <span className="w-1.5 h-1.5 rounded-full bg-[#49EACB] animate-pulse" />
   699|   699|          Session active
   700|   700|        </span>
   701|   701|      </div>
   702|   702|    </div>
   703|   703|  );
   704|   704|}
   705|   705|