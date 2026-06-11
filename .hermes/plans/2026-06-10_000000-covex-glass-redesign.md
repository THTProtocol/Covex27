# Covex UI/UX Glass-Morphic Redesign — Implementation Plan v2

> **For Hermes:** Execute this plan task-by-task. Each task is self-contained with exact code.
> **Goal:** Rebuild Covex's visual identity using 21st.dev GlassButton + WebGL Shader + UI UX Pro Max design patterns. Green-accented (oklch green). Zero functionality breakage.
> **Architecture:** Layer 1: 21st.dev WebGL shader (THREE.js, green-adapted). Layer 2: 21st.dev GlassButton (base64 WebP displacement map). Layer 3: Global CSS token overhaul. Layer 4: Component-by-component restyle. All deps already installed (three, framer-motion, class-variance-authority).

---

## Task 1: Install Dependencies & Verify

**Objective:** Confirm all required deps are present.

```bash
cd /home/b42b00/Covex27/frontend
npm ls three framer-motion class-variance-authority 2>/dev/null
```

Expected: all three show versions. Already confirmed — `three@0.175.0`, `framer-motion@12.39.0`, `class-variance-authority@0.7.1`.

---

## Task 2: Create WebGL Shader Background

**File:** Create `frontend/src/components/WebGLBackground.jsx`

**Source:** Adapted from 21st.dev `aliimam/web-gl-shader` 

**Key adaptations for Covex:**
- Keep THREE.js architecture (already a dependency)
- Change color output to green spectrum: `r=0, g=0.08, b=0.02` base with green iridescence
- Deep navy/black background: `0x020805` (dark green-black)
- Add mouse parallax via uniform updates
- Performance: 60fps requestAnimationFrame, cancelAnimationFrame on unmount
- `position: fixed; z-index: 0`

**Exact implementation:**

```jsx
"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export default function WebGLBackground() {
  const canvasRef = useRef(null)
  const refs = useRef({
    scene: null, camera: null, renderer: null,
    mesh: null, uniforms: null, animationId: null,
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = refs.current

    const vertexShader = `
      attribute vec3 position;
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `

    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform float xScale;
      uniform float yScale;
      uniform float distortion;
      uniform vec2 mouse;

      void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
        // Subtle mouse-driven parallax offset (max ~3% displacement)
        p += mouse * 0.03;
        
        float d = length(p) * distortion;
        
        float rx = p.x * (1.0 + d);
        float gx = p.x;
        float bx = p.x * (1.0 - d);

        // Green spectrum: channels mapped to green variations
        // R channel: deep green glow
        // G channel: brighter green shimmer  
        // B channel: teal undertone
        float r = 0.04 / abs(p.y + sin((rx + time * 0.3) * xScale) * yScale);
        float g = 0.07 / abs(p.y + sin((gx + time * 0.3) * xScale) * yScale);
        float b = 0.03 / abs(p.y + sin((bx + time * 0.3) * xScale) * yScale);
        
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `

    const initScene = () => {
      ctx.scene = new THREE.Scene()
      ctx.renderer = new THREE.WebGLRenderer({ canvas, alpha: true })
      ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      ctx.renderer.setClearColor(new THREE.Color(0x020805), 1.0)

      ctx.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1)

      ctx.uniforms = {
        resolution: { value: [window.innerWidth, window.innerHeight] },
        time: { value: 0.0 },
        xScale: { value: 1.0 },
        yScale: { value: 0.5 },
        distortion: { value: 0.05 },
        mouse: { value: [0.0, 0.0] },
      }

      const position = [
        -1.0, -1.0, 0.0,  1.0, -1.0, 0.0, -1.0,  1.0, 0.0,
         1.0, -1.0, 0.0, -1.0,  1.0, 0.0,  1.0,  1.0, 0.0,
      ]

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(position), 3))

      ctx.mesh = new THREE.Mesh(geometry, new THREE.RawShaderMaterial({
        vertexShader, fragmentShader, uniforms: ctx.uniforms, side: THREE.DoubleSide,
      }))
      ctx.scene.add(ctx.mesh)
      handleResize()
    }

    const animate = () => {
      if (ctx.uniforms) ctx.uniforms.time.value += 0.003
      if (ctx.renderer && ctx.scene && ctx.camera) ctx.renderer.render(ctx.scene, ctx.camera)
      ctx.animationId = requestAnimationFrame(animate)
    }

    const handleResize = () => {
      if (!ctx.renderer || !ctx.uniforms) return
      ctx.renderer.setSize(window.innerWidth, window.innerHeight, false)
      ctx.uniforms.resolution.value = [window.innerWidth, window.innerHeight]
    }

    const handleMouseMove = (e) => {
      if (!ctx.uniforms) return
      // Normalize mouse to -1..1 range
      ctx.uniforms.mouse.value = [
        (e.clientX / window.innerWidth) * 2.0 - 1.0,
        -(e.clientY / window.innerHeight) * 2.0 + 1.0,
      ]
    }

    initScene()
    animate()
    window.addEventListener("resize", handleResize)
    window.addEventListener("mousemove", handleMouseMove, { passive: true })

    return () => {
      if (ctx.animationId) cancelAnimationFrame(ctx.animationId)
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("mousemove", handleMouseMove)
      if (ctx.mesh) {
        ctx.scene?.remove(ctx.mesh)
        ctx.mesh.geometry.dispose()
        if (ctx.mesh.material instanceof THREE.Material) ctx.mesh.material.dispose()
      }
      ctx.renderer?.dispose()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full block z-0 pointer-events-none"
      aria-hidden="true"
    />
  )
}
```

**Verification:**
```bash
cd /home/b42b00/Covex27/frontend && npm run dev
# 1. Canvas covers full viewport
# 2. Greenish wave shader animates slowly
# 3. Mouse movement shifts pattern subtly
# 4. Resize works
# 5. No memory leaks (check devtools on mount/unmount)
```

---

## Task 3: Create GlassButton Component

**File:** Create `frontend/src/components/ui/GlassButton.jsx`

**Source:** Direct from 21st.dev `easemize/apple-tahoe-liquid-glass-button`

**Key details:**
- Full GlassButton component as provided (base64 WebP displacement map embedded)
- Uses `class-variance-authority` for variants
- Generates unique SVG filter ID per instance via `React.useId()`
- Lens layer architecture prevents text ghosting
- Green-adapted `glassColor` defaults
- Props: `size` (default/sm/lg/icon), `contentClassName`, `glassColor`, all HTMLButtonAttrs

**Exact implementation:**

```jsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// The ultra-optimized WebP normal map from the 21st.dev reference
const WEBP_DISPLACEMENT_MAP = "...[base64 string from 21st.dev]..."

