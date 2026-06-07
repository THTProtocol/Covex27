# HERMES_MASTER_AUDIT_FIXES_AND_VISION_PROMPT.md
# THE ULTIMATE MASTER PROMPT — Post-Audit Fixes + Full Vision for Covex Mainnet Production
# This prompt incorporates the comprehensive system audit (AUDIT_REPORT_COMPREHENSIVE.md), all fixes applied, and sets the complete production vision in stone.
# Use ONLY this prompt for future runs. All prior HERMES_* files are historical and should remain deleted.

**EXECUTIVE CONTEXT (from full audit at afb7561 / 6cdd6c1):**
The audit found **NO CRITICAL BUGS**. Core systems (server auth paywall with one-pay-one-deploy tokens, 3-net isolation, mainnet security blocks on dev wallets, free deploy with visuals, PremiumBuilder sandbox + disclosure enforcement, reality-labeled circuits, backend indexing/payment/metadata, 6 real snarkjs verifiers) are solid and working.
Gaps were honest limitations (mostly oracle coverage for 65+ circuits, SHA256 multi-oracle stub, hardcoded dispatch, minor field drops, placeholders, icon inconsistency). These have now been fixed in this run (see fixes section below).
The platform is advanced: 85+ circuits with reality badges (full-zk/hybrid/oracle-attested), sandbox composition, full transparent disclosures for top visibility, free covenants fully interactable with simple visuals from free tier, paid rich metadata persistence.
Goal of this prompt: Apply/verify the audit fixes across all code, ensure "all circuits work 100%" (oracle paths for every type), clean any remaining inconsistencies, make free tier 100% delightful and interactive, polish visuals/icons everywhere, then full triple-sync deploy + commit on all 3 places (local, GitHub THTProtocol/Covex27, Hetzner/hightable.pro). Update this prompt + audit report with massive COMPLETED BLOCK containing final SHAs, evidence (curls, "free covenant now has working claim/resolve + accent", "all 85 circuits now resolve via oracle/generic path", "no unsupported errors"), and the locked-in vision.

**CRITICAL READ ORDER (strict — use tools, note SHAs/line numbers/outputs, small verifiable steps only):**
1. This entire prompt.
2. The full audit report: /home/kasparov/Covex27/AUDIT_REPORT_COMPREHENSIVE.md (read all sections — ZK inventory, oracle support, all GAPs 1-8, working items, recommendations).
3. Current code state (local + Hetzner via ssh):
   - git status --short && git log --oneline -5 && git rev-parse --short HEAD
   - ssh root@178.105.76.81 'cd /mnt/HC_Volume_105579109/Covex27 && git status && git log --oneline -3 && git rev-parse --short HEAD && ls HERMES_*.md 2>/dev/null | wc -l'
   - Live: curl -s https://hightable.pro/api/health ; POST /api/auth-session with mainnet-paying addr ; check /covenant for a free one ; Pricing tier icons ; Deploy free form for visuals ; CovexTerminal circuit grid for reality badges.
4. Key files to audit/fix (read relevant sections + grep for patterns):
   - backend/src/oracle.rs (the verify_and_sign_handler match — ensure catch-all for all 85, especially new oracle-attested like vrf_*, dao_*, liquidation_*, state_*, gating_* etc. Update error messages and supported list).
   - backend/src/signer.rs (SignAndBroadcastRequest — ensure description/accent/ui_preset are accepted, not silently dropped; forward to metadata if possible).
   - frontend/src/pages/PremiumBuilder.jsx (NET_TREASURIES — ensure no dummy placeholders; use getTreasuryForNet or dynamic like Pricing; mainnet real address).
   - frontend/src/pages/Explorer.jsx + CovenantInteractive.jsx (add lucide tier icons Crown/Star/Terminal/Eye consistent with Pricing/PaidBuilder; use in PAID VERIFIED badges and tier labels).
   - frontend/src/components/CovexTerminal.jsx (ZK_CIRCUIT_TYPES reality + new circuits; oracle submit logic accepts any circuit_type for attested; generateSilverScript handles new ones; timer/payout wiring).
   - frontend/src/pages/Deploy.jsx + CreateCovenant.jsx (free visual fields name/desc/accent/ui_preset collected and sent in FREE payload; metadata roundtrip).
   - frontend/src/pages/CovenantInteractive.jsx (free !paid 'interact' tab: basic claim/resolve/state/logs fully wired and working; limited visual swatches apply from metadata/config; supports free fresh + "just there" covenants).
   - backend/src/main.rs (CovenantMetadataInput + /covenant-metadata handler — ensure all fields including free visuals + reality persist and roundtrip to frontend).
   - signer.rs / main.rs dispatch for FREE tier metadata.
   - docs/ and deploy/ (update any mainnet notes; ensure no TN leakage in prod paths).
   - Any other files with hardcoded circuit lists, old error messages, or inconsistent tier rendering.
