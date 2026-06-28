import { createContext, useContext, useCallback, useState, useEffect, useRef, Suspense, lazy } from 'react';
import {
  signWithKasware,
  signWithKastle,
  signDeployWithWallet,
  COVEX_TO_KASWARE_NETWORK,
  COVEX_TO_KASTLE_NETWORK,
  normalizeNetworkId,
} from '../lib/redeemer/walletSigner';
// NOTE: kaspa-wasm (the ~15.6MB @onekeyfe/kaspa-wasm module + its ~11.5MB binary) is loaded
// LAZILY inside loadKaspaWasm() below, never at module-eval time. WalletProvider wraps the
// whole app (App.jsx), so any STATIC import of the wasm here (the module OR its `?url` binary)
// would pull the multi-MB vendor-kaspa-wasm chunk into the entry bundle and modulepreload it on
// every visit. Keeping BOTH imports dynamic (inside loadKaspaWasm) means the wasm is fetched only
// on first wallet/signing use, and the binary is emitted once (no eager preload, no double-ship).
//
// @kasflow/wallet-connector/react is also loaded LAZILY (see KasFlowBoundary below). Its
// dependency @kasflow/passkey-wallet STATICALLY imports @onekeyfe/kaspa-wasm, so a static import
// of the connector here would drag the whole vendor-kaspa-wasm chunk back into the entry bundle
// (and re-trigger the eager modulepreload) even though our own code never touches the wasm at
// boot. Deferring the connector import keeps WalletProvider mountable with zero wasm in the entry.

const WalletContext = createContext(null);

// ── Network-aware helpers ──
// The user picks the active network (Mainnet / Testnet-10 / Testnet-12) from the nav switcher,
// which writes localStorage('kaspaNetwork') and dispatches 'kaspa-network-change'.
//
// DEFAULT_NETWORK is the network a BRAND-NEW visitor (no stored choice) lands on. Mainnet does not
// index any covenants or events until the Toccata launch, so defaulting a first-time visitor to
// 'mainnet' shows a dead-looking, all-zero view. Testnet-12 has 14,000+ live covenants right now,
// so a newcomer immediately sees real, thriving activity. Mainnet stays fully selectable and remains
// the brand / identity network - this only changes the unset default, never hides mainnet.
export const DEFAULT_NETWORK = 'testnet-12';

export function getCurrentNetwork() {
  if (typeof window === 'undefined') return DEFAULT_NETWORK;
  const stored = localStorage.getItem('kaspaNetwork');
  if (stored) return stored;
  // Seed the default on first read so every consumer (Explorer, ticker, stats, Pricing, wallet)
  // agrees on the same network for the rest of the session. Tolerate private-mode write failures.
  try { localStorage.setItem('kaspaNetwork', DEFAULT_NETWORK); } catch { /* private mode */ }
  return DEFAULT_NETWORK;
}

export function onNetworkChange(fn) {
  const handler = (e) => {
    const net = e?.detail || getCurrentNetwork();
    fn(net);
  };
  window.addEventListener('kaspa-network-change', handler);
  // Also listen to regular storage changes (for other tabs)
  const storageHandler = () => {
    const net = getCurrentNetwork();
    fn(net);
  };
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener('kaspa-network-change', handler);
    window.removeEventListener('storage', storageHandler);
  };
}

const NETWORK_LABELS = {
  'testnet-12': 'TN12 (Toccata)',
  'testnet-10': 'TN10',
  'mainnet': 'MAINNET',
  'mainnet-1': 'MAINNET',
};

function getDevStorageKey(net) {
  const safe = String(net || 'mainnet').replace(/[^a-z0-9_-]/gi, '_');
  return `covex_dev_wallet_${safe}`;
}

// ── Wallet logos from Chrome Web Store CDN (pattern from THTProtocol/27) ──
const WALLET_LOGOS = {
  KasWare:  'https://lh3.googleusercontent.com/GWR2Bode3QAzDrsZJHVRsYhCN60azRCtL1xoOBxqCYcDpbMD_avwiFkuiAOAkuyLnEh9DGOAoZSbWDcNUhiZ7X6RZE8=s128',
  Kastle:   'https://lh3.googleusercontent.com/byDg7ykj9UUJRur0v8jFr9orcj7N1_M6LuqtwnJxlnVNk4GV0JrhFmS0Xp0U9QRgxGZa4wf7-8M29v7kfEBc-Ha9kg=s128',
  Kasperia: 'https://lh3.googleusercontent.com/b08QPuruZqIwLRmpcTrN54hmxY6YEQgVKS4y1s7LAYiIulTlZAaxvsWRUK2SIivLecsxgoCuoH66jNLnQLzjMWXtFr0=s128',
  OKX:      'https://lh3.googleusercontent.com/2bBevW79q6gRZTFdm42CzUetuEKndq4fn41HQGknMpKMF_d-Ae2sJJzgfFUAVb1bJKCBb4ptZ9EAPp-QhWYIvc35yw=s128',
  // Higher-res, reliable logos via Google's favicon service (sz=128) for wallets without a
  // Chrome Web Store CDN image. Falls back to a letter avatar (WalletButton onError) if any
  // fail, so a bad URL never shows a broken image.
  Kasanova: 'https://www.google.com/s2/favicons?domain=kasanova.app&sz=128',
  Kaspium:  'https://www.google.com/s2/favicons?domain=kaspium.io&sz=128',
  KaspaCom: 'https://www.google.com/s2/favicons?domain=wallet.kaspa.com&sz=128',
  Tangem:   'https://www.google.com/s2/favicons?domain=tangem.com&sz=128',
  OneKey:   'https://www.google.com/s2/favicons?domain=onekey.so&sz=128',
  KSPR:     'https://www.google.com/s2/favicons?domain=kspr.app&sz=128',
};

const WALLET_INSTALL_URLS = {
  KasWare:  'https://chromewebstore.google.com/detail/kasware-wallet/hklhheigdmpoolooomdihmhlpjjdbklf',
  Kastle:   'https://chromewebstore.google.com/detail/kastle/oambclflhjfppdmkghokjmpppmaebego',
  Kasperia: 'https://chromewebstore.google.com/detail/kasperia/ffalcabgggegkejjlknofllbaledgcob',
  OKX:      'https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge',
  Kasanova: 'https://kasanova.app',
  Kaspium:  'https://kaspium.io',
  KaspaCom: 'https://wallet.kaspa.com',
  Tangem:   'https://tangem.com/kaspa',
  OneKey:   'https://chromewebstore.google.com/detail/onekey/jnmbobjmhlngoefaiojfljckilhhlhcj',
  KSPR:     'https://t.me/kspr_wallet_bot',
};

// ── Per-wallet mobile deep links (open the INSTALLED app, ideally into its in-app dApp
// browser pointed at hightable.pro when the wallet supports one). On a phone with the app
// installed these foreground the wallet; if it is NOT installed the connect flow falls back
// to the store after a real timeout (see connect()). These are best-effort universal/app
// links per each wallet's public docs; the exact scheme still needs on-device confirmation
// (flagged in device_test_needed) since vendors change them without notice.
const SITE_URL = 'https://hightable.pro';
const WALLET_DEEP_LINKS = {
  // Kasanova exposes an in-app dApp browser; its universal link opens the app to a URL.
  Kasanova: `https://kasanova.app/dapp?url=${encodeURIComponent(SITE_URL)}`,
  // Kaspium is a native wallet; open the app via its universal link. It does not inject a
  // provider in a normal mobile browser, so this is the honest "open the app" path.
  Kaspium:  `https://kaspium.io/`,
  // OKX has a documented dApp deep link that opens its in-app browser at a target dApp URL.
  OKX:      `https://www.okx.com/download?deeplink=${encodeURIComponent('okx://wallet/dapp/url?dappUrl=' + SITE_URL)}`,
  // Kaspa.com web wallet runs in the browser; open it directly.
  KaspaCom: 'https://wallet.kaspa.com',
  // Tangem is card+app; deep link opens the app. No injected provider in mobile browser.
  Tangem:   'https://app.tangem.com/',
  // KSPR has a mobile app with an in-app browser.
  KSPR:     `https://t.me/kspr_wallet_bot`,
};

