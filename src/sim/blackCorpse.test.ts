import { describe, expect, it, vi } from 'vitest';
import { FOOD_TABLE } from './food';
import { BLACK_CORPSE_MAX, BLACK_CORPSE_S, NEST, RAID_MIN_ANTS, STEP_S } from './constants';
import { Surface } from './terrain';
import { World } from './world';

vi.setConfig({ testTimeout: 300_000 });

function bigWorld(seed: number): World {
  const w = World.create(seed, 'normal');
  w.noSpider = true;
  w.spawnTimer = 1e9;
  w.stock = 200;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  w.addAnts(RAID_MIN_ANTS);
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

describe('dead black ants', () => {
  it('a black ant that loses a duel leaves its body where it fell', () => {
    let bodies = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const w = bigWorld(seed);
      run(w, 2);
      const a = w.ants[0];
      a.x = 150;
      a.y = 100;
      w.reds.push({ id: 9000, x: 152, y: 100, heading: 0 });
      run(w, 4);
      if (w.ants.includes(a)) continue; // this one won
      const body = w.food.find((f) => f.kind === 'blackant');
      expect(body, `seed ${seed}`).toBeDefined();
      expect(body!.piecesLeft).toBe(FOOD_TABLE.blackant.pieces);
      expect(Math.hypot(body!.x - 150, body!.y - 100)).toBeLessThan(10);
      bodies++;
      break; // one is enough
    }
    expect(bodies).toBeGreaterThan(0);
  });

  it('the black ants leave a body alone, the red foragers eat it piece by piece', () => {
    const w = bigWorld(3);
    run(w, 3); // the red nest appears with its patrols
    const rn = w.redNest!;
    expect(rn.owner).toBe('red');
    w.reds = w.reds.filter((r) => r.patrol);
    const body = w.placeFood('blackant', NEST.x + 25, NEST.y + 5)!;
    run(w, 20);
    expect(w.food.find((f) => f.id === body.id)?.piecesLeft).toBe(FOOD_TABLE.blackant.pieces); // not one black ant touched it
    // a body near the red nest: the foragers go for it
    const near = w.placeFood('blackant', rn.x + 20, rn.y)!;
    run(w, 90);
    expect(w.food.find((f) => f.id === near.id)?.piecesLeft ?? 0).toBeLessThan(FOOD_TABLE.blackant.pieces);
  });

  it('a body rots away after BLACK_CORPSE_S seconds, and at most BLACK_CORPSE_MAX lie about (the oldest go first)', () => {
    const w = World.create(5, 'normal');
    w.noSpider = true;
    w.noRaid = true;
    w.spawnTimer = 1e9;
    const first = w.placeFood('blackant', NEST.x + 40, NEST.y)!;
    for (let i = 0; i < BLACK_CORPSE_MAX + 20; i++) w.placeFood('blackant', NEST.x + 40 + (i % 30), NEST.y + 10 + Math.floor(i / 30))!;
    run(w, 2);
    const bodies = w.food.filter((f) => f.kind === 'blackant');
    expect(bodies).toHaveLength(BLACK_CORPSE_MAX);
    expect(bodies).not.toContain(first);
    run(w, BLACK_CORPSE_S + 2);
    expect(w.food.filter((f) => f.kind === 'blackant')).toHaveLength(0);
  });
});
