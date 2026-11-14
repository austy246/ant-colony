import { describe, expect, it, vi } from 'vitest';
import { ACID_S, SATELLITE_COST, GUARD_FRACTION, GUARD_R_MIN, GUARD_R_STEP, NEST, RAID_MIN_ANTS, RED_FOOD_PER_ANT, RED_NEST_MIN_ANTS, RED_START_STOCK, RED_TRICKLE_S, STEP_S } from './constants';
import type { RedAnt } from './raid';
import { Surface } from './terrain';
import { worldFromSave, worldToSave } from './serialize';
import { World } from './world';

vi.setConfig({ testTimeout: 120_000 }); // big colonies with hundreds of red ants: slow when the whole suite runs at once

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

function colony(seed: number, ants: number, majors = 0): World {
  const w = World.create(seed, 'normal');
  w.noSpider = true;
  w.noRaid = true;
  w.spawnTimer = 1e9;
  w.stock = 300;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  w.addAnts(ants);
  for (let i = 0; i < majors; i++) w.ants[i].major = true;
  return w;
}

describe('guards of the black nest', () => {
  it('a twentieth of the colony circles the nest, majors first, and ignores food', () => {
    const w = colony(1, 200, 6);
    w.placeFood('berry', NEST.x + 90, NEST.y);
    run(w, 20);
    const guards = w.ants.filter((a) => a.role === 'guard');
    expect(guards).toHaveLength(Math.floor(200 * GUARD_FRACTION));
    expect(guards.filter((a) => a.major).length).toBe(6); // the 6 majors are all on guard
    const ring = GUARD_R_MIN + 4 * GUARD_R_STEP;
    run(w, 20);
    for (const g of guards) {
      expect(g.state).toBe('wander'); // no food, no carrying
      expect(Math.hypot(g.x - NEST.x, g.y - NEST.y)).toBeLessThan(ring + 25);
    }
  });

  it('a small colony has no guards', () => {
    const w = colony(2, 15);
    run(w, 10);
    expect(w.ants.filter((a) => a.role === 'guard')).toHaveLength(0);
  });

  it('a guard that meets a red ant fights it', () => {
    const w = colony(3, 100);
    w.noRaid = false; // (a colony of 100 has no red nest: only the red ant put here fights)
    run(w, 10);
    const g = w.ants.find((a) => a.role === 'guard')!;
    w.reds.push({ id: 90001, x: g.x + 25, y: g.y, heading: Math.PI });
    run(w, 10);
    expect(w.redKilled + w.antsKilled).toBeGreaterThanOrEqual(1);
  });
});

