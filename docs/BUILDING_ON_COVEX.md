# Building on Covex

This guide is for builders who want to ship real covenants and the beautiful interactive websites people use to act on them, on Kaspa mainnet, through Covex.

Covex is the covenant explorer and studio for the Toccata mainnet era. A covenant is a script program embedded in a Kaspa UTXO that constrains how that UTXO may be spent. On Covex, a covenant is not a raw row in an explorer: its creator designs a full interactive website that renders on the covenant page, and other users interact with that website with their own wallets. This guide covers both halves: building the covenant, and building its website.

---

## 1. The honesty contract (read this first)

Everything you build is labeled by **who actually enforces the outcome**. This vocabulary is exact and you must use it truthfully. Overclaiming is the one unforgivable error on a financial platform.

| Label | Meaning | What you may NOT say |
|-------|---------|----------------------|
| **on-chain** | The Kaspa script enforces the spend. The user's own wallet redeems. No Covex key is in the payout path. | Nothing to avoid: this is genuinely trustless for custody and enforcement. |
| **oracle-attested** | The an external resolver's Schnorr co-signature is consensus-required alongside the user's. The oracle co-signs only a server-verified result. | Never "on-chain", "trustless", "guaranteed", or "verified on-chain". |
| **full-zk** | A real Groth16 proof is generated (client-side where supported) and verified fail-closed by the oracle **off-chain**, then the oracle co-signs the 2-of-2 the chain requires. | Never "on-chain ZK" or "the chain verified the proof". Kaspa has no pairing verifier. |
| **metadata** | Discovery and display only. A real on-chain object, described, not enforced by Covex. | Never imply Covex enforces anything. |

**The acid test for trustlessness:** if hightable.pro vanished tomorrow, could every user still recover or settle their funds using only their own wallet and the published script? Where the answer is yes, the covenant is on-chain. Where the answer is not yet, it is oracle-attested, and the path forward is to remove Covex from the money path, not to add more cryptography.

**Which types are genuinely on-chain today:** single-sig, hashlock, absolute timelock (CLTV), relative timelock (CSV), N-of-M multisig, and HTLC. Each is engine-tested against the real `kaspa-txscript` interpreter before any value is locked. Four ZK circuits (`merkle_membership`, `escrow_2party`, `age_verification`, `range_proof`) verify a real Groth16 proof and fail closed, but off-chain, so their on-chain enforcement is still the oracle co-signature and they are labeled accordingly.

**Which types are oracle-attested:** two-party oracle escrow, prediction markets (the real-world fact must be attested), and on-chain game arenas (the result is computed server-authoritatively and the oracle co-signs it).

---

## 2. The build flow at a glance

1. **Create** the covenant (type, parameters, fee and payout, circuit).
2. **Design** its website from a template, with blocks and live data bindings.
3. **Preview** in dark, light, and mobile (375px).
4. **Deploy** the website (creator-signed save).
5. **Others interact** with their own wallets on the covenant page.

The rest of this guide expands each step, then walks seven worked examples end to end.

---

## 3. Step by step: the best covenants and the best covenant websites

### Step 1: Create the covenant

Open the creator at `/deploy/enforced` (or the Sandbox at `/sandbox` to experiment first). Pick a type and set its parameters:

- **On-chain primitives** (single-sig, hashlock, CLTV, CSV, multisig, HTLC) deploy non-custodially: your own wallet signs, the chain enforces the result. These are the default and the recommended starting point because they pass the acid test.
- **Oracle and multi-party kinds** (oracle escrow, prediction market, games) involve an external resolver in the payout path. Use them when the outcome genuinely depends on something off-chain (a real-world fact, a game result), and label them oracle-attested.

