// prover-service: the off-box RISC0->Groth16 prover the Covex backend calls for on-chain ZK game
// settlement (KIP-16 OpZkPrecompile). The 7GB backend host CANNOT prove (the stark2snark wrap needs
// x86_64 + Docker + >=12GB RAM), so this small HTTP service runs WHERE the prover lives and the
// backend reaches it via COVEX_PROVER_URL.
//
// It is a thin, honest wrapper around the `covex-games-prover` CLI:
//   1. POST /prove-game-settle { game_type, moves, players[2], covenant_id, stake_sompi, elapsed_ms? }
//      -> write the friendly GameInput JSON to a temp file
//      -> `covex-games-prover prove-groth16 input.json receipt.bin`   (real RISC0->Groth16 proof)
//      -> `covex-games-prover settle-spend receipt.bin`               (receipt -> on-chain settle JSON)
//      -> return that settle JSON: { proof_hex, vk_hex, public_inputs[5], winner_pubkey,
//         covenant_id, winner_code, stake_sompi, image_id }
//   2. GET /healthz -> { ok, prover_bin, image_id? }
//
// HONESTY: it NEVER fabricates a proof. An illegal/unfinished/forged game makes the guest panic, so
// prove-groth16 exits non-zero and this returns an error. A missing CLI or a Docker/stark2snark
// failure returns an error too. The chain re-verifies the proof at spend time regardless.
//
// REQUIREMENTS (see README.md): a built `covex-games-prover` binary (COVEX_GAMES_PROVER_BIN or on
// PATH), Docker running (RISC0 stark2snark image), RISC0_DEV_MODE unset (a real proof), and
// >=12GB RAM. Run it on a dev/GPU/Bonsai box, NOT the 7GB backend host.
//
// SECURITY: /prove-game-settle is a minutes-long unauthenticated compute endpoint (a DoS amplifier
// if exposed). So this service:
//   * binds to 127.0.0.1 by DEFAULT (override with COVEX_PROVER_BIND, e.g. 0.0.0.0 behind a proxy),
//   * supports an OPTIONAL shared-secret bearer token (COVEX_PROVER_TOKEN). When that env var is set,
//     every /prove-game-settle request MUST carry `Authorization: Bearer <token>` or it is rejected
//     401. The Covex backend sends this token when its own COVEX_PROVER_TOKEN is set (zk_prover_client).
// A publicly-reachable prove box MUST set COVEX_PROVER_TOKEN and sit behind a TLS reverse proxy; the
// startup log warns loudly if it binds to a non-loopback address with no token configured.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const PORT = parseInt(process.env.PROVER_PORT || '7720', 10);
// Bind to loopback by default so the heavy prove endpoint is not exposed on every interface. Set
// COVEX_PROVER_BIND=0.0.0.0 (and COVEX_PROVER_TOKEN + a reverse proxy) to reach it from the backend
// box across the network.
const BIND = (process.env.COVEX_PROVER_BIND || '127.0.0.1').trim();
// Optional shared-secret bearer token. When set, /prove-game-settle requires `Authorization: Bearer
// <token>`. Empty/unset = no auth (only safe on a loopback bind).
const TOKEN = (process.env.COVEX_PROVER_TOKEN || '').trim();
const PROVER_BIN = process.env.COVEX_GAMES_PROVER_BIN || 'covex-games-prover';
const MAX_BODY = 256 * 1024; // a GameInput is tiny; reject anything large.

// True iff BIND is a loopback address (so a missing token there is acceptable).
function bindIsLoopback() {
  return BIND === '127.0.0.1' || BIND === 'localhost' || BIND === '::1';
}

