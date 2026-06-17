import React, { useMemo, useState, useRef, useCallback } from 'react';

/**
 * ResolutionSimulator  -  a payout / resolution preview that ADAPTS to the covenant.
 *
 * Different covenants resolve in fundamentally different ways, so one model cannot fit
 * all. This picks the right archetype from the covenant's circuit/kind and renders a
 * model + visual that actually applies:
 *
 *   pot         winner-takes-all pots (games, 2-player escrow pots): EV vs win-rate curve,
 *               pot = stake*players, winner = whole pot (0 on-chain rake).
 *   parimutuel  YES/NO prediction markets: winner multiplier = (1-f)+(1-f-r)*(L/P),
 *               break-even L/P = f/(1-f-r); the house fee + loser rebate ARE on-chain.
 *   release     conditional-release primitives (HTLC, timelock, multisig, channel,
 *               dead-man, relative timelock, oracle escrow, proof-gated): no win-rate, a
 *               branch flow showing who can claim what, under which condition, and when.
 *
 * Every number is derived from the same formulas the backend uses; nothing is fabricated.
 */

const KAS = (n, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '-';

const NETWORK_FEE_KAS = 0.0001; // labelled estimate for a single spend, NOT a Covex cut.

// Hoisted to module scope so slider identity stays stable across re-renders (drag survives).
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

// ── Archetype detection ────────────────────────────────────────────────────────────────
// Classify the covenant by its circuit/kind so we show a model that actually applies.
function archetypeFor(circuit, payoutType, category) {
  const c = (circuit || '').toLowerCase();
  if (/pred|market|parimutuel|tally|book|binary_oracle_select/.test(c) || payoutType === 'parimutuel') return 'parimutuel';
  // Winner-takes-all pots are GAMES only. Every other covenant (a proof, gate, lock, vault,
  // oracle feed, swap, channel, escrow, compute, etc.) is a conditional RELEASE, so
  // that is the safe default - the old default of 'pot' wrongly showed a win-rate curve for
  // the majority of circuits that have no pot at all.
  if (category === 'game' || /chess|poker|\bgo\b|reversi|connect|checkers|tic.?tac|\brps\b|rock.?paper|blackjack|cribbage|backgammon|dominoes|dice|\bduel\b|arena|winner.?takes/.test(c)) return 'pot';
  return 'release';
}

// Branch descriptor for the release archetype: who can claim, under what condition, when.
function releaseBranches(circuit) {
  const c = (circuit || '').toLowerCase();
  if (/htlc|swap/.test(c)) return {
    title: 'Hash time-locked contract',
    branches: [
      { label: 'Claim', to: 'Receiver', cond: 'reveals the secret preimage and signs', when: 'before the timeout', accent: '#49EACB' },
      { label: 'Refund', to: 'Sender', cond: 'signs after the timelock elapses', when: 'after lock DAA', accent: '#E8AF34' },
    ],
  };
  if (/deadman|inherit/.test(c)) return {
    title: "Dead-man's switch",
    branches: [
      { label: 'Owner spends', to: 'Owner', cond: 'signs (or refreshes the lock)', when: 'any time', accent: '#49EACB' },
      { label: 'Heir claims', to: 'Heir', cond: 'signs once the owner has gone silent', when: 'after lock DAA', accent: '#E8AF34' },
    ],
  };
  if (/channel/.test(c)) return {
    title: 'State-channel pot',
    branches: [
      { label: 'Cooperative close', to: 'Agreed winner', cond: 'both parties co-sign', when: 'any time', accent: '#49EACB' },
      { label: 'Funder refund', to: 'Funder', cond: 'signs the refund branch', when: 'after lock DAA', accent: '#E8AF34' },
    ],
  };
  if (/timedecay/.test(c)) return {
    title: 'Time-decaying multisig',
    branches: [
      { label: 'High quorum', to: 'Treasury', cond: 'the higher quorum of keys sign', when: 'any time', accent: '#49EACB' },
      { label: 'Lower quorum', to: 'Treasury', cond: 'the lower quorum sign', when: 'after the deadline', accent: '#E8AF34' },
    ],
  };
  if (/timelock|vesting|relative|rcsv/.test(c)) return {
    title: 'Timelock release',
    branches: [
      { label: 'Unlock', to: 'Owner', cond: 'signs once the time condition is met', when: 'after the lock', accent: '#49EACB' },
    ],
  };
  if (/multisig/.test(c)) return {
    title: 'Multisig release',
    branches: [
      { label: 'Release', to: 'Recipient', cond: 'the required quorum of keys sign', when: 'any time', accent: '#49EACB' },
    ],
  };
  if (/escrow/.test(c)) return {
    title: 'Oracle escrow',
    branches: [
      { label: 'Winner paid', to: 'Declared winner', cond: 'the oracle co-signs and the winner signs their branch', when: 'on resolution', accent: '#49EACB' },
    ],
  };
  // Genuinely ZK-verified eligibility gates (real Groth16 proof, verified fail-closed by the
  // disclosed Covex oracle off-chain). Only these can honestly claim a proof gates the spend.
  if (/merkle|member|whitelist|age|range/.test(c)) return {
    title: 'Proof-gated release',
    branches: [
      { label: 'Release', to: 'Eligible holder', cond: 'presents a real zero-knowledge proof of eligibility that the disclosed Covex oracle verifies off-chain (fail-closed)', when: 'any time', accent: '#49EACB' },
    ],
  };
  // kyc / credential / nft / reputation / identity / age-gate resolve oracle-attested today:
  // the disclosed oracle attests eligibility with a signature; no ZK proof gates the spend.
  if (/kyc|identity|credential|nft|reputation|gate/.test(c)) return {
    title: 'Oracle-attested gate',
    branches: [
      { label: 'Release', to: 'Eligible holder', cond: 'is attested eligible by the disclosed Covex oracle, which signs the attestation the covenant verifies', when: 'any time', accent: '#49EACB' },
    ],
  };
  return {
    title: 'Conditional release',
    branches: [
      { label: 'Release', to: 'Recipient', cond: 'the script condition is satisfied', when: 'on a valid spend', accent: '#49EACB' },
    ],
  };
}

// ── Pot / winner-takes-all view (EV vs win-rate) ────────────────────────────────────────
function PotView({ initFee, initPotReturn, loStake, hiStake, players, perSideStake }) {
  const [stake, setStake] = useState(() => {
    const seed = perSideStake ?? Math.min(hiStake, Math.max(loStake, 100));
    return Math.min(hiStake, Math.max(loStake, seed));
  });
  const [fee, setFee] = useState(Math.min(5, Math.max(0, initFee)));
  const [potReturn, setPotReturn] = useState(Math.min(10, Math.max(0, initPotReturn)));
  const [nPlayers, setNPlayers] = useState(Math.min(8, Math.max(2, players ?? 2)));
  const [winProb, setWinProb] = useState(50);
  const [outcome, setOutcome] = useState('win');
  const [showConfigured, setShowConfigured] = useState(true);

  const m = useMemo(() => {
    const pot = stake * nPlayers;
    const winnerPct = Math.max(0, 100 - fee - potReturn);
    const winnerConfigured = (pot * winnerPct) / 100;
    const creatorFee = (pot * fee) / 100;
    const potReturnAmt = (pot * potReturn) / 100;
    const winnerEnforced = Math.max(0, pot - NETWORK_FEE_KAS);
    const rakeDelta = creatorFee + potReturnAmt;
    const refundEach = pot / 2;
    const p = winProb / 100;
    const evConfigured = p * winnerConfigured - stake;
    const evEnforced = p * winnerEnforced - stake;
    const breakevenConfigured = winnerConfigured > 0 ? stake / winnerConfigured : null;
    const breakevenEnforced = winnerEnforced > 0 ? stake / winnerEnforced : null;
    const multEnforced = stake > 0 ? winnerEnforced / stake : 0;
    return { pot, winnerConfigured, creatorFee, potReturnAmt, winnerEnforced, rakeDelta, refundEach, p, evConfigured, evEnforced, breakevenConfigured, breakevenEnforced, multEnforced };
  }, [stake, nPlayers, fee, potReturn, winProb]);

  const W = 680, H = 360, padL = 56, padR = 22, padT = 22, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const evHi = Math.max(m.winnerEnforced - stake, 1) * 1.12;
  const evLo = -stake * 1.12;
  const xOf = (p) => padL + p * plotW;
  const yOf = (ev) => padT + (1 - (ev - evLo) / (evHi - evLo)) * plotH;
  const lineFor = (ws) => `${xOf(0)},${yOf(0 * ws - stake)} ${xOf(1)},${yOf(1 * ws - stake)}`;
  const enforcedLine = lineFor(m.winnerEnforced);
  const configuredLine = lineFor(m.winnerConfigured);
  const areaEnforced = `${xOf(0)},${yOf(Math.max(evLo, 0))} ${xOf(0)},${yOf(0 * m.winnerEnforced - stake)} ${xOf(1)},${yOf(1 * m.winnerEnforced - stake)} ${xOf(1)},${yOf(Math.max(evLo, 0))}`;
  const yZero = yOf(0);
  const svgRef = useRef(null);
  const onScrub = useCallback((clientX) => {
    const el = svgRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const p = Math.min(1, Math.max(0, (px - padL) / plotW));
    setWinProb(Math.round(p * 100));
  }, [plotW]);
  const dragging = useRef(false);
  const gridP = [0, 0.25, 0.5, 0.75, 1];
  const seg = (v) => `${m.pot > 0 ? (v / m.pot) * 100 : 0}%`;
  const isDraw = outcome === 'draw';

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Stat label="Total pot" value={KAS(m.pot)} unit="KAS" accent="#fff" sub={`${nPlayers} × ${KAS(stake)} KAS`} />
        <Stat label="Winner (on-chain)" value={KAS(m.winnerEnforced)} unit="KAS" accent="#49EACB" sub={`${KAS(m.multEnforced, 2)}× your stake`} primary />
        <Stat label="Break-even win-rate" value={m.breakevenEnforced != null ? KAS(m.breakevenEnforced * 100, 1) : '-'} unit="%" accent="#E8AF34" sub={`${nPlayers}-way: 1 / ${nPlayers}`} />
        <Stat label={`Your EV @ ${winProb}%`} value={KAS(m.evEnforced, 2)} unit="KAS" accent={m.evEnforced >= 0 ? '#4ade80' : '#f87171'} sub={isDraw ? 'draw: stake returned' : 'per session'} />
      </div>

      <div className="rounded-xl border border-white/[0.06] light:border-slate-200 bg-black/20 light:bg-white p-2 mb-1">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none touch-none" style={{ maxHeight: 320 }}
          onMouseDown={(e) => { dragging.current = true; onScrub(e.clientX); }}
          onMouseMove={(e) => { if (dragging.current) onScrub(e.clientX); }}
          onMouseUp={() => { dragging.current = false; }} onMouseLeave={() => { dragging.current = false; }}
          onTouchStart={(e) => { dragging.current = true; onScrub(e.touches[0].clientX); }}
          onTouchMove={(e) => { if (dragging.current) onScrub(e.touches[0].clientX); }}
          onTouchEnd={() => { dragging.current = false; }}>
          <defs>
            <linearGradient id="evfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#49EACB" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#49EACB" stopOpacity="0" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {gridP.map((p) => (
            <g key={`gx-${p}`}>
              <line x1={xOf(p)} y1={padT} x2={xOf(p)} y2={H - padB} stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
              <text x={xOf(p)} y={H - padB + 16} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>{Math.round(p * 100)}%</text>
            </g>
          ))}
          <line x1={padL} y1={yZero} x2={W - padR} y2={yZero} stroke="rgba(148,163,184,0.45)" strokeWidth="1.25" strokeDasharray="2 3" />
          <text x={padL - 8} y={yZero + 3} textAnchor="end" className="fill-gray-400" style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>0</text>
          <text x={(padL + W - padR) / 2} y={H - 4} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 9.5, letterSpacing: '0.12em' }}>YOUR ASSUMED WIN-RATE  p</text>
          <polygon points={areaEnforced} fill="url(#evfill)" />
          <polyline points={enforcedLine} fill="none" stroke="#49EACB" strokeWidth="2.5" filter="url(#glow)" strokeLinecap="round" />
          {showConfigured && <polyline points={configuredLine} fill="none" stroke="#E8AF34" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" opacity="0.92" />}
          {m.breakevenEnforced != null && m.breakevenEnforced <= 1 && (
            <g>
              <line x1={xOf(m.breakevenEnforced)} y1={yZero} x2={xOf(m.breakevenEnforced)} y2={padT} stroke="#49EACB" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
              <circle cx={xOf(m.breakevenEnforced)} cy={yZero} r="4" fill="#49EACB" filter="url(#glow)">
                <animate attributeName="r" values="4;6.5;4" dur="2.4s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
          <line x1={xOf(m.p)} y1={padT} x2={xOf(m.p)} y2={H - padB} stroke="#fff" strokeWidth="1" opacity="0.4" />
          <circle cx={xOf(m.p)} cy={yOf(m.evEnforced)} r="5" fill="#fff" stroke="#49EACB" strokeWidth="2" />
        </svg>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-gray-400 light:text-slate-500 mb-4 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded bg-[#49EACB]" /> On-chain enforced (whole pot, 0% rake)</span>
        {showConfigured && <span className="flex items-center gap-1.5"><span className="w-4 h-0 border-t-2 border-dashed border-[#E8AF34]" /> Configured display model</span>}
        <button onClick={() => setShowConfigured((v) => !v)} className="ml-auto text-[#49EACB] hover:underline">{showConfigured ? 'Hide' : 'Show'} display model</button>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 light:text-slate-500">Pot distribution</span>
          <button onClick={() => setOutcome(isDraw ? 'win' : 'draw')} className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-white/10 light:border-slate-200 text-gray-300 light:text-slate-600 hover:border-[#49EACB]/40">
            Outcome: {isDraw ? 'Draw (refund)' : 'Winner takes pot'}
          </button>
        </div>
        {isDraw ? (
          <div className="rounded-lg overflow-hidden h-9 flex border border-white/10 light:border-slate-200">
            <div className="flex items-center justify-center text-[10px] font-bold text-black px-1" style={{ width: '50%', background: 'rgba(73,234,203,0.55)' }}>A · {KAS(m.refundEach)}</div>
            <div className="flex items-center justify-center text-[10px] font-bold text-black px-1" style={{ width: '50%', background: 'rgba(73,234,203,0.32)' }}>B · {KAS(m.refundEach)}</div>
          </div>
        ) : (
          <>
            <div className="rounded-lg overflow-hidden h-9 flex border border-white/10 light:border-slate-200">
              <div className="btn-shimmer relative flex items-center justify-center text-[10px] font-black text-black whitespace-nowrap transition-[width] duration-500 ease-out" style={{ width: seg(showConfigured ? m.winnerConfigured : m.winnerEnforced), background: 'linear-gradient(90deg,#49EACB,#3bd1b4)' }}>Winner {KAS(showConfigured ? m.winnerConfigured : m.winnerEnforced)}</div>
              {showConfigured && m.creatorFee > 0 && <div className="flex items-center justify-center text-[9px] font-bold text-black whitespace-nowrap transition-[width] duration-500" style={{ width: seg(m.creatorFee), background: '#E8AF34' }}>{m.creatorFee / m.pot > 0.06 ? `Fee ${KAS(m.creatorFee)}` : ''}</div>}
              {showConfigured && m.potReturnAmt > 0 && <div className="flex items-center justify-center text-[9px] font-bold text-black whitespace-nowrap transition-[width] duration-500" style={{ width: seg(m.potReturnAmt), background: 'rgba(73,234,203,0.4)' }}>{m.potReturnAmt / m.pot > 0.06 ? `Pot ${KAS(m.potReturnAmt)}` : ''}</div>}
            </div>
            {showConfigured && m.rakeDelta > 0 && (
              <div className="text-[9.5px] text-amber-400/80 mt-1.5 leading-snug">The {KAS(m.rakeDelta)} KAS gold slice is the <strong>configured display model</strong> only. On-chain the winner receives the <strong>whole {KAS(m.pot)} KAS pot</strong> (minus ~{NETWORK_FEE_KAS} network fee); Covex takes 0.</div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
        <Slider label="Stake per player" value={stake} set={setStake} min={loStake} max={hiStake} step={Math.max(0.5, (hiStake - loStake) / 200)} fmt={(v) => `${KAS(v)} KAS`} />
        <Slider label="Players" value={nPlayers} set={setNPlayers} min={2} max={8} step={1} fmt={(v) => `${v}`} />
        <Slider label="Creator fee (display)" value={fee} set={setFee} min={0} max={5} step={0.1} fmt={(v) => `${v}%`} accent="#E8AF34" />
        <Slider label="Pot return (display)" value={potReturn} set={setPotReturn} min={0} max={10} step={0.5} fmt={(v) => `${v}%`} accent="#E8AF34" />
        <div className="sm:col-span-2"><Slider label="Your assumed win-rate (p)" value={winProb} set={setWinProb} min={0} max={100} step={1} fmt={(v) => `${v}%`} /></div>
      </div>
      <p className="text-[9.5px] text-gray-500 light:text-slate-400 mt-4 leading-relaxed border-t border-white/[0.06] light:border-slate-200 pt-3">
        Win-rate <em>p</em> is your own assumption, not a Covex prediction. EV = p × winner share - your stake. The configured fee / pot-return drive the display model and are <strong>not</strong> taken on-chain; the enforced payout sends the full pot to the verified winner.
      </p>
    </>
  );
}

// ── Parimutuel market view (two pools, multiplier, break-even) ──────────────────────────
function ParimutuelView({ initFee, loStake, hiStake }) {
  const [poolYes, setPoolYes] = useState(Math.min(hiStake, 120));
  const [poolNo, setPoolNo] = useState(Math.min(hiStake, 240));
  const [fee, setFee] = useState(Math.min(60, Math.max(0, initFee > 5 ? initFee : 30)));
  const [rebate, setRebate] = useState(50);
  const [bet, setBet] = useState(Math.min(hiStake, 10));
  const [side, setSide] = useState('yes');

  const m = useMemo(() => {
    const f = fee / 100, r = Math.min(rebate, 99) / 100;
    const denom = Math.max(1e-9, 1 - f - r);
    const breakevenLP = denom > 0 ? f / denom : Infinity;
    const mult = (P, L) => (P > 0 ? (1 - f) + denom * (L / P) : 0);
    const yesMult = mult(poolYes, poolNo);
    const noMult = mult(poolNo, poolYes);
    const total = poolYes + poolNo;
    const pctYes = total > 0 ? (poolYes / total) * 100 : 50;
    const myMult = side === 'yes' ? yesMult : noMult;
    const winReturn = bet * myMult;
    const loseBack = bet * r; // loser rebate
    return { f, r, breakevenLP, yesMult, noMult, total, pctYes, myMult, winReturn, loseBack, feePool: f * total };
  }, [poolYes, poolNo, fee, rebate, bet, side]);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Stat label="If YES wins" value={`${KAS(m.yesMult, 2)}×`} accent="#49EACB" sub={`${KAS(poolYes)} KAS pool`} primary={side === 'yes'} />
        <Stat label="If NO wins" value={`${KAS(m.noMult, 2)}×`} accent="#F472B6" sub={`${KAS(poolNo)} KAS pool`} primary={side === 'no'} />
        <Stat label="Break-even L / P" value={`${KAS(m.breakevenLP, 2)}×`} unit="opp ÷ yours" accent="#E8AF34" sub={`fee ${fee}% · rebate ${rebate}%`} />
        <Stat label={`Your ${bet} KAS on ${side.toUpperCase()}`} value={KAS(m.winReturn, 2)} unit="KAS" accent={m.winReturn > bet ? '#4ade80' : '#f87171'} sub={`if you win · ${KAS(m.loseBack, 2)} back if you lose`} />
      </div>

      {/* Two-pool split bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5 text-[11px] font-bold">
          <span className="text-[#49EACB]">YES {Math.round(m.pctYes)}%</span>
          <span className="text-gray-400 light:text-slate-500">pool {KAS(m.total)} KAS</span>
          <span className="text-[#F472B6]">{Math.round(100 - m.pctYes)}% NO</span>
        </div>
        <div className="h-9 w-full rounded-lg overflow-hidden flex border border-white/10 light:border-slate-200">
          <div className="flex items-center justify-center text-[10px] font-black text-black transition-[width] duration-500" style={{ width: `${m.pctYes}%`, background: 'linear-gradient(90deg,#49EACB,#3bd1b4)' }}>{KAS(poolYes)}</div>
          <div className="flex items-center justify-center text-[10px] font-black text-black transition-[width] duration-500" style={{ width: `${100 - m.pctYes}%`, background: 'linear-gradient(90deg,#F472B6,#db5e9a)' }}>{KAS(poolNo)}</div>
        </div>
        <div className="text-[9.5px] text-gray-500 light:text-slate-400 mt-1.5">House fee pool (on-chain via the bundle carve): <span className="text-amber-300">{KAS(m.feePool)} KAS</span> to treasury. Losers recover {rebate}% of their stake.</div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 mb-4">
        <span className="text-amber-400 text-base leading-none mt-0.5">!</span>
        <p className="text-[11px] text-amber-200/90 leading-relaxed">
          <span className="font-semibold text-amber-300">You can be right and still lose.</span> A side only profits when the opposing pool is more than <strong>{KAS(m.breakevenLP, 2)}×</strong> your side. The house takes {fee}% and losers get {rebate}% back, so settlement is fully on-chain via the conjoined covenants.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {['yes', 'no'].map((s) => (
          <button key={s} onClick={() => setSide(s)} className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${side === s ? (s === 'yes' ? 'bg-kaspa-green text-black border-kaspa-green' : 'bg-[#F472B6] text-black border-[#F472B6]') : 'bg-white/[0.03] text-gray-200 border-white/10 hover:border-white/25'}`}>Back {s.toUpperCase()}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
        <Slider label="YES pool" value={poolYes} set={setPoolYes} min={0} max={hiStake} step={Math.max(1, hiStake / 200)} fmt={(v) => `${KAS(v)} KAS`} />
        <Slider label="NO pool" value={poolNo} set={setPoolNo} min={0} max={hiStake} step={Math.max(1, hiStake / 200)} fmt={(v) => `${KAS(v)} KAS`} accent="#F472B6" />
        <Slider label="House fee" value={fee} set={setFee} min={0} max={60} step={1} fmt={(v) => `${v}%`} accent="#E8AF34" />
        <Slider label="Loser rebate" value={rebate} set={setRebate} min={0} max={Math.max(0, 99 - fee)} step={1} fmt={(v) => `${v}%`} accent="#E8AF34" />
        <div className="sm:col-span-2"><Slider label="Your bet" value={bet} set={setBet} min={1} max={hiStake} step={Math.max(1, hiStake / 200)} fmt={(v) => `${KAS(v)} KAS`} /></div>
      </div>
      <p className="text-[9.5px] text-gray-500 light:text-slate-400 mt-4 leading-relaxed border-t border-white/[0.06] light:border-slate-200 pt-3">
        Winner multiplier = (1 - fee) + (1 - fee - rebate) × (opposing pool ÷ your pool). Fee + rebate must stay under 100%. These economics are enforced on-chain by the conjoined binary-outcome covenants the market funds; no Covex key sits in the payout path.
      </p>
    </>
  );
}

// ── Conditional release view (branch flow, no win-rate) ─────────────────────────────────
function ReleaseView({ circuit, loStake, hiStake }) {
  const [locked, setLocked] = useState(Math.min(hiStake, Math.max(loStake, 100)));
  const desc = useMemo(() => releaseBranches(circuit), [circuit]);
  const released = Math.max(0, locked - NETWORK_FEE_KAS);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        <Stat label="Locked in covenant" value={KAS(locked)} unit="KAS" accent="#fff" sub="held by the script hash" primary />
        <Stat label="Released on a spend" value={KAS(released)} unit="KAS" accent="#49EACB" sub={`minus ~${NETWORK_FEE_KAS} network fee`} />
        <Stat label="Covex rake" value="0" unit="%" accent="#4ade80" sub="consensus-enforced, no middleman" />
      </div>

      <div className="rounded-xl border border-white/[0.06] light:border-slate-200 bg-black/20 light:bg-white p-4 mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 light:text-slate-500 mb-3">{desc.title} · spend paths</div>
        <div className="flex flex-col items-center">
          <div className="px-4 py-2 rounded-xl border border-white/15 bg-white/[0.04] text-sm font-black text-white">{KAS(locked)} KAS locked</div>
          <div className="h-5 w-px bg-white/15" />
          <div className={`grid gap-3 w-full ${desc.branches.length > 1 ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
            {desc.branches.map((b, i) => (
              <div key={i} className="rounded-xl border p-4 hover-lift-premium transition-all" style={{ borderColor: `${b.accent}55`, background: `linear-gradient(135deg, ${b.accent}14, rgba(255,255,255,0.02))` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-black" style={{ color: b.accent }}>{b.label}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ borderColor: `${b.accent}55`, color: b.accent }}>{b.when}</span>
                </div>
                <div className="text-lg font-black text-white leading-none mb-1">{KAS(released)} KAS <span className="text-[11px] font-medium text-gray-400">to {b.to}</span></div>
                <div className="text-[11px] text-gray-400 light:text-slate-500 leading-relaxed">{b.to} {b.cond}.</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 mb-4">
        <span className="text-emerald-400 text-base leading-none mt-0.5">✓</span>
        <p className="text-[11px] text-emerald-200/90 leading-relaxed">
          This covenant has no win-rate or pot split: Kaspa consensus releases the locked funds <strong>only</strong> to whoever satisfies a spend path above. There is no Covex rake and no oracle in the money path beyond what each path's signature requires.
        </p>
      </div>

      <Slider label="Amount locked" value={locked} set={setLocked} min={loStake} max={hiStake} step={Math.max(0.5, (hiStake - loStake) / 200)} fmt={(v) => `${KAS(v)} KAS`} />
      <p className="text-[9.5px] text-gray-500 light:text-slate-400 mt-4 leading-relaxed border-t border-white/[0.06] light:border-slate-200 pt-3">
        Each path is gated by a specific key or condition (a preimage, a signature, a timelock, a quorum, or a zero-knowledge proof). The chain enforces it: funds move only when a path is genuinely satisfied.
      </p>
    </>
  );
}

const ARCH_META = {
  pot: { label: 'Pot · winner-takes-all', chip: 'On-chain rake 0%' },
  parimutuel: { label: 'Parimutuel market', chip: 'Fee + rebate on-chain' },
  release: { label: 'Conditional release', chip: 'Consensus-enforced' },
};

export default function ResolutionSimulator({ config, circuitType, circuitCategory, feePercent, potReturnPercent, minStake, maxStake, players, perSideStake }) {
  // Prefer the live selected circuit (circuitType) over config, which can be stale.
  const circuit = circuitType || config?.resolution?.circuit?.type || 'oracle-attested';
  const category = circuitCategory || config?.category || '';
  const mode = config?.resolution?.mode || 'hybrid';
  const payoutType = config?.resolution?.payoutModel?.type;
  const cfgFee = config?.resolution?.payoutModel?.feeBasisPoints ?? null;
  const initFee = feePercent ?? (cfgFee != null ? cfgFee / 100 : 2);
  const initPotReturn = potReturnPercent ?? 2;
  const loStake = Math.max(0.0001, minStake ?? 10);
  const hiStake = Math.max(loStake + 1, maxStake ?? 1000);

  const archetype = useMemo(() => archetypeFor(circuit, payoutType, category), [circuit, payoutType, category]);
  const meta = ARCH_META[archetype] || ARCH_META.pot;

  return (
    <div className="glass-panel detail-hero-enhanced rounded-2xl p-5 text-sm relative overflow-hidden">
      <div className="covex-aurora" style={{ top: -40, right: -30, width: 320, height: 220, opacity: 0.4 }} aria-hidden="true" />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <div className="kicker">Resolution / Payout Simulator</div>
            <div className="text-[11px] text-gray-400 light:text-slate-500 mt-0.5">
              <span className="text-white font-semibold">{meta.label}</span> · {mode} · circuit: <span className="text-[#49EACB]">{circuit}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-[#49EACB]/40 bg-[#49EACB]/10">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#49EACB] opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#49EACB]" />
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#49EACB]">{meta.chip}</span>
          </div>
        </div>

        {archetype === 'parimutuel' ? (
          <ParimutuelView initFee={initFee} loStake={loStake} hiStake={hiStake} />
        ) : archetype === 'release' ? (
          <ReleaseView circuit={circuit} loStake={loStake} hiStake={hiStake} />
        ) : (
          <PotView initFee={initFee} initPotReturn={initPotReturn} loStake={loStake} hiStake={hiStake} players={players} perSideStake={perSideStake} />
        )}
      </div>
    </div>
  );
}
