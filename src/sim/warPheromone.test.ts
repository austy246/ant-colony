import { describe, expect, it } from 'vitest';
import { RED_REACH, WAR_AMOUNT, WAR_LIFE_S, STEP_S } from './constants';
import { validateSave, worldFromSave, worldToSave } from './serialize';
import { Surface } from './terrain';
import { World } from './world';

const EXTRA = { introDone: true, camera: { x: 0, y: 0, zoom: 1 } };

function flat(seed: number): World {
  const w = World.create(seed, 'normal');
  w.noSpider = true;
  w.noRaid = false; // the red ants move in the raid update (it starts no raid below RAID_MIN_ANTS)
  w.noGuards = true;
  w.spawnTimer = 1e9;
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

/** Lays a blob of war pheromone by hand (as a duel would) so the response can be tested alone. */
function blob(f: World['warPher'], x: number, y: number): void {
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) f.deposit(x + dx, y + dy, WAR_AMOUNT);
}

describe('war pheromones', () => {
  it('a duel starts an alarm of both sides where the fight is', () => {
    const w = flat(2);
    const ant = w.spawnAnt();
    ant.age = 500;
    ant.state = 'wander';
    ant.x = 200;
    ant.y = 150;
    w.reds.push({ id: 9000, x: 200 + RED_REACH - 0.5, y: 150, heading: Math.PI });
    run(w, 0.5);
    expect(ant.duelT !== undefined || w.antsKilled > 0 || w.reds.length === 0).toBe(true);
    expect(w.warPher.sample(200, 150)).toBeGreaterThan(0);
    expect(w.redWarPher.sample(200, 150)).toBeGreaterThan(0);
    expect(w.warT).toBeGreaterThan(0);
    expect(w.redWarT).toBeGreaterThan(0);
  });

  it('a free black ant nearby smells the alarm and goes there; far away it does not', () => {
    const near = flat(3);
    const a = near.spawnAnt();
    a.age = 500;
    a.state = 'wander';
    a.x = 215;
    a.y = 150;
    a.heading = Math.PI; // walking away
    blob(near.warPher, 250, 150);
    near.warT = 50;
    run(near, 4);
    expect(Math.hypot(a.x - 250, a.y - 150)).toBeLessThan(20);

    const far = flat(3);
    const b = far.spawnAnt();
    b.age = 500;
    b.state = 'wander';
    b.x = 150;
    b.y = 150;
    b.heading = Math.PI;
    blob(far.warPher, 250, 150);
    far.warT = 50;
    run(far, 4);
    expect(Math.hypot(b.x - 250, b.y - 150)).toBeGreaterThan(80);
  });

  it('the black ants do not answer the red alarm, and the other way round', () => {
    const w = flat(4);
    const a = w.spawnAnt();
    a.age = 500;
    a.state = 'wander';
    a.x = 215;
    a.y = 150;
    a.heading = Math.PI;
    blob(w.redWarPher, 250, 150);
    w.redWarT = 50;
    run(w, 4);
    expect(Math.hypot(a.x - 250, a.y - 150)).toBeGreaterThan(60);
  });

  it('a free red patrol ant answers its own side\'s alarm', () => {
    const w = flat(5);
    w.redNest = { x: 330, y: 150, owner: 'red', stock: 0, delivered: 0, trickleT: 1e9 };
    w.reds.push({ id: 9001, x: 278, y: 150, heading: 0, patrol: true, job: 'guard', ox: 0, oy: 0 });
    blob(w.redWarPher, 250, 150);
    w.redWarT = 50;
    const before = Math.hypot(278 - 250, 0);
    run(w, 4);
    expect(Math.hypot(w.reds[0].x - 250, w.reds[0].y - 150)).toBeLessThan(before - 10);
  });

  it('the alarm is wiped after WAR_LIFE_S seconds', () => {
    const w = flat(6);
    blob(w.warPher, 250, 150);
    w.warT = WAR_LIFE_S;
    run(w, WAR_LIFE_S + 2);
    expect(w.warPher.data.every((v) => v === 0)).toBe(true);
    expect(w.warT).toBeLessThanOrEqual(0);
  });

  it('is saved, comes back with its clock, and a bad payload is refused', () => {
    const w = flat(7);
    blob(w.warPher, 250, 150);
    w.warT = 40;
    const save = JSON.parse(JSON.stringify(worldToSave(w, EXTRA)));
    expect(save.warPheromone).toBeTypeOf('string');
    expect(save.redWarPheromone).toBeUndefined();
    const b = worldFromSave(save);
    expect(b.warPher.sample(250, 150)).toBeGreaterThan(0.5);
    expect(b.warT).toBeGreaterThan(0);
    expect(validateSave({ ...save, warPheromone: 'AAAA' })).toBeNull();
  });
});