describe('the red ants forage', () => {
  it('the red nest comes only from RED_NEST_MIN_ANTS black ants (1500)', () => {
    expect(RED_NEST_MIN_ANTS).toBe(1500);
    expect(RAID_MIN_ANTS).toBe(1500);
  });

  function redWorld(seed: number): World {
    const w = World.create(seed, 'normal');
    w.noSpider = true;
    w.spawnTimer = 1e9;
    w.stock = 300;
    w.terrain.surface.fill(Surface.Ground);
    w.terrain.speed.fill(1);
    w.addAnts(RED_NEST_MIN_ANTS);
    run(w, 2);
    for (const a of w.ants) { a.role = 'nurse'; a.state = 'nest'; a.nestKind = 'nurse'; } // keep the black ants out of it
    return w;
  }

  it('the red nest starts with a stock of food; every new red ant costs RED_FOOD_PER_ANT of it', () => {
    const w = redWorld(5);
    const n = w.redNest!;
    expect(RED_START_STOCK).toBe(100);
    const before = (n.stock ?? 0) + 0;
    const reds0 = w.reds.length;
    run(w, RED_TRICKLE_S * 4 + 1);
    expect(w.reds.length - reds0).toBe(4);
    expect(before - (n.stock ?? 0)).toBeCloseTo(4 * RED_FOOD_PER_ANT, 6);
  });

  it('with no food in the stock no new red ant comes out', () => {
    const w = redWorld(6);
    const n = w.redNest!;
    n.stock = 0;
    const reds0 = w.reds.length;
    run(w, RED_TRICKLE_S * 3);
    expect(w.reds.length).toBe(reds0);
  });

  it('red foragers gnaw at the food, carry a piece home slowly, hand it over and the stock grows', () => {
    const w = redWorld(7);
    const n = w.redNest!;
    n.stock = 0; // nothing is spent while we watch
    const food = w.placeFood('berry', n.x + 30, n.y)!;
    food.piecesLeft = 30;
    // a single forager next to the food: it must stand and gnaw for a while before it takes a piece
    w.reds.splice(0, w.reds.length);
    const f: RedAnt = { id: 91000, x: food.x - 1, y: food.y, heading: 0, patrol: true, job: 'forager', spd: 1, tf: food.id };
    w.reds.push(f);
    let gnawed = 0;
    let carryAt = -1;
    for (let t = 0; t < 40 / STEP_S; t++) {
      w.step(STEP_S);
      if (f.gnawT !== undefined) gnawed++;
      if (carryAt < 0 && (f.carry ?? 0) > 0) carryAt = t * STEP_S;
    }
    expect(gnawed * STEP_S).toBeGreaterThan(2.5); // it gnawed for about GNAW_S seconds
    expect(carryAt).toBeGreaterThan(2.5);
    expect(food.piecesLeft).toBeLessThan(30);
    expect(n.delivered ?? 0).toBeGreaterThan(0);
    expect(n.stock ?? 0).toBeGreaterThan(0);
  });

  it('a red forager carrying food lays red pheromone on the way home, which other red foragers follow', () => {
    const w = redWorld(8);
    const n = w.redNest!;
    w.reds.splice(0, w.reds.length);
    expect(w.redPher.sampleMax(n.x + 40, n.y, 3)).toBe(0);
    w.reds.push({ id: 91001, x: n.x + 80, y: n.y, heading: Math.PI, patrol: true, job: 'forager', spd: 1, carry: 1 });
    run(w, 6);
    expect(w.redPher.sampleMax(n.x + 60, n.y, 30)).toBeGreaterThan(0.3);
    // a seeker that starts beside the trail turns onto it
    w.reds.push({ id: 91002, x: n.x + 90, y: n.y + 14, heading: -Math.PI / 2, patrol: true, job: 'forager', spd: 1 });
    const seeker = w.reds[w.reds.length - 1];
    const d0 = Math.abs(seeker.y - n.y);
    run(w, 2);
    expect(Math.abs(seeker.y - n.y)).toBeLessThan(d0 + 1);
  });

  function huntWorld(seed: number): World {
    const w = World.create(seed, 'normal');
    w.noSpider = true;
    w.spawnTimer = 1e9;
    w.stock = 300;
    w.terrain.surface.fill(Surface.Ground);
    w.terrain.speed.fill(1);
    w.addAnts(RED_NEST_MIN_ANTS);
    run(w, 2);
    for (const a of w.ants) { a.role = 'nurse'; a.state = 'nest'; a.nestKind = 'nurse'; }
    w.reds.splice(0, w.reds.length);
    w.redNest!.stock = 0;
    return w;
  }

  it('red foragers hunt a fly: the second touch kills it and it becomes carrion', () => {
    const w = huntWorld(9);
    const n = w.redNest!;
    const fly = w.placeFood('fly', n.x + 60, n.y)!;
    const f: RedAnt = { id: 92000, x: fly.x - 1, y: fly.y, heading: 0, patrol: true, job: 'forager', spd: 1, tf: fly.id };
    w.reds.push(f);
    run(w, 25);
    expect(fly.alive).toBeFalsy();
    expect(fly.corpseOf).toBe('fly');
  });

  it('a beetle kills the first red ant that touches it, and a group of them bring it down', () => {
    const w = huntWorld(10);
    const n = w.redNest!;
    const beetle = w.placeFood('beetle', n.x + 60, n.y)!;
    beetle.speedMul = 0.01; // (it hardly moves while the reds close in)
    for (let i = 0; i < 6; i++) {
      w.reds.push({ id: 92100 + i, x: beetle.x + (i - 2.5) * 0.4, y: beetle.y - 1.5 + i * 0.1, heading: 0, patrol: true, job: 'forager', spd: 1, tf: beetle.id });
    }
    run(w, 15);
    expect(w.redKilled).toBeGreaterThanOrEqual(1); // the beetle killed the first one that touched it
    expect(beetle.alive).toBeFalsy(); // the next touch (after the cooldown) killed the beetle
    expect(beetle.corpseOf).toBe('beetle');
  });

  it('red foragers chase a caterpillar too', () => {
    const w = huntWorld(11);
    const n = w.redNest!;
    const cat = w.placeFood('caterpillar', n.x + 60, n.y)!;
    w.reds.push({ id: 92200, x: cat.x - 1, y: cat.y, heading: 0, patrol: true, job: 'forager', spd: 1, tf: cat.id });
    run(w, 40);
    expect(cat.alive).toBeFalsy();
    expect(cat.corpseOf).toBe('caterpillar');
  });
});

