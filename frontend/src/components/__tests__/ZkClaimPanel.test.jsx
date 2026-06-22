import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Honest test scope:
//   The component's actual state machine (verified against ZkClaimPanel.jsx) is
//   idle -> proving -> proved -> submitting -> done (success | refused) -> error.
//   The task brief referred to these as idle/proving/verified/signed_outcome; the
//   names below mirror the SOURCE state machine, not the brief, because the brief
//   said "don't fabricate transitions" and to anchor on the real component.
//
//   We mock the three module boundaries the panel reaches over:
//     - ../../lib/zk/circuits   (isVerifiedFullZk render guard)
//     - ../../lib/zk/provers    (PROVERS table, circuitTypeFor, proveInBrowser)
//     - ../../lib/enforcement-copy (REALITY_HEADLINE / REALITY_BODY honesty copy)
//   plus globalThis.fetch for the /api/oracle/verify-and-sign call.
//
//   We drive the state machine without a DOM by intercepting React.useState via
//   a vi.mock on 'react': the panel imports { useState } from 'react', so our
//   mocked module hands it a useState whose initial value can be overridden
//   per-call via a module-scope injection table. This is a no-new-deps strategy
//   (no jsdom, no @testing-library, no react-test-renderer) consistent with the
//   existing BuildStepsRail.test.jsx pattern.

// --- React useState override --------------------------------------------

// Injection table: index -> override value. The panel calls useState six times
// in source order (line 35 - 40): status, proofObj, publicSignals, oracleResult,
// errMsg, showSignals. Tests rewrite useStateOverrides before each render.
let useStateCallIdx = 0;
let useStateOverrides = [];

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useState: (initial) => {
      const idx = useStateCallIdx;
      useStateCallIdx += 1;
      const value =
        idx < useStateOverrides.length && useStateOverrides[idx] !== undefined
          ? useStateOverrides[idx]
          : initial;
      // Setter is a no-op for SSR; we never re-render from inside.
      return [value, () => {}];
    },
  };
});

// --- module mocks ---------------------------------------------------------

vi.mock('../../lib/zk/circuits', () => ({
  isVerifiedFullZk: (id) => id === 'merkle_membership',
}));

// Real proveInBrowser is async; the fake { proof, publicSignals } below is what
// the panel will set into state when handleProve resolves. PROVERS only needs
// the meta the panel reads (label, note); the prove function is exercised via
// proveInBrowser.
const FAKE_PROOF = {
  pi_a: ['0x01', '0x02'],
  pi_b: [['0x03', '0x04'], ['0x05', '0x06']],
  pi_c: ['0x07', '0x08'],
  protocol: 'groth16',
};
const FAKE_PUBLIC_SIGNALS = ['1', '42', '0xabcdef'];

const mockProveInBrowser = vi.fn();

vi.mock('../../lib/zk/provers', () => ({
  PROVERS: {
    merkle_membership: {
      prove: vi.fn(async () => ({ proof: FAKE_PROOF, publicSignals: FAKE_PUBLIC_SIGNALS })),
      circuitType: 'merkle_membership',
      label: 'Merkle Membership',
      note: 'Proves a secret leaf is in a committed set without revealing it.',
    },
  },
  circuitTypeFor: (id) => id,
  proveInBrowser: (...args) => mockProveInBrowser(...args),
}));

vi.mock('../../lib/enforcement-copy', () => ({
  REALITY_HEADLINE: {
    'full-zk': 'Zero-knowledge proof, verified off-chain',
  },
  REALITY_BODY: {
    'full-zk': 'Verified fail-closed off-chain by you, the counterparty, or any external verifier.',
  },
}));

// --- harness -------------------------------------------------------------

beforeEach(() => {
  useStateCallIdx = 0;
  useStateOverrides = [];
  mockProveInBrowser.mockReset();
  globalThis.fetch = vi.fn();
});

// Lazy import after mocks register.
async function importPanel() {
  const mod = await import('../ZkClaimPanel.jsx');
  return mod.default;
}