// Wallets that, in a NORMAL mobile browser, do NOT inject a Kaspa provider and have NO real
// WalletConnect transport wired in this codebase (we ship only @kasflow/wallet-connector's
// kaswareAdapter, which is the KasWare browser extension - there is no Kaspa WC pairing dep).
// For these we present an honest "Open in the <wallet> app" deep link instead of faking a
// connect. Each such wallet carries nativeOnly: true on its ALL_WALLETS entry so the connect
// flow labels the action accurately after the app foregrounds.

// Does an object look like a Kaspa wallet provider (an accounts method AND a send/sign method)?
// Used ONLY to validate a specific wallet's own resolved global before connecting to it. There
// is deliberately no generic "find any provider" scan: that connected whatever wallet happened
// to be installed (e.g. KasWare) when you clicked a different one.
function looksLikeKaspaProvider(obj) {
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return false;
  const hasAccounts = typeof obj.requestAccounts === 'function'
    || typeof obj.getAccounts === 'function'
    || typeof obj.getAccount === 'function'
    || typeof obj.connect === 'function'
    || typeof obj.getAddresses === 'function';
  const hasTx = typeof obj.sendKaspa === 'function'
    || typeof obj.signTransaction === 'function'
    || typeof obj.sendTransaction === 'function'
    || typeof obj.signMessage === 'function'
    || typeof obj.request === 'function';
  return hasAccounts && hasTx;
}

// ── Provider resolution: resolve a SPECIFIC wallet from its own known global(s) only. Returns
// the live provider handle (or null). No cross-wallet fallback. Pure lookup so detection can
// re-run on demand (injection can be late).
function getProvider(name) {
  if (typeof window === 'undefined') return null;
  const w = window;
  let p;
  switch (name) {
    case 'KasWare':  p = w.kasware || w.kasWare; break;
    case 'Kastle':   p = w.kastle; break;
    case 'Kasperia': p = w.kasperia; break;
    case 'OKX':      p = (w.okxwallet && w.okxwallet.kaspa) || null; break;
    // Kasanova injects under several shapes across versions / its in-app browser: a nested
    // .kasware, a flat object with requestAccounts, window.kasware, window.kaspa, or even a
    // top-level requestAccounts on window. Accept all, then fall through to the probe.
    case 'Kasanova':
      p = (w.kasanova && (w.kasanova.kasware || (typeof w.kasanova.requestAccounts === 'function' ? w.kasanova : null)))
        || (looksLikeKaspaProvider(w.kasanova) ? w.kasanova : null)
        || (looksLikeKaspaProvider(w.kasware) ? w.kasware : null)
        || (looksLikeKaspaProvider(w.kaspa) ? w.kaspa : null)
        || (typeof w.requestAccounts === 'function' ? w : null);
      break;
    case 'Kaspium':  p = w.kaspium || w.KaspiumWallet || null; break;
    case 'KaspaCom': p = w.kaspacom || (w.kaspa && typeof w.kaspa.connect === 'function' ? w.kaspa : null); break;
    case 'Tangem':   p = w.tangem || w.tangemWallet || null; break;
    case 'OneKey':   p = (w.$onekey && w.$onekey.kaspa) || w.onekeyKaspa || null; break;
    case 'KSPR':     p = w.kspr || w.ksprwallet || (w.kspr && w.kspr.kaspa) || null; break;
    default:         p = null;
  }
  if (p && looksLikeKaspaProvider(p)) return p;
  // Some explicit shapes (e.g. Kasanova nested) are valid providers even if the loose probe
  // is conservative; return them when present, else try the generic probe as the safety net.
  if (p) return p;
  return null;
}

// ── Detection: a wallet is "installed/available" only if ITS OWN provider resolves. Strict
// per-wallet (no cross-wallet probe), so clicking one wallet never reports a different installed
// wallet as this one. Re-runnable on demand since extensions can inject late.
function detectWallet(name) {
  if (typeof window === 'undefined') return false;
  return !!getProvider(name);
}

// MOBILE ONLY: inside a wallet app's in-app dApp browser there is exactly ONE injected provider
// (the wallet you are browsing in), so a generic scan is safe here and lets ANY Kaspa mobile
// wallet connect. This is NEVER used on desktop, where multiple installed extensions would make
// a generic scan ambiguous (that ambiguity was the bug that connected KasWare for everything).
function mobileProviderProbe() {
  if (typeof window === 'undefined') return null;
  const w = window;
  for (const c of [w.kaspa, w.kasware, w.kastle, w.kasanova, w.kaspium, w.kspr, w.ksprwallet]) {
    if (looksLikeKaspaProvider(c)) return c;
    if (c && typeof c === 'object' && looksLikeKaspaProvider(c.kaspa)) return c.kaspa;
  }
  try {
    for (const key of Object.keys(w)) {
      if (!/kasp|kas|wallet|kspr/i.test(key)) continue;
      let v; try { v = w[key]; } catch { continue; }
      if (looksLikeKaspaProvider(v)) return v;
    }
  } catch { /* best-effort; failure is non-fatal here */ }
  return null;
}

// ── Wallet covenant-signing capability map ──
// Which connected wallets can sign a covenant deploy/redeem (the BIP340-Schnorr-over-each-
// input-sighash primitive) via a popup, and which signer family they belong to.
//   'kasware' => signPskt path (KasWare + OKX, which is KasWare-compatible)
//   'kastle'  => signTx(networkId, txJson, scripts) path
// The mobile in-app provider ('InApp') is resolved through the same probe; we treat it as the
// kasware family because the in-app wallets that inject a signing provider (KasWare/OKX) expose
// signPskt. A wallet whose live provider lacks the family's signing method still fails closed at
// sign time (signWithKasware/signWithKastle throw an honest error).
const COVENANT_SIGNER_FAMILY = Object.freeze({
  KasWare: 'kasware',
  OKX: 'kasware',
  Kastle: 'kastle',
  InApp: 'kasware',
});

// ── KAS → sompi conversion (BigInt-safe, no float precision loss) ──
function kasToSompi(amountKas) {
  const [whole = '0', frac = ''] = String(amountKas).split('.');
  const paddedFrac = (frac + '00000000').slice(0, 8);
  return BigInt(whole) * 100_000_000n + BigInt(paddedFrac);
}

function isMobile() { return typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent); }

