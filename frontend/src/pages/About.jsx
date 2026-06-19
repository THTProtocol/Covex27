// About.jsx - the Covex story page.
//
// Self-contained premium page using the Covex design system: ui/Button, ui/Card,
// the .covex-aurora / .kicker / .hover-lift utilities, framer-motion, and lucide
// icons. Full dark + light + mobile (375px) parity: every surface threads `light:`
// variants so it reads correctly under the ThemeProvider's `light` class on <html>.
//
// Honesty is load-bearing here. The enforcement-reality vocabulary is exact:
// on-chain (chain enforces, no Covex key in path), oracle-attested (disclosed
// Covex oracle co-signature required), full-zk (real Groth16 verified off-chain by
// that oracle, NOT on-chain ZK), metadata (display only). No overclaims.
//
// The route (/about) and nav are wired by the orchestrator, not here.

import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Compass, MousePointerClick, Hammer, ShieldCheck, ArrowRight, Layout,
  Boxes, Gamepad2, TrendingUp, Lock, Sparkles, Eye, KeyRound, Cpu,
  Palette, Smartphone, Globe, CheckCircle2, CircleDashed, Network,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

// Enforcement-reality copy. The visual palette lives in ui/Badge.jsx (single
// source of truth) so the honesty colors stay identical everywhere. Mapping the
// page's "oracle-attested" label onto the canonical "oracle" Badge variant.
const REALITY = {
  'on-chain': {
    label: 'on-chain',
    variant: 'on-chain',
    note: 'The chain enforces it. Your wallet redeems. No Covex key in the path.',
  },
  'oracle-attested': {
    label: 'oracle-attested',
    variant: 'oracle',
    note: 'The disclosed Covex oracle co-signs a server-verified result. Not trustless.',
  },
  'full-zk': {
    label: 'full-zk',
    variant: 'full-zk',
    note: 'A real Groth16 proof, verified off-chain by the oracle. Not on-chain ZK.',
  },
  'full-zk-chain': {
    label: 'chain-enforced ZK',
    variant: 'full-zk-chain',
    note: 'Off-chain Groth16 verification gates a chain-enforced hashlock payout, end-to-end on Kaspa.',
  },
  metadata: {
    label: 'metadata',
    variant: 'metadata',
    note: 'Discovery and display only. A real on-chain object, described, not enforced.',
  },
};

function RealityChip({ kind }) {
  const r = REALITY[kind] || REALITY.metadata;
  return (
    <Badge
      variant={r.variant}
      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5"
    >
      {r.label}
    </Badge>
  );
}

const PILLARS = [
  {
    icon: Compass,
    title: 'Explore',
    body: 'Every covenant on the chain, discovered on-chain by independent indexers. Search, categories, a live activity feed, per-covenant lifecycle and finality, and address portfolios.',
    tag: 'Free forever',
  },
  {
    icon: MousePointerClick,
    title: 'Interact',
    body: 'Connect a Kaspa wallet and act on any covenant: stake, join, bet, deposit, claim, resolve. Even covenants not created on Covex can be redeemed by supplying their script.',
    tag: 'Free forever',
  },
  {
    icon: Hammer,
    title: 'Create',
    body: 'Build the covenant itself, then design the full interactive website that lives on its covenant page using a visual, drag-and-drop studio. Others use that website to act.',
    tag: 'Free + paid tiers',
  },
  {
    icon: ShieldCheck,
    title: 'Trust',
    body: 'On-chain custody for every covenant; oracle co-signed for resolved kinds (games, markets, ZK circuits). The enforcement-reality badge says which on each page.',
    tag: 'Always on',
  },
];

// Worked covenant examples, each with its genuine enforcement reality.
const EXAMPLES = [
  {
    icon: Gamepad2,
    name: 'Games arena',
    kind: 'oracle-attested',
    body: 'Two players stake into a covenant and play in a premium client. The result is computed by the server from the public move log, not asserted by a client. The winner spends the pot on-chain; the oracle co-signature is in the path.',
  },
  {
    icon: TrendingUp,
    name: 'Prediction market',
    kind: 'oracle-attested',
    body: 'Funds sit in on-chain binary-select bundles, but a real-world fact must be attested off-chain. Honest target is k-of-n independent signers. The website shows live odds, pools, and a place-order panel.',
  },
  {
    icon: Lock,
    name: 'Escrow',
    kind: 'on-chain',
    body: 'Hashlock, HTLC, and multisig escrows where the chain itself enforces the release and your own wallet redeems. The two-party oracle escrow variant is oracle-attested until the state-channel rebuild lands.',
  },
  {
    icon: CircleDashed,
    name: 'Vesting',
    kind: 'on-chain',
    body: 'Absolute and relative timelocks (CLTV and CSV) release funds at or after a height, enforced by the chain. No Covex key. A clean cliff-and-schedule website with a countdown and claim button.',
  },
  {
    icon: Sparkles,
    name: 'Fundraiser',
    kind: 'on-chain',
    body: 'A pooled covenant with a target and a deadline. The website shows a live pool meter against the goal and a contribute button; the destination is always derived from the indexed covenant, never the button.',
  },
  {
    icon: Boxes,
    name: 'Generic covenant',
    kind: 'metadata',
    body: 'Any on-chain covenant, even one not built on Covex. Supply the redeem script and Covex derives the address and assembles the spend that your own key signs. Covex is removable from the path.',
  },
];

