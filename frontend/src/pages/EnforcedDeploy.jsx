/* eslint-disable react-refresh/only-export-components -- this module intentionally co-exports its component(s) with related constants/hooks/helpers (e.g. a Provider plus its useX hook). That only affects dev Fast Refresh granularity, never the production build or tests; splitting these into separate files is not warranted here. */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import { verifyAndSignSpend } from '../lib/redeemer/covenantRedeemer';
import { ShieldCheck, Lock, KeyRound, Clock, Users, Loader2, ExternalLink, Copy, Check, Download, TrendingUp, ArrowLeftRight, Network, HeartPulse, Timer, Hourglass, Scale, Gavel, Palette, Share2, AlertTriangle } from 'lucide-react';
import { useWallet, getCurrentNetwork } from '../components/WalletContext';
import DeployDisclosure from '../components/DeployDisclosure';
import ShareEmbedModal from '../components/ShareEmbedModal';
import { toast } from '../components/ToastContext';
import { enforcementSummary } from '../lib/enforcement-copy';

// The on-chain-enforced covenant primitives (covenant_builder), plus the parimutuel
// conditional-outcome covenant, which is itself settled on-chain by conjoined oracle covenants.
const KINDS = [
  { id: 'singlesig', label: 'Single-key', icon: KeyRound, blurb: 'Funds lock to a script hash, spendable only by your key. The minimal real covenant.' },
  { id: 'hashlock', label: 'Hashlock', icon: Lock, blurb: 'Release requires revealing a secret preimage plus a signature. The HTLC building block.' },
  { id: 'timelock', label: 'Timelock', icon: Clock, blurb: 'Funds are spendable only once the chain DAA score reaches the unlock point. Vesting, dispute windows.' },
  { id: 'multisig', label: 'Multisig (2-of-2 demo)', icon: Users, blurb: 'Release requires 2 of 2 dev-wallet keys. DAO treasuries, 2-of-3 escrow. Demo uses the server-assisted dev wallets.' },
  { id: 'htlc', label: 'HTLC (atomic swap)', icon: ArrowLeftRight, blurb: 'Receiver claims by revealing a secret; sender refunds after a timelock. The cross-party / cross-chain swap building block. Demo uses the dev wallets.' },
  { id: 'channel', label: 'State channel', icon: Network, blurb: 'A 2-of-2 cooperative-close balance with a funder refund after a timelock. The chain pays the agreed recipient, no oracle. Demo uses the dev wallets.' },
  { id: 'deadman', label: "Dead-man's switch", icon: HeartPulse, blurb: 'The owner spends or refreshes any time; the heir can claim only after the timelock, so funds pass on if the owner goes silent. Demo uses the dev wallets.' },
  { id: 'relative_timelock', label: 'Relative timelock (CSV)', icon: Timer, blurb: 'Spendable only after the funds have aged a relative number of blocks (OpCheckSequenceVerify, BIP68). Node-enforced: an early spend is rejected.' },
  { id: 'timedecay', label: 'Time-decaying multisig', icon: Hourglass, blurb: 'A high quorum spends now, relaxing to a lower quorum after a deadline. Treasury recovery / inheritance. Demo uses the dev wallets.' },
  { id: 'oracle_enforced', label: 'Resolver-enforced', icon: Scale, blurb: 'A 2-of-2 of a deployer-bound resolver + winner: the chain requires the resolver co-signature, and the resolver co-signs only a verified outcome. On-chain-enforced resolver resolution; the deployer binds the resolver by pubkey at deploy.' },
  { id: 'oracle_escrow', label: 'Resolver escrow (2-player)', icon: Gavel, blurb: 'A 2-player pot the chain releases only to the resolver-declared winner: needs the deployer-bound resolver co-signature plus the winning player on their branch. Demo uses the dev wallets.' },
  { id: 'market', label: 'Conditional outcome', icon: TrendingUp, blurb: 'A parimutuel YES/NO covenant. Participants stake on an outcome; the winning side is paid on-chain via conjoined oracle covenants and the other side gets a rebate. You set the creator fee and rebate.' },
  { id: 'binary_oracle_select', label: 'External-oracle market', icon: Scale, blurb: 'A 2-outcome covenant bound to an EXTERNAL resolver you choose: commit the two published hashlocks and the two winner keys. The chain pays whichever side whose secret the resolver reveals; if neither is revealed, the refund key reclaims after a relative timelock. Covex is not in the payout path and attests nothing.' },
];

// Single-signer primitives that deploy fully non-custodially (the key signs the funding tx in
// the browser) and are therefore mainnet-capable, gated only by the Toccata hard fork. Kept in
// sync with the mainnet banner copy and the per-tile "Mainnet-ready" chip.
const MAINNET_CAPABLE_KINDS = ['singlesig', 'hashlock', 'timelock', 'relative_timelock'];

function randomSecretHex() {
  const b = new Uint8Array(24);
  (window.crypto || window.msCrypto).getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Build the per-input signature array for a multi-UTXO non-custodial deploy. EVERY funding
// UTXO belongs to the deployer, so the SAME in-browser key signs each input's own sighash
// (each commits the same outputs but a different outpoint, so the sighashes differ). The
// returned shape is exactly what submit-deploy expects: [{ index, signature_hex }]. Pure and
// dependency-injected (the signer) so the signing logic is unit-checkable without a key.
// Exported for tests; the private key never leaves the device either way.
export function buildDeploySignatures(inputs, sign) {
  return (inputs || []).map((inp) => ({
    index: inp.index,
    signature_hex: bytesToHex(sign(inp.sighash)),
  }));
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  async function onCopy() {
    // Only report success on a real clipboard write. navigator.clipboard can be
    // absent (insecure context) or reject (permission denied); awaiting it in a
    // try/catch is what makes the "copied" state honest instead of a false success.
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable in this context.');
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      toast.error('Could not copy to clipboard. Select the text and copy it manually.', { title: 'Copy failed' });
    }
  }
  return (
    <button
      onClick={onCopy}
      className="inline-flex items-center gap-1 text-[11px] text-gray-400 light:text-slate-500 hover:text-kaspa-green transition-colors"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'copied' : 'copy'}
    </button>
  );
}

// Fee headroom (KAS) left unspent when locking the whole balance, so the funding tx can pay
// its mass-based fee. Generous vs the few-thousand-sompi real fee, but small enough to feel
// like "lock everything"; the backend rejects an underfunded tx rather than overspending.
const MAX_LOCK_FEE_HEADROOM_KAS = 0.001;

