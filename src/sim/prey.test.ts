import { describe, expect, it } from 'vitest';
import { BEETLE_SPEED, HOP_DUR, NEST, PREY_SPEED_VAR, RESCUE_AFTER_S, STEP_S, TOUCH_DIST, WORLD_H, WORLD_W } from './constants';
import { FOOD_TABLE } from './food';
import { Surface } from './terrain';
import { World } from './world';

/** Flat, obstacle-free ground, empty larder. */
function flatWorld(seed = 1): World {
  const w = World.create(seed);
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

function run(w: World, seconds: number): void {
  const n = Math.round(seconds / STEP_S);
  for (let i = 0; i < n; i++) w.step(STEP_S);
}

/** A wandering ant `d` px east of (x, y). */
function antNear(w: World, x: number, y: number, d = 2): ReturnType<World['spawnAnt']> {
  const a = w.spawnAnt();
  a.x = x + d;
  a.y = y;
  a.heading = Math.PI;
  return a;
}

describe('living prey: constants and placement', () => {
  it('constants', () => {
    expect(BEETLE_SPEED).toBe(4);
    expect(TOUCH_DIST).toBe(2.5);
    expect(HOP_DUR).toBe(0.35);
  });

  it('placed beetles, flies and caterpillars are alive with 0 touches and a heading; everything else is not alive (caterpillar: caterpillar.test.ts)', () => {
    const w = flatWorld(1);
    const b = w.placeFood('beetle', 150, 100)!;
    const f = w.placeFood('fly', 180, 100)!;
    for (const item of [b, f]) {
      expect(item.alive).toBe(true);
      expect(item.touches).toBe(0);
      expect(Number.isFinite(item.heading)).toBe(true);
      expect(item.piecesLeft).toBe(FOOD_TABLE[item.kind as 'beetle' | 'fly'].pieces);
    }
    for (const kind of ['carrion', 'berry', 'mushroom'] as const) {
      const it = w.placeFood(kind, 150, 130)!;
      expect(it.alive).toBeFalsy();
      expect(it.corpseOf).toBeUndefined();
    }
  });
});

describe('beetle (alive) walks', () => {
  it('moves at least 10 px away from its start within 20 s (5 seeds), never faster than BEETLE_SPEED', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = flatWorld(seed);
      const b = w.placeFood('beetle', 200, 100)!;
      const { x: x0, y: y0 } = b;
      let far = 0;
      let px = b.x;
      let py = b.y;
      for (let i = 0; i < 20 / STEP_S; i++) {
        w.step(STEP_S);
        far = Math.max(far, Math.hypot(b.x - x0, b.y - y0));
        expect(Math.hypot(b.x - px, b.y - py)).toBeLessThanOrEqual(BEETLE_SPEED * (1 + PREY_SPEED_VAR) * STEP_S + 1e-9); // own speedMul 1 +- PREY_SPEED_VAR
        px = b.x;
        py = b.y;
      }
      expect(far, `seed ${seed}`).toBeGreaterThanOrEqual(10);
    }
  });

  it('is slowed by the ground like an ant (speedAt)', () => {
    const w = flatWorld(2);
    w.terrain.speed.fill(0.5);
    const b = w.placeFood('beetle', 200, 100)!;
    b.speedMul = 1; // exact speed check: neutral creature
    let len = 0;
    let px = b.x;
    let py = b.y;
    for (let i = 0; i < 10 / STEP_S; i++) {
      w.step(STEP_S);
      len += Math.hypot(b.x - px, b.y - py);
      px = b.x;
      py = b.y;
    }
    expect(len).toBeLessThanOrEqual(BEETLE_SPEED * 0.5 * 10 + 0.01);
    expect(len).toBeGreaterThan(5);
  });

  it('stays inside the map and never enters the nest radius + 4 in 60 s (5 seeds, started next to the nest and in corners)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = flatWorld(seed);
      const near = w.placeFood('beetle', NEST.x + NEST.r + 5, NEST.y)!;
      const corner = w.placeFood('beetle', 1, 1)!;
      const edge = w.placeFood('beetle', WORLD_W - 1, WORLD_H - 1)!;
      for (let i = 0; i < 60 / STEP_S; i++) {
        w.step(STEP_S);
        for (const b of [near, corner, edge]) {
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x).toBeLessThan(WORLD_W);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeLessThan(WORLD_H);
          expect(Math.hypot(b.x - NEST.x, b.y - NEST.y)).toBeGreaterThanOrEqual(NEST.r + 4 - 1e-9);
        }
      }
    }
  });

  it('never ends on a stone or big-twig cell (real terrain, 5 seeds, beetles dropped beside obstacles)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = World.create(seed);
      const t = w.terrain;
      const beetles = [];
      for (let y = 0; y < t.h && beetles.length < 12; y += 7) {
        for (let x = 0; x < t.w && beetles.length < 12; x += 7) {
          const s = t.surface[y * t.w + x];
          if (s === Surface.Stone || s === Surface.BigTwig) {
            const b = w.placeFood('beetle', x + 6, y);
            if (b) beetles.push(b);
          }
        }
      }
      expect(beetles.length).toBeGreaterThan(0);
      for (let i = 0; i < 60 / STEP_S; i++) {
        w.step(STEP_S);
        for (const b of beetles) {
          const s = t.surface[Math.floor(b.y) * t.w + Math.floor(b.x)];
          expect(s === Surface.Stone || s === Surface.BigTwig, `seed ${seed}`).toBe(false);
        }
      }
    }
  });
});

