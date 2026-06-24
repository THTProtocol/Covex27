# Kaspa KIP-16 `OpZkPrecompile` (0xa6) - byte-exact ABI (frozen from the live TN12 node)

Stage 0 of `docs/ZK_ONCHAIN_PLAN.md`. This is the BLOCKING GATE. Result below.

## Stage 0 verdict: YES - the opcode is live on our TN12 node

The Covex TN12 covenant node is no longer on the PC (that WSL node was deleted
2026-06-19, see memory `covex-local-wsl-tn12-autostart`). TN12 now runs on
Hetzner as `kaspad-tn12.service`:

```
ExecStart=/usr/local/bin/kaspad-covenant --yes --testnet --netsuffix=12 \
  --utxoindex --appdir=/mnt/covex-data/kaspa-data/tn12 \
  --rpclisten=127.0.0.1:16219 --rpclisten-borsh=127.0.0.1:17219 --ram-scale=0.3
```

`/usr/local/bin/kaspad-covenant --version` -> `kaspad 1.1.1-toc.1`.

Evidence the opcode is compiled in and ENABLED on TN12:

1. **Binary symbol table** (`strings /usr/local/bin/kaspad-covenant`): the opcode
   name `OpZkPrecompile` appears in the opcode dispatch table (between `OpMax`
   and `OpCheckMultiSigECDSA`), plus `crypto/txscript/src/zk_precompiles/risc0/rcpt.rs`,
   `risc0-zkp-3.0.3`, `ark-groth16-0.6.0`, `Groth16 verification failed`,
   `image_id mismatch`, `verification indicates proof is invalid`. Not a stub - the real verifier crates are linked.

2. **Matching source** at `/opt/htp/rusty-kaspa` (also `/mnt/covex-data/volume_root/htp/rusty-kaspa`):
   - branch `toccata`, HEAD `b97d1089993b6466148e412c8c0a96ce671f9758`
   - tip commit: `b97d108 post-merge toccata-specific audit cleanup: arkworks 0.6 (#978)`
   - This is AFTER the plan's `covpp-reset1` / merge `10a4af3b` baseline (it already
     folds in the arkworks-0.6 audit cleanup PR #978).

3. **`covenants_enabled` is unconditionally ON for TN12.** The opcode body is gated
   `if vm.flags.covenants_enabled { ... } else { Err(InvalidOpcode) }`. That flag is
   derived from `covenants_activation: ForkActivation` in
   `consensus/core/src/config/params.rs`:
   - `TESTNET12_PARAMS` (NetworkId testnet suffix 12): `covenants_activation: ForkActivation::always()`
   - `From<NetworkId>`: `Some(12) => TESTNET12_PARAMS`
   - MAINNET and TESTNET10 are `ForkActivation::never()` (the known mainnet-disabled
     blocker - see memory `covex-kaspad-mainnet-disabled-covpp`).
   So on `--testnet --netsuffix=12` the opcode is active from genesis. No fork-DAA wait.

> What would expose it if the node lacked it: any rusty-kaspa build at or after the
> `toccata` branch (>= `covpp-reset1` merge `10a4af3b`) with `covenants_enabled`. Our
> node is already there.

### Not yet done (honest caveat)

The plan's Stage 0 also wants a **live test tx** submitted to the node (a known-good
proof verifies, a forged one is rejected). That is a Stage 2+ artifact (it needs a
real RISC0->Groth16 receipt + the `ZkGameSettle` script path) and is NOT part of
this Stage 0/1 deliverable. What is proven here: the opcode + tags + ABI are present
and active. The Rust-level test vector below (from the node source) is a known-good
Groth16 stack that `Groth16Precompile::verify_zk` accepts - it is the in-crate proof
that the verify path works, short of an on-chain tx.

---

## Opcode

```
opcode OpZkPrecompile<0xa6, 1>(self, vm) {
    if vm.flags.covenants_enabled {
        let tag = parse_tag(&mut vm.dstack)?;     // pops 1 tag byte
        vm.consume_script_units(tag.cost())?;     // charges cost up-front
        verify_zk(tag, &mut vm.dstack)?;          // ABORTS script on failure (Err)
        vm.dstack.push_item(true)?;               // pushes TRUE on success
        Ok(())
    } else {
        Err(TxScriptError::InvalidOpcode(...))    // opcode is dead without covenants
    }
}
```