const BUILD_STEPS = [
  { icon: Hammer, title: 'Create the covenant', body: 'Pick a type, set its parameters (lock height, hash, signers, fee and payout, circuit), and deploy. On-chain primitives deploy non-custodially: your wallet signs, the chain enforces.' },
  { icon: Palette, title: 'Design its website', body: 'Start from one of 7 templates so you never face a blank canvas. Drag in hero images, galleries, video, odds bars, pool meters, and an honest enforcement badge. Bind live on-chain data with tokens.' },
  { icon: Smartphone, title: 'Preview dark, light, and mobile', body: 'Use the device-preview toggle and theme picker. Every block has light-mode parity and is built for 375px with zero horizontal overflow.' },
  { icon: Globe, title: 'Deploy the website', body: 'Saving requires a server-issued single-use nonce signature from the creator. The page serializes to validated JSON, rendered through an allow-listed component set. No raw HTML or JS reaches a visitor.' },
  { icon: MousePointerClick, title: 'Others interact', body: 'Anyone who opens the covenant page sees the full website and acts on it with their own wallet. Funds move on-chain; the enforcement-reality badge tells them exactly who enforces the outcome.' },
];

const TRUST_ROWS = [
  { icon: KeyRound, title: 'Keys never leave the browser', body: 'Wallet generation happens client-side; the private key is never transmitted to the server. On mainnet a key is never displayed or transmitted.' },
  { icon: Eye, title: 'Covex holds no funds', body: 'It reads UTXOs and verifies payments on-chain. Every value-moving action is signed by your own wallet. It cannot move your funds.' },
  { icon: Network, title: 'Destination derived on-chain', body: 'A creator-placed button derives its destination and script hash server-side from the indexed covenant record, never from the button payload. A creator cannot redirect your funds.' },
  { icon: Cpu, title: 'The oracle fails closed', body: 'There is no compiled-in oracle key. A bad proof or a missing key means the oracle refuses to sign. full-zk circuits verify a real Groth16 proof off-chain; that is honest cryptography, not on-chain ZK.' },
];

