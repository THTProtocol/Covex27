# Stage 2 on-chain Groth16 sample artifacts

These are the byte-exact inputs the Kaspa KIP-16 `OpZkPrecompile` (opcode `0xa6`, tag `0x20`)
verifier consumes for a Covex games settlement. They are what Stage 3 (the `ZkGameSettle` covenant)
and Stage 4 (the live TN12 spend) build on. See `docs/zk_groth16_proving.md` and
`docs/zk_precompile_abi.md`.

## What is here now (wrap-independent, committed)

These are produced by `COVEX_EMIT_CONSTANTS=1` and do NOT need the Docker stark2snark wrap. They are
the FROZEN, pinned constants:

| file | what |
|------|------|
| `image_id.hex` | the frozen `GAMES_GUEST_ID` as the 32-byte hex (the one shared games guest image) |
| `vk.hex` | the ark-**compressed** `VerifyingKey<Bn254>` the on-chain tag-0x20 verifier deserializes. **Byte-exact identical** to the live-node known-good VK in `docs/zk_precompile_abi.md`. |
| `control_inputs.hex` | the claim-independent Fr public inputs `a0`, `a1` (control root halves) and `id_bn254_fr` (bn254 control id), each 32-byte little-endian. `a0`/`a1`/`id` match `input0`/`input1`/`input4` of the live-node accepted vector. |

## What lands after the gated Groth16 proof run

Running `zkvm/onchain/prove_sample.sh` (needs x86_64 + Docker, or a Bonsai key) adds the per-game
material for a real decisive chess game (Scholar's mate, white wins) with a real covenant_id +
winner pubkeys:

| file | what |
|------|------|
| `proof.hex` | the ark-**compressed** `Proof<Bn254>` (rebuilt from the RISC0 seal). From the winner's spend witness. |
| `journal.hex` | the raw RISC0 journal bytes (GameResult + SettlementJournal frames). |
| `public_inputs.hex` | all 5 Fr public inputs in ABI order (a0, a1, c0, c1, id), one 32-byte LE hex per line. |
| `manifest.json` | a self-describing manifest: covenant_id, winner_code, winner_pubkey, stake, moves_digest, image id, VK, proof, journal, the 5 inputs, prove time, and the push-order note. This is what Stage 3/4 actually load. |

`c0`/`c1` in `public_inputs.hex` are the claim-digest halves; they BIND the image id + journal
(winner_pubkey / covenant_id / stake) into the proof (see `docs/zk_groth16_proving.md`).

## On-chain push order (from the ABI)

To build the witness/script, push bottom -> top:
`input[n-1] .. input[0]`, then `n_inputs (i32)`, then `proof (compressed)`, then `VK (compressed)`,
then the tag byte `0x20`, then `OpZkPrecompile`. The opcode pops tag, VK, proof, n, inputs, verifies,
and pushes `true`.
