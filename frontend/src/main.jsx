import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// ThemeProvider is mounted ONCE, inside App (App.jsx), which wraps every theme
// consumer (ThemeToggle, DagBackground, the routed pages). Mounting it here too
// gave two independent theme states writing the same <html> class + localStorage
// key - a redundant second source of truth. Keep the single App-level mount.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Register PWA service worker for offline caching
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