export default function EnforcedDeploy({ embedded = false, onDeployed = null, initialKind: initialKindProp = null }) {
  const {
    address, isDevMode, devMode, DevConnectPanel,
    canSignCovenant, covenantSignReason, signCovenantSpend, signCovenantDeploy,
    activeWalletId, walletMeta,
  } = useWallet();
  const net = getCurrentNetwork();
  const isMainnet = net === 'mainnet' || net === 'mainnet-1';
  // True when a raw in-browser key is available (dev path). The wallet-extension path
  // (canSignCovenant) is a SEPARATE capability; canSign below is the OR of the two so the
  // form unlocks for a connected sign-capable wallet too.
  const hasDevKey = isDevMode && devMode?.privateKeyHex;
  // The deploy/redeem CTA is enabled when EITHER a dev key is connected OR a sign-capable
  // wallet extension is connected (KasWare / OKX / Kastle). The wallet path is the primary
  // money path; the dev key is the recovery / testnet fallback.
  const canSign = hasDevKey || canSignCovenant;
  // The external-spend handoff is a full-page UX (wallet non-custody invariant: the redeem
  // path must not be wrapped or constrained inside a host UI). If the handoff is queued,
  // force standalone behavior even when the caller requested embedded.
  const hasRedeemHandoff = (() => {
    try { return typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('redeem_covenant'); }
    catch { return false; }
  })();
  const effectiveEmbedded = embedded && !hasRedeemHandoff;

  const [catalog, setCatalog] = useState([]);
  const [searchParams] = useSearchParams();
  // Preselect a primitive. An explicit initialKind prop (passed by the embedded Sandbox
  // handoff, which knows the real EnforcedDeploy kind id for the picked circuit) wins over
  // the ?kind= URL param used by template "Use Template" links. Falls back to singlesig.
  const initialKind = (() => {
    const fromProp = (initialKindProp || '').toLowerCase();
    if (KINDS.some((x) => x.id === fromProp)) return fromProp;
    const k = (searchParams.get('kind') || '').toLowerCase();
    return KINDS.some((x) => x.id === k) ? k : 'singlesig';
  })();
  // Read-only provenance: when arriving from a template's "Use Template", show which one.
  const templateName = (searchParams.get('name') || '').trim().slice(0, 80);
  const navigate = useNavigate();
  const [kind, setKind] = useState(initialKind);
  const [stake, setStake] = useState('1.0');
  // Deployer's spendable balance (KAS), for the "Max" convenience + the available-balance hint.
  // null = not yet read / unavailable; reading is best-effort and never blocks manual entry.
  const [availKas, setAvailKas] = useState(null);
  const [balLoading, setBalLoading] = useState(false);
  const [lockBlocks, setLockBlocks] = useState('100');
  const [tipDaa, setTipDaa] = useState(null);
  // Extra params for the advanced primitives.
  const [relSeq, setRelSeq] = useState('10');   // relative_timelock min_sequence (BIP68 relative blocks)
  const [reqNow, setReqNow] = useState('2');     // timedecay quorum now
  const [reqAfter, setReqAfter] = useState('1'); // timedecay quorum after the deadline
  // External resolver for oracle kinds: the x-only pubkey the deployed covenant locks to.
  // Blank = the default engine-results resolver (deterministic move-log replay). Set it to
  // bind a real-world covenant to an independent resolver you choose; the backend embeds THIS
  // key in the redeem. Prefillable via ?resolver=<64-hex> so an external oracle provider can
  // hand the user a ready-to-deploy link (provider-agnostic: any resolver key, no provider named).
  const initialResolver = (() => {
    const r = (searchParams.get('resolver') || '').trim().toLowerCase();
    return /^[0-9a-f]{64}$/.test(r) ? r : '';
  })();
  const [resolverKey, setResolverKey] = useState(initialResolver);
  // External-oracle market (binary_oracle_select): the two published hashlocks + winner keys. A
  // resolver can hand the user a ready-to-deploy link (provider-agnostic: just hex hashes + keys).
  const hexParam = (k) => {
    const v = (searchParams.get(k) || '').trim().toLowerCase();
    return /^[0-9a-f]{64}$/.test(v) ? v : '';
  };
  const [hashA, setHashA] = useState(hexParam('hash_a'));
  const [hashB, setHashB] = useState(hexParam('hash_b'));
  const [winnerA, setWinnerA] = useState(hexParam('winner_a'));
  const [winnerB, setWinnerB] = useState(hexParam('winner_b'));
  // Prediction-market params (kind === 'market'). No stake is locked at creation; the
  // market is committed and lands on its own covenant page where bets are placed.
  const [mq, setMq] = useState('');
  const [moa, setMoa] = useState('Yes');
  const [mob, setMob] = useState('No');
  const [mfee, setMfee] = useState('30');
  const [mrebate, setMrebate] = useState('50');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mine, setMine] = useState([]); // deploys this session: {tx, p2sh, kind, kas, preimage, dev, lock_daa, spent}
  // The just-deployed tx id, so its row in "Your enforced covenants" gets a one-shot
  // arrival flourish (motion-safe). Cleared after the entrance finishes; purely visual.
  const [justDeployedTx, setJustDeployedTx] = useState(null);
  // External-covenant interaction: spend ANY single-signer P2SH covenant (even ones not
  // created on Covex) with only your key + its redeem script. Kept subtle at the bottom.
  const [extOpen, setExtOpen] = useState(false);
  const [ext, setExt] = useState({ redeem_script_hex: '', tx: '', outpoint: '0', kind: 'singlesig', dest: '', preimage: '', branch: '', cosigs: '' });
  // Tracks which deployed covenant id ("<tx>:0") is currently being shared.
  // null = modal closed; opening preselects the covenant whose row was clicked.
  const [shareForId, setShareForId] = useState(null);

  // Live winner-multiplier preview for the market builder, recomputed as the user
  // types the fee / rebate. Uses the SAME parimutuel math as the market page's
  // winMult (CovenantInteractive winMult): with fee f and rebate r, a winner gets
  // (1-f) + (1-f-r)*(opp/your). For an even pool (your == opp -> ratio 1) that is
  // 2 - 2f - r. This turns two abstract percentages into a previewable payout.
  // Honest framing: it is an EXAMPLE on an even pool, not a guaranteed return; the
  // real multiple moves with the actual pool split and is computed identically on
  // the live page. Returns null when the inputs are out of the allowed range.
  const marketWinMult = useMemo(() => {
    const f = parseFloat(mfee);
    const r = parseFloat(mrebate);
    if (!(f >= 0) || !(r >= 0) || (f + r) >= 100) return null;
    const fF = f / 100;
    const rF = r / 100;
    const mult = (1 - fF) + (1 - fF - rF); // even pool: opp/your = 1
    return mult > 0 ? mult : null;
  }, [mfee, mrebate]);

  useEffect(() => {
    fetch('/api/covenant/catalog').then((r) => r.json()).then((j) => setCatalog(j.catalog || [])).catch(() => {});
    fetch('/api/status').then((r) => r.json()).then((j) => {
      const n = j.node_sync && j.node_sync[net];
      if (n && n.tip_daa) setTipDaa(n.tip_daa);
    }).catch(() => {});
  }, [net]);

  // Redeem hand-off: a covenant detail page sets sessionStorage['redeem_covenant'] with the
  // covenant's redeem script + outpoint, then routes here so the user can spend it with their key.
  // We prefill the external-spend panel and open it so they don't re-type the redeem script.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('redeem_covenant');
      if (!raw) return;
      sessionStorage.removeItem('redeem_covenant');
      const r = JSON.parse(raw);
      if (!r?.redeem_script_hex) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
      setExt((prev) => ({
        ...prev,
        redeem_script_hex: r.redeem_script_hex || '',
        tx: r.tx || '',
        outpoint: String(r.outpoint ?? '0'),
        kind: (r.kind || 'singlesig').split(':')[0],
      }));
      setExtOpen(true);
    } catch { /* ignore malformed hand-off */ }
  }, []);

  // Clear the just-deployed arrival highlight once its entrance has played out, so the row
  // settles into its resting state. Purely visual; no effect on the covenant itself.
  useEffect(() => {
    if (!justDeployedTx) return;
    const t = setTimeout(() => setJustDeployedTx(null), 1600);
    return () => clearTimeout(t);
  }, [justDeployedTx]);

  // Read the deployer address's spendable balance from the backend (sums its UTXOs at the
  // node) for the available-balance hint + the "Max" convenience. Best-effort: on any failure
  // it leaves availKas unchanged and never blocks manual stake entry. Returns the KAS number
  // (or null) so the Max handler can act on a fresh read instead of polled state.
  async function fetchDeployerBalanceKas() {
    if (!address) return null;
    setBalLoading(true);
    try {
      const r = await fetch(`/api/balance/${encodeURIComponent(address)}?network=${encodeURIComponent(net)}`);
      const d = await r.json();
      const sompi = (d && typeof d.balance === 'number') ? d.balance
        : (d && typeof d.balance_sompi === 'number') ? d.balance_sompi : null;
      if (sompi == null) return null;
      const kas = sompi / 100_000_000;
      setAvailKas(kas);
      return kas;
    } catch {
      return null; // node briefly unreachable; keep the last known value, allow manual entry
    } finally {
      setBalLoading(false);
    }
  }

  // Refresh the available-balance hint whenever the connected address or network changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
  useEffect(() => { setAvailKas(null); if (address) fetchDeployerBalanceKas(); }, [address, net]);

  // MAINNET DEAD-END GUARD: if the selected kind cannot deploy on mainnet (any non
  // single-signer kind, including a ?kind=market deep link), snap the selection back to a
  // mainnet-capable primitive so the form never sits on a tile whose deploy errors. Testnets
  // keep every kind. Mirrors the per-tile `mainnetUnavailable` gate below.
  useEffect(() => {
    if (isMainnet && !MAINNET_CAPABLE_KINDS.includes(kind)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync/reset inside this effect (data-fetch loading reset, dependency-change reset, or external-event handler); React Compiler perf advisory, not a render-loop bug; tests cover the behavior
      setKind('singlesig');
    }
  }, [isMainnet, kind]);

  // "Lock max balance": read the freshest balance, then set the stake to (balance - fee headroom)
  // so the user can one-tap lock everything. If the read fails or the balance is below the
  // headroom, leave the field unchanged (and surface why), never zeroing a manual entry.
  async function setStakeToMax() {
    const kas = await fetchDeployerBalanceKas();
    if (kas == null) { setError('Could not read your balance to compute Max. Enter an amount manually.'); return; }
    const max = kas - MAX_LOCK_FEE_HEADROOM_KAS;
    if (!(max > 0)) { setError('Balance is too low to lock after leaving fee headroom.'); return; }
    setError(null);
    // Trim to 8 decimals (sompi precision) and drop trailing zeros for a clean field value.
    setStake(String(Number(max.toFixed(8))));
  }

  const onchainEntries = useMemo(() => catalog.filter((e) => e.enforcement_reality === 'on-chain'), [catalog]);
  // Multi-party / oracle primitives deploy via server-assisted dev wallets,
  // exactly like the multisig demo. Single-signer kinds stay fully non-custodial.
  const DEV_WALLET_KINDS = ['multisig', 'htlc', 'channel', 'deadman', 'timedecay', 'oracle_enforced', 'oracle_escrow', 'binary_oracle_select'];
  const usesDevWallets = DEV_WALLET_KINDS.includes(kind);
  // Kinds whose redeem needs an ABSOLUTE unlock DAA (tip + lockBlocks).
  const ABS_LOCK_KINDS = ['timelock', 'htlc', 'channel', 'deadman', 'timedecay'];
  const kindLabel = KINDS.find((k) => k.id === kind)?.label || kind;

  // Create a parimutuel prediction market. This commits the market (H_A/H_B) and inserts
  // its first-class covenant anchor server-side, so /covenant/<market_id> immediately
  // resolves to the full betting website. No funds move here, but the connected wallet is
  // recorded as the creator: it becomes the ONLY address that can later resolve the market
  // (the reveal is gated on a signature from it). Betting, matching (which funds the on-chain
  // bundles), resolve, and settle all happen on the market's covenant page. fee/rebate are
  // creator-set economics.
  async function createMarket() {
    setError(null);
    // MAINNET DEAD-END GUARD: a parimutuel market can be created as a DB anchor on mainnet but
    // can never be funded (matching + payout run on a testnet-only dev-escrow), so refuse up
    // front rather than create a market that silently never funds. Honest, fail-closed.
    if (isMainnet) { setError('Conditional-outcome covenants are testnet-only for now: matching and payout run on a testnet escrow, so a mainnet one would never fund. Switch to a testnet to create one. Non-custodial mainnet support is coming.'); return; }
    const question = mq.trim();
    if (!question) { setError('Enter a question for the covenant.'); return; }
    if (!address) { setError('Connect a wallet first - it becomes the authorized resolver for this covenant (the settlement reveal is gated to your wallet signature).'); return; }
    const feePct = parseFloat(mfee);
    const rebatePct = parseFloat(mrebate);
    if (!(feePct >= 0) || !(rebatePct >= 0)) { setError('Fee and rebate must be zero or positive percentages.'); return; }
    if (feePct + rebatePct >= 100) { setError('Creator fee + loser rebate must be under 100% (winners would be unfunded).'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/covenant/market/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: net,
          creator_address: address,
          question,
          outcome_a: (moa.trim() || 'Yes'),
          outcome_b: (mob.trim() || 'No'),
          fee_bps: Math.round(feePct * 100),
          rebate_bps: Math.round(rebatePct * 100),
        }),
      });
      const j = await res.json();
      if (!j.success || !j.market_id) { setError(j.error || 'Could not create the covenant.'); return; }
      if (onDeployed) { onDeployed(j.market_id); return; }
      navigate(`/covenant/${j.market_id}`);
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deploy() {
    setError(null);
    if (kind === 'market') { await createMarket(); return; }
    // MAINNET DEAD-END GUARD: the dev-wallet kinds (multisig/htlc/channel/deadman/timedecay/
    // oracle_*/binary_oracle_select) deploy via use_dev_mode, which the backend rejects on
    // mainnet. Refuse here too so a programmatic deploy can never hit that server error; the
    // tiles are already disabled on mainnet, this is defense in depth. Single-signer kinds pass.
    if (isMainnet && usesDevWallets) {
      setError('This primitive is testnet-only for now: it deploys through the server-assisted dev-wallet path, which is disabled on mainnet. Use a single-key, hashlock, timelock, or relative-timelock covenant (those deploy non-custodially on mainnet), or switch to a testnet. Non-custodial mainnet deploys for the other primitives are coming.');
      return;
    }
    const stakeKas = parseFloat(stake);
    if (!(stakeKas > 0)) { setError('Enter a stake greater than 0.'); return; }
    if (!usesDevWallets && !canSign) { setError('Connect the key that holds the funds below - it signs the deploy in your browser (non-custodial).'); return; }

    const redeem = { kind };
    let preimage = null;
    const absLock = () => tipDaa + Math.max(1, parseInt(lockBlocks || '100', 10));
    if (ABS_LOCK_KINDS.includes(kind) && !tipDaa) {
      setError('Could not read the current chain DAA score. Try again in a moment.');
      return;
    }
    if (kind === 'hashlock') {
      preimage = randomSecretHex();
      redeem.preimage_hex = preimage;
    } else if (kind === 'htlc') {
      // Receiver claims with this secret; sender (dev wallet 1) refunds after the timelock.
      preimage = randomSecretHex();
      redeem.preimage_hex = preimage;
      redeem.lock_daa = absLock();
    } else if (kind === 'timelock') {
      redeem.lock_daa = absLock();
    } else if (kind === 'channel' || kind === 'deadman') {
      // Dev-wallet demo supplies the party keys; we only set the refund/heir timelock.
      redeem.lock_daa = absLock();
    } else if (kind === 'relative_timelock') {
      // lock_daa is reused by the backend as the BIP68 relative min_sequence.
      redeem.lock_daa = Math.max(1, parseInt(relSeq || '10', 10));
    } else if (kind === 'timedecay') {
      redeem.lock_daa = absLock();
      redeem.required = Math.max(1, parseInt(reqNow || '2', 10));   // quorum now
      redeem.req_after = Math.max(1, parseInt(reqAfter || '1', 10)); // quorum after the deadline
    }
    // Bind a creator-chosen EXTERNAL resolver ONLY on a *_refundable kind (see
    // kindAllowsExternalResolver): external cosign is not yet wired, so binding an external key to a
    // non-refundable kind would build an unspendable payout branch with no refund fallback. On a
    // refundable kind the funder can always reclaim via the CSV refund branch if the resolver never
    // acts. When allowed and set, the backend's resolve_oracle_xonly embeds THIS key into the redeem
    // so the covenant requires its co-signature on-chain. A blank field always falls back to the
    // default engine-results resolver. Validated as 32-byte x-only hex so a bad key fails pre-lock.
    if (kind === 'oracle_enforced' || kind === 'oracle_escrow' || kindAllowsExternalResolver) {
      const rk = resolverKey.trim().toLowerCase();
      if (rk && !kindAllowsExternalResolver) {
        // Defense in depth: a prefilled ?resolver= deep link plus a non-refundable kind must never
        // bind. Ignore the external key here (the field is also gated off in the UI) and deploy with
        // the default resolver rather than erroring, so the default-resolver path is never broken.
        // (The UI note already explains why and points to a refundable kind.)
      } else if (rk) {
        if (!/^[0-9a-f]{64}$/.test(rk)) {
          setError('External resolver key must be a 32-byte x-only public key (64 hex chars). Leave blank to use the default engine-results resolver.');
          return;
        }
        redeem.oracle_pubkey_hex = rk;
      }
    }
    // External-oracle market: commit to the two hashlocks the resolver published + the two winner
    // keys. The chain (not Covex) enforces blake2b(revealed_secret) == the committed hash at spend.
    if (kind === 'binary_oracle_select') {
      const ha = hashA.trim().toLowerCase(), hb = hashB.trim().toLowerCase();
      const wa = winnerA.trim().toLowerCase(), wb = winnerB.trim().toLowerCase();
      for (const [v, n] of [[ha, 'Outcome A hashlock'], [hb, 'Outcome B hashlock'], [wa, 'Winner A key'], [wb, 'Winner B key']]) {
        if (!/^[0-9a-f]{64}$/.test(v)) {
          setError(`${n} must be 64 hex characters (a 32-byte hash / x-only key).`);
          return;
        }
      }
      if (wa === wb) { setError('Winner A and Winner B must be different keys (each outcome pays a distinct side).'); return; }
      if (ha === hb) { setError('Outcome A and Outcome B hashlocks must be different.'); return; }
      redeem.hash_a_hex = ha;
      redeem.hash_b_hex = hb;
      redeem.pubkeys_hex = [wa, wb];
      // BIP68 relative sequence is a 16-bit block count; clamp so a typo cannot push the refund
      // branch past any practical horizon and brick the only fallback path. (|| 1 guards NaN.)
      redeem.lock_daa = Math.min(65535, Math.max(1, parseInt(relSeq || '10', 10) || 1)); // CSV refund delay (relative)
    }

    setBusy(true);
    try {
      // NON-CUSTODIAL DEPLOY (the non-custodial path, works on mainnet too): for a single-signer
      // covenant whose key we hold in this browser, fund it by signing the funding tx's
      // sighash HERE - the private key never leaves the device. prepare-deploy builds the
      // unsigned funding tx and returns the sighash; we sign it; submit-deploy broadcasts.
      if (!usesDevWallets && canSign) {
        const prep = await fetch('/api/covenant/p2sh/prepare-deploy', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network: net, deployer_addr: address, stake_kas: stakeKas, redeem }),
        }).then((r) => r.json());
        if (!prep.success) { setError(prep.error || 'Could not prepare the deploy.'); return; }
        let submitBody;
        if (hasDevKey) {
          // DEV-KEY STRATEGY: the in-browser key signs each funding input's sighash with @noble
          // schnorr. The private key never leaves the device.
          const myKey = devMode.privateKeyHex;
          const myXonly = bytesToHex(schnorr.getPublicKey(myKey));
          if (prep.signer_xonly && prep.signer_xonly !== myXonly) {
            setError('The connected key does not match the funding address. Reconnect the wallet that owns the funds.');
            return;
          }
          // Sign EVERY funding input. A "lock any amount" deploy may pull together N of the
          // deployer's UTXOs, so prep.inputs carries one entry per input, each with its OWN
          // sighash (same outputs, different outpoint). The SAME in-browser key signs them all
          // (every funding UTXO is the deployer's) and we POST signatures:[{index, signature_hex}].
          // The lone signature_hex path stays as a back-compat fallback only if inputs is absent.
          const inputs = Array.isArray(prep.inputs) ? prep.inputs : [];
          submitBody = inputs.length
            ? { session_id: prep.session_id, signatures: buildDeploySignatures(inputs, (sh) => schnorr.sign(sh, myKey)) }
            : { session_id: prep.session_id, signature_hex: bytesToHex(schnorr.sign(prep.sighash, myKey)) }; // BIP340 over the funding sighash
        } else {
          // WALLET STRATEGY: a connected sign-capable wallet (KasWare / OKX / Kastle) funds the
          // deploy via a popup. signCovenantDeploy returns { signatures:[{index, signature_hex}] }
          // and FAILS CLOSED (it throws an honest error if the wallet cannot sign the funding tx),
          // so we never blind-submit. Surface that reason and stop rather than risk a doomed tx.
          try {
            const walletRes = await signCovenantDeploy(prep, { signerXonly: prep.signer_xonly });
            submitBody = { session_id: prep.session_id, signatures: walletRes.signatures };
          } catch (e) {
            setError(`Wallet could not sign this deploy: ${e && e.message ? e.message : e}`);
            return;
          }
        }
        const sub = await fetch('/api/covenant/p2sh/submit-deploy', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submitBody),
        }).then((r) => r.json());
        if (!sub.success) { setError(sub.error || 'Deploy broadcast failed.'); return; }
        setMine((m) => [{
          tx: sub.deploy_tx_id, p2sh: sub.p2sh_address, kind: sub.redeem_kind, kas: sub.locked_kas,
          redeem_script_hex: sub.redeem_script_hex || prep.redeem_script_hex || null,
          preimage, dev: false, nonCustodialDeploy: true, lock_daa: redeem.lock_daa || null, spent: null,
          reality: isHybridKind ? 'hybrid' : 'on-chain',
        }, ...m]);
        setJustDeployedTx(sub.deploy_tx_id);
        if (onDeployed && sub.deploy_tx_id) onDeployed(`${sub.deploy_tx_id}:0`);
        return;
      }

      // Server-assisted fallback: the multisig demo locks to the two dev wallets, so it is
      // funded + signed server-side with use_dev_mode (server-assisted demo only).
      const body = { network: net, deployer_addr: address || '', use_dev_mode: true, stake_kas: stakeKas, redeem };
      const res = await fetch('/api/covenant/p2sh/deploy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) { setError(j.error || 'Deploy failed.'); return; }
      setMine((m) => [{
        tx: j.deploy_tx_id, p2sh: j.p2sh_address, kind: j.redeem_kind, kas: j.locked_kas,
        redeem_script_hex: j.redeem_script_hex || null,
        preimage, dev: usesDevWallets, lock_daa: redeem.lock_daa || null, spent: null,
        reality: isHybridKind ? 'hybrid' : 'on-chain',
      }, ...m]);
      setJustDeployedTx(j.deploy_tx_id);
      if (onDeployed && j.deploy_tx_id) onDeployed(`${j.deploy_tx_id}:0`);
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function redeem(c) {
    setError(null);
    setBusy(true);
    try {
      const myKey = devMode?.privateKeyHex;
      const dest = (c.destOverride && c.destOverride.trim()) || (c.dev ? (address || '') : address);
      const kindBase = String(c.kind || 'singlesig').split(':')[0];
      // Every DETERMINISTIC primitive is now non-custodially redeemable in the browser:
      // the single-signer kinds AND the multi-party kinds (multisig, HTLC, channel). The
      // chain enforces them and Covex only relays the signed tx. oracle_* still co-sign
      // server-side (the oracle key is consensus-required by design).
      const NONCUSTODIAL = ['singlesig', 'hashlock', 'timelock', 'multisig', 'htlc', 'channel'];
      // External (non-Covex) covenants carry their own redeem script + outpoint so the
      // server can build the spend with no stored record.
      const external = c.redeem_script_hex
        ? { redeem_script_hex: c.redeem_script_hex, outpoint_index: c.outpoint_index || 0, redeem_kind: c.kind }
        : {};
      // NON-CUSTODIAL redeem (the non-custodial path): fetch the unsigned sighash, sign it HERE
      // with a BIP340 Schnorr signature for every required signer whose key we hold (and
      // graft in any pasted co-signer signatures), then send ONLY the 64-byte signatures
      // (plus a preimage for hashlock / HTLC claim). No private key ever leaves the device,
      // so funds are spendable even if Covex is fully removed (reproducible with the
      // published redeem + recover-covenant.mjs).
      // WALLET STRATEGY (the primary money path): no in-browser key, but a sign-capable wallet
      // (KasWare / OKX / Kastle) is connected. Prepare the spend, then have the wallet popup sign
      // input 0; signCovenantSpend rebuilds the exact tx, hands it to the wallet, EXTRACTS the
      // 64-byte BIP340 signature, and FAIL-CLOSED verifies it against the local output-checked tx
      // before returning. We submit ONLY the verified signature, never a blind wallet blob. This
      // covers the single-signer non-custodial kinds (singlesig / hashlock / timelock); multi-party
      // kinds keep the dev-key co-sign path below.
      const SINGLE_SIGNER = ['singlesig', 'hashlock', 'timelock'];
      if (!myKey && canSignCovenant && SINGLE_SIGNER.includes(kindBase)) {
        const prep = await fetch('/api/covenant/p2sh/prepare-spend', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network: net, deploy_tx_id: c.tx, destination_addr: dest, branch: c.branch || undefined, ...external }),
        }).then((r) => r.json());
        if (!prep.success) { setError(prep.error || 'Could not prepare the spend.'); return; }
        const signerXonly = (prep.signer_xonly || (prep.required_signers && prep.required_signers[0] && prep.required_signers[0].xonly) || '').toLowerCase();
        if (!signerXonly) { setError('The spend plan did not name a signer key. Use the recovery key tool.'); return; }
        let walletRes;
        try {
          // signCovenantSpend rebuilds the tx, asserts output == input - fee paying `dest`,
          // signs input 0 via the wallet popup, and verifies the signature fail-closed. It throws
          // an honest error (steering to the recovery key tool) if the wallet cannot sign this
          // covenant input, so we never submit an unverified signature.
          walletRes = await signCovenantSpend(prep.spend_plan, { intendedDest: dest, signerXonly });
        } catch (e) {
          setError(`Wallet could not sign this covenant spend: ${e && e.message ? e.message : e}`);
          return;
        }
        const subBody = { session_id: prep.session_id, signature_hex: walletRes.signatures[0].signature_hex };
        if (prep.needs_preimage) subBody.preimage_hex = c.preimage;
        const sub = await fetch('/api/covenant/p2sh/submit-signed', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subBody),
        }).then((r) => r.json());
        if (!sub.success) { setError(sub.error || 'Submit failed.'); return; }
        setMine((m) => m.map((x) => (x.tx === c.tx ? { ...x, spent: sub.spend_tx_id, nonCustodial: true } : x)));
        return;
      }
      if (NONCUSTODIAL.includes(kindBase) && myKey) {
        const prep = await fetch('/api/covenant/p2sh/prepare-spend', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network: net, deploy_tx_id: c.tx, destination_addr: dest, branch: c.branch || undefined, ...external }),
        }).then((r) => r.json());
        if (!prep.success) { setError(prep.error || 'Could not prepare the spend.'); return; }
        const myXonly = bytesToHex(schnorr.getPublicKey(myKey)).toLowerCase();
        // Required signers (multi-party) or the single signer (single-signer kinds).
        const required = (prep.required_signers && prep.required_signers.length)
          ? prep.required_signers
          : (prep.signer_xonly ? [{ role: 'signer', xonly: prep.signer_xonly }] : []);
        // Collect signatures: our in-browser key signs the sighash for any required signer
        // it matches; pasted co-signer signatures cover the rest.
        const sigMap = {};
        (c.cosigs || []).forEach((cs) => { if (cs.xonly && cs.sig) sigMap[cs.xonly.toLowerCase().replace(/^0x/, '')] = cs.sig; });
        // Trust-audit item #1: do NOT blind-sign the server's digest. Rebuild the spend tx from
        // the server's spend_plan CLIENT-SIDE, assert it pays OUR destination (the UI value `dest`)
        // exactly input - fee and nothing else, then sign the LOCAL tx. Fail-closed: refuse to sign
        // on any mismatch (the safe direction). The sig is valid only for the verified tx, so the
        // server cannot have stored a tx that redirects funds.
        let mySig;
        try {
          // Normalize the kit network id to what buildUnsignedSpend accepts (same as Recover.jsx):
          // getCurrentNetwork() can return 'mainnet-1', which the strict prefix map would reject.
          const netId = net === 'mainnet-1' ? 'mainnet' : net;
          const verified = await verifyAndSignSpend(prep.spend_plan, myKey, { intendedDest: dest, networkId: netId });
          mySig = verified.signatureHex; // 64-byte BIP340 over the locally rebuilt + output-verified tx
        } catch (e) {
          setError(`Local verification failed, refusing to sign: ${e && e.message ? e.message : e}. Do not proceed; report this.`);
          return;
        }
        let signedAny = false;
        required.forEach((r) => {
          const x = (r.xonly || '').toLowerCase().replace(/^0x/, '');
          if (x && x === myXonly) { sigMap[x] = mySig; signedAny = true; }
        });
        const missing = required.filter((r) => !sigMap[(r.xonly || '').toLowerCase().replace(/^0x/, '')]);
        if (required.length > 0 && (signedAny || (c.cosigs || []).length)) {
          if (missing.length) {
            setError(`Need signature(s) from: ${missing.map((m) => m.role || m.xonly.slice(0, 10)).join(', ')}. Paste each co-signer's signature in the co-signer field.`);
            return;
          }
          const subBody = { session_id: prep.session_id };
          if (required.length <= 1) {
            subBody.signature_hex = sigMap[(required[0].xonly || '').toLowerCase().replace(/^0x/, '')] || mySig;
          } else {
            subBody.signatures = required.map((r) => ({ signer_xonly: r.xonly, signature_hex: sigMap[(r.xonly || '').toLowerCase().replace(/^0x/, '')] }));
          }
          if (prep.needs_preimage) subBody.preimage_hex = c.preimage;
          const sub = await fetch('/api/covenant/p2sh/submit-signed', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subBody),
          }).then((r) => r.json());
          if (!sub.success) { setError(sub.error || 'Submit failed.'); return; }
          setMine((m) => m.map((x) => (x.tx === c.tx ? { ...x, spent: sub.spend_tx_id, nonCustodial: true } : x)));
          return;
        }
        // Our in-browser key matches no required signer and no co-signer sigs were
        // supplied; fall through to the server-assisted path rather than signing nothing.
      }
      // TRUSTLESS GUARANTEE: the server-assisted fallback below would post private_key_hex.
      // On mainnet a generated/imported wallet's key must NEVER leave the device, so the
      // fallback is refused here (only the non-custodial local-signing path above is allowed;
      // for covenant types it doesn't cover, redeem with a wallet extension).
      if ((net === 'mainnet' || net === 'mainnet-1') && !c.dev) {
        setError('Your key never leaves this device. This covenant type cannot be redeemed non-custodially yet on mainnet; redeem a single-key / hashlock / timelock / multisig / htlc / channel covenant (which sign locally), or use a wallet extension.');
        return;
      }
      // Server-assisted fallback (HTLC/multisig/channel kinds, dev-wallet covenants, or a
      // key we do not hold). The non-custodial path above is preferred wherever it applies.
      const body = { network: net, deploy_tx_id: c.tx, destination_addr: dest, ...external };
      if (c.dev) body.use_dev_mode = true;
      else { body.use_dev_mode = false; body.private_key_hex = myKey; }
      if (kindBase === 'hashlock') body.preimage_hex = c.preimage;
      const res = await fetch('/api/covenant/p2sh/spend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) { setError(j.error || 'Redeem failed (a timelock may not have elapsed yet).'); return; }
      setMine((m) => m.map((x) => (x.tx === c.tx ? { ...x, spent: j.spend_tx_id } : x)));
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  // Interact with an EXTERNAL covenant (not in our records): build a synthetic entry from
  // the supplied redeem script + outpoint and run the same non-custodial redeem.
  function interactExternal() {
    setError(null);
    if (!ext.redeem_script_hex.trim() || !ext.tx.trim()) {
      setError('Supply the redeem script hex and the funding tx id.');
      return;
    }
    // Parse pasted co-signer signatures: one "xonly:signature" (or "xonly sig") per line.
    const cosigs = ext.cosigs
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [xonly, sig] = l.split(/[:\s,]+/);
        return { xonly: (xonly || '').trim(), sig: (sig || '').trim() };
      })
      .filter((cs) => cs.xonly && cs.sig);
    const c = {
      tx: ext.tx.trim(),
      kind: ext.kind.trim() || 'singlesig',
      dev: false,
      preimage: ext.preimage.trim() || null,
      branch: ext.branch.trim() || null,
      cosigs,
      outpoint_index: Number(ext.outpoint) || 0,
      redeem_script_hex: ext.redeem_script_hex.trim(),
      destOverride: ext.dest.trim() || null,
      p2sh: 'external',
      kas: '',
      external: true,
      spent: null,
    };
    setMine((m) => [c, ...m]);
    redeem(c);
  }

  // Hand the user EVERYTHING needed to spend this covenant if Covex disappears: the redeem
  // script + outpoint + secret, plus instructions to broadcast through ANY Kaspa node. The
  // literal acid test of trustlessness, downloaded at deploy time so it survives a closed tab.
  function downloadRecoveryBundle(c) {
    const bundle = {
      _README: [
        'Covex self-recovery bundle. This is everything required to SPEND this covenant',
        'WITHOUT Covex. The redeem script is not a secret; it is required to spend and is',
        'safe to keep. To recover: reconstruct + sign the spend with your own key using',
        'tools/recover-covenant.mjs (or any Kaspa script tooling) and broadcast it to ANY',
        'Kaspa node (e.g. api.kaspa.org or your own kaspad) - you do NOT need Covex.',
        c.preimage ? 'KEEP the preimage safe: a hashlock cannot be spent without it.' : null,
      ].filter(Boolean),
      network: net,
      deploy_tx_id: String(c.tx || '').split(':')[0],
      outpoint_index: c.outpoint_index || 0,
      p2sh_address: c.p2sh,
      redeem_kind: c.kind,
      redeem_script_hex: c.redeem_script_hex,
      signer_xonly: c.signer_xonly || null,
      lock_daa: c.lock_daa || null,
      preimage_hex: c.preimage || null,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `covex-recovery-${bundle.deploy_tx_id.slice(0, 12)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const KindIcon = KINDS.find((k) => k.id === kind)?.icon || ShieldCheck;
  // Market and the oracle covenants are hybrid: custody/payout settle on-chain, but the
  // deployer-bound resolver decides the outcome. Only the pure P2SH primitives are on-chain-only.
  const isHybridKind = ['oracle_enforced', 'oracle_escrow', 'market', 'binary_oracle_select'].includes(kind);
  // SAFETY GATE: binding an EXTERNAL resolver key is only safe on a *_refundable kind. The
  // signature-cosign spend path cannot produce an external key's signature, so binding an
  // external key to a NON-refundable oracle kind creates an unspendable payout branch (the
  // funder cannot reclaim either). Only a refundable kind gives the funder a CSV refund fallback
  // if the resolver never acts, so only those may expose the external-resolver-key field. The
  // currently-offered oracle_enforced / oracle_escrow are NOT refundable, so the field is gated
  // off for them and a note steers the user to a refundable kind. This predicate is the single
  // gate the UI and the deploy() binding both read, so adding a *_refundable kind enables it.
  const kindAllowsExternalResolver = /_refundable$/.test(kind);

  return (
    <div className={effectiveEmbedded ? 'relative w-full space-y-6' : 'relative w-full max-w-5xl mx-auto px-4 py-10 space-y-8'}>
      {/* Ambient aurora behind the hero (no intrinsic size: width/height + centering set inline).
          Suppressed in embedded mode so the host page owns its own background. */}
      {!effectiveEmbedded && (
        <div
          className="covex-aurora"
          aria-hidden="true"
          style={{ top: 0, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 620, height: 280, maxWidth: '92vw' }}
        />
      )}

      {/* Premium hero header: detail-hero-enhanced glass + 3px on-chain identity accent bar.
          The host (e.g. Sandbox Phase 3) renders its own title above us when embedded. */}
      {!effectiveEmbedded && (
      <div className="relative z-10 overflow-hidden rounded-2xl glass-panel detail-hero-enhanced p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="absolute top-0 inset-x-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, transparent, ${isHybridKind ? '#38bdf8' : '#34d399'}, transparent)` }}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
          <span className="grid place-items-center h-11 w-11 rounded-xl border border-emerald-500/30 bg-emerald-500/10 shrink-0">
            <ShieldCheck className="text-emerald-400" size={24} />
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-white light:text-slate-900 tracking-tight">Deploy an Enforced Covenant</h1>
          {isHybridKind ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-sky-500/40 light:border-sky-300 bg-sky-500/15 light:bg-sky-50 text-sky-300 light:text-sky-700 text-[10px] font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" aria-hidden="true" /> Hybrid
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-500/40 light:border-emerald-300 bg-emerald-500/15 light:bg-emerald-50 text-emerald-300 light:text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" /> On-chain
            </span>
          )}
          {templateName && (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-white/15 bg-white/[0.04] text-gray-300 light:border-slate-200 light:bg-slate-100 light:text-slate-700 text-[10px] font-medium tracking-wide max-w-full">
              <Palette size={11} className="shrink-0 text-kaspa-green" aria-hidden="true" />
              <span className="truncate">From template: {templateName}</span>
            </span>
          )}
        </div>
        <p className="text-sm sm:text-base text-gray-300 light:text-slate-700 max-w-2xl leading-relaxed">
          {isHybridKind ? (
            <>Custody and payout settle on-chain: funds lock to a script hash and the chain pays the winning branch. The outcome
            is decided by the covenant's named resolver (an external resolver the deployer binds by pubkey at deploy; for engine-resolved
            game results the result is computed deterministically by replaying the signed move log, anyone can recompute), which
            co-signs or reveals only the declared result, so this is hybrid, not trustless. Covex never attests real-world facts.
            Every spend was proven against the real Kaspa script engine before this shipped.</>
          ) : (
            <>These covenants are enforced by Kaspa consensus itself. Funds lock to a script hash and can only move by satisfying
            the script, no resolver, no trust. Every spend was proven against the real Kaspa script engine before this shipped.</>
          )}
        </p>
      </div>
      )}

      {!effectiveEmbedded && isMainnet && (
        <div className="relative z-10 glass-panel p-4 border-amber-500/30 bg-amber-500/[0.05]">
          <p className="text-sm text-amber-200">
            You are on mainnet. Single-key, hashlock, timelock, and relative-timelock (CSV) covenants deploy non-custodially here:
            connect the key that holds the funds and it signs the funding transaction in your browser - the key is never sent.
            Mainnet covenants activate at the Toccata hard fork, so the deploy stays gated until then.
          </p>
          <p className="mt-2 text-[12px] text-amber-200/80 leading-snug">
            The other primitives (multisig, HTLC, channel, dead-man, time-decaying multisig, resolver-enforced/escrow) deploy through the
            server-assisted dev-wallet path, which is disabled on mainnet, so their tiles are testnet-only for now. Conditional-outcome
            covenants are testnet-only too: one can be created as a record, but matching and payout run on a testnet-only escrow, so a mainnet
            one would never fund. Non-custodial mainnet deploys for these are coming.
          </p>
        </div>
      )}

      {/* Kind picker - premium selectable tiles (CircuitCard-style: hover-lift + selected ring) */}
      <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-3">
        {KINDS.map((k) => {
          const Icon = k.icon;
          const active = kind === k.id;
          // Honest deploy-reality chip: DEV_WALLET_KINDS deploy via server-assisted
          // dev wallets (not a non-custodial deploy), so flag them so a user
          // is not led into a dead-end. The single-signer primitives are non-custodial and
          // mainnet-capable; market is a hybrid creation flow.
          const isDevWalletKind = DEV_WALLET_KINDS.includes(k.id);
          const isMainnetCapable = MAINNET_CAPABLE_KINDS.includes(k.id);
          // MAINNET DEAD-END GUARD: on mainnet, only the non-custodial single-signer kinds can
          // actually deploy. The dev-wallet kinds (multisig/htlc/channel/deadman/timedecay/
          // oracle_*/binary_oracle_select) route through use_dev_mode, which the backend rejects
          // on mainnet ("dev mode is disabled on mainnet"); the parimutuel market can be created
          // as a DB anchor but can never be funded (the matcher is testnet dev-escrow only). So
          // rather than render an advertised tile that errors on deploy, disable it on mainnet
          // with an honest note. Testnets keep every tile.
          const mainnetUnavailable = isMainnet && !isMainnetCapable;
          return (
            <button
              key={k.id}
              onClick={() => { if (!mainnetUnavailable) setKind(k.id); }}
              aria-pressed={active}
              disabled={mainnetUnavailable}
              title={mainnetUnavailable ? 'Available on testnet. Non-custodial mainnet deploy for this primitive is coming; on mainnet it would route through the server-assisted dev-wallet path, which is disabled there.' : undefined}
              className={`hover-lift group relative overflow-hidden text-left p-4 rounded-xl border transition-all ${
                mainnetUnavailable
                  ? 'border-white/[0.06] bg-white/[0.01] opacity-55 cursor-not-allowed light:border-slate-200 light:bg-slate-50'
                  : active
                  ? 'border-kaspa-green/60 bg-kaspa-green/[0.07] ring-1 ring-kaspa-green/50 shadow-[0_0_22px_-6px_rgba(73,234,203,0.45)]'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04] light:border-slate-200 light:bg-white light:hover:border-slate-300 light:hover:bg-slate-50'
              }`}
            >
              {active && !mainnetUnavailable && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 inset-x-0 h-[3px]"
                  style={{ background: 'linear-gradient(90deg, transparent, #49EACB, transparent)' }}
                />
              )}
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`grid place-items-center h-9 w-9 rounded-lg border transition-colors shrink-0 ${
                    active && !mainnetUnavailable ? 'border-kaspa-green/40 bg-kaspa-green/10' : 'border-white/10 bg-white/[0.03] group-hover:border-white/20 light:border-slate-200 light:bg-slate-100 light:group-hover:border-slate-300'
                  }`}
                >
                  <Icon size={18} className={active && !mainnetUnavailable ? 'text-kaspa-green' : 'text-gray-300 light:text-slate-700'} />
                </span>
                {mainnetUnavailable ? (
                  <span
                    title="Available on testnet. Non-custodial mainnet deploy for this primitive is coming."
                    className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-slate-500/40 bg-slate-500/15 text-slate-300 text-[9px] font-bold uppercase tracking-wider light:border-slate-300 light:bg-slate-200 light:text-slate-600"
                  >
                    <span className="h-1 w-1 rounded-full bg-slate-400" aria-hidden="true" /> Testnet only
                  </span>
                ) : isDevWalletKind ? (
                  <span
                    title="Deploys via server-assisted dev wallets, not a non-custodial deploy. Honest demo of the primitive."
                    className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-300 text-[9px] font-bold uppercase tracking-wider"
                  >
                    <span className="h-1 w-1 rounded-full bg-amber-400" aria-hidden="true" /> Server-assisted demo
                  </span>
                ) : isMainnetCapable ? (
                  <span
                    title="Non-custodial: your key signs the funding transaction in your browser. Deployable on mainnet (gated until the Toccata hard fork)."
                    className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-[9px] font-bold uppercase tracking-wider"
                  >
                    <span className="h-1 w-1 rounded-full bg-emerald-400" aria-hidden="true" /> Mainnet-ready
                  </span>
                ) : null}
              </div>
              <div className="mt-2.5 text-sm font-semibold text-white light:text-slate-900">{k.label}</div>
              <div className="mt-1 text-[11px] text-gray-400 light:text-slate-600 leading-snug">{k.blurb}</div>
            </button>
          );
        })}
      </div>

      {/* Param form */}
      <div className="relative z-10 glass-panel p-6 space-y-4">
        <div className="flex items-center gap-2 text-white light:text-slate-900 font-semibold"><KindIcon size={16} className="text-kaspa-green" /> Parameters</div>
        {usesDevWallets && (
          <p className="text-[11px] text-amber-300 light:text-amber-600 leading-snug border border-amber-500/30 bg-amber-500/[0.06] rounded-lg px-3 py-2">
            Server-assisted demo: deploys with Covex dev wallets, not your key. It honestly demonstrates the on-chain mechanism; it is not a non-custodial deploy.
          </p>
        )}
        {kind !== 'market' && (
          <label className="block">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-300 light:text-slate-700">Stake to lock (KAS)</span>
              {/* Lock-any-amount: the funding tx can pull together as many of your UTXOs as it
                  needs, so the lockable amount is bounded only by your total balance, not by a
                  single UTXO. "Max" leaves a tiny fee headroom. Only for your-own-funds kinds. */}
              {!usesDevWallets && address && (
                <span className="flex items-center gap-2">
                  {availKas != null && (
                    <span className="text-[11px] text-gray-400 light:text-slate-600 font-mono">
                      avail {Number(availKas.toFixed(4))} KAS
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={setStakeToMax}
                    disabled={balLoading}
                    title="Lock your whole balance (less a tiny fee headroom). The funding tx combines as many of your UTXOs as needed."
                    className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-md border border-kaspa-green/40 bg-kaspa-green/10 text-kaspa-green hover:bg-kaspa-green/20 transition-colors disabled:opacity-60 light:border-emerald-500/40 light:bg-emerald-500/10 light:text-emerald-600"
                  >
                    {balLoading ? <Loader2 size={11} className="animate-spin" /> : null} Max
                  </button>
                </span>
              )}
            </div>
            <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal"
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono light:bg-white light:border-slate-200 light:text-slate-900" />
            {!usesDevWallets && (
              <span className="mt-1 block text-[11px] text-gray-500 light:text-slate-500">
                Lockable up to your total balance: the funding transaction combines multiple UTXOs as needed. Any amount is allowed with no maximum, on any tier including free. All building is free. Paid tiers add priority placement and the premium website templates.
              </span>
            )}
          </label>
        )}
        {kind === 'market' && (
          <div className="space-y-3">
            {/* Non-operator note at the point of building a market (condensed from the Terms
                framing). Visually quiet: a small muted line, light/dark/mobile correct. */}
            <p className="flex items-start gap-2 text-[11px] leading-snug text-gray-400 light:text-slate-500">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-gray-500 light:text-slate-600" aria-hidden="true" />
              <span>
                You deploy your own covenant. Covex is not a counterparty, bookmaker, or custodian, sets no odds, and runs no house. Resolution depends on an external resolver you choose.
              </span>
            </p>
            <label className="block">
              <span className="text-xs text-gray-300 light:text-slate-700">Question</span>
              <input value={mq} onChange={(e) => setMq(e.target.value)} placeholder='e.g. "Will Brazil beat Haiti?"'
                className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white light:bg-white light:border-slate-200 light:text-slate-900" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-300 light:text-slate-700">Outcome A (YES)</span>
                <input value={moa} onChange={(e) => setMoa(e.target.value)}
                  className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white light:bg-white light:border-slate-200 light:text-slate-900" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-300 light:text-slate-700">Outcome B (NO)</span>
                <input value={mob} onChange={(e) => setMob(e.target.value)}
                  className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white light:bg-white light:border-slate-200 light:text-slate-900" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-300 light:text-slate-700">Creator fee %</span>
                <input value={mfee} onChange={(e) => setMfee(e.target.value)} inputMode="numeric"
                  className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono light:bg-white light:border-slate-200 light:text-slate-900" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-300 light:text-slate-700">Loser rebate %</span>
                <input value={mrebate} onChange={(e) => setMrebate(e.target.value)} inputMode="numeric"
                  className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono light:bg-white light:border-slate-200 light:text-slate-900" />
              </label>
            </div>
            {/* Live payout preview: turns the two percentages into a concrete example
                multiple using the SAME math as the live market page (winMult). */}
            {marketWinMult != null ? (
              <div className="rounded-lg border border-kaspa-green/25 bg-kaspa-green/[0.06] px-3 py-2.5 light:border-emerald-500/30 light:bg-emerald-500/[0.06]">
                <p className="text-[12px] text-gray-200 light:text-slate-700 leading-relaxed">
                  Example: with an even pool, a winner gets back about{' '}
                  <span className="font-mono font-bold text-kaspa-green light:text-emerald-600">{marketWinMult.toFixed(2)}x</span>{' '}
                  their stake after fees.
                </p>
                <p className="text-[10px] text-gray-500 light:text-slate-500 mt-1 leading-snug">
                  An illustration on a balanced pool, not a guaranteed return. The real multiple moves with the actual YES/NO split and is computed the same way on the covenant page.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5">
                <p className="text-[11px] text-amber-300 light:text-amber-700 leading-snug">
                  Fee + rebate must stay under 100% so winners are funded. Adjust the percentages to see the example payout.
                </p>
              </div>
            )}
            <p className="text-[11px] text-gray-400 light:text-slate-600 leading-relaxed">
              Parimutuel YES/NO covenant on conjoined oracle covenants. The winning side is paid by an on-chain spend that needs no Covex key in the signature. To resolve, the covenant's authorized resolver (your wallet, gated by signature) reveals one committed outcome secret; once revealed, anyone can settle every funded leg on-chain with that secret and a Kaspa node. Today the committed secret is Covex-derived, a trust-minimized step toward binding the covenant to an external resolver you choose. Fee + rebate must stay under 100%. After creating, you land on the covenant page to stake, match, resolve, and settle.
            </p>
            <p className="text-[11px] text-gray-500 light:text-slate-500 leading-relaxed">
              Stakes can be any amount with no maximum, on any tier including free. All building is free. Paid tiers add priority placement and the premium website templates.
            </p>
          </div>
        )}
        {ABS_LOCK_KINDS.includes(kind) && (
          <label className="block">
            <span className="text-xs text-gray-300 light:text-slate-700">
              {kind === 'timelock' ? 'Lock for (DAA blocks from now)'
                : kind === 'timedecay' ? 'Lower quorum unlocks after (DAA blocks from now)'
                : 'Refund / claim timelock (DAA blocks from now)'}
              {tipDaa ? ` - at DAA ${tipDaa + Math.max(1, parseInt(lockBlocks || '100', 10))}` : ''}
            </span>
            <input value={lockBlocks} onChange={(e) => setLockBlocks(e.target.value)} inputMode="numeric"
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono light:bg-white light:border-slate-200 light:text-slate-900" />
            <span className="mt-1 block text-[11px] text-gray-500 light:text-slate-500 leading-snug">
              Funds are frozen and cannot move until then. Kaspa runs about 10 blocks per second, so {Math.max(1, parseInt(lockBlocks || '0', 10) || 0)} blocks is roughly {Math.round((parseInt(lockBlocks || '0', 10) || 0) / 10)} seconds (a test value; use a larger number for a real lock).
            </span>
          </label>
        )}
        {kind === 'relative_timelock' && (
          <label className="block">
            <span className="text-xs text-gray-300 light:text-slate-700">Relative age before spend (blocks, BIP68 / OpCheckSequenceVerify)</span>
            <input value={relSeq} onChange={(e) => setRelSeq(e.target.value)} inputMode="numeric"
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono light:bg-white light:border-slate-200 light:text-slate-900" />
            <span className="mt-1 block text-[11px] text-gray-500 light:text-slate-500 leading-snug">
              Counts from when the funds were received, not from now. The output must age this many blocks (about {Math.round((parseInt(relSeq || '0', 10) || 0) / 10)} seconds) before any spend is valid; the node rejects an earlier spend.
            </span>
          </label>
        )}
        {kind === 'timedecay' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-300 light:text-slate-700">Quorum now (of 2)</span>
              <input value={reqNow} onChange={(e) => setReqNow(e.target.value)} inputMode="numeric"
                className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono light:bg-white light:border-slate-200 light:text-slate-900" />
            </label>
            <label className="block">
              <span className="text-xs text-gray-300 light:text-slate-700">Quorum after deadline (of 2)</span>
              <input value={reqAfter} onChange={(e) => setReqAfter(e.target.value)} inputMode="numeric"
                className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono light:bg-white light:border-slate-200 light:text-slate-900" />
            </label>
            <p className="col-span-2 text-[11px] text-gray-500 light:text-slate-500 leading-snug">
              Before the deadline this many of 2 keys must sign; after it the lower quorum unlocks (a recovery path if a key is lost). Set 'after' below 'now' for the decay to mean anything.
            </p>
            {(parseInt(reqAfter || '0', 10) || 0) > (parseInt(reqNow || '0', 10) || 0) && (
              <p className="col-span-2 text-[11px] text-amber-300 light:text-amber-600 leading-snug">
                After-deadline quorum is higher than now, so the deadline makes the funds harder to spend, not easier. Set 'after' below 'now' for a recovery path.
              </p>
            )}
          </div>
        )}
        {kind === 'hashlock' && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200 light:text-amber-700 leading-snug">A random secret is generated at deploy. Save it: it is required to redeem and is never stored on the server. Lose it and you lose the funds.</p>
          </div>
        )}
        {kind === 'multisig' && (
          <p className="text-[11px] text-gray-400 light:text-slate-600">This demo locks to a 2-of-2 of the server-assisted dev wallets and redeems with both. Custom member keys are supported via the API.</p>
        )}
        {kind === 'htlc' && (
          <p className="text-[11px] text-gray-400 light:text-slate-600">Demo HTLC: the dev-wallet receiver claims by revealing a secret generated at deploy; the dev-wallet sender refunds after the timelock above. The cross-chain atomic-swap building block.</p>
        )}
        {kind === 'channel' && (
          <p className="text-[11px] text-gray-400 light:text-slate-600">Demo 2-of-2 state-channel pot of the dev wallets: cooperative close pays the agreed winner, or the funder reclaims after the timelock above. No resolver, Covex is never in the payout path.</p>
        )}
        {kind === 'deadman' && (
          <p className="text-[11px] text-gray-400 light:text-slate-600">Demo dead-man's switch: the owner (dev wallet 1) can spend any time; the heir (dev wallet 2) can claim only after the timelock above, so funds pass on if the owner goes silent.</p>
        )}
        {kind === 'oracle_enforced' && (
          <p className="text-[11px] text-gray-400 light:text-slate-600">A 2-of-2 of the resolver and the winner (dev wallet 1). The chain requires the resolver co-signature, and the resolver co-signs only the declared outcome. This kind uses the default engine-results resolver (deterministic move-log replay; engine results only). Binding your own external resolver needs a refundable kind (external cosign is not wired yet), so the funder can reclaim if the resolver does not act. Covex never attests real-world facts. Server-assisted demo; resolver covenants activate on mainnet at the Toccata hard fork.</p>
        )}
        {kind === 'oracle_escrow' && (
          <p className="text-[11px] text-gray-400 light:text-slate-600">A 2-player pot of the dev wallets that the chain releases only to the resolver-declared winner: it needs the resolver co-signature plus the winning player on their branch. This kind uses the default engine-results resolver. Binding your own external resolver needs a refundable kind (external cosign is not wired yet), so the funder can reclaim if the resolver does not act. Covex never attests real-world facts. Server-assisted demo; resolver covenants activate on mainnet at Toccata.</p>
        )}
        {(kind === 'oracle_enforced' || kind === 'oracle_escrow') && kindAllowsExternalResolver && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-gray-300 light:text-slate-700">External resolver key (optional, x-only hex)</label>
            <input
              type="text"
              value={resolverKey}
              onChange={(e) => setResolverKey(e.target.value)}
              placeholder="blank = default engine-results resolver. Paste a 64-hex resolver pubkey to bind on-chain to your own."
              className="w-full rounded-lg bg-black/30 light:bg-white border border-white/10 light:border-slate-300 px-3 py-2 text-xs font-mono text-gray-200 light:text-slate-800 placeholder:text-gray-600 light:placeholder:text-slate-400 focus:outline-none focus:border-kaspa-green/50"
            />
            <p className="text-[10px] text-gray-500 light:text-slate-500">When set, the deployed covenant embeds THIS key and requires its co-signature to release. Covex is not in the path. Covex does not attest real-world facts; bring your own resolver for those.</p>
          </div>
        )}
        {/* External-resolver-key field is GATED OFF for the non-refundable oracle kinds: binding an
            external key to them would create an unspendable payout branch (external cosign is not
            wired yet) with no refund fallback. Show the disabled field + an honest steer to a
            refundable kind. The default engine-results resolver path stays available (blank). */}
        {(kind === 'oracle_enforced' || kind === 'oracle_escrow') && !kindAllowsExternalResolver && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-gray-400 light:text-slate-500">External resolver key</label>
            <input
              type="text"
              value=""
              disabled
              aria-disabled="true"
              placeholder="Disabled for this kind. Uses the default engine-results resolver."
              className="w-full rounded-lg bg-black/20 light:bg-slate-100 border border-white/[0.06] light:border-slate-200 px-3 py-2 text-xs font-mono text-gray-500 light:text-slate-600 placeholder:text-gray-600 light:placeholder:text-slate-400 cursor-not-allowed"
            />
            <p className="text-[10px] text-gray-500 light:text-slate-500 leading-snug">
              External cosign is not yet wired. To bind an external resolver safely, choose a refundable kind so the funder can reclaim if the resolver does not act. See the connection guide (docs/CONNECTING_AN_ORACLE.md). This covenant deploys with the default engine-results resolver.
            </p>
          </div>
        )}
        {kind === 'binary_oracle_select' && (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-400 light:text-slate-600">A 2-outcome market bound to an EXTERNAL resolver you choose. Commit the two hashlocks it published (for a match: outcome A and outcome B, e.g. home win vs away win). The chain pays whichever side whose secret the resolver reveals; Covex attests nothing and is not in the payout path. If neither is revealed (a third outcome like a draw), the refund reclaims after the relative timelock below. Server-assisted demo (dev wallets fund).</p>
            <p className="text-[11px] text-amber-300/90 light:text-amber-700 leading-snug">Mapping is positional: <b>Outcome A hashlock</b> pays <b>Winner A</b>, <b>Outcome B hashlock</b> pays <b>Winner B</b>. Keep A and B in the resolver's published order. Any third result (e.g. a draw) reveals a secret that matches NEITHER branch, so the pot returns to the refund key after the timelock. If you pasted these from a resolver deep-link they already line up; if you edit them by hand, double-check the order.</p>
            <div className="grid grid-cols-2 gap-2">
              {[['Outcome A hashlock', hashA, setHashA, '64-hex blake2b256 hash'], ['Outcome B hashlock', hashB, setHashB, '64-hex blake2b256 hash'], ['Winner A key (x-only)', winnerA, setWinnerA, '64-hex x-only pubkey'], ['Winner B key (x-only)', winnerB, setWinnerB, '64-hex x-only pubkey']].map(([lbl, val, set, ph]) => (
                <div key={lbl} className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-300 light:text-slate-700">{lbl}</label>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    placeholder={ph}
                    className="w-full rounded-lg bg-black/30 light:bg-white border border-white/10 light:border-slate-300 px-3 py-2 text-xs font-mono text-gray-200 light:text-slate-800 placeholder:text-gray-600 light:placeholder:text-slate-400 focus:outline-none focus:border-kaspa-green/50"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-300 light:text-slate-700">Refund age (relative blocks)</label>
              <input
                type="number"
                min={1}
                max={65535}
                value={relSeq}
                onChange={(e) => setRelSeq(e.target.value)}
                className="w-full rounded-lg bg-black/30 light:bg-white border border-white/10 light:border-slate-300 px-3 py-2 text-xs font-mono text-gray-200 light:text-slate-800 focus:outline-none focus:border-kaspa-green/50"
              />
            </div>
            <p className="text-[10px] text-gray-500 light:text-slate-500">The covenant commits to THESE hashes. Only the resolver can reveal a secret, and only blake2b(secret) == the committed hash unlocks a branch on-chain. No resolver is named; you choose it.</p>
          </div>
        )}

        <DeployDisclosure reality={isHybridKind ? 'hybrid' : 'on-chain'} />

        {kind === 'market' ? (
          <button onClick={createMarket} disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-kaspa-green text-black font-semibold text-sm hover:shadow-[0_0_20px_rgba(73,234,203,0.3)] transition-all disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />} Create conditional-outcome covenant
          </button>
        ) : !usesDevWallets && !canSign ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 light:border-slate-200 light:bg-slate-50/60 space-y-3">
            <p className="text-sm text-gray-300 light:text-slate-700">
              Connect a wallet to sign the deploy. With KasWare, OKX, or Kastle, the funding transaction is signed in the wallet popup - your key never leaves the wallet (non-custodial). This is the primary path.
            </p>
            {covenantSignReason && activeWalletId && activeWalletId !== '__dev_mode__' && (
              <p className="text-[11px] text-amber-300 light:text-amber-700 leading-snug border border-amber-500/30 bg-amber-500/[0.06] rounded-lg px-3 py-2">
                {walletMeta?.name || 'This wallet'} is connected but cannot sign this covenant here: {covenantSignReason}
              </p>
            )}
            {/* Advanced (testnet): the raw-key dev path is a fallback for testnet covenant
                testing and offline recovery. Tucked behind a disclosure so the wallet popup is
                the obvious primary path. */}
            <details className="group rounded-lg border border-white/[0.06] bg-black/20 light:border-slate-200 light:bg-white">
              <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-semibold text-gray-400 light:text-slate-600 flex items-center justify-between">
                <span>Advanced (testnet): sign with a raw key</span>
                <span className="text-gray-600 light:text-slate-400 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="px-3 pb-3">
                <p className="text-[11px] text-gray-500 light:text-slate-500 mb-2 leading-snug">
                  Derive a key locally from a mnemonic or hex key for testnet covenant testing and offline recovery. The key never leaves your browser. Prefer a wallet popup above for real funds.
                </p>
                <DevConnectPanel compact />
              </div>
            </details>
          </div>
        ) : (
          <button onClick={deploy} disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-kaspa-green text-black font-semibold text-sm hover:shadow-[0_0_20px_rgba(73,234,203,0.3)] transition-all disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} Lock {stake} KAS into a {kindLabel} covenant{!usesDevWallets ? ' (non-custodial)' : ''}
          </button>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* This session's enforced covenants. Hidden in embedded mode: the host owns the
          post-deploy navigation (via onDeployed) and renders its own follow-up UI. */}
      {!effectiveEmbedded && mine.length > 0 && (
        <div className="relative z-10 glass-panel overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 light:border-slate-200">
            <div className="text-white light:text-slate-900 font-semibold">Your enforced covenants (this session)</div>
            <div className="text-xs text-gray-400 light:text-slate-600 mt-0.5">Deployed and live on-chain.</div>
          </div>
          <div className="divide-y divide-white/[0.04] light:divide-slate-200">
            {mine.map((c) => (
              <div
                key={c.tx}
                className={`px-6 py-4 space-y-2 transition-colors ${c.tx === justDeployedTx ? 'motion-safe:animate-[deploy-arrive_0.7s_cubic-bezier(0.16,1,0.3,1)] bg-kaspa-green/[0.06] ring-1 ring-inset ring-kaspa-green/30' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-md border border-emerald-500/30 light:border-emerald-300 bg-emerald-500/10 light:bg-emerald-50 text-emerald-300 light:text-emerald-700 text-[10px] font-bold uppercase">on-chain</span>
                    {c.nonCustodialDeploy && <span className="px-2 py-0.5 rounded-md border border-kaspa-green/30 bg-kaspa-green/10 text-kaspa-green light:text-[#0d9488] text-[10px] font-bold uppercase" title="Funded by a signature made in your browser; the key never reached the server">non-custodial</span>}
                    <span className="text-sm font-semibold text-white light:text-slate-900">{c.kind}</span>
                    <span className="text-xs text-gray-400 light:text-slate-600">{c.kas} KAS locked</span>
                  </div>
                  {c.spent
                    ? <span className="text-xs text-emerald-400 font-mono break-words">redeemed {String(c.spent).slice(0, 12)}...{c.nonCustodial ? ' (non-custodial: signed in your browser, key never sent)' : ''}</span>
                    : <button onClick={() => redeem(c)} disabled={busy}
                        className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white hover:bg-white/[0.1] disabled:opacity-60 light:bg-slate-100 light:border-slate-300 light:text-slate-800 light:hover:bg-slate-200">Redeem</button>}
                </div>
                <div className="text-[11px] text-gray-400 light:text-slate-600 font-mono break-all">
                  P2SH: {c.p2sh} <CopyBtn text={c.p2sh} />
                </div>
                <div className="text-[11px] text-gray-500 light:text-slate-500 font-mono break-all">
                  deploy tx: {String(c.tx).slice(0, 24)}...
                </div>
                {/* Build -> design -> publish handoff: a 3-button rail led by the Studio
                    (the next step), with share and the live public page right beside it.
                    Above the rail, the enforcement summary tells the truth about WHAT the
                    chain actually does with this covenant (consensus vs resolver co-sign). */}
                {(() => {
                  const sum = enforcementSummary(c.reality || 'on-chain');
                  const cid = `${c.tx}:0`;
                  return (
                    <div className="pt-2 space-y-2">
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 light:border-slate-200 light:bg-slate-50/60">
                        <div className="text-[12px] font-semibold text-white light:text-slate-900">{sum.headline}</div>
                        <div className="text-[11px] text-gray-400 light:text-slate-600 leading-snug mt-0.5">{sum.body}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={`/covenant/${encodeURIComponent(cid)}/studio`} className="btn-shimmer inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-kaspa-green text-black font-bold hover:brightness-110 transition-all"><Palette size={12} /> Open in Studio</a>
                        <button onClick={() => setShareForId(cid)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white hover:bg-white/[0.1] transition-colors light:bg-slate-100 light:border-slate-300 light:text-slate-800 light:hover:bg-slate-200"><Share2 size={12} /> Share link</button>
                        <a href={`/covenant/${encodeURIComponent(cid)}`} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white hover:bg-white/[0.1] transition-colors light:bg-slate-100 light:border-slate-300 light:text-slate-800 light:hover:bg-slate-200"><ExternalLink size={12} /> View public page</a>
                      </div>
                    </div>
                  );
                })()}
                {c.redeem_script_hex && !c.spent && (
                  <div className="text-[11px] text-amber-300 light:text-amber-800 font-mono break-all border border-amber-400/30 light:border-amber-500/40 bg-amber-400/[0.04] light:bg-amber-50 rounded-lg p-2 mt-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-sans font-semibold not-italic">Save your redeem script</span>
                      <button onClick={() => downloadRecoveryBundle(c)} className="font-sans inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-amber-400/40 light:border-amber-300 bg-amber-400/10 light:bg-amber-100 text-amber-200 light:text-amber-800 hover:bg-amber-400/20 light:hover:bg-amber-200 shrink-0">
                        <Download size={11} /> recovery bundle
                      </button>
                    </div>
                    It is REQUIRED to spend this covenant and is what makes it recoverable without trusting Covex. The downloadable bundle has everything to spend through ANY Kaspa node (also re-servable from the covenant page):
                    <div className="mt-1">{c.redeem_script_hex} <CopyBtn text={c.redeem_script_hex} /></div>
                  </div>
                )}
                {c.preimage && !c.spent && (
                  <div className="text-[11px] text-amber-300 light:text-amber-800 font-mono break-all">secret (save to redeem): {c.preimage} <CopyBtn text={c.preimage} /></div>
                )}
                {c.lock_daa && !c.spent && (
                  <div className="text-[11px] text-gray-400 light:text-slate-600">unlocks at DAA {c.lock_daa}{tipDaa ? (tipDaa >= c.lock_daa ? ' (elapsed - redeemable now)' : ` (~${c.lock_daa - tipDaa} blocks to go)`) : ''}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Honest catalog */}
      {!effectiveEmbedded && onchainEntries.length > 0 && (
        <div className="relative z-10 glass-panel p-6">
          <div className="text-white light:text-slate-900 font-semibold mb-3">What "on-chain enforced" means here</div>
          <p className="text-sm text-gray-300 light:text-slate-700 mb-4">
            Unlike resolver-attested or metadata covenants, these resolve purely by Kaspa script. The platform labels every
            covenant honestly - on-chain, resolver-attested, or metadata only - so trust is shown, never implied.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {onchainEntries.map((e) => (
              <div key={e.id} className="rounded-xl border border-white/10 bg-black/20 p-3 light:border-slate-200 light:bg-white">
                <div className="text-sm font-semibold text-white light:text-slate-900">{e.label}</div>
                <div className="text-[11px] text-gray-400 light:text-slate-600 mt-1">{e.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interact with ANY covenant, including ones not created on Covex. Intentionally
          subtle and at the bottom, but fully functional: any deterministic Kaspa P2SH
          covenant is spendable by its key-holder with only the redeem script.
          Hidden in embedded mode (and the redeem handoff forces standalone anyway). */}
      {!effectiveEmbedded && (
      <div className="relative z-10 glass-panel p-5 opacity-70 hover:opacity-100 transition-opacity">
        <button onClick={() => setExtOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
          <span className="text-xs font-medium text-gray-400 light:text-slate-700">Interact with any covenant (including ones not created on Covex)</span>
          <span className="text-gray-500 light:text-slate-500 text-[11px]">{extOpen ? 'hide' : 'open'}</span>
        </button>
        {extOpen && (
          <div className="mt-4 space-y-2.5">
            <p className="text-[11px] text-gray-500 light:text-slate-600">
              Any deterministic Kaspa P2SH covenant - single-signer (singlesig / hashlock / timelock) OR multi-party
              (multisig:N / htlc:DAA / channel:DAA) - is spendable here with ONLY the redeem script and the signers' keys.
              No Covex record needed. Each key signs in its own browser; only signatures are sent, never a key.
            </p>
            <textarea
              value={ext.redeem_script_hex}
              onChange={(e) => setExt((x) => ({ ...x, redeem_script_hex: e.target.value }))}
              placeholder="redeem script hex (the script that hashes to the on-chain P2SH)"
              className="w-full h-16 font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white resize-y light:bg-white light:border-slate-200 light:text-slate-900"
            />
            <div className="grid sm:grid-cols-2 gap-2">
              <input value={ext.tx} onChange={(e) => setExt((x) => ({ ...x, tx: e.target.value }))} placeholder="funding tx id" className="font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white light:bg-white light:border-slate-200 light:text-slate-900" />
              <input value={ext.outpoint} onChange={(e) => setExt((x) => ({ ...x, outpoint: e.target.value }))} placeholder="outpoint index (0)" className="font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white light:bg-white light:border-slate-200 light:text-slate-900" />
              <input value={ext.kind} onChange={(e) => setExt((x) => ({ ...x, kind: e.target.value }))} placeholder="kind: singlesig | hashlock | timelock:DAA | multisig:N | htlc:DAA | channel:DAA" className="font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white light:bg-white light:border-slate-200 light:text-slate-900" />
              <input value={ext.dest} onChange={(e) => setExt((x) => ({ ...x, dest: e.target.value }))} placeholder="destination address (default: you)" className="font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white light:bg-white light:border-slate-200 light:text-slate-900" />
            </div>
            {(ext.kind.trim().startsWith('hashlock') || (ext.kind.trim().startsWith('htlc') && ext.branch !== 'refund')) && (
              <input value={ext.preimage} onChange={(e) => setExt((x) => ({ ...x, preimage: e.target.value }))} placeholder="preimage hex (required for hashlock / HTLC claim)" className="w-full font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white light:bg-white light:border-slate-200 light:text-slate-900" />
            )}
            {(ext.kind.trim().startsWith('htlc') || ext.kind.trim().startsWith('channel')) && (
              <div className="flex items-center gap-2 text-[11px] text-gray-400 light:text-slate-600">
                <span>branch:</span>
                {(ext.kind.trim().startsWith('htlc') ? ['claim', 'refund'] : ['close', 'refund']).map((b) => (
                  <button key={b} onClick={() => setExt((x) => ({ ...x, branch: b }))} className={`px-2.5 py-1 rounded-md border ${ext.branch === b || (!ext.branch && (b === 'claim' || b === 'close')) ? 'border-kaspa-green/50 bg-kaspa-green/[0.08] text-kaspa-green' : 'border-white/10 text-gray-300 light:border-slate-300 light:text-slate-700'}`}>{b}</button>
                ))}
              </div>
            )}
            {(ext.kind.trim().startsWith('multisig') || (ext.kind.trim().startsWith('channel') && ext.branch !== 'refund')) && (
              <textarea
                value={ext.cosigs}
                onChange={(e) => setExt((x) => ({ ...x, cosigs: e.target.value }))}
                placeholder={'co-signer signatures (one per line: <signer_xonly>:<signature_hex>). Your in-browser key signs its own slot automatically; paste the OTHER members\' signatures here. Each signs the SAME sighash returned by prepare-spend.'}
                className="w-full h-16 font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white resize-y light:bg-white light:border-slate-200 light:text-slate-900"
              />
            )}
            <button onClick={interactExternal} disabled={busy} className="text-xs px-4 py-2 rounded-lg bg-white/[0.06] border border-white/10 text-white hover:bg-white/[0.1] disabled:opacity-60 light:bg-slate-100 light:border-slate-300 light:text-slate-800 light:hover:bg-slate-200">
              {busy ? 'Working...' : 'Spend this covenant (non-custodial)'}
            </button>
          </div>
        )}
      </div>
      )}

      {/* Share + embed modal for any deployed covenant in this session. Opens when the
          per-row "Share link" button sets shareForId; reality is preselected from the
          covenant entry so the OG preview never overclaims. */}
      {shareForId && (() => {
        const c = mine.find((x) => `${x.tx}:0` === shareForId);
        return (
          <ShareEmbedModal
            open={!!shareForId}
            onClose={() => setShareForId(null)}
            id={shareForId}
            network={net}
            name={c ? `${c.kind} covenant` : 'Covenant'}
            reality={(c && c.reality) || 'on-chain'}
          />
        );
      })()}
    </div>
  );
}
