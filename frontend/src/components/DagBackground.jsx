import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const BG = '#07080D';
const TEAL = '#49EACB';
const GOLD = '#E8AF34';
const BLUE = '#3B82F6';

function createBlockDAG() {
  const nodes = [];
  let id = 0;
  const depthLayers = 8;
  const nodesPerLayer = 24;

  for (let layer = 0; layer < depthLayers; layer++) {
    const radius = 25 + layer * 45;
    const count = nodesPerLayer - layer;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + layer * 0.35;
      const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 16;
      const y = Math.sin(angle) * radius * 0.5 + (Math.random() - 0.5) * 12;
      const z = (layer - depthLayers / 2) * 28 + (Math.random() - 0.5) * 18;
      nodes.push({
        id: id++,
        layer,
        x, y, z,
        angle,
        isChain: false,
        isTip: false,
      });
    }
  }

  // Build forward edges: each node connects to 1-3 nearest nodes in next layer
  for (const n of nodes) {
    if (n.layer >= depthLayers - 1) continue;
    const outer = nodes.filter((x) => x.layer === n.layer + 1);
    const sorted = [...outer].sort((a, b) => {
      const da = Math.min(Math.abs(a.angle - n.angle), Math.PI * 2 - Math.abs(a.angle - n.angle));
      const db = Math.min(Math.abs(b.angle - n.angle), Math.PI * 2 - Math.abs(b.angle - n.angle));
      return da - db;
    });
    const edgeCount = 2 + Math.floor(Math.random() * 2);
    n.edges = sorted.slice(0, Math.min(edgeCount, sorted.length));
  }

  // Mark consensus chain (greedy heaviest sub-tree)
  let current = nodes[0];
  current.isChain = true;
  while (current && current.layer < depthLayers - 1) {
    const targets = current.edges || [];
    if (!targets.length) break;
    const next = targets[0];
    next.isChain = true;
    current = next;
  }

  // Mark all nodes in last layer as tips
  nodes.filter((n) => n.layer >= depthLayers - 1).forEach((n) => { n.isTip = true; });

  return nodes;
}