export default function AboutPage() {
  const reduce = useReducedMotion();
  const rise = {
    hidden: { opacity: 0, y: reduce ? 0 : 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
  };
  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
  };

  return (
    <div className="min-h-screen pt-16 pb-24 relative overflow-hidden">
      {/* Aurora has no intrinsic size: set dimensions + centering inline. */}
      <div
        className="covex-aurora"
        aria-hidden="true"
        style={{ width: 620, height: 620, top: '-9rem', left: '50%', transform: 'translateX(-50%)' }}
      />

      <div className="max-w-5xl mx-auto px-5 sm:px-6 relative z-10">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <motion.header
          initial="hidden"
          animate="show"
          variants={stagger}
          className="mb-16 sm:mb-20 text-center"
        >
          <motion.div variants={rise} className="kicker mb-4 light:text-slate-500">
            Built for the Toccata mainnet era
          </motion.div>
          <motion.h1
            variants={rise}
            className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.05] text-white light:text-slate-900 break-words"
          >
            Where Kaspa covenants<br className="hidden sm:block" />{' '}
            <span className="text-[#49EACB] light:text-teal-600">live, get used, and get built</span>
          </motion.h1>
          <motion.p
            variants={rise}
            className="mt-6 text-lg sm:text-xl text-gray-300 light:text-slate-600 leading-relaxed max-w-3xl mx-auto"
          >
            Covex is the covenant explorer and studio for Kaspa mainnet. Index every covenant,
            interact with any of them safely, and design the beautiful interactive websites that
            other people use to act on them. On-chain custody, honestly labeled resolution, and
            your wallet in the path of every value-moving action.
          </motion.p>
          <motion.div variants={rise} className="mt-9 flex flex-wrap gap-3 justify-center">
            <Link to="/deploy/enforced">
              <Button variant="kaspa" size="lg" shimmer className="font-bold">
                Build a covenant <ArrowRight size={18} />
              </Button>
            </Link>
            <Link to="/">
              <Button variant="glass" size="lg" className="light:border-slate-300 light:bg-white light:text-slate-700">
                Explore the chain
              </Button>
            </Link>
          </motion.div>
          <motion.div variants={rise} className="mt-6 flex flex-wrap gap-2 justify-center">
            {Object.keys(REALITY).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 light:text-slate-500">
                <RealityChip kind={k} />
              </span>
            ))}
          </motion.div>
        </motion.header>

        {/* ── What Covex is: the four pillars ──────────────────── */}
        <Section title="What Covex is" kicker="The platform">
          <p className="text-gray-300 light:text-slate-600 leading-relaxed max-w-3xl mb-8">
            A covenant is a script program embedded in a Kaspa UTXO that constrains how that UTXO may
            be spent: escrows, vaults, prediction markets, on-chain games, vesting, fundraisers, and
            more. With Toccata they become a first-class L1 smart-contract surface. Covex gives that
            surface a human layer.
          </p>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {PILLARS.map((p) => (
              <motion.div key={p.title} variants={rise}>
                <Card hover className="h-full p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-[#49EACB]/10 border border-[#49EACB]/25 flex items-center justify-center shrink-0 light:bg-teal-50 light:border-teal-200">
                      <p.icon size={20} className="text-[#49EACB] light:text-teal-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold text-white light:text-slate-900">{p.title}</h3>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 light:text-slate-400">{p.tag}</span>
                      </div>
                      <p className="text-sm text-gray-400 light:text-slate-600 mt-1.5 leading-relaxed">{p.body}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </Section>

        {/* ── How covenants work + the big idea ────────────────── */}
        <Section title="Covenants become websites" kicker="The big idea">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch">
            <Card hero className="lg:col-span-3 p-6 sm:p-8">
              <Layout size={22} className="text-[#49EACB] light:text-teal-600 mb-3" />
              <p className="text-gray-200 light:text-slate-700 leading-relaxed">
                A covenant on Covex is not a raw row in an explorer. Its creator designs a full,
                interactive website that renders directly on the covenant page, and other users
                interact with that website: place a bet on a prediction market, join a chess match,
                deposit into an escrow, contribute to a fundraiser.
              </p>
              <p className="text-gray-400 light:text-slate-600 leading-relaxed mt-4 text-sm">
                The builder is a visual, drag-and-drop studio with light-mode parity, starter
                templates, and rich blocks: hero images, galleries, video, odds bars, pool meters,
                and an honest enforcement badge. No creator-authored HTML or JavaScript ever reaches
                a visitor's DOM. Pages serialize to validated JSON rendered through an allow-listed
                component set, which removes the phishing and XSS surface that plagues open page
                builders on financial sites.
              </p>
            </Card>
            <Card className="lg:col-span-2 p-6 sm:p-8 flex flex-col justify-center bg-gradient-to-br from-[#49EACB]/[0.06] to-transparent light:from-teal-50">
              <div className="kicker mb-3 light:text-slate-500">The flow</div>
              <ol className="space-y-3">
                {['Creator deploys a covenant', 'Creator designs its website', 'Website renders on the covenant page', 'Visitors act with their own wallet'].map((s, i) => (
                  <li key={s} className="flex items-center gap-3 text-sm text-gray-300 light:text-slate-700">
                    <span className="w-6 h-6 rounded-full bg-[#49EACB]/15 text-[#49EACB] light:bg-teal-100 light:text-teal-700 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </Section>

        {/* ── Worked examples ──────────────────────────────────── */}
        <Section title="What people build" kicker="Examples, honestly labeled">
          <p className="text-gray-400 light:text-slate-600 text-sm leading-relaxed max-w-3xl mb-8">
            Each badge says who actually enforces the outcome. on-chain means the chain enforces it
            and no Covex key is in the path. oracle-attested means the disclosed Covex oracle
            co-signs a server-verified result. We never inflate these.
          </p>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
            variants={stagger}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {EXAMPLES.map((e) => (
              <motion.div key={e.name} variants={rise}>
                <Card hover className="h-full p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center light:bg-slate-100 light:border-slate-200">
                      <e.icon size={18} className="text-[#49EACB] light:text-teal-600" />
                    </div>
                    <RealityChip kind={e.kind} />
                  </div>
                  <h3 className="text-base font-bold text-white light:text-slate-900 mb-1.5">{e.name}</h3>
                  <p className="text-[13px] text-gray-400 light:text-slate-600 leading-relaxed">{e.body}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
          <p className="text-xs text-gray-500 light:text-slate-400 mt-5">
            Full worked walk-throughs for each, including how to build the website, live in the
            Building on Covex developer guide.
          </p>
        </Section>

        {/* ── How to build (the step ladder) ───────────────────── */}
        <Section title="Build the best covenant and its website" kicker="Five steps">
          <ol className="relative border-l border-white/10 light:border-slate-200 ml-3 space-y-7">
            {BUILD_STEPS.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, x: reduce ? 0 : -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.45, delay: i * 0.04 }}
                className="ml-7 relative"
              >
                <span className="absolute -left-[2.35rem] top-0 w-8 h-8 rounded-full bg-[#0b0e16] border border-[#49EACB]/40 flex items-center justify-center light:bg-white light:border-teal-300">
                  <s.icon size={15} className="text-[#49EACB] light:text-teal-600" />
                </span>
                <h3 className="text-base font-bold text-white light:text-slate-900 flex items-center gap-2">
                  <span className="text-[#49EACB] light:text-teal-600 tabular-nums">{i + 1}.</span> {s.title}
                </h3>
                <p className="text-sm text-gray-400 light:text-slate-600 mt-1 leading-relaxed">{s.body}</p>
              </motion.li>
            ))}
          </ol>
        </Section>

        {/* ── Trust model ──────────────────────────────────────── */}
        <Section title="The honest trust model" kicker="On-chain custody, honestly labeled resolution">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {TRUST_ROWS.map((t) => (
              <motion.div key={t.title} variants={rise}>
                <Card className="h-full p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-[#49EACB] light:text-teal-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white light:text-slate-900 flex items-center gap-2">
                        <t.icon size={15} className="text-gray-400 light:text-slate-500 shrink-0" /> {t.title}
                      </h3>
                      <p className="text-[13px] text-gray-400 light:text-slate-600 mt-1.5 leading-relaxed">{t.body}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <Card accent="#49EACB" className="mt-6 p-6 sm:p-7">
            <div className="kicker mb-2 light:text-slate-500">The acid test</div>
            <p className="text-gray-200 light:text-slate-700 leading-relaxed">
              If hightable.pro vanished tomorrow, could every user still recover or settle their
              funds using only their own wallet and the published script? Where the answer is yes,
              the covenant is on-chain and trustless. Where the answer is not yet, it is honestly
              labeled oracle-attested, and the roadmap to trustlessness is to remove Covex from the
              money path, not to add more cryptography.
            </p>
          </Card>
        </Section>

        {/* ── Mainnet honesty note ─────────────────────────────── */}
        <Section title="Mainnet status" kicker="No placeholder data, ever">
          <Card className="p-6 sm:p-8">
            <p className="text-gray-300 light:text-slate-600 leading-relaxed">
              Covex is built for Kaspa mainnet. Native covenants arrive with the Toccata hard fork on
              30 June 2026. The covenant indexer is armed behind the honesty gate today and the
              mainnet node is being synced ahead of launch. The mainnet explorer is intentionally
              empty until the first real covenant lands. Nothing is seeded, simulated, or projected.
              A zero is the correct, expected reading.
            </p>
          </Card>
        </Section>

        {/* ── Final CTA ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="mt-20"
        >
          <Card hero className="text-center p-8 sm:p-12 relative overflow-hidden">
            <Sparkles size={26} className="text-[#49EACB] light:text-teal-600 mx-auto mb-4" />
            <h2 className="text-2xl sm:text-4xl font-black text-white light:text-slate-900 tracking-tight">
              Build your first covenant
            </h2>
            <p className="text-gray-300 light:text-slate-600 mt-3 max-w-xl mx-auto leading-relaxed">
              Deploy an on-chain-enforced covenant for free, then design the interactive website
              other people will use to act on it. No payment required to start.
            </p>
            <div className="mt-7 flex flex-wrap gap-3 justify-center">
              <Link to="/deploy/enforced">
                <Button variant="kaspa" size="lg" shimmer className="font-bold">
                  Start building <ArrowRight size={18} />
                </Button>
              </Link>
              <Link to="/templates">
                <Button variant="outline" size="lg" className="light:border-slate-300 light:text-slate-700">
                  Browse templates
                </Button>
              </Link>
              <Link to="/sandbox">
                <Button variant="ghost" size="lg" className="light:text-slate-700">
                  Open the sandbox
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>

      </div>
    </div>
  );
}

// Hoisted section wrapper. Defined at module scope (never inside the page
// component) so it does not remount on every parent render.
function Section({ title, kicker, children }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mb-16 sm:mb-20"
    >
      <div className="mb-6">
        {kicker && <div className="kicker mb-2 light:text-slate-500">{kicker}</div>}
        <h2 className="text-2xl sm:text-3xl font-black text-white light:text-slate-900 tracking-tight">
          {title}
        </h2>
      </div>
      {children}
    </motion.section>
  );
}
