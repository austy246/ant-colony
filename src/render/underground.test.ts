import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World, type Ant } from '../sim/world';
import { nestAntPose } from './nestChoreo';
import { MAX_DRAWN_NEST_ANTS, nestHud, UndergroundView } from './underground';
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

  it('has no cosmetic carriers or walkers any more: nothing is drawn for a delivery or a new ant by itself', () => {
    const w = colony(3, 10);
    w.ants.forEach((a) => {
      a.state = 'wander'; // everybody on the surface
      delete a.nestKind;
    });
    const t = setup(w);
    t.settle(2);
    t.view.draw(0);
    const before = t.pixels();
    w.deliveryCount += 5;
    w.spawnAnt();
    w.ants[w.ants.length - 1].state = 'wander';
    t.view.draw(0);
    expect(t.view.walkerCount()).toBe(0);
    const after = t.pixels();
    let diff = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diff++;
    expect(diff).toBe(0);
  });

  it('enter() snaps the chambers again and keeps drawing the ants that are inside', () => {
    const w = nestWorld([{ kind: 'hatch', timer: 20 }, { kind: 'nurse', timer: 0 }]);
    const t = setup(w);
    t.settle(2);
    t.view.enter();
    t.view.draw(0.05);
    expect(t.view.walkerCount()).toBe(2);
  });
});

/** A world with a started colony whose ants are all underground, one per entry (ids 1, 2, ...). */
function nestWorld(specs: { kind: 'hatch' | 'unload' | 'nurse'; timer: number }[], queens = 1, stock = 30): World {
  const w = colony(0, stock, queens);
  w.ants.length = 0;
  specs.forEach((s, i) => {
    w.ants.push({
      id: i + 1,
      x: 40,
      y: 150,
      heading: 0,
      state: 'nest',
      age: 0,
      carry: 0,
      targetFood: null,
      timer: s.timer,
      nestKind: s.kind,
      role: s.kind === 'nurse' ? 'nurse' : 'forager',
    } as Ant);
  });
  w.time = 12.3;
  return w;
}

const pixelDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++;
  return n;
};

