// Dependabot PR verifier (human-approved gate).
//
// Reads (prepared by the workflow): /tmp/base-lock.json, /tmp/head-lock.json,
// /tmp/changed.txt, plus Dependabot metadata via env. Produces a verdict, a sticky
// PR comment, and a label (dependabot-verified | dependabot-needs-review). It does
// NOT merge and exits 0 even on a "needs review" verdict -- the human is the gate;
// this only informs them. The CI "Frontend" check is the objective oracle; this
// script's role is scope + protect-the-gate + supply-chain delta + surfacing CI.
//
// Security: never runs PR code or `npm install`; Dependabot-controlled strings
// (dependency names) only ever land in a comment file, never in a shell command.

import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync, appendFileSync, existsSync } from 'node:fs'

const REPO = process.env.GH_REPO
const PR = process.env.PR
const HEAD_SHA = process.env.HEAD_SHA
const DEP_TYPE = (process.env.DEP_TYPE || '').trim()
const UPDATE_TYPE = (process.env.UPDATE_TYPE || '').trim()
const DEP_NAMES = (process.env.DEP_NAMES || '').trim()
const DEP_ECOSYSTEM = (process.env.DEP_ECOSYSTEM || '').trim()
const DEP_DIRECTORY = (process.env.DEP_DIRECTORY || '').trim()

// Trusted-context invariant: REPO/PR/HEAD_SHA come from the GitHub event, not PR
// free-text. Assert their shape so the `gh` execSync calls below can never carry shell
// metacharacters -- making input-safety explicit rather than incidental. (Dependabot
// free-text like DEP_NAMES never reaches a shell; it only lands in the comment body.)
if (!/^[\w.-]+\/[\w.-]+$/.test(REPO || '')) { console.error(`bad GH_REPO: ${REPO}`); process.exit(1) }
if (!/^[0-9a-f]{40}$/.test(HEAD_SHA || '')) { console.error(`bad HEAD_SHA: ${HEAD_SHA}`); process.exit(1) }
if (!/^\d+$/.test(PR || '')) { console.error(`bad PR: ${PR}`); process.exit(1) }

