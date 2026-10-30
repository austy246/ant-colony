import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STEP_S } from '../sim/constants';
import { Surface } from '../sim/terrain';
import { World } from '../sim/world';
import { Camera } from '../ui/camera';
import { Renderer } from './renderer';
import { renderTerrain, type CanvasLike } from './terrainRender';

const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;

function setup(mode: 'sandbox' | 'normal' = 'sandbox') {
  const canvas = createCanvas(1, 1);
  Object.assign(canvas, { clientWidth: 640, clientHeight: 400 });
  const world = World.create(7, mode);
  const camera = new Camera(640, 400);
  camera.fitWorld(); // zoom 2, world centred: screen = (world - (160,100)) * 2 + (320,200)
  const r = new Renderer(canvas as unknown as HTMLCanvasElement, world, camera, make);
  const px = (wx: number, wy: number): [number, number, number] => {
    const s = camera.worldToScreen(wx, wy);
    const d = canvas.getContext('2d').getImageData(Math.floor(s.x), Math.floor(s.y), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  return { world, r, px, canvas, camera };
}

beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 }));
afterEach(() => vi.unstubAllGlobals());

describe('Renderer views', () => {
  it('pheromone view: deposited cell is bright blue, neighbour stays dark', () => {
    const { world, r, px } = setup();
    world.pher.deposit(200.5, 40.5, 5);
    r.setView('pheromone');
    r.draw();
    const hit = px(200.25, 40.25);
    const near = px(202.25, 40.25);
    expect(hit[2]).toBeGreaterThan(hit[0] + 40);
    expect(hit[0] + hit[1] + hit[2]).toBeGreaterThan(near[0] + near[1] + near[2] + 100);
    expect(Math.max(...near)).toBeLessThan(60);
  });

  it('pheromone view at fractional zoom: the lit cell is crisp and its neighbours stay dark', () => {
    const { world, r, canvas, camera } = setup();
    camera.zoom = 2.5;
    camera.x = 200;
    camera.y = 40;
    world.pher.deposit(200.5, 40.5, 5);
    r.setView('pheromone');
    r.draw();
    // The cell (200,40) spans screen x 320..322.5, y 200..202.5.
    const at = (sx: number, sy: number): number[] =>
      Array.from(canvas.getContext('2d').getImageData(sx, sy, 1, 1).data.slice(0, 3));
    const lit = at(320, 200);
    const bg = at(330, 200);
    expect(lit[2]).toBeGreaterThan(lit[0] + 40);
    expect(Math.max(...bg)).toBeLessThan(60);
    // No anti-aliased half-lit pixels: every pixel right of / below the cell is either fully lit or dark. The dark
    // side is the darkened fine-grid terrain, which is textured pixel by pixel, so it is "dark", not one flat colour.
    const dist = (a: number[], b: number[]): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const isDark = (p: number[]): boolean => Math.max(...p) < 60;
    for (const [sx, sy] of [[322, 200], [323, 200], [321, 202], [321, 203], [319, 200], [320, 199]]) {
      const p = at(sx, sy);
      expect(dist(p, lit) < 12 || isDark(p), `${sx},${sy}: ${p}`).toBe(true);
    }
    expect(isDark(at(323, 200))).toBe(true);
    expect(isDark(at(321, 203))).toBe(true);
  });

  it('terrain view: a stone cell is reddish', () => {
    const { world, r, px } = setup();
    const t = world.terrain;
    let i = t.surface.findIndex((s, k) => s === Surface.Stone && k % t.w > 60);
    expect(i).toBeGreaterThanOrEqual(0);
    r.setView('terrain');
    r.draw();
    const [red, green, blue] = px((i % t.w) + 0.25, Math.floor(i / t.w) + 0.25);
    expect(red).toBeGreaterThan(green + 50);
    expect(red).toBeGreaterThan(blue + 50);
  });

  it('normal view is unaffected by deposits', () => {
    const { world, r, px } = setup();
    r.draw();
    const before = px(200.25, 40.25);
    world.pher.deposit(200.5, 40.5, 5);
    r.draw();
    expect(px(200.25, 40.25)).toEqual(before);
  });
});

