import { useEffect, useRef } from 'react';

const N = 80, W = 80, H = 28;
const BG = '#0A0A0D';

class Block {
  constructor(cw, ch) {
    this.cw = cw; this.ch = ch;
    this.reset(true);
  }
  reset(init) {
    this.x = Math.random() * this.cw;
    this.y = init ? Math.random() * this.ch : -H - Math.random() * 200;
    this.vx = (Math.random() - 0.5) * 1.2;
    this.vy = 0.8 + Math.random() * 1.2;
    this.hex = Array.from({length:8},()=>'0123456789ABCDEF'[Math.random()*16|0]).join('');
    this.layer = Math.random() * 5 | 0;
  }
  update() {
    this.x += this.vx * 0.25; this.y += this.vy * 0.25;
    if (this.x > this.cw + W) this.x = -W;
    if (this.x < -W) this.x = this.cw + W;
    if (this.y > this.ch + H + 50) this.reset();
  }
  draw(ctx) {
    const {x,y,hex} = this;
    ctx.fillStyle = '#4b7294';
    ctx.beginPath(); ctx.roundRect(x-W/2, y-H/2, W, H, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(hex, x, y);
  }
}

export default function DagBackground() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d');
    let blocks = [], id;
    const resize = () => { c.width = innerWidth; c.height = innerHeight; };
    resize(); addEventListener('resize', resize);
    blocks = Array.from({length:N}, ()=>new Block(c.width,c.height));

    (function anim() {
      ctx.fillStyle = BG; ctx.fillRect(0,0,c.width,c.height);
      const s = [...blocks].sort((a,b)=>a.y-b.y);

      for (let i=0;i<s.length;i++)
        for (let j=i+1;j<s.length;j++) {
          const a=s[i],b=s[j],dy=b.y-a.y;
          if (dy>120) break;
          const d=Math.hypot(b.x-a.x,dy);
          if (d<160) {
            ctx.strokeStyle=`rgba(255,255,255,${(0.1*(1-d/160)).toFixed(2)})`;
            ctx.lineWidth=0.5; ctx.beginPath();
            ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
          }
        }

      const chain = s.filter(n=>n.layer===2);
      ctx.strokeStyle='rgba(73,234,203,0.25)'; ctx.lineWidth=8;
      for (let i=0;i<chain.length-1;i++) {
        ctx.beginPath(); ctx.moveTo(chain[i].x,chain[i].y);
        ctx.lineTo(chain[i+1].x,chain[i+1].y); ctx.stroke();
      }
      ctx.strokeStyle='#49EACB'; ctx.lineWidth=2.5;
      for (let i=0;i<chain.length-1;i++) {
        ctx.beginPath(); ctx.moveTo(chain[i].x,chain[i].y);
        ctx.lineTo(chain[i+1].x,chain[i+1].y); ctx.stroke();
      }

      for (const b of s) { b.draw(ctx); b.update(); }

      ctx.strokeStyle='#49EACB'; ctx.lineWidth=2;
      for (const n of chain) {
        ctx.beginPath();
        ctx.roundRect(n.x-W/2,n.y-H/2,W,H,4); ctx.stroke();
      }
      id=requestAnimationFrame(anim);
    })();

    return () => { cancelAnimationFrame(id); removeEventListener('resize',resize); };
  }, []);
  return <canvas ref={ref} className="fixed inset-0 -z-10" style={{background:BG}} />;
}
