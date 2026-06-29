import { lazy, Suspense } from 'react';

// qrcode.react (~13KB) is only ever needed when a QR actually renders: the mobile-wallet
// "scan this page" drawer in WalletButton and the payment-URI QR on the Pricing page. Both are
// behind interaction (open the wallet drawer / scroll to a paid tier), never on the homepage
// critical path. React.lazy pulls qrcode.react OUT of the entry chunk into its own async chunk
// that loads the first time a QR mounts.
//
// React.lazy needs a module with a default export; qrcode.react exports the NAMED `QRCodeSVG`, so
// adapt it to a default here.
const QRCodeSVGLazy = lazy(() =>
  import('qrcode.react').then((m) => ({ default: m.QRCodeSVG })),
);

// A sized placeholder keeps layout stable while the chunk loads (the QR is a fixed square). Falls
// back to the `size` prop; QR usages always pass an explicit size.
function QrFallback({ size = 64 }) {
  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="animate-pulse rounded bg-slate-200"
    />
  );
}

// Drop-in replacement for `<QRCodeSVG .../>`: same props, but the heavy module loads on demand.
export default function LazyQRCode(props) {
  return (
    <Suspense fallback={<QrFallback size={props.size} />}>
      <QRCodeSVGLazy {...props} />
    </Suspense>
  );
}
