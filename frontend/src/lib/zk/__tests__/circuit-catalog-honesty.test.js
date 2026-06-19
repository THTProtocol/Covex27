import { describe, it, expect, vi } from 'vitest';

// PINNED CATALOG HONESTY TEST.
//
// Why this file exists:
//   The Sandbox journey test (frontend/src/pages/__tests__/Sandbox.journey.test.jsx)
//   stubs ZK_CIRCUIT_TYPES to a tiny 2-circuit fixture so it can exercise phase
//   routing without pulling kaspa-wasm / snarkjs / chess.js / the wallet context.
//   That mock makes the journey test self-referential w.r.t. enforcement labels:
//   if the REAL catalog later flips a circuit's `reality` from 'full-zk' (which
//   collapses to the honest "Oracle-attested" badge) to 'on-chain' or
//   'full-zk-chain' (which paint as the stronger chain-enforced badge), the
//   journey would not notice. Adversarial finding from the security pass.
//
// What this file pins, against the REAL ZK_CIRCUIT_TYPES from CovexTerminal:
//   1. The four CHAIN_ENFORCED_ZK ids (merkle_membership, age_verification,
//      escrow_2party, range_proof) carry reality === 'full-zk-chain' in the
//      post-processed catalog. These are the only circuits the chain enforces
//      end-to-end via a hashlock.
//   2. The chain-enforced set in the catalog matches CHAIN_ENFORCED_ZK in
//      lib/zk/circuits.js EXACTLY (no drift either direction). A new
//      full-zk-chain entry in the catalog without a matching CHAIN_ENFORCED_ZK
//      bump would silently overclaim; the reverse would silently underclaim.
//   3. The post-processor invariant: NO surviving catalog entry has reality
//      'full-zk' or 'hybrid'. Both must collapse to 'oracle-attested' (the
//      single source of truth for the oracle-cosigned-only badge). This is
//      the honesty floor: a regression that lets a 'full-zk' label through
//      to the UI would render a green ZK-on-chain badge on a circuit that is
//      only oracle-cosigned.
//   4. Every surviving reality is one of the four labels the Sandbox REALITY
//      map (pages/Sandbox.jsx) knows how to render honestly: on-chain,
//      full-zk-chain, oracle-attested, decorative. Anything else falls
//      through to the oracle-attested default, which is silently lossy.
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
const { CHAIN_ENFORCED_ZK } = await import('../circuits.js');

// The Sandbox REALITY map (pages/Sandbox.jsx) recognizes exactly these keys. Any
// reality outside this set falls through to the oracle-attested default, which
// loses information silently. on-chain and decorative are present because the
// raw catalog uses them on the consensus-enforced primitives and the metadata
// circuits; both pass through the post-processor unchanged.
const SANDBOX_KNOWN_REALITIES = new Set([
  'on-chain',
  'full-zk-chain',
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

  it('the four chain-enforced ZK circuits carry reality "full-zk-chain"', () => {
    // These are the ONLY four whose ZK guarantee is enforced end-to-end on
    // Kaspa via a hashlock the chain itself checks. Source of truth:
    // CHAIN_ENFORCED_ZK in lib/zk/circuits.js, mirrored by REALITY_BODY
    // ["full-zk-chain"] in lib/enforcement-copy.js.
    const expectedIds = ['merkle_membership', 'age_verification', 'escrow_2party', 'range_proof'];
    for (const id of expectedIds) {
      const c = ZK_CIRCUIT_TYPES.find((x) => x.id === id);
      expect(c, `catalog missing required chain-enforced circuit "${id}"`).toBeTruthy();
      expect(
        c.reality,
        `circuit "${id}" must carry reality "full-zk-chain" (real Groth16 verified off-chain + payout chain-enforced via hashlock), not "${c.reality}"`,
      ).toBe('full-zk-chain');
    }
  });

  it('catalog full-zk-chain set matches CHAIN_ENFORCED_ZK exactly (no drift either direction)', () => {
    // Either-direction drift is bad:
    //   - new full-zk-chain entry without a CHAIN_ENFORCED_ZK bump = the UI
    //     would paint chain-enforced ZK on a circuit whose payout is only
    //     oracle-cosigned. Silent overclaim.
    //   - new CHAIN_ENFORCED_ZK entry without a catalog update = the catalog
    //     paints a weaker label than the runtime guard expects. Silent
    //     underclaim. Either way the assertion below catches it.
    const catalogChainEnforced = new Set(
      ZK_CIRCUIT_TYPES.filter((c) => c.reality === 'full-zk-chain').map((c) => c.id),
    );
    expect(
      Array.from(catalogChainEnforced).sort(),
      'full-zk-chain id set in the catalog drifted from CHAIN_ENFORCED_ZK in lib/zk/circuits.js',
    ).toEqual(Array.from(CHAIN_ENFORCED_ZK).sort());
  });

  it('no circuit claims artifacts: true without a matching genuine reality', () => {
    // Honesty floor on the "Artifacts" chip: only oracle-attested (post-collapse
    // from real-Groth16-prover circuits), full-zk-chain (the 4 chain-enforced),
    // or on-chain (consensus primitives) can carry artifacts. A circuit that
    // ended up 'decorative' but kept artifacts: true would be the post-processor's
    // overclaim-stripping leaking.
    const okRealities = new Set(['oracle-attested', 'full-zk-chain', 'on-chain']);
    const bad = ZK_CIRCUIT_TYPES.filter((c) => c.artifacts === true && !okRealities.has(c.reality));
    expect(
      bad,
      `circuit(s) claim artifacts on a non-genuine reality: ` +
        bad.map((c) => `${c.id}=${c.reality}`).join(', '),
    ).toEqual([]);
  });
});
