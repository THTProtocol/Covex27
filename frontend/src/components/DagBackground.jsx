import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const BG = '#07080D';
const NODE_TEAL = '#49EACB';
const NODE_GOLD = '#E8AF34';

function createBlockDAG() {
  const nodes = [];
  let id = 0;
  const depthLayers = 6;
  const nodesPerLayer = 28;

  // Create concentric layers
  for (let layer = 0; layer < depthLayers; layer++) {
    const radius = 30 + layer * 50;
    const count = nodesPerLayer - layer * 2;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + layer * 0.4;
      const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 18;
      const y = Math.sin(angle) * radius * 0.55 + (Math.random() - 0.5) * 14;
      const z = (layer - depthLayers / 2) * 30 + (Math.random() - 0.5) * 20;
      nodes.push({
        id: id++,
        layer,
        x, y, z,
        original: { x, y, z },
        angle,
        isChain: false,
        isTip: false,
      });
    }
  }

  // Build edges: each node connects to 1-3 nodes in the next outer layer
  for (const n of nodes) {
    if (n.layer >= depthLayers - 1) continue;
    const outer = nodes.filter((x) => x.layer === n.layer + 1);
    const closest = outer
      .sort((a, b) => {
        const da = Math.abs(a.angle - n.angle);
        const db = Math.abs(b.angle - n.angle);
        return da - db;
      })
      .slice(0, 2 + Math.floor(Math.random() * 2));
    closest.forEach((c) => {
      if (!n.edges) n.edges = [];
      n.edges.push(c);
    });
  }

  // Mark consensus chain (longest path)
  let current = nodes[0];
  current.isChain = true;
  while (current && current.layer < depthLayers - 1) {
    const candidates = current.edges || [];
    if (!candidates.length) break;
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    next.isChain = true;
    current = next;
  }

  // Mark tip nodes
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
      scene.fog = new THREE.FogExp2(BG, 0.00025);

      const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 2000);
      camera.position.set(0, -10, 200);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      container.appendChild(renderer.domElement);

      const nodes = createBlockDAG();

      // Node materials
      const tealMat = new THREE.MeshBasicMaterial({ color: NODE_TEAL, transparent: true, opacity: 0.25 });
      const goldMat = new THREE.MeshBasicMaterial({ color: NODE_GOLD, transparent: true, opacity: 0.7 });
      const chainGlow = new THREE.MeshBasicMaterial({ color: NODE_TEAL, transparent: true, opacity: 0.10 });
      const tipGlow = new THREE.MeshBasicMaterial({ color: NODE_GOLD, transparent: true, opacity: 0.12 });

      const nodeGroup = new THREE.Group();
      const nodeData = [];

      nodes.forEach((n) => {
        const radius = n.isChain ? 3.2 : n.isTip ? 2.4 : 1.5;
        const geo = new THREE.SphereGeometry(radius, 16, 16);
        const mat = n.isChain ? chainGlow : n.isTip ? goldMat : tealMat;
        const mesh = new THREE.Mesh(geo, mat.clone());
        mesh.position.set(n.x, n.y, n.z);
        nodeGroup.add(mesh);
        nodeData.push({ mesh, node: n });

        // Outer glow ring for chain nodes
        if (n.isChain) {
          const glowGeo = new THREE.SphereGeometry(radius * 3.5, 10, 10);
          const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: NODE_TEAL, transparent: true, opacity: 0.06 }));
          glow.position.copy(mesh.position);
          nodeGroup.add(glow);
          n._glow = glow;

          const ringGeo = new THREE.RingGeometry(radius * 4, radius * 4.5, 32);
          const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: NODE_TEAL, transparent: true, opacity: 0.05, side: THREE.DoubleSide }));
          ring.position.copy(mesh.position);
          nodeGroup.add(ring);
          n._ring = ring;
        }

        if (n.isTip) {
          const tGlow = new THREE.Mesh(
            new THREE.SphereGeometry(6, 10, 10),
            tipGlow.clone()
          );
          tGlow.position.copy(mesh.position);
          nodeGroup.add(tGlow);
          n._tGlow = tGlow;
        }
      });
      scene.add(nodeGroup);

      // Edges
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
            color: isChainEdge ? NODE_TEAL : 0x0e2a25,
            transparent: true,
            opacity: isChainEdge ? 0.22 : 0.04,
          });
          const line = new THREE.Line(geo, mat);
          scene.add(line);
          if (isChainEdge) {
            (n._edges || (n._edges = [])).push({ line, target });
          }
        });
      });

      // Flow particles along chain edges
      const flowParticles = [];
      const chainNodes = nodes.filter((n) => n.isChain && n.edges);
      chainNodes.forEach((n) => {
        n.edges.forEach((target) => {
          if (!target.isChain) return;
          for (let i = 0; i < 2; i++) {
            const geo = new THREE.SphereGeometry(0.5, 6, 6);
            const mat = new THREE.MeshBasicMaterial({ color: NODE_GOLD, transparent: true, opacity: 0.8 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(new THREE.Vector3(n.x, n.y, n.z));
            scene.add(mesh);
            flowParticles.push({
              mesh,
              from: new THREE.Vector3(n.x, n.y, n.z),
              to: new THREE.Vector3(target.x, target.y, target.z),
              progress: Math.random(),
              speed: 0.004 + Math.random() * 0.006,
            });
          }
        });
      });

      // Background particle field
      const pCount = 600;
      const pPos = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount; i++) {
        pPos[i * 3] = (Math.random() - 0.5) * 900;
        pPos[i * 3 + 1] = (Math.random() - 0.5) * 600;
        pPos[i * 3 + 2] = (Math.random() - 0.5) * 400;
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      const pMat = new THREE.PointsMaterial({
        color: NODE_TEAL,
        size: 0.9,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const particles = new THREE.Points(pGeo, pMat);
      scene.add(particles);

      // Ambient star particles (gold)
      const sCount = 120;
      const sPos = new Float32Array(sCount * 3);
      for (let i = 0; i < sCount; i++) {
        sPos[i * 3] = (Math.random() - 0.5) * 1000;
        sPos[i * 3 + 1] = (Math.random() - 0.5) * 700;
        sPos[i * 3 + 2] = (Math.random() - 0.5) * 500;
      }
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
      const sMat = new THREE.PointsMaterial({
        color: NODE_GOLD,
        size: 1.2,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const stars = new THREE.Points(sGeo, sMat);
      scene.add(stars);

      let mx = 0, my = 0;
      onMove = (e) => {
        mx = (e.clientX / window.innerWidth) * 2 - 1;
        my = -(e.clientY / window.innerHeight) * 2 + 1;
      };
      window.addEventListener('mousemove', onMove);
      onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onResize);

      let t = 0;

      function animate() {
        t += 0.003;

        // Gentle auto-rotation + mouse parallax
        scene.rotation.y = Math.sin(t * 0.12) * 0.04 + mx * 0.02;
        scene.rotation.x = Math.cos(t * 0.08) * 0.02 + my * 0.01;

        // Pulse chain nodes
        nodeData.forEach(({ node, mesh }) => {
          if (node.isChain && node._glow) {
            const pulse = 0.05 + Math.sin(t * 3.5 + node.id * 0.25) * 0.04;
            node._glow.material.opacity = pulse;
            node._glow.scale.setScalar(1 + pulse * 0.6);
            if (node._ring) {
              node._ring.material.opacity = 0.03 + Math.sin(t * 2.2 + node.id) * 0.025;
            }
          }
          if (node.isTip && node._tGlow) {
            node._tGlow.material.opacity = 0.06 + Math.sin(t * 4 + node.id) * 0.04;
            node._tGlow.scale.setScalar(1 + Math.sin(t * 3 + node.id) * 0.3);
            mesh.scale.setScalar(1 + Math.sin(t * 2.5 + node.id) * 0.1);
          }
        });

        // Animate flow particles
        flowParticles.forEach((fp) => {
          fp.progress = (fp.progress + fp.speed) % 1;
          fp.mesh.position.lerpVectors(fp.from, fp.to, fp.progress);
          const sz = 0.4 + Math.sin(t * 5 + fp.progress * Math.PI) * 0.3;
          fp.mesh.scale.setScalar(sz);
        });

        // Rotate particle fields
        particles.rotation.y += 0.00008;
        particles.rotation.x += 0.00004;
        stars.rotation.y -= 0.0001;
        stars.rotation.x -= 0.00005;

        renderer.render(scene, camera);
        animId = requestAnimationFrame(animate);
      }
      animate();
    } catch (err) {
      console.warn('DagBackground: init failed, falling back to static gradient:', err.message);
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
