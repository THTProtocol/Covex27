// copy.js - one canonical clipboard helper with standardized feedback timing.
//
// Before this, ~10 components rolled their own copy-to-clipboard with five
// different setTimeout durations (1200ms, 1400ms, 1500ms, 1600ms, 2000ms) and
// at least one silent button with no feedback at all. Same micro-interaction,
// inconsistent dwell, reads as sloppy.
//
// Canonical dwell:
//   - inline check-state (button morphs to "Copied"): 1500ms
//   - toast confirmation: 1600ms
//
// Usage:
//   import { copyWithFeedback, copyToClipboard, COPY_DWELL_MS } from '@/lib/copy';
//
//   // Pattern A - inline check-state on a button:
//   const [copied, setCopied] = useState(false);
//   const onCopy = async () => {
//     const ok = await copyToClipboard(text);
//     if (ok) { setCopied(true); setTimeout(() => setCopied(false), COPY_DWELL_MS.inline); }
//   };
//
//   // Pattern B - toast confirmation (no local state required):
//   const onCopy = () => copyWithFeedback(text, { label: 'Address copied' });

import { toast } from '@/components/ToastContext';

export const COPY_DWELL_MS = Object.freeze({
  inline: 1500,
  toast: 1600,
});

/**
 * Raw clipboard write with a textarea fallback for non-secure contexts.
 * Returns true on success, false otherwise. Never throws.
 */
export async function copyToClipboard(text) {
  const value = text == null ? '' : String(text);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {
    // fall through to legacy path
  }
  // Legacy fallback: hidden textarea + execCommand. Still required for
  // http://localhost previews and the rare browser that gates clipboard write
  // behind a user gesture more strictly than the Permissions API reports.
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (_) {
    return false;
  }
}

/**
 * One-shot copy + toast notification. Use when there is no inline button
 * state to morph (e.g. a small copy icon next to a long readout). Dwell is
 * the canonical 1600ms so every toast across the app reads the same.
 *
 * @param {string} text                 - the string to copy
 * @param {object} [opts]
 * @param {string} [opts.label]         - success toast title (default "Copied")
 * @param {string} [opts.errorLabel]    - error toast title (default "Copy failed")
 * @param {string} [opts.successMessage] - optional secondary message under the title
 * @returns {Promise<boolean>}
 */
export async function copyWithFeedback(text, opts = {}) {
  const ok = await copyToClipboard(text);
  const label = opts.label || 'Copied';
  const errorLabel = opts.errorLabel || 'Copy failed';
  if (ok) {
    toast.success(opts.successMessage || label, {
      title: opts.successMessage ? label : undefined,
      duration: COPY_DWELL_MS.toast,
    });
  } else {
    toast.error('Your browser blocked the clipboard write. Select the text and copy manually.', {
      title: errorLabel,
    });
  }
  return ok;
}

export default copyWithFeedback;