describe('the guard slider (division of labour)', () => {
  it('guardFraction sets how many ants guard: more, fewer, none', () => {
    const w = colony(1, 200);
    w.guardFraction = 0.2;
    run(w, 20);
    expect(w.ants.filter((a) => a.role === 'guard')).toHaveLength(40);
    w.guardFraction = 0.05;
    run(w, 5);
    expect(w.ants.filter((a) => a.role === 'guard')).toHaveLength(10);
    w.guardFraction = 0;
    run(w, 5);
    expect(w.ants.filter((a) => a.role === 'guard')).toHaveLength(0);
  });

  it('it is saved with the game and an old save gets the default', () => {
    const w = colony(1, 30);
    w.guardFraction = 0.17;
    const save = worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } });
    expect(worldFromSave(JSON.parse(JSON.stringify(save))).guardFraction).toBeCloseTo(0.17);
    const old = JSON.parse(JSON.stringify(save));
    delete old.guardFraction;
    expect(worldFromSave(old).guardFraction).toBe(GUARD_FRACTION);
  });
});

describe('player pheromone marks', () => {
  it('a lure puts strong pheromone on the ground, off the map it does nothing', () => {
    const w = colony(1, 5);
    expect(w.placeLure(150, 100)).toBe(true);
    expect(w.pher.sample(150, 100)).toBeGreaterThan(4);
    expect(w.pher.sample(150 + 4, 100)).toBeGreaterThan(4);
    expect(w.placeLure(-5, 10)).toBe(false);
  });

  it('a no-entry mark makes wanderers steer around it, expires, and only REPEL_MAX stay', () => {
    const w = colony(2, 0);
    w.fixedSeason = 0;
    const a = w.spawnAnt();
    a.age = 500;
    a.state = 'wander';
    a.x = 300;
    a.y = 200;
    a.heading = 0; // east, straight at the mark
    w.placeRepel(340, 200);
    let inside = 0;
    for (let i = 0; i < 400; i++) {
      w.step(STEP_S);
      if (Math.hypot(a.x - 340, a.y - 200) < 10) inside++;
    }
    expect(inside).toBe(0);
    for (let i = 0; i < 10; i++) w.placeRepel(100 + i, 100);
    expect(w.repels.length).toBe(5);
    run(w, 100);
    expect(w.repels.length).toBe(0);
  });
});

