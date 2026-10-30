import { describe, expect, it } from 'vitest';
import { dropInterval } from './aphids';
import {
  APHID_DROP_MIN_S, APHID_MAX, APHID_START, BUSH_MIN_ANTS, HONEY_MAX_ITEMS, NEST, STEP_S,
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

  it('the more aphids, the sooner the honeydew falls', () => {
    expect(dropInterval(3)).toBeGreaterThan(dropInterval(10));
    expect(dropInterval(1000)).toBe(APHID_DROP_MIN_S);
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

  it('every so often a drop of honeydew falls by the bush, at most HONEY_MAX_ITEMS at a time', () => {
    const w = normalWorld(6);
    w.bush = { x: 100, y: 40, aphids: APHID_MAX, dropT: 0.1 };
    run(w, 1);
    expect(w.food.filter((f) => f.kind === 'honeydew')).toHaveLength(1);
    run(w, APHID_DROP_MIN_S * (HONEY_MAX_ITEMS + 3));
    expect(w.food.filter((f) => f.kind === 'honeydew')).toHaveLength(HONEY_MAX_ITEMS);
  });

  it('honeydew is ordinary food: an ant carries it to the nest', () => {
    const w = normalWorld(7);
    w.stock = 0;
    const d = w.placeFood('honeydew', NEST.x + 20, NEST.y)!;
    const a = w.spawnAnt();
    a.x = d.x;
    a.y = d.y + 2;
    run(w, 40);
    expect(w.totalDelivered).toBeGreaterThan(0);
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
