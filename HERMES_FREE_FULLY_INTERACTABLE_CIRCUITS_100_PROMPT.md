# HERMES_FREE_FULLY_INTERACTABLE_CIRCUITS_100_PROMPT.md
# Fresh master prompt: Make ALL circuits work 100% (full wiring, generic oracle support for reality-labeled + new circuits), make free tier covenants (existing "just there" and freshly created) FULLY INTERACTABLE with basic claim/resolve/state viewer + simple visual changes (name, desc, accent, preset) available from the FREE tier in creation and viewer. Incorporate + build on all prior (reality labels, 11+ new useful Kaspa circuits, tier icon polish with Crown/Star/Terminal/Eye, metadata, sandbox, paywall, 3-net). Full implementation + triple-sync commit/deploy on all 3 places (local, GitHub, Hetzner/hightable.pro). Update this prompt + audit + previous masters with evidence.

**GOAL (verbatim user request)**: "make sure all the circuits work 100% make them work and make the free tier covenants that are just there or frshly created fully interactable and some simple visual changes can be done from the fee tier make sure you implement all of this and once you do it write out a full hermes prompt so he can incorporate it in all 3 places"

After this run, free covenants are delightful and interactive (basic but complete claim, timeout resolve, state/logs, simple visuals applied live + persisted via metadata). Paid circuits (with accurate reality badges) have end-to-end working flows (select in studio/terminal, generate, stake, play with timers, submit oracle/ ZK, claim with potReturn math). All changes identical on 3 places.

**CRITICAL READ ORDER (tools, document, small steps):**
1. This entire prompt.
2. Recent audit: /home/kasparov/Covex27/AUDIT_CIRCUITS_TIERS_SUGGESTIONS.md + the previous circuits fix prompt HERMES_CIRCUITS_FIX_ADD_TIER_POLISH_FINAL_PROMPT.md (and BEST_POSSIBLE etc). Base is the reality labels + 11 new circuits + tier icons + metadata fields already landed (SHAs ~60fb451 / 6cdd6c1).
3. Git + live first (local Covex27/ + ssh Hetzner):
   - git status, log -5, rev-parse.
   - Hetzner ssh: same + journal + health + current public bundle for "free interact" or new circuit strings.
   - Live: https://hightable.pro health, auth-session (paying addr), Pricing (tier icons), Explorer free cards, /covenant (test one), Deploy/Create for free visuals.
4. Key files (read sections):
   - frontend/src/pages/Deploy.jsx + CreateCovenant.jsx (free creation - add/ensure name/desc/accent/preset fields + send in payload).
   - frontend/src/pages/CovenantInteractive.jsx (main viewer - enhance 'interact' tab for !paid/free with basic claim/resolve buttons, state viewer, limited visual swatches/presets that apply to the page; load metadata for visuals on existing "just there" covenants).
   - frontend/src/components/CovexTerminal.jsx (circuits array with reality - ensure new + old 'oracle-attested' are selectable and submit-oracle uses the circuit id generically; timer/payout wiring in game UIs).
   - backend/src/main.rs + oracle.rs (metadata storage for free visuals + reality/category/artifacts; generic oracle sign fallback for any new 'oracle-attested' circuit id so they "work").
   - Explorer.jsx (free covenants show interact link + any visual from metadata).
   - PaidBuilder/PremiumBuilder (tier icons consistency).
5. Backend DB if needed for extra free metadata fields (use existing covenant metadata / ui_config).
6. Hetzner ssh details, nginx root, etc.

**Current Foundation (do not regress)**:
- Circuits: 85+ with reality: full-zk (6 with artifacts), hybrid, oracle-attested. New useful ones added (vrf_*, dao_multisig, liquidation_*, basic_state_machine, nft_gating, etc.). Badges in library/terminal. Sandbox composition.
- Tier visuals: Clean icons (Eye free, Terminal builder, Star pro, Crown max) in Pricing + Paid/Premium headers.
- Free creation: Basic SilverScript in Deploy/CreateCovenant; deploys with tier FREE, some metadata.
- Viewer (CovenantInteractive): 'interact' tab for free (stake/execute basic), terminal/builder paid-only. Some DEFAULT_UI_CONFIG for visuals (gated).
- Paywall: Server token, one-deploy, disclosure enforced.
- 3-net + oracle: Generic paths exist; oracle supports specific + fallback.
- Deploy process: Proven reset, build, cp /root/htp/public, restart 3006, verify.