describe('Renderer queen', () => {
  const Q = { x: 100, y: 100, digProgress: 0 };

  it('visible queen paints dark body pixels; invisible paints nothing extra', () => {
    const { r, px } = setup();
    r.draw();
    const before = px(Q.x, Q.y);
    r.setQueen({ visible: false, ...Q });
    r.draw();
    expect(px(Q.x, Q.y)).toEqual(before);
    r.setQueen(null);
    r.draw();
    expect(px(Q.x, Q.y)).toEqual(before);
    r.setQueen({ visible: true, ...Q });
    r.draw();
    const after = px(Q.x, Q.y);
    expect(after).not.toEqual(before);
    expect(Math.max(...after)).toBeLessThan(70);
    expect(after[0] - after[2]).toBeLessThan(30);
  });

  it('digging grows a dark hole around the queen', () => {
    const { r, px } = setup();
    r.setQueen({ visible: true, x: 100, y: 100, digProgress: 0 });
    r.draw();
    const small = px(100 + 7, 100 + 3);
    r.setQueen({ visible: true, x: 100, y: 100, digProgress: 0.9 });
    r.draw();
    const big = px(100 + 7, 100 + 3);
    expect(Math.max(...big)).toBeLessThan(40);
    expect(big[0] + big[1] + big[2]).toBeLessThan(small[0] + small[1] + small[2]);
  });
});

describe('Renderer fine-grid terrain', () => {
  function fineSetup(zoom: number, camX: number, camY: number) {
    const made: CanvasLike[] = [];
    const rec = (w: number, h: number): CanvasLike => {
      const c = make(w, h);
      made.push(c);
      return c;
    };
    const canvas = createCanvas(1, 1);
    Object.assign(canvas, { clientWidth: 640, clientHeight: 400 });
    const world = World.create(7);
    const camera = new Camera(640, 400);
    camera.zoom = zoom;
    camera.x = camX;
    camera.y = camY;
    const r = new Renderer(canvas as unknown as HTMLCanvasElement, world, camera, rec);
    const screen = (sx: number, sy: number): number[] =>
      Array.from(canvas.getContext('2d').getImageData(sx, sy, 1, 1).data.slice(0, 3));
    return { world, r, made, screen, camera };
  }
  const terrainPx = (c: CanvasLike, fx: number, fy: number): number[] =>
    Array.from(c.getContext('2d')!.getImageData(fx, fy, 1, 1).data.slice(0, 3));

  it('draws the 640x400 terrain canvas into world space: at zoom 2 every screen pixel is one fine pixel', () => {
    const { r, made, screen } = fineSetup(2, 160, 100);
    r.draw();
    const t = made.find((c) => c.width === 640 && c.height === 400);
    expect(t, 'terrain canvas of 640x400 was created through the injected factory').toBeDefined();
    // inside the vignette's clear radius the output is the terrain, pixel for pixel
    for (const [sx, sy] of [[320, 200], [300, 190], [341, 217], [250, 160], [400, 240]]) {
      expect(screen(sx, sy), `${sx},${sy}`).toEqual(terrainPx(t!, sx, sy));
    }
  });

  it('at zoom 4 one fine terrain pixel is a crisp 2x2 block of screen pixels', () => {
    const { r, made, screen } = fineSetup(4, 100, 100);
    r.draw();
    const t = made.find((c) => c.width === 640 && c.height === 400)!;
    // screen (320,200) = world (100,100) = fine (200,200); screen = 320 + (fine/2 - 100) * 4
    const probes: [number, number][] = [[200, 200], [203, 198], [190, 207], [211, 193], [196, 204]];
    for (const [fx, fy] of probes) {
      const sx = 320 + (fx / 2 - 100) * 4;
      const sy = 200 + (fy / 2 - 100) * 4;
      const want = terrainPx(t, fx, fy);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        expect(screen(sx + dx, sy + dy), `fine ${fx},${fy} +${dx},${dy}`).toEqual(want);
      }
    }
  });
});

describe('Renderer draw order', () => {
  const food = (kind: 'berry', x: number, y: number) => ({ id: 99, kind, x, y, piecesLeft: 1 });

  it('food is drawn above the terrain, the queen above food, ants above both', () => {
    const { world, r, px } = setup();
    world.food.push(food('berry', 150, 100));
    r.draw();
    const onBerry = px(150.5, 100.5);
    expect(onBerry[0]).toBeGreaterThan(onBerry[1] + 60); // red berry, not ground
    r.setQueen({ visible: true, x: 150, y: 100, digProgress: 0 });
    r.draw();
    const withQueen = px(150.5, 100.5);
    expect(Math.max(...withQueen)).toBeLessThan(80); // black queen body hides the berry
    r.setQueen(null);
    const a = world.spawnAnt();
    a.x = 150;
    a.y = 100;
    a.heading = 0;
    r.draw();
    // somewhere inside the ant footprint a black ant pixel hides the berry
    let black = 0;
    for (let dx = -3; dx <= 3; dx += 0.5) {
      const p = px(150 + dx + 0.25, 100.25);
      if (Math.max(...p) < 80) black++;
    }
    expect(black).toBeGreaterThan(2);
  });

  it('pheromone and terrain overlays still line up with the terrain: darkening covers the whole world rectangle', () => {
    const { r, px } = setup();
    r.setView('pheromone');
    r.draw();
    // far corners of the world rectangle (inside the screen at fit zoom) are darkened like the middle
    for (const [wx, wy] of [[2, 2], [158, 98], [300, 190], [20, 180]]) {
      expect(Math.max(...px(wx, wy)), `${wx},${wy}`).toBeLessThan(60);
    }
    r.setView('terrain');
    r.draw();
    for (const [wx, wy] of [[2, 2], [300, 190]]) {
      expect(Math.max(...px(wx, wy)), `${wx},${wy}`).toBeLessThan(80);
    }
  });
});

