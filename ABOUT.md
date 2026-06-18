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

Kaspa is becoming programmable. The **Crescendo** hard fork (mainnet, May 2025) brought 10 blocks per second and the first transaction-introspection opcodes (KIP-10). The **Toccata** hard fork, scheduled for **30 June 2026**, completes the picture: native, stateful, multi-transaction programs over UTXOs, otherwise known as covenants.

A covenant is a spend condition attached to a coin: an escrow that refunds the buyer if a seller never delivers, a vault that unlocks on a date, a multisig that needs two of three keys, a game pot that pays the proven winner. The technology is powerful, but the moment it reaches mainnet, three gaps open at once:

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
- **Only real on-chain data.** Nothing on Covex is seeded, simulated, or projected. Before Toccata activates, the mainnet explorer is honestly empty. A zero is the correct reading until the first real covenant lands.

## What is real today, stated honestly

Covex refuses to dress an aspiration up as a guarantee. Here is the honest split.

**Trustless today (the chain enforces it, your wallet redeems it, no Covex key in the path).** A set of script-enforced covenant primitives, each engine-tested against the real Kaspa script interpreter and then proven on-chain on Testnet-12: single-signature, hashlock, absolute timelock (CLTV), relative timelock (CSV / BIP68), N-of-M multisig, HTLC (claim or timeout refund), two-party state channel (cooperative close or timeout refund), and deadman (owner, or heir after a delay). These pass the acid test.

**Oracle-attested, disclosed not hidden.** Outcomes that cannot be enforced by script alone (the result of a game, a real-world fact for a market) are attested by a named oracle whose Schnorr co-signature is the only thing the chain checks at unlock. For deterministic games the result is computed server-authoritatively by replaying the public move log, not asserted by a client. The non-custodial oracle co-signing path, where the server contributes only the oracle signature after verifying the outcome and the winner signs their own half in the browser, is built and in final on-chain testing before it carries value.

**Zero-knowledge, verified off-chain.** Kaspa has no on-chain pairing verifier, so Covex never claims on-chain or trustless ZK. Real Groth16 circuits generate a proof in your browser (the secret witness never leaves the device), and the disclosed oracle verifies that proof off-chain, fail-closed, before it co-signs. The trusted setup today is a single-contributor development ceremony, not a production multi-party MPC, and the interface says so. Circuits without a shipped proving key stay labeled oracle-attested rather than claiming a proof that does not exist.

Every covenant page carries a trust badge that states which of these applies. The badge is the product.

## The mainnet launch

Covex launches on Kaspa mainnet at the **Toccata** activation on **30 June 2026**, with real funds. At launch the testnet environments retire and mainnet is the live network. The covenant indexer is already armed behind an honesty gate, so the first real covenant appears the moment it lands, and the explorer shows a true zero until then. Every primitive and circuit above is already exercised end-to-end on the Toccata testnets, so the mainnet indexer is correct and complete on day one rather than a work in progress.

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
