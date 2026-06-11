"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export default function WebGLBackground() {
  const canvasRef = useRef(null)
  const ctx = useRef({
    scene: null,
    camera: null,
    renderer: null,
    mesh: null,
    uniforms: null,
    animationId: null,
  })

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const r = ctx.current

    const vertexShader = /* glsl */ `
      attribute vec3 position;
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `

    const fragmentShader = /* glsl */ `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform float xScale;
      uniform float yScale;
      uniform float distortion;
      uniform vec2 mouse;

      void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
        // Mouse-driven parallax: subtle ~3% displacement at edges, 0 at center
        p += mouse * 0.03 * length(p);
        
        float d = length(p) * distortion;
        
        // Chromatic aberration channels mapped to green spectrum
        float rx = p.x * (1.0 + d);
        float gx = p.x;
        float bx = p.x * (1.0 - d);

        // Teal iridescent shimmer — organic fluid motion in deep navy-teal
        float speed = time * 0.5;
        float r = 0.02 / abs(p.y + sin((rx + speed) * xScale) * yScale);
        float g = 0.08 / abs(p.y + sin((gx + speed) * xScale) * yScale);
        float b = 0.07 / abs(p.y + sin((bx + speed) * xScale) * yScale);
        
        // Clamp values to prevent fireflies
        r = min(r, 0.6);
        g = min(g, 1.0);
        b = min(b, 0.8);
        
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `

    const initScene = () => {
      r.scene = new THREE.Scene()
      r.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false })
      r.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      r.renderer.setClearColor(new THREE.Color(0x001f1d), 1.0)

      r.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1)

      r.uniforms = {
        resolution: { value: [window.innerWidth, window.innerHeight] },
        time: { value: 0.0 },
        xScale: { value: 1.0 },
        yScale: { value: 0.5 },
        distortion: { value: 0.05 },
        mouse: { value: [0.0, 0.0] },
      }

      const position = new Float32Array([
        -1.0, -1.0, 0.0,  1.0, -1.0, 0.0, -1.0,  1.0, 0.0,
         1.0, -1.0, 0.0, -1.0,  1.0, 0.0,  1.0,  1.0, 0.0,
      ])

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute("position", new THREE.BufferAttribute(position, 3))

      const material = new THREE.RawShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: r.uniforms,
        side: THREE.DoubleSide,
      })

      r.mesh = new THREE.Mesh(geometry, material)
      r.scene.add(r.mesh)
      handleResize()
    }

    const animate = () => {
      if (r.uniforms) r.uniforms.time.value += 0.015
      if (r.renderer && r.scene && r.camera) {
        r.renderer.render(r.scene, r.camera)
      }
      r.animationId = requestAnimationFrame(animate)
    }

    const handleResize = () => {
      if (!r.renderer || !r.uniforms) return
      const w = window.innerWidth
      const h = window.innerHeight
      r.renderer.setSize(w, h, false)
      r.uniforms.resolution.value = [w, h]
    }

    const handleMouseMove = (e) => {
      if (!r.uniforms) return
      r.uniforms.mouse.value = [
        (e.clientX / window.innerWidth) * 2.0 - 1.0,
        -(e.clientY / window.innerHeight) * 2.0 + 1.0,
      ]
    }

    initScene()
    animate()
    window.addEventListener("resize", handleResize)
    window.addEventListener("mousemove", handleMouseMove, { passive: true })

    return () => {
      if (r.animationId) cancelAnimationFrame(r.animationId)
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("mousemove", handleMouseMove)
      if (r.mesh) {
        r.scene?.remove(r.mesh)
        r.mesh.geometry.dispose()
        const mat = r.mesh.material
        if (mat instanceof THREE.Material) mat.dispose()
      }
      r.renderer?.dispose()
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
