/* eslint-disable react-refresh/only-export-components -- this module intentionally co-exports its component(s) with related constants/hooks/helpers (e.g. a Provider plus its useX hook). That only affects dev Fast Refresh granularity, never the production build or tests; splitting these into separate files is not warranted here. */
// ToastContext.jsx - one premium, app-wide notification system.
//
// Replaces native alert() everywhere. alert() is a blocking, unstyled OS popup;
// this is a non-blocking, branded, auto-dismissing toast stack. It exposes a
// MODULE-LEVEL `toast` singleton (toast.error/success/info/warn) so any code can
// fire one with the same ergonomics alert() had - no hook threading required -
// while a real React provider renders the UI.

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from '../lib/icons.js';

const ToastContext = createContext(null);

// The live enqueue fn, registered by the mounted provider. Until a provider
// mounts we fall back to console (never to alert - that's the whole point).
let enqueue = null;
let seq = 0;

const DEFAULT_MS = { error: 6500, warn: 5500, success: 4200, info: 4500 };

function fire(type, msg, opts = {}) {
  const message = typeof msg === 'string' ? msg : String(msg ?? '');
  if (!enqueue) {
    // Provider not mounted yet (extremely early error). Don't drop it silently.
    if (typeof console !== 'undefined') console[type === 'error' ? 'error' : 'log'](`[covex] ${message}`);
    return;
  }
  enqueue({
    id: ++seq,
    type,
    message,
    title: opts.title,
    duration: opts.duration ?? DEFAULT_MS[type] ?? 4500,
  });
}

// Module-level singleton: import { toast } and call toast.error('...') anywhere.
export const toast = {
  error: (msg, opts) => fire('error', msg, opts),
  success: (msg, opts) => fire('success', msg, opts),
  info: (msg, opts) => fire('info', msg, opts),
  warn: (msg, opts) => fire('warn', msg, opts),
};

// Hook form for components that prefer it.
export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx || toast;
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warn: AlertTriangle,
  info: Info,
};

const ACCENT = {
  success: { ring: 'border-emerald-400/40', glow: 'rgba(16,185,129,0.35)', icon: 'text-emerald-400', bar: 'bg-emerald-400' },
  error: { ring: 'border-red-400/40', glow: 'rgba(248,113,113,0.35)', icon: 'text-red-400', bar: 'bg-red-400' },
  warn: { ring: 'border-amber-400/40', glow: 'rgba(251,191,36,0.35)', icon: 'text-amber-400', bar: 'bg-amber-400' },
  info: { ring: 'border-sky-400/40', glow: 'rgba(56,189,248,0.35)', icon: 'text-sky-400', bar: 'bg-sky-400' },
};

function ToastCard({ t, onClose }) {
  const a = ACCENT[t.type] || ACCENT.info;
  const Icon = ICONS[t.type] || Info;
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(null);

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onClose(t.id), 220);
  }, [t.id, onClose]);

  useEffect(() => {
    if (!t.duration) return;
    timer.current = setTimeout(close, t.duration);
    return () => clearTimeout(timer.current);
  }, [t.duration, close]);

  return (
    <div
      role="status"
      aria-live={t.type === 'error' ? 'assertive' : 'polite'}
      onClick={close}
      className={`covex-toast pointer-events-auto cursor-pointer relative overflow-hidden w-[min(92vw,380px)]
        rounded-2xl border ${a.ring} bg-[#0b0d14]/95 backdrop-blur-xl
        light:bg-white/95 light:border-slate-200 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]
        ${leaving ? 'covex-toast-out' : 'covex-toast-in'}`}
      style={{ boxShadow: `0 18px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02), 0 0 28px -6px ${a.glow}` }}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${a.icon}`} />
        <div className="min-w-0 flex-1">
          {t.title && <div className="text-[13px] font-bold text-white light:text-slate-900 leading-snug">{t.title}</div>}
          <div className="text-[12.5px] text-gray-200 light:text-slate-700 leading-snug whitespace-pre-line break-words">{t.message}</div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); close(); }}
          className="shrink-0 -mr-1 -mt-0.5 p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 light:hover:bg-slate-100 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {t.duration ? (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5">
          <div className={`h-full ${a.bar} covex-toast-bar`} style={{ animationDuration: `${t.duration}ms` }} />
        </div>
      ) : null}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  useEffect(() => {
    // Register the live enqueue so the module-level `toast` singleton works.
    enqueue = (t) => setToasts((list) => [t, ...list].slice(0, 4));
    return () => { enqueue = null; };
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-[4.75rem] right-3 z-[200] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <ToastCard key={t.id} t={t} onClose={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