describe('Renderer worker ants (rotation, walking, cache)', () => {
  function antSetup() {
    const made: CanvasLike[] = [];
    const rec = (w: number, h: number): CanvasLike => {
      const c = make(w, h);
      made.push(c);
      return c;
    };
    const canvas = createCanvas(1, 1);
    Object.assign(canvas, { clientWidth: 640, clientHeight: 400 });
    const world = World.create(7);
    const camera = new Camera(640, 400);
    camera.zoom = 4;
    camera.x = 100;
    camera.y = 100;
    const r = new Renderer(canvas as unknown as HTMLCanvasElement, world, camera, rec);
    // the screen area around world (100, 100): 40 x 40 art px at zoom 4 would be 160 px; sample the 40x40 screen px core
    const snap = (): number[] => Array.from(canvas.getContext('2d').getImageData(300, 180, 40, 40).data);
    const ant = world.spawnAnt();
    ant.x = 100;
    ant.y = 100;
    ant.heading = 0;
    return { r, world, ant, made, snap, camera };
  }

  it('an ant heading down (pi/2) is drawn differently from one heading right (0)', () => {
    const { r, ant, snap } = antSetup();
    ant.heading = 0;
    r.draw();
    const right = snap();
    ant.heading = Math.PI / 2;
    r.draw();
    const down = snap();
    expect(down).not.toEqual(right);
    ant.heading = Math.PI;
    r.draw();
    expect(snap()).not.toEqual(right);
  });

  it('a standing ant keeps its frame; a walking ant animates', () => {
    const { r, ant, snap } = antSetup();
    r.draw();
    const first = snap();
    for (let i = 0; i < 5; i++) r.draw();
    expect(snap()).toEqual(first);
    expect(ant.x).toBe(100);
    const { r: r2, ant: a2, snap: s2 } = antSetup();
    r2.draw();
    const f0 = s2();
    a2.x += 0.75; // quarter stride = next frame (then snap back to the same pixel grid)
    r2.draw();
    a2.x -= 0.75;
    r2.draw(); // moving back advances the phase again by another quarter
    expect(s2()).not.toEqual(f0);
  });

  it('prunes stride state of ants that are gone, and builds the sprite cache only once per Renderer', () => {
    const { r, world, ant, made } = antSetup();
    const extra = world.spawnAnt();
    extra.x = 120;
    extra.y = 110;
    r.draw();
    const afterFirst = made.length;
    expect((r as unknown as { strides: Map<number, unknown> }).strides.size).toBe(2);
    r.draw();
    r.draw();
    expect(made.length).toBe(afterFirst);
    world.ants.splice(world.ants.indexOf(extra), 1);
    r.draw();
    const strides = (r as unknown as { strides: Map<number, unknown> }).strides;
    expect(strides.size).toBe(1);
    expect(strides.has(ant.id)).toBe(true);
    expect(made.length).toBe(afterFirst);
  });
});