describe('fly (alive)', () => {
  it('sits still without ants', () => {
    const w = flatWorld(3);
    const f = w.placeFood('fly', 150, 100)!;
    run(w, 60);
    expect(f.x).toBe(150);
    expect(f.y).toBe(100);
    expect(f.touches).toBe(0);
    expect(f.alive).toBe(true);
  });
});

describe('touching a beetle', () => {
  it('the first ant that touches it dies; the beetle lives with touches 1', () => {
    const w = flatWorld(4);
    const ants = w.ants;
    const b = w.placeFood('beetle', 150, 100)!;
    antNear(w, b.x, b.y);
    run(w, 0.5);
    expect(w.ants).toBe(ants);
    expect(ants).toHaveLength(0);
    expect(w.antsKilled).toBe(1);
    expect(b.alive).toBe(true);
    expect(b.kind).toBe('beetle');
    expect(b.touches).toBe(1);
    expect(b.piecesLeft).toBe(18);
  });

  it('the second touch kills the beetle: carrion, corpseOf beetle, 18 pieces; the second ant survives and goes for the corpse', () => {
    const w = flatWorld(5);
    const b = w.placeFood('beetle', 150, 100)!;
    antNear(w, b.x, b.y);
    run(w, 1); // first ant dies, cooldown (0.8 s) is over
    expect(b.touches).toBe(1);
    const second = antNear(w, b.x, b.y);
    w.step(STEP_S);
    expect(b.alive).toBe(false);
    expect(b.kind).toBe('carrion');
    expect(b.corpseOf).toBe('beetle');
    expect(b.piecesLeft).toBe(FOOD_TABLE.beetle.pieces);
    expect(b.piecesLeft).toBe(18);
    expect(b.touches).toBe(2);
    expect(w.ants).toEqual([second]);
    expect(w.antsKilled).toBe(1);
    expect(second.state).toBe('toFood');
    expect(second.targetFood).toBe(b.id);
  });

  it('two ants arriving in the same substep count as ONE touch (cooldown); the second touch comes after the cooldown', () => {
    const w = flatWorld(6);
    const b = w.placeFood('beetle', 150, 100)!;
    antNear(w, b.x, b.y, 2);
    const a2 = antNear(w, b.x, b.y, 2.2);
    a2.y += 0.3;
    w.step(STEP_S);
    expect(b.touches).toBe(1);
    expect(w.antsKilled).toBe(1);
    expect(w.ants).toHaveLength(1);
    run(w, 0.5); // still inside the 0.8 s cooldown
    expect(b.touches).toBe(1);
    expect(b.alive).toBe(true);
    run(w, 0.6);
    expect(b.touches).toBe(2);
    expect(b.alive).toBe(false);
    expect(w.ants).toHaveLength(1);
  });

  it('only wander / toFood ants can touch: a carrying ant standing on a beetle does nothing', () => {
    const w = flatWorld(7);
    const b = w.placeFood('beetle', 150, 100)!;
    const c = antNear(w, b.x, b.y, 1);
    c.state = 'carry';
    c.carry = 1;
    c.x = 150;
    c.y = 100;
    w.step(STEP_S);
    expect(b.touches).toBe(0);
    expect(w.ants).toHaveLength(1);
  });

  it('a lone ant can die; the rescue rule then spawns one after 15 s', () => {
    const w = flatWorld(8);
    const b = w.placeFood('beetle', 150, 100)!;
    antNear(w, b.x, b.y);
    run(w, 1);
    expect(w.ants).toHaveLength(0);
    expect(w.stock).toBe(0);
    run(w, RESCUE_AFTER_S - 1.5);
    expect(w.ants).toHaveLength(0);
    run(w, 1);
    expect(w.ants).toHaveLength(1);
  });

  it('living creatures are not gnawed: an ant standing at an alive beetle never takes a piece', () => {
    const w = flatWorld(9);
    const b = w.placeFood('beetle', 150, 100)!;
    b.cooldown = 1e6; // never touchable in this test
    b.wanderT = 1e6; // and it does not walk away
    const a = antNear(w, b.x, b.y, 1);
    a.state = 'toFood';
    a.targetFood = b.id;
    for (let i = 0; i < 20 / STEP_S; i++) {
      w.step(STEP_S);
      expect(a.state).not.toBe('gnaw');
      expect(a.state).not.toBe('carry');
    }
    expect(b.piecesLeft).toBe(18);
    expect(a.carry).toBe(0);
    expect(b.touches).toBe(0);
    expect(b.alive).toBe(true);
  });

  it('wanderers sense a living beetle and walk to it (and touch it)', () => {
    const w = flatWorld(10);
    const b = w.placeFood('beetle', 150, 100)!;
    b.wanderT = 1e6;
    const a = w.spawnAnt();
    a.x = 150 - 20;
    a.y = 100;
    a.heading = 0;
    w.step(STEP_S);
    expect(a.state).toBe('toFood');
    expect(a.targetFood).toBe(b.id);
    run(w, 6);
    expect(b.touches).toBeGreaterThanOrEqual(1);
  });
});

