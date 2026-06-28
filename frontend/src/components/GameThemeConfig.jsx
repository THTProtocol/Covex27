import React, { useMemo } from 'react';
import { Palette } from 'lucide-react';
import { POKER_FELTS, POKER_CARD_BACKS, POKER_CHIPS, resolvePokerFelt, resolvePokerCardBack } from '../lib/pokerTheme';
import { BLACKJACK_FELTS, BLACKJACK_CARD_BACKS, resolveBlackjackFelt, resolveBlackjackCardBack } from '../lib/blackjackTheme';
import { CONNECT4_BOARDS, CONNECT4_DISCS, resolveConnect4Board, resolveConnect4Discs } from '../lib/connect4Theme';
import { CHECKERS_BOARDS, CHECKERS_PIECES, resolveCheckersBoard, resolveCheckersPieces } from '../lib/checkersTheme';
import { REVERSI_BOARDS, REVERSI_DISCS, resolveReversiBoard, resolveReversiDiscs } from '../lib/reversiTheme';
import { TTT_MARKS, RPS_ACCENTS, resolveTttMarks, resolveRpsAccents } from '../lib/markGameTheme';

// GameThemeConfig: the reusable "pick how your game arena LOOKS" surface for the
// non-chess arenas (chess keeps its dedicated ChessPreviewConfig). It renders the
// right swatch pickers per game type, drives a live mini-preview, and is fully
// prop-driven so the parent (CovexTerminal) owns the selection. The chosen ids
// flow into custom_ui_config.games.<gameKey> and render identically on the
// deployed public covenant page.
//
// Visual only: this never touches move/win logic, clocks, or payouts. No em
// dashes anywhere; game names (Poker / Checkers / ...) stay as functional labels.

// A compact swatch row to pick one option from a list. Pure presentation; the
// selected id is owned by the parent. Mirrors ChessPreviewConfig's ChoiceRow.
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

// A two-cell board swatch (light / dark) used for board-color pickers.
const TwoTone = ({ a, b }) => (
  <span className="inline-grid grid-cols-2 w-5 h-5 rounded-[3px] overflow-hidden border border-black/30 shrink-0" aria-hidden>
    <span style={{ background: a }} />
    <span style={{ background: b }} />
    <span style={{ background: b }} />
    <span style={{ background: a }} />
  </span>
);

// A single round disc / chip swatch.
const Dot = ({ bg, ring }) => (
  <span className="inline-block w-5 h-5 rounded-full shrink-0 border border-black/30" style={{ background: bg, boxShadow: ring ? `inset 0 0 0 1px ${ring}` : undefined }} aria-hidden />
);

// A two-disc pair swatch.
const DotPair = ({ a, b }) => (
  <span className="inline-flex items-center -space-x-1.5 shrink-0" aria-hidden>
    <Dot bg={a} /><Dot bg={b} />
  </span>
);

// Tiny static card-back swatch (deep color + accent diamond).
const CardBackSwatch = ({ back, accent }) => (
  <span className="relative inline-block w-4 h-5 rounded-[3px] overflow-hidden border border-black/40 shrink-0"
    style={{ background: `linear-gradient(155deg, ${back}, #06151a)` }} aria-hidden>
    <span className="absolute inset-1 rotate-45" style={{ border: `1px solid ${accent}` }} />
  </span>
);

