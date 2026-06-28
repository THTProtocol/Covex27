import { useEffect, useRef } from 'react';

// Shared accessible-dialog focus management. Mirrors the contract already used by
// RecoveryKitModal / WalletButton: while open, Tab cycles inside the dialog subtree, focus moves
// into the dialog on open, Escape closes, and focus is restored to the previously-focused element
// on close. Returns a ref to attach to the dialog container; spread the standard ARIA attributes
// (role="dialog" aria-modal="true" aria-labelledby/aria-label) at the call site.
//
//   const dialogRef = useDialog({ open, onClose, labelId });
//   <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={labelId} ...>
//
// Reduced-motion safe (no animation), light/dark agnostic (no styling). Body scroll lock is left
// to the caller so existing per-modal overflow handling is untouched.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog({ open, onClose }) {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    const root = dialogRef.current;
    const focusables = () => (root
      ? Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement,
        )
      : []);
    // Move focus into the dialog on open: first focusable, else the container itself.
    const first = focusables()[0];
    if (first && typeof first.focus === 'function') {
      first.focus();
    } else if (root) {
      if (root.tabIndex < 0) root.setAttribute('tabindex', '-1');
      root.focus();
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab' || !root) return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstEl || !root.contains(activeEl)) { e.preventDefault(); lastEl.focus(); }
      } else if (activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus(); } catch { /* element gone */ }
      }
    };
  }, [open, onClose]);

  return dialogRef;
}