const FRONTEND = 'frontend'
const ALLOWED = new Set([`${FRONTEND}/package.json`, `${FRONTEND}/package-lock.json`])
const CI_FRONTEND_CHECK = 'Frontend (sandbox guard + build)'
const MARKER = '<!-- dependabot-verify -->'
const LABEL_OK = 'dependabot-verified'
const LABEL_REVIEW = 'dependabot-needs-review'

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const trySh = (cmd) => { try { return sh(cmd) } catch (e) { console.error(`(non-fatal) ${cmd}\n  ${e.message}`); return null } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const strip = (k) => k.replace(/^node_modules\//, '')

// ---- 1. changed files: scope + protect-the-gate -----------------------------
const changed = readFileSync('/tmp/changed.txt', 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
const outOfScope = changed.filter((f) => !ALLOWED.has(f))
const gatePatterns = [/^\.github\//, /(^|\/)ci\.yml$/, /\.test\.[cm]?[jt]sx?$/, /(^|\/)__tests__\//, /(^|\/)tests\//, /scripts\/check-/, /\.eslintrc|eslint\.config\./]
const touchesGate = changed.filter((f) => gatePatterns.some((re) => re.test(f)))

// ---- 2. supply-chain delta (base vs head lockfile) --------------------------
let added = [], removed = [], changedV = [], lockErr = null
try {
  const base = JSON.parse(readFileSync('/tmp/base-lock.json', 'utf8')).packages
  const head = JSON.parse(readFileSync('/tmp/head-lock.json', 'utf8')).packages
  // Guard a FALSE GREEN: a lockfile without a populated `.packages` map (npm
  // lockfileVersion < 2) would yield {} and silently report "0 added". Fail safe instead.
  if (!base || !head || Object.keys(base).length === 0 || Object.keys(head).length === 0) {
    throw new Error('lockfile has no populated `.packages` map (npm lockfileVersion < 2?); cannot compute the supply-chain delta')
  }
  const bk = new Set(Object.keys(base)), hk = new Set(Object.keys(head))
  added = [...hk].filter((k) => k && !bk.has(k)).map(strip).sort()
  removed = [...bk].filter((k) => k && !hk.has(k)).map(strip).sort()
  changedV = [...bk].filter((k) => k && hk.has(k) && base[k].version !== head[k].version)
    .map((k) => `${strip(k)}: ${base[k].version} -> ${head[k].version}`).sort()
} catch (e) { lockErr = e.message }

// ---- 3. CI oracle: the repo's own Frontend check on the PR head -------------
async function readFrontendConclusion() {
  // ~10 min budget (cold frontend builds can exceed 5 min); env-tunable for tests.
  const iters = Math.max(1, parseInt(process.env.CI_POLL_ITERS || '20', 10))
  let seen = false
  for (let i = 0; i < iters; i++) {
    const raw = trySh(`gh api "repos/${REPO}/commits/${HEAD_SHA}/check-runs?per_page=100"`)
    if (raw) {
      let runs = []
      try { runs = (JSON.parse(raw).check_runs || []) } catch { /* ignore */ }
      const fe = runs.find((r) => r.name === CI_FRONTEND_CHECK)
      if (fe) { seen = true; if (fe.status === 'completed') return fe.conclusion || 'unknown' }
    }
    if (i < iters - 1) await sleep(30000)
  }
  // Distinguish a still-running check from one that never appeared (name drift / CI skipped).
  return seen ? 'pending' : 'missing'
}
const ciConclusion = await readFrontendConclusion()

// ---- 4. verdict -------------------------------------------------------------
const reasons = []
if (outOfScope.length) reasons.push(`Changes ${outOfScope.length} file(s) outside the frontend dep manifest/lockfile: \`${outOfScope.join('`, `')}\``)
if (touchesGate.length) reasons.push(`Touches the CI/test gate (protected): \`${touchesGate.join('`, `')}\` - a dependency bump must never edit the oracle that approves it.`)
if (lockErr) reasons.push(`Could not parse lockfiles for the supply-chain delta (${lockErr}).`)
else if (added.length) reasons.push(`Introduces ${added.length} NEW package(s): \`${added.slice(0, 12).join('`, `')}\`${added.length > 12 ? ' …' : ''}`)
// Money-path posture: fetch-metadata reports the HIGHEST-priority dependency-type, so a
// grouped PR with ANY production dep yields 'direct:production'. Anything that is not a
// PURE dev-dependency is intentionally flagged for human review, never auto-verified.
if (DEP_TYPE && DEP_TYPE !== 'direct:development') reasons.push(`dependency-type is \`${DEP_TYPE}\` (not a pure dev-dependency) - weigh runtime / money-path impact.`)
if (ciConclusion === 'missing') reasons.push(`CI check \`${CI_FRONTEND_CHECK}\` was not found on the head commit (renamed, or CI did not run). Need it green.`)
else if (ciConclusion !== 'success') reasons.push(`CI \`${CI_FRONTEND_CHECK}\` is \`${ciConclusion}\` (need \`success\`).`)

const verified = reasons.length === 0
const label = verified ? LABEL_OK : LABEL_REVIEW
const otherLabel = verified ? LABEL_REVIEW : LABEL_OK

// ---- 5. comment + label -----------------------------------------------------
const fmtList = (arr, n = 25) => arr.length ? arr.slice(0, n).map((x) => `- \`${x}\``).join('\n') + (arr.length > n ? `\n- … (+${arr.length - n} more)` : '') : '_none_'
const body = `${MARKER}
## ${verified ? '✅ Dependabot PR verified - safe to merge (your approval required)' : '⚠️ Dependabot PR needs human review'}

**This is a human-approved gate. Nothing is merged automatically.** ${verified
  ? 'All automated checks passed; merge when you are happy.'
  : 'Resolve the items below, or merge deliberately after reviewing them.'}

| Check | Result |
|---|---|
| Scope (frontend deps only) | ${outOfScope.length ? '❌ out of scope' : '✅ frontend/package.json + lockfile only'} |
| Protect-the-gate (no CI/test edits) | ${touchesGate.length ? '❌ touches gate' : '✅ untouched'} |
| Supply-chain: 0 new packages | ${lockErr ? '⚠️ lockfile parse error' : (added.length ? `❌ ${added.length} added` : '✅ 0 added')} |
| CI \`${CI_FRONTEND_CHECK}\` | ${ciConclusion === 'success' ? '✅ success' : `⚠️ ${ciConclusion}`} |
| dependency-type | \`${DEP_TYPE || 'n/a'}\` ${UPDATE_TYPE ? `(\`${UPDATE_TYPE}\`)` : ''} |

${reasons.length ? `### Why it needs review\n${reasons.map((r) => `- ${r}`).join('\n')}\n` : ''}
<details><summary>Supply-chain delta (${DEP_ECOSYSTEM || 'npm'} @ ${DEP_DIRECTORY || '/frontend'})</summary>

**Version-changed (${changedV.length}):**
${fmtList(changedV)}

**Removed (${removed.length}):**
${fmtList(removed)}

**Added (${added.length}):**
${fmtList(added)}
</details>

> ⚠️ Residual blind spot (pre-existing, applies to every merge): no gate runs the rolldown-minified **in-app** money-path bundle (\`dist/assets/*.js\`). The byte-parity gate covers the cold-recovery tool + source, not the shipped minified bytes. Low risk for a minor bump; weigh it for any runtime-dependency change.

<sub>Posted by \`.github/workflows/dependabot-verify.yml\`. Verdict is advisory; you are the merge gate.</sub>`

writeFileSync('/tmp/dependabot-verify-body.md', body)

// ensure labels exist (idempotent), then set them
trySh(`gh label create ${LABEL_OK} --color 0e8a16 --description "Dependabot PR passed the automated verify gate; awaiting human merge" --force`)
trySh(`gh label create ${LABEL_REVIEW} --color d93f0b --description "Dependabot PR needs human review before merge" --force`)
trySh(`gh pr edit ${PR} --add-label ${label} --remove-label ${otherLabel}`)

// sticky comment (edit the bot's previous one if present)
const posted = trySh(`gh pr comment ${PR} --edit-last --create-if-none --body-file /tmp/dependabot-verify-body.md`)
if (posted === null) trySh(`gh pr comment ${PR} --body-file /tmp/dependabot-verify-body.md`)

// run-page summary
if (process.env.GITHUB_STEP_SUMMARY && existsSync('/tmp/dependabot-verify-body.md')) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, body)
}

console.log(`verdict: ${verified ? 'VERIFIED' : 'NEEDS REVIEW'} | label=${label} | ci=${ciConclusion} | added=${added.length} | removed=${removed.length} | changed=${changedV.length}`)
// Always exit 0: the human is the gate; this step informs, it does not block.
process.exit(0)
