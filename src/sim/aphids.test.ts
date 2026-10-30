import { describe, expect, it } from 'vitest';
import {
  APHID_HONEY_S, APHID_MAX, APHID_START, BUSH_MIN_ANTS, BUSH_SENSE, STEP_S,
} from './constants';
import { FOOD_TABLE } from './food';
import { validateSave, worldFromSave, worldToSave } from './serialize';
import { Surface } from './terrain';
import { World } from './world';

function normalWorld(seed = 1): World {
  const w = World.create(seed, 'normal');
  w.noSpider = true;
  w.spawnTimer = 1e9; // no spontaneous prey
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

function run(w: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP_S); i++) w.step(STEP_S);
}

describe('the aphids bush', () => {
  it('appears only with a colony of BUSH_MIN_ANTS ants, with a few aphids', () => {
    const w = normalWorld(2);
    w.addAnts(BUSH_MIN_ANTS - 1);
    run(w, 1);
    expect(w.bush).toBeNull();
    w.addAnts(1);
    run(w, 1);
    expect(w.bush).not.toBeNull();
    expect(w.bush!.aphids).toBe(APHID_START);
  });

  it('ants bring leaves to the bush and every leaf unit adds an aphid', () => {
    const w = normalWorld(3);
    w.bush = { x: 100, y: 100, aphids: APHID_START, dropT: 1e9 };
    const leaf = w.placeFood('leaf', 120, 100)!;
    for (let i = 0; i < 4; i++) {
      const a = w.spawnAnt();
      a.x = 118;
      a.y = 100 + i;
    }
    run(w, 90);
    const eaten = FOOD_TABLE.leaf.pieces - leaf.piecesLeft;
    expect(eaten).toBeGreaterThan(0);
    expect(w.bush!.aphids).toBe(Math.min(APHID_MAX, APHID_START + eaten));
    expect(w.bush!.aphids).toBeGreaterThan(APHID_START);
  });

  it('ants ignore leaves while there is no bush (they are for the caterpillars)', () => {
    const w = normalWorld(4);
    const leaf = w.placeFood('leaf', 120, 100)!;
    const a = w.spawnAnt();
    a.x = 120;
    a.y = 102;
    run(w, 10);
    expect(a.state).toBe('wander');
    expect(leaf.piecesLeft).toBe(FOOD_TABLE.leaf.pieces);
  });

  it('the aphids never exceed APHID_MAX', () => {
    const w = normalWorld(5);
    w.bush = { x: 100, y: 100, aphids: APHID_MAX - 1, dropT: 1e9 };
    const a = w.spawnAnt();
    a.x = 100;
    a.y = 102;
    a.state = 'carry';
    a.carryLeaf = 6;
    run(w, 3);
    expect(w.bush!.aphids).toBe(APHID_MAX);
  });

  it('every aphid makes one drop of honeydew per APHID_HONEY_S seconds and holds at most one', () => {
    const w = normalWorld(6);
    w.bush = { x: 100, y: 40, aphids: APHID_START, dropT: 0 };
    run(w, 5);
    expect(w.food.filter((f) => f.kind === 'honeydew')).toHaveLength(0);
    run(w, 10); // 3 aphids make a drop every 10 s in all
    const honey = w.food.find((f) => f.kind === 'honeydew')!;
    expect(honey.x).toBe(100);
    expect(honey.piecesLeft).toBe(1);
    run(w, APHID_HONEY_S - 14);
    expect(honey.piecesLeft).toBe(APHID_START); // one drop per aphid after APHID_HONEY_S
    run(w, 3 * APHID_HONEY_S);
    expect(honey.piecesLeft).toBe(APHID_START); // no aphid holds a second drop
  });

  it('ants lick the honeydew off the aphids from afar and carry it to the nest', () => {
    const w = normalWorld(7);
    w.stock = 0;
    w.bush = { x: 140, y: 120, aphids: APHID_START, dropT: 0 };
    run(w, APHID_HONEY_S + 1);
    const honey = w.food.find((f) => f.kind === 'honeydew')!;
    expect(honey.piecesLeft).toBe(APHID_START);
    const a = w.spawnAnt();
    a.x = 140 - BUSH_SENSE;
    a.y = 120;
    a.heading = 0;
    run(w, 90);
    expect(w.totalDelivered).toBeGreaterThan(0);
    expect(honey.piecesLeft).toBeLessThan(APHID_START + 1);
  });

  it('the bush survives a save and a load', () => {
    const w = normalWorld(8);
    w.bush = { x: 123, y: 77, aphids: 7, dropT: 12.5 };
    const save = JSON.parse(JSON.stringify(worldToSave(w, { introDone: true, camera: { x: 0, y: 0, zoom: 4 } })));
    const valid = validateSave(save);
    expect(valid).not.toBeNull();
    expect(worldFromSave(valid!).bush).toEqual({ x: 123, y: 77, aphids: 7, dropT: 12.5 });
    expect(validateSave({ ...save, bush: { x: 1, y: 1, aphids: 99, dropT: 1 } })).toBeNull();
  });
});