export default function DagBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const testCanvas = document.createElement('canvas');
    const testGl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
    if (!testGl) return;

    let renderer;
    let animId;
    let onMove;
    let onResize;

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(BG);
      scene.fog = new THREE.FogExp2(BG, 0.0002);

      const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 1, 2000);
      camera.position.set(0, -15, 220);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      container.appendChild(renderer.domElement);

      const nodes = createBlockDAG();

      const nodeGroup = new THREE.Group();
      const nodeData = [];
      const chainEdges = [];

      nodes.forEach((n) => {
        const baseRadius = n.isChain ? 3.0 : n.isTip ? 2.2 : 1.3;
        const geo = new THREE.SphereGeometry(baseRadius, 18, 18);

        // Regular nodes: subtle teal glow
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: TEAL, transparent: true, opacity: n.isChain ? 0.9 : n.isTip ? 0.65 : 0.2
        }));
        mesh.position.set(n.x, n.y, n.z);
        nodeGroup.add(mesh);
        nodeData.push({ mesh, node: n });

        // Chain nodes get dramatic glow
        if (n.isChain) {
          // Inner glow
          const innerGlow = new THREE.Mesh(
            new THREE.SphereGeometry(baseRadius * 2.5, 12, 12),
            new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.15 })
          );
          innerGlow.position.copy(mesh.position);
          nodeGroup.add(innerGlow);
          n._innerGlow = innerGlow;

          // Middle glow
          const midGlow = new THREE.Mesh(
            new THREE.SphereGeometry(baseRadius * 4.5, 10, 10),
            new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.06 })
          );
          midGlow.position.copy(mesh.position);
          nodeGroup.add(midGlow);
          n._midGlow = midGlow;

          // Outer ring
          const ringGeo = new THREE.RingGeometry(baseRadius * 5, baseRadius * 5.8, 40);
          const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
            color: TEAL, transparent: true, opacity: 0.08, side: THREE.DoubleSide
          }));
          ring.position.copy(mesh.position);
          nodeGroup.add(ring);
          n._ring = ring;
        }

        if (n.isTip) {
          const tipGlow = new THREE.Mesh(
            new THREE.SphereGeometry(baseRadius * 4, 8, 8),
            new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.15 })
          );
          tipGlow.position.copy(mesh.position);
          nodeGroup.add(tipGlow);
          n._tipGlow = tipGlow;
        }
      });
      scene.add(nodeGroup);

      // Draw edges
      nodes.forEach((n) => {
        if (!n.edges) return;
        n.edges.forEach((target) => {
          const isChainEdge = n.isChain && target.isChain;
          const points = [
            new THREE.Vector3(n.x, n.y, n.z),
            new THREE.Vector3(target.x, target.y, target.z),
          ];
          const geo = new THREE.BufferGeometry().setFromPoints(points);
          const mat = new THREE.LineBasicMaterial({
            color: isChainEdge ? new THREE.Color(TEAL) : new THREE.Color(0x0d1f1a),
            transparent: true,
            opacity: isChainEdge ? 0.35 : 0.03,
            linewidth: 1,
          });
          const line = new THREE.Line(geo, mat);
          scene.add(line);

          // Chain edges get a glow tube
          if (isChainEdge) {
            const midPoint = new THREE.Vector3().addVectors(
              new THREE.Vector3(n.x, n.y, n.z),
              new THREE.Vector3(target.x, target.y, target.z)
            ).multiplyScalar(0.5);
            const glowGeo = new THREE.SphereGeometry(1.8, 8, 8);
            const glowMesh = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
              color: TEAL, transparent: true, opacity: 0.08
            }));
            glowMesh.position.copy(midPoint);
            nodeGroup.add(glowMesh);
            chainEdges.push({ line, glow: glowMesh, from: points[0], to: points[1], mid: midPoint });
          }
        });
      });

      // Flow particles along chain
      const flowParticles = [];
      const chainNodes = nodes.filter((n) => n.isChain && n.edges);
      chainNodes.forEach((n) => {
        n.edges.forEach((target) => {
          if (!target.isChain) return;
          const count = 3;
          for (let i = 0; i < count; i++) {
            const geo = new THREE.SphereGeometry(0.55, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(new THREE.Vector3(n.x, n.y, n.z));
            scene.add(mesh);
            flowParticles.push({
              mesh,
              from: new THREE.Vector3(n.x, n.y, n.z),
              to: new THREE.Vector3(target.x, target.y, target.z),
              progress: i / count,
              speed: 0.005 + Math.random() * 0.004,
            });
          }
        });
      });

      // Background teal particles
      const bgCount = 800;
      const bgPos = new Float32Array(bgCount * 3);
      for (let i = 0; i < bgCount; i++) {
        bgPos[i * 3] = (Math.random() - 0.5) * 1000;
        bgPos[i * 3 + 1] = (Math.random() - 0.5) * 650;
        bgPos[i * 3 + 2] = (Math.random() - 0.5) * 450;
      }
      const bgGeo = new THREE.BufferGeometry();
      bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
      const bgParticles = new THREE.Points(bgGeo, new THREE.PointsMaterial({
        color: TEAL, size: 0.7, transparent: true, opacity: 0.1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      scene.add(bgParticles);

      // Gold ambient stars
      const starCount = 160;
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        starPos[i * 3] = (Math.random() - 0.5) * 1100;
        starPos[i * 3 + 1] = (Math.random() - 0.5) * 750;
        starPos[i * 3 + 2] = (Math.random() - 0.5) * 550;
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
        color: GOLD, size: 1.0, transparent: true, opacity: 0.06,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      scene.add(stars);

      // Mouse parallax
      let mx = 0, my = 0, targetMx = 0, targetMy = 0;
      onMove = (e) => {
        targetMx = (e.clientX / window.innerWidth) * 2 - 1;
        targetMy = -(e.clientY / window.innerHeight) * 2 + 1;
      };
      window.addEventListener('mousemove', onMove, { passive: true });

      onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onResize);

      let t = 0;

      function animate() {
        t += 0.0035;

        // Smooth mouse follow
        mx += (targetMx - mx) * 0.03;
        my += (targetMy - my) * 0.03;

        // Camera orbit with parallax
        const orbitY = Math.sin(t * 0.1) * 0.05;
        const orbitX = Math.cos(t * 0.07) * 0.03;
        scene.rotation.y = orbitY + mx * 0.03;
        scene.rotation.x = orbitX + my * 0.015;
        scene.rotation.z = Math.sin(t * 0.05) * 0.01;

        // Animate nodes
        nodeData.forEach(({ node, mesh }) => {
          if (node.isChain) {
            // Dramatic pulsing chain nodes
            const pulse = Math.sin(t * 4 + node.id * 0.3) * 0.5 + 0.5; // 0..1
            mesh.material.opacity = 0.7 + pulse * 0.3;
            mesh.scale.setScalar(1 + pulse * 0.35);

            if (node._innerGlow) {
              node._innerGlow.material.opacity = 0.08 + pulse * 0.15;
              node._innerGlow.scale.setScalar(1 + pulse * 0.5);
            }
            if (node._midGlow) {
              node._midGlow.material.opacity = 0.03 + pulse * 0.07;
              node._midGlow.scale.setScalar(1 + pulse * 0.3);
            }
            if (node._ring) {
              node._ring.material.opacity = 0.04 + pulse * 0.08;
              node._ring.rotation.z += 0.008;
            }
          }

          if (node.isTip) {
            const pulse = Math.sin(t * 3 + node.id) * 0.5 + 0.5;
            mesh.scale.setScalar(1 + pulse * 0.2);
            mesh.material.opacity = 0.55 + pulse * 0.25;
            if (node._tipGlow) {
              node._tipGlow.material.opacity = 0.08 + pulse * 0.12;
              node._tipGlow.scale.setScalar(1 + pulse * 0.5);
            }
          }
        });

        // Pulse chain edge glows
        chainEdges.forEach((ce, i) => {
          const pulse = Math.sin(t * 3.5 + i * 0.5) * 0.5 + 0.5;
          ce.glow.material.opacity = 0.04 + pulse * 0.1;
          ce.glow.scale.setScalar(1 + pulse * 0.4);
          ce.line.material.opacity = 0.2 + pulse * 0.25;
        });

        // Animate flow particles
        flowParticles.forEach((fp) => {
          fp.progress = (fp.progress + fp.speed) % 1;
          fp.mesh.position.lerpVectors(fp.from, fp.to, fp.progress);
          const fadepulse = Math.sin(fp.progress * Math.PI);
          fp.mesh.material.opacity = 0.6 + fadepulse * 0.4;
          fp.mesh.scale.setScalar(0.4 + fadepulse * 0.7);
        });

        // Rotate background fields
        bgParticles.rotation.y += 0.00006;
        bgParticles.rotation.x += 0.00003;
        stars.rotation.y -= 0.00012;
        stars.rotation.x -= 0.00007;

        renderer.render(scene, camera);
        animId = requestAnimationFrame(animate);
      }
      animate();
    } catch (err) {
      console.warn('DagBackground: init failed:', err.message);
      return () => {
        if (renderer) {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('resize', onResize);
          if (renderer.domElement && container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }
          renderer.dispose();
        }
      };
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (onMove) window.removeEventListener('mousemove', onMove);
      if (onResize) window.removeEventListener('resize', onResize);
      if (renderer) {
        if (renderer.domElement && container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
      }
    };
  }, []);

  return <div ref={mountRef} className="fixed inset-0 -z-10" style={{ background: BG }} />;
}