describe('Renderer follows the map size', () => {
  function growSetup() {
    const made: CanvasLike[] = [];
    const rec = (w: number, h: number): CanvasLike => {
      const c = make(w, h);
      made.push(c);
      return c;
    };
    const canvas = createCanvas(1, 1);
    Object.assign(canvas, { clientWidth: 640, clientHeight: 400 });
    const world = World.create(7);
    const camera = new Camera(640, 400);
    const r = new Renderer(canvas as unknown as HTMLCanvasElement, world, camera, rec);
    return { world, r, made, camera };
  }
  const sized = (made: CanvasLike[], w: number, h: number): CanvasLike[] =>
    made.filter((c) => (c as unknown as { width: number }).width === w && (c as unknown as { height: number }).height === h);

  it('rebuilds the terrain canvas when the map grows', () => {
    const { world, r, made } = growSetup();
    r.draw();
    expect(sized(made, 640, 400).length).toBe(1);
    world.growMapTo(1);
    r.draw();
    expect(sized(made, world.terrain.w * 2, world.terrain.h * 2).length).toBe(1);
    r.draw();
    expect(sized(made, world.terrain.w * 2, world.terrain.h * 2).length).toBe(1);
  });

  it('on growth the ground already on screen stays pixel-identical and equals a from-scratch render', () => {
    const { world, r, made } = growSetup();
    r.draw();
    const before = sized(made, 640, 400)[0];
    const px = (c: CanvasLike, w: number, h: number) => c.getContext('2d')!.getImageData(0, 0, w, h).data;
    const same = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
    expect(same(px(before, 640, 400), px(renderTerrain(world.terrain, make), 640, 400))).toBe(true);
    // mark the old canvas: the grown canvas must be built from it (copied), not repainted from scratch
    const bc = before.getContext('2d')!;
    bc.fillStyle = '#ff00ff';
    bc.fillRect(10, 10, 1, 1);
    const old = px(before, 640, 400);
    world.growMapTo(1);
    r.draw();
    const after = sized(made, world.terrain.w * 2, world.terrain.h * 2)[0];
    expect(same(px(after, 640, 400), old), 'old rectangle copied unchanged').toBe(true);
    // the new strips are what a from-scratch render of the grown terrain shows there
    const fresh = px(renderTerrain(world.terrain, make), after.width, after.height);
    const got = px(after, after.width, after.height);
    const W = after.width;
    let diff = 0;
    for (let y = 0; y < after.height; y++) {
      for (let x = 0; x < W; x++) {
        if (x < 640 && y < 400) continue;
        for (let k = 0; k < 4; k++) if (got[(y * W + x) * 4 + k] !== fresh[(y * W + x) * 4 + k]) diff++;
      }
    }
    expect(diff).toBe(0);
  });

  it('trail canvas, glow and overlay have the size of the map and are rebuilt on growth', () => {
    const { world, r, made } = growSetup();
    r.setView('pheromone');
    r.draw();
    expect(sized(made, 320, 200).length).toBe(2); // glow + trail
    world.growMapTo(1);
    world.pher.deposit(world.terrain.w - 2.5, world.terrain.h - 2.5, 5);
    r.draw();
    const { w, h } = world.terrain;
    expect(sized(made, w, h).length).toBe(2);
    r.setView('terrain');
    r.draw();
    expect(sized(made, w, h).length).toBe(3);
    world.growMapTo(2);
    r.draw();
    expect(sized(made, world.terrain.w, world.terrain.h).length).toBe(1);
  });

  it('pheromone deposited in the new area is drawn', () => {
    const canvas = createCanvas(1, 1);
    Object.assign(canvas, { clientWidth: 640, clientHeight: 400 });
    const world = World.create(7);
    const camera = new Camera(640, 400);
    const r = new Renderer(canvas as unknown as HTMLCanvasElement, world, camera, make);
    world.growMapTo(1);
    camera.setWorldSize(world.terrain.w, world.terrain.h);
    camera.zoom = 4;
    camera.x = 350;
    camera.y = 210;
    camera.clamp();
    world.pher.deposit(350.5, 210.5, 5);
    r.setView('pheromone');
    r.draw();
    const s = camera.worldToScreen(350.25, 210.25);
    const d = canvas.getContext('2d').getImageData(Math.floor(s.x), Math.floor(s.y), 1, 1).data;
    expect(d[2]).toBeGreaterThan(d[0] + 40);
  });
});

