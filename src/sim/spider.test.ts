import { describe, expect, it } from 'vitest';
import {
  EXPLORE_CAP,
  EXPLORE_CELL,
  SPIDER_EAT_S,
  SPIDER_FLY_EAT_S,
  SPIDER_MAJOR_HOLD_S,
  SPIDER_RESPAWN_S,
  SPIDER_WEB_R,
  STEP_S,
  WORLD_H,
  WORLD_W,
} from './constants';
import { pickSpawnSpot } from './environment';
import { bodyPos, inWeb, spiderCorner } from './spider';
import { Surface } from './terrain';
import { World, type Ant } from './world';

/** A normal world whose spider exists (created by the first step), with prey spawning switched off. */
function spiderWorld(seed = 1): World {
  const w = World.create(seed, 'normal');
  w.noGuards = true; // the guards circle the nest, away from the web
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
  it('sandbox world has a spider too, always in the lower right corner, and it catches ants', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = World.create(seed);
      const a = w.spawnAnt();
      w.step(STEP_S);
      expect(w.spider).not.toBeNull();
      expect(w.spider!.corner).toBe(1);
      expect(w.spider!.y).toBe(WORLD_H - SPIDER_WEB_R - 4);
      a.x = w.spider!.x + 5;
      a.y = w.spider!.y;
      w.step(STEP_S);
      expect(a.caughtT).toBeDefined();
    }
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

  it('a caught major is not eaten while an ordinary caught ant waits; the ordinary one goes first', () => {
    const w = spiderWorld();
    const m = antAt(w, 1, 1, 10); // caught longest
    m.major = true;
    const plain = antAt(w, -2, 1, 1);
    run(w, SPIDER_EAT_S + 0.1);
    expect(w.spider!.alive).toBe(true);
    expect(w.ants.includes(plain)).toBe(false);
    expect(w.ants.includes(m)).toBe(true);
  });

  it('a caught major alone is held SPIDER_MAJOR_HOLD_S and only then eaten', () => {
    expect(SPIDER_MAJOR_HOLD_S).toBeGreaterThan(SPIDER_EAT_S);
    const w = spiderWorld();
    const m = antAt(w, 1, 1, 0);
    m.major = true;
    run(w, SPIDER_MAJOR_HOLD_S - 1);
    expect(w.ants.includes(m)).toBe(true);
    expect(w.spider!.alive).toBe(true);
    run(w, 1.2);
    expect(w.ants.includes(m)).toBe(false);
    expect(w.spider!.alive).toBe(true);
  });

  it('a second major arriving 40 s after the first still kills the spider', () => {
    const w = spiderWorld();
    const m1 = antAt(w, 1, 1, 0);
    m1.major = true;
    run(w, 40);
    expect(w.ants).toContain(m1);
    const m2 = antAt(w, -2, 2);
    m2.major = true;
    w.step(STEP_S);
    expect(w.spider!.alive).toBe(false);
    expect(w.ants).toContain(m1);
    expect(w.ants).toContain(m2);
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

/** Explored-grid columns of the world's current map. */
const cols = (w: World): number => Math.ceil(w.terrain.w / EXPLORE_CELL);

/** Does the explored-grid cell (cx, cy) overlap the web of a spider at (sx, sy)? */
function cellTouchesWeb(cx: number, cy: number, sx: number, sy: number): boolean {
  const nx = Math.max(cx * EXPLORE_CELL, Math.min((cx + 1) * EXPLORE_CELL, sx));
  const ny = Math.max(cy * EXPLORE_CELL, Math.min((cy + 1) * EXPLORE_CELL, sy));
  return Math.hypot(nx - sx, ny - sy) <= SPIDER_WEB_R;
}

/** Heading from the spider toward the middle of the base map. */
const inward = (w: World): number => Math.atan2(WORLD_H / 2 - w.spider!.y, WORLD_W / 2 - w.spider!.x);

function flatten(w: World): void {
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
}

/** Sends every ant of the world underground for good (so no ant touches the prey and the world is not extinct). */
function parkAnts(w: World): void {
  for (const a of w.ants) {
    a.state = 'nest';
    a.nestKind = 'nurse';
    a.role = 'nurse';
  }
}

describe('wanderers are not pulled into the web', () => {
  it('explored cells under a living web are saturated every substep (also after map growth and on a new spot)', () => {
    const w = spiderWorld();
    const check = (): void => {
      const sp = w.spider!;
      const cw = cols(w);
      let n = 0;
      for (let cy = 0; cy * EXPLORE_CELL < w.terrain.h; cy++) {
        for (let cx = 0; cx < cw; cx++) {
          const v = w.explored[cy * cw + cx];
          if (Math.hypot((cx + 0.5) * EXPLORE_CELL - sp.x, (cy + 0.5) * EXPLORE_CELL - sp.y) <= SPIDER_WEB_R) {
            expect(v).toBeGreaterThanOrEqual(EXPLORE_CAP - 1e-6);
            n++;
          } else if (!cellTouchesWeb(cx, cy, sp.x, sp.y)) {
            expect(v).toBeLessThan(1);
          }
        }
      }
      expect(n).toBeGreaterThan(20);
    };
    w.explored.fill(0);
    w.step(STEP_S);
    check();
    w.growMapTo(1);
    w.explored.fill(0);
    w.step(STEP_S);
    check();
    w.spider!.y = WORLD_H - w.spider!.y; // as if it respawned in the other corner
    w.explored.fill(0);
    w.step(STEP_S);
    check();
  });

  it('explored cells are not saturated once the spider is dead', () => {
    const w = spiderWorld();
    w.spider!.alive = false;
    w.spider!.respawnT = 1e9;
    w.explored.fill(0);
    run(w, 1);
    const sp = w.spider!;
    expect(w.explored[Math.floor(sp.y / EXPLORE_CELL) * cols(w) + Math.floor(sp.x / EXPLORE_CELL)]).toBeLessThan(0.1);
  });

  it('wanderers walking past the web on well-explored ground do not turn into it', () => {
    let caught = 0;
    let total = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const w = spiderWorld(seed);
      flatten(w);
      parkAnts(w);
      const sp = w.spider!;
      const base = inward(w);
      const ants: Ant[] = [];
      for (let k = -3; k <= 3; k++) {
        const ang = base + k * 0.25;
        const a = antAt(w, Math.cos(ang) * (SPIDER_WEB_R + 9), Math.sin(ang) * (SPIDER_WEB_R + 9));
        a.heading = ang + Math.PI / 2; // tangent: walking past the web
        a.age = 1000; // beyond the young-ant range
        ants.push(a);
      }
      const cw = cols(w);
      for (let i = 0; i < Math.round(4 / STEP_S); i++) {
        // Everything away from the web is well explored; the cells over the web are left to the world.
        for (let cy = 0; cy * EXPLORE_CELL < w.terrain.h; cy++) {
          for (let cx = 0; cx < cw; cx++) if (!cellTouchesWeb(cx, cy, sp.x, sp.y)) w.explored[cy * cw + cx] = 3;
        }
        w.step(STEP_S);
      }
      for (const a of ants) if (a.caughtT !== undefined || !w.ants.includes(a)) caught++;
      total += ants.length;
    }
    expect(total).toBe(28);
    expect(caught).toBeLessThanOrEqual(3);
  });
});

describe('prey avoids the web of a living spider', () => {
  /** A beetle (or caterpillar) 3 px outside the web, heading straight at the spider. */
  function crawlerAtWeb(w: World, kind: 'beetle' | 'caterpillar') {
    const sp = w.spider!;
    const ang = inward(w);
    const f = w.placeFood(kind, sp.x + Math.cos(ang) * (SPIDER_WEB_R + 3), sp.y + Math.sin(ang) * (SPIDER_WEB_R + 3))!;
    f.heading = ang + Math.PI;
    f.speedMul = 1;
    return f;
  }

  it('a crawling beetle or caterpillar never steps into a living web', () => {
    for (let seed = 1; seed <= 5; seed++) {
      for (const kind of ['beetle', 'caterpillar'] as const) {
        const w = spiderWorld(seed);
        flatten(w);
        parkAnts(w);
        const f = crawlerAtWeb(w, kind);
        for (let i = 0; i < Math.round(60 / STEP_S); i++) {
          w.step(STEP_S);
          expect(inWeb(w.spider, f.x, f.y), `seed ${seed} ${kind} step ${i}`).toBe(false);
        }
      }
    }
  });

  it('a crawling beetle does walk over the spot of a dead spider', () => {
    let entered = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const w = spiderWorld(seed);
      flatten(w);
      parkAnts(w);
      w.spider!.alive = false;
      w.spider!.respawnT = 1e9;
      const f = crawlerAtWeb(w, 'beetle');
      const sp = w.spider!;
      for (let i = 0; i < Math.round(30 / STEP_S); i++) {
        w.step(STEP_S);
        if (Math.hypot(f.x - sp.x, f.y - sp.y) <= SPIDER_WEB_R) {
          entered++;
          break;
        }
      }
    }
    expect(entered).toBeGreaterThanOrEqual(3);
  });

  it('a hopping fly never lands in a living web, but may land where a dead spider sat', () => {
    const hops = (alive: boolean): { n: number; inside: number } => {
      const w = spiderWorld(2);
      flatten(w);
      parkAnts(w);
      const sp = w.spider!;
      sp.alive = alive;
      if (!alive) sp.respawnT = 1e9;
      const ang = inward(w);
      const f = w.placeFood('fly', sp.x + Math.cos(ang) * (SPIDER_WEB_R + 2), sp.y + Math.sin(ang) * (SPIDER_WEB_R + 2))!;
      const x0 = f.x;
      const y0 = f.y;
      let n = 0;
      let inside = 0;
      for (let i = 0; i < 400; i++) {
        f.x = x0;
        f.y = y0;
        delete f.hop;
        (w as unknown as { startHop(f: unknown): void }).startHop(f);
        const hop = f.hop as { toX: number; toY: number } | undefined; // set by startHop (TS narrowed it away after the delete)
        if (!hop) continue;
        n++;
        if (Math.hypot(hop.toX - sp.x, hop.toY - sp.y) <= SPIDER_WEB_R) inside++;
      }
      return { n, inside };
    };
    const live = hops(true);
    expect(live.n).toBeGreaterThan(350);
    expect(live.inside).toBe(0);
    expect(hops(false).inside).toBeGreaterThan(20);
  });
});


describe('wanderers sense the silk of a living web (R4)', () => {
  /** Old, neutral wanderers placed around the web (in the map), each heading straight at the spider. */
  function ringOfWanderers(w: World, n: number, dist: number): Ant[] {
    const base = inward(w);
    const ants: Ant[] = [];
    for (let k = 0; k < n; k++) {
      const ang = base + (k / (n - 1) - 0.5) * 2.4;
      const a = antAt(w, Math.cos(ang) * dist, Math.sin(ang) * dist);
      a.heading = ang + Math.PI; // straight at the spider
      a.age = 1000;
      ants.push(a);
    }
    return ants;
  }

  it('wandering ants heading straight at a living web from a little way off turn away (almost all of them)', () => {
    let caught = 0;
    let total = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const w = spiderWorld(seed);
      flatten(w);
      parkAnts(w);
      const ants = ringOfWanderers(w, 12, SPIDER_WEB_R + 20);
      run(w, 20);
      for (const a of ants) if (a.caughtT !== undefined || !w.ants.includes(a)) caught++;
      total += ants.length;
    }
    expect(total).toBe(48);
    expect(caught).toBeLessThanOrEqual(2);
  });

  it('wanderers following the map edge into the corner do not walk into the web', () => {
    const w = spiderWorld(1);
    flatten(w);
    parkAnts(w);
    const sp = w.spider!;
    const ants: Ant[] = [];
    for (let k = 0; k < 6; k++) {
      // along the edge the web is closest to (top for the upper corner, bottom for the lower one), walking to the right
      const a = antAt(w, -60 - k * 6, (sp.y < WORLD_H / 2 ? 1 : WORLD_H - 1) - sp.y);
      a.heading = 0;
      a.age = 1000;
      ants.push(a);
    }
    for (let i = 0; i < Math.round(30 / STEP_S); i++) {
      w.step(STEP_S);
      for (const a of ants) expect(a.caughtT, `step ${i}`).toBeUndefined();
    }
  });

  it('a dead spider no longer repels: wanderers walk over its spot', () => {
    let entered = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const w = spiderWorld(seed);
      flatten(w);
      parkAnts(w);
      w.spider!.alive = false;
      w.spider!.respawnT = 1e9;
      const sp = w.spider!;
      const ants = ringOfWanderers(w, 12, SPIDER_WEB_R + 8);
      const inside = new Set<Ant>();
      for (let i = 0; i < Math.round(10 / STEP_S); i++) {
        w.step(STEP_S);
        for (const a of ants) if (Math.hypot(a.x - sp.x, a.y - sp.y) <= SPIDER_WEB_R) inside.add(a);
      }
      entered += inside.size;
    }
    expect(entered).toBeGreaterThan(10);
  });

  it('an ant going for food on the far side of the web is not protected and gets caught', () => {
    let caught = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const w = spiderWorld(seed);
      flatten(w);
      parkAnts(w);
      const sp = w.spider!;
      const base = inward(w);
      const food = w.placeFood('berry', sp.x + Math.cos(base + 0.8) * (SPIDER_WEB_R + 3), sp.y + Math.sin(base + 0.8) * (SPIDER_WEB_R + 3))!;
      const a = antAt(w, Math.cos(base - 0.8) * (SPIDER_WEB_R + 3), Math.sin(base - 0.8) * (SPIDER_WEB_R + 3));
      a.state = 'toFood';
      a.targetFood = food.id;
      a.heading = Math.atan2(food.y - a.y, food.x - a.x);
      a.age = 1000;
      run(w, 10);
      if (a.caughtT !== undefined || !w.ants.includes(a)) caught++;
    }
    expect(caught).toBeGreaterThanOrEqual(3);
  });

  it('40 foraging ants with nothing to find lose (almost) none to the spider in 10 min', () => {
    const w = spiderWorld(1);
    parkAnts(w);
    for (let i = 0; i < 40; i++) w.spawnAnt();
    const n0 = w.ants.length;
    run(w, 600);
    expect(w.antsKilled).toBe(n0 - w.ants.length); // no prey: every loss is a spider meal
    expect(w.antsKilled).toBeLessThanOrEqual(2);
  });
});

