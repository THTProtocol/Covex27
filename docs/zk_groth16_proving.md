# Stage 2 proving: RISC0 -> Groth16 receipt for the Covex games guest

Stage 2 of `docs/ZK_ONCHAIN_PLAN.md`. Goal: emit a real RISC0 -> Groth16 receipt for the one shared
games guest, in the on-chain-verifiable form the Kaspa KIP-16 `OpZkPrecompile` (opcode `0xa6`, tag
`0x20`) verifies, plus the frozen image id + verifying key + the deterministic Fr public-input
mapping. This file records the exact commands, the measured cost, where it ran, and the honest
caveats.

## TL;DR (status)

- **Code: DONE and built.** The host has a gated Groth16 path
  (`prove_with_opts(env, GAMES_GUEST_ELF, &ProverOpts::groth16())`), and a new crate
  `zkvm/onchain` converts the receipt to the byte-exact KIP-16 tag-0x20 witness (compressed VK +
  compressed proof + 5 little-endian Fr public inputs). All non-proving logic is unit-tested green.
- **Native pipeline: PROVEN on WSL.** The full native prove path up to the wrap (composite STARK ->
  lift/join -> **succinct receipt**) runs in **35.4 s at 2.42 GB peak RAM** on the local WSL box
  (x86_64, 16 cores, 15 GiB). Succinct receipt verifies against the frozen image id.
- **The Groth16 wrap (stark2snark): BLOCKED on a Docker daemon, not on compute.** RISC0 3.0.x does
  the SNARK wrap by shelling out to the Docker image `risczero/risc0-groth16-prover:v2025-04-03.1`
  (confirmed in `risc0-groth16-3.0.4/src/prove/docker.rs`). No native/CUDA wrap is installed. A
  running Docker daemon was not obtainable autonomously on this machine (see "The Docker blocker").
  The real sample receipt + `samples/` artifacts are produced by ONE command the moment Docker is
  up (or a Bonsai key is set). The Fr-mapping, VK, image id, and seal decoder are already proven
  correct without it.

## Where it ran

| Step | Box | Result |
|------|-----|--------|
| Guest compile + image id freeze | WSL Ubuntu (x86_64, 16 cores, 15 GiB), RISC0 3.0.5 | `GAMES_GUEST_ID` frozen (below) |
| `cargo test -p covex-games-onchain` | same | 5/5 green (VK, Fr inputs, seal decoder, image-id crosscheck) |
| Succinct receipt prove (native, no Docker) | same | **35.4 s, 2.42 GB peak RSS**, verifies |
| Groth16 wrap (stark2snark, Docker) | not run | blocked on Docker daemon (turnkey once up) |

The repo source of truth is the Windows worktree `C:/Users/User/Desktop/Covex/_work/oracle-reframe`;
the WSL build copy used for proving is `~/covex-stage2` (ext4, for fast RISC0 builds), kept in sync
by `rsync`.

## The exact proving command

From the chess host workspace on an x86_64 box with the RISC0 toolchain AND a running Docker daemon:

```bash
# one-shot script (see zkvm/onchain/prove_sample.sh):
export PATH="$HOME/.risc0/bin:$HOME/.cargo/bin:$PATH"
export RISC0_DEV_MODE=0            # MUST be a real proof
cd zkvm/chess
cargo build --release -p host
COVEX_PROVE_GROTH16=1 COVEX_SAMPLES_DIR=../onchain/samples ./target/release/host
```