**What to Implement (make 100% working + free interactable + simple free visuals)**:
- **Circuits work 100%**:
  - In CovexTerminal: ensure all new circuit ids (from previous) are handled in generateSilverScriptForConfig, circuit grid, oracle submit (pass circuit_type = gt.id or 'custom' for oracle-attested ones). Add generic timer/resolution support in more game UIs or a shared hook.
  - In backend oracle.rs: expand the "else if" or unknown block to explicitly list/support the new ids (vrf_dice_roll, dao_multisig, liquidation_threshold, basic_state_machine, wasm_predicate, nft_gating, reputation_threshold, utxo_spend_auth, covenant_state_hash, script_constraint_proof, yield_compounding) + any 'oracle-attested' by returning a signed outcome (no proof required for pure oracle path). Make /api/oracle/verify-and-sign always succeed for oracle-attested with claimed_outcome.
  - In main.rs terminal-config / covenant insert: persist the reality/circuit_category/has_artifacts (already extended).
  - Test: In paid studio/terminal, select new circuit, generate, "submit oracle" produces real sig, claim flow works with pot math.
  - Reality badges stay accurate; only claim full-zk for the 5-6 with artifacts.

- **Free tier covenants fully interactable (existing "just there" + freshly created)**:
  - In CovenantInteractive 'interact' tab (when !canCustomize / FREE / no paid tier on this covenant):
    - Show covenant name + description (from metadata or on-chain).
    - Basic state viewer (simple JSON or "locked amount / status" from covenant data).
    - "Fully interactable" panel: buttons for "Claim as Winner" (calls claim entrypoint or generic), "Resolve via Timeout / Oracle" (submits to /api/oracle or marks resolved, computes payout per basic script), "View Logs / State".
    - These should work for any basic SilverScript (the simple claim in the template) or newly created free ones.
  - For "just there" (Explorer listed free covenants): the viewer already loads them; enhancements above make them interactive without paid.
  - Wire a basic /api/covenant/:id/resolve or reuse existing compute-payout / oracle for free (no ZK required).

- **Simple visual changes from the FREE tier**:
  - In Deploy.jsx and CreateCovenant.jsx (free paths): expose/ensure fields for covenant_name, description, accent_color (color picker), ui_preset (glass/card/minimal select). Send in the FREE deploy payload to sign-and-broadcast (backend stores in covenant metadata / ui_config).
  - In CovenantInteractive (for free covenants): in 'interact' tab or a "Visuals (Free)" section, show limited ColorSwatches (5 accents) + preset selector. Changes apply live to the page styling (use existing config.primaryColor etc for buttons, borders, accents). For freshly created, load from the returned covenant metadata and persist client or via a free "update visual" if backend allows (or note paid for full save).
  - Existing free covenants in Explorer/viewer pick up any stored accent/preset from metadata and apply the visuals.
  - This gives "some simple visual changes" (accent + preset) without unlocking full paid Studio.

- **Other**:
  - Ensure backend stores the new free fields (name/desc/accent/preset) for FREE tier covenants (extend the CovenantMetadataInput if needed; it already has some from prior).
  - Tier icons: keep/enhance consistency (Crown etc in headers).
  - No regression on paid circuits, paywall, 3-net, disclosure enforcement ("don't deploy if not all info").
  - Free creation comment: "simple visuals + basic interactivity included".

**Strict Rules + Deploy**:
- Small steps, read first, build/verify after edit (npm run build, cargo check).
- After Hetzner changes: exact sequence (git reset --hard origin/master, frontend build + cp to /root/htp/public (confirm root), backend build, restart, journal, health, external curls for auth on 3 nets, live hightable.pro checks: Deploy shows visual fields, fresh free covenant viewer has interact buttons + swatches, circuits selectable + submit works, Pricing/headers have nice icons).
- Commit on GitHub from Hetzner or local (clear msg referencing this prompt), push, confirm triple SHA match (local == GitHub == Hetzner post-pull).
- At end: append massive COMPLETED BLOCK to this prompt + the audit file + previous masters (SHAs e.g. 6cdd6c1 or final, evidence curls + "free covenant now shows Claim/Resolve + accent picker", "new circuits submit sigs successfully", "all 3 places synced").

**Begin with reads + git state + live checks, then implement the free creation/viewer patches + circuit oracle wiring, builds, full Hetzner deploy/verify, commits, and finally write/update this prompt file with the BLOCK.**

This completes the "100% working" vision: honest powerful circuits + delightful free covenants that are interactive with simple visuals from day one.

BEGIN.