describe('hatch focus', () => {
  function hatchMany(focus: 'mix' | 'majors' | 'workers'): number {
    const w = colony(5, 200);
    w.hatchFocus = focus;
    w.stock = 400;
    run(w, 400);
    return w.ants.filter((a) => a.major).length / w.ants.length;
  }
  it('majors focus gives clearly more majors than the mix, workers focus none', () => {
    const mix = hatchMany('mix');
    const majors = hatchMany('majors');
    expect(majors).toBeGreaterThan(mix);
    expect(hatchMany('workers')).toBe(0);
  });
  it('is saved with the game', () => {
    const w = colony(1, 30);
    w.hatchFocus = 'majors';
    const save = worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } });
    expect(worldFromSave(JSON.parse(JSON.stringify(save))).hatchFocus).toBe('majors');
  });
});

describe('the second nest', () => {
  it('needs enough ants, food and distance; only one; costs food', () => {
    const small = colony(1, 20);
    expect(small.foundNest(300, 100)).toBe(false); // too few ants
    const w = colony(1, 100);
    w.stock = 100;
    expect(w.foundNest(NEST.x + 20, NEST.y)).toBe(false); // too close to the first nest
    w.stock = 5;
    expect(w.foundNest(300, 100)).toBe(false); // too little food
    w.stock = 100;
    expect(w.foundNest(300, 100)).toBe(true);
    expect(w.stock).toBeCloseTo(100 - SATELLITE_COST);
    expect(w.satellite).not.toBeNull();
    expect(w.foundNest(250, 60)).toBe(false); // only one
  });

  it('a carrier near it delivers there and comes out there; it is saved', () => {
    const w = colony(1, 100);
    w.stock = 100;
    w.foundNest(300, 100);
    const sat = w.satellite!;
    const a = w.ants[0];
    a.state = 'carry';
    a.carry = 1;
    a.x = sat.x + 10;
    a.y = sat.y;
    a.role = 'forager';
    const before = w.stock;
    run(w, 6);
    expect(w.stock).toBeGreaterThan(before);
    // it did not walk all the way to the first nest: it is still around the satellite
    expect(Math.hypot(a.x - sat.x, a.y - sat.y)).toBeLessThan(80);
    const save = worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } });
    expect(worldFromSave(JSON.parse(JSON.stringify(save))).satellite).toEqual(sat);
  });
});

describe('controlling one ant', () => {
  it('an ant sent across the map walks there, ignoring food on the way, then goes on as before', () => {
    const w = colony(2, 0);
    w.fixedSeason = 0;
    const a = w.spawnAnt();
    a.age = 500;
    a.state = 'wander';
    a.x = 40;
    a.y = 40;
    w.placeFood('berry', 60, 40); // right on its way
    expect(w.sendAnt(a.id, 300, 150)).toBe(true);
    let arrived = -1;
    for (let i = 0; i < Math.round(300 / STEP_S); i++) {
      w.step(STEP_S);
      if (a.goal === undefined) {
        arrived = i * STEP_S;
        break;
      }
    }
    expect(arrived).toBeGreaterThan(0);
    expect(Math.hypot(a.x - 300, a.y - 150)).toBeLessThan(6);
  });

  it('pickAnt finds the nearest surface ant; sendAnt refuses nest ants and unknown ids', () => {
    const w = colony(3, 3);
    const a = w.ants[0];
    a.state = 'wander';
    a.x = 100;
    a.y = 100;
    for (const o of w.ants.slice(1)) {
      o.x = 10;
      o.y = 10;
    }
    expect(w.pickAnt(102, 100, 5)?.id).toBe(a.id);
    expect(w.pickAnt(150, 150, 5)).toBeNull();
    a.state = 'nest';
    expect(w.pickAnt(100, 100, 5)).toBeNull();
    expect(w.sendAnt(a.id, 50, 50)).toBe(false);
    expect(w.sendAnt(99999, 50, 50)).toBe(false);
  });

  it('the order is not saved', () => {
    const w = colony(1, 5);
    w.ants[0].state = 'wander';
    w.sendAnt(w.ants[0].id, 100, 100);
    const save = worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } });
    expect(JSON.stringify(save)).not.toContain('"goal"');
  });
});

