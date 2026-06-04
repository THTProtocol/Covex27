# HERMES_FINALIZE_BRANDING_PROMPT.md (Final Polish & Verification - 2026-06-04)

**GOAL:** This is the final closeout run after the branding/logo/COVEX sign improvements and removal of the hero logo from the Explorer page.

**You must:**

1. Read the following files first (in order):
   - This prompt
   - /home/kasparov/Covex27/HERMES_FINALIZE_PERFECT_WEBSITE_PROMPT.md
   - /home/kasparov/Covex27/HERMES_MEGA_MASTER_ALL_FIXES_PROMPT.md
   - Current branding implementation:
     - frontend/src/App.jsx (nav COVEX sign + icon)
     - frontend/src/pages/Explorer.jsx (confirm hero logo is completely removed)
     - frontend/public/icon.svg
     - frontend/public/favicon.svg
     - frontend/public/manifest.json
   - frontend/src/components/DagBackground.jsx (theme consistency)
   - frontend/src/index.css (light mode branding support)
   - Any other files that contain logo or "COVEX" references (search for them)

2. Perform a complete visual + code audit of the new branding:
   - Confirm the hero logo is fully removed from Explorer page (no SVG, no mb-5 div with logo).
   - Verify the new premium refined DAG-network mark is used consistently and looks excellent:
     - Nav: compact high-quality icon + "COVEX" text treatment (font weight, tracking, gradient in dark, solid/high-contrast in light).
     - Favicon and icon.svg: clean, matching the new mark, valid SVG, good at small sizes.
   - Ensure perfect appearance in both light and dark themes (no low contrast, good glow, proper hover states).
   - Check mobile responsiveness of the nav branding.
   - Verify consistency across the site (no old logo remnants in hero or elsewhere).

3. Make any micro-improvements needed to achieve "best looking website" status:
   - If the logo mark can be slightly refined for even better balance/proportions/glow while keeping it clean and recognizable as the current direction — do it.
   - Improve the nav "COVEX" sign further if it doesn't feel premium enough (spacing between icon and text, letter-spacing, weight, hover interaction, light mode treatment).
   - Ensure the overall branding feels cohesive, modern, cypherpunk, and high-end.
   - Fix any small visual issues (alignment, padding in nav, etc.).

4. Full triple-sync + Studio sync:
   - Commit all changes with clear message.
   - Push to GitHub (Covex27 and Covenant-Studio if any Studio references updated).
   - Deploy to Hetzner using the standard process:
     ssh root@178.105.76.81 'cd /root/Covex27 && git fetch origin && git reset --hard origin/master && cd frontend && npm run build && rm -rf /root/htp/public/assets/* && cp -a dist/* /root/htp/public/ && (backend if changed) && echo "DEPLOYED" && ls /root/htp/public/assets/index-*.js | head -1'
   - Verify live:
     - SHAs match across local / GitHub / Hetzner.
     - https://hightable.pro loads with new branding.
     - Favicon updates (hard refresh may be needed in browser).
     - Nav sign looks good in both themes.
     - Explorer hero has no logo, clean title-first layout.
     - No console errors or broken assets.

5. Update all HERMES prompt files (Covex27 + Covenant-Studio versions) with a clear "FINAL BRANDING POLISH COMPLETE" section, including:
   - What was verified/improved.
   - Verification results (SHAs, live checks).
   - Confirmation that the site is now the best-looking, most premium version.

6. Final gap scan:
   - Grep for any remaining old logo references or the removed hero SVG.
   - Confirm no "Higher-tier covenants are prioritized..." text remains anywhere.
   - Ensure language is still fully honest and production-grade.

**Success criteria:**
- The new logo/mark is clearly better and more premium than before.
- COVEX nav sign looks excellent and professional.
- Explorer page hero is clean (logo removed).
- Everything is consistent, looks perfect in light + dark, mobile, and at all sizes.
- All 3 places + Studio are fully synced and live.
- You report a detailed summary + "Branding & website now at final polished state."

Start by reading the required files. Be ruthless about visual quality. Make it the best possible. Execute.


────────────────────────────────────────────────────────────────
## ULTIMATE FINAL STICK TOGETHER COMPLETE — SHA: 4d13156 (2026-06-04)
────────────────────────────────────────────────────────────────

All 3 places + Studio bit-identical at SHA 4d13156. GitHub tree cleaned (29+ historical removed). Explorer hero no-logo confirmed. Nav COVEX sign premium in both themes. icon.svg/favicon.svg valid, consistent refined DAG-network mark. DAG instant toggle. Forbidden phrase absent. All production strings live. Zero gaps. Project is final, clean, and perfect.