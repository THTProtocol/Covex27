# Covex cold recovery (standalone, offline)

This folder contains a single self-contained HTML tool that lets a covenant winner (or a
refund-key holder) claim their funds with **no Covex frontend and no Covex backend** in
the loop. After the build step inlines the signing library, the tool runs from `file://`
on an offline machine. Your private key stays in the page, is never transmitted, and is
cleared from the input after signing.

This document is honest about what the chain actually enforces. Read the claimability
matrix before you trust any single sentence of marketing: some spend paths are fully
self-claimable offline, and some still need the Covex oracle's signature and are not.

## Files

- `covex-cold-recovery.template.html` - the editable template. Contains the verified
  pure-core satisfier logic inlined verbatim from
  `frontend/src/lib/redeemer/covenantRedeemer.js` (whose satisfier bytes are CI-proven
  byte-for-byte identical to the Rust `assemble_noncustodial_satisfier`), plus the full
  UI. It has two placeholders for the wasm injection and shows "not ready" until built.
- `build-cold-tool.mjs` - the build script. Reads `@onekeyfe/kaspa-wasm`'s wasm binary +
  ESM glue from `node_modules`, base64-inlines both into the template, writes the final
  `covex-cold-recovery.html`, and prints its SHA-256.
- `covex-cold-recovery.html` - the BUILT artifact (produced by the build script). This is
  the file you save and run offline. Not committed pre-built; build it yourself and verify
  the hash.

## Building the tool

This worktree intentionally has no `node_modules`, so the build runs where the frontend's
dependencies are installed:

```sh
cd frontend
npm install                                  # if not already installed
node tools/cold-recovery/build-cold-tool.mjs
```

It prints something like:

```
Cold-recovery tool built.
  output: .../covex-cold-recovery.html (NNNN KB)
  SHA-256: <hex>
```

### How the wasm is inlined (so the artifact needs no sibling .wasm fetch)

`@onekeyfe/kaspa-wasm` is wasm-bindgen `--target web` output: an ESM glue (`kaspa.js`) and
a binary (`kaspa_bg.wasm.bin`). Under `file://` the glue's default initializer cannot fetch
its sibling `.wasm` (browsers block module/network fetches from `file://`). The build does
two substitutions:

1. The wasm **bytes** are base64-encoded into a `<script type="text/plain">`. At runtime
   the page decodes them and calls `WebAssembly.compile()` locally, then
   `initSync(compiledModule)` - the exact pattern the app's `WalletContext` already proves
   works for this package. The glue's network-fetching default init is never invoked.
2. The **glue** is base64-encoded and imported from a `blob:` module URL inside an inline
   `<script type="module">`. A `blob:` ESM import runs the glue unmodified (its
   `export`s and `import.meta.url` stay valid) and works under `file://` because it is a
   same-page object URL, not a network fetch. The resulting export namespace is assigned
   to `window.__KASPA_WASM__`.

The result is one HTML file with zero external dependencies: no Covex, no CDN, no sibling
`.wasm`.

## Verify the tool before trusting it

A cold-recovery tool that signs with your private key must be verified, not trusted on
faith. After building (or after receiving a built copy), compute its SHA-256 and compare
it against the value the build script printed (and the value published wherever you got
it):

- Linux / macOS: `sha256sum covex-cold-recovery.html` or `shasum -a 256 covex-cold-recovery.html`
- Windows: `certutil -hashfile covex-cold-recovery.html SHA256`

If the hash does not match, do not use the file. Rebuild it yourself from this template and
a known-good `@onekeyfe/kaspa-wasm`. The pure-core satisfier logic in the template can also
be diffed against `frontend/src/lib/redeemer/covenantRedeemer.js` - it is copied verbatim,
and that source is CI-gated to byte-match the Rust.

## What to save as your recovery kit

When a covenant is created and funded, save a small JSON "recovery kit" so you can claim
later even if Covex is gone. The tool accepts this shape (snake_case; a few aliases are
also accepted):

