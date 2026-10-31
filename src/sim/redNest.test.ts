import { describe, expect, it } from 'vitest';
import {
  CAPTURE_ANTS, CAPTURE_R, CAPTURED_HATCH_MUL, CAPTURED_QUEENS, HATCH_INTERVAL_S, NEST, RAID_MIN_ANTS, RED_NEST_GAP, RED_PATROL_MAX,
  RED_PATROL_R, RED_PATROL_START, RED_TRICKLE_S, STEP_S,
} from './constants';
import { validateSave, worldFromSave, worldToSave } from './serialize';
import { Surface } from './terrain';
import { World } from './world';

function bigWorld(seed: number, ants = RAID_MIN_ANTS): World {
  const w = World.create(seed, 'normal');
  w.noSpider = true;
  w.spawnTimer = 1e9;
  w.stock = 200;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  w.addAnts(ants);
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

describe('the red nest', () => {
  it('appears only with RAID_MIN_ANTS black ants, far from the black nest', () => {
    const small = bigWorld(1, RAID_MIN_ANTS - 1);
    run(small, 3);
    expect(small.redNest).toBeNull();
    for (let seed = 1; seed <= 5; seed++) {
      const w = bigWorld(seed);
      run(w, 3);
      expect(w.redNest?.owner).toBe('red');
      expect(Math.hypot(w.redNest!.x - NEST.x, w.redNest!.y - NEST.y)).toBeGreaterThanOrEqual(RED_NEST_GAP);
    }
  });

  it('it appears with 100 red ants that walk around it, and a new one comes every 5 s', () => {
    const w = bigWorld(2);
    run(w, 1);
    expect(RED_PATROL_START).toBe(100);
    expect(RED_TRICKLE_S).toBe(5);
    expect(w.reds.filter((r) => r.patrol)).toHaveLength(RED_PATROL_START);
    run(w, 60); // 12 more
    const patrols = w.reds.filter((r) => r.patrol);
    expect(patrols.length).toBeGreaterThanOrEqual(RED_PATROL_START + 10);
    expect(patrols.length).toBeLessThanOrEqual(RED_PATROL_START + 13);
    let far = 0;
    for (const r of patrols) if (Math.hypot(r.x - w.redNest!.x, r.y - w.redNest!.y) > RED_PATROL_R + 60) far++;
    expect(far / patrols.length).toBeLessThan(0.1);
    expect(w.raiders).toBe(0); // patrols are not a raid
  });

  it('the red ants stop growing in number at RED_PATROL_MAX', () => {
    const w = bigWorld(8);
    run(w, 1);
    for (let i = 0; i < RED_PATROL_MAX; i++) w.reds.push({ id: 90000 + i, x: w.redNest!.x, y: w.redNest!.y, heading: 0, patrol: true });
    run(w, RED_TRICKLE_S * 3);
    expect(w.reds.filter((r) => r.patrol).length).toBeLessThanOrEqual(RED_PATROL_START + RED_PATROL_MAX);
  });

  it('the raids set off from the red nest', () => {
    const w = bigWorld(3);
    run(w, 2);
    w.raidWait = 0.01;
    run(w, 0.5);
    expect(w.raiders).toBeGreaterThan(50);
    const n = w.redNest!;
    for (const r of w.reds.filter((x) => !x.patrol)) expect(Math.hypot(r.x - n.x, r.y - n.y)).toBeLessThan(90);
  });

  it('black ants that get into it take it: no more patrols or raids, more queens, faster hatching', () => {
    const w = bigWorld(4);
    run(w, RED_TRICKLE_S * 3);
    const n = w.redNest!;
    const queens = w.queens;
    const interval = w.hatchInterval;
    for (let i = 0; i < CAPTURE_ANTS; i++) {
      const a = w.ants[i];
      a.state = 'wander';
      a.x = n.x + (i - 1.5);
      a.y = n.y;
    }
    run(w, 0.2);
    expect(n.owner).toBe('black');
    expect(w.reds.filter((r) => r.patrol)).toHaveLength(0);
    expect(w.queens).toBe(queens + CAPTURED_QUEENS);
    expect(w.hatchInterval).toBeLessThan(interval);
    expect(w.hatchInterval).toBeCloseTo((HATCH_INTERVAL_S / w.queens) * CAPTURED_HATCH_MUL, 9);
    w.raidWait = 0.01;
    run(w, 5);
    expect(w.raiders).toBe(0);
    run(w, RED_TRICKLE_S * 3);
    expect(w.reds.filter((r) => r.patrol)).toHaveLength(0);
  });

  it('fewer than CAPTURE_ANTS ants do not take it', () => {
    const w = bigWorld(5);
    run(w, 3);
    const n = w.redNest!;
    for (let i = 0; i < CAPTURE_ANTS - 1; i++) {
      const a = w.ants[i];
      a.state = 'carry';
      a.carry = 0;
      a.x = n.x + CAPTURE_R * 3; // far away
      a.y = n.y;
    }
    run(w, 0.2);
    expect(n.owner).toBe('red');
  });

  it('black wanderers near it smell it and go there', () => {
    const w = bigWorld(6);
    run(w, 3);
    const n = w.redNest!;
    for (const r of [...w.reds]) w.reds.splice(w.reds.indexOf(r), 1);
    const a = w.spawnAnt();
    a.x = n.x - 70;
    a.y = n.y;
    a.heading = Math.PI;
    const d0 = Math.hypot(a.x - n.x, a.y - n.y);
    run(w, 3);
    expect(Math.hypot(a.x - n.x, a.y - n.y)).toBeLessThan(d0 - 15);
  });

  it('the red nest and its owner survive a save and a load', () => {
    const w = bigWorld(7);
    run(w, 3);
    w.redNest!.owner = 'black';
    const save = JSON.parse(JSON.stringify(worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 4 } })));
    const v = validateSave(save);
    expect(v).not.toBeNull();
    const back = worldFromSave(v!);
    expect(back.redNest).toMatchObject({ x: w.redNest!.x, y: w.redNest!.y, owner: 'black' });
    expect(validateSave({ ...save, redNest: { x: 1, y: 1, owner: 'green' } })).toBeNull();
  });
});