// ── All wallets unified ──
// `platform` is now a SORT PRIORITY, not a hard exclusion: the picker always lists every
// wallet, ordered so the platform-appropriate ones come first. `deepLink` (mobile open-app
// link) and `nativeOnly` (no injected provider + no real WC, so honest "open the app") drive
// the per-platform primary action chosen in connect() and labeled in the UI.
// Only wallets with a REAL, working Kaspa dApp-connect provider and a real logo are listed, so
// every wallet shown actually connects + signs (no dead options). KasWare and Kastle are the two
// genuinely Dapp-Ready Kaspa wallets (window.kasware / window.kastle, confirmed in their docs).
// HONESTY NOTE on mobile (verified 2026-06-19 against docs.kasware.xyz and docs.kastle.cc):
//   - KasWare: Chrome extension (+ an Android APK), but NO documented in-app dApp browser and
//     NO deep/universal link to open a dApp URL. So it is desktop-extension-only here; on a
//     phone it honestly shows "Install" (no fake mobile connect, no fabricated deep link).
//   - Kastle: injects window.kastle on desktop. Its mobile app's in-app dApp browser is
//     explicitly "coming soon" per the Kastle FAQ, NOT available yet, and there is no published
//     deep link to open a dApp inside it. So Kastle is treated as a desktop wallet (no mobile
//     deepLink); its `sub` no longer implies a working mobile dApp connect. Re-enable a mobile
//     Kastle path only once the in-app browser ships and a deep link is documented.
// Wallets without a confirmed dApp provider (Kasperia extension, Tangem mobile-native) were
// removed rather than shown as broken. Add a wallet here only once its injected global + dApp
// connect (or, for mobile, its in-app browser deep link) are verified.
// `canSignCovenants` flags a wallet whose injected provider exposes the covenant-signing
// primitive (signPskt for the KasWare family, signTx for Kastle), so the picker can show a
// "Can sign covenants" badge. It is a CAPABILITY ADVERTISEMENT, not a proof: the actual sign
// path is fail-closed (walletSigner verifies the returned signature), and Kastle's covenant
// signing is network-limited (mainnet + TN10 only), surfaced honestly at sign time.
const ALL_WALLETS = [
  { id: 'KasWare', name: 'KasWare Wallet', url: WALLET_INSTALL_URLS.KasWare, logo: WALLET_LOGOS.KasWare, sub: 'Chrome · Firefox', platform: 'desktop', detect: () => detectWallet('KasWare'), provider: () => getProvider('KasWare'), recommended: true, canSignCovenants: true },
  // Kastle injects window.kastle in its desktop extension. Mobile in-app browser is "coming
  // soon" (docs.kastle.cc FAQ), so we do NOT advertise a mobile dApp connect or a deep link;
  // desktop platform keeps it honest. `sub` reflects the desktop extension only.
  { id: 'Kastle', name: 'Kastle', url: WALLET_INSTALL_URLS.Kastle, logo: WALLET_LOGOS.Kastle, sub: 'Chrome extension', platform: 'desktop', detect: () => detectWallet('Kastle'), provider: () => getProvider('Kastle'), canSignCovenants: true },
  // OKX is KasWare-compatible (window.okxwallet.kaspa exposes signPskt), so it can sign covenant
  // deploy/redeem the same way. Desktop extension + a mobile in-app dApp browser (deep link).
  { id: 'OKX', name: 'OKX Wallet', url: WALLET_INSTALL_URLS.OKX, logo: WALLET_LOGOS.OKX, sub: 'Chrome · iOS · Android', platform: 'desktop', deepLink: WALLET_DEEP_LINKS.OKX, detect: () => detectWallet('OKX'), provider: () => getProvider('OKX'), canSignCovenants: true },
  // Mobile-app wallets with an in-app dApp browser. On mobile these show "Open in <app>" (a
  // universal link that launches the app to Covex); once you are inside that app's browser, the
  // injected provider is detected and the synthetic "Your Kaspa wallet" entry (added in
  // walletsForDevice) connects it in one tap. openOnly => never probe-connect, so no desktop leak.
  { id: 'Kasanova', name: 'Kasanova', url: WALLET_INSTALL_URLS.Kasanova, logo: WALLET_LOGOS.Kasanova, sub: 'iOS · Android', platform: 'mobile', deepLink: WALLET_DEEP_LINKS.Kasanova, openOnly: true, detect: () => false, provider: () => null },
  { id: 'KSPR', name: 'KSPR Wallet', url: WALLET_INSTALL_URLS.KSPR, logo: WALLET_LOGOS.KSPR, sub: 'iOS · Android', platform: 'mobile', deepLink: WALLET_DEEP_LINKS.KSPR, openOnly: true, detect: () => false, provider: () => null },
  // Kaspium is a native wallet with no in-app dApp browser that injects a Kaspa provider, so
  // opening it cannot complete an in-page connect here. nativeOnly => after the app foregrounds
  // we say so honestly (no fake "connected") instead of leaving a silent dead-end.
  { id: 'Kaspium', name: 'Kaspium', url: WALLET_INSTALL_URLS.Kaspium, logo: WALLET_LOGOS.Kaspium, sub: 'iOS · Android', platform: 'mobile', deepLink: WALLET_DEEP_LINKS.Kaspium, openOnly: true, nativeOnly: true, detect: () => false, provider: () => null },
];

// Order every wallet by platform fit for the CURRENT device (priority, never exclusion), so
// the picker shows them all with the most relevant ones first.
function walletsForDevice() {
  const mobile = isMobile();
  // Do NOT mix mobile-app wallets with desktop extensions: show only the wallets that can
  // actually connect on THIS device. Desktop shows extensions (plus cross-platform); mobile
  // shows app wallets (plus cross-platform). Recommended first.
  const fit = (w) => w.platform === 'both' || w.platform === (mobile ? 'mobile' : 'desktop');
  const list = ALL_WALLETS.filter(fit).sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
  // On mobile, if we are already inside a wallet app's in-app browser (a provider is injected),
  // surface a one-tap "Connect" for whichever wallet that is. Safe on mobile (single provider).
  if (mobile && mobileProviderProbe()) {
    list.unshift({ id: 'InApp', name: 'Your Kaspa wallet', sub: 'In-app browser', logo: '', platform: 'mobile', recommended: true, detect: () => true, provider: () => mobileProviderProbe(), canSignCovenants: true });
  }
  return list;
}

// Decide the HONEST primary action label/kind for a wallet on the current device. The UI uses
// this so every row reads accurately: a detected wallet says "Connect", an installed-app path
// says "Open in <wallet>", and an uninstalled extension says "Install".
//   kind: 'connect' (provider present, one click) | 'open' (mobile deep-link to the app)
//       | 'install' (open the store / install page)
function walletPrimaryAction(wallet) {
  if (!wallet) return { kind: 'install', label: 'Install' };
  let installed;
  try { installed = wallet.detect ? wallet.detect() : false; } catch { installed = false; }
  if (installed) return { kind: 'connect', label: 'Connect' };
  if (isMobile() && wallet.deepLink) {
    return { kind: 'open', label: `Open in ${wallet.name.replace(/ Wallet$/, '')}` };
  }
  return { kind: 'install', label: `Install ${wallet.name.replace(/ Wallet$/, '')}` };
}

let _wasmModuleCtx = null;
let _wasmInitPromise = null;

export async function loadKaspaWasm() {
  if (_wasmModuleCtx) return _wasmModuleCtx;
  if (_wasmInitPromise) return _wasmInitPromise;

  _wasmInitPromise = (async () => {
    try {
      // Both the wasm module AND its binary URL are imported HERE (dynamically) so neither is
      // pulled into the entry chunk. The `?url` import resolves to the hashed asset URL at runtime;
      // it is bundled into the same lazily-loaded vendor-kaspa-wasm chunk as the module itself.
      const [mod, urlMod] = await Promise.all([
        import('@onekeyfe/kaspa-wasm'),
        import('@onekeyfe/kaspa-wasm/kaspa_bg.wasm.bin?url'),
      ]);
      const wasmBinaryUrl = urlMod?.default || null;
      // initSync needs a compiled WebAssembly module directly. This is the ONLY working init path
      // in a Vite browser bundle: default()/__wbg_init internally does require("./kaspa_bg.wasm.js")
      // (a CJS require that fails in the browser), AND that 15.3MB glue is aliased to an empty stub
      // in vite.config.js to kill the double-ship of the wasm. So we fetch the `?url` binary, compile
      // it, and initSync the module - never default(). The module namespace (mod) carries the
      // Mnemonic/XPrv/PrivateKey classes regardless of how the wasm global was initialized.
      if (typeof mod.initSync === 'function' && wasmBinaryUrl) {
        const resp = await fetch(wasmBinaryUrl);
        if (!resp.ok) throw new Error(`kaspa-wasm binary fetch failed: ${resp.status}`);
        const bytes = await resp.arrayBuffer();
        const compiled = await WebAssembly.compile(bytes);
        mod.initSync(compiled);
        _wasmModuleCtx = mod;
        return _wasmModuleCtx;
      }
      throw new Error('kaspa-wasm initSync or binary URL unavailable');
    } catch {
      // console.error('Failed to load kaspa-wasm:', e); // cleaned for prod
      _wasmInitPromise = null;
      return null;
    }
  })();

  return _wasmInitPromise;
}