describe('the spider walks along its web', () => {
  it('walks to a caught ant, eats it after SPIDER_EAT_S and goes back to the middle of the web', () => {
    const w = spiderWorld(3);
    const sp = w.spider!;
    const a = antAt(w, 15, 0, 0);
    run(w, 3);
    const b = bodyPos(sp);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(2.5);
    expect(Math.hypot(b.x - sp.x, b.y - sp.y)).toBeGreaterThan(10);
    run(w, SPIDER_EAT_S);
    expect(w.ants).not.toContain(a);
    run(w, 3);
    const home = bodyPos(sp);
    expect(Math.hypot(home.x - sp.x, home.y - sp.y)).toBeLessThan(2.5);
  });

  it('a fly that walks into the web sticks; the spider walks to it and eats it', () => {
    const w = spiderWorld(4);
    const sp = w.spider!;
    w.terrain.surface.fill(Surface.Ground);
    w.terrain.speed.fill(1);
    const f = w.placeFood('fly', sp.x + SPIDER_WEB_R + 1.5, sp.y)!;
    f.heading = Math.PI;
    let stuck = false;
    for (let i = 0; i < 30 / STEP_S && w.food.includes(f); i++) {
      w.step(STEP_S);
      if (f.stuck) stuck = true;
    }
    expect(stuck).toBe(true);
    expect(w.food).not.toContain(f); // eaten
  });

  it('a stuck fly takes SPIDER_FLY_EAT_S once the spider is there, and ants leave it alone', () => {
    const w = spiderWorld(5);
    const sp = w.spider!;
    const f = w.placeFood('fly', sp.x + 10, sp.y)!;
    w.step(STEP_S);
    expect(f.stuck).toBe(true);
    run(w, 1);
    expect(w.food).toContain(f);
    run(w, SPIDER_FLY_EAT_S);
    expect(w.food).not.toContain(f);
  });
});
