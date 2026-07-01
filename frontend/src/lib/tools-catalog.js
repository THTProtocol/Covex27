/**
 * Tools Palette catalog.
 *
 * Two flat arrays that drive the Tools Palette UI:
 *
 *   LOGIC_PRIMITIVES: the 12 covenant logic kinds shipped by EnforcedDeploy.jsx
 *     (kept in sync with its KINDS array). Each entry routes into the Sandbox at
 *     the logic phase preselected. The `reality` label is the ENFORCEMENT TRUTH
 *     for that primitive and must match the EnforcedDeploy tile copy and the
 *     server-derived enforcement_reality:
 *       - "consensus-enforced"  the Kaspa script itself enforces the spend
 *         conditions; no off-chain co-signer is required.
 *       - "oracle-cosigned"     the script is a 2-of-2 of (resolver, party), so
 *         release requires an external resolver the deployer binds by pubkey at
 *         deploy to co-sign a verified outcome. The chain still enforces that
 *         signature is present; the deployer-bound resolver decides which side it
 *         co-signs for. Covex never attests real-world facts.
 *       - "metadata"            (unused here, reserved for entries whose spend
 *         path is not script-enforced and is recorded as data only).
 *
 *   PAGE_BLOCKS: every component registered in puckConfig.jsx, grouped by
 *     category so the palette can show them under headings. These are dragged
 *     into the Studio sidebar; the palette itself does not insert them, so
 *     `insertHint` is a static instruction string.
 *
 * Honesty rules applied to every one-liner:
 *   - No "trustless", "non-custodial", or "on-chain ZK" claims.
 *   - Oracle primitives name the deployer-bound external resolver explicitly.
 *   - Demo-wallet primitives say so.
 */

export const LOGIC_PRIMITIVES = [
  {
    id: 'singlesig',
    name: 'Single-key',
    oneLiner: 'A single key signs to spend. The simplest lock.',
    reality: 'consensus-enforced',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=singlesig',
  },
  {
    id: 'hashlock',
    name: 'Hashlock',
    oneLiner: 'Reveal a SHA256 preimage plus a signature to spend. The HTLC building block.',
    reality: 'consensus-enforced',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=hashlock',
  },
  {
    id: 'timelock',
    name: 'Timelock',
    oneLiner: 'Spendable only after the chain DAA score passes the unlock point. Vesting and dispute windows.',
    reality: 'consensus-enforced',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=timelock',
  },
  {
    id: 'multisig',
    name: 'Multisig (2-of-2 demo)',
    oneLiner: 'Release requires both keys to sign. Demo uses the server-assisted dev wallets.',
    reality: 'consensus-enforced',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=multisig',
  },
  {
    id: 'htlc',
    name: 'HTLC (atomic swap)',
    oneLiner: 'Receiver claims by revealing a secret, sender refunds after a timelock. Demo uses the dev wallets.',
    reality: 'consensus-enforced',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=htlc',
  },
  {
    id: 'channel',
    name: 'State-channel pot',
    oneLiner: 'A 2-of-2 cooperative-close pot with a funder refund after a timelock. No oracle, demo uses the dev wallets.',
    reality: 'consensus-enforced',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=channel',
  },
  {
    id: 'deadman',
    name: "Dead-man's switch",
    oneLiner: 'Owner spends or refreshes any time, heir can claim only after the timelock. Demo uses the dev wallets.',
    reality: 'consensus-enforced',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=deadman',
  },
  {
    id: 'relative_timelock',
    name: 'Relative timelock (CSV)',
    oneLiner: 'Spendable only after the funds have aged a relative number of blocks (BIP68). Node rejects an early spend.',
    reality: 'consensus-enforced',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=relative_timelock',
  },
  {
    id: 'timedecay',
    name: 'Time-decaying multisig',
    oneLiner: 'A high quorum spends now, relaxing to a lower quorum after a deadline. Demo uses the dev wallets.',
    reality: 'consensus-enforced',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=timedecay',
  },
  {
    id: 'oracle_enforced',
    name: 'Oracle-enforced',
    oneLiner: 'A 2-of-2 of an external resolver the deployer binds by pubkey at deploy and the winner. The chain requires the resolver co-signature on a verified outcome.',
    reality: 'oracle-cosigned',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=oracle_enforced',
  },
  {
    id: 'oracle_escrow',
    name: 'Oracle escrow (2-player)',
    oneLiner: 'A 2-player pot released only to the player on the branch the deployer-bound resolver co-signs. Demo uses the dev wallets.',
    reality: 'oracle-cosigned',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=oracle_escrow',
  },
  {
    id: 'market',
    name: 'Conditional Outcome',
    oneLiner: 'Pooled outcome covenant: stakers split the winning side, an external resolver the deployer binds by pubkey at deploy co-signs the outcome.',
    reality: 'oracle-cosigned',
    exampleId: null,
    route: '/sandbox?phase=logic&circuit=market',
  },
];

