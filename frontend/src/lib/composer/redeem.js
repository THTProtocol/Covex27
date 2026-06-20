// composer/redeem.js
//
// The LOCK-side composition engine: build the redeem script bytes for a composition tree.
// This is the byte-critical piece (a wrong byte = a wrong P2SH = stranded funds), so every
// fragment + the add_lock_time encoding below were derived from the REAL Rust ScriptBuilder
// output (via the live prepare-deploy) and are pinned in composer.redeem.test.js against a
// ground-truth golden (redeem_golden.json). composing atomics reproduces the existing
// singlesig/hashlock/timelock/rcsv leaves and the htlc (OR) + channel (OR-of-AND) scripts
// byte-for-byte.
//
// The only two new combinators vs the existing per-kind builders:
//   AND = concatenate child fragments; every non-final child is emitted in its VERIFY form
//         (OpCheckSigVerify) so exactly one clean boolean reaches the engine at the end.
//   OR  = a right-nested OP_IF / OP_ELSE / OP_ENDIF ladder; each branch is terminal.

import { OPCODES, pushData } from '../redeemer/covenantRedeemer';

function cat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const u8 = (arr) => Uint8Array.from(arr);
const hexToBytes = (h) => Uint8Array.from(String(h).match(/../g).map((x) => parseInt(x, 16)));

/**
 * Minimal little-endian Kaspa script-number bytes for a positive integer, matching what the
 * Rust ScriptBuilder::add_lock_time emits (verified: 5000000 -> 40 4b 4c, 4320 -> e0 10).
 * Trailing 0x00 sign-pad if the top byte's high bit is set (keeps it positive).
 */
export function scriptNumberLE(n) {
  let v = BigInt(n);
  if (v < 0n) throw new Error('lock value must be non-negative');
  if (v === 0n) return new Uint8Array(0);
  const bytes = [];
  while (v > 0n) { bytes.push(Number(v & 0xffn)); v >>= 8n; }
  if (bytes[bytes.length - 1] & 0x80) bytes.push(0x00);
  return u8(bytes);
}

// add_lock_time(n) = canonical data push of the minimal script number (pushData prepends the
// OpData length opcode). For the realistic DAA / sequence range this is the add_data form.
function addLockTime(n) {
  return pushData(scriptNumberLE(n));
}

// The trailing checksig of a leaf: VERIFY form when this leaf is not the final clause of an
// AND chain (so it consumes its boolean and execution continues), plain CheckSig otherwise.
const checkSig = (terminal) => u8([terminal ? OPCODES.OpCheckSig : OPCODES.OpCheckSigVerify]);

function norm32(v) {
  const b = typeof v === 'string' ? hexToBytes(v) : v;
  if (b.length !== 32) throw new Error(`expected a 32-byte value, got ${b.length}`);
  return b;
}

// Redeem fragment for a single LEAF. terminal controls the final CheckSig vs CheckSigVerify.
export function redeemLeaf(kind, params = {}, terminal = true) {
  switch (kind) {
    case 'singlesig':
      return cat([pushData(norm32(params.pubkey)), checkSig(terminal)]);
    case 'hashlock':
      return cat([u8([OPCODES.OpBlake2b]), pushData(norm32(params.hash32)), u8([OPCODES.OpEqualVerify]), pushData(norm32(params.pubkey)), checkSig(terminal)]);
    case 'timelock':
      return cat([addLockTime(params.lock_daa), u8([OPCODES.OpCheckLockTimeVerify]), pushData(norm32(params.pubkey)), checkSig(terminal)]);
    case 'rcsv':
      return cat([addLockTime(params.min_sequence), u8([OPCODES.OpCheckSequenceVerify]), pushData(norm32(params.pubkey)), checkSig(terminal)]);
    default:
      throw new Error(`leaf kind "${kind}" has no redeem fragment in this slice`);
  }
}

/**
 * Build the redeem script for a composition node.
 *   LEAF -> redeemLeaf(terminal)
 *   AND  -> concat children; non-final children VERIFY-form, final child inherits `terminal`
 *   OR   -> OP_IF b0 OP_ELSE ( b1 ... ) OP_ENDIF, right-nested; each branch terminal
 */
export function buildComposedRedeem(node, terminal = true) {
  if (!node || typeof node !== 'object') throw new Error('bad node');
  if (node.node === 'leaf') return redeemLeaf(node.kind, node.params, terminal);
  if (node.node === 'and') {
    const kids = node.children || [];
    if (kids.length === 0) throw new Error('AND needs at least one child');
    return cat(kids.map((c, i) => buildComposedRedeem(c, i === kids.length - 1 ? terminal : false)));
  }
  if (node.node === 'or') {
    const kids = node.children || [];
    if (kids.length === 0) throw new Error('OR needs at least one child');
    if (kids.length === 1) return buildComposedRedeem(kids[0], terminal);
    // Right-nested ladder: IF <b0> ELSE <rest...> ENDIF
    const rest = kids.length === 2
      ? buildComposedRedeem(kids[1], true)
      : buildComposedRedeem({ node: 'or', children: kids.slice(1) }, true);
    return cat([u8([OPCODES.OpIf]), buildComposedRedeem(kids[0], true), u8([OPCODES.OpElse]), rest, u8([OPCODES.OpEndIf])]);
  }
  throw new Error(`unknown node "${node.node}"`);
}