describe('touching a fly', () => {
  it('the first touch makes it hop 20..35 px to a valid cell over HOP_DUR; the ant survives and keeps chasing', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = flatWorld(seed);
      const f = w.placeFood('fly', 150, 100)!;
      const a = antNear(w, f.x, f.y);
      w.step(STEP_S);
      expect(f.touches).toBe(1);
      expect(f.alive).toBe(true);
      expect(f.hop).toBeDefined();
      expect(f.hop!.fromX).toBe(150);
      expect(f.hop!.fromY).toBe(100);
      expect(f.hop!.dur).toBe(HOP_DUR);
      run(w, HOP_DUR + 0.1);
      expect(f.hop).toBeUndefined();
      const d = Math.hypot(f.x - 150, f.y - 100);
      expect(d, `seed ${seed}`).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(d, `seed ${seed}`).toBeLessThanOrEqual(35 + 1e-6);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThan(WORLD_W);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeLessThan(WORLD_H);
      expect(Math.hypot(f.x - NEST.x, f.y - NEST.y)).toBeGreaterThanOrEqual(NEST.r + 4);
      expect(w.ants).toEqual([a]);
      expect(w.antsKilled).toBe(0);
      expect(a.state).toBe('toFood');
      expect(a.targetFood).toBe(f.id);
    }
  });

  it('moves linearly from -> to during the hop and the chasing ant follows the live position', () => {
    const w = flatWorld(11);
    const f = w.placeFood('fly', 150, 100)!;
    const a = antNear(w, f.x, f.y);
    w.step(STEP_S);
    const hop = f.hop!;
    for (let i = 0; i < 5; i++) w.step(STEP_S);
    const k = f.hop!.t / hop.dur;
    expect(f.x).toBeCloseTo(hop.fromX + (hop.toX - hop.fromX) * k, 6);
    expect(f.y).toBeCloseTo(hop.fromY + (hop.toY - hop.fromY) * k, 6);
    run(w, 6);
    expect(Math.hypot(a.x - f.x, a.y - f.y)).toBeLessThan(TOUCH_DIST + 1);
  });

  it('is not touchable during the hop, and the second touch (after the cooldown) turns it into carrion with 6 pieces', () => {
    const w = flatWorld(12);
    const f = w.placeFood('fly', 150, 100)!;
    antNear(w, f.x, f.y);
    w.step(STEP_S);
    expect(f.touches).toBe(1);
    // A second ant right on top of the flying fly during the hop: no touch.
    const b = w.spawnAnt();
    b.x = f.x;
    b.y = f.y;
    run(w, 0.1);
    expect(f.touches).toBe(1);
    expect(f.alive).toBe(true);
    for (let i = 0; i < 6 / STEP_S && f.alive; i++) w.step(STEP_S);
    expect(f.touches).toBe(2);
    expect(f.alive).toBe(false);
    expect(f.kind).toBe('carrion');
    expect(f.corpseOf).toBe('fly');
    expect(f.piecesLeft).toBe(6);
    expect(w.antsKilled).toBe(0);
    expect(w.ants).toHaveLength(2);
  });

  it('hop near the map corner stays on the map; with no free spot around it stays put (touch still counts)', () => {
    const w = flatWorld(13);
    const f = w.placeFood('fly', 3, 3)!;
    antNear(w, f.x, f.y);
    run(w, 0.5);
    expect(f.touches).toBe(1);
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.y).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(f.x - 3, f.y - 3)).toBeGreaterThan(0);

    const t = flatWorld(14);
    const s = t.placeFood('fly', 150, 100)!;
    t.terrain.surface.fill(Surface.Stone);
    t.terrain.surface[100 * t.terrain.w + 150] = Surface.Ground;
    antNear(t, s.x, s.y);
    run(t, 0.5);
    expect(s.touches).toBe(1);
    expect(s.hop).toBeUndefined();
    expect(s.x).toBe(150);
    expect(s.y).toBe(100);
  });
});