// A merkle_membership covenant the render guard will admit.
const COVENANT = {
  tx_id: 'abc123covenanttxid',
  custom_ui_config: { circuit: 'merkle_membership' },
};

function render(Panel, covenant = COVENANT) {
  useStateCallIdx = 0;
  return renderToStaticMarkup(React.createElement(Panel, { covenant }));
}

function renderWith(Panel, overrides) {
  // Call sequence the panel uses: status, proofObj, publicSignals,
  // oracleResult, errMsg, showSignals.
  useStateOverrides = [
    overrides.status ?? 'idle',
    overrides.proofObj ?? null,
    overrides.publicSignals ?? null,
    overrides.oracleResult ?? null,
    overrides.errMsg ?? '',
    true, // showSignals
  ];
  useStateCallIdx = 0;
  return renderToStaticMarkup(React.createElement(Panel, { covenant: COVENANT }));
}

// --- honesty-label helpers (load-bearing copy the panel must render exactly) -

// Source: ZkClaimPanel.jsx line ~110 + the success block ~250. These are the
// honesty-absolute labels the panel renders ONLY in the matching state. If any
// of these strings drift, the panel is overclaiming or underclaiming.
const HEADER_LABEL_ORACLE_VERIFIED = 'Off-chain ZK proof claim';
// No circuit is chain-enforced: every ZK circuit renders the full-zk
// (proof verified off-chain) reality, so the panel renders REALITY_BODY['full-zk'].
const VERIFIED_FAIL_CLOSED_BODY   = 'Verified fail-closed off-chain by you, the counterparty, or any external verifier.';
const SUCCESS_LABEL               = 'Proof verified off-chain and co-signed';
const REFUSED_LABEL               = 'Cosign refused';
const PROVING_BUTTON_TEXT         = 'Proving in your browser...';
const SUBMIT_BUTTON_TEXT          = 'Submit proof for 2-of-2 cosign';
const SUBMITTING_BUTTON_TEXT      = 'Verifying proof...';
const GENERATE_BUTTON_TEXT        = 'Generate proof in browser';

// --- initial-render tests ------------------------------------------------

describe('ZkClaimPanel', () => {
  it('hides the panel entirely when the circuit is not verified-full-zk', async () => {
    const Panel = await importPanel();
    const html = render(Panel, {
      tx_id: 'abc',
      custom_ui_config: { circuit: 'none' },
    });
    expect(html).toBe('');
  });

  it('renders the idle state with the honest reality label, NOT the success label', async () => {
    const Panel = await importPanel();
    const html = render(Panel);

    // Idle: the "Generate proof" CTA is visible.
    expect(html).toContain(GENERATE_BUTTON_TEXT);

    // The oracle-verified reality headline is present (this is the honest framing,
    // not "on-chain trustless" and not "chain-enforced").
    expect(html).toContain(HEADER_LABEL_ORACLE_VERIFIED);
    // The retired chain-enforced overclaim must never render.
    expect(html).not.toContain('Chain-enforced ZK claim');

    // The fail-closed verification body is rendered at idle (it is part of the
    // permanent honesty surface, NOT the success-only label).
    expect(html).toContain(VERIFIED_FAIL_CLOSED_BODY);

    // The success / refused outcome labels MUST NOT appear before the oracle
    // has actually responded.
    expect(html).not.toContain(SUCCESS_LABEL);
    expect(html).not.toContain(REFUSED_LABEL);

    // Submit-to-oracle button only renders after a proof exists.
    expect(html).not.toContain(SUBMIT_BUTTON_TEXT);
  });
});

// --- state-machine tests -------------------------------------------------