const glassButtonVariants = cva(
  "relative isolate inline-flex items-center justify-center gap-2 rounded-full cursor-pointer transition-transform duration-300 ease-out tracking-tight disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
  {
    variants: {
      size: {
        default: "px-6 py-3.5 text-base font-medium",
        sm: "px-4 py-2 text-sm font-medium",
        lg: "px-8 py-4 text-lg font-medium",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: { size: "default" },
  }
)

const GlassButton = React.forwardRef(({ className, children, size, contentClassName, glassColor, ...props }, ref) => {
  const filterId = React.useId().replace(/:/g, "")
  const resolvedGlassColor = glassColor || "oklch(0.55 0.18 150 / 15%)" // green accent default

  return (
    <>
      <svg className="absolute w-0 h-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <filter id={`liquid-glass-${filterId}`} primitiveUnits="objectBoundingBox">
          <feImage result="map" width="100%" height="100%" x="0" y="0" href={WEBP_DISPLACEMENT_MAP} preserveAspectRatio="none" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.01" result="blur" />
          <feDisplacementMap id="disp" in="blur" in2="map" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <style>{`
        .btn-liquid {
          appearance: none;
          border: none;
          background: transparent;
          color: oklch(from var(--foreground) l c h / 95%);
          --glass-reflex-light: 1;
          --glass-reflex-dark: 1;
        }
        .btn-liquid-lens {
          background-color: ${resolvedGlassColor};
          backdrop-filter: blur(8px) url(#liquid-glass-${filterId}) saturate(150%);
          -webkit-backdrop-filter: blur(8px) saturate(150%);
          box-shadow: 
            inset 0 0 0 1px color-mix(in srgb, white calc(var(--glass-reflex-light) * 10%), transparent),
            inset 1.8px 3px 0px -2px color-mix(in srgb, white calc(var(--glass-reflex-light) * 90%), transparent), 
            inset -2px -2px 0px -2px color-mix(in srgb, white calc(var(--glass-reflex-light) * 80%), transparent), 
            inset -3px -8px 1px -6px color-mix(in srgb, white calc(var(--glass-reflex-light) * 60%), transparent), 
            inset -0.3px -1px 4px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 12%), transparent), 
            inset -1.5px 2.5px 0px -2px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 20%), transparent), 
            inset 0px 3px 4px -2px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 20%), transparent), 
            inset 2px -6.5px 1px -4px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 10%), transparent), 
            0px 1px 5px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 10%), transparent), 
            0px 6px 16px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 8%), transparent);
          transition: background-color 400ms cubic-bezier(1, 0.0, 0.4, 1), box-shadow 400ms cubic-bezier(1, 0.0, 0.4, 1);
        }
        .btn-liquid-text {
          text-shadow: 0 1px 2px oklch(from var(--background) l c h / 30%);
          transition: color 400ms cubic-bezier(1, 0.0, 0.4, 1);
        }
        @media (hover: hover) {
          .btn-liquid:not(:disabled):hover { transform: scale(1.03); }
        }
        .btn-liquid:not(:disabled):active { transform: scale(0.96); }
      `}</style>

      <button className={cn(glassButtonVariants({ size }), "btn-liquid", className)} ref={ref} {...props}>
        <span className="btn-liquid-lens absolute inset-0 -z-10 rounded-[inherit] pointer-events-none" />
        <span className={cn("btn-liquid-text relative z-10 w-full flex items-center justify-center gap-[inherit] select-none", contentClassName)}>
          {children}
        </span>
      </button>
    </> 
  )
})

GlassButton.displayName = "GlassButton"
export { GlassButton, glassButtonVariants }
```

**Verification:**
```bash
# Test in browser:
# 1. Button renders with glass effect
# 2. Hover: scale(1.03), Active: scale(0.96)
# 3. SVG displacement filter visible on backdrop
# 4. Text legible, no ghosting
# 5. Green glass tint visible
```

---

## Task 4: Global CSS Token Overhaul

**File:** Modify `frontend/src/index.css`

**Changes:**
1. Replace `:root` token block with green oklch tokens
2. Replace `body` background with solid dark green-black
3. Add `.glass-panel`, typography, interaction classes
4. Keep ALL `.light` overrides intact
5. Update scrollbar, selection, focus rings

**Complete new index.css** (see separate file for full content — too large for inline plan)

Key sections:
- `:root` tokens (oklch green palette)
- Tailwind `@theme` updates
- `.glass-panel` base class with ::before rim
- Typography classes (`.text-gradient`, `.label-caps`, `.hero-text`)
- Button styles using GlassButton
- Input glass styles
- Micro-interactions (`.spring-in`, `.stagger-*`, `.scroll-reveal`, `.hover-glow`)
- Status indicators (`.status-ping`)
- Dark/light mode (keep existing light overrides)
- Animations

**Verification:**
```bash
cd /home/b42b00/Covex27/frontend && npm run dev
# 1. Page renders with new background color
# 2. CSS variables available in devtools
# 3. Light mode toggle still works
```

---

## Task 5: Replace DagBackground with WebGLBackground in App.jsx

**File:** Modify `frontend/src/App.jsx`

**Changes:**
1. Replace import: `import WebGLBackground from './components/WebGLBackground'`
2. Replace `<DagBackground />` with `<WebGLBackground />`
3. Nav: floating glass pill (rounded-full, glass-panel, sticky top:16px, max-w-4xl mx-auto)
4. Active nav link: green text underline

**Verification:**
```bash
# 1. WebGL canvas visible in background
# 2. DAG iframe no longer renders
# 3. Nav is floating pill with glass
```

---

## Task 6: UI Primitive Restyle (Button.tsx, Card.tsx, Input.tsx, Badge.tsx, Separator.jsx)

**Files to modify:**
- `frontend/src/components/ui/Button.tsx` — Add `glass` variant that wraps GlassButton
- `frontend/src/components/ui/Card.tsx` — Apply glass-panel base classes
- `frontend/src/components/ui/Input.tsx` — Glass text input style
- `frontend/src/components/ui/Badge.tsx` — Glass badge variants
- `frontend/src/components/ui/Separator.jsx` — Update to oklch border color

**Button.tsx changes:**
Add `glass` variant: uses the GlassButton component internally with size mapping.

**Card.tsx changes:**
Replace `bg-zinc-900/80` → glass-panel classes
Add top rim via CSS `::before`

**Input.tsx changes:**
```tsx
className={cn(
  "flex h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/30",
  "focus-visible:outline-none focus-visible:border-[var(--accent-primary)] focus-visible:shadow-[0_0_0_3px_oklch(0.65_0.20_150_/_15%)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  className
)}
```

**Badge.tsx changes:**
Apply glass-panel base + specific variant colors (green builder, purple max, amber pro).

---

## Task 7: Explorer Page Polish

**File:** Modify `frontend/src/pages/Explorer.jsx`

- Hero section: `.text-gradient` headline
- Covenant cards: glass-panel, hover-glow
- Search: glass input style
- Section headings: `.label-caps`

---

## Task 8: Pricing Page Polish

**File:** Modify `frontend/src/pages/Pricing.jsx`

- Tier cards: GlassCard treatment
- "Buy" buttons: GlassButton accent variant
- Active tier: green accent glow

---

## Task 9: Remaining Pages & Final Polish

- Dashboard.jsx, Deploy.jsx, PremiumBuilder.jsx, CovenantInteractive.jsx
- Apply glass-panel, GlassButton, glass inputs consistently

---

## Task 10: Final Verification

```bash
cd /home/b42b00/Covex27/frontend
npm run build  # must pass
npm run dev    # manual walkthrough all pages
```

Checklist:
- [ ] All routes load
- [ ] Wallet connect works
- [ ] Network switcher works
- [ ] Dark/light toggle works
- [ ] All interactive elements functional
- [ ] WebGL shader renders smoothly
- [ ] GlassButton renders correctly
- [ ] No console errors
- [ ] Build succeeds

---

## Dependencies (All Already Installed)

| Package | Version | Used For |
|---------|---------|----------|
| three | ^0.175.0 | WebGL shader background |
| framer-motion | ^12.39.0 | Available for spring animations |
| class-variance-authority | ^0.7.1 | GlassButton variants |
| @react-three/fiber | ^9.1.0 | Available (not directly used) |
| @react-three/drei | ^10.0.0 | Available (not directly used) |
