import { RESEARCH_NODES, type ResearchArm, type ResearchNode } from '../sim/constants';
import type { World } from '../sim/world';

/** Direction of each arm (rad): up, right, down, left. */
const ARM_ANGLE: Record<ResearchArm, number> = {
  gather: -Math.PI / 2,
  haul: -Math.PI / 2 + (Math.PI * 2) / 5,
  war: -Math.PI / 2 + (Math.PI * 4) / 5,
  nest: -Math.PI / 2 + (Math.PI * 6) / 5,
  chem: -Math.PI / 2 + (Math.PI * 8) / 5,
};
const ARM_COLOR: Record<ResearchArm, string> = { gather: '#e0a030', haul: '#5aa0e0', war: '#d05a4a', nest: '#6cc070', chem: '#b6e03a' };
const ARM_NAME: Record<ResearchArm, string> = { gather: 'Sběr', haul: 'Nosnost', war: 'Boj', nest: 'Hnízdo', chem: 'Chemie' };
/** Distance of the three chain nodes and of the two branches from the nest (layout units), and the branches' spread (rad). */
const RING = [92, 170, 248] as const;
const BRANCH_R = 330;
const BRANCH_SPREAD = 0.26;
/** Half the layout is this many units: everything lies within it. */
export const TREE_RADIUS = 380;
const NODE_R = 27;

export interface Placed {
  node: ResearchNode;
  x: number;
  y: number;
}

/** Positions of all nodes around the nest at (0, 0): every arm is a straight chain of three that forks into two branches. */
export function researchLayout(): Placed[] {
  return RESEARCH_NODES.map((node) => {
    const a = ARM_ANGLE[node.arm];
    if (node.pos < 3) return { node, x: Math.cos(a) * RING[node.pos], y: Math.sin(a) * RING[node.pos] };
    const b = a + (node.pos === 3 ? -BRANCH_SPREAD : BRANCH_SPREAD);
    return { node, x: Math.cos(b) * BRANCH_R, y: Math.sin(b) * BRANCH_R };
  });
}

type State = 'bought' | 'ready' | 'poor' | 'locked';

function stateOf(world: World, n: ResearchNode): State {
  if (world.has(n.id)) return 'bought';
  if (n.req !== null && !world.has(n.req)) return 'locked';
  return world.xp + 1e-9 >= n.cost ? 'ready' : 'poor';
}

/**
 * Full-screen research tree: the nest in the middle, four arms of round nodes with lines between them (like a tech tree, only
 * wound round the nest). Click a node that is within reach to buy it; hover for what it does. Closes with the button or Escape.
 * Returns a function that closes it.
 */
