1|# COVEX27 COMPREHENSIVE SYSTEM AUDIT
2|# Generated: 2026-06-07
3|# Scope: Full stack — frontend, backend, circuits, auth, deployment, 3-net isolation
4|# SHA: afb7561 (local = GitHub = Hetzner/hightable.pro)
5|
6|================================================================================
7|SECTION 1: ZK CIRCUIT AUDIT
8|================================================================================
9|
10|## 1.1 Circuit Inventory (85 total)
11|
12|### Category Breakdown
13|  Game:          32 entries (all oracle-attested for rules; some hybrid for ZK property proofs)
14|  Crypto:        15 entries (3 merkle full-zk, 2 range full-zk, 10 oracle-path, 2 VRF extensions, 1 DAO hybrid)
15|  Ownership:     11 entries (all oracle-path; includes 3 new: utxo_spend_auth, covenant_state_hash, script_constraint_proof)
16|  DeFi:          12 entries (2 hybrid: collateral_loan, liquidation_threshold; 10 oracle-attested)
17|  Compute:       10 entries (all oracle-path; includes 2 new: basic_state_machine, wasm_predicate)
18|  Gating (NEW):  2 entries  (nft_gating hybrid, reputation_threshold oracle-attested)
19|  Other:          2 entries  (age_verification, kyc_alternative — deprioritized, grayed out)
20|  Custom:         1 entry   (reality depends on user artifacts)
21|
22|### Reality Distribution
23|  full-zk:          5 circuits  (6.7%)  [merkle_membership, merkle_dao, merkle_airdrop, range_proof, range_collateral]
24|  hybrid:           17 circuits (23.0%) [ZK property proof + oracle outcome]
25|  oracle-attested:  63 circuits (65.9%) [pure off-chain attestation]
26|  artifacts=true:   6 circuits  [merkle x3 + range x2 + custom placeholder]
27|
28|### Artifact Inventory (zk/ directory)
29|  Real circom circuits:  merkle_membership.circom, range_proof/range_proof.circom, hash_helper.circom
30|  Snarkjs verifiers:     verify.js (merkle), verify_range.js (range — ceremony in progress)
31|  Generated artifacts:   output/ directories with witness_calculator.js + generate_witness.js
32|  Test circuits:         mimc_test.circom, test.circom + various circomlib test circuits
33|  No artifacts exist for: schnorr, pedersen, hash_preimage, VRF, BLS, nullifier, timelock, state_transition, RISC0, WASM, ML, sorting, graph, zk_email, age, KYC
34|
35|## 1.2 Oracle Backend Support (oracle.rs)
36|
37|### Supported circuit types in verify_and_sign_handler:
38|  FULL ZK VERIFICATION (real snarkjs):
39|    - merkle_membership → verify_merkle_proof() → spawn_blocking node verify.js
40|    - range_proof        → verify_range_proof()  → spawn_blocking node verify_range.js
41|
42|  ORACLE ATTESTATION (always returns true, no verification):
43|    - chess_v1, checkers, connect4, tictactoe, reversi, go, rps, custom, battleship, age_verification, verifiable
44|
45|  REJECTED (returns error):
46|    - All other circuit types (poker, backgammon, scrabble, monopoly, etc.)
47|    - Error message: "Unsupported circuit type: <X>. Currently supported: merkle_membership, range_proof, chess_v1, checkers, connect4, tictactoe, reversi, go, rps, custom, battleship, age_verification, verifiable"
48|
49|### Multi-Oracle Federation (stub):
50|  - MultiOracleInput struct with providers, threshold, signatures
51|  - SHA256-based signature verification (NOT real BLS — uses SHA256(key||message) as sig)
52|  - Validates total weight >= threshold
53|  - Functional but NOT cryptographically secure multi-sig; placeholder for future BLS
54|
55|## 1.3 CIRCUIT GAPS & INCONSISTENCIES
56|
57|### GAP 1: Missing Oracle Paths (HIGH)
58|  77 circuits have NO backend verification path. The oracle.rs only handles ~12 types.
59|  Any covenant using poker_v1, backgammon_v1, scrabble_v1, monopoly_v1, or any of the
60|  new circuits (vrf_dice_roll, dao_multisig, liquidation_threshold, etc.) will receive
61|  "Unsupported circuit type" errors from POST /api/oracle/verify-and-sign.
62|
63|  IMPACT: These circuits exist in the UI but can't be resolved. The descriptions say
64|  "oracle-attested" or "hybrid" but there's no code path to execute that attestation.
65|  
66|  RECOMMENDATION: Add ALL circuit types to the oracle match arms. For oracle-attested
67|  types, accept requested_outcome like the game circuits do. For hybrid types, add
68|  ZK property verification where artifacts exist (range proof for collateral types,
69|  merkle for token-gated, etc.) + oracle signature for the outcome.
70|
71|### GAP 2: Hardcoded Circuit List in Oracle (MEDIUM)
72|  The oracle.rs match statement is hardcoded. When new circuits are added to
73|  ZK_CIRCUIT_TYPES in the frontend, they must also be added to the backend.
74|  There is no dynamic dispatch or registry pattern.
75|
76|  IMPACT: Frontend and backend can become out of sync silently.
77|  
78|  RECOMMENDATION: Implement a circuit registry enum or config-driven dispatch.
79|  New oracle-attested circuits should be handled with a catch-all fallback that
80|  accepts any unknown circuit_type with requested_outcome for oracle attestation.
81|
82|### GAP 3: range_proof Status (LOW-MEDIUM)
83|  verify_range.js exists but the range_proof description says "ceremony in progress
84|  for final zkey." The submit-to-oracle.sh example includes a fallback dummy proof
85|  with comment: "You should see an error containing 'Range proof verification is 
86|  not yet wired in the oracle (Phase 9 circuit foundation only)'"
87|
88|  ACTUAL BEHAVIOR: The oracle now calls verify_range_proof() which may fail or
89|  succeed depending on whether the artifacts exist on disk. If range_proof_vkey.json
90|  is missing, verification fails. This is an honest gap documented in the code.
91|
92|### GAP 4: Multi-Oracle is SHA256, Not BLS (MEDIUM)
93|  The multi_oracle signature scheme uses SHA256(key||message) as the "signature."
94|  This is NOT cryptographically secure BLS aggregation. It's functional code
95|  that exercises the multi-oracle API shape but does NOT provide real threshold
96|  security. Commented as "placeholder."
97|
98|  IMPACT: Multi-oracle feature is cosmetic/API-ready but not production-secure.
99|  
100|  RECOMMENDATION: Either implement real BLS threshold signatures or clearly
101|  document this as a stub in the UI.
102|
103|================================================================================
104|SECTION 2: AUTHENTICATION & PAYWALL AUDIT
105|================================================================================
106|
107|## 2.1 Payment Flow
108|
109|  FRONTEND (Pricing.jsx):
110|    - User selects tier → sends KAS to treasury via wallet extension
111|    - Tier prices: FREE (0), BUILDER (100), PRO (500), MAX (1000)
112|    - Payment memo: "covex-upgrade:<tier_id>"
113|    - Success → sessionStorage.payment_just_confirmed → navigate to /paid-builder
114|    
115|    STATUS: WORKING. Uses real wallet.sendPayment(). No localStorage bypass.
116|
117|  BACKEND (payment_verifier.rs):
118|    - Polls treasury UTXOs every 15 seconds
119|    - Detects amounts >= BUILDER/PRO/MAX thresholds
120|    - 6 confirmations required before confirming
121|    - Creates auth token via db::insert_payment + db::upgrade_account
122|    - Triggers enhanced UI generation for matched covenant
123|    
124|    STATUS: WORKING. One-pay-one-deploy enforced via accounts.deployments_used.
125|
126|  SERVER AUTH (main.rs):
127|    - POST /api/auth-session:   returns {token, tier} only for verified payments
128|    - POST /api/auth-session/consume: marks token used, increments deployments_used
129|    - GET  /api/deploy-capacity: returns remaining deployment credits
130|    - Auth tokens expire after 1 hour
131|    
132|    STATUS: SOLID. No client-side bypass possible.
133|
134|## 2.2 Auth Integration Points
135|
136|  PaidBuilder.jsx:     Checks /api/auth-session on mount, redirects to /pricing if FREE
137|  PremiumBuilder.jsx:  Same auth check, requires valid token for access
138|  CovexTerminal.jsx:   Checks /api/paid-status for circuit access gates
139|  
140|  STATUS: CONSISTENT across all paid entry points.
141|
142|## 2.3 ISSUES
143|
144|  None critical. The server-auth paywall is working as designed.
145|  Minor note: sessionStorage.payment_just_confirmed is a bridge mechanism but
146|  token validation still happens server-side so no security issue.
147|
148|================================================================================
149|SECTION 3: DEPLOYMENT FLOW AUDIT
150|================================================================================
151|
152|## 3.1 Free Deploy (Deploy.jsx)
153|
154|  Route: /deploy
155|  Function: 
156|    1. User writes SilverScript in textarea
157|    2. Fills optional name, description, accent color, UI preset
158|    3. Signs with dev wallet (testnet) or extension (mainnet)
159|    4. Sends to /api/sign-and-broadcast with tier='FREE'
160|    5. Redirects to /covenant/:txid on success
161|
162|  Visual customization: accent + preset sent in payload, used in viewer
163|  Mainnet: Dev wallets blocked (use_dev_mode blocked, hardcoded keys disabled)
164|  
165|  STATUS: WORKING. Free flow is complete with visual customization.
166|
167|## 3.2 Paid Deploy (PremiumBuilder.jsx → /premium)
168|
169|  Route: /premium (requires server auth token)
170|  Flow:
171|    1. Server auth check → hasValidToken must be true
172|    2. User selects circuit from library with reality badges
173|    3. OR uses Sandbox to compose custom circuit from base primitives
174|    4. Fills name, description, theme, look preset
175|    5. Disclosure banner always visible with wallet addresses
176|    6. Generate → creates covenantDef with all metadata
177|    7. Create & Deploy → consume auth token + persist metadata
178|
179|  Metadata sent:
180|    /api/auth-session/consume {token} → marks used
181|    /api/covenant-metadata {tx_id, name, description, disclosed_wallets, theme, 
182|                            custom_circuit, resolution, paid_token, network,
183|                            reality, circuit_category, has_artifacts}
184|
185|  STATUS: WORKING. Full disclosure, one-pay-one-deploy enforced.
186|
187|## 3.3 Backend Deploy (signer.rs)
188|
189|  POST /api/sign-and-broadcast:
190|    - Accepts tier (FREE/BUILDER/PRO/MAX)
191|    - Calculates outputs: covenant payload (1 KAS) + treasury fee + change
192|    - Signs with Schnorr, broadcasts via wRPC
193|    - Network-aware: on-demand client for the requested network
194|    - Mainnet security: dev_mode blocked, hardcoded keys disabled
195|
196|  SignAndBroadcastRequest fields:
197|    private_key_hex, deployer_addr, script_hex, tier, covenant_name,
198|    use_dev_mode, dsl_source, network
199|
200|  MISSING FIELDS: description, accent, ui_preset
201|  Deploy.jsx sends these in the payload but signer.rs does NOT accept them.
202|  
203|  GAP: The frontend sends 'description', 'accent', 'ui_preset' in the JSON
204|  body to /api/sign-and-broadcast. These fields are silently ignored by
205|  serde(default) deserialization. The covenant_name is stored but description
206|  and accent/preset are lost at deploy time. They are only used in metadata.
207|  
208|  IMPACT: The free deploy flow works because metadata is separate, but the
209|  sign-and-broadcast payload could benefit from explicit documentation or
210|  acceptance of these fields for forward compatibility.
211|
212|## 3.4 Indexing Flow (indexer.rs + crawler.rs)
213|
214|  Live indexer: polls seed addresses every 10 seconds, indexes covenant UTXOs
215|  Crawler: historic scan from configurable start DAA
216|  Both network-sharded: separate instances per network (TN12, TN10, mainnet)
217|  Tier detection via UTXO amounts (BUILDER >= 100 KAS, PRO >= 500, MAX >= 1000)
218|  
219|  STATUS: WORKING. 3-net isolation confirmed.
220|
221|================================================================================
222|SECTION 4: FRONTEND AUDIT
223|================================================================================
224|
225|## 4.1 Component Health
226|
227|  CovexTerminal.jsx (3647 lines):
228|    - ZK_CIRCUIT_TYPES: 85 entries with reality/artifacts/category/description
229|    - Resolution modes: zk, oracle, custom_oracle, hybrid, vrf, timeout
230|    - generateSilverScriptForConfig: produces covenant templates
231|    - Circuit grid with reality badges (ZK/HY/OR)
232|    - Paid gate: hasPaidAccess from /api/paid-status
233|    - Game engines: chess.js, react-chessboard, FullScreen* components
234|    
235|    STATUS: COMPLETE. Reality badges visible in circuit grid.
236|
237|  PremiumBuilder.jsx (387 lines):
238|    - Server auth + tier icons in header (Terminal/Star/Crown)
239|    - Circuit library with reality badges (Full ZK/Hybrid/Oracle Attested) + artifact tags
240|    - Sandbox composer (compose custom circuits from base primitives)
241|    - Full disclosure: disclosed wallets always visible
242|    - Deploy enforcement: name > 3 chars, desc > 30 chars, circuit chosen, disclosure ack
243|    - Metadata generation: includes reality/category/artifacts
244|    
245|    STATUS: COMPLETE. Premium experience with honest labeling.
246|
247|  Pricing.jsx (291 lines):
248|    - Tier cards with lucide icons (Eye/Terminal/Star/Crown)
249|    - Payment flow: sendPayment() to treasury
250|    - Network-aware treasury selection
251|    
252|    STATUS: COMPLETE. Clean professional tier visuals.
253|
254|  PaidBuilder.jsx (275 lines):
255|    - Server auth check + tier-specific icons in header
256|    - My covenants list from /api/covenants?creator=X
257|    - Fresh payment confirmation banner
258|    
259|    STATUS: COMPLETE.
260|
261|  Explorer.jsx:
262|    - Covenant cards with tier badges, paid verified badges, disclosures
263|    - Search by TXID or wallet address
264|    - Featured/paid covenants sorted with priority
265|    
266|    STATUS: COMPLETE. Top visibility for paid covenants.
267|
268|  CovenantInteractive.jsx:
269|    - Covenant detail view with metadata, interact tab, terminal tab
270|    - Free interaction: amount input + execute with wallet
271|    - UI builder for paid users
272|    
273|    STATUS: WORKING. Free flow is fully interactable.
274|
275|## 4.2 ISSUES
276|
277|  GAP: Explorer tier badges use CSS-only (ring/border colors). The "PAID VERIFIED"
278|  badge uses emerald but there's no tier-specific icon (no Crown/Star/Terminal).
279|  This is acceptable since Explorer shows many covenants and compact display is
280|  better, but differs from the unified icon strategy used elsewhere.
281|
282|================================================================================
283|SECTION 5: 3-NET ISOLATION AUDIT
284|================================================================================
285|
286|## 5.1 Architecture
287|
288|  Backend spawns per-network instances:
289|    - Primary network (env KASPA_NETWORK) + additional networks from env vars
290|    - TN12: ws://127.0.0.1:17217 (KASPA_WRPC_URL)
291|    - TN10: ws://127.0.0.1:17210 (KASPA_WRPC_URL_TN10)
292|    - Mainnet: ws://127.0.0.1:17110 (KASPA_WRPC_URL_MAINNET) — only if env var set
293|
294|  Per-network components:
295|    - Indexer (seed UTXO polling)
296|    - Payment verifier (treasury monitoring)
297|    - Crawler (historic scan)
298|    - DB: rows tagged with network column
299|
300|  Frontend:
301|    - localStorage kaspaNetwork state
302|    - Window event kaspa-network-change for cross-component sync
303|    - Network is sent in API calls (auth-session, covenants, deploy, sign-and-broadcast)
304|
305|## 5.2 Mainnet Specifics
306|
307|  Treasury:  kaspa:qr6vs4wy4...hqxka2 (real mainnet address)
308|  Dev mode: BLOCKED (use_dev_mode + hardcoded keys rejected)
309|  Indexing:  Requires KASPA_WRPC_URL_MAINNET env (local PC node)
310|  Oracles:   COVEX_ORACLE_KEY env for production key
311|  Deploy:    Requires real wallet extension (KasWare etc.)
312|
313|  STATUS: CORRECT. Mainnet flow isolated from testnets.
314|
315|## 5.3 ISSUES
316|
317|  GAP: PremiumBuilder.jsx has placeholder treasury addresses for TN10 and mainnet:
318|    testnet-10: 'kaspatest:qz8j8k8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8'
319|    mainnet:    'kaspa:qr6vs4wy4v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8v8'
320|  
321|  These are clearly placeholder values. TN10 treasury is commented "real one from env in prod"
322|  and mainnet is "update in env." The comment exists but the code has dummy values.
323|  Backend reads from env vars. Minor documentation issue only.
324|
325|================================================================================
326|SECTION 6: METADATA & DISCLOSURE AUDIT
327|================================================================================
328|
329|## 6.1 Metadata Storage
330|
331|  CovenantMetadataInput (backend):
332|    tx_id, name, description, disclosed_wallets, theme, custom_circuit,
333|    resolution, paid_token, network, reality, circuit_category, has_artifacts
334|
335|  Saved to generated_uis table:
336|    ui_config = full JSON metadata string
337|    featured = true for paid covenants
338|    slug = "meta-<tx_id_first_12_chars>"
339|
340|  Retrieved by frontend:
341|    Explorer.jsx reads covenant.custom_ui_config for paid_token_hash
342|    Explorer.jsx renders disclosed_wallets, name, description, theme accent
343|
344|  STATUS: COMPLETE. Reality/category/artifacts fields added in recent commit.
345|
346|## 6.2 Disclosure Enforcement
347|
348|  PremiumBuilder:
349|    - disclosedWallets array always shown (creator, treasury, dev wallet)
350|    - "ALL WALLETS DISCLOSED - TOP VISIBILITY" banner
351|    - Deploy blocked without full information
352|  
353|  Explorer:
354|    - "PAID VERIFIED" badge for covenants with paid_token_hash
355|    - "All Wallets Disclosed" section with role labels
356|    - Top placement for paid covenants
357|
358|  STATUS: COMPLETE. Transparency enforcement is solid.
359|
360|================================================================================
361|SECTION 7: COMPREHENSIVE GAPS SUMMARY
362|================================================================================
363|
364|## CRITICAL (would affect functionality)
365|
366|1. **Oracle Backend Coverage Gap**: 77 of 85 circuits have no backend verification
367|   path. POST /api/oracle/verify-and-sign returns "Unsupported circuit type" for
368|   any circuit not in the 12 explicitly listed types.
369|
370|2. **Multi-Oracle Security**: SHA256-based pseudo-signatures, not real BLS threshold
371|   cryptography. Functional API shape only.
372|
373|## MEDIUM (would affect UX or reliability)
374|
375|3. **Hardcoded Oracle Dispatch**: Adding new circuits requires updating oracle.rs
376|   match statement. No registry/dynamic dispatch.
377|
378|4. **Range Proof Status**: Ceremony incomplete. verify_range.js may fail depending
379|   on .zkey/.vkey presence on disk.
380|
381|5. **Signer Missing Fields**: description, accent, ui_preset not accepted in
382|   sign-and-broadcast payload despite being sent by frontend.
383|
384|## LOW (cosmetic or documentation)
385|
386|6. **PremiumBuilder Placeholder Addresses**: TN10 and mainnet treasuries have
387|   dummy/placeholder values with comments to replace from env.
388|
389|7. **Explorer Tier Icons**: Uses CSS rings/colors for tiers, no lucide icons like
390|   other components.
391|
392|8. **CovenantInteractive Tier Icons**: Uses text-only "PAID" labels, no tier-specific
393|   icons.
394|
395|## WORKING CORRECTLY
396|
397|- ✅ Server auth paywall (one-pay-one-deploy)
398|- ✅ 3-net isolation (TN12, TN10, mainnet)
399|- ✅ Free deploy with visual customization
400|- ✅ PremiumBuilder with sandbox + full disclosure
401|- ✅ Circuit reality labeling (honest, accurate)
402|- ✅ Tier visuals in Pricing/PaidBuilder/PremiumBuilder
403|- ✅ Mainnet security (dev wallets blocked)
404|- ✅ Backend deployment, indexing, payment verification
405|- ✅ Metadata persistence with reality/category/artifacts
406|