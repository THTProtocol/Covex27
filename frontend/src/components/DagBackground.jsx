import React, { useEffect, useRef } from 'react';
import { useTheme } from './ThemeProvider';

/**
 * Local BlockDAG visualizer: blocks drift in from the right in parallel lanes
 * and link back to earlier blocks, like the Kaspa DAG itself. Pure canvas,
 * no external iframe, restarts instantly on theme switch, pauses when the
 * tab is hidden, and respects prefers-reduced-motion.
 */
const DagBackground = () => {
  const { theme } = useTheme();
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isDark = theme === 'dark';

    const C = isDark
      ? { edge: 'rgba(73,234,203,0.16)', edgeHi: 'rgba(34,211,238,0.32)', block: 'rgba(73,234,203,0.5)', blockHi: '#49EACB', text: 'rgba(73,234,203,0.34)' }
      : { edge: 'rgba(13,148,136,0.13)', edgeHi: 'rgba(13,148,136,0.26)', block: 'rgba(13,148,136,0.38)', blockHi: '#0d9488', text: 'rgba(13,148,136,0.3)' };

    let w = 0, h = 0, dpr = 1, raf = 0, running = true;
    const LANES = 7;
    const blocks = [];
    const SPEED = reduced ? 0 : 0.22;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const laneY = (lane) => (h / (LANES + 1)) * (lane + 1) + Math.sin(lane * 7.3) * 14;
    const newBlock = (x) => {
      const lane = Math.floor(Math.random() * LANES);
      const b = {
        x, lane, y: laneY(lane),
        size: 7 + Math.random() * 9,
        hash: Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0').toUpperCase(),
        parents: [],
        born: performance.now(),
      };
      // link to 1-3 nearest earlier blocks (the DAG part)
      const candidates = blocks.filter((p) => p.x > b.x + 40 && p.x < b.x + w * 0.3);
      candidates.sort((p, q) => (Math.abs(p.y - b.y) + (p.x - b.x)) - (Math.abs(q.y - b.y) + (q.x - b.x)));
      b.parents = candidates.slice(0, 1 + Math.floor(Math.random() * 2));
      return b;
    };

    const seed = () => {
      blocks.length = 0;
      const count = Math.max(26, Math.floor(w / 55));
      for (let i = 0; i < count; i++) blocks.push(newBlock(w - (i * w) / count));
      blocks.sort((a, b2) => b2.x - a.x);
    };

    let last = 0;
    const frame = (t) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (t - last < 33) return; // ~30fps is plenty for ambience
      last = t;
      ctx.clearRect(0, 0, w, h);

      ctx.lineWidth = 1;
      for (const b of blocks) {
        for (const p of b.parents) {
          const fresh = t - b.born < 1200;
          ctx.strokeStyle = fresh ? C.edgeHi : C.edge;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          const mx = (b.x + p.x) / 2;
          ctx.bezierCurveTo(mx, b.y, mx, p.y, p.x, p.y);
          ctx.stroke();
        }
      }
      ctx.font = '8px monospace';
      for (const b of blocks) {
        const fresh = t - b.born < 1200;
        const s = b.size;
        ctx.fillStyle = fresh ? C.blockHi : C.block;
        if (fresh) { ctx.shadowColor = C.blockHi; ctx.shadowBlur = 10; } else { ctx.shadowBlur = 0; }
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(b.x - s / 2, b.y - s / 2, s, s, 2.5);
        else ctx.rect(b.x - s / 2, b.y - s / 2, s, s);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (s > 11) {
          ctx.fillStyle = C.text;
          ctx.fillText(b.hash, b.x + s / 2 + 3, b.y + 2.5);
        }
        b.x -= SPEED;
      }
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].x < -60) blocks.splice(i, 1);
      }
      if (!reduced && (blocks.length === 0 || blocks[blocks.length - 1].x < w - 70)) {
        blocks.push(newBlock(w + 30));
      }
    };

    const onVis = () => {
      running = !document.hidden;
      if (running) { last = 0; raf = requestAnimationFrame(frame); }
      else cancelAnimationFrame(raf);
    };

    resize(); seed();
    raf = requestAnimationFrame(frame);
    if (reduced) frame(100); // single static render
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [theme]); // full restart on every theme switch

  const isDark = theme === 'dark';
  return (
    <div className={`dag-background fixed inset-0 z-[-10] pointer-events-none ${isDark ? 'bg-[#05050A]' : 'bg-[#f8fafc]'}`}>
      <canvas ref={canvasRef} className="absolute inset-0" />
      {isDark
        ? <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,transparent_0%,rgba(0,0,0,0.55)_85%)]" />
        : <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,transparent_0%,rgba(248,250,252,0.7)_85%)]" />}
    </div>
  );
};

export default DagBackground;
