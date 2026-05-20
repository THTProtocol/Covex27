import { useEffect, useRef } from 'react';

const BG = '#05050A';

class Particle {
  constructor(cw, ch) {
    this.x = Math.random() * cw;
    this.y = Math.random() * ch;
    this.r = Math.random() * 1.2 + 0.3;
    this.vx = (Math.random() - 0.5) * 0.15;
    this.vy = (Math.random() - 0.5) * 0.15;
  }
  update(cw, ch) {
    this.x += this.vx;
    this.y += this.vy;
    if (this.x < 0) this.x = cw;
    if (this.x > cw) this.x = 0;
    if (this.y < 0) this.y = ch;
    if (this.y > ch) this.y = 0;
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(73,234,203,0.30)';
    ctx.fill();
  }
}

export default function DagBackground() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    let particles = [];
    let animId;
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      particles = Array.from({ length: 200 }, () => new Particle(c.width, c.height));
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(73,234,203,${(0.04 * (1 - dist / 80)).toFixed(3)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      for (const p of particles) { p.update(c.width, c.height); p.draw(ctx); }
      const g = ctx.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.6);
      g.addColorStop(0, 'rgba(73,234,203,0.03)');
      g.addColorStop(0.6, 'rgba(73,234,203,0.01)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      animId = requestAnimationFrame(animate);
    };
    animate();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="fixed inset-0 -z-10" style={{ background: BG }} />;
}
