# HERMES LIGHT MODE: PURE WHITE BACKGROUND + WHITE DAG VISUALIZER + FULL THEME SYNC PROMPT

You are Hermes, a highly capable autonomous software engineering agent for the Covex27 project.

**Primary Task:** In light mode, make the entire background pure white (#fff) and ensure the Kaspa DAG visualizer (the live iframe from kgi.kaspad.net) is also the "white" / light version so it renders appropriately on the white background. Dark mode must remain the rich black cypherpunk experience with its dark DAG visualizer. Make the distinction clear and both modes look great. Then ensure the exact same polished version is deployed and identical across all three environments (local, GitHub master, Hetzner /root/Covex27 + live hightable.pro).

## Strict Rules

- Pure white (#ffffff) for light mode page background everywhere (body, main containers, overlays where appropriate, DAG background div).
- For the DAG visualizer in light mode:
  - Use the light theme version of the visualizer: iframe src="https://kgi.kaspad.net/?theme=light"
  - Show it only in light mode (block dark:hidden or equivalent).
  - Use suitable opacity and blend mode (e.g. mix-blend-multiply with low opacity like 0.25-0.4) so the "white DAG" lines/patterns are visible and elegant on pure white bg without being too faint or dark.
  - Hide any dark gradients, dark iframes, or dark overlays in light mode.
- Dark mode:
  - Keep pure black or deep dark (#000 or #05050A / radial) background.
  - Use the dark theme DAG: src="https://kgi.kaspad.net/?theme=dark"
  - Visible only in dark (hidden dark:block).
  - Keep neon/glow effects, screen blend, dark vignette as appropriate for the rich cypherpunk dark mode.
- The DagBackground component must handle both cleanly with Tailwind dark: variants and a .dag-background class for targeting if needed in CSS.
- No dark backgrounds leaking into light mode. No white elements breaking dark mode.
- Preserve and enhance the overall theme work: strong distinction between modes, beautiful light mode (high contrast, vibrant Kaspa green accents on white, readable dark text, proper glass/cards/inputs in light), rich dark mode.
- Specifically call out and ensure the white + white-DAG in light mode is perfect (as user requested).
- Update any related CSS in index.css to support .light .dag-background { background: #fff !important; } and exclude DAG from any overlay darkening rules in light.
- Keep existing functionality (theme toggle, no public tier labels on Explorer, pro full-screen games, etc.).

## Execution Steps (in strict order)

1. **Inspect current state**
   - Read frontend/src/components/DagBackground.jsx fully.
   - Read relevant parts of frontend/src/index.css (search for light body, dag-background, bg-white, fixed inset, any DAG or background rules in .light).
   - Read App.jsx for any global layout/bg that might affect.
   - Grep the frontend/src for hard-coded bg-black, bg-[#0a0a0a], dark-only styles that could conflict in light.
   - Check other key pages (Pricing, Explorer, CovexTerminal, WhatIsKaspa) for any full-bleed dark containers.
   - Note the current state of light vs dark for body and DAG.

2. **Implement the white light mode + white DAG visualizer**
   - Rewrite DagBackground.jsx to:
     - Root div: always have `dag-background fixed inset-0 z-[-10] pointer-events-none bg-white dark:bg-black` (or equivalent Tailwind).
     - Include BOTH iframes:
       - Dark one: src="https://kgi.kaspad.net/?theme=dark", classes to show only in dark (e.g. hidden dark:block), appropriate opacity + mix-blend-screen for dark mode neon effect.
       - Light one: src="https://kgi.kaspad.net/?theme=light", classes to show only in light (e.g. block dark:hidden), appropriate opacity (0.25-0.45) + mix-blend-multiply (or screen if better for visibility on white) so the light DAG viz renders as elegant "white" visualizer on white bg.
     - Dark-mode-only overlay: the radial dark gradient, hidden in light (hidden dark:block).
     - No extra dark elements in light.
   - In index.css:
     - Ensure .light body { background: #ffffff; ... }
     - Add/ensure .light .dag-background { background: #ffffff !important; }
     - Exclude .dag-background from any .light rules that force dark or semi-dark overlays (e.g. [class*="fixed inset-0 z-"]:not(.dag-background) { ... } ).
     - Clean up any old conflicting .light .dag-background opacity or bg rules.
     - Make sure light mode has pure white everywhere the DAG bg applies.
   - If the light theme iframe needs tweak (opacity, blend, size), adjust in the component for best "white DAG on white bg" appearance.
   - Verify no other components (nav, sections, modals, full-screen games) introduce dark bgs in light mode that would cover or conflict with the white DAG bg.

3. **Polish for great look in both modes**
   - Ensure the white + white-DAG in light is elegant and visible (not invisible).
   - Dark remains rich and immersive.
   - Test mentally: toggle should instantly switch from black+dark-DAG to white+light-DAG with clean transition.
   - Keep or enhance any previous theme improvements (Pricing in both, general glass/cards/text in light, etc.).
   - No em-dashes or other style issues if relevant.

4. **Build and local verification**
   - cd frontend && npm run build (must succeed with no errors).
   - Review the DagBackground and CSS changes for correctness.

5. **Git + Full Triple Sync (all 3 places identical)**
   - Commit with clear message referencing the white light DAG + bg fix and any polish.
   - git push origin master.
   - Provide and execute the exact deploy command using the PASSWORD env var and ./DEPLOY_TO_HIGHTABLE.sh (it pulls, builds frontend+backend if needed, deploys to /root/htp/public, restarts, etc.).
   - After deploy:
     - Confirm exact same SHA on local, GitHub, and Hetzner /root/Covex27.
     - On live https://hightable.pro :
       - Toggle to light mode (using the theme toggle).
       - Verify: pure white background (#fff) across the page.
       - Verify: the DAG visualizer is the light/white version (from ?theme=light), visible and appropriate on the white bg (no dark elements showing).
       - Toggle back to dark: rich black bg with dark DAG visualizer.
       - Check multiple pages (home/Explorer, Pricing, /kaspa, any Terminal/demo with games) to ensure the white light DAG bg is consistent where the background component is used.
       - Confirm theme toggle works smoothly, no visual breakage.
   - If live doesn't match, debug, fix, re-push, re-deploy until perfect.

6. **Report**
   - Detailed summary of changes (exact edits to DagBackground.jsx and index.css).
   - Verification commands and outputs (build, SHAs, live checks).
   - Confirmation that light mode now has pure white bg + white DAG visualizer as requested, dark is unchanged/ rich, and all 3 places are synced.
   - Any notes on the light theme iframe behavior or suggested future tweaks.

## Key Files to Read First
- frontend/src/components/DagBackground.jsx
- frontend/src/index.css (theme vars, .light rules, any dag or background sections)
- frontend/src/App.jsx (layout, nav, where DagBackground is rendered)
- Any pages that might have custom full-bleed backgrounds.

Re-read this entire prompt before editing.

Be precise with Tailwind dark: variants and the .dag-background class for CSS targeting.

The user explicitly wants the background white AND the DAG visualiser white (light theme) in bright/light mode.

Execute fully. Make it real and correct this time.

After you are done with code + sync + verification, output the usual short honest report.

Start now.