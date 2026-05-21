import { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';

const NODE_COUNT = 120;
const BG_COLOR = '#05050A';
const EDGE_DIST = 180;
const GLOW_COLOR = '#49EACB';
const ACCENT_COLOR = '#E8AF34';

function randomSphere(radius = 400) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi) * 0.3
  );
}

export default function DagBackground() {
  const mountRef = useRef(null);

  const nodes = useMemo(() => {
    const arr = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      arr.push({
        id: i,
        position: randomSphere(420),
        label: Math.random().toString(16).slice(2, 10),
        isGold: i < 12,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.15
        ),
      });
    }
    // Consensus path: pick 8 nodes and connect them
    for (let c = 0; c < 8; c++) {
      arr[c].onConsensusPath = true;
    }
    return arr;
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);
    scene.fog = new THREE.FogExp2(BG_COLOR, 0.0002);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      10,
      2000
    );
    camera.position.set(0, 40, 500);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Node meshes
    const nodeGroup = new THREE.Group();
    const nodeMeshes = [];
    const edgeLines = [];

    nodes.forEach((node) => {
      const geo = new THREE.SphereGeometry(node.isGold ? 2.4 : 1.6, 16, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: node.isGold ? ACCENT_COLOR : GLOW_COLOR,
        emissive: node.isGold ? ACCENT_COLOR : GLOW_COLOR,
        emissiveIntensity: node.isGold ? 1.5 : 0.7,
        roughness: 0.3,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(node.position);
      nodeGroup.add(mesh);
      nodeMeshes.push({ mesh, node });
    });

    scene.add(nodeGroup);

    // Consensus path glow line
    const consensusGeo = new THREE.BufferGeometry();
    const consensusPts = [];
    for (let i = 0; i < Math.min(8, nodes.length); i++) {
      consensusPts.push(nodes[i].position);
    }
    consensusGeo.setFromPoints(consensusPts);
    const consensusLine = new THREE.Line(
      consensusGeo,
      new THREE.LineBasicMaterial({ color: GLOW_COLOR, linewidth: 1, transparent: true, opacity: 0.5 })
    );
    scene.add(consensusLine);

    // Lighting
    const ambient = new THREE.AmbientLight(0x1a1a2e, 0.8);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(0x49EACB, 2, 600);
    pointLight.position.set(0, 100, 100);
    scene.add(pointLight);

    // Particles
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 500;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const p = randomSphere(500);
      particlePositions[i * 3] = p.x;
      particlePositions[i * 3 + 1] = p.y;
      particlePositions[i * 3 + 2] = p.z;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: GLOW_COLOR,
      size: 1.2,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Animation
    let animId;
    let mouseX = 0, mouseY = 0;
    const targetRot = { x: 0, y: 0 };

    const onMouseMove = (e) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMouseMove);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    function animate() {
      targetRot.y += (mouseX * 0.005 - targetRot.y) * 0.02;
      targetRot.x += (mouseY * 0.003 - targetRot.x) * 0.02;

      nodeGroup.rotation.y += targetRot.y * 0.03;
      nodeGroup.rotation.x += targetRot.x * 0.03;

      // Pulse consensus line
      consensusLine.material.opacity = 0.4 + Math.sin(Date.now() * 0.001) * 0.15;

      // Rotate particles
      particles.rotation.y += 0.0002;
      particles.rotation.x += 0.0001;

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [nodes]);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 -z-10"
      style={{ background: BG_COLOR }}
    />
  );
}
