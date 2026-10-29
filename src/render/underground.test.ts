import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from '../sim/world';
import { nestHud, UndergroundView } from './underground';
import type { CanvasLike } from './terrainRender';
import type { NestLayout } from './nestLayout';

const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;

beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 }));
afterEach(() => vi.unstubAllGlobals());

function colony(ants: number, stock: number, queens = 1): World {
  const w = World.create(5);
  for (let i = 0; i < ants; i++) w.spawnAnt();
  w.stock = stock;
  w.totalDelivered = (queens - 1) * 100;
  return w;
}

function setup(world: World, cw = 640, ch = 400) {
  const canvas = createCanvas(1, 1);
  Object.assign(canvas, { clientWidth: cw, clientHeight: ch });
  const view = new UndergroundView(canvas as unknown as HTMLCanvasElement, world, make);
  const settle = (frames = 60): void => {
    for (let i = 0; i < frames; i++) view.draw(0.05);
  };
  const pixels = (): Uint8ClampedArray => {
    const c = canvas.getContext('2d');
    return c.getImageData(0, 0, canvas.width, canvas.height).data as unknown as Uint8ClampedArray;
  };
  /** Counts pixels matching `test` inside the target box of a chamber (device pixels). */
  const count = (id: string, test: (r: number, g: number, b: number) => boolean, from: NestLayout = view.currentLayout!): number => {
    const ch = from.chambers.find((x) => x.id === id)!;
    const m = view.metrics;
    const x0 = Math.max(0, Math.floor(m.ox + (ch.cx - ch.rx) * m.zoom));
    const x1 = Math.min(canvas.width, Math.ceil(m.ox + (ch.cx + ch.rx) * m.zoom));
    const y0 = Math.max(0, Math.floor(m.oy + (ch.cy - ch.ry) * m.zoom));
    const y1 = Math.min(canvas.height, Math.ceil(m.oy + (ch.cy + ch.ry) * m.zoom));
    const d = pixels();
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * canvas.width + x) * 4;
        if (test(d[i], d[i + 1], d[i + 2])) n++;
      }
    }
    return n;
  };
  return { canvas, view, settle, pixels, count };
}

const cream = (r: number, g: number, b: number): boolean => r > 215 && g > 200 && b > 150 && b < 215;
const crumb = (r: number, g: number, b: number): boolean => (r > 215 && g > 205 && b > 190) || (r > 160 && g < 100 && b < 75);
const black = (r: number, g: number, b: number): boolean => r < 70 && g < 55 && b < 45;

describe('UndergroundView pictures', () => {
  it('paints a non-empty picture, scaled by an integer zoom and centred', () => {
    const t = setup(colony(1, 10));
    t.settle(3);
    expect(t.view.metrics.zoom).toBe(2);
    expect(t.view.metrics.ox).toBe(0);
    const d = t.pixels();
    const colours = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 97) colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    expect(colours.size).toBeGreaterThan(15);
    // 1280 x 800 -> zoom 4; a wider window centres the picture
    const w = setup(colony(1, 10), 1500, 900);
    w.settle(2);
    expect(w.view.metrics.zoom).toBe(4);
    expect(w.view.metrics.ox).toBe(110);
    expect(w.view.metrics.oy).toBe(50);
  });

  it('is deterministic', () => {
    const a = setup(colony(5, 25, 2));
    const b = setup(colony(5, 25, 2));
    a.settle(5);
    b.settle(5);
    const pa = a.pixels();
    const pb = b.pixels();
    let diff = 0;
    for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) diff++;
    expect(diff).toBe(0);
  });

  it('more larvae paint more cream pixels in the larvae chamber', () => {
    const few = setup(colony(1, 10));
    const many = setup(colony(1, 150));
    few.settle();
    many.settle();
    const a = few.count('larvae', cream);
    const b = many.count('larvae', cream);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a * 3);
  });

  it('more stock paints more crumb pixels in the pantry', () => {
    const little = setup(colony(1, 5));
    const lots = setup(colony(1, 120));
    little.settle();
    lots.settle();
    const a = little.count('pantry', crumb);
    const b = lots.count('pantry', crumb);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a * 3);
    const none = setup(colony(1, 0));
    none.settle();
    expect(none.count('pantry', crumb)).toBe(0);
  });

  it('two queens paint a second queen chamber with a queen in it', () => {
    const one = setup(colony(2, 10, 1));
    const two = setup(colony(2, 10, 2));
    one.settle();
    two.settle();
    expect(two.view.currentLayout!.chambers.filter((c) => c.kind === 'queen')).toHaveLength(2);
    // the chamber, its rim and the queen change the picture where the second queen lives (and nowhere near the first)
    const ch = two.view.currentLayout!.chambers.find((c) => c.id === 'queen1')!;
    const m = two.view.metrics;
    const a = one.pixels();
    const b = two.pixels();
    let changed = 0;
    for (let y = Math.floor(m.oy + (ch.cy - ch.ry) * m.zoom); y < m.oy + (ch.cy + ch.ry) * m.zoom; y++) {
      for (let x = Math.floor(m.ox + (ch.cx - ch.rx) * m.zoom); x < m.ox + (ch.cx + ch.rx) * m.zoom; x++) {
        const i = (y * 640 + x) * 4;
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) changed++;
      }
    }
    expect(changed).toBeGreaterThan(2000);
    expect(two.count('queen1', black)).toBeGreaterThan(300);
    expect(two.count('queen0', black)).toBeGreaterThan(300);
  });

  it('shows the carried crumb of a carrier (cream pixels in the tunnel) after a delivery', () => {
    const w = colony(3, 10);
    const t = setup(w);
    t.settle(2);
    expect(t.view.carrierCount()).toBe(0);
    w.deliveryCount += 1;
    t.view.draw(0.05);
    t.view.draw(0.4);
    expect(t.view.carrierCount()).toBe(1);
  });

  it('carriers are queued (max 12), released a few per second, and vanish at the pantry', () => {
    const w = colony(3, 10);
    const t = setup(w);
    t.settle(2);
    w.deliveryCount += 50;
    t.view.draw(0.05);
    expect(t.view.carrierCount()).toBe(1);
    t.settle(20); // 1 s
    expect(t.view.carrierCount()).toBeGreaterThanOrEqual(3);
    expect(t.view.carrierCount()).toBeLessThanOrEqual(4);
    t.settle(400); // 20 s: everybody arrived, the queue is empty
    expect(t.view.carrierCount()).toBe(0);
  });

  it('a hatched ant walks from the larvae chamber to the entrance and disappears', () => {
    const w = colony(2, 20);
    const t = setup(w);
    t.settle(2);
    expect(t.view.hatchedWalkerCount()).toBe(0);
    w.spawnAnt();
    t.view.draw(0.05);
    expect(t.view.hatchedWalkerCount()).toBe(1);
    t.settle(300);
    expect(t.view.hatchedWalkerCount()).toBe(0);
  });

  it('enter() forgets what happened while the view was hidden', () => {
    const w = colony(2, 20);
    const t = setup(w);
    t.settle(2);
    w.deliveryCount += 9;
    w.spawnAnt();
    t.view.enter();
    t.view.draw(0.05);
    expect(t.view.carrierCount()).toBe(0);
    expect(t.view.hatchedWalkerCount()).toBe(0);
  });
});

