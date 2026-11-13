/** Rain overlay: thin translucent blue streaks that fall fast and slanted over the view (a canvas that ignores the pointer). */
const DROPS = 160;
const SPEED = 900; // px/s, mostly downward
const WIND = 160; // px/s sideways
const LEN = 0.035; // streak length as a share of the speed vector (s)

interface Drop {
  x: number;
  y: number;
  v: number; // speed factor, so the drops are not in lockstep
}

export interface Rain {
  /** Advances and draws the rain when `on`; clears and stops drawing when it is off. */
  update(dt: number, on: boolean): void;
}

export function createRain(root: HTMLElement): Rain {
  const canvas = document.createElement('canvas');
  canvas.className = 'rain';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let drops: Drop[] = [];
  let drawn = false;

  const resize = (): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth || 1;
    h = window.innerHeight || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  return {
    update(dt, on) {
      if (!ctx) return;
      if (!on) {
        if (drawn) {
          ctx.clearRect(0, 0, w, h);
          drawn = false;
          drops = [];
        }
        return;
      }
      if (drops.length === 0) {
        for (let i = 0; i < DROPS; i++) drops.push({ x: Math.random() * (w + 200), y: Math.random() * h, v: 0.8 + Math.random() * 0.5 });
      }
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(170, 205, 255, 0.45)';
      ctx.beginPath();
      for (const d of drops) {
        const vx = -WIND * d.v;
        const vy = SPEED * d.v;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + vx * LEN, d.y + vy * LEN);
        d.x += vx * dt;
        d.y += vy * dt;
        if (d.y > h) {
          d.y = -20;
          d.x = Math.random() * (w + 200);
        }
      }
      ctx.stroke();
      drawn = true;
    },
  };
}