export async function deriveFromMnemonic(phrase, networkId = 'mainnet') {
  const wasm = await loadKaspaWasm();
  if (!wasm) throw new Error('kaspa-wasm module failed to load');

  const { Mnemonic, XPrv } = wasm;

  const mnemonic = new Mnemonic(phrase);
  const seed = mnemonic.toSeed('');
  const xprv = new XPrv(seed);
  const derived = xprv.derivePath("m/44'/111111'/0'/0/0");
  const privateKeyHex = derived.toPrivateKey().toString();
  // The wasm module expects 'kaspa' (mainnet) or 'testnet' strings, NOT 'kaspatest'.
  const addrNetwork = (networkId && (String(networkId).includes('main') || String(networkId) === 'kaspa')) ? 'kaspa' : 'testnet';
  let address = derived.toPrivateKey().toAddress(addrNetwork);
  const addressStr = address.toString();
  mnemonic.free();
  xprv.free();
  derived.free();
  return { privateKeyHex, address: addressStr };
}

export async function deriveFromPrivateKey(hexKey, networkId = 'mainnet') {
  const wasm = await loadKaspaWasm();
  if (!wasm) throw new Error('kaspa-wasm module failed to load');

  const { PrivateKey } = wasm;
  const cleanHex = hexKey.replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    throw new Error('Invalid private key hex. Must be 64 hex characters (32 bytes).');
  }
  const pk = new PrivateKey(cleanHex);
  // The wasm module expects 'kaspa' (mainnet) or 'testnet' strings, NOT 'kaspatest'.
  const addrNetwork = (networkId && (String(networkId).includes('main') || String(networkId) === 'kaspa')) ? 'kaspa' : 'testnet';
  let address = pk.toAddress(addrNetwork);
  const addressStr = address.toString();
  pk.free();
  return { privateKeyHex: cleanHex, address: addressStr };
}

// Sign a message with a dev wallet's private key using the wasm TOP-LEVEL
// signMessage. PrivateKey has NO signMessage instance method, so any path that
// reached pk.toString() would return the RAW PRIVATE KEY hex. The key must never
// leave the browser, so there is deliberately no toString() fallback here:
// missing wasm support throws, and the PrivateKey is always freed.
export function signMessageWithWasm(wasm, privateKeyHex, message) {
  if (!wasm) throw new Error('kaspa-wasm module failed to load');
  const { PrivateKey, signMessage: wasmSignMessage } = wasm;
  if (typeof wasmSignMessage !== 'function') throw new Error('kaspa-wasm signMessage unavailable');
  const pk = new PrivateKey(privateKeyHex);
  try {
    return wasmSignMessage({ message, privateKey: pk });
  } finally {
    pk.free();
  }
}