describe('Renderer spider and web', () => {
  const dark = (p: number[]) => Math.max(...p) < 40; // the spider body (#1a1410), darker than the vignetted ground (~47)

  function spiderSetup() {
    const s = setup('normal');
    s.world.step(STEP_S); // creates the spider
    return { ...s, sp: s.world.spider! };
  }
  const all = (canvas: { getContext(t: '2d'): any; width: number; height: number }) =>
    Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data as Uint8ClampedArray);

  const kill = (sp: { alive: boolean; respawnT: number }) => {
    sp.alive = false;
    sp.respawnT = 100;
  };
  const px4 = (canvas: { getContext(t: '2d'): any; width: number; height: number }) => {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data as Uint8ClampedArray;
    return (sx: number, sy: number): number[] => Array.from(d.slice((sy * canvas.width + sx) * 4, (sy * canvas.width + sx) * 4 + 3));
  };
  /** Screen pixels (not part of the spider body) that a living spider's web changes, found by diffing against a dead-spider render. */
  function webPixels() {
    const live = spiderSetup();
    live.r.draw();
    const a = all(live.canvas);
    const dead = spiderSetup();
    kill(dead.sp);
    dead.r.draw();
    const b = all(dead.canvas);
    const c = live.camera.worldToScreen(live.sp.x, live.sp.y);
    const out: { sx: number; sy: number }[] = [];
    const W = live.canvas.width;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
      const sx = (i / 4) % W;
      const sy = Math.floor(i / 4 / W);
      if (Math.hypot(sx - c.x, sy - c.y) > 22) out.push({ sx, sy }); // beyond the spider's own body (~9 screen px)
    }
    return { out, a, b };
  }

  it('draws the spider body and the web around it while it lives', () => {
    const { r, px, sp, world } = spiderSetup();
    expect(sp.alive).toBe(true);
    r.draw();
    expect(dark(px(sp.x + 0.25, sp.y + 0.25))).toBe(true);
    kill(sp);
    r.draw();
    expect(dark(px(sp.x + 0.25, sp.y + 0.25))).toBe(false);
    expect(world.spider!.alive).toBe(false);
    // the web: hundreds of screen pixels away from the body differ between the alive and the dead render
    expect(webPixels().out.length).toBeGreaterThan(300);
  });

  it('renderer draws no spider when it is dead', () => {
    const dead = spiderSetup();
    kill(dead.sp);
    dead.r.draw();
    expect(dark(dead.px(dead.sp.x + 0.25, dead.sp.y + 0.25))).toBe(false);
    // a dead spider leaves exactly the render of a world that never had one
    const none = spiderSetup();
    none.world.spider = null;
    none.r.draw();
    expect(all(none.canvas)).toEqual(all(dead.canvas));
  });

  it('a sandbox world has no spider and draws none', () => {
    const sb = setup();
    expect(sb.world.spider).toBeNull();
    sb.world.step(STEP_S);
    expect(sb.world.spider).toBeNull();
    sb.r.draw();
    // the render equals that of an identical world that has no `spider` property at all
    const twin = setup();
    twin.world.step(STEP_S);
    delete (twin.world as { spider?: unknown }).spider;
    twin.r.draw();
    expect(all(sb.canvas)).toEqual(all(twin.canvas));
  });

  it('draws nothing in the pheromone and terrain views', () => {
    for (const view of ['pheromone', 'terrain'] as const) {
      const live = spiderSetup();
      live.r.setView(view);
      live.r.draw();
      const a = all(live.canvas);
      const dead = spiderSetup();
      dead.sp.alive = false;
      dead.sp.respawnT = 100;
      dead.r.setView(view);
      dead.r.draw();
      expect(all(dead.canvas), view).toEqual(a);
    }
  });

  it('renderer draws the web before the ants', () => {
    // find a real thread pixel, then stand an ant on it: the ant's black pixels must stay black (web under the ant)
    const { out } = webPixels();
    const t = out.find((p) => p.sx > 330 && p.sx < 600) ?? out[0];
    const place = (kill_: boolean) => {
      const s = spiderSetup();
      if (kill_) kill(s.sp);
      const a = s.world.spawnAnt();
      const w = { x: (t.sx - 320) / 2 + 160, y: (t.sy - 200) / 2 + 100 };
      a.x = w.x;
      a.y = w.y;
      a.heading = 0;
      a.state = 'wander';
      s.r.draw();
      return px4(s.canvas);
    };
    const withWeb = place(false);
    const noWeb = place(true);
    let overlap = 0;
    const live = spiderSetup();
    live.r.draw();
    const webOnly = px4(live.canvas);
    const deadOnly = (() => {
      const d = spiderSetup();
      kill(d.sp);
      d.r.draw();
      return px4(d.canvas);
    })();
    for (let dy = -14; dy <= 14; dy++) {
      for (let dx = -16; dx <= 16; dx++) {
        const x = t.sx + dx;
        const y = t.sy + dy;
        const ant = noWeb(x, y);
        const isWeb = webOnly(x, y).join() !== deadOnly(x, y).join();
        if (Math.max(...ant) <= 20 && isWeb) {
          overlap++; // an ant-black pixel where a web thread lies
          expect(withWeb(x, y), `${x},${y}`).toEqual(ant);
        }
      }
    }
    expect(overlap).toBeGreaterThan(0);
  });
});
