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
      const isChunkError = /dynamically imported module|Importing a module script failed|ChunkLoadError|Failed to fetch/i.test(msg);
      return (
        <div style={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: '#05050A',
          color: '#E5E5E5',
          padding: '40px',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{ maxWidth: '560px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '28px', marginBottom: '16px', color: '#49EACB' }}>
              {isChunkError ? 'A new version is available' : 'Something went wrong'}
            </h1>
            <p style={{ color: '#999', marginBottom: '24px', lineHeight: 1.5 }}>
              {isChunkError
                ? 'Covex was updated while this tab was open. Reload to get the latest version.'
                : 'We hit an unexpected error while loading the page. This is usually temporary.'}
            </p>
            <pre style={{
              display: isChunkError ? 'none' : 'block',
              background: '#111', 
              color: '#F87171', 
              padding: '12px', 
              borderRadius: '8px', 
              fontSize: '12px', 
              overflow: 'auto',
              textAlign: 'left',
              marginBottom: '24px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              style={{
                background: '#49EACB',
                color: '#05050A',
                border: 'none',
                padding: '12px 28px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
            <div style={{ marginTop: '32px', fontSize: '12px', color: '#666' }}>
              If this keeps happening, please try again in a few minutes.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