describe('dead prey is plain carrion food', () => {
  it('a beetle killed by two ants is gnawed and carried to the nest by a group of ants (end to end)', () => {
    let delivered = 0;
    let killedBeetle = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const w = flatWorld(seed);
      const b = w.placeFood('beetle', NEST.x + 30, NEST.y)!;
      for (let i = 0; i < 8; i++) w.spawnAnt();
      run(w, 200);
      if (!b.alive) killedBeetle++;
      if (w.totalDelivered > 0) delivered++;
    }
    expect(killedBeetle).toBeGreaterThanOrEqual(5);
    expect(delivered).toBeGreaterThanOrEqual(5);
  }, 30_000);

  it('a dead fly can be gnawed and its pieces delivered (6 pieces x 2/3 = 4 food)', () => {
    const w = flatWorld(15);
    const f = w.placeFood('fly', NEST.x + 20, NEST.y)!;
    f.touches = 1;
    f.cooldown = 0;
    for (let i = 0; i < 4; i++) w.spawnAnt();
    run(w, 200);
    expect(f.alive).toBe(false);
    expect(w.totalDelivered).toBeGreaterThan(0);
    expect(w.food.length === 0 || w.food[0].piecesLeft < 6).toBe(true);
  });
});

describe('player interaction', () => {
  it('moveFood and removeFood work on living creatures; dragging is not a touch and cancels a hop', () => {
    const w = flatWorld(16);
    const b = w.placeFood('beetle', 150, 100)!;
    expect(w.moveFood(b.id, 200, 60)).toBe(true);
    expect(b.x).toBe(200);
    expect(b.y).toBe(60);
    expect(b.touches).toBe(0);
    expect(b.alive).toBe(true);

    const f = w.placeFood('fly', 100, 50)!;
    antNear(w, f.x, f.y);
    w.step(STEP_S);
    expect(f.hop).toBeDefined();
    expect(w.moveFood(f.id, 240, 120)).toBe(true);
    expect(f.hop).toBeUndefined();
    run(w, 0.5);
    expect(f.x).toBe(240);
    expect(f.y).toBe(120);

    const a = w.spawnAnt();
    a.state = 'toFood';
    a.targetFood = b.id;
    w.removeFood(b.id);
    expect(a.state).toBe('wander');
    expect(a.targetFood).toBeNull();
    expect(w.food.map((x) => x.id)).toEqual([f.id]);
  });
});
