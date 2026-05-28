HERMES MISSION: EXPLORER GAME PREVIEWS — Interactive Chess, Poker & Custom UIs on the Main List

GOAL:
Transform the Covex Explorer so that paid covenants (especially chess, poker, and other game covenants) show beautiful, interactive game visuals directly in the main list view. When a normal user opens https://hightable.pro, they should immediately see living game UIs (chess boards, poker tables, etc.) instead of plain text cards.

This is the key "wow" feature that makes the paid tier visibly superior on the public Explorer.

CURRENT STATE:
- Explorer.jsx already separates paid vs free covenants.
- Paid covenants have tier styling (MAX/PRO/CREATOR).
- There is already a "CUSTOM BUILT" badge when `custom_ui_html` exists.
- Custom UIs are rendered via iframe + srcDoc only on the single covenant page (`CovenantInteractive.jsx`).
- No interactive previews exist yet in the list.

NON-NEGOTIABLES:
- Do not break the current list layout or performance badly.
- Paid covenants must remain clearly distinguishable.
- User-provided HTML must be sandboxed.
- Free covenants should stay simple and clean.
- Do not require every covenant to have a custom UI — fall back gracefully.

MISSION — IMPLEMENT IN THIS ORDER:

1. Explorer Card Enhancement for Paid Covenants with Custom UI
   - For paid covenants (`CREATOR`, `PRO`, `MAX`) that have `custom_ui_html`, replace or augment the current card content with a visual preview area.
   - Options (choose the best balance):
     a) Small live iframe preview (lazy loaded, only when in viewport or on hover).
     b) Click-to-expand "Preview Game" that loads the full custom UI in a modal or expands the card.
     c) For known game types (detect "chess", "poker", "blackjack" etc. from name/type), render a lightweight, beautiful React-based preview (mini chessboard or poker table) that looks premium even without custom HTML.
   - Make chess especially beautiful: small 8x8 board with pieces, hover highlights, maybe a "White to move" or "Winner takes all" label using the covenant's accent color.

2. Special Game Visuals (High Priority)
   - Detect common game covenants by name or type (chess, poker, blackjack, dice, etc.).
   - For these, create attractive, interactive mini visualizations:
     - Chess: Mini chessboard (can use a lightweight library or simple divs + Unicode pieces initially, upgrade to proper later).
     - Poker: Stylized poker table or hole cards + pot display.
     - Other games: Appropriate icons + dynamic elements.
   - These should look "alive" and premium on the Explorer.

3. Interaction Model
   - The card should still be clickable to go to the full covenant page.
   - Add a prominent "Play / Interact" or "View Game" button that either:
     - Opens the custom UI in a nice modal, or
     - Takes the user directly to `?tab=interact` or the custom UI section.
   - On hover, the preview should feel responsive.

4. Performance & Safety
   - Never render more than a few live iframes at once. Use intersection observer or hover-to-load.
   - All custom HTML must use `sandbox="allow-scripts allow-same-origin"` (or stricter).
   - Add a small "Custom Interactive UI" label with the covenant's primary color.
   - Keep the list fast even with 20–30 paid covenants.

5. Visual Polish
   - Make paid covenant cards feel significantly more premium than free ones.
   - Use the covenant's `ui_config.primaryColor` (if available) for accents.
   - Add subtle glows or borders for MAX/PRO tiers.
   - Ensure text contrast remains excellent.

6. Fallbacks
   - If no custom_ui_html: Show an enhanced card with game-type icon + "Interactive" badge + nice description.
   - For non-game covenants with custom UI: Still show a clean preview or "Custom UI" area.

7. Wiring & Backend
   - Confirm that `/api/covenants` returns `custom_ui_html` (or at least a flag + limited size) for paid covenants.
   - If the list response is too heavy, discuss adding a `has_custom_ui` boolean + optional small preview field.

8. Testing & Verification
   - Deploy a test chess covenant using the paid flow + Covenant Studio.
   - Verify it appears beautifully on the Explorer with interactive elements.
   - Test with the dev mnemonic: `giggle alpha happy until wing zone cat argue april walnut uncover rate`
   - Test mobile responsiveness of the previews.
   - Verify that clicking the card or "Play" button takes the user to a working interactive experience.
   - Confirm free users still see a clean, simple list.

CONSTRAINTS:
- Do not make the Explorer unbearably slow.
- Prioritize visual impact for chess and poker first.
- Keep the "CUSTOM BUILT" indicator but make the actual visuals the star.
- The experience should make normal visitors think "wow, these are real interactive games on Kaspa."

OUTPUT REQUIREMENT:
When the feature is implemented, tested, and deployed to hightable.pro, and the Explorer now shows compelling interactive game previews for paid covenants, output exactly:

**EXPLORER GAME PREVIEWS LIVE**

Before that, do not output the success phrase.

---

ADDITIONAL CONTEXT FOR HERMES (you may include or remove):
- Look at how custom_ui_html is currently used in CovenantInteractive.jsx (iframe + srcDoc).
- Study the paidCovenants rendering section in Explorer.jsx.
- Consider using React.lazy + Suspense or a custom hook for preview loading.
- For chess specifically, a lightweight board (even simple CSS grid + pieces) can look extremely premium if styled well.

This mission should make the paid tier feel obviously valuable just by browsing the public Explorer.