5. zk/ and examples/ (verify artifacts for merkle/range; note ceremony status for range).
6. Live Hetzner details: df, nginx root, current BIND_ADDR + KASPA_* env for mainnet, journal for oracle/circuit/auth.

**Current State (post-prior work, pre-this-fix run — do not regress working items):**
- 85 circuits with reality labels + UI badges (5 full-zk with real artifacts, 17 hybrid, 63 oracle-attested).
- Server auth paywall solid (tokens, consume, capacity, no bypass).
- Free: Deploy/Create with visuals (accent/preset), post-deploy basic interact in CovenantInteractive.
- Paid: PremiumBuilder sandbox + full disclosure enforcement + metadata.
- Backend: per-net, mainnet security (dev blocked), metadata persistence, 6 real verifiers (merkle x3, range x2).
- Tier visuals: Nice icons in Pricing/Paid/Premium, CSS in Explorer (inconsistent).
- Gaps per audit (now to be fixed in this run):
  - Oracle only explicitly listed ~14 types → most new circuits (poker, VRF, timelock, liquidation, dao, gating, state, wasm, etc.) → "Unsupported circuit type" error. 65+ had no path.
  - Hardcoded match in oracle.rs (no dynamic).
  - Multi-oracle: SHA256 stub (not real BLS) — functional but insecure.
  - Signer drops description/accent/ui_preset.
  - PremiumBuilder had dummy TN10/mainnet treasuries.
  - Explorer/CovenantInteractive lacked tier lucide icons.
- 3-net + mainnet: Working (per-net DB, mainnet real wallets only, PC node indexing ready via env).
- All critical verified working (see audit).

**Fixes to Apply (make "all circuits work 100%", eliminate gaps/inconsistencies):**
1. **Oracle Coverage 100% (fix GAP 1 + 2 — highest priority)**:
   - In backend/src/oracle.rs: Expand the match in verify_and_sign_handler.
     - Keep explicit full-ZK for merkle_* and range_* (real snarkjs).
     - For the big list of games + all new oracle-attested/hybrid (vrf_dice_roll, vrf_card_deal, dao_multisig, utxo_spend_auth, covenant_state_hash, script_constraint_proof, liquidation_threshold, yield_compounding, basic_state_machine, wasm_predicate, nft_gating, reputation_threshold, timelock_*, schnorr, pedersen, etc.): treat as oracle-attested.
       - Accept requested_outcome (0/1/2 or custom).
       - No ZK verify (client/off-chain did the work or hybrid property proof separate).
       - Always proceed to signing (produce real SHA256 sig for covenant witness).
     - Update the catch-all `other` (remove the long "Currently supported" error that rejected new circuits). Instead: if no requested_outcome for non-full-zk, give helpful error; else accept and sign.
     - Update comments and any error messages to say "All 85+ circuits now supported via full-zk (where artifacts) or oracle-attestation (generic path for attested/hybrid). Reality label in UI tells the truth."
     - For hybrid types that have ZK parts (e.g. collateral/liquidation use range_proof): do the ZK verify + oracle sign for outcome.
   - Make dispatch less hardcoded: Add a helper `isFullZkCircuit(circuit: string)` and `isOracleAttested(circuit: string)` (or use the frontend reality but since backend, hardcode the known full-zk list + fallback for everything else).
   - Test: Any circuit id from ZK_CIRCUIT_TYPES now succeeds in /api/oracle/verify-and-sign when requested_outcome provided. No more "Unsupported" for new ones.

2. **Multi-Oracle (fix GAP 2 — document + improve if possible)**:
   - In oracle.rs: Keep the SHA256 logic (functional for API shape and testing multi-oracle federation).
   - Add prominent comment: "NOTE: This uses SHA256(key||message) as signature for API compatibility and testing. NOT real BLS threshold cryptography. For production multi-oracle use real BLS aggregation (future work). Currently sufficient for threshold weight checks on attested outcomes."
   - If time: Expose in UI (CovenantInteractive oracle section) a warning "Multi-oracle is currently SHA256 stub (see audit)".
   - Ensure multi_oracle path still works for any circuit now that catch-all accepts them.

3. **Signer Metadata Fields (fix minor GAP 4)**:
   - In backend/src/signer.rs: The struct now accepts description, accent, ui_preset (from prior fix in this session).
   - In the handler (sign_and_broadcast_handler): Log or forward them (e.g., after successful tx, optionally call internal metadata path or include in response). At minimum, do not silently drop — add to the covenant_name logic or a log.
   - Ensure FREE tier free visuals (accent/preset) roundtrip correctly to metadata.

4. **Treasury Placeholders (fix minor GAP 5)**:
   - In frontend/src/pages/PremiumBuilder.jsx: Use dynamic getTreasuryForNet(net) (or copy the logic from Pricing.jsx). Hardcode the real mainnet one; TN10 can share TN12 dev treasury. Remove dummy 'v8v8v8...' strings. Add comment "Production values come from env on backend; these are for QR/display consistency."

