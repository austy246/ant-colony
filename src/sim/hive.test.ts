import { describe, expect, it } from 'vitest';
import { HIVE_BEES, HIVE_HONEY_S, HIVE_MAX_HONEY, HIVE_MIN_ANTS, HIVE_NEST_GAP, HIVE_START_HONEY, NEST, STEP_S } from './constants';
import { validateSave, worldFromSave, worldToSave } from './serialize';
import { Surface } from './terrain';
import { World } from './world';

const EXTRA = { introDone: true, camera: { x: 0, y: 0, zoom: 1 } };

function colony(seed: number, ants: number): World {
  const w = World.create(seed, 'normal');
  w.noSpider = true;
  w.noRaid = true;
  w.spawnTimer = 1e9;
  w.stock = 300;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  w.addAnts(ants);
  return w;
}

/** A colony of HIVE_MIN_ANTS ants whose hive has appeared (a few tries at most). */
function withHive(seed: number, season?: number): World {
  const w = colony(seed, HIVE_MIN_ANTS);
  if (season !== undefined) w.fixedSeason = season;
  run(w, 30);
  if (!w.hive) throw new Error('no hive after 30 s');
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

describe('the bee hive', () => {
  it('appears only in normal mode with HIVE_MIN_ANTS ants, far from the nest, with a pile of honey', () => {
    const small = colony(1, HIVE_MIN_ANTS - 1);
    run(small, 5);
    expect(small.hive).toBeNull();
    const sandbox = World.create(1, 'sandbox');
    sandbox.addAnts(HIVE_MIN_ANTS + 5);
    run(sandbox, 5);
    expect(sandbox.hive).toBeNull();
    const w = withHive(1);
    expect(w.hive).not.toBeNull();
    expect(Math.hypot(w.hive!.x - NEST.x, w.hive!.y - NEST.y)).toBeGreaterThanOrEqual(HIVE_NEST_GAP);
    const honey = w.food.filter((f) => f.kind === 'honey');
    expect(honey).toHaveLength(1);
    expect(honey[0].piecesLeft).toBeGreaterThanOrEqual(HIVE_START_HONEY);
    expect(w.bees).toHaveLength(HIVE_BEES);
  });

  it('in summer the bees sting the ants that come near; in winter and in the rain they stay inside', () => {
    const hurt = (season: number): number => {
      const w = withHive(2, season);
      const h = w.hive!;
      const before = w.antsKilled;
      for (let i = 0; i < 20; i++) {
        const a = w.ants[i];
        a.x = h.x + 8 + i;
        a.y = h.y + 10;
        a.state = 'wander';
      }
      run(w, 20);
      return w.antsKilled - before;
    };
    expect(hurt(1)).toBeGreaterThan(3);
    expect(hurt(3)).toBe(0);
  });

  it('the bees are asleep in the rain', () => {
    const w = withHive(2, 1);
    const h = w.hive!;
    Object.defineProperty(w, 'raining', { get: () => true });
    for (let i = 0; i < 20; i++) {
      w.ants[i].x = h.x + 8 + i;
      w.ants[i].y = h.y + 10;
    }
    const before = w.antsKilled;
    run(w, 20);
    expect(w.antsKilled).toBe(before);
  });

  it('a stung ant leaves its body for the red ants', () => {
    const w = withHive(3, 1);
    const h = w.hive!;
    for (let i = 0; i < 20; i++) {
      w.ants[i].x = h.x + 6;
      w.ants[i].y = h.y + 6;
    }
    run(w, 10);
    expect(w.antsKilled).toBeGreaterThan(0);
    expect(w.food.some((f) => f.kind === 'blackant')).toBe(true);
  });

  it('the ants rob the honey when the bees sleep, and the pile grows back', () => {
    const w = withHive(4, 3); // winter: the bees sleep
    const h = w.hive!;
    const pile = w.food.find((f) => f.kind === 'honey')!;
    const delivered = w.totalDelivered;
    for (let i = 0; i < 10; i++) {
      w.ants[i].x = h.x + (i % 5) * 2;
      w.ants[i].y = h.y + 12;
    }
    run(w, 60);
    expect(pile.piecesLeft).toBeLessThan(HIVE_START_HONEY);
    expect(w.totalDelivered).toBeGreaterThan(delivered);
    // in summer the pile grows by a piece every HIVE_HONEY_S seconds, at most HIVE_MAX_HONEY
    const g = withHive(5, 1);
    const gp = g.food.find((f) => f.kind === 'honey')!;
    const was = gp.piecesLeft;
    run(g, HIVE_HONEY_S * 3 + 1);
    expect(gp.piecesLeft).toBeGreaterThan(was);
    expect(gp.piecesLeft).toBeLessThanOrEqual(HIVE_MAX_HONEY);
  });

  it('the red ants leave the honey alone', () => {
    const w = withHive(6, 3);
    const pile = w.food.find((f) => f.kind === 'honey')!;
    w.reds.push({ id: 9100, x: pile.x + 3, y: pile.y, heading: 0, patrol: true, job: 'forager', spd: 1 });
    w.redNest = { x: pile.x + 50, y: pile.y, owner: 'red', stock: 0, delivered: 0, trickleT: 1e9 };
    w.ants.length = 0;
    run(w, 20);
    expect(w.reds[0].tf).toBeUndefined();
  });

  it('is saved and comes back with its honey; a bad hive is refused', () => {
    const w = withHive(7);
    const save = JSON.parse(JSON.stringify(worldToSave(w, EXTRA)));
    expect(save.hive.x).toBe(w.hive!.x);
    const b = worldFromSave(save);
    expect(b.hive?.x).toBe(w.hive!.x);
    expect(b.food.filter((f) => f.kind === 'honey')).toHaveLength(1);
    run(b, 1);
    expect(b.bees).toHaveLength(HIVE_BEES);
    expect(validateSave({ ...save, hive: { x: -5, y: 3, honeyT: 0 } })).toBeNull();
    expect(validateSave({ ...save, hive: { x: 50, y: 50, honeyT: -1 } })).toBeNull();
  });
});
