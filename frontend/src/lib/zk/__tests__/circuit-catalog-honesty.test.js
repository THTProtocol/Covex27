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

const { ZK_CIRCUIT_TYPES } = await import('../../../components/CovexTerminal.jsx');
const circuitsModule = await import('../circuits.js');

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
    // off-chain by the disclosed oracle; the only on-chain check is the oracle's
    // Schnorr co-signature. So they must collapse to 'oracle-attested', never a
    // chain-enforced or 'on-chain' label.
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
    // Markets resolve on a real-world fact an oracle must report, and oracle
    // escrow needs the Covex oracle co-signature in the payout path. Neither is
    // trustless, so neither may carry the 'on-chain' badge.
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
