import { describe, it, expect } from 'vitest';

// WalletContext statically imports the kasflow connector graph, which transitively pulls bare
// @onekeyfe/kaspa-wasm with no Node-resolvable entry. Stub the import graph exactly like the
// sibling WalletContext tests so the module loads; we only exercise the PURE, network-aware
// walletCovenantBadge helper here (no wasm, no wallet popup).
import { vi } from 'vitest';
vi.mock('@kasflow/wallet-connector/react', () => ({}));
vi.mock('@onekeyfe/kaspa-wasm', () => ({ default: () => {}, initSync: () => {} }));
vi.mock('@onekeyfe/kaspa-wasm/kaspa_bg.wasm.bin?url', () => ({ default: '' }));

const { walletCovenantBadge, ALL_WALLETS } = await import('../WalletContext.jsx');

// MOBILE REACH: walletsForDevice() hard-filters the picker by platform (mobile shows platform
// 'mobile' | 'both'; desktop shows 'desktop' | 'both'). OKX is the one listed wallet with a real
// mobile in-app dApp browser AND covenant signing, so it MUST be cross-platform ('both') or a phone
// user never sees the only wallet that completes an end-to-end mobile connect + sign. This pins that
// so a regression back to 'desktop' (which silently hid OKX on mobile) fails CI.
describe('OKX is cross-platform so mobile users can reach it', () => {
  const okx = ALL_WALLETS.find((w) => w.id === 'OKX');
  it('OKX is listed with a mobile deep link', () => {
    expect(okx).toBeTruthy();
    expect(okx.deepLink).toBeTruthy();
  });
  it("OKX platform is 'both' (surfaces on desktop AND mobile)", () => {
    expect(okx.platform).toBe('both');
  });
});

// GAP 5: the green "Signs covenants" badge OVERCLAIMED for Kastle on the default network.
// Kastle covenant signing is mainnet/TN10 only, but DEFAULT_NETWORK is testnet-12, so a first-time
// visitor saw Kastle promising covenant signing while every TN12 deploy/redeem would be refused.
// The badge is now computed per ACTIVE network via walletCovenantBadge(id, network): green only
// when the wallet can truly sign on that network; a muted "Mainnet / TN10 only" chip for Kastle on
// TN12. These pin that contract so a regression re-introducing the unconditional badge fails CI.
describe('walletCovenantBadge (network-aware covenant-sign badge)', () => {
  it('Kastle on TN12 does NOT get the green "Signs covenants" badge (the overclaim)', () => {
    const b = walletCovenantBadge('Kastle', 'testnet-12');
    expect(b.canSign).toBe(false);            // no green badge
    expect(b.networkLimited).toBe(true);      // shown as the muted chip instead
    expect(b.note).toMatch(/mainnet.*tn10|tn10.*mainnet/i);
  });

  it('Kastle on TN12 is network-limited even though DEFAULT_NETWORK is TN12', () => {
    // The default a brand-new visitor lands on must not flip the badge to green for Kastle.
    expect(walletCovenantBadge('Kastle', 'testnet-12').canSign).toBe(false);
  });

  it('Kastle on mainnet and TN10 DOES get the green badge', () => {
    expect(walletCovenantBadge('Kastle', 'mainnet')).toEqual({ canSign: true, networkLimited: false, note: null });
    expect(walletCovenantBadge('Kastle', 'mainnet-1').canSign).toBe(true);
    expect(walletCovenantBadge('Kastle', 'testnet-10').canSign).toBe(true);
  });

  it('KasWare / OKX / InApp (kasware family) sign covenants on every selectable network', () => {
    for (const net of ['mainnet', 'testnet-10', 'testnet-12']) {
      expect(walletCovenantBadge('KasWare', net).canSign).toBe(true);
      expect(walletCovenantBadge('OKX', net).canSign).toBe(true);
      expect(walletCovenantBadge('InApp', net).canSign).toBe(true);
    }
  });

  it('a wallet outside any signer family gets NO badge (neither green nor the limited chip)', () => {
    const b = walletCovenantBadge('Kaspium', 'testnet-12');
    expect(b).toEqual({ canSign: false, networkLimited: false, note: null });
  });
});
