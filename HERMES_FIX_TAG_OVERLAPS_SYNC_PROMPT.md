# HERMES PROMPT: FIX TAG OVERLAPS IN COVENANT CARDS + THEME SYNC + TRIPLE DEPLOY

You are Hermes. Fix the overlapping tags issue in the UI immediately, ensure no tags (like HIGH TVL, tier badges, amounts) overlap in CovenantCard or similar components, make the layout clean, then sync the entire current polished state (including all previous theme light/dark work, white DAG in light, pro games, etc.) to all 3 places with full verification.

## Critical Bug to Fix First

In the Explorer (and any list of covenants using CovenantCard):

- HIGH TVL badge and the locked amount (KAS value) are overlapping in the same top-right area.
- Owner tier badge (visible only to creator) may also overlap with amount or HIGH TVL.

Current problem (from code):
- HIGH TVL was absolute top-3 right-3 (over amount).
- Owner tier badge was absolute top-2 right-2 (over right side/amount).
- Amount is in the header right flex.

**Exact fix required:**
- Move HIGH TVL badge to absolute top-3 **left-3** (left side of card, so it doesn't collide with right-side amount).
- Move the owner tier badge (the small BUILDER/PRO/MAX label for creator) **inline** inside the right header div, next to the amount value (use flex items-center gap-1.5 or similar, with smaller text-[9px] for the badge).
- Remove the absolute positioning for the owner tier badge.
- Keep the premium top gradient line.
- Ensure in all screen sizes, the name truncates properly, no text cut off, amounts and badges have breathing room, no visual overlap.
- The left HIGH TVL and right (amount + owner badge) must never overlap.
- If there are other tags (game type, custom UI badges below), they are in mt-2.5 flex, fine.
- Make sure the fix applies to both paid featured cards and regular list cards.
- Test mentally for long names, high TVL + owner, etc.

Update the CovenantCard function in frontend/src/pages/Explorer.jsx accordingly.
Use the exact structure from recent clean version if possible:
- HIGH TVL absolute left
- Header flex with left name/tx, right flex with optional owner badge + amount span

Also check for similar tag/amount overlaps in:
- Other covenant list views (PaidBuilder myCovenants, search results, etc. — they reuse CovenantCard or similar).
- Full screen game components or previews if they have "tags".
- Any other places showing amount + status badges.

If found, apply similar non-overlapping layout (left tag, right value+badge).

After fix, ensure the cards look clean, professional, no stacking/overlap of HIGH TVL / amount / tier label.

## Then: Full Polish and Sync to All 3 Places

After the tag fix:
- Verify the whole current state is good: light/dark modes (pure white bg + white/light DAG viz in light mode as previously requested, rich dark in dark), pro full-screen games (chess/poker/blackjack with stake match gate, oracle submission), no other overlaps, correct classification, etc.
- Do a clean frontend build (`npm run build` must succeed).
- Commit with clear message about "fix HIGH TVL/amount/owner badge overlaps in CovenantCard + ensure clean tags".
- Push to master.
- Run the full deploy to sync:
  ```bash
  cd /path/to/Covex27
  git pull origin master
  export PASSWORD="your_rotated_hetzner_root_password"
  ./DEPLOY_TO_HIGHTABLE.sh
  ```
- After deploy:
  - Confirm SHAs identical: local == GitHub == Hetzner /root/Covex27.
  - On live https://hightable.pro :
    - Go to Explorer.
    - Verify Featured Covenants and regular cards: HIGH TVL badge is on LEFT top, amount on RIGHT, owner tier badge (if your wallet matches creator) is inline next to amount on right — NO OVERLAP.
    - Check multiple cards (high TVL ones, your own, etc.).
    - Toggle light/dark: white bg + light DAG viz in light; rich dark in dark.
    - Open a demo or covenant with game (e.g. ?demo=chess, ?demo=poker) and confirm pro full screen works, no UI breakage.
    - Check Pricing, Terminal, etc. for any tag or layout issues.
  - If any overlap or issue remains on live, fix immediately, re-push, re-deploy.

## Other Rules (do not regress)
- Preserve all previous: no public tier labels/badges on Explorer for non-owners (only visual priority + owner sees own), free deploy open to everyone, BUILDER/PRO/MAX naming, hybrid design, pro game UX after equal stakes, working oracle/ZK flows, etc.
- Use the .dag-background class and light/dark variants properly for the white bg + white DAG.
- Make sure in light mode everything (including cards, badges, amounts) has good contrast on white.
- No em-dashes in new comments if any; clean code.

## Files to Focus
- Primarily: frontend/src/pages/Explorer.jsx (CovenantCard component — the flex header, absolute badges, isHighTVL, isOwner logic).
- Grep for other uses of HIGH TVL, absolute badges, amount displays in covenant contexts.
- Cross-check index.css for any light mode that might affect badge/amount positioning.
- DagBackground if related to bg, but main is tags.

Re-read current Explorer.jsx CovenantCard, the recent theme/DAG changes, and this prompt before editing.

Be thorough on the overlap fix — user sees it in the current view, needs it fixed **now**.

After all code + deploy + live verification, output:
- Summary of the exact tag overlap fix (before/after positions).
- List of files changed.
- Build/deploy verification outputs.
- SHAs.
- Confirmation that on live Explorer, no more overlapping HIGH TVL / amount / tier tags, and light mode has white + white DAG as wanted.
- Any screenshots descriptions or notes.

Start execution immediately. Fix the tags first, then full sync.

Make it clean and professional. No overlapping tags.