This proves a decisive chess game (Scholar's mate, white wins) with a real-looking 32-byte
covenant_id and real 32-byte x-only winner pubkeys, then:
1. verifies the Groth16 receipt against `GAMES_GUEST_ID` (accept),
2. flips a journal byte and confirms `verify()` REJECTS the tampered receipt,
3. converts to the on-chain witness and writes `samples/{proof,vk,journal,image_id,public_inputs}.hex`
   + `samples/manifest.json`,
4. flips a seal byte and confirms the converter yields different proof bytes (chain rejects, Stage 4).

The succinct smoke (native, no Docker) that was actually run here:

```bash
RISC0_DEV_MODE=0 COVEX_PROVE_SUCCINCT=1 ./target/release/host
# -> SUCCINCT ok in 35.4s (inner is Succinct: true). Maximum resident set size: 2418112 kB (2.42 GB)
```

## Measured cost

- Succinct prove (everything except the Docker wrap): **35.4 s wall**, **2.42 GB peak RAM**, 16
  cores. The composite STARK + lift/join dominate; this is the heavy native work.
- The stark2snark wrap is a fixed-cost step inside the Docker container (rapidsnark over the RISC0
  stark-verify circuit), historically ~1 to 2 minutes and a few GB. The first run also pulls the
  `risczero/risc0-groth16-prover:v2025-04-03.1` image (several GB). The WSL box's 15 GiB RAM is
  comfortably enough; the wrap is NOT the bottleneck. The blocker is purely starting Docker.

## The Docker blocker (honest account of what was tried)

The SNARK wrap requires a running Docker daemon on x86_64. On this machine, every autonomous path
to a daemon was exhausted:

- **WSL rootful `dockerd`**: needs `sudo` (password not available to the agent).
- **WSL rootless docker**: needs the `uidmap` package via `sudo apt-get` (same blocker).
- **Docker Desktop (installed)**: the GUI launches `com.docker.backend.exe` but never bootstraps
  the engine VM (`docker-desktop` WSL distro stays `Stopped`); there is no `com.docker.service`
  Windows service to start the engine headlessly. Docker Desktop needs an interactive desktop
  session to fully initialize, which is not available in this automated context.
- **hightable.pro server**: Docker IS running, but the box is 7.6 GiB RAM with only ~3.5 GiB free
  while two kaspad nodes run (incl. the **live TN12 covenant node** the money path depends on).
  Running a memory-heavy groth16 wrap there risks OOM-ing the production TN12 node and would thrash
  25 GiB of swap. Per the fail-closed rule, the live money-path node was NOT put at risk.
- **Hetzner provisioning**: no `hcloud` CLI or API token is available to the agent.
- **Bonsai (hosted prover, does the wrap server-side)**: no `BONSAI_API_KEY` is set anywhere.

### To finish the wrap (any ONE of these unblocks it; the command above is then turnkey)

1. **Start Docker Desktop interactively** on this PC (one click), confirm `docker version` works in
   WSL, then run `zkvm/onchain/prove_sample.sh` (or the `COVEX_PROVE_GROTH16=1` command). Best
   option: the WSL box already proved it has the compute (35 s / 2.4 GB succinct).
2. **Give the WSL user a sudo password / install `uidmap`** so rootless dockerd can run, then the
   same command.
3. **Provision an x86 Docker box** (Hetzner CPX31/CCX, >=8 GB RAM) with the RISC0 toolchain, rsync
   `zkvm/`, and run the command there. (Needs an `hcloud` token or manual provisioning.)
4. **Set `BONSAI_API_KEY`** (and `BONSAI_API_URL`); `default_prover()` then uses Bonsai, which does
   the wrap server-side and returns the Groth16 receipt with no local Docker.

## What is FROZEN and PROVEN now (independent of the wrap)

### Image id (one shared multi-game guest)

```
GAMES_GUEST_ID (u32[8]) = [496092535, 195191819, 3365918585, 3877556533,
                           1750049808, 219838195, 1454856474, 2517526821]
```

Frozen in `zkvm/onchain/src/lib.rs` as `GAMES_GUEST_ID`; the dev-test `image_id_matches_methods`
re-derives it from the live guest compile and asserts equality (drift fails the test). As bytes
(little-endian per word), `image_id_hex()` emits the 32-byte hex.

### Verifying key (on-chain, tag 0x20)

The VK is the RISC0-version-constant Groth16 verifying key (`risc0_groth16::verifying_key()`),
re-serialized **ark-compressed** (`VerifyingKey<Bn254>::serialize_compressed`), which is exactly
what the on-chain ABI `VerifyingKey::deserialize_compressed` consumes. `verifying_key_compressed()`
produces it; the test `vk_compressed_roundtrips` confirms it deserializes back canonically.

### The Fr public-input mapping (the load-bearing schema)

A RISC0 Groth16 receipt verifies against EXACTLY **5** BN254 `Fr` public inputs, confirmed against
`risc0_groth16::Verifier::new` (risc0-groth16 3.0.4). In ABI order (each 32-byte **little-endian**):

```
[ a0, a1, c0, c1, id_bn254_fr ]
  (a0, a1) = split_digest(control_root)     // RISC0 recursion control root (version constant)
  (c0, c1) = split_digest(claim_digest)     // SHA-256 digest of the ReceiptClaim
  id_bn254_fr = Fr(bn254_control_id, reversed)  // BN254/Poseidon control id (version constant)
```

`split_digest(d)` = reverse `d` to big-endian, split the 32 bytes in half, turn each 16-byte half
into an `Fr` (so a0..c1 are 128-bit values). Implemented + tested in `zkvm/onchain/src/lib.rs`
(`public_inputs_le`); `public_inputs_are_five_canonical_le_fr` confirms all 5 are canonical LE Fr,
and `control_inputs_are_claim_independent` confirms a0/a1/id are version constants while c0/c1 track
the claim.

**Where image id + journal bind (critical for Stage 3/4):** the IMAGE ID and the JOURNAL are NOT
direct public inputs. They are folded into `claim_digest` (c0/c1). The RISC0 `ReceiptClaim` is
`{ pre: image_id, post:{pc:0,..}, exit_code: Halted(0), input: ZERO, output:{ journal_digest,
assumptions: ZERO } }`; its SHA-256 digest is split into c0/c1. So:
- a different guest image changes `pre` -> changes the claim digest -> the pinned VK no longer
  verifies (the spender cannot swap the program);
- a different journal (winner_pubkey / covenant_id / stake) changes `output.journal_digest` ->
  changes c0/c1 (the spender cannot relabel the payee or cross-replay another pot).

This means the Stage 3 covenant must pin the VK + a0/a1 + id as exact-data pushes, and bind c0/c1 to
the specific journal it expects (i.e. to this covenant_id + winner_pubkey). The `zkvm/onchain` crate
emits all of this deterministically so Stage 3 (covenant) and Stage 4 (TN12 spend) consume identical
bytes.

### Cross-validation against the live-node known-good vector (strong evidence)

`docs/zk_precompile_abi.md` records a known-good Groth16 stack taken from the live TN12 node source
(`groth16/mod.rs::try_verify_stack`) - a 5-input stack the node's `Groth16Precompile::verify_zk`
ACCEPTS. Our `zkvm/onchain` code, run with `COVEX_EMIT_CONSTANTS=1`, emits:

- a compressed VK that is **byte-exact identical** to that vector's VK (848 hex chars, verified equal),
- `a0 = a54dc85ac99f851c92d7c96d7318af41...` == the vector's `input0`,
- `a1 = dbe7c0194edfcc37eb4d422a998c1f56...` == the vector's `input1`,
- `id_bn254_fr = c07a65145c3cb48b6101962ea607a4dd93c753bb26975cb47feb00d3666e4404` == `input4`.

So the VK and the three CLAIM-INDEPENDENT public inputs (control root halves + bn254 control id) our
mapping produces match a stack the live node already accepts. Only `input2`/`input3` (c0/c1 = the
claim-digest halves) vary per game, and those are produced by the SAME `split_digest` that is proven
correct for a0/a1. This validates the on-chain VK + Fr mapping short of the real seal itself.

### Seal -> on-chain proof decoder

The RISC0 Groth16 `seal` (256 bytes: a=2x32, b=2x2x32, c=2x32, big-endian uncompressed coords) is
reconstructed into `ark_groth16::Proof<Bn254>` and serialized **compressed** for tag 0x20, mirroring
`risc0_groth16::Verifier::new_inner` byte-for-byte. The test `seal_decoder_roundtrips_a_known_proof`
builds a known proof, encodes it to seal format, runs our decoder, and recovers the exact same G1/G2
points, so the coordinate ordering is proven correct without needing a real receipt.

## Honest caveats (not confirmable until the live TN12 tx, Stage 4)

1. **The real Groth16 seal is not yet produced here** (Docker blocker). Everything that does NOT
   need the seal is proven (VK, image id, Fr mapping, seal-decoder byte ordering, the full native
   prove path). The actual receipt + `samples/` artifacts land with one command once Docker/Bonsai
   is available.
2. **Image-id / control-root binding to the ON-CHAIN verifier** can only be fully confirmed by a
   live TN12 tx (Stage 4): the activated kaspad's RISC0 verifier params (control root, bn254 control
   id, VK) must match the prover's RISC0 version. We read these from the linked `risc0-zkvm`
   (`Groth16ReceiptVerifierParameters::default()`), but the on-chain node's pinned values are only
   provable by submitting a real proof (accept) and a forged one (reject). This is exactly Stage 4's
   non-negotiable gate, and the mainnet caveat (Stage 6): the prover's RISC0 control root must match
   the activated kaspad build.
3. **The tamper-reject gate on the Groth16 receipt** is wired (flip a journal byte -> `verify()`
   rejects; flip a seal byte -> different proof bytes) but only executes inside the gated proving
   run, so it is confirmed together with item 1.

## Files

- `zkvm/onchain/src/lib.rs` - the constants + Fr-input mapping + seal/VK -> on-chain bytes converter.
- `zkvm/onchain/Cargo.toml` - standalone crate (path dep of the chess host).
- `zkvm/onchain/prove_sample.sh` - the one-shot proving + artifact-writing script.
- `zkvm/onchain/samples/` - the sample artifacts (written by the gated run; see `samples/README.md`).
- `zkvm/chess/host/src/main.rs` - the host with the gated `COVEX_PROVE_GROTH16` / `COVEX_PROVE_SUCCINCT`
  paths.
- `docs/zk_precompile_abi.md` - the byte-exact on-chain ABI (Stage 0).