describe('mushroom gardens', () => {
  /** Stock gained by `gardens` gardens over 60 s compared with an identical colony without any (the queens eat stock meanwhile). */
  function gain(season: number, gardens: number): number {
    const mk = (): World => {
      const w = colony(1, 40);
      w.fixedSeason = season;
      w.stock = 100;
      w.gardens = 0;
      return w;
    };
    const a = mk();
    const b = mk();
    b.gardens = gardens;
    run(a, 60);
    run(b, 60);
    return b.stock - a.stock;
  }

  it('cost food, need ants, are capped and are saved', () => {
    const w = colony(1, 40);
    w.fixedSeason = 1;
    w.stock = 100;
    expect(w.buyGarden()).toBe(true);
    expect(w.stock).toBeCloseTo(60);
    w.stock = 500;
    expect(w.buyGarden()).toBe(true);
    expect(w.buyGarden()).toBe(true);
    expect(w.buyGarden()).toBe(false); // at most GARDEN_MAX
    expect(colony(1, 10).buyGarden()).toBe(false); // too few ants
    const save = worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } });
    expect(worldFromSave(JSON.parse(JSON.stringify(save))).gardens).toBe(3);
  });

  it('they grow food, twice as much in winter', () => {
    const summer = gain(1, 1);
    expect(summer).toBeGreaterThan(3);
    expect(gain(3, 1)).toBeGreaterThan(summer * 1.7);
  });
});

describe('research tree', () => {
  it('a node needs the one it hangs from, costs food and is bought once; it is saved', () => {
    const w = colony(1, 20);
    w.stock = 1000;
    expect(w.buyResearch('g2')).toBe(false); // g1 first
    expect(w.buyResearch('g1')).toBe(true);
    expect(w.stock).toBeCloseTo(970);
    expect(w.buyResearch('g1')).toBe(false); // only once
    expect(w.buyResearch('g2')).toBe(true);
    expect(w.buyResearch('g3')).toBe(true);
    expect(w.buyResearch('g4')).toBe(true); // a branch hangs from g3
    expect(w.buyResearch('g5')).toBe(true);
    expect(w.researchLevel('g')).toBe(3);
    expect(w.buyResearch('zzz')).toBe(false);
    w.stock = 10;
    expect(w.buyResearch('h1')).toBe(false); // too little food
    const save = worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } });
    const back = worldFromSave(JSON.parse(JSON.stringify(save)));
    expect([...back.unlocked].sort()).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
  });

  it('smell: ants notice food from further; carry 2: workers take two pieces', () => {
    const near = (lvl: number): boolean => {
      const w = colony(2, 0);
      w.fixedSeason = 0;
      for (let i = 1; i <= lvl; i++) w.unlocked.add(`g${i}`);
      const a = w.spawnAnt();
      a.age = 500;
      a.state = 'wander';
      a.x = 100;
      a.y = 100;
      w.placeFood('berry', 100 + 40, 100); // 40 px: beyond the base sense of 32 px, inside 40 at level 1
      w.step(STEP_S);
      return (a.state as string) === 'toFood';
    };
    expect(near(0)).toBe(false);
    expect(near(1)).toBe(true);

    const take = (lvl: number): number => {
      const w = colony(3, 0);
      w.fixedSeason = 0;
      for (let i = 1; i <= lvl; i++) w.unlocked.add(`h${i}`);
      const a = w.spawnAnt();
      const f = w.placeFood('berry', 100, 100)!;
      a.state = 'gnaw';
      a.targetFood = f.id;
      a.timer = 0;
      a.x = 100;
      a.y = 100;
      w.step(STEP_S);
      return a.carry;
    };
    expect(take(0)).toBeCloseTo(1);
    expect(take(2)).toBeCloseTo(2);
  });

  it('the branches: stronger trail, faster hatching, a fourth garden, no winter slowdown', () => {
    const w = colony(4, 40);
    w.fixedSeason = 1;
    const hatch = w.hatchInterval;
    for (const id of ['n1', 'n2', 'n3']) w.unlocked.add(id);
    expect(w.hatchInterval).toBeCloseTo(hatch * 0.92 ** 3);
    expect(w.gardenMax).toBe(3);
    w.unlocked.add('n4');
    expect(w.gardenMax).toBe(4);
    // winter slows an ant by WINTER_SPEED_MUL, unless the winter coat (n5) is bought
    const walked = (coat: boolean): number => {
      const v = colony(5, 0);
      v.noGuards = true;
      v.fixedSeason = 3;
      if (coat) v.unlocked.add('n5');
      const a = v.spawnAnt();
      a.age = 500;
      a.state = 'wander';
      a.x = 160;
      a.y = 100;
      a.heading = 0;
      const x0 = a.x;
      const y0 = a.y;
      run(v, 5);
      return Math.hypot(a.x - x0, a.y - y0);
    };
    expect(walked(true)).toBeGreaterThan(walked(false) * 1.15);
  });
});

