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

  render() {
    if (this.state.hasError) {
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
          <div style={{ maxWidth: '480px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '28px', marginBottom: '16px', color: '#49EACB' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#999', marginBottom: '24px', lineHeight: 1.5 }}>
              We hit an unexpected error while loading the page. 
              This is usually temporary.
            </p>
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