- Opcode byte: **`0xa6`**, sigop weight `1` in the template.
- **Verify-style**: on a bad proof it returns `Err` which fails the whole script
  evaluation (the tx is rejected by consensus). On a good proof it pushes a single
  `true`. You do NOT need a trailing `OpVerify` - but you DO need to consume that
  pushed `true` (e.g. it feeds an `OpIf`, or is dropped, or is the final truthy stack
  top). In the Covex settlement script the `true` is the gate that lets the
  winner-branch `OpCheckSig` run.
- The tag byte is popped FIRST (top of stack), before any proof material.

## Tags (`zk_precompiles/tags.rs`)

| Tag byte | Name | Verifier | Cost (script units) |
|----------|------|----------|---------------------|
| `0x20` | `Groth16` | `Groth16Precompile` (ark-groth16 / BN254) | `1000 * 140` = 140 000 |
| `0x21` | `R0Succinct` | `R0SuccinctPrecompile` (risc0-zkp succinct receipt) | `1000 * 250` = 250 000 |

> NOTE vs the plan text: the plan called tag 0x20 "140 sigops" and 0x21 "740". The
> real figures are SCRIPT UNITS (Gram), 140 000 and 250 000 respectively, not 740.
> Block compute capacity at these costs: 3 Groth16 / 2 R0Succinct verifications per
> block (from the in-crate `cost_block_capacity` tests). Use the table above.

Unknown tags -> `ZkIntegrityError::UnknownTag` (script fails). `compute_zk_cost`
defaults an unknown tag to `max_cost` (250 000).

---

## Tag `0x20` (Groth16 / BN254) stack layout - THIS is what Covex games use

`Groth16Precompile::verify_zk` pops in this order (**top of stack popped first**):

1. `VK` - verifying key, ark-serialize **compressed** `VerifyingKey<Bn254>`
                 (`VerifyingKey::deserialize_compressed`).
2. `proof` - ark-serialize **compressed** `Proof<Bn254>`
                 (`Proof::deserialize_compressed`).
3. `n_inputs` - `i32` (count of public inputs), via `pop_items::<1,i32>()` then
                 `i32s_to_usizes` (must be >= 0).
4. `pub_input[0] .. pub_input[n-1]` - each a 32-byte `Fr` element, **little-endian**
                 canonical (`ark_bn254::Fr::deserialize_uncompressed`, 32 bytes).
                 Popped in stack order, so `pub_input[0]` is the one nearest the top
                 (pushed last).

So to BUILD the witness/script you push in REVERSE (bottom -> top):

```
push pub_input[n-1]
...
push pub_input[0]
push <i32 n_inputs>
push <compressed proof>
push <compressed VK>          # VK ends up on top
push 0x20                     # tag byte on the very top
OpZkPrecompile                # (0xa6)
```

The opcode then pops tag(0x20), VK, proof, n, inputs[0..n], verifies, pushes `true`.

### Internal verify steps (so we know what binds)

```
vk  = VerifyingKey::deserialize_compressed(VK)
pvk = prepare_verifying_key(vk)
proof = Proof::deserialize_compressed(proof_bytes)
prepared = Groth16::<Bn254>::prepare_inputs(pvk, inputs)
verify_proof_with_prepared_inputs(pvk, proof, prepared) ? Ok : Err(VerificationFailed)
```

The VK is supplied on the stack each time (it is NOT pinned by the opcode itself).
**Binding to a specific game/VK is the COVENANT's job**: the settlement script must
push a VK that is BAKED INTO the locking script (an exact-data push the spender cannot
change), so a spender cannot swap in their own VK + matching proof. Same for the
`covenant_id` / image-id public inputs.

### Known-good Groth16 test vector (from node source, `groth16/mod.rs::try_verify_stack`)

A real accepted stack (5 public inputs). All hex, 32-byte LE Fr inputs:

```
VK (compressed):
e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1933033e7fea1f40604eaacf699d4be9aacc577054a0db22d9129a1728ff85a01a1c3af829b62bf4914c0bcf2c81a4bd577190eff5f194ee9bac95faefd53cb0030600000000000000e43bdc655d0f9d730535554d9caa611ddd152c081a06a932a8e1d5dc259aac123f42a188f683d869873ccc4c119442e57b056e03e2fa92f2028c97bc20b9078747c30f85444697fdf436e348711c011115963f855197243e4b39e6cbe236ca8ba7f2042e11f9255afbb6c6e2c3accb88e401f2aac21c097c92b3fbdb99f98a9b0dcd6c075ada6ed0ddfece1d4a2d005f61a7d5df0b75c18a5b2374d64e495fab93d4c4b1200394d5253cce2f25a59b862ee8e4cd43686603faa09d5d0d3c1c8f

proof (compressed):
570253c0c483a1b16460118e63c155f3684e784ae7d97e8fc3f544128b37fe15075eab5ac31150c8a44253d8525971241bbd7227fcefbae2db4ae71675c56a2e0eb9235136b15ab72f16e707832f3d6ae5b0ba7cca53ae17cb52b3201919eb9d908c16297abd90aa7e00267bc21a9a78116e717d4d76edd44e21cca17e3d592d

n_inputs: 5  (i32)

input0: a54dc85ac99f851c92d7c96d7318af4100000000000000000000000000000000
input1: dbe7c0194edfcc37eb4d422a998c1f5600000000000000000000000000000000
input2: a95ac0b37bfedcd8136e6c1143086bf500000000000000000000000000000000
input3: d223ffcb21c6ffcb7c8f60392ca49dde00000000000000000000000000000000
input4: c07a65145c3cb48b6101962ea607a4dd93c753bb26975cb47feb00d3666e4404
```

Stack push order used in the passing test (bottom->top): input4, input3, input2,
input1, input0, n=5, proof, VK. (Tag 0x20 is pushed/popped by the opcode wrapper.)

---

## Tag `0x21` (R0Succinct) stack layout - for reference (Covex Stage 2+ uses 0x20)

`R0SuccinctPrecompile::verify_zk` pops (top -> bottom):

1. `hashfn` - 1 byte, HashFnId
2. `control_id` - digest (32 bytes)
3. `image_id` - digest (32 bytes)
4. `journal` - digest (32 bytes; this is the SHA256 journal HASH, not raw bytes)
5. `seal` - list of `u32` LE (risc0 STARK seal, BabyBear elems)
6. `control_digests` - concatenated digests (control inclusion proof path)
7. `control_index` - `u32` LE
8. `claim` - digest (32 bytes)

It then `rcpt.verify_integrity()` AND `compute_assert_claim(claim, image_id, journal)`
which reconstructs the canonical `ReceiptClaim { pre: image_id, post: pc=0/root=0,
exit_code: Halted(0), input: ZERO, output: { journal, assumptions: ZERO } }` and
asserts it digests to the receipt's claim. This is the field that BINDS image_id +
journal to the proof: a spender cannot change image_id or journal without breaking
the claim digest.

> Covex games go the STARK->Groth16 (snark-wrapped) route at tag `0x20`, NOT the raw
> succinct receipt at `0x21` - the Groth16 path is cheaper (140k vs 250k) and the
> journal binding lives in the Groth16 public inputs we choose (covenant_id,
> winner_pubkey, etc.). Tag 0x21 is documented here only for completeness.

---

## What this freezes for Stages 2-4

- Settlement script for a game pot (Groth16 / tag 0x20), winner branch:
  ```
  OP_IF
    <pinned VK (exact data push)>          # baked at lock
    <proof from witness>
    <n public inputs>
    <pub_input_0 .. >                       # incl. covenant_id, winner_pubkey, journal binding
    0x20
    OpZkPrecompile        ; -> pushes true, or aborts the tx
    OP_DROP               ; (or feed the true into the branch logic)
    <winner_pubkey from journal/pinned>
    OpCheckSig
  OP_ELSE
    <min_seq> OpCheckSequenceVerify <refund_pubkey> OpCheckSig
  OP_ENDIF
  ```
  The VK and any covenant-binding public inputs MUST be exact-data pushes in the
  LOCKING script so the spender cannot substitute a different VK/binding. The proof
  and the spender's chosen inputs come from the witness.
- Fr public inputs are 32-byte LITTLE-ENDIAN. The Covex prover/host must emit
  covenant_id and winner_pubkey reduced into BN254 Fr and serialized LE to match.
- The opcode pushes `true`; design the script to consume it (no implicit OP_VERIFY).

## Source pins (record for reproducibility)

- rusty-kaspa: branch `toccata`, HEAD `b97d1089993b6466148e412c8c0a96ce671f9758`
  (`/opt/htp/rusty-kaspa` on Hetzner).
- Files: `crypto/txscript/src/opcodes/mod.rs` (opcode 0xa6 @ line 889),
  `crypto/txscript/src/zk_precompiles/{mod.rs,tags.rs,groth16/mod.rs,risc0/mod.rs,fields/mod.rs,risc0/receipt_claim.rs}`,
  `consensus/core/src/config/params.rs` (TESTNET12_PARAMS @ line 669).
- Verifier crates: `ark-groth16 0.6.0`, `ark-bn254`, `risc0-zkp 3.0.3`, `risc0-binfmt 3.0.3`.