describe('red ants spit acid', () => {
  function duelWorld(seed: number): { w: World; red: RedAnt; ant: ReturnType<World['spawnAnt']> } {
    const w = colony(seed, 0);
    w.fixedSeason = 0;
    w.noGuards = true;
    w.noRaid = false; // the red ants move in the raid update
    const ant = w.spawnAnt();
    ant.age = 500;
    ant.state = 'wander';
    ant.x = 150;
    ant.y = 100;
    const red: RedAnt = { id: 99001, x: 140, y: 100, heading: 0 };
    w.reds.push(red);
    return { w, red, ant };
  }

  it('a red ant with a black one ahead squirts acid: the black ant is slowed and the red ant has a cooldown', () => {
    let sprayed = false;
    for (let seed = 1; seed <= 6 && !sprayed; seed++) {
      const { w, red, ant } = duelWorld(seed);
      ant.speedMul = 1;
      for (let i = 0; i < 40; i++) {
        w.step(STEP_S);
        if (ant.acidT !== undefined) {
          sprayed = true;
          expect(red.sprayCd).toBeGreaterThan(0);
          expect(ant.acidT).toBeLessThanOrEqual(ACID_S);
          break;
        }
      }
    }
    expect(sprayed).toBe(true);
  });

  it('acid lasts ACID_S seconds, slows to ACID_SLOW and is not saved', () => {
    const w = colony(7, 0);
    w.fixedSeason = 0;
    w.noGuards = true;
    const a = w.spawnAnt();
    a.age = 500;
    a.state = 'wander';
    a.x = 100;
    a.y = 100;
    a.acidT = ACID_S;
    const slow = (acid: boolean): number => {
      const v = colony(8, 0);
      v.fixedSeason = 0;
      v.noGuards = true;
      const q = v.spawnAnt();
      q.age = 500;
      q.state = 'wander';
      q.x = 40;
      q.y = 100;
      q.heading = 0;
      if (acid) q.acidT = ACID_S;
      const x0 = q.x;
      const y0 = q.y;
      run(v, 4);
      return Math.hypot(q.x - x0, q.y - y0);
    };
    expect(slow(true)).toBeLessThan(slow(false) * 0.6);
    run(w, ACID_S + 1);
    expect(a.acidT).toBeUndefined();
    a.acidT = 5;
    const save = worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 1 } });
    expect(JSON.stringify(save)).not.toContain('acidT');
  });

  it('an acid-covered black ant wins a duel half as often', () => {
    const wins = (acid: boolean): number => {
      let n = 0;
      for (let seed = 1; seed <= 120; seed++) {
        const { w, red, ant } = duelWorld(seed);
        red.x = 148.5; // already in reach: the duel starts at once
        if (acid) ant.acidT = ACID_S;
        const before = w.reds.length;
        for (let i = 0; i < Math.round(3 / STEP_S); i++) w.step(STEP_S);
        if (w.reds.length < before) n++;
      }
      return n;
    };
    const normal = wins(false);
    const sick = wins(true);
    expect(normal).toBeGreaterThan(40);
    expect(sick).toBeLessThan(normal * 0.75);
  });
});