5. **Tier Icons Consistency (fix minor GAP 6 + 7)**:
   - Explorer.jsx: Added lucide icons (Crown/Star/Terminal) next to PAID VERIFIED and tier labels in cards (done in this session).
   - CovenantInteractive.jsx: Added Crown/Star import + TierIcon logic; display icon next to effective tier label or in paid banner (done).
   - Ensure in free vs paid views the icons appear for BUILDER/PRO/MAX/FREE.
   - Bonus: If any other tier display (e.g., headers), use the same 4-icon map.

6. **Range Proof / Other Low Gaps**:
   - Ensure verify_range_proof handles missing artifacts gracefully (it already returns error with clear message per audit — keep).
   - Update any "ceremony in progress" comments to reference the audit.
   - In ZK_CIRCUIT_TYPES (if needed): Ensure all new circuits have correct reality + description mentioning "oracle-attested (generic path supported)".

7. **Free Tier Full Interactivity + Visuals (from prior user requests + audit "working" confirmation)**:
   - Verify/enhance in CovenantInteractive.jsx: For !canCustomize (free), the 'interact' tab has working basic claim/resolve/timeout/state viewer buttons (call generic oracle or local logic; show real outcomes).
   - Visuals from free tier: Deploy/CreateCovenant collect + send name/desc/accent/ui_preset for FREE; CovenantInteractive applies them (accent for colors, preset for layout) from metadata. Works for freshly created AND existing "just there" free covenants in Explorer.
   - No circuits for free (correct), but basic resolution makes them "fully interactable".

8. **General Polish from Audit Recommendations**:
   - Add circuit registry comment or small helper in oracle.rs for future (even if still somewhat hardcoded, the catch-all makes adding new ones "just work" for attested).
   - Ensure all frontend circuit lists match backend reality (badges already accurate).
   - Mainnet: Confirm no dev paths leak (already blocked).
   - Update the AUDIT_REPORT_COMPREHENSIVE.md in place with "FIXED" notes next to each gap after changes.

**After All Fixes**:
- Build frontend (npm run build), backend (cargo build --release).
- Full triple-sync deploy on all 3 places:
  - Local: changes + commit.
  - GitHub: push (includes cleanup if any remaining old files).
  - Hetzner: ssh, git reset --hard origin/master, frontend build + cp -r dist/* /root/htp/public (confirm root first via nginx config), backend build, systemctl restart covex-backend, journal check, health curl.
- Live verification on hightable.pro:
  - All 85 circuits now resolve without "Unsupported" (test a new one like poker_v1 or vrf_dice_roll via studio/terminal → submit oracle → success sig).
  - Free covenant: create with visuals → viewer shows claim/resolve + accent applied.
  - Tier icons visible in Explorer + CovenantInteractive.
  - No dummy treasuries.
  - Metadata (reality etc.) persisted and displayed.
  - 3-net + mainnet security still perfect.
  - Auth paywall, disclosures, sandbox all working.
- Commit message: "audit: fixed all gaps from COMPREHENSIVE_AUDIT (oracle coverage for 85 circuits via generic attested path, signer fields, treasuries, tier icons in Explorer/CI, multi-oracle doc). Free fully interactable + visuals. All 3 places synced."
- Update this prompt file + AUDIT_REPORT_COMPREHENSIVE.md with huge **COMPLETED BLOCK**:
  - Date + final SHAs (local/GitHub/Hetzner — must match after reset).
  - List of every fix applied with before/after.
  - Evidence: curls (oracle success for new circuit, free covenant viewer with interactions, auth, health), "all circuits now work 100% — no unsupported errors", "free covenants fully interactive with visuals from free tier", mainnet flow confirmation.
  - Honest remaining (e.g., "real BLS for multi-oracle is future; range full ceremony pending; more full-zk artifacts require ceremonies").
  - Vision locked: Mainnet production platform with honest powerful circuits, delightful free tier, full transparency, server-verified paywall, etc.

**Strict Rules (enforce like all prior successful masters)**:
- Small steps + verify after every change (build, specific curl for oracle/circuit, description of UI).
- Read files with tools first (never edit blind).
- Preserve everything verified working in the audit.
- Mainnet focus in all docs/changes.
- At end: identical state on local/GitHub/Hetzner. Only this master prompt + clean code.

**Begin right now with step 1 (read the full audit report completely, current git/live state on both sides, inspect the oracle.rs match and the 4 gap areas in signer/PremiumBuilder/Explorer/CI, then start applying fixes one file at a time).**

You now have the complete post-audit picture. Fix the gaps so "all circuits work 100%", eliminate inconsistencies, make the free experience perfect, then lock the vision with the COMPLETED BLOCK and the triple-sync.

This prompt + the resulting state is the final stone for Covex.

BEGIN.