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

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = parseInt(process.env.PROVER_PORT || '7720', 10);
const PROVER_BIN = process.env.COVEX_GAMES_PROVER_BIN || 'covex-games-prover';
const MAX_BODY = 256 * 1024; // a GameInput is tiny; reject anything large.

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

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`covex prover-service listening on :${PORT} (prover bin: ${PROVER_BIN})`);
  if (process.env.RISC0_DEV_MODE && process.env.RISC0_DEV_MODE !== '0') {
    // eslint-disable-next-line no-console
    console.warn('WARNING: RISC0_DEV_MODE is set; prove-groth16 will REFUSE (it needs a real proof).');
  }
});