// Constant-time bearer-token check. Returns true when no token is configured (auth disabled), or when
// the request carries `Authorization: Bearer <token>` matching COVEX_PROVER_TOKEN exactly.
function authorized(req) {
  if (!TOKEN) return true; // auth disabled
  const header = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  const got = Buffer.from(m[1], 'utf8');
  const want = Buffer.from(TOKEN, 'utf8');
  // timingSafeEqual requires equal lengths; compare lengths first (length is not secret).
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

// Run a command, capture stdout/stderr, resolve with { code, stdout, stderr }.
function run(bin, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { ...opts, env: { ...process.env, ...(opts.env || {}) } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: stderr + `\nspawn error: ${e.message}` }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

// Validate the incoming GameInput minimally; the CLI does the strict parse + the proof is the real
// gate. We only guard the obviously malformed so the error is clear.
function validateInput(b) {
  if (!b || typeof b !== 'object') return 'body must be a JSON object';
  if (typeof b.game_type !== 'string' || !b.game_type) return 'game_type (string) is required';
  if (!Array.isArray(b.moves)) return 'moves (array) is required';
  if (!Array.isArray(b.players) || b.players.length !== 2) return 'players must be a 2-element array';
  if (typeof b.covenant_id !== 'string' || !b.covenant_id) return 'covenant_id (hex string) is required';
  return null;
}

async function handleProve(req, res, body) {
  const err = validateInput(body);
  if (err) return sendJson(res, 400, { error: err });

  // The CLI's friendly JsonGameInput shape (deny_unknown_fields), so pass only known fields.
  const input = {
    game_type: body.game_type,
    moves: body.moves,
    players: body.players,
    covenant_id: body.covenant_id,
    stake_sompi: Number(body.stake_sompi || 0),
  };
  if (Array.isArray(body.elapsed_ms)) input.elapsed_ms = body.elapsed_ms;

  let dir;
  try {
    dir = await mkdtemp(join(tmpdir(), 'covex-prove-'));
    const inputPath = join(dir, 'input.json');
    const receiptPath = join(dir, 'receipt.bin');
    await writeFile(inputPath, JSON.stringify(input));

    // 1) Real RISC0->Groth16 proof. Heavy: composite STARK -> succinct -> Docker stark2snark.
    const prove = await run(PROVER_BIN, ['prove-groth16', inputPath, receiptPath]);
    if (prove.code !== 0) {
      return sendJson(res, 422, {
        error:
          'groth16 proving failed (an illegal/unfinished/forged game cannot be proven, or the Docker stark2snark stage is unavailable)',
        detail: (prove.stderr || prove.stdout).slice(-1500),
      });
    }

    // 2) Map the receipt to the on-chain settle JSON (pure serializer; prints JSON on stdout).
    const settle = await run(PROVER_BIN, ['settle-spend', receiptPath]);
    if (settle.code !== 0) {
      return sendJson(res, 500, {
        error: 'receipt -> on-chain settle mapping failed',
        detail: (settle.stderr || settle.stdout).slice(-1500),
      });
    }
    let parsed;
    try {
      parsed = JSON.parse(settle.stdout.trim().split('\n').pop());
    } catch (e) {
      return sendJson(res, 500, { error: 'settle-spend did not emit valid JSON', detail: String(e) });
    }
    return sendJson(res, 200, parsed);
  } catch (e) {
    return sendJson(res, 500, { error: `prover service error: ${e.message}` });
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    return sendJson(res, 200, { ok: true, prover_bin: PROVER_BIN });
  }
  if (req.method === 'POST' && req.url === '/prove-game-settle') {
    // GATE: reject unauthenticated callers when a shared-secret token is configured.
    if (!authorized(req)) {
      return sendJson(res, 401, {
        error: 'unauthorized: this prover requires a bearer token (set Authorization: Bearer <COVEX_PROVER_TOKEN>)',
      });
    }
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return sendJson(res, 400, { error: 'request body must be valid JSON' });
      }
      handleProve(req, res, body);
    });
    return;
  }
  sendJson(res, 404, { error: 'not found (POST /prove-game-settle or GET /healthz)' });
});

server.listen(PORT, BIND, () => {
  // eslint-disable-next-line no-console
  console.log(
    `covex prover-service listening on ${BIND}:${PORT} (prover bin: ${PROVER_BIN}, auth: ${TOKEN ? 'token required' : 'disabled'})`
  );
  if (process.env.RISC0_DEV_MODE && process.env.RISC0_DEV_MODE !== '0') {
    // eslint-disable-next-line no-console
    console.warn('WARNING: RISC0_DEV_MODE is set; prove-groth16 will REFUSE (it needs a real proof).');
  }
  if (!bindIsLoopback() && !TOKEN) {
    // eslint-disable-next-line no-console
    console.warn(
      `WARNING: bound to a non-loopback address (${BIND}) with NO COVEX_PROVER_TOKEN set. This minutes-long prove endpoint is reachable + unauthenticated (DoS risk). Set COVEX_PROVER_TOKEN and put it behind a TLS reverse proxy.`
    );
  }
});
