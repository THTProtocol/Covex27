import React, { useMemo, useState, useRef, useCallback } from 'react';

/**
 * ResolutionSimulator — Dual-Reality Payout Desk
 *
 * An accurate, interactive payout simulator for a Covex game/escrow covenant. Every number is
 * derived from the SAME formulas the terminal and backend use, so nothing is fabricated:
 *
 *   pot           = perSideStake * players                         (main.rs: total_pot)
 *   configured    : winner = pot*(100-fee-potReturn)/100,          (CovexTerminal split / SilverScript)
 *                   creatorFee = pot*fee/100, potReturn = pot*potReturn/100
 *   enforced      : winner = pot - networkFee, Covex rake = 0      (main.rs compute_payout: fee=0)
 *   draw          : each side recovers its stake (pot/2)           (SilverScript draw branch)
 *   EV(p)         = p*winnerShare - perSideStake                   (honest algebra, p = YOUR assumed win-rate)
 *   break-even p* = perSideStake / winnerShare
 *
 * The CONFIGURED split is what the SilverScript declares (display model). The ENFORCED reality is
 * what the chain actually does today: the winner receives the whole pot minus the network fee, and
 * Covex takes no percentage. Both are shown side by side so the tool can never overstate any rake.
 */

const KAS = (n, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '-';

// Approximate Kaspa network fee for a single-output spend (labelled estimate, NOT a Covex cut).
const NETWORK_FEE_KAS = 0.0001;

// Hoisted to module scope on purpose: if these were defined inside the component, every
// re-render (e.g. each tick while dragging a slider) would create a new component identity,
// remounting the <input> and KILLING the drag gesture. Stable identity = draggable sliders.
function Stat({ label, value, unit, accent, sub, primary }) {
  return (
    <div className={`hover-lift rounded-xl border px-3 py-2.5 transition ${
      primary
        ? 'border-kaspa-green/45 bg-kaspa-green/[0.07] shadow-[0_0_24px_-8px_rgba(73,234,203,0.55)]'
        : 'border-white/[0.06] light:border-slate-200 bg-white/[0.02] light:bg-slate-50'
    }`}>
      <div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-gray-500 light:text-slate-400 flex items-center gap-1">
        {primary && <span className="w-1.5 h-1.5 rounded-full bg-kaspa-green shadow-[0_0_6px_#49EACB]" />}{label}
      </div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className={`font-black tabular-nums leading-none ${primary ? 'text-xl' : 'text-lg'}`} style={{ color: accent || 'inherit' }}>{value}</span>
        {unit && <span className="text-[10px] font-bold text-gray-400 light:text-slate-500">{unit}</span>}
      </div>
      {sub && <div className="text-[9px] text-gray-500 light:text-slate-400 mt-1 leading-tight">{sub}</div>}
    </div>
  );
}

function Slider({ label, value, set, min, max, step, fmt, accent }) {
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 light:text-slate-500">{label}</span>
        <span className="text-[11px] font-black tabular-nums" style={{ color: accent || '#49EACB' }}>{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full"
        style={{ '--range-accent': accent || '#49EACB', '--range-pct': `${pct}%` }}
      />
    </div>
  );
}

export default function ResolutionSimulator({
  config,
  feePercent,
  potReturnPercent,
  minStake,
  maxStake,
  players,
  perSideStake,
}) {
  // ── Resolve inputs (props > loaded config > documented terminal defaults) ──────────────
  const cfgFee = (config?.resolution?.payoutModel?.feeBasisPoints ?? null);
  const initFee = feePercent ?? (cfgFee != null ? cfgFee / 100 : 2);
  const initPotReturn = potReturnPercent ?? 2;
  const loStake = Math.max(0.0001, minStake ?? 10);
  const hiStake = Math.max(loStake + 1, maxStake ?? 1000);
  const circuit = config?.resolution?.circuit?.type || 'oracle-attested';
  const mode = config?.resolution?.mode || 'hybrid';

  // ── Interactive state (seeded from config, fully live) ─────────────────────────────────
  const [stake, setStake] = useState(() => {
    const seed = perSideStake ?? Math.min(hiStake, Math.max(loStake, 100));
    return Math.min(hiStake, Math.max(loStake, seed));
  });
  const [fee, setFee] = useState(Math.min(5, Math.max(0, initFee)));
  const [potReturn, setPotReturn] = useState(Math.min(10, Math.max(0, initPotReturn)));
  const [nPlayers, setNPlayers] = useState(Math.min(8, Math.max(2, players ?? 2)));
  const [winProb, setWinProb] = useState(50); // YOUR assumed win-rate, %
  const [outcome, setOutcome] = useState('win'); // 'win' | 'draw'
  const [showConfigured, setShowConfigured] = useState(true);

  // ── Computations (100% faithful to the real payout math) ───────────────────────────────
  const m = useMemo(() => {
    const pot = stake * nPlayers;
    const winnerPct = Math.max(0, 100 - fee - potReturn);
    const winnerConfigured = (pot * winnerPct) / 100;
    const creatorFee = (pot * fee) / 100;
    const potReturnAmt = (pot * potReturn) / 100;
    const winnerEnforced = Math.max(0, pot - NETWORK_FEE_KAS); // zero rake, whole pot to winner
    const rakeDelta = creatorFee + potReturnAmt; // configured-vs-enforced gap (NOT taken on-chain)
    const refundEach = pot / 2; // draw branch

    const p = winProb / 100;
    const evConfigured = p * winnerConfigured - stake;
    const evEnforced = p * winnerEnforced - stake;
    const breakevenConfigured = winnerConfigured > 0 ? stake / winnerConfigured : null;
    const breakevenEnforced = winnerEnforced > 0 ? stake / winnerEnforced : null;
    // Multiplier if you win: how many times your stake comes back.
    const multConfigured = stake > 0 ? winnerConfigured / stake : 0;
    const multEnforced = stake > 0 ? winnerEnforced / stake : 0;

    return {
      pot, winnerPct, winnerConfigured, creatorFee, potReturnAmt, winnerEnforced,
      rakeDelta, refundEach, p, evConfigured, evEnforced,
      breakevenConfigured, breakevenEnforced, multConfigured, multEnforced,
    };
  }, [stake, nPlayers, fee, potReturn, winProb]);

  // ── EV-vs-win-probability curve geometry (SVG) ─────────────────────────────────────────
  const W = 680, H = 360, padL = 56, padR = 22, padT = 22, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const evHi = Math.max(m.winnerEnforced - stake, 1) * 1.12;     // EV at p=1 (enforced), +headroom
  const evLo = -stake * 1.12;                                     // EV at p=0 (both lines)
  const xOf = (p) => padL + p * plotW;
  const yOf = (ev) => padT + (1 - (ev - evLo) / (evHi - evLo)) * plotH;
  const lineFor = (winnerShare) => `${xOf(0)},${yOf(0 * winnerShare - stake)} ${xOf(1)},${yOf(1 * winnerShare - stake)}`;
  const enforcedLine = lineFor(m.winnerEnforced);
  const configuredLine = lineFor(m.winnerConfigured);
  const areaEnforced = `${xOf(0)},${yOf(Math.max(evLo, 0))} ${xOf(0)},${yOf(0 * m.winnerEnforced - stake)} ${xOf(1)},${yOf(1 * m.winnerEnforced - stake)} ${xOf(1)},${yOf(Math.max(evLo, 0))}`;
  const yZero = yOf(0);

  // Draggable scrubber over the probability axis.
  const svgRef = useRef(null);
  const onScrub = useCallback((clientX) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W; // map to viewBox space
    const p = Math.min(1, Math.max(0, (px - padL) / plotW));
    setWinProb(Math.round(p * 100));
  }, [plotW]);
  const dragging = useRef(false);

  const gridP = [0, 0.25, 0.5, 0.75, 1];

  // ── Split bar segments (configured display model) ──────────────────────────────────────
  const seg = (v) => `${m.pot > 0 ? (v / m.pot) * 100 : 0}%`;

  const isDraw = outcome === 'draw';

  return (
    <div className="glass-panel detail-hero-enhanced rounded-2xl p-5 text-sm relative overflow-hidden">
      {/* Ambient brand glow, clipped by the panel's overflow-hidden so it stays contained. */}
      <div className="covex-aurora" style={{ top: -40, right: -30, width: 320, height: 220, opacity: 0.4 }} aria-hidden="true" />

      <div className="relative z-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="kicker">Resolution / Payout Simulator</div>
          <div className="text-[11px] text-gray-400 light:text-slate-500 mt-0.5">
            {mode} · circuit: <span className="text-[#49EACB]">{circuit}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-[#49EACB]/40 bg-[#49EACB]/10">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#49EACB] opacity-60 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#49EACB]" />
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-[#49EACB]">On-chain rake 0%</span>
        </div>
      </div>

      {/* Metric rail */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Stat label="Total pot" value={KAS(m.pot)} unit="KAS" accent="#fff" sub={`${nPlayers} × ${KAS(stake)} KAS`} />
        <Stat label="Winner (on-chain)" value={KAS(m.winnerEnforced)} unit="KAS" accent="#49EACB" sub={`${KAS(m.multEnforced, 2)}× your stake`} primary />
        <Stat label="Break-even win-rate" value={m.breakevenEnforced != null ? KAS(m.breakevenEnforced * 100, 1) : '-'} unit="%" accent="#E8AF34" sub={`${nPlayers}-way: 1 / ${nPlayers}`} />
        <Stat label={`Your EV @ ${winProb}%`} value={KAS(m.evEnforced, 2)} unit="KAS" accent={m.evEnforced >= 0 ? '#4ade80' : '#f87171'} sub={isDraw ? 'draw: stake returned' : 'per session'} />
      </div>

      {/* EV curve */}
      <div className="rounded-xl border border-white/[0.06] light:border-slate-200 bg-black/20 light:bg-white p-2 mb-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto select-none touch-none"
          style={{ maxHeight: 320 }}
          onMouseDown={(e) => { dragging.current = true; onScrub(e.clientX); }}
          onMouseMove={(e) => { if (dragging.current) onScrub(e.clientX); }}
          onMouseUp={() => { dragging.current = false; }}
          onMouseLeave={() => { dragging.current = false; }}
          onTouchStart={(e) => { dragging.current = true; onScrub(e.touches[0].clientX); }}
          onTouchMove={(e) => { if (dragging.current) onScrub(e.touches[0].clientX); }}
          onTouchEnd={() => { dragging.current = false; }}
        >
          <defs>
            <linearGradient id="evfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#49EACB" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#49EACB" stopOpacity="0" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* gridlines */}
          {gridP.map((p) => (
            <g key={`gx-${p}`}>
              <line x1={xOf(p)} y1={padT} x2={xOf(p)} y2={H - padB} stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
              <text x={xOf(p)} y={H - padB + 16} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>{Math.round(p * 100)}%</text>
            </g>
          ))}
          {/* zero-EV axis */}
          <line x1={padL} y1={yZero} x2={W - padR} y2={yZero} stroke="rgba(148,163,184,0.45)" strokeWidth="1.25" strokeDasharray="2 3" />
          <text x={padL - 8} y={yZero + 3} textAnchor="end" className="fill-gray-400" style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>0</text>
          <text x={padL - 8} y={yOf(evHi) + 9} textAnchor="end" className="fill-gray-500" style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}>+{KAS(evHi, 0)}</text>
          <text x={padL - 8} y={yOf(evLo) - 2} textAnchor="end" className="fill-gray-500" style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}>{KAS(evLo, 0)}</text>
          <text x={(padL + W - padR) / 2} y={H - 4} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 9.5, letterSpacing: '0.12em' }}>YOUR ASSUMED WIN-RATE  p</text>

          {/* enforced area + line */}
          <polygon points={areaEnforced} fill="url(#evfill)" />
          <polyline points={enforcedLine} fill="none" stroke="#49EACB" strokeWidth="2.5" filter="url(#glow)" strokeLinecap="round" />
          {/* configured (display-model) line */}
          {showConfigured && (
            <polyline points={configuredLine} fill="none" stroke="#E8AF34" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" opacity="0.92" />
          )}

          {/* break-even markers */}
          {m.breakevenEnforced != null && m.breakevenEnforced <= 1 && (
            <g>
              <line x1={xOf(m.breakevenEnforced)} y1={yZero} x2={xOf(m.breakevenEnforced)} y2={padT} stroke="#49EACB" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
              <circle cx={xOf(m.breakevenEnforced)} cy={yZero} r="4" fill="#49EACB" filter="url(#glow)">
                <animate attributeName="r" values="4;6.5;4" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0.55;1" dur="2.4s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
          {showConfigured && m.breakevenConfigured != null && m.breakevenConfigured <= 1 && (
            <circle cx={xOf(m.breakevenConfigured)} cy={yZero} r="3.5" fill="#E8AF34" opacity="0.9" />
          )}

          {/* live scrubber */}
          <line x1={xOf(m.p)} y1={padT} x2={xOf(m.p)} y2={H - padB} stroke="#fff" strokeWidth="1" opacity="0.4" />
          <circle cx={xOf(m.p)} cy={yOf(m.evEnforced)} r="5" fill="#fff" stroke="#49EACB" strokeWidth="2" />
          <g transform={`translate(${Math.min(xOf(m.p) + 8, W - padR - 92)}, ${Math.max(yOf(m.evEnforced) - 26, padT + 2)})`}>
            <rect width="92" height="22" rx="6" fill="rgba(10,12,18,0.9)" stroke="rgba(73,234,203,0.35)" />
            <text x="8" y="15" className="fill-white" style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>EV {KAS(m.evEnforced, 1)} KAS</text>
          </g>
        </svg>
      </div>

      {/* legend */}
      <div className="flex items-center gap-4 text-[10px] text-gray-400 light:text-slate-500 mb-4 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded bg-[#49EACB]" /> On-chain enforced (whole pot, 0% rake)</span>
        {showConfigured && <span className="flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-dashed border-[#E8AF34]" /> Configured display model</span>}
        <button onClick={() => setShowConfigured((v) => !v)} className="ml-auto text-[#49EACB] hover:underline">{showConfigured ? 'Hide' : 'Show'} display model</button>
      </div>

      {/* Pot distribution bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 light:text-slate-500">Pot distribution</span>
          <button
            onClick={() => setOutcome(isDraw ? 'win' : 'draw')}
            className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/10 light:border-slate-200 text-gray-300 light:text-slate-600 hover:border-[#49EACB]/40"
          >
            Outcome: {isDraw ? 'Draw (refund)' : 'Winner takes pot'}
          </button>
        </div>
        {isDraw ? (
          <div className="rounded-lg overflow-hidden h-9 flex border border-white/10 light:border-slate-200">
            <div className="flex items-center justify-center text-[10px] font-bold text-black overflow-hidden whitespace-nowrap px-1" style={{ width: '50%', background: 'rgba(73,234,203,0.55)' }}>A · {KAS(m.refundEach)}</div>
            <div className="flex items-center justify-center text-[10px] font-bold text-black overflow-hidden whitespace-nowrap px-1" style={{ width: '50%', background: 'rgba(73,234,203,0.32)' }}>B · {KAS(m.refundEach)}</div>
          </div>
        ) : (
          <>
            <div className="rounded-lg overflow-hidden h-9 flex border border-white/10 light:border-slate-200">
              <div className="btn-shimmer relative flex items-center justify-center text-[10px] font-black text-black overflow-hidden whitespace-nowrap transition-[width] duration-500 ease-out" style={{ width: seg(showConfigured ? m.winnerConfigured : m.winnerEnforced), background: 'linear-gradient(90deg,#49EACB,#3bd1b4)', textShadow: '0 1px 1px rgba(255,255,255,0.25)' }} title={`Winner ${KAS(showConfigured ? m.winnerConfigured : m.winnerEnforced)} KAS`}>
                Winner {KAS(showConfigured ? m.winnerConfigured : m.winnerEnforced)}
              </div>
              {showConfigured && m.creatorFee > 0 && (
                <div className="flex items-center justify-center text-[9px] font-bold text-black overflow-hidden whitespace-nowrap transition-[width] duration-500 ease-out" style={{ width: seg(m.creatorFee), background: '#E8AF34' }} title={`Creator fee ${KAS(m.creatorFee)} KAS`}>{m.creatorFee / m.pot > 0.06 ? `Fee ${KAS(m.creatorFee)}` : ''}</div>
              )}
              {showConfigured && m.potReturnAmt > 0 && (
                <div className="flex items-center justify-center text-[9px] font-bold text-black overflow-hidden whitespace-nowrap transition-[width] duration-500 ease-out" style={{ width: seg(m.potReturnAmt), background: 'rgba(73,234,203,0.4)' }} title={`Pot return ${KAS(m.potReturnAmt)} KAS`}>{m.potReturnAmt / m.pot > 0.06 ? `Pot ${KAS(m.potReturnAmt)}` : ''}</div>
              )}
            </div>
            {showConfigured && m.rakeDelta > 0 && (
              <div className="text-[9.5px] text-amber-400/80 mt-1.5 leading-snug">
                The {KAS(m.rakeDelta)} KAS gold slice is the <strong>configured display model</strong> only. On-chain today the winner receives the <strong>whole {KAS(m.pot)} KAS pot</strong> (minus ~{NETWORK_FEE_KAS} KAS network fee), and Covex takes 0.
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
        <Slider label="Stake per player" value={stake} set={setStake} min={loStake} max={hiStake} step={Math.max(0.5, (hiStake - loStake) / 200)} fmt={(v) => `${KAS(v)} KAS`} />
        <Slider label="Players" value={nPlayers} set={setNPlayers} min={2} max={8} step={1} fmt={(v) => `${v}`} />
        <Slider label="Creator fee (display)" value={fee} set={setFee} min={0} max={5} step={0.1} fmt={(v) => `${v}%`} accent="#E8AF34" />
        <Slider label="Pot return (display)" value={potReturn} set={setPotReturn} min={0} max={10} step={0.5} fmt={(v) => `${v}%`} accent="#E8AF34" />
        <div className="sm:col-span-2">
          <Slider label="Your assumed win-rate (p)" value={winProb} set={setWinProb} min={0} max={100} step={1} fmt={(v) => `${v}%`} />
        </div>
      </div>

      <p className="text-[9.5px] text-gray-500 light:text-slate-400 mt-4 leading-relaxed border-t border-white/[0.06] light:border-slate-200 pt-3">
        Win-rate <em>p</em> is your own assumption, not a Covex prediction. EV = p × winner share − your stake; break-even is where EV crosses zero.
        Configured fee / pot-return drive the SilverScript display model and are <strong>not</strong> taken on-chain. The enforced payout sends the full pot to the verified winner.
      </p>
      </div>
    </div>
  );
}
