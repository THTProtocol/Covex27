import { describe, it, expect, vi } from 'vitest';

// PINNED CATALOG HONESTY TEST.
//
// Why this file exists:
//   The Sandbox journey test (frontend/src/pages/__tests__/Sandbox.journey.test.jsx)
//   stubs ZK_CIRCUIT_TYPES to a tiny 2-circuit fixture so it can exercise phase
//   routing without pulling kaspa-wasm / snarkjs / chess.js / the wallet context.
//   That mock makes the journey test self-referential w.r.t. enforcement labels:
//   if the REAL catalog later flips a circuit's `reality` from 'full-zk' (which
//   collapses to the honest "Oracle-attested" badge) to 'on-chain' (which paints
//   as the stronger chain-enforced badge), the journey would not notice.
//   Adversarial finding from the security pass.
//
// HONESTY DOWNGRADE: the "Chain-enforced ZK" / 'full-zk-chain' tier has been
// RETIRED ENTIRELY. No deployed circuit's ZK proof is bound to a chain-checked
// hashlock (the circuits use MiMC7/range/timelock math, Kaspa's hashlock is
// blake2b256, escrow_2party has no hash at all, and covenant_builder.rs has no
// circuit-output -> hashlock binding). All 19 verified circuits are oracle-
// verified OFF-CHAIN (fail-closed); the only on-chain check is the oracle's
// BIP340 Schnorr co-signature. There is no CHAIN_ENFORCED_ZK set anymore (it was
// removed outright, not just emptied); the cross-language resurrection guard lives
// in zk-set-backend-parity.test.js.
//
// What this file pins, against the REAL ZK_CIRCUIT_TYPES from CovexTerminal:
//   1. NO surviving catalog entry carries reality === 'full-zk-chain' (the tier
//      is retired) and the four ex-"chain-enforced" circuits are oracle-attested.
//   2. The post-processor invariant: NO surviving catalog entry has reality
//      'full-zk' or 'hybrid'. Both must collapse to 'oracle-attested' (the
//      single source of truth for the oracle-cosigned-only badge). This is
//      the honesty floor: a regression that lets a 'full-zk' label through
//      to the UI would render a green ZK-on-chain badge on a circuit that is
//      only oracle-cosigned.
//   3. Every surviving reality is one of the labels the Sandbox REALITY map
//      (pages/Sandbox.jsx) knows how to render honestly: on-chain,
//      oracle-attested, decorative. Anything else falls through to the
//      oracle-attested default, which is silently lossy. Markets and oracle
//      escrow stay oracle-attested, never 'on-chain'.
//
// We import the REAL catalog (no stub). CovexTerminal pulls a lot at module
// eval time (kaspa-wasm, chess.js, react-chessboard, snarkjs, the wallet
// context). We do NOT need any of that to function: we only need the module
// to evaluate so we can read the `ZK_CIRCUIT_TYPES` export. The mocks below
// keep the imports resolvable without dragging in wasm or DOM-only code.
// The ZK reality SETS (VERIFIED_FULL_ZK / IN_BROWSER_PROVERS / STRICT_GROTH16)
// are NOT mocked: they are the actual single-source-of-truth that the catalog
// post-processor reads, and the whole point of this test is to pin the real
// post-processed output.

vi.mock('chess.js', () => ({ Chess: class {} }));
vi.mock('react-chessboard', () => ({ Chessboard: () => null }));
vi.mock('@onekeyfe/kaspa-wasm', () => ({}));
vi.mock('snarkjs', () => ({}));
vi.mock('../../../components/WalletContext', () => ({
  useWallet: () => ({}),
  WalletProvider: ({ children }) => children,
}));
vi.mock('../../../components/ToastContext', () => ({
  toast: { success: () => {}, error: () => {}, info: () => {} },
}));
vi.mock('../../../components/TransparencyModal', () => ({ default: () => null }));
vi.mock('../../../components/ChessPreviewConfig', () => ({
  default: () => null,
  defaultTimeControlFor: () => ({}),
}));
vi.mock('../../../components/FullScreenPoker', () => ({ default: () => null }));
vi.mock('../../../components/FullScreenBlackjack', () => ({ default: () => null }));
vi.mock('../../../components/FullScreenCheckers', () => ({ default: () => null }));
vi.mock('../../../components/FullScreenConnect4', () => ({ default: () => null }));
vi.mock('../../../components/FullScreenTicTacToe', () => ({ default: () => null }));
vi.mock('../../../components/FullScreenReversi', () => ({ default: () => null }));
vi.mock('../../../components/FullScreenRPS', () => ({ default: () => null }));
vi.mock('../../../components/CovexLogo', () => ({ CovexMark: () => null }));
vi.mock('../../covenant-config/useCovenantConfig', () => ({
  useCovenantConfig: () => ({}),
}));
vi.mock('../../covenant-config/ResolutionSimulator', () => ({ default: () => null }));
vi.mock('../../advanced-primitives/AdvancedPrimitivesComposer', () => ({ default: () => null }));
vi.mock('../../multi-oracle/MultiOracleConfigurator', () => ({ default: () => null }));

