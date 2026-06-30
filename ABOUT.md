<div align="center">

  <img src="docs/assets/covex-logo-full.png" alt="Covex" width="200">

  <h2>About Covex</h2>

  <p><strong>The covenant layer for Kaspa: see every covenant, act on any of them safely, and build new ones without writing raw script.</strong></p>

  <p>
    <a href="https://hightable.pro"><b>hightable.pro</b></a> ·
    <a href="README.md">Technical README</a> ·
    <a href="https://hightable.pro/whitepaper">Whitepaper</a> ·
    <a href="MAINNET.md">Mainnet plan</a>
  </p>

</div>

---

## In one sentence

Covex is a non-custodial explorer and studio for Kaspa covenants: it indexes every covenant on the chain, gives each one a wallet-bound page you can act on, and lets anyone design and deploy a new covenant, all without Covex ever holding a key or moving your funds.

## Why Covex exists

Kaspa is programmable. The **Crescendo** hard fork (May 2025) brought 10 blocks per second and the first transaction-introspection opcodes (KIP-10). The **Toccata** hard fork completed the picture: native, stateful, multi-transaction programs over UTXOs, otherwise known as covenants, are now live on Kaspa.

A covenant is a spend condition attached to a coin: an escrow that refunds the buyer if a seller never delivers, a vault that unlocks on a date, a multisig that needs two of three keys, a conditional payment that releases to the party a published result names. The technology is powerful, and now that it is live on Kaspa, three gaps open at once:

1. **Discovery.** Covenants are not accounts you can list. They are conditions on outputs. Finding them means walking the BlockDAG and recognizing script envelopes.
2. **Interaction.** A covenant is only useful if a counterparty can act on it: fund it, join it, prove an outcome, claim a payout. That needs a UI bound to a wallet and to the covenant's real on-chain parameters.
3. **Authorship.** Writing correct script is unforgiving. One mistake locks funds forever. Most people who want a covenant should never touch raw opcodes.

Covex is the human layer that closes all three.

## What you can do

| Pillar | What it means |
|--------|---------------|
| **Explore** | Every covenant on the chain, discovered on-chain by independent indexers. Search, 17 categories, a live activity feed, per-covenant lifecycle and action history, and address portfolios. Free forever. |
| **Interact** | Connect a Kaspa wallet and act on any covenant directly: stake, join, claim, resolve. Any on-chain P2SH covenant can be redeemed by supplying its redeem script, even one that was never created on Covex. |
| **Create** | A free covenant creator, a SilverScript terminal that compiles to Kaspa script, real circuit selection, and a drag-and-drop page studio so a covenant can ship with its own interactive site. |

## The principle: trustless by removal

Covex is built around one acid test:

> If hightable.pro vanished tomorrow, could every user still recover or settle their funds using only their own wallet and the published script?

Wherever the answer is yes, the feature is simultaneously safe (there is nothing to steal), honest (no hidden trusted party), and defensible (a tool, not an operator). The roadmap is a campaign to make that answer "yes" for more covenant types over time, by **removing Covex from the money path**, not by adding more cryptography on top of it.

Two rules follow from this, and they are absolute:

- **Non-custodial, end to end.** Your private key never leaves your wallet (or your browser, for an in-app generated wallet). Covex reads UTXOs and verifies payments on-chain. It cannot move your funds.
- **Only real on-chain data.** Nothing on Covex is seeded, simulated, or projected. The explorer shows only real covenants on the chain. A zero before the first real covenant lands is the correct reading.

## What is real today, stated honestly

Covex refuses to dress an aspiration up as a guarantee. Here is the honest split.

**Trustless today (the chain enforces it, your wallet redeems it, no Covex key in the path).** A set of script-enforced covenant primitives, each engine-tested against the real Kaspa script interpreter and proven on-chain: single-signature, hashlock, absolute timelock (CLTV), relative timelock (CSV / BIP68), N-of-M multisig, HTLC (claim or timeout refund), two-party state channel (cooperative close or timeout refund), and deadman (owner, or heir after a delay). These pass the acid test.

**Oracle-attested, disclosed not hidden.** Outcomes that cannot be enforced by script alone are attested off-chain by a named resolver whose Schnorr co-signature (or revealed hashlock secret) is the only thing the chain checks at unlock. Covex never attests a real-world fact: for a conditional-outcome covenant you connect or create an external resolver, and the real-value covenant binds to that resolver's published hashlock, which the chain enforces (blake2b of the revealed secret) plus a timelock refund. For two-party covenants on the legacy settlement path, settlement happens when Covex re-derives the result from the publicly-replayable signed log and co-signs the payout (`oracle_escrow`); Covex does not decide the result, it recomputes one anyone can recompute, and the chain still requires the winning party's own signature. The chain-enforced, no-Covex-key path (the same external-resolver hashlock the conditional covenants use) is rolling out.

**Zero-knowledge, verified off-chain for the circom suite.** For the circom circuits Covex never claims on-chain or trustless ZK. Real Groth16 circuits generate a proof in your browser (the secret witness never leaves the device), and the external resolver verifies that proof off-chain, fail-closed, before it co-signs. Kaspa's KIP-16 OpZkPrecompile (opcode 0xa6) adds a separate path that verifies a RISC0-Groth16 proof in consensus; the settlement covenant targets it, and Covex keeps it gated until proven live on its own infrastructure. The trusted setup today is a single-contributor development ceremony, not a production multi-party MPC, and the interface says so. Circuits without a shipped proving key stay labeled oracle-attested rather than claiming a proof that does not exist.

Every covenant page carries a trust badge that states which of these applies. The badge is the product.

## Live on Kaspa

Covex runs on Kaspa with real funds. Covenants are live, and the covenant indexer runs behind an honesty gate, so the first real covenant appears the moment it lands and the explorer shows a true zero until then. Every primitive and circuit above is exercised end-to-end, so the indexer is correct and complete rather than a work in progress.

## Who it is for

- **Covenant users** who want to see, fund, join, and settle covenants from a wallet, without trusting an operator.
- **Builders** who want to author a covenant in SilverScript, attach real verification logic, and ship it with an interactive page, without standing up infrastructure.
- **Integrators** who want a clean public API over every covenant on the chain, with no key required for reads.

## What we hold ourselves to

- Custody is never ours. Keys stay with the user.
- We show only what is real on-chain. No placeholders, ever.
- We name our trusted components instead of hiding them, and we shrink them over time.
- We do not call something trustless, on-chain, or ZK-verified unless it is.
- The ranking formula and treasury are public; paid placement is labeled, never disguised as organic.

## Learn more

- **[README.md](README.md)** for the architecture, public API, tiers, and the full whitepaper.
- **[MAINNET.md](MAINNET.md)** for the mainnet readiness plan.
- **[docs/BUILDING_ON_COVEX.md](docs/BUILDING_ON_COVEX.md)** to integrate the API.
- **[hightable.pro/whitepaper](https://hightable.pro/whitepaper)** for the live whitepaper, and **[hightable.pro/readme](https://hightable.pro/readme)** for the how-it-works blueprint.

---

<div align="center">
Built on <a href="https://kaspa.org">Kaspa</a> · <a href="https://github.com/kaspanet/rusty-kaspa">rusty-kaspa</a> · <a href="https://github.com/kaspanet/silverscript">SilverScript</a>
</div>
