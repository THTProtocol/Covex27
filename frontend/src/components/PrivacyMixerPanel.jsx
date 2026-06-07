import { useState, useCallback } from 'react';
import { Shield, ArrowDownToLine, ArrowUpFromLine, Copy, Check } from 'lucide-react';

const API = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://127.0.0.1:3006/api'
  : 'https://hightable.pro/api';

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
    const s = (BigInt(Math.floor(Math.random() * 1e12)) + 100000n).toString();
    const nk = (BigInt(Math.floor(Math.random() * 1e12)) + 200000n).toString();
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
      <div className="flex items-center gap-2 text-violet-300">
        <Shield className="w-4 h-4" />
        <span className="font-semibold text-sm">Privacy Mixer (ZK)</span>
        <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/30 text-violet-200">privacy_mixer_v1</span>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        Deposit KAS into the pool, save your secret note offline, then withdraw with a Groth16 proof.
        Unlinkability depends on pool size. Nullifiers prevent double-spend (oracle-enforced).
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