describe('ZkClaimPanel state machine', () => {
  it('idle -> proving: shows the in-browser proving CTA, no success label yet', async () => {
    const Panel = await importPanel();
    const html = renderWith(Panel, { status: 'proving' });
    expect(html).toContain(PROVING_BUTTON_TEXT);
    expect(html).not.toContain(SUCCESS_LABEL);
    expect(html).not.toContain(REFUSED_LABEL);
  });

  it('proving -> proved: renders the submit-to-oracle CTA and public signals, NOT the success label', async () => {
    const Panel = await importPanel();
    const html = renderWith(Panel, {
      status: 'proved',
      proofObj: FAKE_PROOF,
      publicSignals: FAKE_PUBLIC_SIGNALS,
    });
    expect(html).toContain(SUBMIT_BUTTON_TEXT);
    // Public signals from the fake proof are rendered for visitor inspection.
    expect(html).toContain('42');
    expect(html).toContain('0xabcdef');
    // The "verified and co-signed" honesty label MUST NOT appear yet - the proof
    // was generated, but the oracle has not verified it. Asserting this is the
    // load-bearing honesty check this test was created for.
    expect(html).not.toContain(SUCCESS_LABEL);
  });

  it('proved -> submitting: shows the oracle-verifying CTA, NOT the success label', async () => {
    const Panel = await importPanel();
    const html = renderWith(Panel, {
      status: 'submitting',
      proofObj: FAKE_PROOF,
      publicSignals: FAKE_PUBLIC_SIGNALS,
    });
    expect(html).toContain(SUBMITTING_BUTTON_TEXT);
    expect(html).not.toContain(SUCCESS_LABEL);
  });

  it('submitting -> done(success): renders the verified-and-co-signed label and the oracle signature', async () => {
    const Panel = await importPanel();
    const html = renderWith(Panel, {
      status: 'done',
      proofObj: FAKE_PROOF,
      publicSignals: FAKE_PUBLIC_SIGNALS,
      oracleResult: {
        success: true,
        signature: 'deadbeef00112233',
        message: 'signed-message-blob',
        outcome: 1,
        timestamp: 1700000000,
      },
    });
    // The honesty-positive label appears ONLY in the success terminal state.
    expect(html).toContain(SUCCESS_LABEL);
    // Honest framing: proof verified off-chain fail-closed (anyone can re-run it).
    expect(html).toContain('Groth16 proof was verified off-chain');
    expect(html).toContain('fail-closed');
    // The actual co-signature is surfaced.
    expect(html).toContain('deadbeef00112233');
    // The "trustless" / "on-chain ZK" honesty trap MUST NOT appear.
    expect(html).not.toMatch(/trustless/i);
    expect(html).not.toMatch(/on-chain (zero-knowledge|zk verifier)/i);
    // Covex must NOT be presented as the attester/verifier of the proof.
    expect(html).not.toMatch(/Covex oracle/i);
  });

  it('submitting -> done(refused): renders the fail-closed honest refusal copy, no co-signature', async () => {
    const Panel = await importPanel();
    const html = renderWith(Panel, {
      status: 'done',
      proofObj: FAKE_PROOF,
      publicSignals: FAKE_PUBLIC_SIGNALS,
      oracleResult: { success: false, error: 'invalid proof: tamper detected' },
    });
    expect(html).toContain(REFUSED_LABEL);
    // Honest body: tampered or invalid proof never gets a co-signature.
    expect(html).toContain('fail-closed path');
    expect(html).toContain('invalid proof: tamper detected');
    // No success copy, no fabricated signature.
    expect(html).not.toContain(SUCCESS_LABEL);
  });

  it('error path (prove failure): renders the honest "no proof produced" copy', async () => {
    const Panel = await importPanel();
    const html = renderWith(Panel, {
      status: 'error',
      errMsg:
        'In-browser proof generation failed: out of memory. No proof was produced; nothing fake is ever submitted.',
    });
    expect(html).toContain('In-browser proof generation failed');
    expect(html).toContain('nothing fake is ever submitted');
    expect(html).not.toContain(SUCCESS_LABEL);
  });

  it('error path (cosign network failure): renders the honest cosign-request-failed copy', async () => {
    const Panel = await importPanel();
    const html = renderWith(Panel, {
      status: 'error',
      proofObj: FAKE_PROOF,
      publicSignals: FAKE_PUBLIC_SIGNALS,
      errMsg: 'Cosign request failed: NetworkError',
    });
    expect(html).toContain('Cosign request failed');
    expect(html).not.toContain(SUCCESS_LABEL);
  });
});