const INSERT_HINT = 'Drag from the Studio sidebar';

export const PAGE_BLOCKS = [
  // Hero
  {
    id: 'Hero',
    name: 'Hero (text)',
    oneLiner: 'Headline, subheading, and a primary call to action.',
    category: 'Hero',
    insertHint: INSERT_HINT,
  },
  {
    id: 'HeroImage',
    name: 'Hero (image)',
    oneLiner: 'Hero layout with an https image or platform placeholder beside the copy.',
    category: 'Hero',
    insertHint: INSERT_HINT,
  },
  {
    id: 'CTABanner',
    name: 'CTA Banner',
    oneLiner: 'Wide accented band with a single call to action.',
    category: 'Hero',
    insertHint: INSERT_HINT,
  },
  {
    id: 'StatBanner',
    name: 'Big Stat',
    oneLiner: 'A row of headline figures, supports live tokens like {{pool_total}}.',
    category: 'Hero',
    insertHint: INSERT_HINT,
  },

  // Live data
  {
    id: 'AnimatedCounter',
    name: 'Animated Counter (live)',
    oneLiner: 'A single live figure that animates as the value changes.',
    category: 'Live data',
    insertHint: INSERT_HINT,
  },
  {
    id: 'OddsBar',
    name: 'Split Bar (live)',
    oneLiner: 'YES vs NO shares as a split bar driven by live pool data.',
    category: 'Live data',
    insertHint: INSERT_HINT,
  },
  {
    id: 'OddsHighlightCard',
    name: 'Highlight Card (live)',
    oneLiner: 'Large card showing the leading side and its share of the pool.',
    category: 'Live data',
    insertHint: INSERT_HINT,
  },
  {
    id: 'PoolMeter',
    name: 'Progress Meter (live)',
    oneLiner: 'Total locked KAS as a filled meter against a configured target.',
    category: 'Live data',
    insertHint: INSERT_HINT,
  },
  {
    id: 'ActivityFeed',
    name: 'Activity Feed (live)',
    oneLiner: 'Recent on-chain actions for this covenant: stakes, claims, refunds.',
    category: 'Live data',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Leaderboard',
    name: 'Leaderboard (live)',
    oneLiner: 'Top stakers by size for this covenant, derived from the live pool.',
    category: 'Live data',
    insertHint: INSERT_HINT,
  },
  {
    id: 'PoolChart',
    name: 'Pool Chart (live)',
    oneLiner: 'YES vs NO pool over time as a stacked area chart.',
    category: 'Live data',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Countdown',
    name: 'Countdown',
    oneLiner: 'Counts down to {{settle_at}} or any configured timestamp.',
    category: 'Live data',
    insertHint: INSERT_HINT,
  },
  {
    id: 'StatRow',
    name: 'Stats Row (live)',
    oneLiner: 'A compact row of label-and-value pairs, supports live tokens.',
    category: 'Live data',
    insertHint: INSERT_HINT,
  },

  // Content
  {
    id: 'Heading',
    name: 'Heading',
    oneLiner: 'A single heading line at H1 through H4.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Paragraph',
    name: 'Paragraph',
    oneLiner: 'A plain paragraph of body copy. No markdown.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'RichText',
    name: 'Rich Text (markdown)',
    oneLiner: 'Markdown body copy rendered through the platform sanitizer (no raw HTML reaches the DOM).',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'BulletList',
    name: 'Bullet List',
    oneLiner: 'A simple bulleted list of plain-text items.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'FAQItem',
    name: 'FAQ Item',
    oneLiner: 'A single question and answer pair.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Accordion',
    name: 'Accordion / FAQ',
    oneLiner: 'A list of collapsible question and answer panels.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Tabs',
    name: 'Tabs',
    oneLiner: 'Tabbed sections of text content.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Timeline',
    name: 'Timeline / Roadmap',
    oneLiner: 'A vertical timeline of dated events.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'ProcessFlow',
    name: 'Process flow (horizontal)',
    oneLiner: 'Numbered horizontal steps with connectors; stacks on mobile.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Testimonials',
    name: 'Quotes / Testimonials',
    oneLiner: 'A row of quoted testimonials with attribution.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'ComparisonTable',
    name: 'Comparison table',
    oneLiner: 'A feature matrix with check/dash cells and a highlighted column.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'FeatureGrid',
    name: 'Feature Grid',
    oneLiner: 'A grid of icon-led feature cards.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },
  {
    id: 'GlowCard',
    name: 'Glow cards (premium)',
    oneLiner: 'Glassmorphism feature cards with an accent glow.',
    category: 'Content',
    insertHint: INSERT_HINT,
  },

  // Layout
  {
    id: 'SectionBackground',
    name: 'Section Background',
    oneLiner: 'A wrapper that paints a tinted or gradient background behind nested blocks.',
    category: 'Layout',
    insertHint: INSERT_HINT,
  },
  {
    id: 'TwoColumns',
    name: 'Two Columns',
    oneLiner: 'Splits a section into two side-by-side columns of blocks.',
    category: 'Layout',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Spacer',
    name: 'Spacer',
    oneLiner: 'Adds vertical breathing room between blocks.',
    category: 'Layout',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Divider',
    name: 'Divider',
    oneLiner: 'A thin horizontal rule.',
    category: 'Layout',
    insertHint: INSERT_HINT,
  },

  // Actions
  {
    id: 'StakeCTA',
    name: 'Action Button',
    oneLiner: 'Primary stake button wired to the covenant. The destination is server-derived, not creator-set.',
    category: 'Actions',
    insertHint: INSERT_HINT,
  },
  {
    id: 'FeeNotice',
    name: 'Fee Transparency',
    oneLiner: 'A small honest line stating the configured creator fee and loser rebate.',
    category: 'Actions',
    insertHint: INSERT_HINT,
  },

  // Honesty
  {
    id: 'EnforcementBadge',
    name: 'Enforcement Badge',
    oneLiner: 'Static label reflecting the server-derived enforcement reality (consensus-enforced, oracle co-signed, or metadata).',
    category: 'Honesty',
    insertHint: INSERT_HINT,
  },

  // Media
  {
    id: 'ImageBlock',
    name: 'Image',
    oneLiner: 'A single https image with optional caption. Anything not https renders a placeholder.',
    category: 'Media',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Video',
    name: 'Video (YouTube / Vimeo)',
    oneLiner: 'YouTube or Vimeo embed built from the video id (no raw iframe src).',
    category: 'Media',
    insertHint: INSERT_HINT,
  },
  {
    id: 'ImageGallery',
    name: 'Image Gallery',
    oneLiner: 'A grid of https images.',
    category: 'Media',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Carousel',
    name: 'Carousel',
    oneLiner: 'A swipeable carousel of images.',
    category: 'Media',
    insertHint: INSERT_HINT,
  },

  // Social
  {
    id: 'SocialLinks',
    name: 'Social Links',
    oneLiner: 'A row of icon links to social profiles (https only).',
    category: 'Social',
    insertHint: INSERT_HINT,
  },
  {
    id: 'LogoStrip',
    name: 'Logo Strip',
    oneLiner: 'A row of partner or sponsor logos.',
    category: 'Social',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Marquee',
    name: 'Marquee / Ticker',
    oneLiner: 'A horizontally scrolling strip of short text items.',
    category: 'Social',
    insertHint: INSERT_HINT,
  },
  {
    id: 'Footer',
    name: 'Footer',
    oneLiner: 'A simple footer with credit text and optional social links.',
    category: 'Social',
    insertHint: INSERT_HINT,
  },
  {
    id: 'PricingTier',
    name: 'Pricing Tiers',
    oneLiner: 'A pricing card with title, price, bullet features, and a CTA.',
    category: 'Social',
    insertHint: INSERT_HINT,
  },
];
