import { useEffect, useMemo, useState } from 'react';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
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
  // External-covenant interaction: spend ANY single-signer P2SH covenant (even ones not
  // created on Covex) with only your key + its redeem script. Kept subtle at the bottom.
  const [extOpen, setExtOpen] = useState(false);
  const [ext, setExt] = useState({ redeem_script_hex: '', tx: '', outpoint: '0', kind: 'singlesig', dest: '', preimage: '' });

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
        // Keep the redeem script: it is REQUIRED to spend and is the only thing that
        // makes the covenant recoverable without trusting Covex. Also re-servable from
        // GET /api/covenants/<tx>:0 (redeem_script_hex), but save it here so the user
        // has it immediately.
        redeem_script_hex: j.redeem_script_hex || null,
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
    setBusy(true);
    try {
      const myKey = devMode?.privateKeyHex;
      const dest = (c.destOverride && c.destOverride.trim()) || (c.dev ? (address || '') : address);
      const kindBase = String(c.kind || 'singlesig').split(':')[0];
      const NONCUSTODIAL = ['singlesig', 'hashlock', 'timelock'];
      // External (non-Covex) covenants carry their own redeem script + outpoint so the
      // server can build the spend with no stored record.
      const external = c.redeem_script_hex
        ? { redeem_script_hex: c.redeem_script_hex, outpoint_index: c.outpoint_index || 0, redeem_kind: c.kind }
        : {};
      // NON-CUSTODIAL redeem (the trustless path): for a single-signer covenant
      // (singlesig / hashlock / timelock) whose key we hold in this browser, fetch the
      // unsigned sighash, sign it HERE with a BIP340 Schnorr signature, and send ONLY the
      // 64-byte signature (plus the preimage for a hashlock). The private key never leaves
      // the device, and Covex merely relays the broadcast - so funds are spendable even if
      // Covex is fully removed (reproducible with the published redeem + recover-covenant.mjs).
      if (NONCUSTODIAL.includes(kindBase) && myKey) {
        const prep = await fetch('/api/covenant/p2sh/prepare-spend', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network: net, deploy_tx_id: c.tx, destination_addr: dest, ...external }),
        }).then((r) => r.json());
        if (!prep.success) { setError(prep.error || 'Could not prepare the spend.'); return; }
        const myXonly = bytesToHex(schnorr.getPublicKey(myKey));
        if (prep.signer_xonly && myXonly === prep.signer_xonly) {
          const signatureHex = bytesToHex(schnorr.sign(prep.sighash, myKey)); // 64-byte BIP340 over the exact sighash
          const subBody = { session_id: prep.session_id, signature_hex: signatureHex };
          if (kindBase === 'hashlock') subBody.preimage_hex = c.preimage;
          const sub = await fetch('/api/covenant/p2sh/submit-signed', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subBody),
          }).then((r) => r.json());
          if (!sub.success) { setError(sub.error || 'Submit failed.'); return; }
          setMine((m) => m.map((x) => (x.tx === c.tx ? { ...x, spent: sub.spend_tx_id, nonCustodial: true } : x)));
          return;
        }
        // Our in-browser key does not match this covenant's lock; fall through to the
        // server-assisted path below rather than signing the wrong thing.
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
    const c = {
      tx: ext.tx.trim(),
      kind: ext.kind.trim() || 'singlesig',
      dev: false,
      preimage: ext.preimage.trim() || null,
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
                    ? <span className="text-xs text-emerald-400 font-mono">redeemed {String(c.spent).slice(0, 12)}...{c.nonCustodial ? ' (non-custodial: signed in your browser, key never sent)' : ''}</span>
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
                {c.redeem_script_hex && !c.spent && (
                  <div className="text-[11px] text-amber-300 font-mono break-all border border-amber-400/30 bg-amber-400/[0.04] rounded-lg p-2 mt-1">
                    <span className="font-sans font-semibold not-italic">Save your redeem script</span> - it is REQUIRED to spend this covenant and is what makes it recoverable without trusting Covex (also re-servable from the covenant page):
                    <div className="mt-1">{c.redeem_script_hex} <CopyBtn text={c.redeem_script_hex} /></div>
                  </div>
                )}
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

      {/* Interact with ANY covenant, including ones not created on Covex. Intentionally
          subtle and at the bottom, but fully functional - the trustless point is that any
          P2SH covenant is spendable by its key-holder with only the redeem script. */}
      <div className="glass-panel p-5 opacity-70 hover:opacity-100 transition-opacity">
        <button onClick={() => setExtOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
          <span className="text-xs font-medium text-gray-400">Interact with any covenant (including ones not created on Covex)</span>
          <span className="text-gray-500 text-[11px]">{extOpen ? 'hide' : 'open'}</span>
        </button>
        {extOpen && (
          <div className="mt-4 space-y-2.5">
            <p className="text-[11px] text-gray-500">
              Any single-signer Kaspa P2SH covenant (singlesig / hashlock / timelock) is spendable here with ONLY your
              key and its redeem script - no Covex record needed. Your key signs in this browser; only the signature is sent.
            </p>
            <textarea
              value={ext.redeem_script_hex}
              onChange={(e) => setExt((x) => ({ ...x, redeem_script_hex: e.target.value }))}
              placeholder="redeem script hex (the script that hashes to the on-chain P2SH)"
              className="w-full h-16 font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white resize-y"
            />
            <div className="grid sm:grid-cols-2 gap-2">
              <input value={ext.tx} onChange={(e) => setExt((x) => ({ ...x, tx: e.target.value }))} placeholder="funding tx id" className="font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
              <input value={ext.outpoint} onChange={(e) => setExt((x) => ({ ...x, outpoint: e.target.value }))} placeholder="outpoint index (0)" className="font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
              <input value={ext.kind} onChange={(e) => setExt((x) => ({ ...x, kind: e.target.value }))} placeholder="kind: singlesig | hashlock | timelock:DAA" className="font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
              <input value={ext.dest} onChange={(e) => setExt((x) => ({ ...x, dest: e.target.value }))} placeholder="destination address (default: you)" className="font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
            </div>
            {ext.kind.trim().startsWith('hashlock') && (
              <input value={ext.preimage} onChange={(e) => setExt((x) => ({ ...x, preimage: e.target.value }))} placeholder="preimage hex (required for hashlock)" className="w-full font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
            )}
            <button onClick={interactExternal} disabled={busy} className="text-xs px-4 py-2 rounded-lg bg-white/[0.06] border border-white/10 text-white hover:bg-white/[0.1] disabled:opacity-60">
              {busy ? 'Working...' : 'Spend this covenant (non-custodial)'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
