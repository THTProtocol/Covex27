import { useState, useEffect, useMemo } from 'react';
import {
  LifeBuoy, ShieldCheck, KeyRound, Copy, Check, ExternalLink, Search,
  Upload, AlertTriangle, ArrowLeft, Coins, Loader2, Wallet, Send, Download, Snowflake,
} from 'lucide-react';
import { explorerAddressUrl, explorerTxUrl } from '../lib/explorer';
import { hasPublicApi, fetchAddressBalanceSompi, fetchAddressUtxos, sompiToKas } from '../lib/kaspaPublicApi';
import { useWallet } from '../components/WalletContext';
import {
  KIND_CLAIM_MATRIX, claimability, assertSignerForBranch,
  buildSatisfier, buildUnsignedSpend, signInput, assembleSigScript, broadcast, exportSignedTxJson,
} from '../lib/redeemer/covenantRedeemer';

// Standalone, Covex-independent recovery page. Every covenant Covex deploys is a script-enforced P2SH
// covenant: the KASPA CHAIN enforces the spend rules, not Covex. So a holder can settle directly from
// any Kaspa node using only the published redeem script plus their own key(s) - even if Covex is
// permanently offline. This page reads a saved recovery kit (or looks one up while the API is reachable),
// then drives the VERIFIED client-side redeemer (covenantRedeemer.js) to actually build, sign LOCALLY,
// and broadcast (or export) the spend in-browser. The private key never leaves the browser.

// Normalize the kit network to what buildUnsignedSpend/broadcast accept.
const normNetwork = (n) => (n === 'mainnet-1' ? 'mainnet' : (n || 'mainnet'));
const isMainnetNet = (n) => normNetwork(n) === 'mainnet';

// Default per-network fee in sompi (the SOLE output value is utxo.amount - fee, derived in buildUnsignedSpend).
const DEFAULT_FEE_SOMPI = 2000n;

// Branches a user can select per kind, with honest labels. Single-branch kinds auto-select.
const KIND_BRANCHES = {
  singlesig: [{ value: 'claim', label: 'Spend with your key' }],
  timelock: [{ value: 'claim', label: 'Spend after locktime' }],
  rcsv: [{ value: 'claim', label: 'Spend after relative delay' }],
  hashlock: [{ value: 'claim', label: 'Reveal preimage + spend' }],
  multisig: [{ value: 'claim', label: 'Spend with the threshold of keys' }],
  htlc: [
    { value: 'claim', label: 'Claim (receiver, reveal preimage)' },
    { value: 'refund', label: 'Refund (sender, after timeout)' },
  ],
  deadman: [
    { value: 'claim', label: 'Owner spend' },
    { value: 'refund', label: 'Heir takeover (after delay)' },
  ],
  channel: [
    { value: 'close', label: 'Cooperative close (needs BOTH player signatures)' },
    { value: 'refund', label: 'Funder refund (after timeout)' },
  ],
  binary_oracle_select: [
    { value: 'revealA', label: 'Claim as winner A (after the oracle reveals the secret)' },
    { value: 'revealB', label: 'Claim as winner B (after the oracle reveals the secret)' },
    { value: 'refund', label: 'Refund (after CSV delay)' },
  ],
  oracle_escrow: [
    { value: 'revealA', label: 'Payout to player A (needs oracle co-sign)' },
    { value: 'revealB', label: 'Payout to player B (needs oracle co-sign)' },
  ],
  oracle_enforced: [
    { value: 'claim', label: 'Winner payout (needs oracle co-sign)' },
  ],
  oracle_enforced_refundable: [
    { value: 'claim', label: 'Winner payout (needs oracle co-sign)' },
    { value: 'refund', label: 'Refund (after lock_daa, offline-claimable)' },
  ],
  oracle_escrow_refundable: [
    { value: 'revealA', label: 'Payout to player A (needs oracle co-sign)' },
    { value: 'revealB', label: 'Payout to player B (needs oracle co-sign)' },
    { value: 'refund', label: 'Refund (after lock_daa, offline-claimable)' },
  ],
};

