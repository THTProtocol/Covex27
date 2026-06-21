# covex-compute-prover

Open-source CLI to **prove a deterministic program ran on given inputs and produced a claimed
output**, using a real RISC0 zk proof, and to **verify the receipt** off-chain. This is the
foundation for general verifiable computation on Covex: arbitrary straight-line predicates, hash
chains, and unrolled linear-algebra (the building block for simple zkML), all reduced to one
statement anyone can check.

A receipt is a succinct zero-knowledge proof of exactly this statement:

> **"A program whose sha256 is `program_hash`, run on these `public_inputs`, produces this
> `output`."**

The program is bound by its hash, so the proof attests to *one exact program*. Producing a receipt
is only possible when the witnessed program really hashes to the claimed `program_hash`, executes
without trapping, and yields the claimed `output`. Any mismatch makes the guest panic, so **no
receipt can exist** (the honesty gate). A verifying receipt therefore *implies the statement is
true* - it does not merely assert it.

## What the machine is (honest scope)

The guest interprets a tiny, fully deterministic **stack machine** over `u64`:

- an operand **stack** (bounded to 1024),
- a fixed **register** file of 16 `u64` (scratch, for `Store` / `LoadReg`),
- a read-only **input** tape (the public inputs).

ISA (one `u64` word per slot):

| op | effect |
|----|--------|
| `push v` | push constant `v` |
| `load i` | push `input[i]` (traps if out of range) |
| `store r` | pop, store into register `r` |
| `loadreg r` | push register `r` (default 0) |
| `dup` / `pop` / `swap` | stack shuffles |
| `add` `sub` `mul` | wrapping `u64` arithmetic |
| `div` `rem` | integer division / remainder (**trap** on divide-by-zero, never a silent 0) |
| `lt` `eq` | comparisons, push `1`/`0` |
| `and` `or` `xor` | bitwise |
| `hash8` | pop 8 entries, sha256 their low bytes, push the first 8 digest bytes as a big-endian `u64` |

**Honest simplification (v1):** there are **no loops and no data-dependent jumps**. Control flow is
exactly the linear op order, so the machine always halts in `ops.len()` steps and proving cost is
predictable. This covers arbitrary straight-line arithmetic, hashing, comparison predicates, and
*unrolled* iteration (a length-`n` dot product is `n` unrolled multiply-accumulates; a matrix-vector
multiply is a stack of dot products - the linear-algebra core of simple zkML). It does **not**
cover unbounded iteration; express bounded loops by unrolling at program-build time. The program
also must halt with **exactly one** value on the stack (its single `u64` output).

All arithmetic is wrapping (modular) `u64`. This is deterministic fixed-width integer math, not
field arithmetic; if you need signed or fractional values, encode them (e.g. fixed-point) in the
program. The same `execute()` runs inside and outside the zkVM, so the host pre-computes the honest
output and the `core` crate's unit tests exercise the identical code path.

## Trust model (honest)

Kaspa has **no on-chain pairing or STARK verifier**, so the chain cannot check the receipt itself.
The receipt is verified **off-chain** by the counterparty or by the Covex oracle, and that
verification is what gates the co-signature on a 2-of-2 covenant.

- A prover produces a receipt with `prove`. Anyone runs `verify` to trust the result without
  re-running the program.
- A prover **cannot** claim a false output: the guest recomputes the output from the witnessed
  program and rejects a wrong claim, so no receipt is ever produced for a false statement.
- A prover **cannot** swap the program: `program_hash` is recomputed inside the proof and committed,
  so the receipt is pinned to one exact program. Compare the committed `program_hash` against the
  one you published to confirm *which* program ran.
- A **tampered** receipt (e.g. flipping the output in the journal) is rejected by `verify` because
  the STARK seal binds the journal.

You do not have to trust Covex to check a result: build this tool yourself and run `verify` on any
receipt.

## Requirements

- The RISC0 toolchain (rzup / r0vm 3.0.x) and a recent Rust toolchain. On this project they live in
  WSL Ubuntu, not Windows.
- A few GB of RAM for real proving; a handful of seconds per small program on a multi-core machine
  (proving cost grows with the op count). Verification is cheap (well under a second) and runs
  anywhere.

## Build

The CLI is a member of the `compute` workspace. Always set the RISC0 environment and a fast native
target directory first (the `/mnt/c` mount is slow for cargo I/O):

```bash
. "$HOME/.cargo/env"
export PATH="$HOME/.risc0/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/covex-zkvm-target"

cd zkvm/compute
cargo build --release -p covex-compute-prover
```

The binary is at `$CARGO_TARGET_DIR/release/covex-compute-prover`. The first build also compiles
the zkVM guest (the RISC-V program that is proven); subsequent builds are fast.

## Prove your own computation

Write a program + inputs as JSON, then prove it. Real proofs require `RISC0_DEV_MODE=0`
(`RISC0_DEV_MODE=1` is a fast dry run that produces a fake receipt with no real seal, useful only to
check the toolchain builds).

```bash
export RISC0_DEV_MODE=0
covex-compute-prover prove examples/quadratic.json quad_receipt.bin
```

