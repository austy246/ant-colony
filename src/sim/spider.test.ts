import { describe, expect, it } from 'vitest';
import { SPIDER_EAT_S, SPIDER_RESPAWN_S, SPIDER_WEB_R, STEP_S, WORLD_H, WORLD_W } from './constants';
import { pickSpawnSpot } from './environment';
import { inWeb, spiderCorner } from './spider';
import { World, type Ant } from './world';

/** A normal world whose spider exists (created by the first step), with prey spawning switched off. */
function spiderWorld(seed = 1): World {
  const w = World.create(seed, 'normal');
  w.spawnAnt();
  w.stock = 0;
  w.spawnTimer = 1e9;
  w.step(STEP_S);
  return w;
}

/** An ant standing at (x, y) (dx/dy relative to the spider's centre), wandering, optionally already caught. */
function antAt(w: World, dx: number, dy: number, caughtT?: number): Ant {
  const a = w.spawnAnt();
  a.x = w.spider!.x + dx;
  a.y = w.spider!.y + dy;
  if (caughtT !== undefined) a.caughtT = caughtT;
  return a;
}

/** Steps `seconds` of sim time in whole substeps. */
function run(w: World, seconds: number): void {
  const n = Math.round(seconds / STEP_S);
  for (let i = 0; i < n; i++) w.step(STEP_S);
}

describe('spiderCorner', () => {
  it('is deterministic and in the right half of the map', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (let i = 0; i < 4; i++) {
        const c = spiderCorner(seed, i);
        expect(spiderCorner(seed, i)).toEqual(c);
        expect(c.x).toBeGreaterThan(WORLD_W / 2);
        expect(c.x).toBe(WORLD_W - SPIDER_WEB_R - 4);
        expect([SPIDER_WEB_R + 4, WORLD_H - SPIDER_WEB_R - 4]).toContain(c.y);
      }
    }
  });

  it('uses both corners over many seeds', () => {
    const ys = new Set<number>();
    for (let seed = 0; seed < 50; seed++) ys.add(spiderCorner(seed, 0).y);
    expect(ys.size).toBe(2);
  });
});