Set fee and payout economics where the type supports it (for example a market's house fee and loser rebate). Pick a circuit only if your covenant actually proves something; otherwise leave it off rather than labeling a covenant full-zk on the strength of a key that does not exist.

When you deploy, the indexer recognizes the covenant envelope on-chain, classifies it, and the covenant page becomes reachable at `/covenant/<id>`.

### Step 2: Design its website

Open Covenant Studio for that covenant. Do not start from a blank canvas: pick one of the **7 starter templates** (Prediction Market, Chess Arena and Games, Escrow, Vesting, Fundraiser, Tournament, Generic). The picker defaults to the template matching your covenant type.

Compose the page from platform-authored blocks. The catalog includes:

- **Hero and layout:** HeroImage (full-bleed background image with gradient overlay and a working CTA), CTABanner, StatBanner, SectionBackground, Footer.
- **Content:** RichText (the only HTML surface, run through a strict allowlist sanitizer), Tabs, Accordion, Testimonials, Timeline, Marquee, AnimatedCounter, Carousel, ImageGallery, LogoStrip, SocialLinks, Video (strict YouTube and Vimeo allowlist, rendered in a cross-origin sandboxed iframe; you never supply a raw src).
- **Covenant (live):** OddsBar (parimutuel split and payout multiplier), PoolMeter (value against a target), StatRow, FeatureGrid, PricingTier, OddsHighlightCard, and the honesty **EnforcementBadge** (reflects the server-derived enforcement reality as a static label).

**Bind live on-chain data with tokens.** Any text field resolves `{{tokens}}` at render time: `{{name}}`, `{{status}}`, `{{network}}`, `{{amount_kaspa}}`, `{{total_locked}}`, `{{tx_count}}`, `{{fee_pct}}`, `{{rebate_pct}}`, `{{pool_yes}}`, `{{pool_no}}`, `{{odds_yes}}`, `{{odds_no}}`, `{{creator}}`, and more. The Studio shows a live token cheat-sheet.

**Add action buttons.** A StakeCTA posts a typed intent (`interact`, `bet`, `spend`) with an outcome and a suggested amount. The destination address and script hash are **always derived server-side from the indexed covenant record, never from the button payload.** This is the fund-safety guardrail: a creator cannot redirect another user's funds, and it must never be weakened.

**Brand the page.** Set a page logo, accent color, font, and a background preset (pure CSS gradients, no bundled or copyright images). Use only your own https or data image URLs for hero and gallery images; with none set, the hero falls back to the branded gradient rather than seeding stock or random images.

### Step 3: Preview in dark, light, and mobile

Use the Studio device-preview toggle and theme picker. Every block has light-mode parity (a `.light` override for each themed surface). Build for a 375px mobile target with zero horizontal overflow: prefer `grid-cols-N` (which fits its container) over fixed widths. Check both themes and both viewports before you publish.

### Step 4: Deploy the website

Saving requires a server-issued single-use nonce signature from the covenant creator. For an indexed covenant the signer must equal the creator. The page serializes to validated JSON and renders to all visitors through an allow-listed component set. No creator-authored HTML or JavaScript ever reaches a visitor's DOM, which removes the phishing and XSS surface that plagues open page builders on financial sites. Custom CSS is sanitized and scoped, so it can never escape the page.

### Step 5: Others interact

Anyone who opens the covenant page sees the full, interactive website and acts on it with their own wallet (KasWare, Kastle, Kasperia, OKX, and more): bet, join, deposit, contribute, claim, resolve. Funds move on-chain. The EnforcementBadge tells them exactly who enforces the outcome.

### Quality bar

A best-in-class covenant website: leads with a full-bleed hero, uses real live data tokens (not hard-coded numbers), carries an honest EnforcementBadge, looks correct in dark and light at 375px and on desktop, uses only the creator's own relevant images, and routes every action through the server-derived destination. Aim for that bar.

---

## 4. Worked examples

Each example covers what it does, how to build the covenant, how to build its interactive website, and its honest enforcement reality.

### 4.1 Chess and games arena

**What it does.** Two players stake KAS into a covenant and play a real game (chess and others) in a premium client. Moves are persisted and synced live over WebSockets. The result is computed by the server, not asserted by a client: deterministic games settle by replaying the public move log, and quitting or letting the clock run out is a server-timed loss. The winner's unlock spends the pot on-chain.

**Build the covenant.** Pick a game covenant type, set the stake amount, and deploy. The pot locks into the covenant; the platform never custodies the stake.

**Build the website.** Start from the Chess Arena and Games template. Use a HeroImage for the arena identity, a StatRow bound to `{{amount_kaspa}}` for the pot, an EnforcementBadge, and the arena client itself (rendered on the covenant page for game covenants). Add a Timeline or Accordion for the rules and a Footer with SocialLinks.

**Enforcement reality: oracle-attested.** The result is computed server-authoritatively, and the oracle co-signs only that verified result, so the oracle co-signature is in the payout path. The trustless rebuild for deterministic two-player games is a 2-of-2 state channel between the two players (no Covex key), with the cooperative close spending the pot to the winner and abandonment resolved by publishing the last co-signed state plus a CLTV timeout default. Until then: oracle-attested, never on-chain.

### 4.2 Prediction market

**What it does.** A binary market on a real-world question ("Will outcome A happen?"). Users back an outcome; the funds sit in on-chain binary-select bundles; when the question resolves, the winning side is paid. Economics are configurable (for example a house fee and a loser rebate).

**Build the covenant.** Pick the market type in the builder, set the question, the two outcomes, the house fee percent, and the loser rebate percent (fee plus rebate must be under 100). Creating it inserts a market anchor covenant and lands you on `/covenant/<market_id>`.

**Build the website.** Start from the Prediction Market template. Use OddsHighlightCard or OddsBar bound to `{{odds_yes}}` and `{{odds_no}}`, a PoolMeter or StatRow bound to `{{pool_yes}}`, `{{pool_no}}`, and `{{total_locked}}`, and StakeCTA buttons with `action: bet` and the outcome set. Add a RichText block describing the resolution source and an EnforcementBadge.

**Enforcement reality: oracle-attested.** The funds are genuinely on-chain, but a real-world fact must be attested off-chain, so resolution is oracle-attested. The honest target is k-of-n independent oracle signers with an on-chain multisig release. A prediction market cannot be made fully trustless, because something off-chain must report the fact. Label resolution oracle-attested and never imply the chain verified the real-world outcome.

### 4.3 Escrow

**What it does.** Funds are held until a release condition is met: a preimage is revealed (hashlock), a hashed timelock expires or completes (HTLC), or a quorum signs (multisig). Used for atomic swaps, conditional payments, and marketplace holds.

**Build the covenant.** Pick hashlock, HTLC, or multisig. For hashlock, supply the hash; the spender reveals the preimage. For HTLC, set the hash and the timeout. For multisig, set N of M signers. Deploy non-custodially.

**Build the website.** Start from the Escrow template. Use a clear StatRow for the locked amount, an Accordion explaining the release condition, a StakeCTA with `action: spend` for the release, and an EnforcementBadge.

**Enforcement reality: on-chain.** Hashlock, HTLC, and multisig escrows are enforced by the chain and redeemed by the user's own wallet, with no Covex key in the path. They pass the acid test. The exception is the **two-party oracle escrow** variant, whose redeem script requires the external resolver co-signature; that one is oracle-attested until the state-channel rebuild lands. Choose the on-chain variants when you can.

### 4.4 Vesting

**What it does.** Funds unlock on a schedule: at or after an absolute block height (CLTV), or a number of blocks after confirmation (CSV). Used for team allocations, cliffs, and time-released grants.

**Build the covenant.** Pick absolute timelock and set the lock height (tip plus your blocks), or relative timelock and set the relative age. Deploy non-custodially.

**Build the website.** Start from the Vesting template. Use an AnimatedCounter or Timeline for the schedule, a StatRow for the locked amount and the unlock height, a countdown in RichText, a StakeCTA with `action: spend` for the claim (which only succeeds once the chain allows it), and an EnforcementBadge.

**Enforcement reality: on-chain.** CLTV and CSV are enforced directly by Kaspa consensus. No Covex key. Genuinely trustless. Relative locktime is verified end-to-end against the live BIP68 enforcement.

### 4.5 Fundraiser

**What it does.** A pooled covenant with a target and a deadline. Contributors deposit toward the goal; the design shows live progress against the target.

**Build the covenant.** Pick a pooled or community-pool type, set the target and (optionally) a deadline via timelock, and deploy. The destination for contributions is the covenant's own on-chain address.

**Build the website.** Start from the Fundraiser template. The centerpiece is a PoolMeter bound to `{{total_locked}}` against your target, with a StakeCTA `action: spend` to contribute. Add a HeroImage with your own relevant picture, a FeatureGrid explaining what the funds do, Testimonials, and an EnforcementBadge.

**Enforcement reality: on-chain for custody.** Contributions land in the on-chain covenant and the destination is derived from the indexed record, never the button, so contributors cannot be redirected. If the release of pooled funds requires a condition the chain cannot check on its own, label that release honestly (on-chain if a timelock or multisig gates it, oracle-attested if an off-chain attestation does).

### 4.6 Tournament

**What it does.** A staged competition: an entry pool, a bracket of matches (often game arenas), and a prize distribution to the winners.

**Build the covenant.** Compose it from the game covenant primitives for each match plus a prize-pool covenant. Each match settles as in the games arena example; the prize pool releases to the winners.

**Build the website.** Start from the Tournament template. Use a Timeline for the bracket and schedule, OddsHighlightCard or StatRow for the prize pool, Carousel or ImageGallery for the competitors, a StakeCTA `action: bet` to enter, and an EnforcementBadge.

**Enforcement reality: oracle-attested.** Because the underlying matches are game arenas whose results are computed server-authoritatively and co-signed by the oracle, the tournament's prize distribution is oracle-attested. Be explicit that the oracle co-signs the verified results; do not imply the chain decided the winners.

### 4.7 Generic covenant (including covenants not built on Covex)

**What it does.** Any on-chain covenant. Covex can interact with a covenant even if it was not created on Covex: given the redeem script, Covex derives its P2SH address (a wrong script simply fails the lookup), assembles the spend, and the caller's own key signs it.

**Build the covenant.** Either deploy a primitive from the builder, or bring an existing on-chain covenant by supplying its redeem script on the covenant page.

**Build the website.** Start from the Generic template. Use a HeroImage, RichText to document the covenant's logic, a StatRow for the locked amount, a StakeCTA `action: interact` or `spend`, and an EnforcementBadge that reflects the covenant's real enforcement.

**Enforcement reality: depends on the covenant; default metadata for display.** Covex is removable from the interaction path: the caller's own key signs. Label the covenant by what its script actually enforces. If Covex is only describing it, that is metadata, not enforcement.

---

## 5. Using the API directly

The same API powers the explorer. No key required for reads.

```bash
# Read a covenant and its configuration
curl "https://hightable.pro/api/covenants/<txid>"
curl "https://hightable.pro/api/covenants/<txid>/actions"

# Read a saved website / terminal configuration for a covenant
curl "https://hightable.pro/api/terminal-config/<covenant_id>"

# Verify a proof and get a signed outcome (oracle path)
curl -X POST https://hightable.pro/api/oracle/verify-and-sign \
  -H "Content-Type: application/json" -d @proof-payload.json

# Compile the Covex DSL to bytecode
curl -X POST https://hightable.pro/api/compile \
  -H "Content-Type: application/json" -d '{"source":"contract T { ... }"}'
```

The oracle endpoint verifies a proof and returns a signed outcome you can use as witness data when unlocking an oracle-attested covenant. It fails closed: a bad proof or a missing key means no signature. Build your application UI on top of the saved configuration.

Interactive docs: `hightable.pro/docs`. OpenAPI: `/api/openapi.json`.

---

## 6. Non-custodial guarantees you can rely on

- **Keys never leave the browser.** Wallet generation happens client-side; the private key is never transmitted to the server. On mainnet a key is never displayed or transmitted.
- **Covex holds no funds and cannot move them.** It reads UTXOs and verifies payments on-chain. Every value-moving action is signed by the user's own wallet.
- **Destination is always derived on-chain.** A creator-placed button derives its destination and script hash server-side from the indexed covenant record, never from the button payload.
- **Any covenant is redeemable without Covex.** Given the redeem script, the caller's own key signs the spend. Covex is removable from the interaction path.

---

## 7. Contributing new circuits

New real ZK circuits are welcome if they follow the established pattern and stay honest:

- A working circom (or equivalent) circuit.
- A complete proving and verification pipeline (circom + snarkjs).
- An oracle verification handler that fails closed.
- Documentation and a worked example.
- Honest labeling: a circuit stays oracle-attested until its proving key ships and a proof actually verifies. Never label a circuit full-zk on the strength of a key that does not yet exist.

A Kaspa reality check: there is no pairing precompile, so full on-chain ZK verification is not the trustlessness path at Toccata. The path is script-enforced custody plus Schnorr, CLTV, hashlocks, multisig, and state channels, which is exactly the toolkit already built. On-chain proof checking is complementary, not the enforcement.

---

Welcome to the ecosystem. Build real things on Kaspa, and label them honestly.