This prints the committed `Statement` (`program_hash`, `public_inputs`, `output`) and the guest
**image id**, and writes the serialized receipt to `quad_receipt.bin`.

### Input JSON schema

| field | type | required | meaning |
|-------|------|----------|---------|
| `num_inputs` | u32 | yes | The input-tape length the program expects. Part of the program hash. |
| `ops` | array of op objects | yes | The ordered instructions (see below). |
| `inputs` | array of u64 | yes | The public input tape (must have length `num_inputs`). |
| `claimed_output` | u64 | no | The output you assert the program produces. If omitted, the CLI runs the program on the host to fill in the honest output. **The guest re-checks it inside the proof regardless**, so a wrong `claimed_output` simply fails to prove. |

Each op is a small object with an `op` field plus the operand it needs:

```
{"op":"push","v":3}   {"op":"load","i":0}   {"op":"store","r":0}   {"op":"loadreg","r":0}
{"op":"add"} {"op":"sub"} {"op":"mul"} {"op":"div"} {"op":"rem"}
{"op":"lt"}  {"op":"eq"}  {"op":"and"} {"op":"or"}  {"op":"xor"}
{"op":"dup"} {"op":"pop"} {"op":"swap"} {"op":"hash8"}
```

A minimal program, `f(x, y) = x*x + 3*y`:

```json
{
  "num_inputs": 2,
  "ops": [
    {"op": "load", "i": 0},
    {"op": "dup"},
    {"op": "mul"},
    {"op": "push", "v": 3},
    {"op": "load", "i": 1},
    {"op": "mul"},
    {"op": "add"}
  ],
  "inputs": [5, 7]
}
```

See the `examples/` directory:

- `quadratic.json` - `x*x + 3*y` on `[5,7]` = 46.
- `dot_product.json` - `[1,2,3].[4,5,6]` = 32 (the zkML primitive).
- `threshold_predicate.json` - is `dot([3,4],[5,6]) = 39 >= 30`? -> 1 (a custom predicate).
- `hash_chain.json` - fold a seed through `hash8` four times.
- `quadratic_wrong_output.json` - a **negative** example: claims 47 instead of 46, so `prove`
  fails (no receipt). Use it to see the honesty gate reject a false claim.

## Publish the program id

Before sharing a receipt, publish the program's id so a verifier knows *which* program the receipt
should attest to:

```bash
covex-compute-prover hash examples/quadratic.json
# program_hash : fba72b1549be07e114e92fb1551bdfecfd8f2a9aa2fc031b710f167ae380fdb8
```

`program_hash` is `sha256` over a canonical, explicit byte encoding of the program (`num_inputs`,
op count, then a tag + operand per op) - **not** serde/bincode framing - so it is stable and
reproducible across machines and tools.

## Verify someone's receipt

This is the piece a counterparty or an external verifier runs to trust a result without re-running
the program:

```bash
covex-compute-prover verify quad_receipt.bin
```

`verify` deserializes the receipt, checks it against the guest **image id** embedded in this binary,
decodes the committed `Statement`, and prints it. It **exits 0** for a genuine proof and **exits
non-zero** (rejecting the receipt) if the proof does not attest to this exact guest program or if
the journal was tampered with. To confirm *which* program ran, compare the printed `program_hash`
against the one you published with `hash`.

## Soundness self-test

Anyone can confirm the seal binds the journal:

```bash
covex-compute-prover prove          examples/quadratic.json quad.bin
covex-compute-prover tamper-journal quad.bin quad_tampered.bin   # flips one journal byte
covex-compute-prover verify         quad_tampered.bin            # MUST exit non-zero (rejected)
```

`tamper-journal` flips one byte of the committed output region; the STARK seal no longer matches, so
`verify` rejects it. You cannot re-label a receipt to claim a different output.

## What is proven, exactly (no overclaiming)

- A verifying receipt attests **only** the tuple `{program_hash, public_inputs, output}`. It does
  **not** prove the program is *useful*, *safe*, or *the one you meant* - it proves it is the one
  whose sha256 is `program_hash`. Always compare against a published program id.
- This is **not** a hidden-input proof in v1: the `public_inputs` are committed in the clear. The
  zero-knowledge property hides the *execution trace*, not these inputs. Making selected inputs
  private witnesses (so the proof attests "there exist inputs such that ...") is a natural next
  version, not a claim made here.
- Real proofs require `RISC0_DEV_MODE=0`. A receipt produced under `RISC0_DEV_MODE=1` carries no
  cryptographic seal and `verify` should never be trusted on it; `prove`/`verify` both print the
  dev-mode state so you can tell.

## Reproduce the gates

- `build_dev.sh` - core unit tests + a dev-mode build/run (fast, fake proofs; toolchain check).
- `prove_real.sh` - the host gate: real STARK proofs for every demo program, real verification, the
  wrong-output / wrong-hash / runtime-trap negatives, and the tampered-receipt rejection.
- `cli_gate.sh` - the CLI gate: `prove` + `verify` over the example files, `tamper-journal` ->
  `verify` rejection, a wrong-output `prove` that fails, and a prove/verify image-id match check.

## License

MIT.
