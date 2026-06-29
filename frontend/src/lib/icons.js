/**
 * Eager-shell lucide icons - per-icon deep imports.
 *
 * The lucide-react BARREL entry (`import { X } from 'lucide-react'`) re-exports all
 * ~1960 icons, so any STATIC import of it from the entry graph drags the full 617KB
 * raw / 154KB gzip chunk onto the HOMEPAGE critical path (it gets modulepreloaded in
 * index.html). The searchable IconPicker in the covenant Studio still needs the full
 * barrel, but it loads it LAZILY via lib/lucideLazy.jsx's cached `import('lucide-react')`.
 *
 * The handful of icons the always-mounted shell (App nav, WalletButton, ToastContext,
 * BuildStepsRail, Explorer, TrustBadge, etc.) needs are pulled HERE from lucide-react's
 * per-icon ESM modules instead, so the eager graph never references the barrel entry.
 * With nothing statically importing the barrel, the bundler emits it as a chunk reachable
 * ONLY through lucideLazy's dynamic import - it leaves the homepage critical path entirely.
 *
 * Each export below points at lucide-react/dist/esm/icons/<kebab>.mjs (this package ships
 * one ESM module per icon, no `exports` map gating deep paths). The kebab module name is
 * the canonical icon; PascalCase aliases resolve to it (e.g. AlertTriangle -> triangle-alert,
 * CheckCircle2 -> circle-check, XCircle -> circle-x, Loader2 -> loader-circle,
 * ShieldQuestion -> shield-question-mark). The named exports here are drop-in compatible
 * with the old barrel named imports, so call sites change only the import specifier.
 *
 * To add an icon to the eager shell: add its line here mapped to the correct kebab module
 * (grep `default as <Name>` in node_modules/lucide-react/dist/esm/lucide-react.mjs to find
 * the canonical module). Do NOT re-introduce a static `from 'lucide-react'` in the shell.
 */
export { default as Activity } from 'lucide-react/dist/esm/icons/activity.mjs';
export { default as AlertTriangle } from 'lucide-react/dist/esm/icons/triangle-alert.mjs';
export { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left.mjs';
export { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right.mjs';
export { default as BadgeCheck } from 'lucide-react/dist/esm/icons/badge-check.mjs';
export { default as Boxes } from 'lucide-react/dist/esm/icons/boxes.mjs';
export { default as Check } from 'lucide-react/dist/esm/icons/check.mjs';
export { default as CheckCircle2 } from 'lucide-react/dist/esm/icons/circle-check.mjs';
export { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down.mjs';
export { default as Clock } from 'lucide-react/dist/esm/icons/clock.mjs';
export { default as Coins } from 'lucide-react/dist/esm/icons/coins.mjs';
export { default as Compass } from 'lucide-react/dist/esm/icons/compass.mjs';
export { default as Copy } from 'lucide-react/dist/esm/icons/copy.mjs';
export { default as Cpu } from 'lucide-react/dist/esm/icons/cpu.mjs';
export { default as Crown } from 'lucide-react/dist/esm/icons/crown.mjs';
export { default as Database } from 'lucide-react/dist/esm/icons/database.mjs';
export { default as Download } from 'lucide-react/dist/esm/icons/download.mjs';
export { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link.mjs';
export { default as Eye } from 'lucide-react/dist/esm/icons/eye.mjs';
export { default as FileKey } from 'lucide-react/dist/esm/icons/file-key.mjs';
export { default as Gamepad2 } from 'lucide-react/dist/esm/icons/gamepad-2.mjs';
export { default as Info } from 'lucide-react/dist/esm/icons/info.mjs';
export { default as KeyRound } from 'lucide-react/dist/esm/icons/key-round.mjs';
export { default as Landmark } from 'lucide-react/dist/esm/icons/landmark.mjs';
export { default as Layers } from 'lucide-react/dist/esm/icons/layers.mjs';
export { default as LayoutDashboard } from 'lucide-react/dist/esm/icons/layout-dashboard.mjs';
export { default as Link2 } from 'lucide-react/dist/esm/icons/link-2.mjs';
export { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-circle.mjs';
export { default as Lock } from 'lucide-react/dist/esm/icons/lock.mjs';
export { default as LogOut } from 'lucide-react/dist/esm/icons/log-out.mjs';
export { default as Menu } from 'lucide-react/dist/esm/icons/menu.mjs';
export { default as Moon } from 'lucide-react/dist/esm/icons/moon.mjs';
export { default as Palette } from 'lucide-react/dist/esm/icons/palette.mjs';
export { default as Play } from 'lucide-react/dist/esm/icons/play.mjs';
export { default as QrCode } from 'lucide-react/dist/esm/icons/qr-code.mjs';
export { default as Radio } from 'lucide-react/dist/esm/icons/radio.mjs';
export { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw.mjs';
export { default as Repeat } from 'lucide-react/dist/esm/icons/repeat.mjs';
export { default as Search } from 'lucide-react/dist/esm/icons/search.mjs';
export { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check.mjs';
export { default as ShieldQuestion } from 'lucide-react/dist/esm/icons/shield-question-mark.mjs';
export { default as Smartphone } from 'lucide-react/dist/esm/icons/smartphone.mjs';
export { default as Sparkles } from 'lucide-react/dist/esm/icons/sparkles.mjs';
export { default as Star } from 'lucide-react/dist/esm/icons/star.mjs';
export { default as Sun } from 'lucide-react/dist/esm/icons/sun.mjs';
export { default as Terminal } from 'lucide-react/dist/esm/icons/terminal.mjs';
export { default as TrendingUp } from 'lucide-react/dist/esm/icons/trending-up.mjs';
export { default as Trophy } from 'lucide-react/dist/esm/icons/trophy.mjs';
export { default as Users } from 'lucide-react/dist/esm/icons/users.mjs';
export { default as Wallet } from 'lucide-react/dist/esm/icons/wallet.mjs';
export { default as X } from 'lucide-react/dist/esm/icons/x.mjs';
export { default as XCircle } from 'lucide-react/dist/esm/icons/circle-x.mjs';
export { default as Zap } from 'lucide-react/dist/esm/icons/zap.mjs';
