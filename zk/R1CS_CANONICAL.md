# R1CS canonical status (ZK-4)

Short version: the served proving key, verification key, and wasm under
`frontend/public/zk/<id>/` are the canonical, live ZK artifacts. The committed
root `.r1cs` files are NOT canonical and were never read by the honesty gate.

## Why the stale root .r1cs were removed

The committed root `zk/*.r1cs` (and the matching `zk/build_*/<id>.r1cs`
workspaces) were compiled from an OLDER version of the circom sources, before
the `covenantId` cross-covenant replay binding was added as a public input.
They therefore declare fewer public signals than the keys we actually serve and
verify against.

Measured divergence (r1cs header `nPubOut + nPubIn` vs the served
`frontend/public/zk/<id>/<id>_vkey.json` `nPublic`), sampled:

| circuit            | stale r1cs nPublic | served vkey nPublic |
| ------------------ | ------------------ | ------------------- |
| pot_split_math     | 5                  | 6                   |
| merkle_membership  | 2                  | 3                   |
| age_verification   | 4                  | 5                   |
| escrow_2party      | 5                  | 6                   |
| relative_timelock  | 3                  | 5                   |

Every removed file was strictly `r1cs.nPublic < served_vkey.nPublic`. A stale
r1cs cannot produce a witness or proof that verifies against the served vkey, so
keeping it would falsely imply the committed tree reproduces the live keys. The
current `.circom` sources ARE up to date (e.g. `pot_split_math.circom` declares
`public [total_pot, fee_bps, pot_return_bps, winner_share, covenantId]`), so the
r1cs can be regenerated on demand.

The served `.zkey`, `.wasm`, and `_vkey.json` artifacts were NOT touched. They
are live and correct; deleting the stale r1cs does not affect any prover,
verifier, or the registry.

r1cs files that already MATCHED their served vkey `nPublic` were left in place
(they are consistent with the live keys), as were the helper/test r1cs that have
no served vkey to diverge from (`hash_helper`, `mimc_test`, `test`).

## Canonicals

For any served circuit `<id>`:

- Canonical proving key: `frontend/public/zk/<id>/<id>_final.zkey`
- Canonical verification key: `frontend/public/zk/<id>/<id>_vkey.json`
- Canonical witness generator: `frontend/public/zk/<id>/<id>.wasm`

The honesty gate `scripts/check-zk-registry.sh` reads these served vkeys and the
generated `zk/circuit_registry.json`. It does NOT read any `.r1cs`. This doc
change and the r1cs removal leave the gate at exit 0.

## How to regenerate an r1cs from the current source

r1cs is a build intermediate, not a shipped artifact. To reproduce it from the
current `.circom` you need `circom` (aka `circom2`, circom 2.x; the sources
pin `pragma circom 2.0.0`) and the `circomlib` dependency already in
`zk/package.json`. From the `zk/` directory:

```sh
# single circuit (writes <id>.r1cs and <id>.wasm into the current dir)
circom2 <id>.circom --r1cs --wasm -o .

# example
circom2 pot_split_math.circom --r1cs --wasm -o .
```

The repo already wires the per-circuit compiles as npm scripts
(`zk/package.json`), e.g. `npm run compile:pot-split`, and `npm run compile:all`
for the phase-1..3 set.

To then rebuild the dev proving/verification keys from a freshly compiled r1cs,
use the disclosed single-contributor dev ceremony harness
(`zk/ceremonies_harness.sh`, which uses `pot10_final.ptau`). This is a developer
ceremony, NOT a production multi-party MPC; production trust-minimization still
requires a real phase-2 ceremony (see `docs/RANGE_PROOF_CEREMONY.md`).

To confirm a regenerated r1cs matches the live keys, compare its header public
count to the served vkey `nPublic` for the same `<id>` before repointing
anything; they must be equal.

## Follow-up (not done here)

Add a CI compile step that regenerates each served circuit's r1cs from its
`.circom` and asserts the r1cs public count equals the served vkey `nPublic`.
That closes the drift permanently (tracked as the second half of gap ZK-4) but
requires circom in CI, which is not available in this working environment.
