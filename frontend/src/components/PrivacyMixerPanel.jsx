import { useState, useCallback } from 'react';
import { Shield, ArrowDownToLine, ArrowUpFromLine, Copy, Check } from 'lucide-react';

const API = '/api';

export default function PrivacyMixerPanel({ covenantId = 'demo-mixer' }) {
  const [secret, setSecret] = useState('');
  const [nullifierKey, setNullifierKey] = useState('');
  const [amount, setAmount] = useState('100000000');
  const [leafHash, setLeafHash] = useState('');
  const [merkleRoot, setMerkleRoot] = useState('');
  const [leafIndex, setLeafIndex] = useState(null);
  const [noteJson, setNoteJson] = useState('');
  const [withdrawStatus, setWithdrawStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const generateNote = useCallback(() => {
    // The secret + nullifier are the ONLY thing protecting deposited funds and
    // unlinkability - they MUST be cryptographically random, not Math.random (~40-bit,
    // brute-forceable). Use 256-bit CSPRNG values.
    const rand256 = () => {
      const b = new Uint8Array(32);
      (window.crypto || window.msCrypto).getRandomValues(b);
      return BigInt('0x' + Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')).toString();
    };
    const s = rand256();
    const nk = rand256();
    setSecret(s);
    setNullifierKey(nk);
    setNoteJson(JSON.stringify({ secret: s, nullifier_key: nk, amount, covenant_id: covenantId }, null, 2));
  }, [amount, covenantId]);

  const registerDeposit = async () => {
    if (!leafHash) {
      setWithdrawStatus('Generate a deposit note first (requires local prove script or precomputed leaf).');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/mixer/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ covenant_id: covenantId, leaf_hash: leafHash }),
      });
      const data = await res.json();
      if (data.success) {
        setMerkleRoot(data.merkle_root);
        setLeafIndex(data.leaf_index);
        setWithdrawStatus(`Deposit registered at index ${data.leaf_index}`);
      } else {
        setWithdrawStatus(data.error || 'Deposit failed');
      }
    } catch (e) {
      setWithdrawStatus(e.message);
    } finally {
      setBusy(false);
    }
  };

  const fetchRoot = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/mixer/root/${covenantId}`);
      const data = await res.json();
      setMerkleRoot(data.merkle_root);
      setWithdrawStatus(`Pool: ${data.leaf_count} leaves`);
    } catch (e) {
      setWithdrawStatus(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copyNote = () => {
    navigator.clipboard.writeText(noteJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-violet-500/30 bg-[#0a0e1a] p-4 space-y-4">
      <div className="flex items-center gap-2 text-violet-300 flex-wrap">
        <Shield className="w-4 h-4" />
        <span className="font-semibold text-sm">Privacy Mixer</span>
        <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/30 text-violet-200">privacy_mixer_v1</span>
        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200" title="Withdrawal proofs are verified by the Covex oracle (fail-closed), not yet by on-chain consensus.">oracle-attested</span>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        Deposits build a real Merkle pool; you keep your secret note offline. To withdraw, you generate a
        Groth16 proof locally and submit it to the oracle, which verifies it fail-closed before co-signing.
        Nullifiers are recorded to flag reuse. Unlinkability depends on pool size. Fully on-chain, trustless
        privacy (no oracle in the spend path) is on the roadmap as Kaspa covenant support matures.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <ArrowDownToLine className="w-3 h-3" /> Deposit
          </label>
          <input
            type="text"
            placeholder="Amount (sompi)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs font-mono"
          />
          <button type="button" onClick={generateNote} className="text-xs px-3 py-1.5 rounded bg-violet-600/80 hover:bg-violet-500 text-white">
            Generate Secret Note
          </button>
          {noteJson && (
            <div className="relative">
              <pre className="text-[9px] font-mono bg-black/50 p-2 rounded border border-white/5 max-h-24 overflow-auto">{noteJson}</pre>
              <button type="button" onClick={copyNote} className="absolute top-1 right-1 p-1 rounded bg-white/5 hover:bg-white/10">
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          )}
          <input
            type="text"
            placeholder="Leaf hash (from prove_deposit.js)"
            value={leafHash}
            onChange={(e) => setLeafHash(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs font-mono"
          />
          <button type="button" onClick={registerDeposit} disabled={busy} className="text-xs px-3 py-1.5 rounded border border-violet-500/40 text-violet-200 hover:bg-violet-500/10 disabled:opacity-50">
            Register Deposit (API)
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <ArrowUpFromLine className="w-3 h-3" /> Withdraw
          </label>
          <button type="button" onClick={fetchRoot} disabled={busy} className="text-xs px-3 py-1.5 rounded border border-white/10 text-gray-300 hover:bg-white/5">
            Fetch Merkle Root
          </button>
          {merkleRoot && (
            <p className="text-[9px] font-mono text-gray-500 break-all">root: {merkleRoot}</p>
          )}
          {leafIndex !== null && (
            <p className="text-[10px] text-gray-400">Your leaf index: {leafIndex}</p>
          )}
          <p className="text-[10px] text-gray-500">
            Run locally: <code className="text-violet-300">node zk/privacy_mixer/scripts/prove_withdraw.js</code> then submit proof via Oracle Resolution below.
          </p>
        </div>
      </div>

      {withdrawStatus && (
        <p className="text-[10px] text-amber-200/90 border border-amber-500/20 rounded px-2 py-1">{withdrawStatus}</p>
      )}
    </div>
  );
}