describe('spider in the world', () => {
  it('sandbox world has no spider and catches nobody', () => {
    const w = World.create(1);
    w.spawnAnt();
    w.ants[0].x = WORLD_W - 26;
    w.ants[0].y = 26;
    run(w, 2);
    expect(w.spider).toBeNull();
    expect(w.ants[0].caughtT).toBeUndefined();
  });

  it('normal world creates a spider on first step, without drawing from the world rng', () => {
    const w = World.create(5, 'normal');
    w.spawnAnt();
    expect(w.spider).toBeNull();
    w.spawnTimer = 1e9;
    w.step(STEP_S);
    const c = spiderCorner(5, 0);
    expect(w.spider).toMatchObject({ x: c.x, y: c.y, alive: true, eatT: 0 });
    expect(w.spiderWebR).toBe(SPIDER_WEB_R);
  });

  it('ant entering the web is caught and stops moving', () => {
    const w = spiderWorld();
    const a = antAt(w, 5, -3);
    w.step(STEP_S);
    expect(a.caughtT).toBeDefined();
    const { x, y } = a;
    run(w, 2);
    expect(a.caughtT!).toBeGreaterThan(1.9);
    expect(a.x).toBe(x);
    expect(a.y).toBe(y);
    expect(w.caughtAnts).toBe(1);
  });

  it('ant outside the web is never caught', () => {
    const w = spiderWorld();
    const a = antAt(w, -(SPIDER_WEB_R + 6), 0);
    a.heading = Math.PI; // away from the spider
    run(w, 1);
    expect(a.caughtT).toBeUndefined();
  });

  it('a nest ant is never caught', () => {
    const w = spiderWorld();
    const a = antAt(w, 0, 0);
    a.state = 'nest';
    a.nestKind = 'unload';
    a.timer = 100;
    run(w, 1);
    expect(a.caughtT).toBeUndefined();
  });

  it('spider eats one caught ant every SPIDER_EAT_S, longest caught first', () => {
    const w = spiderWorld();
    const oldest = antAt(w, 2, 0, 9);
    oldest.state = 'carry';
    oldest.carry = 1;
    const mid = antAt(w, -2, 1, 5);
    const young = antAt(w, 0, 3, 1);
    const total = w.totalDelivered;
    const killed = w.antsKilled;
    run(w, SPIDER_EAT_S + 0.1);
    expect(w.ants.includes(oldest)).toBe(false);
    expect(w.ants.includes(mid)).toBe(true);
    expect(w.ants.includes(young)).toBe(true);
    expect(w.caughtAnts).toBe(2);
    expect(w.antsKilled).toBe(killed + 1);
    expect(w.stock).toBe(0);
    expect(w.totalDelivered).toBe(total);
    run(w, SPIDER_EAT_S);
    expect(w.ants.includes(mid)).toBe(false);
    expect(w.ants.includes(young)).toBe(true);
  });

  it('two caught majors kill the spider and free everyone', () => {
    const w = spiderWorld();
    const m1 = antAt(w, 1, 1, 2);
    const m2 = antAt(w, -1, 1, 1);
    m1.major = true;
    m2.major = true;
    const plain = antAt(w, 0, -2, 3);
    w.step(STEP_S);
    expect(w.spider!.alive).toBe(false);
    expect(w.spider!.respawnT).toBe(SPIDER_RESPAWN_S);
    for (const a of w.ants) expect(a.caughtT).toBeUndefined();
    expect(w.ants).toContain(m1);
    expect(w.ants).toContain(m2);
    expect(w.ants).toContain(plain);
    expect(w.caughtAnts).toBe(0);
    expect(inWeb(w.spider, plain.x, plain.y)).toBe(false);
  });

  it('one caught major alone is eaten like any ant', () => {
    const w = spiderWorld();
    const m = antAt(w, 1, 1, 4);
    m.major = true;
    run(w, SPIDER_EAT_S + 0.1);
    expect(w.spider!.alive).toBe(true);
    expect(w.ants.includes(m)).toBe(false);
  });

  it('second major arriving later kills the spider when both are caught', () => {
    const w = spiderWorld();
    const m1 = antAt(w, 1, 1);
    m1.major = true;
    w.step(STEP_S);
    expect(m1.caughtT).toBeDefined();
    run(w, 2);
    expect(w.spider!.alive).toBe(true);
    const m2 = antAt(w, -2, 2);
    m2.major = true;
    w.step(STEP_S);
    expect(w.spider!.alive).toBe(false);
    expect(m1.caughtT).toBeUndefined();
    expect(m2.caughtT).toBeUndefined();
    expect(w.ants).toContain(m1);
    expect(w.ants).toContain(m2);
  });

  it('spider respawns after SPIDER_RESPAWN_S with a new web', () => {
    const w = spiderWorld();
    const m1 = antAt(w, 1, 1, 2);
    const m2 = antAt(w, -1, 1, 1);
    m1.major = true;
    m2.major = true;
    w.step(STEP_S);
    expect(w.spider!.alive).toBe(false);
    const t0 = w.time;
    // Park the freed ants at the nest so the new spider does not catch them straight away.
    for (const a of w.ants) { a.x = 40; a.y = 150; a.state = 'nest'; a.nestKind = 'nurse'; }
    while (!w.spider!.alive) {
      w.step(STEP_S);
      expect(w.time - t0).toBeLessThan(SPIDER_RESPAWN_S + 1);
    }
    expect(w.time - t0).toBeGreaterThan(SPIDER_RESPAWN_S - 1);
    expect(w.spider!.eatT).toBe(0);
    const corners = [0, 1].map((i) => spiderCorner(w.seed, i));
    expect(corners.some((c) => c.x === w.spider!.x && c.y === w.spider!.y)).toBe(true);
    expect([0, 1]).toContain(w.spider!.corner);
  });

  it('prey spawner never picks a spot inside the web', () => {
    const w = spiderWorld(3);
    let inside = 0;
    for (let i = 0; i < 20000; i++) {
      const p = pickSpawnSpot(w);
      if (p) {
        inside++;
        expect(Math.hypot(p.x - w.spider!.x, p.y - w.spider!.y)).toBeGreaterThan(SPIDER_WEB_R);
      }
    }
    expect(inside).toBeGreaterThan(10000);
  });

  it('colony eaten completely becomes extinct (no crash)', () => {
    const w = spiderWorld();
    w.ants.length = 0;
    const a = antAt(w, 0, 0, 0);
    a.carry = 1;
    a.state = 'carry';
    run(w, SPIDER_EAT_S + 0.1);
    expect(w.ants.length).toBe(0);
    expect(w.extinct).toBe(true);
    expect(() => run(w, 1)).not.toThrow();
  });
});