const KIND_HINTS = {
  singlesig: 'Provide a signature from your committed key. The script checks it; that is the whole condition.',
  timelock: 'Spendable only after the covenant’s locktime / DAA threshold. Any Kaspa node enforces the wait, then you sign with your key.',
  hashlock: 'Reveal the secret preimage whose hash the script commits to, plus a signature from your key.',
  multisig: 'Collect the required threshold of signatures from the committed keys, then build the spend.',
  htlc: 'Two paths: reveal the preimage to claim, or wait out the timeout to refund. Then sign and broadcast.',
  channel: 'Cooperative close needs both signatures; otherwise the funder takes the refund path after the timeout.',
  p2sh: 'Provide the redeem script in the input and satisfy its conditions with your key(s).',
};

function CopyRow({ label, value }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1">{label}</div>
      <button
        onClick={() => navigator.clipboard?.writeText(String(value)).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); })}
        className="group w-full inline-flex items-start gap-2 rounded-lg border border-white/10 light:border-slate-200 bg-black/30 light:bg-slate-50 px-3 py-2 text-left transition-colors hover:border-kaspa-green/40"
        title="Copy"
      >
        <span className="flex-1 text-[11px] font-mono text-gray-300 light:text-slate-700 break-all leading-snug">{value}</span>
        {done ? <Check size={13} className="text-kaspa-green shrink-0 mt-0.5" /> : <Copy size={13} className="text-gray-500 group-hover:text-kaspa-green shrink-0 mt-0.5" />}
      </button>
    </div>
  );
}

function normalizeKit(obj) {
  const c = (obj && typeof obj === 'object' && obj.covenant) ? obj.covenant : obj;
  if (!c || typeof c !== 'object') return null;
  return {
    tx_id: c.tx_id || c.txid || null,
    network: c.network || null,
    address: c.p2sh_address || c.address || null,
    redeem_kind: c.redeem_kind || c.kind || null,
    redeem_script_hex: c.redeem_script_hex || null,
    script_hash: c.script_hash || c.script_hex || null,
    receiving_addresses: c.receiving_addresses || null,
    // Optional enrichments the kit now carries (see RecoveryKitModal). Best-effort.
    revealed_secret: c.revealed_secret || c.preimage || null,
    branch_roles: c.branch_roles || null,
    oracle_pubkey: c.oracle_pubkey || null,
    lock_daa: c.lock_daa ?? null,
  };
}

