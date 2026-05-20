import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import DagBackground from './components/DagBackground';
import Explorer from './pages/Explorer';
import CovenantInteractive from './pages/CovenantInteractive';
import HostCovenant from './pages/HostCovenant';
import CreateCovenant from './pages/CreateCovenant';
import Terms from './pages/Terms';

/* ── Navigation link helper ───────────────────────────────────── */

const navLinkClass = ({ isActive }) =>
  `text-sm font-medium transition-colors ${
    isActive
      ? 'text-kaspa-green'
      : 'text-gray-400 hover:text-white'
  }`;

/* ── Main App ──────────────────────────────────────────────────── */

export default function App() {
  return (
    <BrowserRouter>
      {/* ── DAG Canvas (behind everything) ───────────────── */}
      <DagBackground />

      {/* ── Fixed Navbar ──────────────────────────────────── */}
      <nav className="fixed top-0 w-full z-50 bg-[#0A0A0D]/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo / brand */}
          <Link
            to="/"
            className="flex items-center gap-2.5 text-white hover:text-kaspa-green transition-colors"
          >
            <span className="text-lg font-semibold tracking-tight">COVEX</span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-8">
            <NavLink to="/" end className={navLinkClass}>
              Explorer
            </NavLink>
            <NavLink to="/create" className={navLinkClass}>
              Create
            </NavLink>
            <NavLink to="/host" className={navLinkClass}>
              Host Covenant
            </NavLink>
            <NavLink to="/terms" className={navLinkClass}>
              Terms
            </NavLink>

            {/* Status dot — green when backend reachable (decorative) */}
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-kaspa-green shadow-[0_0_6px_rgba(73,234,203,0.5)]" />
              <span className="text-xs text-gray-600 font-mono">TN12</span>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Page content (offset for fixed navbar) ───────── */}
      <div className="relative z-10 min-h-screen pt-16">
        <Routes>
          <Route path="/" element={<Explorer />} />
          <Route path="/covenant/:id" element={<CovenantInteractive />} />
          <Route path="/create" element={<CreateCovenant />} />
          <Route path="/host" element={<HostCovenant />} />
          <Route path="/terms" element={<Terms />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
