import { describe, expect, it } from 'vitest';
import { NEST, SUGAR_BOOST_MUL, SUGAR_BOOST_S, SUGAR_COOLDOWN_S } from './constants';
import { FOOD_TABLE } from './food';
import { Surface } from './terrain';
import { World, type Ant } from './world';

function flatWorld(mode: 'sandbox' | 'normal' = 'normal'): World {
  const w = World.create(1, mode);
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

/** An ant on the nest edge, carrying (sugar or other food), about to deliver. */
function deliverer(w: World, sugar: boolean): Ant {
  const a = w.spawnAnt();
  a.x = NEST.x + NEST.r - 0.5;
  a.y = NEST.y;
  a.state = 'carry';
  a.carry = 1;
  if (sugar) a.carrySugar = true;
  return a;
}

describe('sugar', () => {
  it('constants and table', () => {
    expect(SUGAR_COOLDOWN_S).toBe(300);
    expect(SUGAR_BOOST_S).toBe(60);
    expect(SUGAR_BOOST_MUL).toBe(1.5);
    expect(FOOD_TABLE.sugar).toEqual({ pieces: 6, value: 1 });
  });

  it('placeSugar works only in normal mode', () => {
    const w = flatWorld('sandbox');
    expect(w.placeSugar(100, 100)).toBeNull();
    expect(w.food.length).toBe(0);
  });

  it('placeSugar starts a 300 s cooldown', () => {
    const w = flatWorld();
    expect(w.sugarCooldownLeft).toBe(0);
    const item = w.placeSugar(100, 100);
    expect(item).not.toBeNull();
    expect(item!.kind).toBe('sugar');
    expect(w.sugarCooldownLeft).toBe(300);
    expect(w.placeSugar(110, 110)).toBeNull();
    w.time += 299;
    expect(w.placeSugar(110, 110)).toBeNull();
    w.time += 1;
    expect(w.sugarCooldownLeft).toBe(0);
    expect(w.placeSugar(110, 110)).not.toBeNull();
  });

  it('a gnawing ant that takes sugar becomes a sugar carrier', () => {
    const w = flatWorld();
    const item = w.placeSugar(100, 100)!;
    const a = w.spawnAnt();
    a.x = item.x;
    a.y = item.y;
    a.state = 'gnaw';
    a.targetFood = item.id;
    a.timer = 0;
    w.step(0.1);
    expect(a.state).toBe('carry');
    expect(a.carrySugar).toBe(true);
  });

  it('a major takes one piece of sugar', () => {
    const w = flatWorld();
    const item = w.placeSugar(100, 100)!;
    const a = w.spawnAnt();
    item.piecesLeft = 1; // a major takes up to 2 pieces, so leave exactly one
    a.major = true;
    a.x = item.x;
    a.y = item.y;
    a.state = 'gnaw';
    a.targetFood = item.id;
    a.timer = 0;
    w.step(0.1);
    expect(a.carry).toBe(1);
    expect(a.carrySugar).toBe(true);
  });

  it('delivering sugar starts a 60 s boost', () => {
    const w = flatWorld();
    expect(w.boostLeft).toBe(0);
    const a = deliverer(w, true);
    w.step(0.1);
    expect(a.state).toBe('nest');
    expect(a.carrySugar).toBeUndefined();
    expect(w.boostLeft).toBeGreaterThan(SUGAR_BOOST_S - 0.5);
    expect(w.boostLeft).toBeLessThanOrEqual(SUGAR_BOOST_S);
  });

  it('second sugar during boost refreshes, does not add', () => {
    const w = flatWorld();
    deliverer(w, true);
    w.step(0.1);
    w.time += 30;
    expect(w.boostLeft).toBeLessThan(31);
    deliverer(w, true);
    w.step(0.1);
    expect(w.boostLeft).toBeGreaterThan(SUGAR_BOOST_S - 0.5);
    expect(w.boostLeft).toBeLessThanOrEqual(SUGAR_BOOST_S);
  });

  it('delivering other food does not boost', () => {
    const w = flatWorld();
    deliverer(w, false);
    w.step(0.1);
    expect(w.boostLeft).toBe(0);
  });

  it('boost speeds every ant by 1.5', () => {
    const dist = (boosted: boolean): number => {
      const w = flatWorld();
      if (boosted) w.boostUntil = w.time + 1000;
      const a = w.spawnAnt();
      a.x = 100;
      a.y = 100;
      a.heading = 0;
      a.speedMul = 1;
      a.state = 'wander';
      (w as unknown as { move(a: Ant, d: number, p: number): number }).move(a, 0, 0);
      return Math.hypot(a.x - 100, a.y - 100);
    };
    const base = dist(false);
    expect(base).toBeGreaterThan(0);
    expect(dist(true) / base).toBeCloseTo(SUGAR_BOOST_MUL, 5);
  });
});
