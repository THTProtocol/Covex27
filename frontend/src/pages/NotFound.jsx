import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

// Branded 404. Guarded ambient aurora behind a centered hero, big glyph, one honest
// line, two btn-shimmer CTAs back into the working app. Lazy-loaded in App.jsx so this
// lives in its own chunk and never bloats the eager Explorer bundle.
export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-24 sm:py-32 relative">
      {/* Ambient aurora (no intrinsic size: width/height + centering set inline) */}
      <div
        className="covex-aurora"
        aria-hidden="true"
        style={{ top: 0, left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto', width: 520, height: 260, maxWidth: '90vw', opacity: 0.5 }}
      />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div
          className="text-7xl sm:text-8xl font-black tracking-tight bg-gradient-to-b from-kaspa-green to-kaspa-green/40 bg-clip-text text-transparent select-none"
          aria-hidden="true"
        >
          404
        </div>
        <h1 className="mt-4 text-xl sm:text-2xl font-bold text-white light:text-slate-900">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-gray-400 light:text-slate-500 max-w-md">
          That page does not exist. It may have moved, or the link was mistyped.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="kaspa" size="default" shimmer>
            <Link to="/">Back to Explorer</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/sandbox">Open the Sandbox</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
