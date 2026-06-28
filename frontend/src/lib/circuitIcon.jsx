/* eslint-disable react-refresh/only-export-components -- this module intentionally co-exports its component(s) with related constants/hooks/helpers (e.g. a Provider plus its useX hook). That only affects dev Fast Refresh granularity, never the production build or tests; splitting these into separate files is not warranted here. */
// Shared, meaningful icon system for covenant / circuit / game types.
//
// The type cards used to render a single bare LETTER (name[0]) as the "icon",
// which looked unfinished. This maps every type to an evocative lucide glyph by
// id/name/circuit keyword (falling back to its category) and renders it in a
// premium glass tile tinted with the type's own accent color. One source of
// truth so PaidDeploy, PremiumBuilder, CovexTerminal, etc. all look identical.
import {
  Crown, Spade, Hand, CircleDot, Grid3x3, Hash, Disc, Circle, Triangle, Ship, Type,
  Rows3, LayoutGrid, Hexagon, Building2, Dices, Network, Ruler, CalendarCheck, Lock,
  Coins, Ban, PieChart, KeyRound, Clock, Users, ArrowLeftRight, Gavel, TrendingUp,
  TrendingDown, ShieldCheck, IdCard, Radio, BookMarked, EyeOff, Cpu, Sparkles, Layers,
  Gamepad2, Banknote, Box, Swords,
} from 'lucide-react';

// First matching rule (tested against "id name circuit", lowercased) wins.
const RULES = [
  [/chess/, Crown],
  [/poker|blackjack|\bgin\b|hearts|spades|bridge|euchre|cribbage/, Spade],
  [/rps|rock.?paper/, Hand],
  [/checkers|mancala/, CircleDot],
  [/connect.?(4|four)/, Grid3x3],
  [/tic.?tac/, Hash],
  [/reversi|othello/, Disc],
  [/\bgo[_ -]|territory/, Circle],
  [/backgammon/, Triangle],
  [/battleship/, Ship],
  [/scrabble/, Type],
  [/dominoes/, Rows3],
  [/rummikub|mahjong/, LayoutGrid],
  [/catan/, Hexagon],
  [/monopoly/, Building2],
  [/yahtzee|dice|vrf/, Dices],
  [/\brisk\b/, Swords],
  [/merkle|membership|\bset\b/, Network],
  [/range/, Ruler],
  [/age|birth/, CalendarCheck],
  [/escrow/, Lock],
  [/utxo|ownership/, Coins],
  [/nullifier|double.?spend/, EyeOff],
  [/pot.?split|payout|\bpot\b/, PieChart],
  [/schnorr/, KeyRound],
  [/pedersen|commit/, Lock],
  [/hash|preimage/, Hash],
  [/timelock|timeel|vesting/, Clock],
  [/multisig/, Users],
  [/htlc|atomic|swap/, ArrowLeftRight],
  [/auction/, Gavel],
  [/yield|lending/, TrendingUp],
  [/liquidation/, TrendingDown],
  [/collateral/, ShieldCheck],
  [/kyc|identity|credential/, IdCard],
  [/oracle|liveness|heartbeat/, Radio],
  [/registry|artifact|ceremony/, BookMarked],
  [/stake|bond|nullify/, Ban],
  [/compute|risc|wasm|\bml\b/, Cpu],
  [/custom/, Sparkles],
];

const CAT = {
  game: Gamepad2, crypto: KeyRound, ownership: Coins, defi: Banknote, compute: Cpu,
  gating: ShieldCheck, meta: Network, custom: Sparkles, other: Box,
};

export function circuitIcon(type) {
  const hay = `${type?.id || ''} ${type?.name || ''} ${type?.circuit || ''}`.toLowerCase();
  for (const [re, Icon] of RULES) if (re.test(hay)) return Icon;
  return CAT[(type?.category || '').toLowerCase()] || Layers;
}

// A premium icon tile: the mapped glyph in the type's accent color, on a soft
// accent-tinted glass square with an inset highlight. Drop-in replacement for a letter.
export function CircuitGlyph({ type, size = 40, className = '' }) {
  const Icon = circuitIcon(type);
  const accent = type?.accent || '#49EACB';
  return (
    <div
      className={`relative flex items-center justify-center rounded-xl shrink-0 overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${accent}26, ${accent}0a)`,
        border: `1px solid ${accent}40`,
        boxShadow: `inset 0 1px 0 ${accent}26, 0 6px 18px -10px ${accent}55`,
      }}
    >
      {/* eslint-disable-next-line react-hooks/static-components -- dynamic icon render: the capitalized binding is a stateless lucide icon resolved from a fixed name-to-component map, not a component created in render, so there is no state to reset */}
      <Icon size={Math.round(size * 0.5)} style={{ color: accent }} strokeWidth={1.9} />
    </div>
  );
}