// ===========================================================================
// In-browser CLAIM FLOW. Hoisted to module scope (never define inside Recover so
// it does not remount on every parent render and lose the key/branch state).
// Drives the VERIFIED redeemer: assertSignerForBranch -> buildUnsignedSpend ->
// signInput (LOCAL) -> assembleSigScript -> broadcast OR exportSignedTxJson.
// ===========================================================================
function ClaimFlow({ kit, utxos }) {
  const wallet = useWallet();
  const net = normNetwork(kit.network);
  const mainnet = isMainnetNet(kit.network);
  const kind = String(kit.redeem_kind || '').split(':')[0] || 'p2sh';
  const matrix = KIND_CLAIM_MATRIX[kind] || null;

  const branches = KIND_BRANCHES[kind] || [{ value: 'claim', label: 'Spend with your key' }];
  const [branch, setBranch] = useState(branches[0]?.value || 'claim');
  const claim = useMemo(() => claimability(kind, branch), [kind, branch]);

  // Signing source: a dev/imported wallet holds its private key in this browser and CAN sign a
  // covenant input; a wallet extension exposes no covenant-input signing API, so for it (and the
  // offline case) the holder pastes the branch key, which is used locally and cleared after.
  const canUseDevKey = wallet.isDevMode && wallet.devMode?.privateKeyHex && (!mainnet || true);
  const [signMode, setSignMode] = useState(canUseDevKey ? 'wallet' : 'paste');
  const [privKey, setPrivKey] = useState('');
  const [preimage, setPreimage] = useState(kit.revealed_secret || '');
  const [destAddr, setDestAddr] = useState('');
  const [lockTime, setLockTime] = useState('');
  const [sequence, setSequence] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'ok'|'err'|'info', msg }
  const [result, setResult] = useState(null); // { txid } or { json }

  const firstUtxo = Array.isArray(utxos) && utxos.length > 0 ? utxos[0] : null;
  const needsPreimage = (kind === 'hashlock') || (kind === 'htlc' && branch === 'claim') || (kind === 'binary_oracle_select' && (branch === 'revealA' || branch === 'revealB'));
  const isRefund = branch === 'refund';
  const oracleNeeded = claim && !claim.offline;

  // Default the destination to the connected wallet address (the holder's own payout address).
  useEffect(() => {
    if (!destAddr && wallet.address) setDestAddr(wallet.address);
  }, [wallet.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve the private key for this signing attempt. NEVER transmitted; lives only here.
  const resolvePrivKey = () => {
    if (signMode === 'wallet') {
      if (!canUseDevKey) throw new Error('This wallet cannot sign a covenant input here. Paste the branch private key, or use the cold-recovery tool.');
      return wallet.devMode.privateKeyHex;
    }
    const k = String(privKey || '').trim().replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(k)) throw new Error('Enter a 64-character hex private key (32 bytes).');
    return k;
  };

  // Derive the signer x-only pubkey from the private key, LOCALLY via kaspa-wasm.
  const deriveXonly = async (privHex) => {
    const k = await import('@onekeyfe/kaspa-wasm');
    const { PrivateKey } = k;
    const pk = new PrivateKey(privHex);
    try {
      // x-only pubkey is the 32-byte schnorr pubkey the redeem script commits to.
      const xpub = pk.toXOnlyPublicKey ? pk.toXOnlyPublicKey() : (pk.toPublicKey && pk.toPublicKey().toXOnlyPublicKey ? pk.toPublicKey().toXOnlyPublicKey() : null);
      if (!xpub) throw new Error('Could not derive an x-only pubkey from this key.');
      const s = xpub.toString ? xpub.toString() : String(xpub);
      // Some builds return "<64hex>" already x-only; others return a 33-byte compressed key.
      const hex = s.replace(/^0x/i, '');
      return hex.length === 66 ? hex.slice(2) : hex; // strip a 02/03 prefix if present
    } finally {
      if (pk && typeof pk.free === 'function') pk.free();
    }
  };

  const run = async (mode /* 'broadcast' | 'export' */) => {
    setBusy(true); setStatus(null); setResult(null);
    try {
      if (!kit.redeem_script_hex) throw new Error('This kit has no redeem script, so the spend cannot be assembled here.');
      if (!firstUtxo) throw new Error('No spendable UTXO found at this address (already settled, or not yet funded).');
      if (!destAddr) throw new Error('Enter the destination address to receive the funds.');

      const privHex = resolvePrivKey();

      // 1) FAIL-CLOSED named-key binding: prove the key is the chain-checked key for this branch.
      const xonly = await deriveXonly(privHex);
      const bound = assertSignerForBranch(kit.redeem_script_hex, kind, branch, xonly);
      setStatus({ kind: 'info', msg: `Key bound to the ${kind} ${branch} signer (#${bound.index}). Building the spend...` });

      // 2) Build the UNSIGNED spend (single UTXO -> destination; output = amount - fee).
      const lt = lockTime ? BigInt(lockTime) : undefined;
      const sq = sequence ? BigInt(sequence) : undefined;
      const tx = await buildUnsignedSpend({
        utxo: { transactionId: firstUtxo.txid, index: firstUtxo.index, amount: BigInt(firstUtxo.amountSompi) },
        redeemHex: kit.redeem_script_hex,
        destAddr,
        networkId: net,
        fee: DEFAULT_FEE_SOMPI,
        kind,
        branch,
        lockTime: lt,
        sequence: sq,
      });

      // 3) Sign input 0 LOCALLY (the private key never leaves this function).
      const sig = await signInput(tx, 0, privHex);

      // 4) Build the satisfier for this kind+branch, then the full signature_script.
      const sat = buildSatisfier({
        kind,
        branch,
        sig65: sig,
        winnerSig: sig,
        refundSig: sig,
        // singlesig-style channel close still needs the SECOND signature; surfaced as a limitation.
        preimageBytes: needsPreimage ? hexOrUtf8(preimage) : undefined,
        winnerIsA: branch === 'revealA' ? true : (branch === 'revealB' ? false : undefined),
      });
      const sigScript = await assembleSigScript(kit.redeem_script_hex, sat);
      // Attach the assembled signature_script to the input.
      if (tx.inputs && tx.inputs[0]) tx.inputs[0].signatureScript = sigScript;

      if (mode === 'export') {
        const json = await exportSignedTxJson(tx);
        setResult({ json });
        setStatus({ kind: 'ok', msg: 'Signed transaction exported. Broadcast it from the cold-recovery tool or any Kaspa node.' });
      } else {
        const txid = await broadcast(tx, net);
        setResult({ txid });
        setStatus({ kind: 'ok', msg: 'Broadcast accepted by a public Kaspa node.' });
      }
    } catch (e) {
      setStatus({ kind: 'err', msg: e?.message || 'Could not complete the spend.' });
    } finally {
      // Wipe the pasted key from React state regardless of outcome (it lived only in this
      // browser; the local privHex binding goes out of scope and is GC'd).
      setPrivKey('');
      setBusy(false);
    }
  };

  // The covenant has no redeem script -> cannot assemble a spend here.
  if (!kit.redeem_script_hex) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-[12px] text-amber-300 leading-relaxed">
        This kit has no redeem script, so a spend cannot be assembled in-browser. Obtain the original redeem script from whoever built the covenant, then return here.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={15} className="text-kaspa-green" />
        <span className="text-sm font-bold text-white light:text-slate-900">Claim in your browser</span>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-kaspa-green/10 text-kaspa-green border border-kaspa-green/25 font-mono uppercase">{kind}</span>
      </div>

      {/* Branch selector (auto-selected when there is only one). */}
      {branches.length > 1 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1.5">Which path are you claiming?</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {branches.map((b) => (
              <button
                key={b.value}
                onClick={() => { setBranch(b.value); setStatus(null); setResult(null); }}
                className={`text-left rounded-xl border px-3 py-2 text-[12px] transition-colors ${branch === b.value ? 'border-kaspa-green/50 bg-kaspa-green/[0.08] text-white light:text-slate-900' : 'border-white/10 light:border-slate-200 bg-black/20 light:bg-slate-50 text-gray-300 light:text-slate-600 hover:border-kaspa-green/30'}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* HONEST per-kind gating. */}
      {claim && (
        <div className={`rounded-xl border p-3 text-[12px] leading-relaxed ${claim.offline ? 'border-kaspa-green/25 bg-kaspa-green/[0.05] text-gray-200 light:text-slate-700' : 'border-amber-500/30 bg-amber-500/[0.06] text-amber-200/95'}`}>
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            {claim.offline ? <ShieldCheck size={13} className="text-kaspa-green" /> : <AlertTriangle size={13} />}
            {claim.offline ? 'Offline-claimable - no Covex needed' : 'Needs the Covex oracle co-signature'}
          </div>
          <p>{matrix?.liveness}</p>
          <p className="mt-1 text-[11px] opacity-90">This path is satisfied by: <span className="font-semibold">{claim.role}</span>.</p>
          {!claim.offline && (
            <p className="mt-1.5 text-[11px]">
              This in-browser flow cannot produce the oracle half-signature. While Covex is online, claim from the covenant page (which obtains the oracle co-sign). If you need to act fully offline, only the refund branch (where one exists) is self-claimable.
            </p>
          )}
        </div>
      )}

      {/* Signing source. */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1.5">How will you sign?</div>
        <div className="flex rounded-lg bg-black/30 light:bg-slate-100 border border-white/10 light:border-slate-200 overflow-hidden text-[12px] font-semibold">
          <button
            onClick={() => setSignMode('wallet')}
            disabled={!canUseDevKey}
            className={`flex-1 py-2 transition-colors ${signMode === 'wallet' ? 'bg-kaspa-green/20 text-kaspa-green' : 'text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-800'} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Wallet size={12} className="inline mr-1" /> Connected key
          </button>
          <button
            onClick={() => setSignMode('paste')}
            className={`flex-1 py-2 transition-colors ${signMode === 'paste' ? 'bg-kaspa-green/20 text-kaspa-green' : 'text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-800'}`}
          >
            <KeyRound size={12} className="inline mr-1" /> Paste key
          </button>
        </div>
        {signMode === 'wallet' ? (
          <p className="text-[11px] text-gray-500 light:text-slate-400 mt-1.5">
            {canUseDevKey
              ? 'Your in-browser wallet signs the covenant input locally. The key never leaves this device.'
              : 'A wallet extension cannot sign a covenant P2SH input here (no such API). Use Paste key or the cold-recovery tool.'}
          </p>
        ) : (
          <div className="mt-2">
            <input
              type="password"
              value={privKey}
              onChange={(e) => setPrivKey(e.target.value)}
              placeholder="64 hex characters (32 bytes) - the branch key"
              autoComplete="off" spellCheck={false}
              className="w-full rounded-xl border border-amber-500/30 bg-black/40 light:bg-amber-50 px-3 py-2 text-[12px] font-mono text-white light:text-slate-800 placeholder:text-gray-500 outline-none focus:border-amber-400/60"
            />
            <p className="text-[11px] text-amber-300/90 mt-1.5 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {mainnet
                ? 'Mainnet: pasting a private key carries real risk. It is used ONLY to sign locally in this tab, is never transmitted, and is cleared after. Prefer the offline cold-recovery tool on an air-gapped machine.'
                : 'Used ONLY to sign locally in this tab. Never transmitted, and cleared after signing.'}
            </p>
          </div>
        )}
      </div>

      {/* Branch inputs. */}
      {needsPreimage && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1">Revealed secret / preimage (hex)</div>
          <input
            value={preimage}
            onChange={(e) => setPreimage(e.target.value)}
            placeholder={kit.revealed_secret ? 'prefilled from your kit' : 'hex of the secret the script commits to'}
            spellCheck={false}
            className="w-full rounded-xl border border-white/10 light:border-slate-300 bg-black/40 light:bg-slate-50 px-3 py-2 text-[12px] font-mono text-white light:text-slate-800 placeholder:text-gray-500 outline-none focus:border-kaspa-green/40"
          />
        </div>
      )}
      {(kind === 'timelock' || (isRefund && (kind === 'htlc' || kind === 'channel' || kind === 'deadman'))) && (
        <LabeledInput label="Locktime (DAA / CLTV operand)" value={lockTime} onChange={setLockTime} placeholder="required for this CLTV branch" />
      )}
      {(kind === 'rcsv'
        || (kind === 'binary_oracle_select' && isRefund)
        || ((kind === 'oracle_enforced_refundable' || kind === 'oracle_escrow_refundable') && isRefund)) && (
        <LabeledInput label="Sequence (CSV relative-locktime operand)" value={sequence} onChange={setSequence} placeholder="required for this CSV branch" />
      )}

      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1">Destination address (where the funds go)</div>
        <input
          value={destAddr}
          onChange={(e) => setDestAddr(e.target.value)}
          placeholder={mainnet ? 'kaspa:...' : 'kaspatest:...'}
          spellCheck={false}
          className="w-full rounded-xl border border-white/10 light:border-slate-300 bg-black/40 light:bg-slate-50 px-3 py-2 text-[12px] font-mono text-white light:text-slate-800 placeholder:text-gray-500 outline-none focus:border-kaspa-green/40"
        />
        <p className="text-[11px] text-gray-500 light:text-slate-400 mt-1">Output value is derived as the UTXO amount minus a {Number(DEFAULT_FEE_SOMPI)}-sompi fee, and is committed in the signature so it cannot be redirected.</p>
      </div>

      {/* Actions: broadcast OR export (offline). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          onClick={() => run('broadcast')}
          disabled={busy || (oracleNeeded)}
          className="btn-shimmer w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm bg-kaspa-green text-black disabled:opacity-40 hover:shadow-[0_0_18px_rgba(73,234,203,0.3)] transition-all"
          title={oracleNeeded ? 'This branch needs the Covex oracle co-signature' : 'Build, sign locally, and broadcast'}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Sign &amp; broadcast
        </button>
        <button
          onClick={() => run('export')}
          disabled={busy || (oracleNeeded)}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border border-kaspa-green/30 bg-kaspa-green/[0.06] text-kaspa-green disabled:opacity-40 hover:bg-kaspa-green/[0.12] transition-all"
          title={oracleNeeded ? 'This branch needs the Covex oracle co-signature' : 'Sign locally and export the signed tx JSON'}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Sign &amp; export
        </button>
      </div>

      {status && (
        <div className={`rounded-xl border p-3 text-[12px] leading-relaxed ${status.kind === 'ok' ? 'border-kaspa-green/30 bg-kaspa-green/[0.06] text-kaspa-green' : status.kind === 'err' ? 'border-red-500/30 bg-red-500/[0.06] text-red-300' : 'border-white/10 bg-white/[0.04] text-gray-300 light:text-slate-600'}`}>
          {status.msg}
          {result?.txid && (
            <a href={explorerTxUrl(result.txid, kit.network)} target="_blank" rel="noreferrer" className="block mt-1 font-mono break-all underline">{result.txid}</a>
          )}
        </div>
      )}
      {result?.json && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1">Signed transaction (broadcast elsewhere)</div>
          <textarea readOnly value={result.json} rows={4} className="w-full rounded-xl border border-white/10 light:border-slate-300 bg-black/40 light:bg-slate-50 px-3 py-2 text-[10.5px] font-mono text-gray-300 light:text-slate-700 outline-none resize-y" />
        </div>
      )}

      {/* Cold/offline tool prominent link. The cold tool is a STANDALONE static page (served
          outside the SPA), so use a real anchor, not a router Link. */}
      <a href="/tools/cold-recovery/" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/10 light:border-slate-200 bg-white/[0.03] light:bg-slate-50 text-[12px] font-semibold text-gray-300 light:text-slate-600 hover:border-kaspa-green/30 hover:text-kaspa-green transition-colors">
        <Snowflake size={13} /> Fully offline? Use the standalone cold-recovery tool
      </a>
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full rounded-xl border border-white/10 light:border-slate-300 bg-black/40 light:bg-slate-50 px-3 py-2 text-[12px] font-mono text-white light:text-slate-800 placeholder:text-gray-500 outline-none focus:border-kaspa-green/40"
      />
    </div>
  );
}

