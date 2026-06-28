# Gambling de-emphasis and compliance posture

Status: 2026-06-28. This records the product-positioning change (lead with the legitimate
covenant utility, contain betting to one scoped section) and the compliance posture behind it.
It is the audit record for the Wave A frontend changes and, separately, the list of items that
require licensed counsel before mainnet real-value betting.

This is a posture and honesty record, not legal advice.

## Directive

Promote less gambling. Betting and game covenants stay creatable and reachable, but they must
not be the headline anywhere. The lead is the real utility: trustless programmable covenants,
ZK-enforced agreements, escrow, conditional payments. Nothing is hidden or deleted; prominence
and operator-flavored copy are the only things that change.

## What changed (Wave A, frontend)

Reordering and copy only, no feature removal. Enforcement-reality labels are preserved exactly
(games stay oracle-attested, markets stay hybrid, escrow/timelock/hashlock stay on-chain); a
reorder must never attach a green on-chain or trustless chip to a game or market.

1. Builder templates reordered utility-first; game templates moved to the tail of the catalog
   and the Games category moved last. Files: `frontend/src/lib/templates/templates.ts`,
   `frontend/src/pages/Sandbox.jsx`.
2. Hero capability chips reordered to lead with escrow, ZK proofs, conditional payments,
   auctions, vesting; games and prediction markets moved to the tail.
   File: `frontend/src/pages/Explorer.jsx`.
3. The homepage Arena tab is de-emphasized (amber accent dropped to peer weight) and relabeled
   Play. It stays reachable with its live count. File: `frontend/src/pages/Explorer.jsx`.
4. Operator vocabulary removed. The word house as a Covex-facing fee or operator label
   contradicted the Terms ("Covex is not the house") and was replaced with the accurate
   creator fee or pool fee (the fee is set by the covenant creator, not by Covex acting as a
   house). Files: `frontend/src/pages/Markets.jsx`, `frontend/src/pages/EnforcedDeploy.jsx`,
   `frontend/src/components/HonestLimits.jsx`.
5. The skill games framing in user-facing marketing labels was made neutral (two-player staked
   games, head-to-head games). The functional helper is unchanged; only rendered strings moved
   off a legal conclusion the Terms wisely declines to make.
6. An age and eligibility affirmation was added to the one-time consent gate.
   File: `frontend/src/components/LegalModal.jsx`.
7. A concise non-operator note is surfaced at the point of betting (the Play view and the market
   builder): you deploy your own covenant; Covex is not a counterparty, bookmaker, or custodian,
   sets no odds, and runs no house; resolution depends on an external resolver you choose.
8. Utility-first ordering in feature sentences in Pricing, About, and the README; the games
   example moved below the escrow, vesting, and ZK examples.
9. The OG and Twitter title em dash in `frontend/index.html` was corrected to a colon (a
   grandfathered legacy string, so CI was already green, fixed for consistency).

## What was already strong (kept)

The honesty infrastructure is good and was preserved: `frontend/src/pages/Terms.jsx` (clear
non-operator and non-custodial framing, neutral on skill versus chance, honest disclosure that
there is no IP geoblocking), `frontend/src/components/HonestLimits.jsx` (always-visible "what
this does not prove" disclosures), the "you can be right and still lose" market warning, and the
one-time consent gate. `frontend/src/pages/Markets.jsx` is not wired into the route table and is
reachable only through the market-creation flow, which already helps containment.

## Why this lowers exposure (direction high-confidence, degree counsel-dependent)

1. The line that matters legally is operating or promoting gambling versus providing neutral,
   non-custodial tooling. Leading with games, ranking them, and using operator vocabulary makes
   the product look like the regulated thing. De-promoting and scoping betting moves Covex back
   toward the tooling side. This is a posture improvement, not immunity.
2. Advertising and promotion of gambling is regulated separately from operating it. Removing
   inducement language and not leading with betting reduces the advertising footprint.
3. Ad-network and app-store policy classify on how the product presents itself. A betting-led
   hero is classified as real-money gambling regardless of the non-custodial backend.
   Containment improves the odds any future distribution survives policy review.

## Copy to avoid anywhere on the site

Operator and bookmaker vocabulary (house, the house takes, bookmaker). Inducement language (win
big, easy money, jackpot, guaranteed, risk-free, double your, beat the house) - a grep found
none in `frontend/src`; keep it that way. Odds presented as marketing (a glowing multiplier as a
hero draw). Gambling imagery (cards, chips, dice) as homepage hero art. Asserting poker or
blackjack are skill games in marketing.

## Counsel-required before mainnet real-value betting

These cannot be resolved by copy edits and need a licensed attorney in the relevant
jurisdictions. They are owner-gated, not agent-doable.

1. Whether the parimutuel prediction market is a real-money event contract triggering CFTC or
   securities regulation, and whether the user-deployed, non-custodial framing is sufficient.
2. Whether staked poker or blackjack are gambling requiring a license in target jurisdictions,
   and whether any residual skill framing creates misrepresentation exposure.
3. The keystone money-path question: today the bundled market settles via a Covex-derived secret
   gated to the creator wallet, and a treasury fee is taken. Covex-derived settlement plus a
   treasury fee is the fact pattern that most undercuts a non-operator defense. Counsel must
   assess whether the Terms representation that Covex does not facilitate gambling is sustainable
   until external-resolver binding ships and replaces the Covex-derived settlement.
4. Money-transmission and MSB exposure of taking an on-chain treasury fee in connection with
   staked games and markets.
5. Age-gating and geoblocking obligations per jurisdiction and per ad-network and app-store
   policy, and whether the eligibility affirmation added in Wave A is adequate or whether
   technical enforcement (IP geoblock) is required.
6. Final go or no-go on whether any real-money betting covenant may be promoted at all on
   mainnet, even within a contained section, versus testnet-only until external-resolver binding
   and counsel sign-off are complete.

## The one product dependency that resolves item 3

The strongest single fix for the operator concern is to finish external-resolver binding so the
bundled market no longer settles via a Covex-derived secret. That is tracked in the trustless
readiness plan (the oracle-connection spec and the resolver-bind fund path). Until then, the
contained betting section should remain testnet-first and the Terms representation should be
reviewed by counsel.
