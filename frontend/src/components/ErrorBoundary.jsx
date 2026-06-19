import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Covex App ErrorBoundary caught:", error, errorInfo);
  }

  // Reset when the route changes (resetKey = pathname) so a single page's error
  // does not strand the whole shell - navigating away recovers.
  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || String(this.state.error) || 'Unknown error';
      console.error('Covex ErrorBoundary:', this.state.error);
      // A stale dynamically-imported chunk (common right after a redeploy) throws a
      // distinctive error; the fix is always a reload (the SW serves the fresh shell).
      // Cover Vite/rolldown ("Failed to fetch dynamically imported module"), webpack
      // ("Loading chunk N failed", "ChunkLoadError"), and Safari ("Importing a module
      // script failed"). Unknown errors fall through to the generic recovery panel.
      const isChunkError = (
        /dynamically imported module/i.test(msg) ||
        /Failed to fetch dynamically imported module/i.test(msg) ||
        /Importing a module script failed/i.test(msg) ||
        /ChunkLoadError/i.test(msg) ||
        /Loading chunk \d+ failed/i.test(msg) ||
        /Failed to fetch/i.test(msg)
      );
      return (
        <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-[#05050A] light:bg-slate-50 text-gray-200 light:text-slate-800 font-sans">
          <div className="max-w-xl w-full text-center">
            <h1 className="text-2xl sm:text-[28px] font-bold mb-4 text-kaspa-green">
              {isChunkError ? 'A new version is available' : 'Something went wrong'}
            </h1>
            <p className="text-sm sm:text-base text-gray-400 light:text-slate-500 mb-6 leading-relaxed">
              {isChunkError
                ? 'Covex was updated while this tab was open. Reload to get the latest version.'
                : 'We hit an unexpected error while loading the page. This is usually temporary.'}
            </p>
            {!isChunkError && (
              <pre className="text-left text-xs leading-relaxed bg-black/60 light:bg-slate-100 text-red-400 light:text-red-600 border border-white/5 light:border-slate-200 rounded-lg p-3 mb-6 overflow-auto whitespace-pre-wrap break-words max-h-48">
                {msg}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-lg bg-kaspa-green text-[#05050A] light:text-slate-900 px-7 py-3 text-sm font-semibold cursor-pointer hover:bg-kaspa-green/90 focus:outline-none focus:ring-2 focus:ring-kaspa-green/60 transition-colors"
            >
              Reload Page
            </button>
            <div className="mt-8 text-xs text-gray-500 light:text-slate-400">
              If this keeps happening, please try again in a few minutes.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