// Live mini-preview per game type, so the creator sees the choice instantly.
function GamePreview({ gameKey, sel }) {
  const wrap = 'rounded-xl border border-white/10 light:border-slate-200 bg-[#0a0a0f] light:bg-white p-4 flex items-center justify-center min-h-[120px]';
  if (gameKey === 'connect4') {
    const b = resolveConnect4Board(sel.board); const d = resolveConnect4Discs(sel.discs);
    return (
      <div className={wrap}>
        <div className="grid grid-cols-4 gap-1 p-2 rounded-lg" style={{ background: `linear-gradient(180deg, ${b.top}, ${b.bottom})` }}>
          {['a', 'b', null, 'a', null, 'b', 'a', null].map((c, i) => (
            <span key={i} className="w-5 h-5 rounded-full" style={{ background: c === 'a'
              ? `radial-gradient(circle at 32% 28%, ${d.aHi}, ${d.aMid} 60%, ${d.aDeep})`
              : c === 'b' ? `radial-gradient(circle at 32% 28%, ${d.bHi}, ${d.bMid} 60%, ${d.bDeep})` : b.hole }} />
          ))}
        </div>
      </div>
    );
  }
  if (gameKey === 'checkers') {
    const b = resolveCheckersBoard(sel.board); const p = resolveCheckersPieces(sel.pieces);
    return (
      <div className={wrap}>
        <div className="grid grid-cols-4 w-[120px] h-[120px] rounded-md overflow-hidden border border-black/40">
          {Array.from({ length: 16 }).map((_, i) => {
            const dark = (Math.floor(i / 4) + i) % 2 === 1;
            const piece = i === 1 ? 'b' : i === 4 ? 'b' : i === 11 ? 'w' : i === 14 ? 'w' : null;
            return (
              <span key={i} className="flex items-center justify-center" style={{ background: dark ? b.dark : b.light }}>
                {piece && <span className="w-4 h-4 rounded-full" style={{ background: piece === 'w' ? p.wBase : p.bBase, boxShadow: `inset 0 0 0 1px ${piece === 'w' ? p.wRim : p.bRim}` }} />}
              </span>
            );
          })}
        </div>
      </div>
    );
  }
  if (gameKey === 'reversi') {
    const b = resolveReversiBoard(sel.board); const d = resolveReversiDiscs(sel.discs);
    return (
      <div className={wrap}>
        <div className="grid grid-cols-4 w-[120px] h-[120px] rounded-md overflow-hidden p-1.5 gap-1" style={{ background: b.surface }}>
          {['a', 'b', null, 'a', null, 'b', 'a', null, 'b', null, 'a', 'b', null, 'a', 'b', null].map((c, i) => (
            <span key={i} className="flex items-center justify-center">
              {c && <span className="w-4 h-4 rounded-full" style={{ background: c === 'a' ? d.aBack : d.bBack, boxShadow: `inset 0 -1px 2px ${c === 'a' ? d.aRim : d.bRim}` }} />}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (gameKey === 'poker' || gameKey === 'blackjack') {
    const felt = gameKey === 'poker' ? resolvePokerFelt(sel.felt) : resolveBlackjackFelt(sel.felt);
    const cb = gameKey === 'poker' ? resolvePokerCardBack(sel.card_back) : resolveBlackjackCardBack(sel.card_back);
    return (
      <div className={wrap}>
        <div className="relative w-[180px] h-[96px] rounded-full flex items-center justify-center gap-1.5"
          style={{ background: `radial-gradient(ellipse at 50% 40%, ${felt.surface} 0%, rgba(0,0,0,0.35) 120%)`, boxShadow: 'inset 0 0 0 5px rgba(0,0,0,0.25)' }}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-8 h-11 rounded-[4px] relative overflow-hidden border border-black/40"
              style={{ background: `linear-gradient(155deg, ${cb.back}, #06151a)` }}>
              <span className="absolute inset-1.5 rotate-45" style={{ border: `1px solid ${cb.accent}` }} />
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (gameKey === 'tictactoe') {
    const m = resolveTttMarks(sel.marks);
    return (
      <div className={wrap}>
        <div className="grid grid-cols-3 w-[110px] h-[110px] gap-0.5">
          {['X', 'O', null, null, 'X', null, 'O', null, 'X'].map((v, i) => (
            <span key={i} className="flex items-center justify-center border border-white/10 light:border-slate-200 font-black text-lg" style={{ color: v === 'X' ? m.x : v === 'O' ? m.o : 'transparent' }}>{v || '.'}</span>
          ))}
        </div>
      </div>
    );
  }
  if (gameKey === 'rps') {
    const a = resolveRpsAccents(sel.accents);
    return (
      <div className={wrap}>
        <div className="flex items-center gap-3">
          {[['ROCK', a.rock], ['PAPER', a.paper], ['SCISSORS', a.scissors]].map(([label, color]) => (
            <span key={label} className="flex flex-col items-center gap-1">
              <span className="w-9 h-9 rounded-full" style={{ background: `radial-gradient(circle at 38% 30%, ${color}, rgba(0,0,0,0.3))`, boxShadow: `0 0 14px -2px ${color}` }} />
              <span className="text-[8px] tracking-widest text-gray-400 light:text-slate-500">{label}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

// Per-game picker rows. Each returns the ChoiceRow set for its game.
function PickerRows({ gameKey, sel, onChange }) {
  if (gameKey === 'connect4') {
    return (
      <>
        <ChoiceRow label="Board color" options={CONNECT4_BOARDS} value={sel.board} onChange={(v) => onChange('board', v)}
          renderSwatch={(o) => <Dot bg={`linear-gradient(180deg, ${o.top}, ${o.bottom})`} />} />
        <ChoiceRow label="Disc colors" options={CONNECT4_DISCS} value={sel.discs} onChange={(v) => onChange('discs', v)}
          renderSwatch={(o) => <DotPair a={o.aMid} b={o.bMid} />} />
      </>
    );
  }
  if (gameKey === 'checkers') {
    return (
      <>
        <ChoiceRow label="Board squares" options={CHECKERS_BOARDS} value={sel.board} onChange={(v) => onChange('board', v)}
          renderSwatch={(o) => <TwoTone a={o.lightSolid} b={o.darkSolid} />} />
        <ChoiceRow label="Piece colors" options={CHECKERS_PIECES} value={sel.pieces} onChange={(v) => onChange('pieces', v)}
          renderSwatch={(o) => <DotPair a={o.wSolid} b={o.bSolid} />} />
      </>
    );
  }
  if (gameKey === 'reversi') {
    return (
      <>
        <ChoiceRow label="Board color" options={REVERSI_BOARDS} value={sel.board} onChange={(v) => onChange('board', v)}
          renderSwatch={(o) => <Dot bg={o.solid} />} />
        <ChoiceRow label="Disc colors" options={REVERSI_DISCS} value={sel.discs} onChange={(v) => onChange('discs', v)}
          renderSwatch={(o) => <DotPair a={o.aSolid} b={o.bSolid} />} />
      </>
    );
  }
  if (gameKey === 'poker') {
    return (
      <>
        <ChoiceRow label="Table felt" options={POKER_FELTS} value={sel.felt} onChange={(v) => onChange('felt', v)}
          renderSwatch={(o) => <Dot bg={o.surface} />} />
        <ChoiceRow label="Card back" options={POKER_CARD_BACKS} value={sel.card_back} onChange={(v) => onChange('card_back', v)}
          renderSwatch={(o) => <CardBackSwatch back={o.back} accent={o.accent} />} />
        <ChoiceRow label="Chips" options={POKER_CHIPS} value={sel.chips} onChange={(v) => onChange('chips', v)}
          renderSwatch={(o) => <Dot bg={o.primary} />} />
      </>
    );
  }
  if (gameKey === 'blackjack') {
    return (
      <>
        <ChoiceRow label="Table felt" options={BLACKJACK_FELTS} value={sel.felt} onChange={(v) => onChange('felt', v)}
          renderSwatch={(o) => <Dot bg={o.surface} />} />
        <ChoiceRow label="Card back" options={BLACKJACK_CARD_BACKS} value={sel.card_back} onChange={(v) => onChange('card_back', v)}
          renderSwatch={(o) => <CardBackSwatch back={o.back} accent={o.accent} />} />
      </>
    );
  }
  if (gameKey === 'tictactoe') {
    return (
      <ChoiceRow label="Mark colors (X / O)" options={TTT_MARKS} value={sel.marks} onChange={(v) => onChange('marks', v)}
        renderSwatch={(o) => <DotPair a={o.x} b={o.o} />} />
    );
  }
  if (gameKey === 'rps') {
    return (
      <ChoiceRow label="Accent colors" options={RPS_ACCENTS} value={sel.accents} onChange={(v) => onChange('accents', v)}
        renderSwatch={(o) => (
          <span className="inline-flex items-center -space-x-1 shrink-0" aria-hidden>
            <Dot bg={o.rock} /><Dot bg={o.paper} /><Dot bg={o.scissors} />
          </span>
        )} />
    );
  }
  return null;
}

const GAME_LABELS = {
  poker: 'poker table', blackjack: 'blackjack table', connect4: 'Connect Four board',
  checkers: 'checkers board', reversi: 'reversi board', tictactoe: 'tic-tac-toe marks', rps: 'rock paper scissors',
};

// gameKey: canonical arena key (poker / blackjack / connect4 / checkers /
//   reversi / tictactoe / rps). sel: the current per-game selection object.
//   onChange(field, value): updates one field in the parent's state.
export default function GameThemeConfig({ gameKey, sel = {}, onChange }) {
  const label = GAME_LABELS[gameKey] || 'game';
  const safeSel = useMemo(() => sel || {}, [sel]);
  if (!gameKey || gameKey === 'chess') return null;
  return (
    <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-black/30 light:bg-white p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Palette size={15} className="text-kaspa-green" />
        <span className="text-[11px] uppercase tracking-wider text-gray-300 light:text-slate-600 font-semibold">Appearance</span>
        <span className="ml-auto text-[10px] text-gray-500 light:text-slate-400">saved into your covenant page</span>
      </div>

      {/* Live preview */}
      <GamePreview gameKey={gameKey} sel={safeSel} />

      {/* Swatch pickers */}
      <PickerRows gameKey={gameKey} sel={safeSel} onChange={onChange} />

      <p className="text-[11px] text-gray-400 light:text-slate-500 leading-relaxed">
        Pick how your {label} looks. The preview above updates instantly and the choice is saved into the deployed covenant page, so every visitor sees the same look. Appearance is visual only and never changes the rules, clocks, or payouts.
      </p>
    </div>
  );
}
