/**
 * Lazy-route lucide icons - per-icon deep imports for CODE-SPLIT pages/panels/components.
 *
 * Same idea as lib/icons.js (the eager shell), but kept in a SEPARATE module that the
 * always-mounted shell never imports. Lazy routes and the components they pull (EnforcedDeploy,
 * CovexTerminal, CovenantInteractive, the docs / marketing pages, the game arenas, the deploy /
 * sandbox panels, etc.) deep-import their icons from here instead of `from 'lucide-react'`.
 *
 * Why a separate file from icons.js: each export is a named per-icon re-export, so tree-shaking
 * gives every lazy chunk only the icons it references. With nothing static importing the
 * lucide-react barrel, the full 603KB barrel becomes reachable ONLY through the Studio's lazy
 * IconPicker (lib/lucideLazy.jsx's cached `import('lucide-react')`) - it never loads on a normal
 * route navigation. Holding these here (not icons.js) means growing the route set never
 * reshuffles the eager shell's shared graph / entry chunk.
 *
 * Do NOT add a static `from 'lucide-react'` to a route or shared component - add the icon here
 * (grep `default as <Name>` in node_modules/lucide-react/dist/esm/lucide-react.mjs for the
 * canonical kebab module). The check-no-lucide-barrel CI guard enforces this.
 */