```json
{
  "kind": "binary_oracle_select",
  "network": "mainnet",
  "redeem_script_hex": "....",
  "p2sh_address": "kaspa:....",
  "funding": { "transactionId": "....", "index": 0, "amount": "100000000" },
  "branch": "revealA",
  "preimage_hex": "....",
  "lock_daa": null,
  "total": null
}
```

Field by field:

- `kind` - the covenant base kind (see the matrix below).
- `network` - `mainnet`, `testnet-10`, or `testnet-12`. The destination address prefix is
  validated against this.
- `redeem_script_hex` - the full redeem script. This is the source of truth the chain
  enforces; the P2SH address is derived from it.
- `p2sh_address` - the covenant address (for your own cross-check; the tool re-derives the
  P2SH from the redeem script).
- `funding` - the covenant UTXO you are spending: `transactionId`, `index`, and `amount`
  in sompi. Find it on any block explorer for the P2SH address if you did not save it.
- `branch` - which spend path you intend (see per-kind instructions). You can override it
  in the UI.
- `preimage_hex` - the revealed secret, for `hashlock`, `htlc` claim, and
  `binary_oracle_select` reveal. For `binary_oracle_select` this is the PUBLIC winning
  preimage (it becomes public when the outcome is settled); it is a hashlock secret, not
  an oracle signature.
- `lock_daa` - the lockTime (CLTV) or DAA threshold for timelock and refund branches, if
  the path needs one. Leave null otherwise.
- `total` - the N in an m-of-N `multisig` (or the oracle 2-of-2 total), used to commit the
  correct sig-op count.

You also need, separately and securely, your **private key** for the relevant role
(winner key, branch A/B key, or refund key). Never store the private key in the kit.

## Per-kind self-claimability matrix (honest)