// Treat the secret as hex if it looks like hex; otherwise encode the UTF-8 bytes.
function hexOrUtf8(s) {
  const t = String(s || '').trim().replace(/^0x/i, '');
  if (t.length > 0 && t.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(t)) {
    const out = new Uint8Array(t.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(t.substr(i * 2, 2), 16);
    return out;
  }
  return new TextEncoder().encode(String(s || ''));
}

export default function Recover() {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const [kit, setKit] = useState(null);
  const [txid, setTxid] = useState('');
  const [looking, setLooking] = useState(false);
  const [bal, setBal] = useState({ loading: false, kas: null, error: null, available: false, utxos: null });

  // When a kit loads, confirm the locked balance + UTXOs via a PUBLIC Kaspa node (read-only, never Covex).
  useEffect(() => {
    if (!kit?.address || !hasPublicApi(kit.network)) {
      setBal({ loading: false, kas: null, error: null, available: false, utxos: null });
      return undefined;
    }
    const ac = new AbortController();
    setBal({ loading: true, kas: null, error: null, available: true, utxos: null });
    (async () => {
      try {
        const [sompi, utxos] = await Promise.all([
          fetchAddressBalanceSompi(kit.address, kit.network, ac.signal),
          fetchAddressUtxos(kit.address, kit.network, ac.signal).catch(() => null),
        ]);
        setBal({ loading: false, kas: sompiToKas(sompi), error: null, available: true, utxos });
      } catch (e) {
        if (e.name !== 'AbortError') setBal({ loading: false, kas: null, error: 'Could not reach a public node for this network right now.', available: true, utxos: null });
      }
    })();
    return () => ac.abort();
  }, [kit]);

  const loadFromText = (text) => {
    setError('');
    let obj;
    try { obj = JSON.parse(text); }
    catch { setError('Could not read that as JSON. Paste the full contents of your covex-recovery-*.json file.'); return; }
    const n = normalizeKit(obj);
    if (!n || (!n.redeem_script_hex && !n.address)) {
      setError('That JSON does not look like a Covex recovery kit (no redeem script or P2SH address found).');
      return;
    }
    setKit(n);
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { const t = String(r.result || ''); setRaw(t); loadFromText(t); };
    r.readAsText(f);
  };

  const lookup = async (idArg) => {
    const id = String(idArg ?? txid).trim();
    if (!id) return;
    setLooking(true); setError('');
    try {
      const r = await fetch(`/api/covenants/${encodeURIComponent(id)}`);
      const c = await r.json();
      const n = normalizeKit(c);
      if (!n || !n.address) setError('Covenant not found, or it has no recovery data on record. Paste your saved kit instead.');
      else setKit(n);
    } catch {
      setError('Lookup failed (the Covex API may be unreachable). That is exactly when your saved kit matters - paste it below.');
    }
    setLooking(false);
  };

  // Deep link: /recover?id=<txid> (e.g. from a covenant's Recover button) auto-loads that covenant.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get('id') || p.get('txid');
    if (id) { setTxid(id); lookup(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kind = String(kit?.redeem_kind || '').split(':')[0] || 'p2sh';
  const hint = KIND_HINTS[kind] || KIND_HINTS.p2sh;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 relative">
      <div className="covex-aurora" style={{ top: -30, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 360, height: 200, maxWidth: '90vw', opacity: 0.4 }} aria-hidden="true" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-11 h-11 rounded-xl bg-kaspa-green/10 border border-kaspa-green/25 flex items-center justify-center">
            <LifeBuoy size={20} className="text-kaspa-green" />
          </span>
          <div>
            <h1 className="text-2xl font-black text-white light:text-slate-900 leading-tight">Recover a covenant</h1>
            <p className="text-[12px] text-gray-400 light:text-slate-500">Settle your funds directly on Kaspa, with or without Covex.</p>
          </div>
        </div>

        {/* Trustless guarantee */}
        <div className="mt-4 rounded-2xl border border-kaspa-green/20 bg-kaspa-green/[0.05] p-4 detail-hero-enhanced">
          <div className="flex items-center gap-2 text-kaspa-green font-semibold text-sm mb-1.5"><ShieldCheck size={15} /> Chain-enforced, not Covex-enforced</div>
          <p className="text-[12.5px] text-gray-300 light:text-slate-600 leading-relaxed">
            Every Covex covenant is a script-locked P2SH commitment on Kaspa. The chain itself enforces the spend
            rules; Covex only helps build transactions and holds no keys. With the redeem script and your own
            key(s), you can settle through <span className="text-white light:text-slate-900">any Kaspa node</span> even if
            this site disappears. This page never transmits a private key and signs every spend in your browser.
          </p>
        </div>

        {!kit ? (
          <div className="mt-5 space-y-4">
            {/* Lookup by tx id (works while the API is reachable) */}
            <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-4">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-500 mb-2">Look up by transaction id</div>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 light:border-slate-300 bg-black/40 light:bg-slate-50 px-3 py-2 focus-within:border-kaspa-green/40">
                <Search size={15} className="text-gray-400 shrink-0" />
                <input
                  value={txid}
                  onChange={(e) => setTxid(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
                  placeholder="covenant tx id"
                  className="flex-1 bg-transparent text-sm text-white light:text-slate-800 placeholder:text-gray-500 outline-none font-mono"
                />
                <button onClick={lookup} disabled={!txid.trim() || looking} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-kaspa-green text-black disabled:opacity-40 hover:shadow-[0_0_14px_rgba(73,234,203,0.35)] transition-all">
                  {looking ? 'Looking…' : 'Look up'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 light:text-slate-400 mt-2">Convenient when Covex is online. If it is down, use your saved kit below.</p>
            </div>

            {/* Paste / upload saved kit (works fully offline) */}
            <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-4">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-500">Paste your recovery kit</div>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-kaspa-green cursor-pointer hover:text-kaspa-green/80">
                  <Upload size={12} /> Upload .json
                  <input type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
                </label>
              </div>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder='Paste the contents of your covex-recovery-*.json file here'
                rows={5}
                className="w-full rounded-xl border border-white/10 light:border-slate-300 bg-black/40 light:bg-slate-50 px-3 py-2 text-[11px] font-mono text-white light:text-slate-800 placeholder:text-gray-500 outline-none focus:border-kaspa-green/40 resize-y"
              />
              <button onClick={() => loadFromText(raw)} disabled={!raw.trim()} className="btn-shimmer mt-2.5 w-full py-2.5 rounded-xl font-bold text-sm bg-kaspa-green text-black disabled:opacity-40 hover:shadow-[0_0_18px_rgba(73,234,203,0.3)] transition-all">
                Load recovery kit
              </button>
              <p className="text-[11px] text-gray-500 light:text-slate-400 mt-2">No kit yet? Open any of your covenants on Covex and use <span className="text-gray-300 light:text-slate-600">Recover &rarr; Download recovery kit</span>, then keep it somewhere safe.</p>
            </div>

            {error && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] text-amber-300 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <button onClick={() => { setKit(null); setError(''); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-kaspa-green transition-colors">
              <ArrowLeft size={13} /> Load a different kit
            </button>

            {/* Independently-verified locked balance (read-only, via a public Kaspa node) */}
            {bal.available && (
              <div className="rounded-2xl border border-kaspa-green/25 bg-kaspa-green/[0.05] p-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-500 mb-1.5">
                  <span className="inline-flex items-center gap-2"><Coins size={13} className="text-kaspa-green" /> Funds locked here</span>
                  <span className="sm:ml-auto normal-case tracking-normal text-[10px] text-gray-500">via {kit.network} public node, not Covex</span>
                </div>
                {bal.loading && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin text-kaspa-green" /> Checking the chain…</div>}
                {bal.error && <div className="text-[12px] text-amber-300">{bal.error} You can still verify on the explorer below.</div>}
                {bal.kas != null && (
                  <div>
                    <div className="text-2xl font-black text-kaspa-green tabular-nums leading-none">
                      {bal.kas.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-sm font-bold">KAS</span>
                    </div>
                    <div className="text-[11px] text-gray-400 light:text-slate-500 mt-1">
                      {bal.kas > 0
                        ? 'Confirmed locked at this address, ready to redeem with the script + your key.'
                        : 'This address holds 0 KAS now - the covenant appears already settled (or not yet funded).'}
                    </div>
                  </div>
                )}
                {Array.isArray(bal.utxos) && bal.utxos.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] light:border-slate-200">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 light:text-slate-400 mb-1.5">Coins to redeem ({bal.utxos.length} UTXO{bal.utxos.length === 1 ? '' : 's'})</div>
                    <div className="space-y-1">
                      {bal.utxos.slice(0, 6).map((u) => (
                        <div key={`${u.txid}:${u.index}`} className="flex items-center justify-between gap-2 text-[10.5px]">
                          <span className="font-mono text-gray-400 light:text-slate-500 truncate flex-1 min-w-0">{u.txid.slice(0, 16)}…:{u.index}</span>
                          <span className="shrink-0 tabular-nums text-gray-200 light:text-slate-700">{sompiToKas(u.amountSompi).toLocaleString(undefined, { maximumFractionDigits: 4 })} KAS{u.daaScore != null ? <span className="text-gray-500"> · DAA {u.daaScore.toLocaleString()}</span> : null}</span>
                        </div>
                      ))}
                      {bal.utxos.length > 6 && <div className="text-[10px] text-gray-500">+ {bal.utxos.length - 6} more</div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* The covenant's recovery data */}
            <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-kaspa-green">{kind}</span>
                {kit.network && <span className="text-[10px] text-gray-500 light:text-slate-400 font-mono">{kit.network}</span>}
              </div>
              <CopyRow label="P2SH address (where the funds are locked)" value={kit.address} />
              <CopyRow label="Redeem script (hex)" value={kit.redeem_script_hex} />
              {kit.script_hash && <CopyRow label="On-chain script hash" value={kit.script_hash} />}
              {kit.oracle_pubkey && <CopyRow label="Disclosed oracle x-only pubkey" value={kit.oracle_pubkey} />}
              {!kit.redeem_script_hex && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2.5 text-[11px] text-amber-300">
                  This kit has no redeem script (the covenant was created elsewhere and not claimed on Covex). You need the original redeem script from whoever built it to spend the funds.
                </div>
              )}
              <div className="flex flex-wrap gap-3 pt-1">
                {kit.address && (
                  <a href={explorerAddressUrl(kit.address, kit.network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-kaspa-green hover:underline">
                    View funds on explorer <ExternalLink size={11} />
                  </a>
                )}
                {kit.tx_id && (
                  <a href={explorerTxUrl(kit.tx_id, kit.network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-kaspa-green hover:underline">
                    Deploy transaction <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>

            {/* Working in-browser claim flow (the verified redeemer). */}
            <ClaimFlow kit={kit} utxos={bal.utxos} />

            {/* What the rule means, for orientation. */}
            <div className="rounded-2xl border border-white/10 light:border-slate-200 bg-white/[0.02] light:bg-white p-4">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 light:text-slate-500 mb-2">What this covenant&apos;s rule means</div>
              <p className="text-[12.5px] text-gray-300 light:text-slate-600 leading-relaxed"><span className="text-white light:text-slate-900 font-semibold">{kind}:</span> {hint}</p>
              <p className="text-[11px] text-gray-500 light:text-slate-400 mt-3 pt-3 border-t border-white/[0.06] light:border-slate-200 leading-relaxed">
                The claim builder above assembles the spend with kaspa-wasm, signs it in your browser, and broadcasts (or exports) it through a public Kaspa node - no Covex involvement. For a fully air-gapped flow, use the <a href="/tools/cold-recovery/" target="_blank" rel="noreferrer" className="text-kaspa-green hover:underline">standalone cold-recovery tool</a>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
