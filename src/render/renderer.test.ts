import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Surface } from '../sim/terrain';
import { World } from '../sim/world';
import { Camera } from '../ui/camera';
import { Renderer } from './renderer';
import type { CanvasLike } from './terrainRender';

const make = (w: number, h: number): CanvasLike => createCanvas(w, h) as unknown as CanvasLike;

function setup() {
  const canvas = createCanvas(1, 1);
  Object.assign(canvas, { clientWidth: 640, clientHeight: 400 });
  const world = World.create(7);
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
