# Covex prover-service (off-box RISC0 -> Groth16 for on-chain ZK game settlement)

This is the reference **prover service** the Covex backend calls to obtain a RISC0 -> Groth16 receipt
for an on-chain ZK game settle (KIP-16 `OpZkPrecompile`, opcode `0xa6`, tag `0x20`). It exists because
the proving is too heavy for the backend host.

## Why a separate service (the honest hosted-prover requirement)

A RISC0 -> Groth16 proof is produced as: composite STARK -> lift/join to a succinct receipt ->
**Docker `stark2snark` wrap** into a BN254 Groth16 seal. That wrap needs:

- an **x86_64** host,
- **Docker** running (it pulls/uses the RISC0 `stark2snark` image),
- **>= 12GB RAM** (16GB recommended; the 7GB Covex backend box CANNOT do it),
- `RISC0_DEV_MODE` UNSET / `0` (a real proof; dev mode produces a fake receipt the on-chain converter
  refuses).

So for production this runs on a **dedicated prove box** (a dev/GPU machine or a Bonsai-backed host),
NOT on the backend host. For testing it can run in WSL on a developer machine with enough RAM and
Docker. A single game proof takes on the order of minutes; the backend's `COVEX_PROVER_TIMEOUT_SECS`
(default 900s) covers it.

If no prover is configured, the backend's `/api/games/:id/settle-zk` route **fails closed** with an
honest message. It never fabricates a proof. The chain re-verifies the proof at spend time regardless.

## Build the prover CLI

The service shells out to the `covex-games-prover` binary (the `zkvm/chess/cli` crate), which has the
`prove-groth16` and `settle-spend` subcommands this service uses:

```bash
# In WSL / on the prove box (NOT the 7GB backend host):
cd zkvm/chess
cargo build --release -p covex-games-prover
# binary at zkvm/chess/target/release/covex-games-prover
```

The Groth16 wrap requires Docker. Confirm Docker is up first:

```bash
docker info >/dev/null && echo "docker OK"
```

## Run the service

```bash
export COVEX_GAMES_PROVER_BIN=/abs/path/to/zkvm/chess/target/release/covex-games-prover
export PROVER_PORT=7720           # optional, default 7720
unset RISC0_DEV_MODE              # a REAL proof is required
node prover-service/server.mjs
```

Point the backend at it:

```bash
export COVEX_PROVER_URL=http://127.0.0.1:7720
# (and KASPA_ZK_PRECOMPILE_ENABLED=1 to allow the gated settle-zk route on testnet)
```

## Security: bind + auth (do NOT expose an open prove endpoint)

`POST /prove-game-settle` runs a minutes-long compute job (the RISC0 -> Groth16 wrap). An open,
unauthenticated copy of it on a public interface is a DoS amplifier. The service therefore:

- **binds to `127.0.0.1` by default** (`COVEX_PROVER_BIND`). It is reachable only from the same box
  unless you change this.
- supports an **optional shared-secret bearer token** (`COVEX_PROVER_TOKEN`). When set, every
  `/prove-game-settle` request MUST carry `Authorization: Bearer <token>` or it is rejected `401`
  (`/healthz` stays open for liveness checks).

If the backend and the prover live on the SAME box, the loopback default needs no token. If the
prover is on a SEPARATE box reachable over the network, you MUST set the token and sit behind a TLS
reverse proxy:

```bash
# On the prove box:
export COVEX_PROVER_BIND=0.0.0.0           # reachable across the network (proxy in front of it)
export COVEX_PROVER_TOKEN="$(openssl rand -hex 32)"   # a strong shared secret
node prover-service/server.mjs

# On the Covex backend box (sends the same token automatically):
export COVEX_PROVER_URL=https://prover.internal.example   # the TLS reverse proxy
export COVEX_PROVER_TOKEN="<the same secret>"
```

The service logs `auth: token required` / `auth: disabled` at startup and warns loudly if it binds
to a non-loopback address with NO token set. The backend's `zk_prover_client` attaches the token as
`Authorization: Bearer` whenever `COVEX_PROVER_TOKEN` is set on the backend.

## API

### `POST /prove-game-settle`

Request body (the friendly `GameInput` the CLI parses):

```json
{
  "game_type": "chess",
  "moves": ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"],
  "players": ["<p1 x-only hex (64)>", "<p2 x-only hex (64)>"],
  "covenant_id": "<pot deploy tx id hex (64)>",
  "stake_sompi": 100000000,
  "elapsed_ms": [0, 0, 0, 0, 0, 0, 0]
}
```

`players` MUST be the two x-only keys baked in the covenant (so the proof's `players[winner]` equals
the on-chain winner key), and `covenant_id` MUST be the pot's deploy tx id (so the proof binds THIS
pot). The Covex backend fills both from the authoritative match record.

Success response (the `settle-spend` JSON, byte-exact for KIP-16 tag `0x20`):

```json
{
  "schema": "covex-games-settle-spend/v1",
  "proof_hex": "<ark-compressed Groth16 Proof>",
  "vk_hex": "<ark-compressed BN254 VerifyingKey>",
  "public_inputs": ["<a0>", "<a1>", "<c0>", "<c1>", "<id>"],
  "winner_pubkey": "<journal payee id (players[winner])>",
  "covenant_id": "<journal covenant_id>",
  "winner_code": 0,
  "stake_sompi": 100000000,
  "image_id": "<frozen GAMES_GUEST_ID hex>"
}
```

Errors (never a fake proof):
- `400` malformed input
- `422` the game cannot be proven (illegal/unfinished/forged), or the Docker stark2snark stage is
  unavailable - the `detail` field carries the prover's own message
- `500` an internal mapping/serialization failure

### `GET /healthz`

```json
{ "ok": true, "prover_bin": "covex-games-prover" }
```

## Quick smoke (no backend)

```bash
curl -s localhost:7720/healthz
curl -s -X POST localhost:7720/prove-game-settle \
  -H 'Content-Type: application/json' \
  -d '{"game_type":"chess","moves":["e2e4","e7e5","f1c4","b8c6","d1h5","g8f6","h5f7"],
       "players":["8f2e4d6c1a9b3e5f7c0d2a4b6e8f1c3d5a7b9e0f2c4d6a8b1e3f5c7d9a0b2e4f",
                  "1b3d5f7a9c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d0f2a4c6e8b0d"],
       "covenant_id":"4a6f1c9e2b7d8a350f1e6c4b9a2d7e8f0c3b5a6d9e1f2c4b7a8d3e6f1c9b2a5d",
       "stake_sompi":100000000}'
```

The first call proves a real game (minutes); a winning chess game returns the settle JSON, an illegal
move returns `422`.