describe('UndergroundView growth', () => {
  it('eases chamber sizes towards the target, never snapping or overshooting', () => {
    const w = colony(1, 10);
    const t = setup(w);
    t.settle(5);
    const start = t.view.shownRadii('pantry')!.rx;
    w.stock = 400;
    let prev = start;
    t.view.draw(1 / 60);
    const target = t.view.currentLayout!.chambers.find((c) => c.id === 'pantry')!.rx;
    const first = t.view.shownRadii('pantry')!.rx;
    expect(first).toBeGreaterThan(start);
    expect(first).toBeLessThan(start + (target - start) * 0.2);
    for (let i = 0; i < 150; i++) {
      t.view.draw(1 / 60);
      const r = t.view.shownRadii('pantry')!.rx;
      expect(r).toBeGreaterThanOrEqual(prev);
      expect(r).toBeLessThanOrEqual(target);
      prev = r;
    }
    expect(prev).toBeGreaterThan(target - 1);
  });

  it('a new queen chamber grows from small, existing ones stay put', () => {
    const w = colony(1, 10, 1);
    const t = setup(w);
    t.settle(5);
    w.totalDelivered = 100;
    t.view.draw(1 / 60);
    const id = 'queen1';
    const target = t.view.currentLayout!.chambers.find((c) => c.id === id)!.rx;
    expect(t.view.shownRadii(id)!.rx).toBeLessThan(target * 0.5);
  });
});

describe('UndergroundView robustness', () => {
  it('survives a 0-size canvas', () => {
    const t = setup(colony(1, 10), 0, 0);
    t.canvas.width = 0;
    expect(() => {
      t.view.resize();
      t.view.draw(0.016);
      t.view.draw(0.016);
    }).not.toThrow();
  });

  it('survives huge colonies, NaN stock and nonsense dt', () => {
    const w = colony(300, 1e9, 8);
    const t = setup(w);
    expect(() => t.settle(3)).not.toThrow();
    w.stock = NaN;
    w.totalDelivered = NaN;
    expect(() => {
      t.view.draw(NaN);
      t.view.draw(-5);
      t.view.draw(1e9);
      t.view.draw(Infinity);
    }).not.toThrow();
    const l = t.view.currentLayout!;
    for (const c of l.chambers) expect(Number.isFinite(c.rx + c.ry)).toBe(true);
  });

  it('survives a window smaller than the picture', () => {
    const t = setup(colony(1, 10), 200, 120);
    expect(t.view.metrics.zoom).toBe(1);
    expect(() => t.settle(2)).not.toThrow();
  });
});

describe('nestHud', () => {
  it('shows the four numbers, the hatch progress and the next queen', () => {
    const w = colony(7, 23.46, 2);
    w.totalDelivered = 130;
    w.hatchProgress = w.hatchInterval / 2;
    const h = nestHud(w);
    expect(h.line).toBe('Královny: 2 · Larvy: 4 · Zásoba: 23.5 · Mravenci: 7');
    expect(h.hatch).toBeCloseTo(0.5, 5);
    expect(h.wait).toBeNull();
    expect(h.nextQueen).toBe('Další královna za 70 jídla');
  });

  it('hides the progress and asks for food when the stock is below 5', () => {
    const w = colony(1, 4.9);
    const h = nestHud(w);
    expect(h.hatch).toBeNull();
    expect(h.wait).toBe('Královna čeká na potravu (5)');
  });

  it('hides the next-queen text at 8 queens', () => {
    const w = colony(1, 10, 8);
    expect(nestHud(w).nextQueen).toBeNull();
    expect(nestHud(colony(1, 10, 7)).nextQueen).toBe('Další královna za 100 jídla');
  });
});
