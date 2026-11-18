import { describe, expect, it, vi } from 'vitest';
import { NEST, RAID_MIN_ANTS, REPEL_MAX, STEP_S } from './constants';
import { validateSave, worldFromSave, worldToSave } from './serialize';
import { Surface } from './terrain';
import { World } from './world';

vi.setConfig({ testTimeout: 120_000 });

const EXTRA = { introDone: true, camera: { x: 0, y: 0, zoom: 1 } };

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

const roundTrip = (w: World): World => {
  const save = JSON.parse(JSON.stringify(worldToSave(w, EXTRA)));
  expect(validateSave(save)).not.toBeNull();
  return worldFromSave(save);
};

describe('everything that matters is saved with the game', () => {
  it('the red ants (patrols and a raid in progress), their trails, the nest and the raid clock survive a reload', () => {
    const w = bigWorld(3);
    run(w, 2);
    w.raidWait = 0.01;
    run(w, 3); // a raid is on, part of it still coming out of the nest
    expect(w.raiders).toBeGreaterThan(0);
    const patrols = w.reds.filter((r) => r.patrol).length;
    expect(patrols).toBeGreaterThan(100);
    w.redNest!.delivered = 7;
    w.redPher.deposit(w.redNest!.x + 10, w.redNest!.y, 5);
    const b = roundTrip(w);
    expect(b.reds).toHaveLength(w.reds.length);
    expect(b.reds.filter((r) => r.patrol)).toHaveLength(patrols);
    expect(b.raiders).toBe(w.raiders);
    expect(b.raidAge).toBe(w.raidAge);
    expect(b.raidPending).toBe(w.raidPending);
    expect(b.redNest?.delivered).toBe(7);
    expect(b.redPher.data.some((v) => v > 0)).toBe(true);
    // the raid goes on after the reload: no pause, the raiders keep coming out
    const before = b.raiders;
    run(b, 2);
    expect(b.raiders).toBeGreaterThanOrEqual(before);
    expect(b.reds.filter((r) => r.patrol).length).toBeGreaterThanOrEqual(patrols - 5);
  });

  it('the player\'s marks, orders, selection, explored ground and clocks survive a reload', () => {
    const w = World.create(5, 'normal');
    w.noSpider = true;
    w.noRaid = true;
    w.spawnTimer = 1e9;
    w.addAnts(30);
    for (let i = 0; i < REPEL_MAX + 2; i++) w.placeRepel(60 + i * 20, 120);
    expect(w.repels.length).toBe(REPEL_MAX);
    const a = w.ants[4];
    w.selectedAntId = a.id;
    expect(w.sendAnt(a.id, 400, 200)).toBe(true);
    run(w, 5);
    a.acidT = 3; // (set last: it would wear off while the world runs)
    w.rescueTimer = 4;
    const ex = w.explored.reduce((s, v) => s + v, 0);
    expect(ex).toBeGreaterThan(0);
    const b = roundTrip(w);
    expect(b.repels).toHaveLength(w.repels.length);
    expect(b.repels[0].t).toBeCloseTo(w.repels[0].t, 6);
    expect(b.selectedAntId).toBe(a.id);
    const a2 = b.ants.find((x) => x.id === a.id)!;
    expect(a2.goal?.x).toBe(a.goal?.x);
    expect(a2.acidT).toBeCloseTo(a.acidT!, 6);
    expect(b.rescueTimer).toBe(4);
    const ex2 = b.explored.reduce((s, v) => s + v, 0);
    expect(ex2).toBeGreaterThan(ex * 0.9);
    expect(ex2).toBeLessThan(ex * 1.1);
  });

  it('a selection of an ant that is gone is dropped, and old saves without the new fields still load', () => {
    const w = World.create(5, 'normal');
    w.noSpider = true;
    w.noRaid = true;
    w.addAnts(10);
    const save = JSON.parse(JSON.stringify(worldToSave(w, EXTRA)));
    save.selectedAntId = 99999;
    expect(worldFromSave(save).selectedAntId).toBeNull();
    for (const k of ['reds', 'redPheromone', 'repels', 'explored', 'raidAge', 'raidPending', 'rescueTimer', 'selectedAntId']) delete save[k];
    expect(validateSave(save)).not.toBeNull();
    const old = worldFromSave(save);
    expect(old.reds).toHaveLength(0);
    expect(old.repels).toHaveLength(0);
    expect(old.ants).toHaveLength(10);
    expect(NEST.x).toBeGreaterThan(0);
  });

  it('refuses bad new fields', () => {
    const w = World.create(5, 'normal');
    w.addAnts(3);
    const good = JSON.parse(JSON.stringify(worldToSave(w, EXTRA)));
    expect(validateSave({ ...good, reds: [{ id: 1 }] })).toBeNull();
    expect(validateSave({ ...good, repels: [{ x: 1, y: 1, t: -1 }] })).toBeNull();
    expect(validateSave({ ...good, raidAge: -1 })).toBeNull();
    expect(validateSave({ ...good, redPheromone: 'AAAA' })).toBeNull();
  });
});