"Offline-claimable" means the Kaspa chain (or a revealed public secret plus the named
key's `OpCheckSig`) enforces the spend end to end, so you alone can satisfy it with no
Covex oracle. Where a path needs the Covex oracle's signature, it is **not** offline-
claimable here, and this tool will say so rather than pretend otherwise.

| kind | offline-claimable? | how |
| --- | --- | --- |
| `singlesig` | yes | named key signs; chain verifies |
| `timelock` | yes | named key signs after `lockTime` (set CLTV) |
| `rcsv` | yes | named key signs after relative lock (set `sequence`) |
| `hashlock` | yes | reveal preimage + sign |
| `htlc` | yes | claim = receiver sig + preimage; refund = sender sig after `lockTime` |
| `multisig` | yes | gather the required m signatures (set `total` = N) |
| `channel` | yes | cooperative close needs both party sigs; refund = funder sig after `lockTime` |
| `deadman` | yes | owner (IF) any time, or heir (ELSE) after CLTV |
| `binary_oracle_select` | yes | winner reveals the PUBLIC winning preimage + branch-key sig; refund = refund key after lock. The reveal is a hashlock, not an oracle signature. |
| `oracle` | no | win path is a 2-of-2 with the Covex oracle key; needs the oracle half-signature. No chain-enforced refund branch. |
| `oracle_enforced` | no | same as `oracle`: needs the oracle half-signature. No chain-enforced refund branch. |
| `oracle_escrow` | no | payout needs the Covex oracle signature. No chain-enforced refund branch. |
| `oracle_enforced_refundable` | refund branch only | WIN path needs the Covex oracle signature (not offline). REFUND branch (refund key, after `lock_daa`) is offline-claimable. |
| `oracle_escrow_refundable` | refund branch only | WIN path needs the Covex oracle signature (not offline). REFUND branch (refund key, after `lock_daa`) is offline-claimable. |

Plainly stated: the `oracle_*` win paths depend on Covex oracle **liveness**. If Covex is
down, those winners cannot claim with this tool until the oracle signs, or - for the
`*_refundable` kinds - until the refund timelock elapses and the refund key reclaims the
funds. That is a liveness dependency, not a trustless guarantee, and this tool does not
describe it as trustless.

## Step-by-step claim

1. Build the tool (above) and verify its SHA-256.
2. Move `covex-cold-recovery.html` to the machine where you will claim. It can be fully
   offline for the Build and Sign steps. Open it in a browser (`file://`).
3. Wait for the banner to read "Ready and offline."
4. Paste your recovery kit JSON (or Load from file) and click Parse kit. The Claimability
   panel tells you whether your kit's path is offline-claimable.
5. Enter the destination address (where the funds go), the fee in sompi, and select the
   branch/outcome if the kit did not specify one.
6. For paths that need extra material, open Advanced and fill in: the preimage (hashlock /
   htlc / `binary_oracle_select` reveal), `lockTime`/`sequence` for timelock/refund paths,
   or - only if you legitimately have it - the oracle signature for an `oracle_*` win path.
7. Paste your private key and click **Build and sign (local)**. Signing happens entirely
   in the page; the key field is cleared immediately after.
8. Broadcast, either way:
   - **Direct wRPC**: click Broadcast over wRPC. The tool tries hardcoded public Kaspa
     nodes and the kaspa-wasm public resolver.
   - **Export signed-tx JSON**: click Export (or Copy) and submit the JSON from any node
     CLI or block explorer's submit-transaction endpoint. This path always works because
     the signed transaction is already complete; broadcasting is just relaying public
     bytes.

### Per-kind notes

- `singlesig` / `timelock` / `rcsv`: choose `claim`. For `timelock` set `lockTime`; for
  `rcsv` set `sequence` to the relative-locktime operand.
- `hashlock`: choose `claim`, provide `preimage_hex`.
- `htlc`: claim = `claim` branch + preimage (receiver key). Refund = `refund` branch +
  `lockTime` (sender key).
- `multisig`: this single-key tool signs your share; for m > 1 you assemble the other
  signatures into the satisfier (or use a co-signing flow). Set `total` = N.
- `channel`: cooperative `close` needs both party signatures; `refund` is the funder key
  after `lockTime`.
- `deadman`: owner uses the IF branch (`claim`); heir uses the ELSE branch (`refund`)
  after the CLTV.
- `binary_oracle_select`: winner uses `revealA` (A key) or `revealB` (B key) plus the
  public winning preimage. Refund uses `refund` (refund key) after the lock; set
  `sequence`/`lockTime` per the kit. This is the parimutuel-bundle leg and is fully
  offline-claimable once the winning preimage is public.
- `oracle_enforced_refundable` / `oracle_escrow_refundable`: if you have the oracle
  signature, paste it in Advanced and use the win branch. Otherwise use `refund` after
  `lock_daa` with the refund key - that branch is chain-enforced and offline-claimable.
- `oracle` / `oracle_enforced` / `oracle_escrow`: the win path needs the Covex oracle
  signature. Without it, these are not claimable by this tool, and they have no chain-
  enforced refund branch. Plan for this when choosing a kind for funds you must be able to
  recover unilaterally.

## The two broadcast modes, and the file:// limitation

Signing is always local and offline. Broadcasting is the only step that touches the
network, and you have two independent options:

1. **Direct wRPC `submitTransaction`** to a public node. Convenient, but a browser opening
   a WebSocket from a `file://` page to an external `wss://` node may be blocked by the
   browser (opaque-origin / mixed-content policies vary by browser and version). If it
   fails, the tool tells you to use option 2 - the signed transaction is still valid.
2. **Export the signed-tx JSON** and submit it from anywhere: a `kaspad` / wallet CLI, or
   a block explorer's submit-transaction form. This always works because you are only
   relaying already-public, already-signed bytes; no key is involved. Use this whenever
   wRPC from `file://` does not connect, or when you want to keep the signing machine
   fully offline and broadcast from a separate networked machine.

## Honesty notes

- Non-custodial: the private key never leaves the page and is not transmitted anywhere.
- The satisfier bytes this tool produces are byte-for-byte the same the Kaspa node already
  validated for these covenants (the pure core is copied verbatim from the CI-gated
  source).
- "Trustless / fully offline" is claimed only for the kinds the chain or a revealed public
  secret enforces end to end. The `oracle_*` win paths are oracle-liveness-dependent, not
  trustless, and are labeled as such here and in the tool.