describe('UndergroundView nest ants', () => {
  it('shows the real nest ants: the picture differs from the one with no ants inside, per ant', () => {
    const none = setup(nestWorld([]));
    none.settle(4);
    const base = none.pixels();
    let prev = 0;
    for (const n of [1, 3, 6]) {
      const specs = [
        { kind: 'nurse' as const, timer: 0 },
        { kind: 'nurse' as const, timer: 0 },
        { kind: 'hatch' as const, timer: 20 },
        { kind: 'unload' as const, timer: 3 },
        { kind: 'nurse' as const, timer: 0 },
        { kind: 'hatch' as const, timer: 3 },
      ].slice(0, n);
      const t = setup(nestWorld(specs));
      t.settle(4);
      const d = pixelDiff(base, t.pixels());
      expect(d, `n ${n}`).toBeGreaterThan(prev + 20);
      prev = d;
      expect(t.view.walkerCount()).toBe(n);
    }
  });

  it('ants on the surface are not drawn underground', () => {
    const w = nestWorld([{ kind: 'nurse', timer: 0 }]);
    const t = setup(w);
    t.settle(3);
    const one = t.pixels();
    w.ants.push({ ...w.ants[0], id: 2, state: 'wander', nestKind: undefined, role: 'forager' } as Ant);
    w.ants.push({ ...w.ants[0], id: 3, state: 'carry', nestKind: undefined, role: 'forager', carry: 1 } as Ant);
    t.view.draw(0);
    expect(t.view.walkerCount()).toBe(1);
    expect(pixelDiff(one, t.pixels())).toBe(0);
  });

  it('draws at most 60 walkers (the first 60 by id) however many ants are inside', () => {
    const specs = Array.from({ length: 150 }, (_, i) => ({
      kind: (i % 3 === 0 ? 'nurse' : i % 3 === 1 ? 'hatch' : 'unload') as 'nurse' | 'hatch' | 'unload',
      timer: 3 + (i % 20),
    }));
    const w = nestWorld(specs, 8, 400);
    const t = setup(w);
    t.settle(3);
    expect(t.view.walkerCount()).toBe(MAX_DRAWN_NEST_ANTS);
    expect(MAX_DRAWN_NEST_ANTS).toBe(60);
    const sixty = t.pixels();
    // ants beyond the 60th change nothing
    w.ants.length = 60;
    t.view.draw(0);
    expect(pixelDiff(sixty, t.pixels())).toBe(0);
    // a 300 ant colony is still fast
    const many = nestWorld(Array.from({ length: 300 }, () => ({ kind: 'nurse' as const, timer: 0 })), 8, 500);
    const f = setup(many);
    f.settle(2);
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) f.view.draw(1 / 30);
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it('is deterministic and driven by the simulation time (same time, same picture; later time, other picture)', () => {
    const specs = [{ kind: 'nurse' as const, timer: 0 }, { kind: 'nurse' as const, timer: 0 }, { kind: 'hatch' as const, timer: 12 }];
    const a = setup(nestWorld(specs));
    const b = setup(nestWorld(specs));
    a.settle(5);
    b.settle(5);
    expect(pixelDiff(a.pixels(), b.pixels())).toBe(0);
    const wb = (b.view as unknown as { world: World }).world;
    wb.time += 3.3;
    b.view.draw(0);
    expect(pixelDiff(a.pixels(), b.pixels())).toBeGreaterThan(20);
  });

  it('a hatchling is drawn in the lighter callow colours, a nurse in the black worker colours', () => {
    const callowBody = (r: number, g: number, b: number): boolean => Math.abs(r - 0x4a) < 8 && Math.abs(g - 0x40) < 8 && Math.abs(b - 0x38) < 8;
    const none = setup(nestWorld([]));
    none.settle(4);
    const base = none.count('larvae', callowBody);
    const young = setup(nestWorld([{ kind: 'hatch', timer: 20 }]));
    young.settle(4);
    expect(young.count('larvae', callowBody) - base).toBeGreaterThanOrEqual(12);
    // a nurse does not paint callow pixels anywhere near that many
    const old = setup(nestWorld([{ kind: 'nurse', timer: 0 }]));
    old.settle(4);
    expect(old.count('larvae', callowBody) - base).toBeLessThan(6);
  });

  it('a nurse carrying an egg takes it from the pile of her queen: one egg fewer while the egg is on its way', () => {
    const w = nestWorld([{ kind: 'nurse', timer: 0 }]);
    const probe = setup(w);
    probe.settle(2);
    const layout = probe.view.currentLayout!;
    let tEgg = -1;
    let tNone = -1;
    for (let t = 0; t < 24 && (tEgg < 0 || tNone < 0); t += 0.1) {
      const p = nestAntPose(w.ants[0], layout, t);
      if (p.carrying === 'egg' && p.pose === 'walk' && tEgg < 0) tEgg = t;
      if (p.carrying === null && p.pose === 'walk' && tNone < 0) tNone = t;
    }
    expect(tEgg).toBeGreaterThanOrEqual(0);
    w.time = tNone;
    probe.view.draw(0);
    const full = probe.view.queenEggs(0);
    expect(full).toBeGreaterThanOrEqual(2);
    w.time = tEgg;
    probe.view.draw(0);
    expect(probe.view.queenEggs(0)).toBe(full - 1);
  });

  it('the egg piles of the queens grow with the number of queens and the hatch progress', () => {
    const count = (queens: number, frac: number): number => {
      const w = nestWorld([], queens, 30);
      w.hatchProgress = w.hatchInterval * frac;
      const t = setup(w);
      t.settle(2);
      return t.view.queenEggs(0);
    };
    expect(count(1, 0)).toBeGreaterThanOrEqual(1);
    expect(count(1, 0.95)).toBeGreaterThan(count(1, 0));
    expect(count(8, 0.5)).toBeGreaterThan(count(1, 0.5));
    expect(count(8, 0.95)).toBeLessThanOrEqual(6);
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
