# Covex general verifiable-computation zkVM - design + build spec

Goal: a user has a deterministic computation - an arithmetic function, a hash chain, a predicate, an
unrolled linear-algebra kernel - and wants a **zkVM (RISC0) proof** that attests *"I ran THIS
program on THESE public inputs and got THIS output"*, which anyone can verify off-chain without
re-running it. This is the general-purpose sibling of the games prover: instead of replaying one
fixed family of games, the guest interprets a small program supplied as data, so a single proven
guest covers arbitrary straight-line computations.

## Why a zkVM (not circom)

A custom circom circuit must be hand-written and trusted-set-up per computation. Here the guest is a
fixed RISC0 program (one image id, one ceremony-free STARK) that interprets an ISA, so *any* program
expressible in the ISA is proven by the same guest. The program is bound by `sha256(program)`, which
the guest recomputes and commits, so the proof still pins exactly which program ran. Prove on a
multi-core machine (WSL); verification is cheap and runs anywhere.

## Hard constraint (drives the resolution design)

Kaspa has NO on-chain pairing/STARK verifier, so the chain cannot check the receipt. The proof is
verified OFF-chain; the covenant release is gated by a co-signature. The receipt is the off-chain
artifact the counterparty or the Covex oracle verifies before co-signing. This mirrors the games
prover and the rest of Covex: the oracle is the trusted verifier, and it fails closed (a receipt
that does not verify against the image id is rejected).

## The machine (covex-compute-core, pure Rust, no risc0 dep)

A deterministic stack machine over `u64`:
- operand **stack** (bounded `MAX_STACK = 1024`),
- **register** file `regs[0..16]` (scratch; `Store` / `LoadReg`),
- read-only **input** tape (the public inputs; length must equal `program.num_inputs`).

`Program { num_inputs: u32, ops: Vec<Op> }`. `Op` (one word per stack slot):
```
PushConst(u64)  Load(u32)  Store(u8)  LoadReg(u8)  Dup  Pop  Swap
Add Sub Mul     Div Rem (trap on /0)   Lt Eq   And Or Xor   Hash8
```
`Hash8` pops 8 entries (top first), sha256s their low bytes, pushes the first 8 digest bytes as a
big-endian `u64`. (RISC0 accelerates sha2, so this is the cheap in-ISA hash; chaining it builds a
hash chain.)

`execute(program, inputs) -> Result<u64, VmError>`:
- one step per op, **no loops, no jumps** -> always halts in `ops.len()` steps,
- wrapping `u64` arithmetic (deterministic modular math),
- every fault is an `Err` (input arity mismatch, out-of-range load, bad register, stack
  under/overflow, divide-by-zero, or a final stack that is not exactly one value),
- must halt with exactly one value = the output.

This is a deliberate **v1 simplification**: straight-line only. Bounded iteration is expressed by
unrolling at program-build time (a dot product of length `n` is `n` unrolled multiply-accumulates;
a matrix-vector multiply is a stack of dot products - the linear-algebra core of simple zkML). It
does not cover unbounded iteration. Documented honestly in the README.

## The proof (the statement and the binding)

The host writes a `GuestInput` into the zkVM:
```
program: Program                 // witness (revealed only through its hash)
public_inputs: Vec<u64>          // public
claimed_program_hash: [u8;32]    // public: sha256(serialize_program(program))
claimed_output: u64              // public: the asserted result
```

`run_checked` (shared core, run identically on host and guest):
```
1. assert sha256(serialize_program(program)) == claimed_program_hash    // binds WHICH program
2. output = execute(program, public_inputs)?                            // any trap -> Err
3. assert output == claimed_output                                      // binds the result
-> commit Statement { program_hash, public_inputs, output }
```

`serialize_program` is an explicit big-endian byte encoding (`num_inputs`, op count, then a 1-byte
tag + operands per op), **not** serde/bincode, so the program hash is stable and reproducible across
tools and machines.

## The guest (methods/guest)

`#![no_main]`, `env::read::<GuestInput>()`, `run_checked(...).expect(...)`, `env::commit(&statement)`.
The single honesty invariant: `run_checked` returns `Err` the instant the hash is wrong, the program
traps, or the claimed output is wrong; `.expect()` panics; the prover produces NO receipt. Therefore
a verifying receipt implies the committed `Statement` is true.

## The host (host/) - the gate

For each demo program: build the HONEST `GuestInput` (run `execute` on the host to get the true
output + hash), prove, `receipt.verify(COMPUTE_GUEST_ID)`, decode the journal, assert
`{program_hash, public_inputs, output}`. Then the negatives:
- a WRONG claimed output -> fails to prove (no receipt),
- a WRONG claimed program hash -> fails to prove (no receipt),
- a RUNTIME TRAP (divide-by-zero) -> fails to prove (no receipt),
- a TAMPERED receipt (flip a journal byte) -> `verify()` rejects it.

## The CLI (cli/) - covex-compute-prover

`prove <input.json> <out.bin>` | `verify <receipt.bin>` | `hash <program.json>` |
`tamper-journal <in.bin> <out.bin>`. The trustless baseline: a prover produces the receipt; anyone
verifies it. `prove` self-verifies the fresh receipt before saving. If the JSON omits
`claimed_output`, the CLI fills the honest one (the guest re-checks regardless, so this never
weakens soundness). The image id printed by `prove` is the one `verify` checks (portable identity).

## What is NOT claimed (no overclaiming)

- The receipt attests only `{program_hash, public_inputs, output}` - not that the program is useful
  or the one you meant. Compare `program_hash` against a published id.
- v1 inputs are PUBLIC (committed in the clear). Zero-knowledge hides the execution trace, not these
  inputs. Private-witness inputs ("there exist inputs such that f(inputs)=output") is a future
  version, not a current claim.
- Real proofs require `RISC0_DEV_MODE=0`. Dev-mode receipts carry no seal; both `prove` and `verify`
  print the dev-mode state.

## Future versions (not built here)

- Private-witness inputs (split the input tape into public + secret witnesses).
- A `Commit(reg)` op to commit intermediate values, and signed inputs (bind a computation to real
  parties, like the games prover's per-move signatures plan).
- Bounded loops via a fuel-metered `Jump`/`JumpIfZero` (keeps the halting guarantee) instead of
  build-time unrolling.
- Signed/fixed-point encodings as a documented convention over the `u64` words.
