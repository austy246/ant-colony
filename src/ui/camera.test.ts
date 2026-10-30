import { describe, it, expect } from 'vitest';
import { Camera, MAX_ZOOM, easeCameraTo } from './camera';
import { WORLD_W, WORLD_H, SCALE } from '../sim/constants';

describe('Camera', () => {
  it('defaults to SCALE zoom centred on the world', () => {
    const c = new Camera(1280, 720);
    expect(c.zoom).toBe(SCALE);
    expect(c.x).toBe(WORLD_W / 2);
    expect(c.y).toBe(WORLD_H / 2);
  });

  it('screenToWorld inverts worldToScreen', () => {
    const c = new Camera(800, 600);
    c.x = 100; c.y = 80; c.zoom = 5;
    const s = c.worldToScreen(123.4, 56.7);
    const w = c.screenToWorld(s.x, s.y);
    expect(w.x).toBeCloseTo(123.4, 9);
    expect(w.y).toBeCloseTo(56.7, 9);
    const w2 = c.screenToWorld(10, 20);
    const s2 = c.worldToScreen(w2.x, w2.y);
    expect(s2.x).toBeCloseTo(10, 9);
    expect(s2.y).toBeCloseTo(20, 9);
  });

  it('zoomAt keeps the point under the cursor fixed', () => {
    const c = new Camera(800, 600);
    c.x = 160; c.y = 100; c.zoom = 4;
    const before = c.screenToWorld(300, 200);
    c.zoomAt(300, 200, 1.5);
    const after = c.screenToWorld(300, 200);
    expect(c.zoom).toBeCloseTo(6, 9);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('zoom is clamped to min and 16', () => {
    const c = new Camera(1600, 900);
    c.zoomAt(800, 450, 1000);
    expect(c.zoom).toBe(MAX_ZOOM);
    expect(MAX_ZOOM).toBe(16);
    c.zoomAt(800, 450, 1e-6);
    expect(c.zoom).toBe(c.minZoom);
    expect(c.minZoom).toBeCloseTo(Math.min(1600 / WORLD_W, 900 / WORLD_H), 9);
  });

  it('ignores invalid zoom factors', () => {
    const c = new Camera(800, 600);
    const z = c.zoom;
    for (const f of [0, -2, NaN, Infinity]) c.zoomAt(10, 10, f);
    expect(c.zoom).toBe(z);
  });

  it('minZoom never drops below 1 on small views', () => {
    const c = new Camera(100, 80);
    expect(c.minZoom).toBe(1);
  });

  it('panBy cannot move view fully off the map', () => {
    const c = new Camera(800, 600);
    c.panBy(-1e6, -1e6);
    expect(c.x).toBe(WORLD_W);
    expect(c.y).toBe(WORLD_H);
    c.panBy(1e6, 1e6);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });

  it('panBy moves content with the pointer', () => {
    const c = new Camera(800, 600);
    c.zoom = 4; c.x = 160; c.y = 100;
    c.panBy(40, -20);
    expect(c.x).toBe(150);
    expect(c.y).toBe(105);
  });

  it('centres the world when the view is larger than it', () => {
    const c = new Camera(2000, 1400); // minZoom 7: view (285x200) vs world 320x200
    c.zoom = c.minZoom;
    c.panBy(500, 500);
    expect(c.y).toBeCloseTo(WORLD_H / 2, 9); // 1400/7 == 200 -> fits exactly
    const wide = new Camera(3200, 600);
    wide.fitWorld(); // zoom 3 -> view 1066x200 wide, world fits horizontally
    wide.panBy(900, 0);
    expect(wide.x).toBeCloseTo(WORLD_W / 2, 9);
  });

  it('resize keeps zoom within new limits', () => {
    const c = new Camera(800, 600);
    c.zoom = 2.5;
    c.resize(2400, 1500);
    expect(c.minZoom).toBeCloseTo(7.5, 9);
    expect(c.zoom).toBeCloseTo(7.5, 9);
    c.zoom = 16;
    c.resize(400, 300);
    expect(c.zoom).toBe(16);
  });

  it('resize ignores invalid sizes', () => {
    const c = new Camera(800, 600);
    const min = c.minZoom;
    c.resize(0, 300);
    c.resize(NaN, NaN);
    c.resize(-5, 100);
    expect(c.minZoom).toBe(min);
  });

  it('resize re-clamps the centre', () => {
    const c = new Camera(800, 600);
    c.x = WORLD_W; c.y = WORLD_H;
    c.resize(2400, 1500);
    expect(c.x).toBeLessThanOrEqual(WORLD_W);
    expect(Number.isFinite(c.x)).toBe(true);
  });

  it('fitWorld shows the whole world', () => {
    const c = new Camera(1000, 500);
    c.zoom = 12; c.x = 5; c.y = 5;
    c.fitWorld();
    expect(c.zoom).toBeCloseTo(Math.min(1000 / WORLD_W, 500 / WORLD_H), 9);
    expect(c.x).toBe(WORLD_W / 2);
    expect(c.y).toBe(WORLD_H / 2);
    const tl = c.screenToWorld(0, 0);
    const br = c.screenToWorld(1000, 500);
    expect(tl.x).toBeLessThanOrEqual(0 + 1e-9);
    expect(tl.y).toBeLessThanOrEqual(0 + 1e-9);
    expect(br.x).toBeGreaterThanOrEqual(WORLD_W - 1e-9);
    expect(br.y).toBeGreaterThanOrEqual(WORLD_H - 1e-9);
  });
});

describe('easeCameraTo', () => {
  const from = { x: 40, y: 150, zoom: 10 };
  const to = { x: 100, y: 120, zoom: 4 };
  it('starts at from, ends at to and clamps progress', () => {
    expect(easeCameraTo(from, to, 0)).toEqual(from);
    const end = easeCameraTo(from, to, 1);
    expect(end.x).toBeCloseTo(to.x, 9);
    expect(end.y).toBeCloseTo(to.y, 9);
    expect(end.zoom).toBeCloseTo(to.zoom, 9);
    expect(easeCameraTo(from, to, -3)).toEqual(from);
    expect(easeCameraTo(from, to, 7).zoom).toBeCloseTo(4, 9);
    expect(easeCameraTo(from, to, NaN).zoom).toBeCloseTo(4, 9);
  });
  it('moves monotonically in between', () => {
    let prev = easeCameraTo(from, to, 0);
    for (let i = 1; i <= 10; i++) {
      const p = easeCameraTo(from, to, i / 10);
      expect(p.zoom).toBeLessThanOrEqual(prev.zoom + 1e-12);
      expect(p.x).toBeGreaterThanOrEqual(prev.x - 1e-12);
      prev = p;
    }
  });
});

describe('Camera map growth', () => {
  it('clamps against the size given to the constructor and to setWorldSize', () => {
    const c = new Camera(800, 600, 360, 225);
    c.zoom = 8;
    c.x = 1000;
    c.y = 1000;
    c.clamp();
    expect(c.x).toBe(360);
    expect(c.y).toBe(225);
    c.setWorldSize(400, 250);
    c.x = 1000;
    c.y = 1000;
    c.clamp();
    expect(c.x).toBe(400);
    expect(c.y).toBe(250);
  });

  it('setWorldSize keeps the view centre where it was and allows panning further', () => {
    const c = new Camera(800, 600);
    c.zoom = 8;
    c.x = 300;
    c.y = 190;
    c.clamp();
    c.setWorldSize(WORLD_W + 40, WORLD_H + 25);
    expect(c.x).toBe(300);
    expect(c.y).toBe(190);
    c.panBy(-100000, -100000);
    expect(c.x).toBe(WORLD_W + 40);
    expect(c.y).toBe(WORLD_H + 25);
  });

  it('keeps zoom within the new minZoom after setWorldSize', () => {
    const c = new Camera(1600, 1000);
    c.fitWorld();
    expect(c.zoom).toBe(5);
    c.setWorldSize(640, 400); // fit is now 2.5
    expect(c.minZoom).toBe(2.5);
    expect(c.zoom).toBeGreaterThanOrEqual(2.5);
    c.zoom = 2.5;
    c.setWorldSize(960, 600); // fit 1.67 -> floor of 1
    expect(c.minZoom).toBeCloseTo(1.6667, 3);
    c.zoomAt(800, 500, 0.01);
    expect(c.zoom).toBeCloseTo(c.minZoom, 9);
  });

  it('fitWorld fits the current world size', () => {
    const c = new Camera(1600, 1000);
    c.setWorldSize(640, 400);
    c.fitWorld();
    expect(c.zoom).toBe(2.5);
    expect(c.x).toBe(320);
    expect(c.y).toBe(200);
  });

  it('ignores an invalid world size', () => {
    const c = new Camera(800, 600);
    c.setWorldSize(NaN, 0);
    expect(c.minZoom).toBe(new Camera(800, 600).minZoom);
  });
});
