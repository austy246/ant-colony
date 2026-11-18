import { describe, expect, it } from 'vitest';
import { RED_REACH, WAR_AMOUNT, WAR_LIFE_S, WAR_TAIL, WAR_TRAIL_LEN, STEP_S } from './constants';
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

/** Lays an alarm trail by hand (as a duel would): a spot at (x, y) and a line from there toward (hx, hy), strongest at the fight. */
function trail(f: World['warPher'], x: number, y: number, hx: number, hy: number): void {
  const dist = Math.hypot(hx - x, hy - y);
  for (let d = 0; d <= Math.min(WAR_TRAIL_LEN, dist); d += 0.7) f.raise(x + ((hx - x) / dist) * d, y + ((hy - y) / dist) * d, WAR_AMOUNT + (WAR_TAIL - WAR_AMOUNT) * (d / WAR_TRAIL_LEN));
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

  it('a free black ant on the trail smells it and goes up to the fight; one beyond the end of the trail does not', () => {
    const near = flat(3);
    const a = near.spawnAnt();
    a.age = 500;
    a.state = 'wander';
    a.x = 215;
    a.y = 150;
    a.heading = Math.PI; // walking away
    trail(near.warPher, 250, 150, 150, 150);
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
    trail(far.warPher, 250, 150, 150, 150);
    far.warT = 50;
    run(far, 4);
    expect(Math.hypot(b.x - 250, b.y - 150)).toBeGreaterThan(80);
  });

  it('the trail is a thin line, not a blob: only a few cells wide, and it thins out toward the nest', () => {
    const w = flat(8);
    trail(w.warPher, 250, 150, 150, 150);
    let cells = 0;
    for (let y = 100; y < 200; y++) for (let x = 120; x < 300; x++) if (w.warPher.data[y * w.warPher.w + x] > 0) cells++;
    expect(cells).toBeLessThan(WAR_TRAIL_LEN * 3);
    expect(w.warPher.sample(250, 150)).toBeGreaterThan(w.warPher.sample(200, 150));
    expect(w.warPher.sample(200, 150)).toBeGreaterThan(w.warPher.sample(175, 150));
    expect(w.warPher.sample(200, 135)).toBe(0); // not a cell off the line
  });

  it('an ant 20 px off the trail does not smell it', () => {
    const w = flat(9);
    const a = w.spawnAnt();
    a.age = 500;
    a.state = 'wander';
    a.x = 215;
    a.y = 170;
    a.heading = Math.PI / 2; // walking away from the trail
    trail(w.warPher, 250, 150, 150, 150);
    w.warT = 50;
    run(w, 4);
    expect(a.y).toBeGreaterThan(175);
  });

  it('the black ants do not answer the red alarm, and the other way round', () => {
    const w = flat(4);
    const a = w.spawnAnt();
    a.age = 500;
    a.state = 'wander';
    a.x = 215;
    a.y = 150;
    a.heading = Math.PI;
    trail(w.redWarPher, 250, 150, 330, 150);
    w.redWarT = 50;
    run(w, 4);
    expect(Math.hypot(a.x - 250, a.y - 150)).toBeGreaterThan(60);
  });

  it('a free red patrol ant answers its own side\'s alarm', () => {
    const w = flat(5);
    w.redNest = { x: 330, y: 150, owner: 'red', stock: 0, delivered: 0, trickleT: 1e9 };
    w.reds.push({ id: 9001, x: 278, y: 150, heading: 0, patrol: true, job: 'guard', ox: 0, oy: 0 });
    trail(w.redWarPher, 250, 150, 330, 150);
    w.redWarT = 50;
    const before = Math.hypot(278 - 250, 0);
    run(w, 4);
    expect(Math.hypot(w.reds[0].x - 250, w.reds[0].y - 150)).toBeLessThan(before - 10);
  });

  it('the alarm is wiped after WAR_LIFE_S seconds', () => {
    const w = flat(6);
    trail(w.warPher, 250, 150, 150, 150);
    w.warT = WAR_LIFE_S;
    run(w, WAR_LIFE_S + 2);
    expect(w.warPher.data.every((v) => v === 0)).toBe(true);
    expect(w.warT).toBeLessThanOrEqual(0);
  });

  it('is saved, comes back with its clock, and a bad payload is refused', () => {
    const w = flat(7);
    trail(w.warPher, 250, 150, 150, 150);
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