// --- payload-builder tests -----------------------------------------------

// buildOraclePayload is the pure helper extracted from ZkClaimPanel.jsx that
// handleSubmit calls to construct the /api/oracle/verify-and-sign body. We
// import it from the SAME module as the component, so these assertions
// exercise the exact code the production submit path runs - not a mock.
//
// This replaced an earlier describe block whose tests called a mocked
// proveInBrowser / fetch with the args under test and then asserted those
// same args came back - tautological. The honesty surface (H4 covenant_id
// binding, documented payload shape, public_inputs serialized as strings)
// is now anchored to a real function.

describe('ZkClaimPanel buildOraclePayload (production helper)', () => {
  it('binds the payload to THIS covenant_id (H4): prevents cross-covenant replay', async () => {
    const { buildOraclePayload } = await import('../ZkClaimPanel.jsx');
    const payload = buildOraclePayload({
      covenantId: COVENANT.tx_id,
      circuitType: 'merkle_membership',
      proof: FAKE_PROOF,
      publicSignals: FAKE_PUBLIC_SIGNALS,
    });
    expect(payload.covenant_id).toBe(COVENANT.tx_id);
    // A different covenant id MUST produce a distinguishable payload, otherwise
    // H4 binding is decorative. We assert byte inequality of the serialized form
    // the panel actually sends over the wire.
    const otherPayload = buildOraclePayload({
      covenantId: 'a-completely-different-covenant-id',
      circuitType: 'merkle_membership',
      proof: FAKE_PROOF,
      publicSignals: FAKE_PUBLIC_SIGNALS,
    });
    expect(JSON.stringify(payload)).not.toBe(JSON.stringify(otherPayload));
  });

  it('emits the documented field set in the documented shape', async () => {
    const { buildOraclePayload } = await import('../ZkClaimPanel.jsx');
    const payload = buildOraclePayload({
      covenantId: COVENANT.tx_id,
      circuitType: 'merkle_membership',
      proof: FAKE_PROOF,
      publicSignals: FAKE_PUBLIC_SIGNALS,
    });
    // The four documented fields, no extras, no omissions.
    expect(Object.keys(payload).sort()).toEqual(
      ['circuit_type', 'covenant_id', 'proof', 'public_inputs'].sort(),
    );
    expect(payload.circuit_type).toBe('merkle_membership');
    expect(payload.proof).toEqual(FAKE_PROOF);
  });

  it('serializes public_inputs as STRINGS (the oracle expects decimal field elements as strings)', async () => {
    const { buildOraclePayload } = await import('../ZkClaimPanel.jsx');
    // Mixed input types - what snarkjs actually hands back: bigints, numbers, strings.
    const mixed = [1n, 42, '0xabcdef'];
    const payload = buildOraclePayload({
      covenantId: COVENANT.tx_id,
      circuitType: 'merkle_membership',
      proof: FAKE_PROOF,
      publicSignals: mixed,
    });
    expect(payload.public_inputs).toEqual(['1', '42', '0xabcdef']);
    // Each element must be a string - if any leaks as a bigint, JSON.stringify
    // will throw inside fetch and the submit path silently breaks.
    for (const s of payload.public_inputs) {
      expect(typeof s).toBe('string');
    }
  });

  it('does not fabricate a public_inputs array when none were produced', async () => {
    const { buildOraclePayload } = await import('../ZkClaimPanel.jsx');
    const payload = buildOraclePayload({
      covenantId: COVENANT.tx_id,
      circuitType: 'merkle_membership',
      proof: FAKE_PROOF,
      publicSignals: null,
    });
    expect(payload.public_inputs).toEqual([]);
    // The witness MUST NOT leak in here under any code path - the panel never
    // passes a witness to this helper; if a future refactor accidentally does,
    // this shape assertion narrows the blast radius.
    expect(payload).not.toHaveProperty('witness');
    expect(payload).not.toHaveProperty('secret');
  });
});
