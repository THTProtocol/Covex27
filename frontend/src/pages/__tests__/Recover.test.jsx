import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// Recover is the standalone, Covex-independent claim page: it signs every spend LOCALLY in the
// browser and never transmits a private key. WalletContext transitively pulls bare kaspa-wasm
// (unresolvable under vitest's node env), so mock it. We SSR-render (renderToStaticMarkup, the
// project's component-test pattern) and assert the load-bearing safety behaviors:
//   1. The page states the key-no-leak guarantee ("never transmits a private key", signs in-browser).
//   2. ClaimFlow for an OFFLINE-claimable kind (singlesig) enables Sign-and-broadcast / export.
//   3. ClaimFlow for an ORACLE kind (oracle_escrow, offlineClaimable:false) DISABLES the spend
//      actions: the winning payout needs the resolver co-signature, so a holder cannot be misled
//      into a non-custodial claim that cannot complete. This is the fail-closed routing.
//   4. The paste-key path on mainnet shows the real-risk warning; the key is used locally only.
//   5. No private key hex is ever rendered into the markup.

let walletState;
vi.mock('../../components/WalletContext', () => ({
  useWallet: () => walletState,
}));

const { default: Recover, ClaimFlow } = await import('../Recover.jsx');

function disconnectedWallet() {
  return { isDevMode: false, devMode: null, address: '' };
}

function renderRecover(wallet = disconnectedWallet()) {
  walletState = wallet;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/recover']}>
      <Recover />
    </MemoryRouter>,
  );
}

function renderClaimFlow(kit, wallet = disconnectedWallet(), utxos = null) {
  walletState = wallet;
  return renderToStaticMarkup(
    <MemoryRouter>
      <ClaimFlow kit={kit} utxos={utxos} />
    </MemoryRouter>,
  );
}

const SINGLESIG_KIT = {
  redeem_kind: 'singlesig',
  redeem_script_hex: '20aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899ac',
  address: 'kaspatest:qrsinglesig',
  network: 'testnet-10',
  tx_id: 'deadbeefcafebabe1234567890abcdef0000000000000000000000000000abcd:0',
};

const ORACLE_ESCROW_KIT = {
  redeem_kind: 'oracle_escrow',
  redeem_script_hex: '20aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899ac',
  address: 'kaspatest:qroracle',
  network: 'testnet-10',
  tx_id: 'feedface00000000000000000000000000000000000000000000000000001234:0',
};

const MAINNET_SINGLESIG_KIT = { ...SINGLESIG_KIT, network: 'mainnet', address: 'kaspa:qrmain' };

describe('Recover page - key-no-leak posture', () => {
  it('states the trustless / never-transmits-a-private-key guarantee', () => {
    const html = renderRecover();
    expect(html).toMatch(/never transmits a private key/i);
    expect(html).toMatch(/Chain-enforced, not Covex-enforced/);
    // Covex holds no USER keys claim is present (non-custodial posture). "user" is
    // the honest qualifier: Covex holds a co-sign key for legacy oracle/game-pot kinds.
    expect(html).toMatch(/holds no user keys/i);
  });

  it('never renders a raw private key hex string on the landing view', () => {
    const html = renderRecover();
    expect(html).not.toMatch(/\b[0-9a-f]{64}\b/i);
  });
});

describe('ClaimFlow - offline-claimable kind (singlesig) enables local spend', () => {
  it('offers Sign-and-broadcast and Sign-and-export, neither disabled for the oracle reason', () => {
    const html = renderClaimFlow(SINGLESIG_KIT);
    // Both action buttons render.
    expect(html).toMatch(/Sign &amp; broadcast/);
    expect(html).toMatch(/Sign &amp; export/);
    // The branch is offline-claimable, so the buttons are NOT disabled with the resolver title.
    expect(html).not.toContain('This branch needs the resolver co-signature');
  });

  it('the spend is signed locally - no private key leaves the page (no key hex in DOM)', () => {
    const html = renderClaimFlow(SINGLESIG_KIT);
    expect(html).not.toMatch(/\b[0-9a-f]{64}\b/i);
  });
});

describe('ClaimFlow - oracle kind (oracle_escrow) fails closed: spend disabled, resolver required', () => {
  it('disables the spend actions because the payout needs the resolver co-signature', () => {
    const html = renderClaimFlow(ORACLE_ESCROW_KIT);
    // The oracle branch is NOT offline-claimable, so the action buttons carry the resolver-needed
    // title and are disabled (oracleNeeded === true gates both broadcast and export).
    expect(html).toContain('This branch needs the resolver co-signature');
    // The disabled buttons must be present (a disabled <button>).
    const disabled = html.match(/<button[^>]*disabled[^>]*>/g) || [];
    expect(disabled.length).toBeGreaterThan(0);
  });

  it('still never leaks a key while routing the holder to the resolver-dependent path', () => {
    const html = renderClaimFlow(ORACLE_ESCROW_KIT);
    expect(html).not.toMatch(/\b[0-9a-f]{64}\b/i);
  });
});

describe('ClaimFlow - paste-key path is local-only and warns on mainnet', () => {
  it('shows the mainnet real-risk warning and the never-transmitted promise', () => {
    const html = renderClaimFlow(MAINNET_SINGLESIG_KIT);
    // The paste mode is the default when no in-browser dev key is loaded; the mainnet copy warns
    // the pasted key is used ONLY to sign locally, is never transmitted, and is cleared after.
    expect(html).toMatch(/used ONLY to sign locally/i);
    expect(html).toMatch(/never transmitted/i);
  });
});