export function openResearchTree(root: HTMLElement, world: World): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'research-tree';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Strom výzkumu');
  const head = document.createElement('div');
  head.className = 'research-head';
  const title = document.createElement('span');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Zavřít';
  head.append(title, close);
  const canvas = document.createElement('canvas');
  canvas.className = 'research-canvas';
  overlay.append(head, canvas);
  root.appendChild(overlay);

  const ctx = canvas.getContext('2d');
  const placed = researchLayout();
  let w = 1;
  let h = 1;
  let scale = 1;
  let hover: Placed | null = null;
  let mouse = { x: 0, y: 0 };
  let flash: { id: string; until: number } | null = null;

  const resize = (): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, canvas.clientWidth || window.innerWidth || 1);
    h = Math.max(1, canvas.clientHeight || window.innerHeight || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(w, h) / (2 * (TREE_RADIUS + 50));
  };
  const sx = (x: number): number => w / 2 + x * scale;
  const sy = (y: number): number => h / 2 + y * scale;

  const draw = (): void => {
    title.textContent = `Výzkum · Zkušenost: ${world.xp.toFixed(1)}`;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    // faint rings round the nest
    ctx.lineWidth = 1;
    for (const r of [...RING, BRANCH_R]) {
      ctx.strokeStyle = 'rgba(160,190,230,.10)';
      ctx.beginPath();
      ctx.arc(sx(0), sy(0), r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    const byId = new Map(placed.map((p) => [p.node.id, p]));
    // lines: from the node it hangs from (the nest for the first node of an arm)
    for (const p of placed) {
      const from = p.node.req === null ? { x: 0, y: 0 } : byId.get(p.node.req)!;
      const lit = world.has(p.node.id);
      ctx.strokeStyle = lit ? '#f1f1e6' : 'rgba(160,185,220,.35)';
      ctx.lineWidth = (lit ? 3 : 2) * Math.max(0.7, scale);
      ctx.beginPath();
      ctx.moveTo(sx(from.x), sy(from.y));
      ctx.lineTo(sx(p.x), sy(p.y));
      ctx.stroke();
    }
    // the nest
    ctx.fillStyle = '#2b1f14';
    ctx.strokeStyle = '#c9a97a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx(0), sy(0), 40 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#efe3c8';
    ctx.font = `${Math.round(14 * Math.max(0.8, scale))}px "Pixelify Sans", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HNÍZDO', sx(0), sy(0));
    // arm names, outside the branches
    ctx.font = `${Math.round(15 * Math.max(0.8, scale))}px "Pixelify Sans", monospace`;
    for (const a of Object.keys(ARM_ANGLE) as ResearchArm[]) {
      const r = (BRANCH_R + 48) * scale;
      ctx.fillStyle = ARM_COLOR[a];
      ctx.fillText(ARM_NAME[a].toUpperCase(), sx(0) + Math.cos(ARM_ANGLE[a]) * r, sy(0) + Math.sin(ARM_ANGLE[a]) * r);
    }
    // nodes
    const nr = NODE_R * scale;
    for (const p of placed) {
      const st = stateOf(world, p.node);
      const col = ARM_COLOR[p.node.arm];
      const x = sx(p.x);
      const y = sy(p.y);
      ctx.beginPath();
      ctx.arc(x, y, nr, 0, Math.PI * 2);
      ctx.fillStyle = st === 'bought' ? col : st === 'locked' ? '#1a2230' : '#16202e';
      ctx.fill();
      ctx.lineWidth = st === 'ready' ? 4 : 2.5;
      ctx.strokeStyle = st === 'locked' ? 'rgba(130,150,180,.35)' : col;
      if (st === 'poor') ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (flash && flash.id === p.node.id && performance.now() < flash.until) {
        ctx.strokeStyle = '#ff6a5a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y, nr + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.font = `${Math.round(15 * Math.max(0.8, scale))}px "Pixelify Sans", monospace`;
      ctx.fillStyle = st === 'bought' ? '#10161f' : st === 'locked' ? 'rgba(140,160,190,.5)' : '#f1f1e6';
      ctx.fillText(st === 'bought' ? '✓' : String(p.node.cost), x, y);
      ctx.font = `${Math.round(13 * Math.max(0.8, scale))}px "Pixelify Sans", monospace`;
      const ly = y + nr + 13 * Math.max(0.8, scale);
      const lw = ctx.measureText(p.node.name).width + 8;
      ctx.fillStyle = 'rgba(8,12,18,.8)'; // a dark plate so lines and rings never cut through the name
      ctx.fillRect(x - lw / 2, ly - 9 * Math.max(0.8, scale), lw, 18 * Math.max(0.8, scale));
      ctx.fillStyle = st === 'locked' ? 'rgba(150,170,200,.65)' : '#dfe6f2';
      ctx.fillText(p.node.name, x, ly);
    }
    // tooltip
    if (hover) {
      const n = hover.node;
      const st = stateOf(world, n);
      const lines = [n.name, n.desc, st === 'bought' ? 'Hotovo' : st === 'locked' ? 'Nejdřív předchozí uzel' : `Cena: ${n.cost} zkušenosti`];
      ctx.font = `${Math.round(14 * Math.max(0.85, scale))}px "Pixelify Sans", monospace`;
      const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
      const lh = 20 * Math.max(0.85, scale);
      const th = lines.length * lh + 12;
      let tx = mouse.x + 18;
      let ty = mouse.y + 18;
      if (tx + tw > w - 6) tx = mouse.x - tw - 18;
      if (ty + th > h - 6) ty = mouse.y - th - 18;
      ctx.fillStyle = 'rgba(12,16,24,.94)';
      ctx.strokeStyle = ARM_COLOR[n.arm];
      ctx.lineWidth = 2;
      ctx.fillRect(tx, ty, tw, th);
      ctx.strokeRect(tx, ty, tw, th);
      ctx.textAlign = 'left';
      lines.forEach((l, i) => {
        ctx.fillStyle = i === 0 ? ARM_COLOR[n.arm] : '#e6ecf5';
        ctx.fillText(l, tx + 10, ty + 6 + lh * (i + 0.5));
      });
      ctx.textAlign = 'center';
    }
  };

  const nodeAt = (px: number, py: number): Placed | null => {
    const nr = NODE_R * scale + 4;
    for (const p of placed) if (Math.hypot(sx(p.x) - px, sy(p.y) - py) <= nr) return p;
    return null;
  };
  const local = (e: PointerEvent | MouseEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointermove', (e) => {
    mouse = local(e);
    hover = nodeAt(mouse.x, mouse.y);
    draw();
  });
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    draw();
  });
  canvas.addEventListener('click', (e) => {
    const p = nodeAt(local(e).x, local(e).y);
    if (!p) return;
    if (!world.buyResearch(p.node.id)) flash = { id: p.node.id, until: performance.now() + 350 };
    draw();
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeIt();
    }
  };
  const onResize = (): void => {
    resize();
    draw();
  };
  const timer = setInterval(draw, 200);
  function closeIt(): void {
    clearInterval(timer);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    overlay.remove();
  }
  close.addEventListener('click', closeIt);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  resize();
  draw();
  return closeIt;
}
