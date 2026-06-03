# HERMES THEME LIGHT/DARK OVERHAUL + TRIPLE SYNC PROMPT

You are Hermes. Execute this mission with precision.

**Goal:** Ensure the Covex frontend has a **clear, beautiful, and professional distinction** between Dark mode (current cypherpunk with Kaspa green #49EACB as primary accent) and a **perfect Light mode** (lighter cypherpunk variant with strong, vibrant green/teal accents). Both modes must look excellent across the entire app. Then guarantee the exact same polished version is live and identical across all three environments: local, GitHub master, and Hetzner production (hightable.pro).

## Strict Requirements

- **Dark mode (keep as base, few targeted upgrades):** Maintain the rich, high-density cyberpunk dark aesthetic. Apply a few premium touches especially to the Pricing page/tabs (stronger card separation, better hover states, accent visibility). Do not regress any existing dark styles unless they conflict with the new light work.

- **Light mode (make it perfect):** Create a clean, high-contrast, elegant light cypherpunk experience.
  - Backgrounds: Soft off-white / very light slate (#f8fafc or similar) with subtle depth.
  - Text: Dark, highly readable (#0f172a primary, #334155 secondary).
  - Accents: Strong, vibrant teal/green (use #0f766e or #14b8a6 as the main Kaspa green in light — it must pop and feel premium, not washed out).
  - Cards / Glass: White or near-white with subtle shadows + light borders. Frosted glass effect using semi-transparent white + blur.
  - Tier accents (Builder blue, Pro gold/amber, MAX purple): Use lighter tints with dark text or strong colored borders that remain visible and beautiful.
  - Buttons, inputs, nav: Adapt cleanly (primary buttons can stay dark green on light or use the strong teal).
  - Game arenas (chess, poker, blackjack full-screen): Keep game table "felt" dark for playability and contrast, but surrounding UI, controls, and overlays must be light-mode friendly.
  - Explorer, Terminal, Pricing, WhatIsKaspa, modals, etc.: All must render without dark-on-dark or low-contrast issues. No leftover hard-coded dark colors that break light.
  - Overall feel: Still unmistakably "Covex / cypherpunk" but in a bright, modern, readable light skin. High visual density preserved.

- Use and extend the existing CSS variable system + .light / .dark selectors in index.css. Prefer extending CSS over adding !important everywhere.

- Update any components or pages that hard-code colors (e.g. bg-[#0A0A0D], text-white without overrides, absolute dark panels) so they adapt via glass-panel, theme classes, or new light-specific rules.

- Pricing page must shine in **both** modes (as highlighted example). Tier cards should have clear visual hierarchy, good accent borders/glows/shadows appropriate to the mode, excellent readability.

- Theme toggle (Sun/Moon) must be clearly visible and functional in both modes.

- No breaking of existing functionality (Explorer no-public-tier-labels, pro full-screen games after stake match, oracle flows, etc.).

## Execution Steps (follow in order)

1. **Inspect current state thoroughly.**
   - Read index.css (all theme rules, :root, .light, .dark, glass, pricing tweaks, etc.).
   - Read Pricing.jsx (the full page, how tier cards are rendered).
   - Read CovexTerminal.jsx (key sections: arenas, forms, disclaimers — ensure light works for pro games).
   - Read Explorer.jsx (featured cards, general layout).
   - Read App.jsx (nav/header).
   - Read ThemeProvider.jsx and ThemeToggle.jsx.
   - Grep for hard-coded dark colors (bg-black, text-white in contexts that won't auto-adapt, #0A0A0D, etc.) across frontend/src.
   - Check a few game minis and full-screen components.
   - Note any existing light mode attempts and their gaps.

2. **Implement the theme differences.**
   - Enhance dark mode with the "few changes" (focus on Pricing for premium card/hover treatment, perhaps subtle improvements to nav or key sections if they make dark better without changing the overall cypherpunk character).
   - Build out / refine a complete, polished .light set of rules in index.css so that switching to light produces a beautiful, cohesive, high-quality experience everywhere.
   - Add targeted overrides for:
     - Pricing tier cards in light (and dark polish).
     - Full-screen game arenas (keep play area contrasty, make chrome/UI light-friendly).
     - Explorer cards and featured section.
     - Terminal sections, forms, buttons.
     - General text, borders, glass, inputs, badges, nav.
     - Any remaining pages/sections (WhatIsKaspa, etc.).
   - Make sure the primary Kaspa green feels strong and intentional in light mode (not the dimmed version).
   - Use the existing richer visual density classes where helpful.

3. **Polish specific areas mentioned.**
   - Pricing: Make the tab/page look excellent and distinct in dark (your "few changes") and perfect in light. Good spacing, clear hierarchy, accent colors that work in both (borders, badges, check icons, hover).
   - Ensure no visual "sameness" between modes — user must immediately feel the difference and that both are intentional and great.

4. **Build & local verification.**
   - Run `cd frontend && npm run build`. Must succeed cleanly.
   - If possible, conceptually review key rendered output for contrast and beauty in both modes.

5. **Git + Triple Sync (the critical final part).**
   - Commit with a precise message describing the dark tweaks + full light mode perfection.
   - Push to master.
   - Execute / provide the exact deploy:
     ```bash
     cd /path/to/local/Covex27
     git pull origin master
     export PASSWORD="your_current_rotated_hetzner_root_password"
     ./DEPLOY_TO_HIGHTABLE.sh
     ```
   - After deploy completes:
     - Confirm SHAs match exactly: local == GitHub == Hetzner `/root/Covex27`.
     - On the live site (https://hightable.pro), toggle between dark and light (use the Sun/Moon button).
     - Verify:
       - Dark looks like the rich cypherpunk (with the Pricing improvements).
       - Light looks perfect, high-contrast, beautiful, no low-contrast text or broken elements.
       - Pricing, Explorer (including featured cards), Terminal (including any open game arenas), nav, etc. all render excellently in both.
     - Test on at least one demo full-screen game if possible.
   - If any post-deploy issues, fix them immediately and re-deploy.

6. **Report.**
   - Provide a clear summary of changes made to CSS/components, which areas received the most attention (Pricing, games, explorer, general), verification steps and outputs, final SHAs, and live site confirmation that both modes are now clearly differentiated and look great.
   - Note the Hermes prompt file created for future runs.

## Files You Must Touch / Verify
- frontend/src/index.css (main work for theme rules)
- frontend/src/pages/Pricing.jsx (class tweaks for better cards in both modes)
- frontend/src/App.jsx (nav if needed)
- frontend/src/components/CovexTerminal.jsx (any hard-coded styles in arenas/sections)
- frontend/src/pages/Explorer.jsx (if cards need light-friendly classes)
- Any other components that have obvious dark-only hardcodes (ui/ components should mostly be fine via vars).

Re-read this prompt and the key files before starting edits.

Be thorough. The user wants **clear difference** and **both to look great** — not just "light works," but both are polished experiences.

After you finish the code work and triple-sync, create or update a summary Hermes prompt file if useful for future identical runs.

Start now. Make both modes excellent.