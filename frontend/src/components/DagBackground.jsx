import { useEffect, useRef } from 'react';

/* ── Constants ──────────────────────────────────────────────────── */

const NODE_COUNT = 80;
const NODE_W = 80;
const NODE_H = 28;
const NODE_COLOR = '#4b7294';
const NODE_TEXT_COLOR = 'rgba(255,255,255,0.5)';
const LINE_COLOR = 'rgba(255,255,255,0.10)';
const CONSENSUS_COLOR = '#49EACB';
const CONSENSUS_WIDTH = 2.5;
const CONSENSUS_GLOW = 'rgba(73, 234, 203, 0.25)';
const BG = '#0A0A0D';
const SPEED_FACTOR = 0.25; // pixels per frame

/* ── Helpers ────────────────────────────────────────────────────── */

const randHex = () =>
  Array.from({ length: 8 }, () =>
    '0123456789ABCDEF'[Math.floor(Math.random() * 16)],
  ).join('');

const hexAt = (hex, i) => hex[i % hex.length];

/* ── Node ───────────────────────────────────────────────────────── */

class Node {
  constructor(canvas) {
    this.canvas = canvas;
    this.reset(true);
  }

  reset(init = false) {
    this.x = Math.random() * this.canvas.width;
    this.y = init
      ? Math.random() * this.canvas.height
      : -NODE_H - Math.random() * 200; // spawn above canvas
    this.vx = (Math.random() - 0.5) * 1.2;
    this.vy = 0.8 + Math.random() * 1.2;
    this.hex = randHex();
    // Assign a layer for consensus-path selection (middle layers = consensus)
    this.layer = Math.floor(Math.random() * 5);
  }

  update() {
    this.x += this.vx * SPEED_FACTOR;
    this.y += this.vy * SPEED_FACTOR;

    // Wrap horizontally
    if (this.x > this.canvas.width + NODE_W) this.x = -NODE_W;
    if (this.x < -NODE_W) this.x = this.canvas.width + NODE_W;

    // Reset when off bottom
    if (this.y > this.canvas.height + NODE_H + 50) {
      this.reset();
    }
  }

  draw(ctx) {
    const { x, y, hex } = this;
    const w = NODE_W;
    const h = NODE_H;

    // Block body
    ctx.fillStyle = NODE_COLOR;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 4);
    ctx.fill();

    // Hex text
    ctx.fillStyle = NODE_TEXT_COLOR;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hex, x, y);
  }
}

/* ── Consensus chain ────────────────────────────────────────────── */

/**
 * Build an ordered chain from nodes in a given layer band,
 * sorted top-to-bottom so the consensus line flows downward.
 */
function buildConsensusPath(nodes, minLayer, maxLayer) {
  const chain = nodes
    .filter((n) => n.layer >= minLayer && n.layer <= maxLayer)
    .sort((a, b) => a.y - b.y);

  return chain;
}

/* ── Component ──────────────────────────────────────────────────── */

export default function DagBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let nodes = [];
    let animId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize node swarm
    nodes = Array.from({ length: NODE_COUNT }, () => new Node(canvas));

    const drawLine = (ctx, a, b, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    const animate = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      // ── Sort nodes by y for top-to-bottom drawing ─────────
      const sorted = [...nodes].sort((a, b) => a.y - b.y);

      // ── Draw edges (faint white lines between nearby nodes) ──
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i];
          const b = sorted[j];
          const dy = b.y - a.y;
          if (dy > 120) break; // only connect vertically close nodes
          const dx = Math.abs(b.x - a.x);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            const alpha = 0.10 * (1 - dist / 160);
            ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // ── Consensus path ────────────────────────────────────
      // Pick nodes in the middle layers (layer 2) as the "main chain"
      const consensusNodes = buildConsensusPath(nodes, 2, 2);

      // Draw thick glow underlay
      for (let i = 0; i < consensusNodes.length - 1; i++) {
        drawLine(ctx, consensusNodes[i], consensusNodes[i + 1], CONSENSUS_GLOW, 8);
      }

      // Draw bright consensus line
      for (let i = 0; i < consensusNodes.length - 1; i++) {
        drawLine(ctx, consensusNodes[i], consensusNodes[i + 1], CONSENSUS_COLOR, CONSENSUS_WIDTH);
      }

      // ── Draw nodes ────────────────────────────────────────
      for (const node of sorted) {
        node.draw(ctx);
        node.update();
      }

      // ── Highlight consensus nodes with a brighter border ──
      for (const node of consensusNodes) {
        const { x, y } = node;
        ctx.strokeStyle = CONSENSUS_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x - NODE_W / 2, y - NODE_H / 2, NODE_W, NODE_H, 4);
        ctx.stroke();
      }

      animId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ background: BG }}
    />
  );
}
