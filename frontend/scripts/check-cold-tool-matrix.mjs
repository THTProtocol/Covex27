#!/usr/bin/env node
// check-cold-tool-matrix.mjs
//
// CI gate (FIX 1 anti-drift): the built standalone cold-recovery tool hand-duplicated the
// claimability matrix once and drifted into "Covex oracle" copy that contradicts the
// trustless reframe. build-cold-tool.mjs now INJECTS the matrix from the canonical
// KIND_CLAIM_MATRIX (frontend/src/lib/redeemer/covenantRedeemer.js). This script proves the
// built tool's matrix kinds + offline flags equal what the canonical matrix derives to, so a
// future edit cannot silently re-introduce drift. It runs AFTER `vite build` (which runs the
// prebuild that regenerates the tool into public/, copied into dist/).
//
// Checks, fail-closed:
//   1. the built dist tool exists and carries a `const CLAIMABILITY = { ... };` object;
//   2. its kind set EQUALS the canonical KIND_CLAIM_MATRIX kind set;
//   3. each kind's `offline` flag (true | false | 'refund-only') equals what the canonical
//      matrix derives to (offlineClaimable -> true; else offline refund -> 'refund-only';
//      else false);
//   4. the served tool contains ZERO "Covex oracle" mentions (the honesty regression guard).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, '..');
const REDEEMER_SRC = resolve(FRONTEND, 'src', 'lib', 'redeemer', 'covenantRedeemer.js');
// Prefer the dist artifact (what actually ships); fall back to the public/ artifact the
// prebuild emits, so the check also works when run right after `npm run build:cold-tool`.
const DIST_TOOL = resolve(FRONTEND, 'dist', 'tools', 'cold-recovery', 'covex-cold-recovery.html');
const PUBLIC_TOOL = resolve(FRONTEND, 'public', 'tools', 'cold-recovery', 'covex-cold-recovery.html');

function die(msg) {
  console.error('COLD-TOOL MATRIX CHECK FAILED: ' + msg);
  process.exit(1);
}

// Mirror of deriveColdMatrix in build-cold-tool.mjs - the single mapping rule both sides agree on.
function deriveExpected(KIND_CLAIM_MATRIX) {
  const out = {};
  for (const [kind, entry] of Object.entries(KIND_CLAIM_MATRIX)) {
    const branches = entry.branches || {};
    let offline;
    if (entry.offlineClaimable) {
      offline = true;
    } else {
      const refund = branches.refund || branches.refundA || branches.refundB;
      offline = refund && refund.offline ? 'refund-only' : false;
    }
    out[kind] = offline;
  }
  return out;
}

// Extract `const CLAIMABILITY = { ... };` from the built HTML and parse it. The injected
// object is pretty-printed JSON, so we slice from the assignment to the matching `};` and
// JSON.parse it. (The build emits valid JSON-as-object-literal, so this is safe + dependency-free.)
function extractMatrix(html) {
  const marker = 'const CLAIMABILITY = {';
  const start = html.indexOf(marker);
  if (start === -1) die('built tool has no `const CLAIMABILITY = {` matrix (injection slot not filled?)');
  const objStart = start + marker.length - 1; // point at the `{`
  // The injected object is the only place `};` follows a closing brace at column 0-ish after
  // the matrix, but to be robust we brace-count from objStart.
  let depth = 0;
  let end = -1;
  for (let i = objStart; i < html.length; i++) {
    const c = html[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) die('could not find the end of the CLAIMABILITY object in the built tool');
  const objText = html.slice(objStart, end);
  try {
    return JSON.parse(objText);
  } catch (e) {
    die('the built CLAIMABILITY object is not parseable JSON: ' + (e && e.message ? e.message : e));
  }
}

async function main() {
  const toolPath = existsSync(DIST_TOOL) ? DIST_TOOL : (existsSync(PUBLIC_TOOL) ? PUBLIC_TOOL : null);
  if (!toolPath) die(`built cold-recovery tool not found at ${DIST_TOOL} or ${PUBLIC_TOOL}. Run \`npm run build\` first.`);
  const html = readFileSync(toolPath, 'utf8');

  // 4. honesty regression guard: zero "Covex oracle" mentions.
  if (/covex\s+oracle/i.test(html)) {
    die(`the built tool (${toolPath}) still contains a "Covex oracle" mention. The fund-path surface must reframe to the deployer-bound external resolver.`);
  }

  const { KIND_CLAIM_MATRIX } = await import(pathToFileURL(REDEEMER_SRC).href);
  if (!KIND_CLAIM_MATRIX || Object.keys(KIND_CLAIM_MATRIX).length === 0) {
    die('KIND_CLAIM_MATRIX import from covenantRedeemer.js was empty or missing');
  }
  const expected = deriveExpected(KIND_CLAIM_MATRIX);
  const built = extractMatrix(html);

  // 2. kind sets must be equal.
  const expKinds = Object.keys(expected).sort();
  const gotKinds = Object.keys(built).sort();
  if (expKinds.join(',') !== gotKinds.join(',')) {
    die(`kind set mismatch.\n  canonical: ${expKinds.join(', ')}\n  built:     ${gotKinds.join(', ')}`);
  }

  // 3. per-kind offline flags must match.
  const mismatches = [];
  for (const kind of expKinds) {
    const want = expected[kind];
    const got = built[kind] && built[kind].offline;
    if (want !== got) mismatches.push(`${kind}: expected offline=${JSON.stringify(want)}, built offline=${JSON.stringify(got)}`);
  }
  if (mismatches.length) {
    die('offline-flag mismatch (the built tool drifted from KIND_CLAIM_MATRIX):\n  ' + mismatches.join('\n  '));
  }

  console.log(`OK: cold-recovery tool matrix matches KIND_CLAIM_MATRIX (${expKinds.length} kinds, 0 "Covex oracle" mentions). Tool: ${toolPath}`);
}

main().catch((e) => die(e && e.stack ? e.stack : String(e)));
