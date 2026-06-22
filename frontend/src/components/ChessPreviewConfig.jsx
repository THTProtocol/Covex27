import React, { useMemo } from 'react';
import { Clock, FileSearch, Code2, Globe, Info, Copy, Check, Palette } from 'lucide-react';
import { BOARD_THEMES, PIECE_SETS, resolveBoardTheme, resolvePieceSet, DEFAULT_BOARD_THEME, DEFAULT_PIECE_SET } from '../lib/chessTheme';

// ChessPreviewConfig: the configure-then-preview surface for a chess covenant in the Sandbox.
// It is fully driven by props (the parent CovexTerminal owns the state), so the logic preview
// and the UI/website preview update live as the creator changes the timer, fee, or stake.
//
// HONESTY: chess is server-authoritative. The result is computed deterministically by replaying
// the signed move log with a full FIDE rules engine (anyone can recompute); the counterparty or
// a deployer-bound external resolver co-signs the release (BIP340), and that co-signature settles
// the payout on-chain (Schnorr). This is NOT an on-chain ZK proof and NOT trustless.
// Never imply otherwise in any rendered copy here. No em dashes anywhere.

const START_BOARD = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
];

// mm:ss from whole minutes (matches the CovexTerminal clock format exactly)
const fmtClock = (baseMinutes) => `${baseMinutes}:00`;

// Default base/increment for a chess variant id. chess_blitz -> 3+2, chess_bullet -> 1+0,
// every other chess covenant -> 5+0. Returned as { base, inc } so the parent can seed state.
export function defaultTimeControlFor(gameTypeId) {
  const id = (gameTypeId || '').toLowerCase();
  if (id.includes('bullet')) return { base: 1, inc: 0 };
  if (id.includes('blitz')) return { base: 3, inc: 2 };
  return { base: 5, inc: 0 };
}

// A small numeric stepper styled to match the terminal inputs.
function Stepper({ label, value, min, max, step, suffix, onChange }) {
  const clamp = (v) => Math.max(min, Math.min(max, v));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-300 light:text-slate-600 uppercase tracking-wider font-mono">{label}</p>
        <span className="text-sm font-mono text-kaspa-green font-bold tabular-nums">{value}{suffix}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(clamp(value - step))}
          className="w-9 h-9 shrink-0 rounded-lg border border-white/10 light:border-slate-200 bg-black/40 light:bg-white text-white light:text-slate-700 text-lg leading-none hover:border-kaspa-green/50 hover:text-kaspa-green active:scale-95 transition-all"
        >
          -
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clamp(parseInt(e.target.value, 10)))}
          className="flex-1 accent-kaspa-green cursor-pointer"
          style={{ '--range-pct': `${((value - min) / (max - min)) * 100}%` }}
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(clamp(value + step))}
          className="w-9 h-9 shrink-0 rounded-lg border border-white/10 light:border-slate-200 bg-black/40 light:bg-white text-white light:text-slate-700 text-lg leading-none hover:border-kaspa-green/50 hover:text-kaspa-green active:scale-95 transition-all"
        >
          +
        </button>
      </div>
    </div>
  );
}

