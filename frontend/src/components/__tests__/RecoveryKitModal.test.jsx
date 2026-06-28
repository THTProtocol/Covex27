import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import RecoveryKitModal from '../RecoveryKitModal.jsx';

// Regression guard for round 4's stale-claim fix. The old modal copy said claim
// support was "in the works"; in reality the in-browser redeemer ships and lives
// on /recover. The new modal links straight to it. This test pins:
//   1. The stale "in the works" string never reappears.
//   2. The "Open the recovery page" link is present and points to /recover with
//      the covenant's tx_id (outpoint suffix stripped, like RecoveryKitModal does).
//   3. The modal exposes the a11y contract the component's effect relies on:
//      role="dialog", aria-modal="true", aria-labelledby wired to the title id.
//   4. The component returns null (empty markup) when open=false, so the dialog
//      and its focus-trap effect are not mounted.
//
// Interactive Escape-closes + Tab focus-trap behavior is wired in a useEffect
// against window/document; React only runs effects in client renderers, so SSR
// here cannot fire keydown events. This project's vitest config uses the default
// `node` environment (no jsdom devDep), matching the existing component test
// pattern (BuildStepsRail.test.jsx). We assert the STRUCTURAL contract the
// handler depends on; live event tests would need jsdom, which is a deliberate
// non-dependency right now.

const COVENANT = {
  tx_id: 'deadbeefcafebabe1234567890abcdef:0',
  network: 'testnet-12',
  redeem_kind: 'hashlock',
  address: 'kaspatest:qrsomethingsomething',
  redeem_script_hex: '20aaaabbbbccccdddd',
  script_hash: '00112233',
  receiving_addresses: ['kaspatest:qrwinner'],
  lock_daa: 12345,
};

function renderModal(props) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RecoveryKitModal {...props} />
    </MemoryRouter>
  );
}

describe('RecoveryKitModal', () => {
  it('never renders the stale "in the works" claim copy', () => {
    const html = renderModal({ open: true, onClose: () => {}, covenant: COVENANT });
    // Case-insensitive guard so a sentence-cased reintroduction still trips it.
    expect(html.toLowerCase()).not.toContain('in the works');
  });

  it('renders the "Open the recovery page" link pointing at /recover with the tx_id (outpoint stripped)', () => {
    const html = renderModal({ open: true, onClose: () => {}, covenant: COVENANT });
    // Link text is present.
    expect(html).toContain('Open the recovery page');
    // The Link's href on /recover carries the bare tx id (no :0 suffix). The
    // modal calls encodeURIComponent on the value, so a hex tx id round-trips
    // unchanged. The ? gets HTML-escaped to &#x3f; by react-dom/server, so
    // match on the route + id rather than the raw query string.
    expect(html).toMatch(/href="\/recover[^"]*id[^"]*=deadbeefcafebabe1234567890abcdef"/);
    // And the stale :0 outpoint MUST NOT appear in the recover link.
    expect(html).not.toMatch(/\/recover[^"]*deadbeefcafebabe1234567890abcdef(?:%3A|:)0/);
  });

  it('falls back to a plain /recover link when the covenant has no tx_id', () => {
    const html = renderModal({
      open: true,
      onClose: () => {},
      covenant: { ...COVENANT, tx_id: null },
    });
    expect(html).toMatch(/href="\/recover"/);
  });

  it('exposes the dialog a11y contract: role, aria-modal, aria-labelledby', () => {
    const html = renderModal({ open: true, onClose: () => {}, covenant: COVENANT });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    // aria-labelledby points at an actual id rendered on the heading. The
    // component uses the literal id "recovery-kit-title".
    expect(html).toMatch(/aria-labelledby="recovery-kit-title"/);
    expect(html).toMatch(/id="recovery-kit-title"[^>]*>\s*Recover without Covex/);
  });

  it('renders a labelled close button (target of the Escape onClose path)', () => {
    const html = renderModal({ open: true, onClose: () => {}, covenant: COVENANT });
    // Close affordance is reachable by name; the same onClose is what the
    // Escape-key handler in the useEffect calls.
    expect(html).toMatch(/aria-label="Close"/);
  });

  it('renders nothing when open=false (no dialog, no focus-trap effect mounted)', () => {
    const html = renderModal({ open: false, onClose: () => {}, covenant: COVENANT });
    expect(html).toBe('');
  });

  it('renders nothing when covenant is missing', () => {
    const html = renderModal({ open: true, onClose: () => {}, covenant: null });
    expect(html).toBe('');
  });

  it('shows the redeem-script-missing notice (and hides the download button) when redeem_script_hex is absent', () => {
    const html = renderModal({
      open: true,
      onClose: () => {},
      covenant: { ...COVENANT, redeem_script_hex: null },
    });
    expect(html).toContain('not on record yet');
    expect(html).not.toContain('Download recovery kit');
  });
});