// ── Dev Connect Panel (internal, takes onConnect prop + network) ──
function DevConnectPanelBase({ onConnect, compact = false, network }) {
  const [mode, setMode] = useState('mnemonic');
  const [phrase, setPhrase] = useState('');
  const [hexKey, setHexKey] = useState('');
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState(null);

  const netLabel = NETWORK_LABELS[network] || network;

  const handleDerive = useCallback(async () => {
    setDeriving(true);
    setError(null);
    try {
      let result;
      if (mode === 'hex') {
        const cleanHex = hexKey.trim().replace(/^0x/i, '');
        if (!cleanHex) throw new Error('Enter a 64-character hex private key');
        result = await deriveFromPrivateKey(cleanHex, network);
        onConnect({ type: 'hex', privateKeyHex: result.privateKeyHex, address: result.address });
      } else {
        const trimmed = phrase.trim();
        if (!trimmed) throw new Error('Enter a 12 or 24 word mnemonic phrase');
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        if (wordCount !== 12 && wordCount !== 24) throw new Error('Mnemonic must be 12 or 24 words');
        result = await deriveFromMnemonic(trimmed, network);
        onConnect({ type: 'mnemonic', phrase: trimmed, privateKeyHex: result.privateKeyHex, address: result.address });
      }
    } catch (err) {
      // console.error('Dev derivation error (panel):', err); // cleaned for prod
      setError(err.message || 'Derivation failed');
    } finally {
      setDeriving(false);
    }
  }, [mode, phrase, hexKey, onConnect, network]);

  const isMainnet = network === 'mainnet' || network === 'mainnet-1';
  // Static literal class strings (Tailwind v4 PURGES interpolated `${x}-600/30` classes,
  // so the panel + Connect CTA rendered unstyled). Only two accents exist.
  const A = isMainnet
    ? { wrap: 'border-red-600/30 bg-red-600/[0.04] light:border-red-200 light:bg-red-50', dot: 'bg-red-500', label: 'text-red-400', tabOn: 'bg-red-600/20 text-red-400', btn: 'bg-red-600/80 hover:bg-red-600' }
    : { wrap: 'border-yellow-600/30 bg-yellow-600/[0.04] light:border-yellow-200 light:bg-yellow-50', dot: 'bg-yellow-500', label: 'text-yellow-400', tabOn: 'bg-yellow-600/20 text-yellow-400', btn: 'bg-yellow-600/80 hover:bg-yellow-600' };
  if (isMainnet) {
    return (
      <div className={`rounded-xl border border-kaspa-green/20 bg-kaspa-green/[0.04] light:border-kaspa-green/40 light:bg-kaspa-green/[0.06] ${compact ? 'p-4' : 'p-5'}`} data-covex="dev-connect-panel">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-white light:text-slate-900">Connect your wallet to continue</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-red-300 light:text-red-600 bg-red-500/10 light:bg-red-50 border border-red-500/25 light:border-red-200 px-1.5 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Mainnet</span>
        </div>
        <p className="text-xs text-gray-300 light:text-slate-600 leading-relaxed">
          Tap <span className="text-kaspa-green font-semibold">Connect Wallet</span> in the top bar to connect a Kaspa wallet extension in one click, or create a brand-new wallet right there. Non-custodial: your keys never leave your wallet, and all mainnet activity uses your own real KAS.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${A.wrap} ${compact ? 'p-4' : 'p-5'}`} data-covex="dev-connect-panel">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2.5 h-2.5 rounded-full ${A.dot} animate-pulse`} />
        <span className={`text-xs font-mono ${A.label} uppercase tracking-wider`}>{netLabel} Dev Connect</span>
      </div>
      <p className="text-xs text-gray-300 light:text-slate-600 mb-3 leading-relaxed">
        Connect via mnemonic or hex private key. Keys are derived locally and never leave your browser.
      </p>
      <>
        <div className="flex rounded-lg bg-black/40 border border-white/[0.06] light:bg-slate-100 light:border-slate-200 mb-3 overflow-hidden">
          <button
            onClick={() => { setMode('mnemonic'); setError(null); }}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${
              mode === 'mnemonic' ? A.tabOn : 'text-gray-300 light:text-slate-500 hover:text-white light:hover:text-slate-800'
            }`}
          >Mnemonic</button>
          <button
            onClick={() => { setMode('hex'); setError(null); }}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${
              mode === 'hex' ? A.tabOn : 'text-gray-300 light:text-slate-500 hover:text-white light:hover:text-slate-800'
            }`}
          >Hex Key</button>
        </div>

        {mode === 'mnemonic' ? (
          <textarea
            value={phrase}
            onChange={(e) => { setPhrase(e.target.value); setError(null); }}
            rows={3}
            placeholder="witch collapse practice feed shame open despair creek road again ice least"
            className="w-full px-3 py-2 text-xs font-mono bg-black/50 border border-gray-700 rounded-lg text-gray-200 placeholder:text-gray-300 light:bg-white light:border-slate-300 light:text-slate-900 light:placeholder:text-slate-400 focus:outline-none focus:border-[#49EACB] transition-all"
            spellCheck={false} autoCapitalize="none" autoCorrect="off"
          />
        ) : (
          <input
            type="password"
            value={hexKey}
            onChange={(e) => { setHexKey(e.target.value); setError(null); }}
            placeholder="64 hex characters (32 bytes)"
            className="w-full px-3 py-2 text-xs font-mono bg-black/50 border border-gray-700 rounded-lg text-gray-200 placeholder:text-gray-300 light:bg-white light:border-slate-300 light:text-slate-900 light:placeholder:text-slate-400 focus:outline-none focus:border-[#49EACB] transition-all"
            spellCheck={false}
          />
        )}

        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

        <button
          onClick={handleDerive}
          disabled={deriving}
          className={`mt-3 w-full px-4 py-2.5 ${A.btn} text-white text-sm font-bold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
        >
          {deriving ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : null}
          {deriving ? 'Deriving Keys...' : 'Connect Dev Wallet'}
        </button>
      </>
    </div>
  );
}

// A no-op stand-in for the @kasflow connector while it is still loading (or if it fails to
// load). Every call site below guards kf in try/catch, so the wallet flow degrades gracefully:
// the KasWare extension still connects through our own getProvider() path; only the connector's
// optional kasflow send path is unavailable until the chunk arrives.
const KF_STUB = {
  connected: false,
  address: null,
  connect: async () => {},
  disconnect: () => {},
  sendTransaction: async () => { throw new Error('Wallet connector still loading'); },
};

function WalletBridge({ children, kf = KF_STUB }) {
  const [injections, setInjections] = useState({ KasWare: false, OKX: false });
  const [pollingActive, setPollingActive] = useState(true);

  useEffect(() => {
    let attempts = 0;
    const MAX_ATTEMPTS = 25;
    const interval = setInterval(() => {
      attempts++;
      const kaswareDetected = detectWallet('KasWare');
      const okxDetected = detectWallet('OKX');
      setInjections(prev => {
        if (prev.KasWare === kaswareDetected && prev.OKX === okxDetected) return prev;
        return { KasWare: kaswareDetected, OKX: okxDetected };
      });
      if (attempts >= MAX_ATTEMPTS) {
        setPollingActive(false);
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const [activeWalletId, setActiveWalletId] = useState(null);
  const [activeAddress, setActiveAddress] = useState(null);
  const [activeBalance, setActiveBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [activeWalletNetwork, setActiveWalletNetwork] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const balanceTimerRef = useRef(null);
  const prevNetworkRef = useRef(null);

  // ── Dev mode state (must be before useEffects that reference it) ──
  const [devMode, setDevMode] = useState(null);

  // ── Track the current app-level network for dev mode derivation ──
  const [appNetwork, setAppNetwork] = useState(() => getCurrentNetwork());
  useEffect(() => onNetworkChange(setAppNetwork), []);

  // When the global network toggle changes, load the dev wallet saved for *that* specific network
  // (separate connections for TN10 vs TN12 vs mainnet).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = getDevStorageKey(appNetwork);
    const savedDev = localStorage.getItem(key);
    if (savedDev) {
      try {
        const parsed = JSON.parse(savedDev);
        if (parsed.privateKeyHex && parsed.address) {
          setDevMode(parsed);
          setActiveWalletId('__dev_mode__');
          setActiveAddress(parsed.address);
          setActiveWalletNetwork(appNetwork);
          setActiveBalance(null);
          return;
        }
      } catch { /* best-effort; failure is non-fatal here */ }
    } else {
      // No saved dev for this network - clear any previous devMode so we don't show stale dev connection from another network
      if (devMode) {
        setDevMode(null);
        setActiveWalletId(null);
        setActiveAddress(null);
      }
    }
  }, [appNetwork]);

  const walletMeta = activeWalletId
    ? (ALL_WALLETS.find(w => w.id === activeWalletId) || (activeWalletId === 'InApp' ? { id: 'InApp', name: 'Your Kaspa wallet', logo: '' } : null))
    : null;

  function getActiveProvider() {
    if (devMode) return null;
    if (!activeWalletId || !activeAddress) return null;
    // The mobile in-app wallet has no named global; resolve it through the mobile probe.
    if (activeWalletId === 'InApp') return mobileProviderProbe();
    return getProvider(activeWalletId);
  }

  // Resolve the provider for a SPECIFIC wallet from its own known global only. No generic
  // "any installed Kaspa wallet" fallback: that wrongly connected KasWare when you clicked a
  // different wallet. If null, the caller offers install / open-app for THAT wallet, never
  // a different one.
  const resolveProvider = useCallback((wallet) => {
    return wallet.provider ? wallet.provider() : getProvider(wallet.id);
  }, []);

  // Drive a provider through every account-request shape so the extension popup auto-opens and
  // returns the connected address in ONE click. Throws on decline / no account so the caller
  // can surface the reason (it never silently dead-ends).
  const connectViaProvider = useCallback(async (walletId, provider) => {
    let accounts;
    if (typeof provider.requestAccounts === 'function') {
      accounts = await provider.requestAccounts();
    } else if (typeof provider.connect === 'function') {
      await provider.connect();
      if (typeof provider.getAccounts === 'function') accounts = await provider.getAccounts();
      else if (typeof provider.getAccount === 'function') {
        const acct = await provider.getAccount();
        accounts = acct ? [(acct.address || acct)] : [];
      }
    } else if (typeof provider.getAccounts === 'function') {
      accounts = await provider.getAccounts();
    } else if (typeof provider.getAccount === 'function') {
      const acct = await provider.getAccount();
      accounts = acct ? [(acct.address || acct)] : [];
    } else if (typeof provider.getAddresses === 'function') {
      const addrs = await provider.getAddresses();
      accounts = addrs && addrs.length > 0 ? addrs : [];
    } else {
      throw new Error('This wallet does not expose a connect method.');
    }

    if (!accounts || accounts.length === 0) {
      throw new Error('No account returned. Unlock the wallet and approve the connection.');
    }

    const addr = accounts[0].address || accounts[0];
    setDevMode(null);
    setActiveWalletId(walletId);
    setActiveAddress(addr);

    try {
      let net;
      if (typeof provider.getNetwork === 'function') net = await provider.getNetwork();
      else if (typeof provider.request === 'function') net = await provider.request({ method: 'getNetwork' });
      setActiveWalletNetwork(net || null);
    } catch { /* best-effort; failure is non-fatal here */ }

    await refreshBalanceForProvider(provider);

    if (walletId === 'KasWare') {
      try { await kf.connect('kasware'); } catch { /* best-effort; failure is non-fatal here */ }
    }
  }, [kf]);

  // Open the wallet's mobile app via its deep link, then resolve true if the app actually
  // foregrounded within ~1.5s (page hidden / blurred), false if it did not (app not installed).
  // The caller uses the result to fall back to the store ONLY when the app failed to open, so an
  // installed app is never bounced to a download page.
  const openAppThenDetect = useCallback((deepLink) => new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(false); return; }
    let opened = false;
    const onHidden = () => { if (document.hidden) opened = true; };
    const onBlur = () => { opened = true; };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onBlur);
    window.addEventListener('blur', onBlur);
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onBlur);
      window.removeEventListener('blur', onBlur);
    };
    // Use location assignment (not window.open) so a universal/app link can hand off to the OS.
    try { window.location.href = deepLink; } catch { /* best-effort; failure is non-fatal here */ }
    setTimeout(() => {
      cleanup();
      // If we are still visible after the timeout, the app did not take over -> not installed.
      resolve(opened || document.hidden);
    }, 1500);
  }), []);

  // ── ONE unified connect entry ──
  // (a) this wallet's own provider detected -> requestAccounts, one-click connect;
  // (b) not detected + mobile -> open-app deep link, store fallback only after a real timeout;
  // (c) not detected + desktop -> install link for THIS wallet.
  // Strictly per-wallet: clicking a wallet never connects a different installed one, and
  // never bounces straight to download on first tap.
  const connectWallet = useCallback(async (walletId) => {
    // walletsForDevice() also yields the synthetic mobile "InApp" entry when a provider is injected.
    const wallet = walletsForDevice().find(w => w.id === walletId) || ALL_WALLETS.find(w => w.id === walletId);
    if (!wallet) { setError('Unknown wallet'); return; }

    setError(null);

    // (a) This wallet's own provider present -> one-click connect.
    const provider = resolveProvider(wallet);
    if (provider) {
      setConnecting(true);
      try {
        await connectViaProvider(walletId, provider);
      } catch (err) {
        const msg = err && err.message ? err.message : 'Connection failed';
        setError(/reject|denied|declin|cancel/i.test(msg) ? `${wallet.name}: connection declined. Tap again to retry.` : `${wallet.name}: ${msg}`);
        setActiveWalletId(null);
        setActiveAddress(null);
        throw err;
      } finally {
        setConnecting(false);
      }
      return;
    }

    // No provider injected.
    if (isMobile()) {
      // (b) Mobile: try to open the installed app first.
      if (wallet.deepLink) {
        setConnecting(true);
        setError(null);
        try {
          const opened = await openAppThenDetect(wallet.deepLink);
          if (opened) {
            // App foregrounded. For wallets whose in-app browser injects a provider, the user
            // returns into that browser and detection picks it up. For native-only wallets,
            // be honest: there is no provider to connect to in this tab.
            if (wallet.nativeOnly) {
              setError(`Opened ${wallet.name}. ${wallet.name} is a native app with no in-page connect here yet, so complete the action inside the app. To connect on this site, open it from the in-app browser of a wallet that supports it (KasWare, OKX, Kasanova).`);
            }
            return;
          }
          // App did not open within the timeout -> not installed -> honest store fallback.
          setError(`${wallet.name} did not open. It may not be installed - opening its download page.`);
          window.open(wallet.url, '_blank');
        } finally {
          setConnecting(false);
        }
        return;
      }
      // No deep link known -> install page (still not a silent dead-end; message is shown).
      setError(`${wallet.name} is not available in this browser. Opening its app page.`);
      window.open(wallet.url, '_blank');
      return;
    }

    // (c) Desktop, generic probe already failed inside resolveProvider -> install link.
    setError(`${wallet.name} is not installed. Opening its install page - then return and tap Connect.`);
    window.open(wallet.url, '_blank');
  }, [resolveProvider, connectViaProvider, openAppThenDetect]);

  // ── Dev mode connect (persists the in-browser generated/imported wallet to localStorage,
  // per-network for TN10 / TN12 / mainnet) ──
  const connectDevMode = useCallback((devState) => {
    const isMain = appNetwork === 'mainnet' || appNetwork === 'mainnet-1';
    // Hardcoded dev wallets (which carry neither their own phrase nor hex) stay blocked on
    // mainnet. A wallet the user GENERATED or imported here carries its own phrase/hexKey and
    // is their own real wallet, allowed on mainnet. Its private key is held only in this
    // browser and is never transmitted (sendPayment refuses every custodial path, all networks).
    if (isMain && !devState?.phrase && !devState?.hexKey) {
      setError('Hardcoded dev wallets are disabled on mainnet. Generate a new wallet or connect a wallet extension.');
      return;
    }
    setDevMode(devState);
    setActiveWalletId('__dev_mode__');
    setActiveAddress(devState.address);
    setActiveWalletNetwork(appNetwork);
    setActiveBalance(null);
    setError(null);
    if (typeof localStorage !== 'undefined') {
      const devSave = { ...devState };
      delete devSave.type;
      const key = getDevStorageKey(appNetwork);
      localStorage.setItem(key, JSON.stringify(devSave));
      localStorage.setItem('covex_connected_wallet', '__dev_mode__');
    }
  }, [appNetwork]);

  // Returns true if a balance was actually obtained from the provider, so callers can fall back
  // to the backend endpoint when an extension wallet has no getBalance() support.
  async function refreshBalanceForProvider(provider) {
    if (!provider) return false;
    try {
      let bal;
      if (typeof provider.getBalance === 'function') {
        bal = await provider.getBalance();
      } else if (typeof provider.request === 'function') {
        bal = await provider.request({ method: 'getBalance' });
      }
      if (bal) {
        const available = bal.available !== undefined ? Number(bal.available)
          : bal.confirmed !== undefined ? Number(bal.confirmed)
          : null;
        if (available != null) { setActiveBalance(available); return true; }
      }
    } catch { /* best-effort; failure is non-fatal here */ }
    return false;
  }

  // Read an address's on-chain balance from the backend (sums UTXOs at the node). This is the
  // balance source for dev-mode (mnemonic/hex) wallets (which have no extension provider) and a
  // fallback for extension wallets whose provider does not expose getBalance(). Works for ANY
  // address. Returns sompi (integer); WalletButton divides by 1e8 for KAS display.
  async function fetchBackendBalance(addr) {
    if (!addr) return;
    try {
      const net = (typeof localStorage !== 'undefined' && localStorage.getItem('kaspaNetwork')) || appNetwork || 'mainnet';
      const r = await fetch(`/api/balance/${encodeURIComponent(addr)}?network=${encodeURIComponent(net)}`);
      const d = await r.json();
      // GET /balance/:address returns { balance: <sompi> } (broadcast.rs get_balance_by_address).
      const sompi = (d && typeof d.balance === 'number') ? d.balance
        : (d && typeof d.balance_sompi === 'number') ? d.balance_sompi : null;
      if (sompi != null) setActiveBalance(sompi);
    } catch { /* node briefly unreachable; keep last known balance */ }
  }

  // Unified balance refresh: extension provider first, backend fallback, dev-mode straight to backend.
  async function refreshAnyBalance() {
    if (!activeAddress) return;
    setBalanceLoading(true);
    try {
      if (devMode) {
        await fetchBackendBalance(activeAddress);
      } else {
        const provider = getActiveProvider();
        const got = provider ? await refreshBalanceForProvider(provider) : false;
        if (!got) await fetchBackendBalance(activeAddress);
      }
    } finally {
      setBalanceLoading(false);
    }
  }

  const disconnectWallet = useCallback(async () => {
    if (devMode) {
      setDevMode(null);
      if (typeof localStorage !== 'undefined') {
        const key = getDevStorageKey(appNetwork);
        localStorage.removeItem(key);
        localStorage.removeItem('covex_connected_wallet');
      }
    }
    const provider = getActiveProvider();
    if (provider) {
      try {
        if (typeof provider.disconnect === 'function') await provider.disconnect();
        else if (typeof provider.close === 'function') await provider.close();
      } catch { /* best-effort; failure is non-fatal here */ }
    }
    try { kf.disconnect(); } catch { /* best-effort; failure is non-fatal here */ }

    setActiveWalletId(null);
    setActiveAddress(null);
    setActiveBalance(null);
    setActiveWalletNetwork(null);
    setError(null);
  }, [devMode, kf]);

  // On network switch (after mount), disconnect any real (extension) wallet because wallet
  // connections are network-specific. The user re-connects the desired wallet while the chosen
  // network (TN12 / TN10 / MAIN) is active.
  useEffect(() => {
    if (prevNetworkRef.current !== null && prevNetworkRef.current !== appNetwork) {
      if (activeWalletId && activeWalletId !== '__dev_mode__' && !devMode) {
        disconnectWallet().catch(() => {});
      }
    }
    prevNetworkRef.current = appNetwork;
  }, [appNetwork, activeWalletId, devMode, disconnectWallet]);

  // Live balance polling. Extension wallets report via their provider (backend fallback if the
  // provider has no getBalance); dev-mode wallets read straight from the backend. Refreshes
  // immediately on connect, then every 15s.
  useEffect(() => {
    if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    if (!activeAddress) return;
    refreshAnyBalance();
    balanceTimerRef.current = setInterval(() => { refreshAnyBalance(); }, 15000);
    return () => {
      if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
    };
  }, [activeAddress, activeWalletId, devMode, appNetwork]);

  // Auto-connect on mount (load dev wallet for the initial network)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initialNet = getCurrentNetwork();
    const savedDevKey = getDevStorageKey(initialNet);
    const savedDev = typeof localStorage !== 'undefined' ? localStorage.getItem(savedDevKey) : null;
    if (savedDev) {
      try {
        const parsed = JSON.parse(savedDev);
        if (parsed.privateKeyHex && parsed.address) {
          // set directly to avoid double save
          setDevMode(parsed);
          setActiveWalletId('__dev_mode__');
          setActiveAddress(parsed.address);
          setActiveWalletNetwork(initialNet);
          localStorage.setItem('covex_connected_wallet', '__dev_mode__');
          return;
        }
      } catch { /* best-effort; failure is non-fatal here */ }
    }
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('covex_connected_wallet') : null;
    if (saved && ALL_WALLETS.find(w => w.id === saved && w.detect())) {
      connectWallet(saved).catch(() => {});
    } else {
      const autoWallet = ALL_WALLETS.find(w => w.detect());
      if (autoWallet) {
        connectWallet(autoWallet.id).catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (activeWalletId && typeof localStorage !== 'undefined') {
      localStorage.setItem('covex_connected_wallet', activeWalletId);
    } else if (!activeWalletId && typeof localStorage !== 'undefined') {
      localStorage.removeItem('covex_connected_wallet');
    }
  }, [activeWalletId]);

  const buildUri = useCallback((recipient, amountKas, meta = {}) => {
    const prefix = appNetwork === 'mainnet' || appNetwork === 'mainnet-1' ? 'kaspa:' : 'kaspatest:';
    const addr = recipient.replace(/^(kaspatest:|kaspa:)/, '');
    const q = [];
    if (amountKas) q.push(`amount=${amountKas}`);
    if (meta.scriptHash) q.push(`scriptHash=${meta.scriptHash}`);
    let uri = `${prefix}${addr}`;
    if (q.length) uri += `?${q.join('&')}`;
    return uri;
  }, [appNetwork]);

  const devSignMessage = useCallback(async (message) => {
    if (!devMode) throw new Error('Dev mode not active');
    const wasm = await loadKaspaWasm();
    return signMessageWithWasm(wasm, devMode.privateKeyHex, message);
  }, [devMode]);

  const sendPayment = useCallback(async (recipient, amountKas, meta = {}) => {
    if (devMode && activeAddress) {
      // TRUSTLESS GUARANTEE: a generated/imported wallet's private key NEVER leaves this browser.
      // Covex never transmits it. Covenant deploy/spend uses the non-custodial prepare/submit
      // flow (the key signs locally in the browser); for tier payments, connect a wallet extension.
      return { success: false, error: 'This wallet never sends its key off your device. Deploy covenants non-custodially (your key signs locally) or use a wallet extension for tier payments.' };
    }
    const provider = getActiveProvider();
    if (provider && activeAddress) {
      try {
        const amountSompi = kasToSompi(amountKas);
        let txid;
        if (typeof provider.sendKaspa === 'function') {
          txid = await provider.sendKaspa(recipient, amountSompi);
        } else if (typeof provider.sendTransaction === 'function') {
          const result = await provider.sendTransaction({ to: recipient, amount: amountSompi });
          txid = result.txId || result.txid;
        } else if (typeof provider.request === 'function') {
          const result = await provider.request({ method: 'sendTransaction', params: { to: recipient, amount: String(amountSompi) } });
          txid = result.txId || result.txid;
        }
        if (txid) return { success: true, method: 'extension', txid };
      } catch { /* best-effort; failure is non-fatal here */ }
    }
    if (kf.connected && kf.address) {
      try {
        const amountSompi = kasToSompi(amountKas);
        const result = await kf.sendTransaction({ to: recipient, amount: amountSompi });
        return { success: true, method: 'kasflow', txid: result.txId };
      } catch { /* best-effort; failure is non-fatal here */ }
    }
    // No wallet available to sign (no dev mode, no extension, no kasflow connection). Do NOT
    // open a dead protocol tab: a kaspa: URI has no browser handler, so window.open
    // just renders a blank page. Return the payable URI + a needsWallet flag so the caller can
    // show a scannable QR / connect prompt instead of a broken redirect.
    const uri = buildUri(recipient, amountKas, meta);
    return { success: false, error: 'No wallet connected to sign this transaction.', uri, needsWallet: true, method: 'uri' };
  }, [activeAddress, activeWalletId, devMode, kf, buildUri]);

  const signMessage = useCallback(async (message) => {
    if (devMode && activeAddress) {
      return await devSignMessage(message);
    }
    const provider = getActiveProvider();
    if (!provider || !activeAddress) throw new Error('No wallet connected');
    if (typeof provider.signMessage === 'function') return await provider.signMessage(message);
    if (typeof provider.request === 'function') return await provider.request({ method: 'signMessage', params: { message } });
    throw new Error('signMessage not available on this wallet');
  }, [activeAddress, activeWalletId, devMode, devSignMessage]);

  // ── Covenant-signing capability + reason ──
  // Resolve, for the CURRENTLY connected wallet, whether it can sign a covenant deploy/redeem
  // with a popup, and (if not) an honest reason. Dev mode is NOT covered here: the dev-key path
  // signs covenants via the in-browser @noble schnorr / verifyAndSignSpend route (EnforcedDeploy
  // keeps that as its own strategy), so canSignCovenant is specifically about a connected wallet
  // extension. Returns { ok, family, reason }.
  const covenantSignCapability = useCallback(() => {
    if (devMode) return { ok: false, family: null, reason: 'A generated/imported dev wallet signs covenants with its in-browser key, not a popup.' };
    if (!activeWalletId || !activeAddress) return { ok: false, family: null, reason: 'No wallet connected.' };
    const family = COVENANT_SIGNER_FAMILY[activeWalletId];
    if (!family) return { ok: false, family: null, reason: `${walletMeta?.name || activeWalletId} cannot sign covenant transactions here. Use KasWare, OKX, or Kastle, or the recovery key tool.` };
    // Kastle supports mainnet + TN10 ONLY (no TN12). If the app is on a network Kastle cannot do,
    // report it honestly so the gate stays false rather than letting a doomed sign attempt run.
    if (family === 'kastle' && !COVEX_TO_KASTLE_NETWORK[appNetwork]) {
      return { ok: false, family, reason: 'Kastle supports mainnet and testnet-10 only (not testnet-12). Switch networks, use KasWare/OKX, or the recovery key tool.' };
    }
    return { ok: true, family, reason: null };
  }, [devMode, activeWalletId, activeAddress, appNetwork, walletMeta]);

  const canSignCovenant = covenantSignCapability().ok;

  // Best-effort: ask the wallet to switch to the app's network before signing. KasWare exposes
  // switchNetwork(kaspa_*); Kastle switches via its own UI (no programmatic switch here). Never
  // throws on a wallet without switchNetwork; the subsequent getNetwork mismatch (if any) is the
  // real guard. Returns the wallet network string we targeted (or null).
  const ensureWalletNetwork = useCallback(async (provider, family) => {
    try {
      if (family === 'kasware') {
        const target = COVEX_TO_KASWARE_NETWORK[appNetwork];
        if (target && typeof provider.switchNetwork === 'function') {
          let current = null;
          try { current = typeof provider.getNetwork === 'function' ? await provider.getNetwork() : null; } catch { /* best-effort; failure is non-fatal here */ }
          if (current !== target) await provider.switchNetwork(target);
        }
        return target || null;
      }
      if (family === 'kastle') {
        const target = COVEX_TO_KASTLE_NETWORK[appNetwork];
        if (target && typeof provider.switchNetwork === 'function') {
          try { await provider.switchNetwork(target); } catch { /* best-effort; failure is non-fatal here */ }
        }
        return target || null;
      }
    } catch { /* switch is best-effort; the sign step re-validates */ }
    return null;
  }, [appNetwork]);

  // Sign a covenant SPEND (redeem) with the connected wallet. Dispatches by family, rebuilds the
  // exact tx, and FAIL-CLOSED verifies the wallet's signature before returning it. Returns the
  // exact { signatures:[{index, signature_hex}] } shape /submit-signed expects (single-input
  // spend -> index 0). Throws an honest error (steering to the recovery key tool) if the wallet
  // cannot sign this covenant input; the caller never blind-submits.
  //
  // @param {object} plan - the spend_plan from prepare-spend
  // @param {object} opts - { intendedDest, signerXonly }  (networkId derived from appNetwork)
  const signCovenantSpend = useCallback(async (plan, opts = {}) => {
    const cap = covenantSignCapability();
    if (!cap.ok) throw new Error(cap.reason || 'This wallet cannot sign covenants.');
    const provider = getActiveProvider();
    if (!provider) throw new Error('Wallet provider unavailable. Reconnect your wallet.');
    const networkId = normalizeNetworkId(appNetwork);
    const walletNetworkId = await ensureWalletNetwork(provider, cap.family);
    const signOpts = { ...opts, networkId, signerXonly: opts.signerXonly };
    if (cap.family === 'kastle') {
      return signWithKastle(provider, plan, { ...signOpts, walletNetworkId: walletNetworkId || COVEX_TO_KASTLE_NETWORK[appNetwork] });
    }
    return signWithKasware(provider, plan, signOpts);
  }, [covenantSignCapability, appNetwork, ensureWalletNetwork]);

  // Sign a covenant DEPLOY (funding tx) with the connected wallet. prepare-deploy now returns a
  // wallet-signable funding tx (prep.deploy_plan), so this rebuilds it, hands it to the wallet, and
  // returns the { signatures:[{index, signature_hex}] } shape /submit-deploy expects. Fails closed
  // (honest error, steering to the in-browser key path) if deploy_plan is absent or the wallet
  // cannot sign the covenant funding inputs.
  const signCovenantDeploy = useCallback(async (prep, opts = {}) => {
    const cap = covenantSignCapability();
    if (!cap.ok) throw new Error(cap.reason || 'This wallet cannot sign covenants.');
    const provider = getActiveProvider();
    if (!provider) throw new Error('Wallet provider unavailable. Reconnect your wallet.');
    const walletNetworkId = await ensureWalletNetwork(provider, cap.family);
    return signDeployWithWallet(provider, prep, {
      ...opts,
      networkId: normalizeNetworkId(appNetwork),
      walletNetworkId: walletNetworkId || COVEX_TO_KASTLE_NETWORK[appNetwork],
    });
  }, [covenantSignCapability, appNetwork, ensureWalletNetwork]);

  // Honest reason string for the UI when canSignCovenant is false (null when it is true).
  const covenantSignReason = canSignCovenant ? null : covenantSignCapability().reason;

  // Every wallet is shown; platform is a priority sort, not an exclusion (so an installed
  // desktop wallet still appears on mobile and vice versa, and detection can surface it).
  const activeWallets = walletsForDevice();

  // Prevent EventEmitter / ObjectMultiplex memory leaks from wallet providers (MetaMask, KasWare, etc.)
  // These warnings appear in contentscript when too many 'end'/'close' listeners are added on streams.
  // We aggressively set unlimited listeners on any provider/stream we can reach, and attempt cleanup on disconnect.
  const suppressWalletStreamLeaks = () => {
    if (typeof window === 'undefined') return;
    try {
      const candidates = [
        window.ethereum,
        window.kasware,
        window.kaspa,
        window.ethereum?.provider,
        window.ethereum?._events,
        // Also try to reach the internal stream if the adapter exposes it
        window.__COVEX_WALLET_MUX,
      ].filter(Boolean);

      candidates.forEach((prov) => {
        if (prov && typeof prov.setMaxListeners === 'function') {
          prov.setMaxListeners(0); // 0 = unlimited - stops the MaxListeners warning
        }
        const mux = prov?._events || prov?.provider?._events || prov?._mux || prov;
        if (mux && typeof mux.setMaxListeners === 'function') {
          mux.setMaxListeners(0);
        }
      });
    } catch { /* best-effort; failure is non-fatal here */ }
  };

  // A safe disconnect the rest of the app should prefer: tears down the active wallet,
  // then re-suppresses any lingering provider streams once the extension settles.
  const disconnectWalletWithCleanup = async () => {
    await disconnectWallet();
    setTimeout(suppressWalletStreamLeaks, 80);
  };

  const value = {
    activeWalletId,
    address: activeAddress,
    balance: activeBalance,
    balanceLoading,
    connecting,
    error,
    network: activeWalletNetwork || (appNetwork === 'mainnet' || appNetwork === 'mainnet-1' ? 'mainnet' : 'kaspatest'),
    appNetwork,

    walletMeta,
    wallets: activeWallets,
    allWallets: ALL_WALLETS,

    isDevMode: !!devMode,
    devMode,
    connectDevMode,
    mnemonicPanel: (props) => <DevConnectPanelBase {...props} onConnect={connectDevMode} network={appNetwork} />,
    DevConnectPanel: (props) => <DevConnectPanelBase {...props} onConnect={connectDevMode} network={appNetwork} />,
    injections,
    pollingActive,

    connect: connectWallet,
    disconnect: disconnectWalletWithCleanup,
    sendPayment,
    signMessage,
    // Covenant deploy/redeem signing via the connected wallet popup (the PRIMARY money path).
    // canSignCovenant is true for a connected KasWare / OKX / Kastle (Kastle only on a network it
    // supports); covenantSignReason gives the honest "why not" when false. signCovenantSpend /
    // signCovenantDeploy return { signatures:[{index, signature_hex}] } and FAIL CLOSED.
    canSignCovenant,
    covenantSignReason,
    signCovenantSpend,
    signCovenantDeploy,
    sendKaspa: async (recipient, amountSompi) => {
      // A generated/imported dev wallet's private key NEVER leaves this browser, so
      // there is no dev-mode send path here: the removed dev branch built an empty-UTXO
      // transaction that always failed and fell back to signing PAYMENT:... with the
      // raw key. Deploy covenants non-custodially or use a wallet extension instead.
      if (devMode) {
        throw new Error('This wallet never sends its key off your device. Deploy covenants non-custodially (your key signs locally) or use a wallet extension to send.');
      }
      const provider = getActiveProvider();
      if (!provider || !activeAddress) throw new Error('No wallet connected');
      if (typeof provider.sendKaspa === 'function') return await provider.sendKaspa(recipient, amountSompi);
      throw new Error('sendKaspa not supported');
    },
    buildUri,
    refreshBalance: async () => { await refreshAnyBalance(); },
    clearError: () => setError(null),
  };

  // Run on initial mount and after any wallet connect
  useEffect(() => {
    suppressWalletStreamLeaks();
  }, [activeAddress]); // re-run when a new wallet appears

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

// Lazily-loaded boundary that mounts the @kasflow connector provider and forwards its live
// wallet handle (kf) up to WalletBridge. Splitting this out of the entry chunk is what keeps the
// connector's static @onekeyfe/kaspa-wasm dependency (via @kasflow/passkey-wallet) out of the
// initial bundle, so the multi-MB vendor-kaspa-wasm chunk is no longer modulepreloaded on boot.
//
// React.lazy resolves the connector module, then KasFlowInner (rendered INSIDE the provider)
// calls useKasFlowWallet() and pushes kf to a parent setter. Until the chunk arrives, WalletBridge
// runs with KF_STUB so the app boots and the KasWare extension still connects via our own path.
const LazyKasFlow = lazy(async () => {
  const mod = await import('@kasflow/wallet-connector/react');
  const KasFlowProvider = mod.KaspaWalletProvider;
  const kaswareAdapter = mod.kaswareAdapter;
  const useKasFlowWallet = mod.useWallet;

  // Bridges the connector hook to the parent: renders nothing, just reports kf upward.
  function KasFlowInner({ onKf }) {
    const kf = useKasFlowWallet();
    useEffect(() => { onKf(kf); }, [kf, onKf]);
    return null;
  }

  function KasFlowProviderWrapper({ network, onKf }) {
    return (
      <KasFlowProvider
        config={{
          appName: 'Covex',
          network: network === 'mainnet' || network === 'mainnet-1' ? network : 'testnet-12',
          autoConnect: false,
          adapters: [kaswareAdapter()],
        }}
      >
        <KasFlowInner onKf={onKf} />
      </KasFlowProvider>
    );
  }

  return { default: KasFlowProviderWrapper };
});

export function WalletProvider({ children }) {
  const network = getCurrentNetwork();
  const [kf, setKf] = useState(KF_STUB);
  const onKf = useCallback((next) => { if (next) setKf(next); }, []);
  return (
    <>
      {/* The connector provider mounts in a sibling boundary (Suspense fallback null = invisible
          while it loads). It carries no UI of its own; it only supplies the kf handle. */}
      <Suspense fallback={null}>
        <LazyKasFlow network={network} onKf={onKf} />
      </Suspense>
      <WalletBridge kf={kf}>
        {children}
      </WalletBridge>
    </>
  );
}

export { ALL_WALLETS, detectWallet, getProvider, DevConnectPanelBase, NETWORK_LABELS, walletPrimaryAction, isMobile };
