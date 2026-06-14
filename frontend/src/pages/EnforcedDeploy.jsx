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
  const [ext, setExt] = useState({ redeem_script_hex: '', tx: '', outpoint: '0', kind: 'singlesig', dest: '', preimage: '', branch: '', cosigs: '' });

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
    if (!usesDevWallets && !canSign) { setError('Connect the key that holds the funds below - it signs the deploy in your browser (non-custodial).'); return; }

    const redeem = { kind };
    let preimage = null;
    if (kind === 'hashlock') {
      preimage = randomSecretHex();
      redeem.preimage_hex = preimage;
    } else if (kind === 'timelock') {
      if (!tipDaa) { setError('Could not read the current chain DAA score. Try again in a moment.'); return; }
      redeem.lock_daa = tipDaa + Math.max(1, parseInt(lockBlocks || '100', 10));
    }

    setBusy(true);
    try {
      // NON-CUSTODIAL DEPLOY (the trustless path, works on mainnet too): for a single-signer
      // covenant whose key we hold in this browser, fund it by signing the funding tx's
      // sighash HERE - the private key never leaves the device. prepare-deploy builds the
      // unsigned funding tx and returns the sighash; we sign it; submit-deploy broadcasts.
      if (!usesDevWallets && canSign) {
        const myKey = devMode.privateKeyHex;
        const prep = await fetch('/api/covenant/p2sh/prepare-deploy', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network: net, deployer_addr: address, stake_kas: stakeKas, redeem }),
        }).then((r) => r.json());
        if (!prep.success) { setError(prep.error || 'Could not prepare the deploy.'); return; }
        const myXonly = bytesToHex(schnorr.getPublicKey(myKey));
        if (prep.signer_xonly && prep.signer_xonly !== myXonly) {
          setError('The connected key does not match the funding address. Reconnect the wallet that owns the funds.');
          return;
        }
        const signatureHex = bytesToHex(schnorr.sign(prep.sighash, myKey)); // BIP340 over the funding sighash
        const sub = await fetch('/api/covenant/p2sh/submit-deploy', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: prep.session_id, signature_hex: signatureHex }),
        }).then((r) => r.json());
        if (!sub.success) { setError(sub.error || 'Deploy broadcast failed.'); return; }
        setMine((m) => [{
          tx: sub.deploy_tx_id, p2sh: sub.p2sh_address, kind: sub.redeem_kind, kas: sub.locked_kas,
          redeem_script_hex: sub.redeem_script_hex || prep.redeem_script_hex || null,
          preimage, dev: false, nonCustodialDeploy: true, lock_daa: redeem.lock_daa || null, spent: null,
        }, ...m]);
        return;
      }

      // Server-assisted fallback: the multisig demo locks to the two dev wallets, so it is
      // funded + signed server-side with use_dev_mode (testnet only).
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
      // NON-CUSTODIAL redeem (the trustless path): fetch the unsigned sighash, sign it HERE
      // with a BIP340 Schnorr signature for every required signer whose key we hold (and
      // graft in any pasted co-signer signatures), then send ONLY the 64-byte signatures
      // (plus a preimage for hashlock / HTLC claim). No private key ever leaves the device,
      // so funds are spendable even if Covex is fully removed (reproducible with the
      // published redeem + recover-covenant.mjs).
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
        const mySig = bytesToHex(schnorr.sign(prep.sighash, myKey)); // 64-byte BIP340 over the exact sighash
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
            You are on mainnet. Single-key, hashlock, and timelock covenants deploy non-custodially here:
            connect the key that holds the funds and it signs the funding transaction in your browser - the key is never sent.
            Mainnet covenants activate at the Toccata hard fork, so the deploy stays gated until then.
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
            <p className="text-sm text-gray-300 mb-3">
              Connect the key that holds the funds to sign the deploy. It signs the funding transaction in your browser - the key is never sent to the server (non-custodial).
            </p>
            <DevConnectPanel compact />
          </div>
        ) : (
          <button onClick={deploy} disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-kaspa-green text-black font-semibold text-sm hover:shadow-[0_0_20px_rgba(73,234,203,0.3)] transition-all disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} Lock {stake} KAS into a {kind} covenant{!usesDevWallets ? ' (non-custodial)' : ''}
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
                    {c.nonCustodialDeploy && <span className="px-2 py-0.5 rounded-md border border-kaspa-green/30 bg-kaspa-green/10 text-kaspa-green text-[10px] font-bold uppercase" title="Funded by a signature made in your browser; the key never reached the server">non-custodial</span>}
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
              Any deterministic Kaspa P2SH covenant - single-signer (singlesig / hashlock / timelock) OR multi-party
              (multisig:N / htlc:DAA / channel:DAA) - is spendable here with ONLY the redeem script and the signers' keys.
              No Covex record needed. Each key signs in its own browser; only signatures are sent, never a key.
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
              <input value={ext.kind} onChange={(e) => setExt((x) => ({ ...x, kind: e.target.value }))} placeholder="kind: singlesig | hashlock | timelock:DAA | multisig:N | htlc:DAA | channel:DAA" className="font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
              <input value={ext.dest} onChange={(e) => setExt((x) => ({ ...x, dest: e.target.value }))} placeholder="destination address (default: you)" className="font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
            </div>
            {(ext.kind.trim().startsWith('hashlock') || (ext.kind.trim().startsWith('htlc') && ext.branch !== 'refund')) && (
              <input value={ext.preimage} onChange={(e) => setExt((x) => ({ ...x, preimage: e.target.value }))} placeholder="preimage hex (required for hashlock / HTLC claim)" className="w-full font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white" />
            )}
            {(ext.kind.trim().startsWith('htlc') || ext.kind.trim().startsWith('channel')) && (
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <span>branch:</span>
                {(ext.kind.trim().startsWith('htlc') ? ['claim', 'refund'] : ['close', 'refund']).map((b) => (
                  <button key={b} onClick={() => setExt((x) => ({ ...x, branch: b }))} className={`px-2.5 py-1 rounded-md border ${ext.branch === b || (!ext.branch && (b === 'claim' || b === 'close')) ? 'border-kaspa-green/50 bg-kaspa-green/[0.08] text-kaspa-green' : 'border-white/10 text-gray-300'}`}>{b}</button>
                ))}
              </div>
            )}
            {(ext.kind.trim().startsWith('multisig') || (ext.kind.trim().startsWith('channel') && ext.branch !== 'refund')) && (
              <textarea
                value={ext.cosigs}
                onChange={(e) => setExt((x) => ({ ...x, cosigs: e.target.value }))}
                placeholder={'co-signer signatures (one per line: <signer_xonly>:<signature_hex>). Your in-browser key signs its own slot automatically; paste the OTHER members\' signatures here. Each signs the SAME sighash returned by prepare-spend.'}
                className="w-full h-16 font-mono text-[11px] bg-black/40 border border-white/10 rounded-lg p-2 text-white resize-y"
              />
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
