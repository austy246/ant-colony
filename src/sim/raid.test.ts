import { describe, expect, it } from 'vitest';
import { NEST, RAID_MAX_S_ALIVE, RAID_MIN_ANTS, RAID_SIZE_MAX, RAID_SIZE_MIN, STEP_S } from './constants';
import { FOOD_TABLE } from './food';
import { Surface } from './terrain';
import { World } from './world';

function raidWorld(seed: number): World {
  const w = World.create(seed, 'normal');
  w.noSpider = true;
  w.spawnTimer = 1e9;
  w.stock = 100;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

describe('raids of red ants', () => {
  it('no raid below RAID_MIN_ANTS ants', () => {
    const w = raidWorld(1);
    w.addAnts(RAID_MIN_ANTS - 1);
    w.raidWait = 0.01;
    run(w, 1);
    expect(w.reds).toHaveLength(0);
    expect(w.raidsStarted).toBe(0);
  });

  it('with RAID_MIN_ANTS ants a raid brings RAID_SIZE_MIN..RAID_SIZE_MAX red ants from the map edge', () => {
    const sizes = new Set<number>();
    for (let seed = 1; seed <= 6; seed++) {
      const w = raidWorld(seed);
      w.addAnts(RAID_MIN_ANTS);
      w.raidWait = 0.01;
      run(w, 0.5);
      expect(w.raidsStarted).toBe(1);
      expect(w.reds.length).toBeGreaterThanOrEqual(RAID_SIZE_MIN);
      expect(w.reds.length).toBeLessThanOrEqual(RAID_SIZE_MAX);
      sizes.add(w.reds.length);
    }
    expect(sizes.size).toBeGreaterThan(1); // the size is random
  });

  it('a duel kills either the red or the black ant; a dead red ant leaves one body', () => {
    let blackWins = 0;
    const n = 60;
    for (let seed = 1; seed <= n; seed++) {
      const w = raidWorld(seed);
      const a = w.spawnAnt();
      a.x = 150;
      a.y = 100;
      w.reds.push({ id: 9000, x: 152, y: 100, heading: 0 });
      run(w, 4);
      const redDead = w.reds.length === 0;
      const blackDead = !w.ants.includes(a);
      expect(redDead !== blackDead, `seed ${seed}`).toBe(true);
      if (redDead) {
        blackWins++;
        expect(w.food.filter((f) => f.kind === 'redant')).toHaveLength(1);
        expect(w.redKilled).toBe(1);
      } else {
        expect(w.antsKilled).toBe(1);
      }
    }
    expect(blackWins / n).toBeGreaterThan(0.35);
    expect(blackWins / n).toBeLessThan(0.75);
  });

  it('a major usually beats a red ant', () => {
    let wins = 0;
    const n = 60;
    for (let seed = 1; seed <= n; seed++) {
      const w = raidWorld(seed);
      const a = w.spawnAnt();
      a.major = true;
      a.x = 150;
      a.y = 100;
      w.reds.push({ id: 9000, x: 152, y: 100, heading: 0 });
      run(w, 4);
      if (w.ants.includes(a)) wins++;
    }
    expect(wins / n).toBeGreaterThan(0.8);
  });

  it('red ants walk to the nest', () => {
    const w = raidWorld(3);
    w.reds.push({ id: 9000, x: NEST.x + 80, y: NEST.y, heading: 0 });
    run(w, 12);
    expect(Math.hypot(w.reds[0].x - NEST.x, w.reds[0].y - NEST.y)).toBeLessThan(25);
  });

  it('the body of a red ant is one piece that one black ant carries to the larder', () => {
    const w = raidWorld(4);
    w.stock = 0;
    const body = w.placeFood('redant', NEST.x + 20, NEST.y)!;
    expect(body.piecesLeft).toBe(1);
    const a = w.spawnAnt();
    a.x = body.x;
    a.y = body.y + 2;
    run(w, 40);
    expect(w.food).not.toContain(body);
    expect(w.totalDelivered).toBe(FOOD_TABLE.redant.value);
  });

  it('the survivors leave when the raid has lasted RAID_MAX_S_ALIVE seconds', () => {
    const w = raidWorld(5);
    w.reds.push({ id: 9000, x: 300, y: 10, heading: 0 });
    run(w, RAID_MAX_S_ALIVE + 5);
    expect(w.reds).toHaveLength(0);
  });
});