const { ZK_CIRCUIT_TYPES, HEADLINE_GAME_CIRCUITS, HEADLINE_GAME_CIRCUIT_SET } = await import('../../../components/CovexTerminal.jsx');
const circuitsModule = await import('../circuits.js');
const playable = await import('../../playableGames.js');

// The Sandbox REALITY map (pages/Sandbox.jsx) recognizes exactly these keys. Any
// reality outside this set falls through to the oracle-attested default, which
// loses information silently. on-chain and decorative are present because the
// raw catalog uses them on the consensus-enforced primitives and the metadata
// circuits; both pass through the post-processor unchanged.
const SANDBOX_KNOWN_REALITIES = new Set([
  'on-chain',
  'oracle-attested',
  'decorative',
]);

describe('ZK_CIRCUIT_TYPES catalog honesty (pinned against the real export)', () => {
  it('exports a non-trivial catalog (regression guard: the stub used to ship 2 entries)', () => {
    expect(Array.isArray(ZK_CIRCUIT_TYPES)).toBe(true);
    // 20 is a deliberately loose floor. The real catalog has 170+ entries; this
    // only fires if the export disappears or collapses to a stub size.
    expect(ZK_CIRCUIT_TYPES.length).toBeGreaterThan(20);
  });

  it('post-processor invariant: no surviving entry has reality "full-zk" or "hybrid"', () => {
    // The CovexTerminal post-processor MUST collapse every 'full-zk' / 'hybrid'
    // reality to 'oracle-attested' (the honest off-chain-verified label). Any
    // leak here would mean a green ZK-on-chain badge could render for a circuit
    // that the chain does not actually verify.
    const leaks = ZK_CIRCUIT_TYPES.filter(
      (c) => c.reality === 'full-zk' || c.reality === 'hybrid',
    );
    expect(
      leaks,
      `Found ${leaks.length} circuit(s) that escaped the post-processor without collapsing to oracle-attested: ` +
        leaks.map((c) => `${c.id} (${c.reality})`).join(', '),
    ).toEqual([]);
  });

  it('every surviving reality is one the Sandbox REALITY map renders honestly', () => {
    const unknown = ZK_CIRCUIT_TYPES.filter((c) => !SANDBOX_KNOWN_REALITIES.has(c.reality));
    expect(
      unknown,
      `Sandbox REALITY map does not honestly render: ` +
        unknown.map((c) => `${c.id}=${c.reality}`).join(', '),
    ).toEqual([]);
  });

  it('the chain-enforced ZK carve-out is retired (no CHAIN_ENFORCED_ZK export)', () => {
    // The "Chain-enforced ZK" tier was an overclaim and has been removed OUTRIGHT.
    // No deployed circuit's ZK proof is bound to a chain-checked hashlock, so the
    // canonical module exports neither the set nor its helper. (Emptying it was the
    // earlier, incomplete fix; this guards against the symbols reappearing at all.)
    expect(circuitsModule.CHAIN_ENFORCED_ZK).toBeUndefined();
    expect(circuitsModule.isChainEnforcedZk).toBeUndefined();
  });

  it('no surviving catalog entry carries the removed reality "full-zk-chain"', () => {
    // The four ex-"chain-enforced" circuits (merkle_membership, age_verification,
    // escrow_2party, range_proof) are now oracle-verified OFF-CHAIN like every
    // other ZK circuit. None may paint the stronger chain-enforced badge.
    const survivors = ZK_CIRCUIT_TYPES.filter((c) => c.reality === 'full-zk-chain');
    expect(
      survivors,
      `Found ${survivors.length} circuit(s) still tagged full-zk-chain (the tier was removed): ` +
        survivors.map((c) => c.id).join(', '),
    ).toEqual([]);
  });

  it('the four ex-chain-enforced circuits are present but NOT chain-enforced', () => {
    // They still exist as real Groth16 circuits, but their proof is verified
    // off-chain by anyone (you, the counterparty, or any external verifier); a valid
    // proof gates a 2-of-2 cosign whose Schnorr co-signature is the only on-chain
    // check. So they must collapse to 'oracle-attested', never a chain-enforced or
    // 'on-chain' label.
    const ids = ['merkle_membership', 'age_verification', 'escrow_2party', 'range_proof'];
    for (const id of ids) {
      const c = ZK_CIRCUIT_TYPES.find((x) => x.id === id);
      expect(c, `catalog missing circuit "${id}"`).toBeTruthy();
      expect(
        c.reality,
        `circuit "${id}" is verified off-chain (no proof-to-hashlock binding) and must be oracle-attested, not "${c.reality}"`,
      ).toBe('oracle-attested');
    }
  });

  it('no catalog entry carries a chain-enforced reality (the tier is fully retired)', () => {
    // With the tier removed there is no chain-enforced reality at all. A resurrected
    // full-zk-chain catalog entry would be a silent overclaim. Belt-and-suspenders with
    // the dedicated full-zk-chain test above: assert the catalog produces zero such ids.
    const catalogChainEnforced = ZK_CIRCUIT_TYPES
      .filter((c) => c.reality === 'full-zk-chain')
      .map((c) => c.id);
    expect(
      catalogChainEnforced.sort(),
      'catalog resurrected a chain-enforced (full-zk-chain) reality; the tier was retired',
    ).toEqual([]);
  });

  it('prediction markets and oracle escrow are oracle-attested, never "on-chain"', () => {
    // Markets resolve on a real-world fact a deployer-bound external resolver must
    // report, and resolver escrow needs that resolver's co-signature in the payout
    // path (Covex never attests outcomes). Neither is trustless, so neither may carry
    // the 'on-chain' badge.
    const oracleResolvedIds = ['prediction_market', 'oracle_single'];
    for (const id of oracleResolvedIds) {
      const c = ZK_CIRCUIT_TYPES.find((x) => x.id === id);
      if (!c) continue; // tolerate catalog id renames; the label guard below is the point
      expect(
        c.reality,
        `circuit "${id}" must be oracle-attested, not "${c.reality}" (it is not chain-enforced)`,
      ).not.toBe('on-chain');
    }
  });

  // ── READINESS TIER (production vs roadmap) ──────────────────────────────────
  // Pins gap #8: the catalog must be honest about which circuits really verify
  // end-to-end today (a wired Groth16 prover/verifier = PRODUCTION) vs which are
  // buildable-but-oracle-attested previews (ROADMAP). The tier is derived from the
  // registry sets (zkVerifiedOffChain), so it cannot drift from what actually proves.
  const circuitsLib = circuitsModule;
  const isProductionId = (id) =>
    circuitsLib.VERIFIED_FULL_ZK.has(id) || circuitsLib.STRICT_GROTH16.has(id);

  it('every catalog entry carries a derived catalogTier of production or roadmap', () => {
    const bad = ZK_CIRCUIT_TYPES.filter((c) => c.catalogTier !== 'production' && c.catalogTier !== 'roadmap');
    expect(
      bad,
      `entries with a missing/invalid catalogTier: ` + bad.map((c) => `${c.id}=${c.catalogTier}`).join(', '),
    ).toEqual([]);
  });

  it('catalogTier matches the registry exactly (cannot drift from what verifies)', () => {
    // PRODUCTION iff the id is in VERIFIED_FULL_ZK or STRICT_GROTH16; ROADMAP otherwise.
    const mislabeledProd = ZK_CIRCUIT_TYPES.filter((c) => c.catalogTier === 'production' && !isProductionId(c.id));
    const mislabeledRoad = ZK_CIRCUIT_TYPES.filter((c) => c.catalogTier === 'roadmap' && isProductionId(c.id));
    expect(
      mislabeledProd,
      `circuit(s) tagged PRODUCTION but absent from the registry (overclaim): ` +
        mislabeledProd.map((c) => c.id).join(', '),
    ).toEqual([]);
    expect(
      mislabeledRoad,
      `production circuit(s) mislabeled ROADMAP (underclaim): ` +
        mislabeledRoad.map((c) => c.id).join(', '),
    ).toEqual([]);
  });

  it('the production set is exactly the registry-verified circuits (22 today, all 19 in-browser provers included)', () => {
    const production = ZK_CIRCUIT_TYPES.filter((c) => c.catalogTier === 'production');
    const roadmap = ZK_CIRCUIT_TYPES.filter((c) => c.catalogTier === 'roadmap');
    // Production must be the minority, and roadmap the large majority: a regression
    // that flipped most of the 200-entry catalog to "production" would be a mass overclaim.
    expect(production.length).toBeGreaterThan(0);
    expect(production.length).toBeLessThan(roadmap.length);
    expect(production.length + roadmap.length).toBe(ZK_CIRCUIT_TYPES.length);
    // Every in-browser prover must be production (real prove path runs in the browser).
    for (const id of circuitsLib.IN_BROWSER_PROVERS) {
      const c = ZK_CIRCUIT_TYPES.find((x) => x.id === id);
      if (!c) continue;
      expect(c.catalogTier, `in-browser prover "${id}" must be production`).toBe('production');
    }
    // zkVerifiedOffChain and catalog==='production' are the SAME signal.
    const mismatch = ZK_CIRCUIT_TYPES.filter((c) => (c.catalogTier === 'production') !== (c.zkVerifiedOffChain === true));
    expect(mismatch.map((c) => c.id)).toEqual([]);
  });

  it('the worst overclaimers (reality:full-zk in prose but no wired prover) are downgraded to roadmap', () => {
    // These claimed 'full-zk' in the raw prose but are NOT in the registry, so they
    // must end up oracle-attested AND roadmap, never production.
    const exFakeFullZk = ['connect4_v1', 'tictactoe_v1', 'timelock_daa_public', 'private_airdrop', 'acl_zk_proof'];
    for (const id of exFakeFullZk) {
      const c = ZK_CIRCUIT_TYPES.find((x) => x.id === id);
      expect(c, `catalog missing "${id}"`).toBeTruthy();
      expect(c.catalogTier, `"${id}" overclaims (must be roadmap)`).toBe('roadmap');
      expect(c.reality, `"${id}" must be oracle-attested`).toBe('oracle-attested');
      expect(c.artifacts, `"${id}" must not keep an artifacts flag`).not.toBe(true);
    }
  });

  it('roadmap circuit descriptions are scrubbed of internal citations + not-built prose', () => {
    // The Roadmap badge now carries readiness; the user-facing copy must not leak the
    // internal "(vision §X)" citations or "no artifacts yet" / "Artifacts planned" prose.
    const leaks = ZK_CIRCUIT_TYPES.filter((c) =>
      /\(vision\b/i.test(c.description) ||
      /§/.test(c.description) ||
      /no artifacts yet/i.test(c.description) ||
      /Artifacts planned/i.test(c.description) ||
      /Artifacts: none yet/i.test(c.description),
    );
    expect(
      leaks,
      `descriptions still carry internal roadmap markers: ` +
        leaks.map((c) => c.id).join(', '),
    ).toEqual([]);
  });

  it('descriptions never leak aspirational not-built phrasing (planned / stub / partial artifacts)', () => {
    // The honesty bar: a roadmap circuit must never present an unbuilt capability as product
    // detail. The Roadmap badge already conveys readiness, so these markers are stripped at
    // export time. Patterns covered by scrubRoadmapProse in CovexTerminal.jsx:
    //   "...planned." sentences, "Reality: oracle-attested (planned/future/stub/...)",
    //   "Oracle-attested (... planned):", "solver stub", "Artifacts: partial",
    //   "(stub -> production)".
    const checks = [
      [/\bplanned\b/i, 'planned'],
      [/\bsolver stub\b/i, 'solver stub'],
      [/\bstub\s*(?:→|->|to)\s*production\b/i, 'stub -> production'],
      [/Artifacts:\s*partial/i, 'Artifacts: partial'],
      // not-built qualifier surviving inside a Reality:/Oracle-attested parenthetical
      [/oracle-attested\s*\([^)]*\b(?:planned|stub|partial|wip|todo|tbd)\b/i, 'not-built reality parenthetical'],
    ];
    const failures = [];
    for (const [re, label] of checks) {
      for (const c of ZK_CIRCUIT_TYPES) {
        if (re.test(c.description || '')) failures.push(`${c.id} [${label}]: ${c.description}`);
      }
    }
    expect(failures, `descriptions still leak not-built phrasing:\n` + failures.join('\n')).toEqual([]);
  });

  it('no roadmap circuit advertises served Groth16 artifacts or the word full-zk', () => {
    // Roadmap circuits are oracle-attested with no dedicated prover; they must not claim
    // "Artifacts in zk/..." (production-only) nor leak the forbidden on-chain-ZK word.
    const overclaim = ZK_CIRCUIT_TYPES.filter(
      (c) => c.catalogTier === 'roadmap' && /Artifacts in zk\//i.test(c.description),
    );
    expect(
      overclaim,
      `roadmap circuit(s) still advertise served artifacts: ` + overclaim.map((c) => c.id).join(', '),
    ).toEqual([]);
    const leakFullZk = ZK_CIRCUIT_TYPES.filter((c) => /full-zk/i.test(c.description));
    expect(
      leakFullZk,
      `description(s) still leak "full-zk": ` + leakFullZk.map((c) => c.id).join(', '),
    ).toEqual([]);
  });

  it('production circuits keep their genuine artifact note (the strip is roadmap-only)', () => {
    // hash_preimage / timelock_absolute really ship served artifacts; the scrub must not
    // remove that honest note from PRODUCTION entries.
    const hp = ZK_CIRCUIT_TYPES.find((c) => c.id === 'hash_preimage');
    expect(hp.catalogTier).toBe('production');
    expect(/Artifacts in zk\//i.test(hp.description)).toBe(true);
  });

  it('no circuit claims artifacts: true without a matching genuine reality', () => {
    // Honesty floor on the "Artifacts" chip: only oracle-attested (post-collapse
    // from real-Groth16-prover circuits) or on-chain (consensus primitives) can
    // carry artifacts. A circuit that ended up 'decorative' but kept
    // artifacts: true would be the post-processor's overclaim-stripping leaking.
    const okRealities = new Set(['oracle-attested', 'on-chain']);
    const bad = ZK_CIRCUIT_TYPES.filter((c) => c.artifacts === true && !okRealities.has(c.reality));
    expect(
      bad,
      `circuit(s) claim artifacts on a non-genuine reality: ` +
        bad.map((c) => `${c.id}=${c.reality}`).join(', '),
    ).toEqual([]);
  });
});

// ── Playable-game catalog (the "Create a game" headline set) ───────────────────
// Pins the fix for the game-catalog gap: the 8 games with a real FullScreen arena
// must each have a buildable catalog entry under category 'game', and the headline
// set the gallery leads with must be exactly that playable set (no drift).
describe('playable games: catalog entries + headline set', () => {
  it('every playable game maps to a real category-game catalog entry', () => {
    // PLAYABLE_GAMES is the single source of truth (arena registry + headline cards
    // both derive from it). Each .circuit id must resolve to a buildable game entry.
    const byId = new Map(ZK_CIRCUIT_TYPES.map((c) => [c.id, c]));
    for (const g of playable.PLAYABLE_GAMES) {
      const c = byId.get(g.circuit);
      expect(c, `playable game "${g.key}" has no catalog circuit "${g.circuit}"`).toBeTruthy();
      expect(
        c.category,
        `catalog circuit "${g.circuit}" (for "${g.key}") must be category 'game', got '${c.category}'`,
      ).toBe('game');
    }
  });

  it('rps_v1 is buildable (regression: RPS had an arena but no catalog entry)', () => {
    const rps = ZK_CIRCUIT_TYPES.find((c) => c.id === 'rps_v1');
    expect(rps, 'rps_v1 missing from the catalog').toBeTruthy();
    expect(rps.category).toBe('game');
    // The arena resolves by name/description regex /rock.?paper|\brps\b/, so the
    // entry must name itself recognizably or the built covenant never opens the arena.
    expect(/rock.?paper|\brps\b/i.test(`${rps.name} ${rps.description}`)).toBe(true);
  });

  it('HEADLINE_GAME_CIRCUITS equals the playable set, in order, all category game', () => {
    expect(HEADLINE_GAME_CIRCUITS).toEqual(playable.HEADLINE_GAME_CIRCUITS);
    expect([...HEADLINE_GAME_CIRCUIT_SET].sort()).toEqual(
      [...playable.HEADLINE_GAME_CIRCUIT_SET].sort(),
    );
    expect(HEADLINE_GAME_CIRCUITS.length).toBe(8);
    const byId = new Map(ZK_CIRCUIT_TYPES.map((c) => [c.id, c]));
    for (const id of HEADLINE_GAME_CIRCUITS) {
      expect(byId.get(id)?.category, `headline ${id} not category game`).toBe('game');
    }
  });

  it('advanced game variants remain buildable (demoted, not removed)', () => {
    // Every non-headline category-game entry stays in the catalog so it is still
    // reachable behind the "Advanced game circuits" expander.
    const gameEntries = ZK_CIRCUIT_TYPES.filter((c) => c.category === 'game');
    const advanced = gameEntries.filter((c) => !HEADLINE_GAME_CIRCUIT_SET.has(c.id));
    // There are dozens of technical/proof variants; assert the demoted set is real
    // and that headline + advanced together cover the whole game category.
    expect(advanced.length).toBeGreaterThan(20);
    expect(gameEntries.length).toBe(advanced.length + HEADLINE_GAME_CIRCUITS.length);
  });
});
