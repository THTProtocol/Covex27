import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Lock, KeyRound, Clock, Users, Loader2, ExternalLink, Copy, Check } from 'lucide-react';
import { useWallet, getCurrentNetwork } from '../components/WalletContext';

// The four genuinely on-chain-enforced covenant primitives (covenant_builder).
const KINDS = [
  { id: 'singlesig', label: 'Single-key', icon: KeyRound, blurb: 'Funds lock to a script hash, spendable only by your key. The minimal real covenant.' },
  { id: 'hashlock', label: 'Hashlock', icon: Lock, blurb: 'Release requires revealing a secret preimage plus a signature. The HTLC building block.' },
  { id: 'timelock', label: 'Timelock', icon: Clock, blurb: 'Funds are spendable only once the chain DAA score reaches the unlock point. Vesting, dispute windows.' },
  { id: 'multisig', label: 'Multisig (2-of-2 demo)', icon: Users, blurb: 'Release requires 2 of 2 dev-wallet keys. DAO treasuries, 2-of-3 escrow. Demo uses the testnet dev wallets.' },
];

function randomSecretHex() {
  const b = new Uint8Array(24);
  (window.crypto || window.msCrypto).getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-kaspa-green transition-colors"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'copied' : 'copy'}
    </button>
  );
}

export default function EnforcedDeploy() {
  const { address, isDevMode, devMode, DevConnectPanel } = useWallet();
  const net = getCurrentNetwork();
  const isMainnet = net === 'mainnet' || net === 'mainnet-1';
  const canSign = isDevMode && devMode?.privateKeyHex;

  const [catalog, setCatalog] = useState([]);
  const [kind, setKind] = useState('singlesig');
  const [stake, setStake] = useState('1.0');
  const [lockBlocks, setLockBlocks] = useState('100');
  const [tipDaa, setTipDaa] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mine, setMine] = useState([]); // deploys this session: {tx, p2sh, kind, kas, preimage, dev, lock_daa, spent}

  useEffect(() => {
    fetch('/api/covenant/catalog').then((r) => r.json()).then((j) => setCatalog(j.catalog || [])).catch(() => {});
    fetch('/api/status').then((r) => r.json()).then((j) => {
      const n = j.node_sync && j.node_sync[net];
      if (n && n.tip_daa) setTipDaa(n.tip_daa);
    }).catch(() => {});
  }, [net]);

  const onchainEntries = useMemo(() => catalog.filter((e) => e.enforcement_reality === 'on-chain'), [catalog]);
  const usesDevWallets = kind === 'multisig';

  async function deploy() {
    setError(null);
    const stakeKas = parseFloat(stake);
    if (!(stakeKas > 0)) { setError('Enter a stake greater than 0.'); return; }
    if (!usesDevWallets && !canSign) { setError('Connect a testnet key below to sign the deploy.'); return; }

    const redeem = { kind };
    let preimage = null;
    if (kind === 'hashlock') {
      preimage = randomSecretHex();
      redeem.preimage_hex = preimage;
    } else if (kind === 'timelock') {
      if (!tipDaa) { setError('Could not read the current chain DAA score. Try again in a moment.'); return; }
      redeem.lock_daa = tipDaa + Math.max(1, parseInt(lockBlocks || '100', 10));
    }

    const body = usesDevWallets
      ? { network: net, deployer_addr: address || '', use_dev_mode: true, stake_kas: stakeKas, redeem }
      : { network: net, deployer_addr: address, use_dev_mode: false, private_key_hex: devMode.privateKeyHex, stake_kas: stakeKas, redeem };

    setBusy(true);
    try {
      const res = await fetch('/api/covenant/p2sh/deploy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) { setError(j.error || 'Deploy failed.'); return; }
      setMine((m) => [{
        tx: j.deploy_tx_id, p2sh: j.p2sh_address, kind: j.redeem_kind, kas: j.locked_kas,
        preimage, dev: usesDevWallets, lock_daa: redeem.lock_daa || null, spent: null,
      }, ...m]);
    } catch (e) {
      setError('Network error: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function redeem(c) {
    setError(null);
    const body = {
      network: net, deploy_tx_id: c.tx, destination_addr: c.dev ? (address || '') : address,
    };
    if (c.dev) body.use_dev_mode = true;
    else { body.use_dev_mode = false; body.private_key_hex = devMode.privateKeyHex; }
    if (c.kind === 'hashlock') body.preimage_hex = c.preimage;

    setBusy(true);
    try {
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

  const KindIcon = KINDS.find((k) => k.id === kind)?.icon || ShieldCheck;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="text-emerald-400" size={26} />
          <h1 className="text-2xl font-semibold text-white tracking-tight">Deploy an Enforced Covenant</h1>
          <span className="px-2 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">On-chain</span>
        </div>
        <p className="text-sm text-gray-300 max-w-2xl">
          These covenants are enforced by Kaspa consensus itself. Funds lock to a script hash and can only move by satisfying
          the script - no oracle, no trust. Every spend was proven against the real Kaspa script engine before this shipped.
        </p>
      </div>

      {isMainnet && (
        <div className="glass-panel p-4 border-amber-500/30 bg-amber-500/[0.05]">
          <p className="text-sm text-amber-200">
            You are on mainnet. Enforced deploys here need wallet-side signing (coming soon). Switch to a testnet to try them now.
          </p>
        </div>
      )}

      {/* Kind picker */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KINDS.map((k) => {
          const Icon = k.icon;
          const active = kind === k.id;
          return (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`text-left p-4 rounded-xl border transition-all ${active ? 'border-kaspa-green/60 bg-kaspa-green/[0.06]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
            >
              <Icon size={18} className={active ? 'text-kaspa-green' : 'text-gray-300'} />
              <div className="mt-2 text-sm font-semibold text-white">{k.label}</div>
              <div className="mt-1 text-[11px] text-gray-400 leading-snug">{k.blurb}</div>
            </button>
          );
        })}
      </div>

      {/* Param form */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex items-center gap-2 text-white font-semibold"><KindIcon size={16} className="text-kaspa-green" /> Parameters</div>
        <label className="block">
          <span className="text-xs text-gray-300">Stake to lock (KAS)</span>
          <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal"
            className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono" />
        </label>
        {kind === 'timelock' && (
          <label className="block">
            <span className="text-xs text-gray-300">Lock for (DAA blocks from now){tipDaa ? ` - unlocks at DAA ${tipDaa + Math.max(1, parseInt(lockBlocks || '100', 10))}` : ''}</span>
            <input value={lockBlocks} onChange={(e) => setLockBlocks(e.target.value)} inputMode="numeric"
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono" />
          </label>
        )}
        {kind === 'hashlock' && (
          <p className="text-[11px] text-gray-400">A random secret is generated at deploy. Save it - it is required to redeem and is never stored on the server.</p>
        )}
        {kind === 'multisig' && (
          <p className="text-[11px] text-gray-400">This demo locks to a 2-of-2 of the testnet dev wallets and redeems with both. Custom member keys are supported via the API.</p>
        )}

        {!usesDevWallets && !canSign ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-gray-300 mb-3">Connect a testnet key to sign the deploy (real on-chain transaction).</p>
            <DevConnectPanel compact />
          </div>
        ) : (
          <button onClick={deploy} disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-kaspa-green text-black font-semibold text-sm hover:shadow-[0_0_20px_rgba(73,234,203,0.3)] transition-all disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} Lock {stake} KAS into a {kind} covenant
          </button>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* This session's enforced covenants */}
      {mine.length > 0 && (
        <div className="glass-panel overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 text-white font-semibold">Your enforced covenants (this session)</div>
          <div className="divide-y divide-white/[0.04]">
            {mine.map((c) => (
              <div key={c.tx} className="px-6 py-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-bold uppercase">on-chain</span>
                    <span className="text-sm font-semibold text-white">{c.kind}</span>
                    <span className="text-xs text-gray-400">{c.kas} KAS locked</span>
                  </div>
                  {c.spent
                    ? <span className="text-xs text-emerald-400 font-mono">redeemed {String(c.spent).slice(0, 12)}...</span>
                    : <button onClick={() => redeem(c)} disabled={busy}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/10 text-white hover:bg-white/[0.1] disabled:opacity-60">Redeem</button>}
                </div>
                <div className="text-[11px] text-gray-400 font-mono break-all">
                  P2SH: {c.p2sh} <CopyBtn text={c.p2sh} />
                </div>
                <div className="text-[11px] text-gray-500 font-mono break-all flex items-center gap-2">
                  deploy tx: {String(c.tx).slice(0, 24)}...
                  <a href={`/covenant/${c.tx}:0`} className="inline-flex items-center gap-1 text-gray-400 hover:text-kaspa-green"><ExternalLink size={11} /> view</a>
                </div>
                {c.preimage && !c.spent && (
                  <div className="text-[11px] text-amber-300 font-mono break-all">secret (save to redeem): {c.preimage} <CopyBtn text={c.preimage} /></div>
                )}
                {c.lock_daa && !c.spent && (
                  <div className="text-[11px] text-gray-400">unlocks at DAA {c.lock_daa}{tipDaa ? (tipDaa >= c.lock_daa ? ' (elapsed - redeemable now)' : ` (~${c.lock_daa - tipDaa} blocks to go)`) : ''}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Honest catalog */}
      {onchainEntries.length > 0 && (
        <div className="glass-panel p-6">
          <div className="text-white font-semibold mb-3">What "on-chain enforced" means here</div>
          <p className="text-sm text-gray-300 mb-4">
            Unlike oracle-attested or metadata covenants, these resolve purely by Kaspa script. The platform labels every
            covenant honestly - on-chain, oracle-attested, or metadata only - so trust is shown, never implied.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {onchainEntries.map((e) => (
              <div key={e.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-sm font-semibold text-white">{e.label}</div>
                <div className="text-[11px] text-gray-400 mt-1">{e.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