export { default as Activity } from 'lucide-react/dist/esm/icons/activity.mjs';
export { default as AlertTriangle } from 'lucide-react/dist/esm/icons/triangle-alert.mjs';
export { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left.mjs';
export { default as ArrowLeftRight } from 'lucide-react/dist/esm/icons/arrow-left-right.mjs';
export { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right.mjs';
export { default as ArrowUpRight } from 'lucide-react/dist/esm/icons/arrow-up-right.mjs';
export { default as Award } from 'lucide-react/dist/esm/icons/award.mjs';
export { default as BadgeCheck } from 'lucide-react/dist/esm/icons/badge-check.mjs';
export { default as Ban } from 'lucide-react/dist/esm/icons/ban.mjs';
export { default as Banknote } from 'lucide-react/dist/esm/icons/banknote.mjs';
export { default as Blocks } from 'lucide-react/dist/esm/icons/blocks.mjs';
export { default as BookMarked } from 'lucide-react/dist/esm/icons/book-marked.mjs';
export { default as BookOpen } from 'lucide-react/dist/esm/icons/book-open.mjs';
export { default as Box } from 'lucide-react/dist/esm/icons/box.mjs';
export { default as Boxes } from 'lucide-react/dist/esm/icons/boxes.mjs';
export { default as Building2 } from 'lucide-react/dist/esm/icons/building-2.mjs';
export { default as Calendar } from 'lucide-react/dist/esm/icons/calendar.mjs';
export { default as CalendarCheck } from 'lucide-react/dist/esm/icons/calendar-check.mjs';
export { default as Check } from 'lucide-react/dist/esm/icons/check.mjs';
export { default as CheckCircle2 } from 'lucide-react/dist/esm/icons/circle-check.mjs';
export { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down.mjs';
export { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right.mjs';
export { default as Circle } from 'lucide-react/dist/esm/icons/circle.mjs';
export { default as CircleDashed } from 'lucide-react/dist/esm/icons/circle-dashed.mjs';
export { default as CircleDot } from 'lucide-react/dist/esm/icons/circle-dot.mjs';
export { default as Clipboard } from 'lucide-react/dist/esm/icons/clipboard.mjs';
export { default as Clock } from 'lucide-react/dist/esm/icons/clock.mjs';
export { default as Code2 } from 'lucide-react/dist/esm/icons/code-xml.mjs';
export { default as Coins } from 'lucide-react/dist/esm/icons/coins.mjs';
export { default as Compass } from 'lucide-react/dist/esm/icons/compass.mjs';
export { default as Copy } from 'lucide-react/dist/esm/icons/copy.mjs';
export { default as Cpu } from 'lucide-react/dist/esm/icons/cpu.mjs';
export { default as Crown } from 'lucide-react/dist/esm/icons/crown.mjs';
export { default as Database } from 'lucide-react/dist/esm/icons/database.mjs';
export { default as Dices } from 'lucide-react/dist/esm/icons/dices.mjs';
export { default as Disc } from 'lucide-react/dist/esm/icons/disc.mjs';
export { default as Download } from 'lucide-react/dist/esm/icons/download.mjs';
export { default as Eraser } from 'lucide-react/dist/esm/icons/eraser.mjs';
export { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link.mjs';
export { default as Eye } from 'lucide-react/dist/esm/icons/eye.mjs';
export { default as EyeOff } from 'lucide-react/dist/esm/icons/eye-off.mjs';
export { default as FileCode } from 'lucide-react/dist/esm/icons/file-code.mjs';
export { default as FileCode2 } from 'lucide-react/dist/esm/icons/file-code-corner.mjs';
export { default as FileKey } from 'lucide-react/dist/esm/icons/file-key.mjs';
export { default as FileSearch } from 'lucide-react/dist/esm/icons/file-search.mjs';
export { default as FileText } from 'lucide-react/dist/esm/icons/file-text.mjs';
export { default as Fingerprint } from 'lucide-react/dist/esm/icons/fingerprint-pattern.mjs';
export { default as Flag } from 'lucide-react/dist/esm/icons/flag.mjs';
export { default as FlaskConical } from 'lucide-react/dist/esm/icons/flask-conical.mjs';
export { default as Gamepad2 } from 'lucide-react/dist/esm/icons/gamepad-2.mjs';
export { default as Gavel } from 'lucide-react/dist/esm/icons/gavel.mjs';
export { default as GitBranch } from 'lucide-react/dist/esm/icons/git-branch.mjs';
export { default as Globe } from 'lucide-react/dist/esm/icons/globe.mjs';
export { default as Grid3x3 } from 'lucide-react/dist/esm/icons/grid-3x3.mjs';
export { default as GripVertical } from 'lucide-react/dist/esm/icons/grip-vertical.mjs';
export { default as Hammer } from 'lucide-react/dist/esm/icons/hammer.mjs';
export { default as Hand } from 'lucide-react/dist/esm/icons/hand.mjs';
export { default as Handshake } from 'lucide-react/dist/esm/icons/handshake.mjs';
export { default as Hash } from 'lucide-react/dist/esm/icons/hash.mjs';
export { default as HeartPulse } from 'lucide-react/dist/esm/icons/heart-pulse.mjs';
export { default as Hexagon } from 'lucide-react/dist/esm/icons/hexagon.mjs';
export { default as Hourglass } from 'lucide-react/dist/esm/icons/hourglass.mjs';
export { default as IdCard } from 'lucide-react/dist/esm/icons/id-card.mjs';
export { default as Image } from 'lucide-react/dist/esm/icons/image.mjs';
export { default as Info } from 'lucide-react/dist/esm/icons/info.mjs';
export { default as Key } from 'lucide-react/dist/esm/icons/key.mjs';
export { default as KeyRound } from 'lucide-react/dist/esm/icons/key-round.mjs';
export { default as Landmark } from 'lucide-react/dist/esm/icons/landmark.mjs';
export { default as Layers } from 'lucide-react/dist/esm/icons/layers.mjs';
export { default as Layout } from 'lucide-react/dist/esm/icons/panels-top-left.mjs';
export { default as LayoutGrid } from 'lucide-react/dist/esm/icons/layout-grid.mjs';
export { default as LayoutTemplate } from 'lucide-react/dist/esm/icons/layout-template.mjs';
export { default as LifeBuoy } from 'lucide-react/dist/esm/icons/life-buoy.mjs';
export { default as Link2 } from 'lucide-react/dist/esm/icons/link-2.mjs';
export { default as ListChecks } from 'lucide-react/dist/esm/icons/list-checks.mjs';
export { default as Loader } from 'lucide-react/dist/esm/icons/loader.mjs';
export { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-circle.mjs';
export { default as Lock } from 'lucide-react/dist/esm/icons/lock.mjs';
export { default as Mail } from 'lucide-react/dist/esm/icons/mail.mjs';
export { default as MapPin } from 'lucide-react/dist/esm/icons/map-pin.mjs';
export { default as MessageCircle } from 'lucide-react/dist/esm/icons/message-circle.mjs';
export { default as Monitor } from 'lucide-react/dist/esm/icons/monitor.mjs';
export { default as MoreHorizontal } from 'lucide-react/dist/esm/icons/ellipsis.mjs';
export { default as MousePointerClick } from 'lucide-react/dist/esm/icons/mouse-pointer-click.mjs';
export { default as Network } from 'lucide-react/dist/esm/icons/network.mjs';
export { default as Palette } from 'lucide-react/dist/esm/icons/palette.mjs';
export { default as PieChart } from 'lucide-react/dist/esm/icons/chart-pie.mjs';
export { default as Play } from 'lucide-react/dist/esm/icons/play.mjs';
export { default as Plus } from 'lucide-react/dist/esm/icons/plus.mjs';
export { default as QrCode } from 'lucide-react/dist/esm/icons/qr-code.mjs';
export { default as Quote } from 'lucide-react/dist/esm/icons/quote.mjs';
export { default as Radio } from 'lucide-react/dist/esm/icons/radio.mjs';
export { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw.mjs';
export { default as Repeat } from 'lucide-react/dist/esm/icons/repeat.mjs';
export { default as Rocket } from 'lucide-react/dist/esm/icons/rocket.mjs';
export { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw.mjs';
export { default as Rows3 } from 'lucide-react/dist/esm/icons/rows-3.mjs';
export { default as Ruler } from 'lucide-react/dist/esm/icons/ruler.mjs';
export { default as Save } from 'lucide-react/dist/esm/icons/save.mjs';
export { default as Scale } from 'lucide-react/dist/esm/icons/scale.mjs';
export { default as Scissors } from 'lucide-react/dist/esm/icons/scissors.mjs';
export { default as Search } from 'lucide-react/dist/esm/icons/search.mjs';
export { default as Send } from 'lucide-react/dist/esm/icons/send.mjs';
export { default as Server } from 'lucide-react/dist/esm/icons/server.mjs';
export { default as Settings } from 'lucide-react/dist/esm/icons/settings.mjs';
export { default as Share2 } from 'lucide-react/dist/esm/icons/share-2.mjs';
export { default as Shield } from 'lucide-react/dist/esm/icons/shield.mjs';
export { default as ShieldAlert } from 'lucide-react/dist/esm/icons/shield-alert.mjs';
export { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check.mjs';
export { default as Ship } from 'lucide-react/dist/esm/icons/ship.mjs';
export { default as Shuffle } from 'lucide-react/dist/esm/icons/shuffle.mjs';
export { default as Smartphone } from 'lucide-react/dist/esm/icons/smartphone.mjs';
export { default as Snowflake } from 'lucide-react/dist/esm/icons/snowflake.mjs';
export { default as Spade } from 'lucide-react/dist/esm/icons/spade.mjs';
export { default as Sparkles } from 'lucide-react/dist/esm/icons/sparkles.mjs';
export { default as Star } from 'lucide-react/dist/esm/icons/star.mjs';
export { default as Swords } from 'lucide-react/dist/esm/icons/swords.mjs';
export { default as Terminal } from 'lucide-react/dist/esm/icons/terminal.mjs';
export { default as TerminalSquare } from 'lucide-react/dist/esm/icons/square-terminal.mjs';
export { default as Timer } from 'lucide-react/dist/esm/icons/timer.mjs';
export { default as ToggleLeft } from 'lucide-react/dist/esm/icons/toggle-left.mjs';
export { default as ToggleRight } from 'lucide-react/dist/esm/icons/toggle-right.mjs';
export { default as TrendingDown } from 'lucide-react/dist/esm/icons/trending-down.mjs';
export { default as TrendingUp } from 'lucide-react/dist/esm/icons/trending-up.mjs';
export { default as Triangle } from 'lucide-react/dist/esm/icons/triangle.mjs';
export { default as Trophy } from 'lucide-react/dist/esm/icons/trophy.mjs';
export { default as Type } from 'lucide-react/dist/esm/icons/type.mjs';
export { default as Upload } from 'lucide-react/dist/esm/icons/upload.mjs';
export { default as Users } from 'lucide-react/dist/esm/icons/users.mjs';
export { default as Vote } from 'lucide-react/dist/esm/icons/vote.mjs';
export { default as Wallet } from 'lucide-react/dist/esm/icons/wallet.mjs';
export { default as Wand2 } from 'lucide-react/dist/esm/icons/wand-sparkles.mjs';
export { default as Workflow } from 'lucide-react/dist/esm/icons/workflow.mjs';
export { default as Wrench } from 'lucide-react/dist/esm/icons/wrench.mjs';
export { default as X } from 'lucide-react/dist/esm/icons/x.mjs';
export { default as XCircle } from 'lucide-react/dist/esm/icons/circle-x.mjs';
export { default as Zap } from 'lucide-react/dist/esm/icons/zap.mjs';