// A static, premium chess board for the website preview. Pure render, updates
// instantly as the creator changes the board theme or piece set.
function PreviewBoard({ size = 30, board, pieces }) {
  const w = size * 8;
  return (
    <div
      className="grid rounded-lg overflow-hidden border border-black/30 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)]"
      style={{ gridTemplateColumns: `repeat(8, ${size}px)`, width: w }}
      aria-hidden="true"
    >
      {START_BOARD.map((row, ri) =>
        row.map((p, ci) => {
          const light = (ri + ci) % 2 === 0;
          const isWhite = p && p === p.toUpperCase();
          return (
            <div key={`${ri}-${ci}`} className="flex items-center justify-center" style={{ width: size, height: size, background: light ? board.light : board.dark }}>
              {p && (
                <span style={{ fontSize: size * 0.78, lineHeight: 1, color: isWhite ? pieces.whiteFill : pieces.blackFill, textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}>
                  {pieces.glyphs[p]}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// A compact swatch row to pick a board theme or piece set. Pure presentation;
// the selected id is owned by the parent (CovexTerminal) so it flows into the
// deployed custom_ui_config and the live page.
function ChoiceRow({ label, options, value, onChange, renderSwatch }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wider text-gray-300 light:text-slate-600 font-mono">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              title={opt.name}
              className={`flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                active
                  ? 'border-kaspa-green/70 bg-kaspa-green/[0.10] text-white light:text-slate-900 shadow-[0_0_14px_-4px_rgba(73,234,203,0.6)]'
                  : 'border-white/10 light:border-slate-200 bg-black/30 light:bg-white text-gray-300 light:text-slate-600 hover:border-kaspa-green/40'
              }`}
            >
              {renderSwatch(opt)}
              <span className="whitespace-nowrap">{opt.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A single clock chip for the website preview.
function ClockChip({ who, time, dimmed }) {
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg border ${dimmed ? 'border-white/5 light:border-slate-200 bg-black/20 light:bg-slate-50 opacity-60' : 'border-kaspa-green/30 bg-kaspa-green/[0.06]'}`}>
      <div className="text-[9px] uppercase tracking-[1.5px] text-gray-400 light:text-slate-500">{who}</div>
      <div className={`font-mono text-lg font-bold tabular-nums ${dimmed ? 'text-gray-300 light:text-slate-600' : 'text-white light:text-slate-900'}`}>{time}</div>
    </div>
  );
}

export default function ChessPreviewConfig({
  baseMinutes,
  incrementSeconds,
  onBaseMinutes,
  onIncrementSeconds,
  stake,
  feePercent,
  potReturnPercent,
  variantLabel,
  generatedScript,
  onCopyScript,
  scriptCopied = false,
  // Creator-customizable look. The parent owns these so the choice flows into
  // the deployed custom_ui_config and renders identically on the public page.
  boardTheme = DEFAULT_BOARD_THEME,
  pieceSet = DEFAULT_PIECE_SET,
  onBoardTheme,
  onPieceSet,
}) {
  const tc = `${baseMinutes}m + ${incrementSeconds}s`;
  const pot = (Number(stake) || 0) * 2;
  const winnerPct = Math.max(0, 100 - feePercent - potReturnPercent);
  const winnerKas = (pot * winnerPct / 100).toFixed(2);
  const creatorKas = (pot * feePercent / 100).toFixed(2);
  const potBackKas = (pot * potReturnPercent / 100).toFixed(2);
  const clock = useMemo(() => fmtClock(baseMinutes), [baseMinutes]);
  const board = useMemo(() => resolveBoardTheme(boardTheme), [boardTheme]);
  const pieces = useMemo(() => resolvePieceSet(pieceSet), [pieceSet]);
  const themingEnabled = typeof onBoardTheme === 'function' && typeof onPieceSet === 'function';

  return (
    <div className="space-y-4">
      {/* ── 1. Configurable time control ───────────────────────────── */}
      <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-black/30 light:bg-white p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-kaspa-green" />
          <span className="text-[11px] uppercase tracking-wider text-gray-300 light:text-slate-600 font-semibold">Time control</span>
          <span className="ml-auto text-[11px] font-mono px-2 py-0.5 rounded-full border border-kaspa-green/30 text-kaspa-green tabular-nums">{tc}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Stepper label="Base minutes" value={baseMinutes} min={1} max={60} step={1} suffix="m" onChange={onBaseMinutes} />
          <Stepper label="Increment" value={incrementSeconds} min={0} max={30} step={1} suffix="s" onChange={onIncrementSeconds} />
        </div>
        <p className="text-[11px] text-gray-400 light:text-slate-500 leading-relaxed">
          Each player starts with {baseMinutes} minute{baseMinutes === 1 ? '' : 's'}. {incrementSeconds > 0 ? `${incrementSeconds} second${incrementSeconds === 1 ? '' : 's'} are added after every move.` : 'No increment is added per move.'} Only the player-to-move clock ticks; reaching zero is a loss. This feeds the live clocks, the covenant logic, and both previews below.
        </p>
      </div>

      {/* ── 1b. Board + piece appearance (creator-customizable) ────────── */}
      {themingEnabled && (
        <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-black/30 light:bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Palette size={15} className="text-kaspa-green" />
            <span className="text-[11px] uppercase tracking-wider text-gray-300 light:text-slate-600 font-semibold">Board and pieces</span>
            <span className="ml-auto text-[10px] text-gray-500 light:text-slate-400">saved into your covenant page</span>
          </div>
          <ChoiceRow
            label="Board theme"
            options={BOARD_THEMES}
            value={boardTheme}
            onChange={onBoardTheme}
            renderSwatch={(opt) => (
              <span className="inline-grid grid-cols-2 w-5 h-5 rounded-[3px] overflow-hidden border border-black/30 shrink-0">
                <span style={{ background: opt.light }} />
                <span style={{ background: opt.dark }} />
                <span style={{ background: opt.dark }} />
                <span style={{ background: opt.light }} />
              </span>
            )}
          />
          <ChoiceRow
            label="Piece set"
            options={PIECE_SETS}
            value={pieceSet}
            onChange={onPieceSet}
            renderSwatch={(opt) => (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-[3px] bg-[#769656] shrink-0" aria-hidden>
                <span style={{ fontSize: 14, lineHeight: 1, color: opt.whiteFill, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{opt.glyphs.N}</span>
              </span>
            )}
          />
          <p className="text-[11px] text-gray-400 light:text-slate-500 leading-relaxed">
            Pick how your chess covenant looks. The board colors and piece set update the preview below instantly and are saved into the deployed covenant page, so every visitor sees the same look.
          </p>
        </div>
      )}

      {/* ── 2. Logic preview (honest, live) ───────────────────────────── */}
      <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-black/30 light:bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileSearch size={15} className="text-kaspa-green" />
          <span className="text-[11px] uppercase tracking-wider text-gray-300 light:text-slate-600 font-semibold">How this covenant resolves</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border border-amber-400/30 text-amber-300 light:text-amber-600 light:border-amber-400/40">
            oracle-attested <Info size={11} className="opacity-70" />
          </span>
        </div>
        <p className="text-sm text-gray-300 light:text-slate-700 leading-relaxed">
          Both players stake <span className="font-mono text-kaspa-green tabular-nums">{stake} KAS</span>. FIDE rules run on a server-authoritative engine and the result is computed deterministically by replaying the signed move log (anyone can recompute). Per-turn clock: <span className="text-white light:text-slate-900 font-medium">{baseMinutes}m + {incrementSeconds}s increment</span>, only the player-to-move clock ticks; reaching zero is a loss. The winner takes the pot minus the <span className="font-mono text-kaspa-green">{feePercent}%</span> fee; a draw refunds both sides.
        </p>
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[11px] text-amber-200/90 light:text-amber-700 leading-relaxed">
          Enforcement reality: the result is computed deterministically by replaying the signed move log, and the counterparty or a deployer-bound external resolver co-signs the release (BIP340); the payout settles on-chain when the covenant verifies that co-signature (Schnorr). This is not an on-chain ZK proof and not trustless: that co-signer is the trust boundary. The refund / CSV-timeout branch stays self-claimable.
        </div>

        {/* Live payout split */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="rounded-lg border border-white/10 light:border-slate-200 bg-black/30 light:bg-slate-50 p-2.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-gray-400 light:text-slate-500">Winner</div>
            <div className="text-sm font-bold tabular-nums text-white light:text-slate-900">{winnerKas}</div>
            <div className="text-[9px] text-gray-500 tabular-nums">{winnerPct.toFixed(1)}% of pot</div>
          </div>
          <div className="rounded-lg border border-[#E8AF34]/25 bg-[#E8AF34]/[0.05] p-2.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-gray-400 light:text-slate-500">Creator fee</div>
            <div className="text-sm font-bold tabular-nums text-[#E8AF34]">{creatorKas}</div>
            <div className="text-[9px] text-gray-500 tabular-nums">{feePercent}% of pot</div>
          </div>
          <div className="rounded-lg border border-kaspa-green/25 bg-kaspa-green/[0.05] p-2.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-gray-400 light:text-slate-500">Pot return</div>
            <div className="text-sm font-bold tabular-nums text-kaspa-green">{potBackKas}</div>
            <div className="text-[9px] text-gray-500 tabular-nums">{potReturnPercent}% of pot</div>
          </div>
        </div>

        {/* Generated SilverScript / DSL (live) */}
        {generatedScript && (
          <div className="rounded-xl border border-white/10 light:border-slate-200 bg-black/50 light:bg-slate-50 overflow-hidden">
            <div className="px-4 py-2 border-b border-white/10 light:border-slate-200 flex items-center gap-2">
              <Code2 size={13} className="text-kaspa-green" />
              <span className="text-[11px] uppercase tracking-wider text-gray-300 light:text-slate-600">Generated covenant logic</span>
              <span className="text-[10px] text-gray-500">SilverScript</span>
              {onCopyScript && (
                <button onClick={onCopyScript} className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-kaspa-green transition-colors">
                  {scriptCopied ? (<><Check size={12} className="text-kaspa-green" /> Copied</>) : (<><Copy size={12} /> Copy</>)}
                </button>
              )}
            </div>
            <pre className="text-[10.5px] leading-relaxed text-gray-300 light:text-slate-700 font-mono p-4 overflow-auto whitespace-pre-wrap break-words" style={{ maxHeight: 260 }}>{generatedScript}</pre>
          </div>
        )}
      </div>

      {/* ── 3. UI / website preview (live) ───────────────────────────── */}
      <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-black/30 light:bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Globe size={15} className="text-kaspa-green" />
          <span className="text-[11px] uppercase tracking-wider text-gray-300 light:text-slate-600 font-semibold">Public covenant page preview</span>
          <span className="ml-auto text-[10px] text-gray-500">how visitors will see it</span>
        </div>

        {/* Faux browser chrome wrapping the live page mock */}
        <div className="rounded-xl border border-white/10 light:border-slate-200 overflow-hidden bg-[#0a0a0f] light:bg-white">
          <div className="flex items-center gap-2 px-3 py-2 bg-black/50 light:bg-slate-100 border-b border-white/10 light:border-slate-200">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
            </div>
            <span className="text-[10px] text-gray-400 light:text-slate-500 font-mono ml-1 truncate">covex / covenant / chess</span>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* Header row: title + variant + reality badge */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-bold text-white light:text-slate-900">{variantLabel || 'Chess Duel'}</div>
                <div className="text-[10px] text-gray-400 light:text-slate-500 font-mono">FIDE rules - oracle-attested - {tc}</div>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-400/30 text-amber-300 light:text-amber-600">oracle-attested</span>
            </div>

            {/* Clocks + board + stake panel */}
            <div className="flex flex-col lg:flex-row items-center gap-4">
              <div className="flex lg:flex-col gap-2 shrink-0">
                <ClockChip who="White" time={clock} />
                <ClockChip who="Black" time={clock} dimmed />
              </div>

              <div className="shrink-0">
                <PreviewBoard size={30} board={board} pieces={pieces} />
              </div>

              <div className="flex-1 w-full min-w-[180px] space-y-2">
                <div className="rounded-lg border border-white/10 light:border-slate-200 bg-black/30 light:bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">Per-side stake</span>
                    <span className="text-base font-bold tabular-nums text-white light:text-slate-900">{stake} <span className="text-[10px] font-mono text-gray-400">KAS</span></span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/[0.06] light:border-slate-200">
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">Total pot</span>
                    <span className="text-base font-bold tabular-nums text-kaspa-green">{pot} KAS</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/[0.06] light:border-slate-200">
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 light:text-slate-500">Platform fee</span>
                    <span className="text-sm font-mono tabular-nums text-[#E8AF34]">{feePercent}%</span>
                  </div>
                </div>
                <button type="button" className="w-full py-2.5 rounded-xl bg-kaspa-green text-black font-bold text-xs shadow-[0_0_15px_rgba(73,234,203,0.3)] cursor-default" tabIndex={-1}>
                  STAKE {stake} KAS &amp; MATCH
                </button>
                <p className="text-[9px] text-gray-500 light:text-slate-400 text-center leading-relaxed">
                  Winner takes {winnerKas} KAS after the {feePercent}% fee. Draw refunds both sides.
                </p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 light:text-slate-400 leading-relaxed">
          This mock reflects your current time control, stake, and fee. The deployed covenant page renders the same configuration with the full interactive board and live clocks.
        </p>
      </div>
    </div>
  );
}
