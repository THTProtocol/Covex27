import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const BG = '#07080D';
const NODE_TEAL = '#49EACB';
const NODE_GOLD = '#E8AF34';
const CHAIN_GLOW = '#49EACB';
const EDGE_COLOR = 0x1a3a35;

function createDAG() {
  const nodes = [];
  let id = 0;
  const levels = 24;
  for (let l = 0; l < levels; l++) {
    const count = Math.max(2, 10 - Math.floor(l * 0.35));
    for (let i = 0; i < count; i++) {
      const spread = 70 + l * 8;
      const angle = (i / count) * Math.PI * 2 + l * 0.9;
      nodes.push({
        id: id++,
        level: l,
        x: Math.cos(angle) * spread + (Math.random() - 0.5) * 20,
        y: Math.sin(angle) * spread * 0.5 + (Math.random() - 0.5) * 15,
        z: (Math.random() - 0.5) * 60,
        parents: [],
        isChain: false,
        isTip: l >= levels - 2,
      });
    }
  }

  // Connect parents
  for (let idx = 0; idx < nodes.length; idx++) {
    const n = nodes[idx];
    if (n.level === 0) continue;
    const prevLevelNodes = nodes.filter((x) => x.level === n.level - 1);
    const edges = 1 + Math.floor(Math.random() * Math.min(2, prevLevelNodes.length));
    for (let e = 0; e < edges; e++) {
      const p = prevLevelNodes[Math.floor(Math.random() * prevLevelNodes.length)];
      if (p && !n.parents.includes(p)) n.parents.push(p);
    }
  }

  // Mark heaviest chain (graph traversal from genesis)
  let chain = [nodes[0]];
  nodes[0].isChain = true;
  for (let l = 1; l < levels; l++) {
    const currentLevel = nodes.filter((n) => n.level === l);
    if (!currentLevel.length) break;
    const last = chain[chain.length - 1];
    const connected = currentLevel.filter((n) => n.parents.includes(last));
    const next = connected.length ? connected[Math.floor(Math.random() * connected.length)] : currentLevel[Math.floor(Math.random() * currentLevel.length)];
    next.isChain = true;
    chain.push(next);
  }

  return nodes;
}

export default function DagBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.FogExp2(BG, 0.0009);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 0, 320);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const nodes = createDAG();

    // Materials
    const nodeMat = new THREE.MeshBasicMaterial({ color: NODE_TEAL, transparent: true, opacity: 0.35 });
    const chainMat = new THREE.MeshBasicMaterial({ color: CHAIN_GLOW, transparent: true, opacity: 0.9 });
    const tipMat = new THREE.MeshBasicMaterial({ color: NODE_GOLD, transparent: true, opacity: 0.85 });
    const glowMat = new THREE.MeshBasicMaterial({ color: CHAIN_GLOW, transparent: true, opacity: 0.1 });
    const ringMat = new THREE.MeshBasicMaterial({ color: CHAIN_GLOW, transparent: true, opacity: 0.08, side: THREE.DoubleSide });

    // Create nodes
    const nodeGroup = new THREE.Group();
    const nodeMeshes = [];

    nodes.forEach((n) => {
      const radius = n.isChain ? 2.6 : n.isTip ? 2.0 : 1.4;
      const geo = new THREE.SphereGeometry(radius, 14, 14);
      const mat = n.isChain ? chainMat : n.isTip ? tipMat : nodeMat;
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.position.set(n.x, n.y, n.z);
      nodeGroup.add(mesh);
      nodeMeshes.push({ mesh, node: n });

      if (n.isChain) {
        const glow = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 12), glowMat.clone());
        glow.position.copy(mesh.position);
        nodeGroup.add(glow);
        n.glowMesh = glow;

        const ring = new THREE.Mesh(new THREE.RingGeometry(9, 10, 32), ringMat.clone());
        ring.position.copy(mesh.position);
        ring.lookAt(camera.position);
        nodeGroup.add(ring);
        n.ringMesh = ring;
      }
    });
    scene.add(nodeGroup);

    // Create edges
    const edgeLines = [];
    nodes.forEach((n) => {
      n.parents.forEach((p) => {
        const points = [new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(n.x, n.y, n.z)];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const isChainEdge = n.isChain && p.isChain;
        const mat = new THREE.LineBasicMaterial({
          color: isChainEdge ? NODE_TEAL : EDGE_COLOR,
          transparent: true,
          opacity: isChainEdge ? 0.4 : 0.08,
        });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        edgeLines.push({ line, isChain: isChainEdge, p1: points[0], p2: points[1], progress: Math.random() });
      });
    });

    // Data flow particles on chain edges
    const flowParticles = [];
    edgeLines.filter((e) => e.isChain).forEach((edge) => {
      const geo = new THREE.SphereGeometry(0.6, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: NODE_GOLD, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(edge.p1);
      scene.add(mesh);
      flowParticles.push({ mesh, edge, speed: 0.008 + Math.random() * 0.005 });
    });

    // Ambient particles
    const pCount = 800;
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 1000;
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 700;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: NODE_TEAL,
      size: 0.8,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Mouse parallax
    let mx = 0, my = 0;
    const onMove = (e) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMove);
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    let animId;
    let t = 0;

    function animate() {
      t += 0.004;

      scene.rotation.y = Math.sin(t * 0.15) * 0.06 + mx * 0.025;
      scene.rotation.x = Math.cos(t * 0.1) * 0.03 + my * 0.015;

      // Pulse chain nodes
      nodeMeshes.forEach(({ node, mesh }) => {
        if (node.isChain && node.glowMesh) {
          const pulse = 0.08 + Math.sin(t * 3 + node.id * 0.3) * 0.06;
          node.glowMesh.material.opacity = pulse;
          node.glowMesh.scale.setScalar(1 + pulse * 0.4);
        }
        if (node.isTip) {
          mesh.scale.setScalar(1 + Math.sin(t * 2.5 + node.id) * 0.12);
        }
      });

      // Animate chain edges
      edgeLines.forEach(({ line, isChain }, i) => {
        if (isChain) {
          line.material.opacity = 0.3 + Math.sin(t * 2 + i) * 0.15;
        }
      });

      // Flow particles along edges
      flowParticles.forEach((fp) => {
        fp.progress = (fp.progress + fp.speed) % 1;
        const edge = fp.edge;
        fp.mesh.position.lerpVectors(edge.p1, edge.p2, fp.progress);
        const pulseSize = 0.6 + Math.sin(t * 4) * 0.3;
        fp.mesh.scale.setScalar(pulseSize);
      });

      particles.rotation.y += 0.00012;
      particles.rotation.x += 0.00006;

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="fixed inset-0 -z-10" style={{ background: BG }} />;
}
