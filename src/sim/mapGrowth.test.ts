import { describe, expect, it } from 'vitest';
import { EXPLORE_CELL, MAP_STEP_ANTS, MAX_ANTS_NORMAL, MAX_MAP_STEP, STEP_S } from './constants';
import { terrainSize } from './terrain';
import { World } from './world';

/** Adds n ants that stay underground for a while (cheap to update, never leave the nest during the test). */
function addAnts(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.spawnAnt(true);
}

describe('map growth', () => {
  it('growMapTo(3) equals three single steps', () => {
    const a = World.create(11, 'normal');
    const b = World.create(11, 'normal');
    a.growMapTo(3);
    b.growMapTo(1);
    b.growMapTo(2);
    b.growMapTo(3);
    for (const w of [a, b]) {
      expect(w.mapStep).toBe(3);
      expect(w.mapVersion).toBe(3);
      expect(w.terrain.w).toBe(terrainSize(3).w);
      expect(w.terrain.h).toBe(terrainSize(3).h);
      expect(w.pher.w).toBe(w.terrain.w);
      expect(w.pher.h).toBe(w.terrain.h);
    }
    expect(Array.from(a.terrain.surface)).toEqual(Array.from(b.terrain.surface));
    expect(a.terrain.features).toEqual(b.terrain.features);
  });

  it('the map keeps growing with the colony all the way to the ant limit (2000 ants)', () => {
    expect(MAX_MAP_STEP * MAP_STEP_ANTS).toBe(MAX_ANTS_NORMAL);
  });

  it('a lower or equal step is a no-op, and growth stops at MAX_MAP_STEP', () => {
    const w = World.create(4, 'normal');
    w.growMapTo(2);
    const terrain = w.terrain;
    const pher = w.pher;
    w.growMapTo(2);
    w.growMapTo(1);
    w.growMapTo(0);
    expect(w.mapStep).toBe(2);
    expect(w.mapVersion).toBe(2);
    expect(w.terrain).toBe(terrain);
    expect(w.pher).toBe(pher);
    w.growMapTo(MAX_MAP_STEP + 10);
    expect(w.mapStep).toBe(MAX_MAP_STEP);
    expect(w.mapVersion).toBe(MAX_MAP_STEP);
    expect(w.terrain.w).toBe(terrainSize(MAX_MAP_STEP).w);
  });

  it('growth replaces terrain and pheromone with new objects', () => {
    const w = World.create(4, 'normal');
    const terrain = w.terrain;
    const pher = w.pher;
    w.growMapTo(1);
    expect(w.terrain).not.toBe(terrain);
    expect(w.pher).not.toBe(pher);
  });

  it('ants grow the map in normal mode', () => {
    const w = World.create(5, 'normal');
    addAnts(w, 250);
    for (let i = 0; i < 10; i++) w.step(STEP_S);
    expect(w.mapStep).toBe(2);
    // Fewer ants never shrink the map.
    w.ants.length = 20;
    for (let i = 0; i < 10; i++) w.step(STEP_S);
    expect(w.mapStep).toBe(2);
    // Never beyond MAX_MAP_STEP.
    addAnts(w, (MAX_MAP_STEP + 3) * MAP_STEP_ANTS);
    for (let i = 0; i < 30; i++) w.step(STEP_S);
    expect(w.mapStep).toBe(MAX_MAP_STEP);
    expect(w.terrain.w).toBe(terrainSize(MAX_MAP_STEP).w);
  });

  it('grows at most one step per substep', () => {
    const w = World.create(5, 'normal');
    addAnts(w, 5 * MAP_STEP_ANTS);
    w.step(STEP_S);
    expect(w.mapStep).toBe(1);
    w.step(STEP_S);
    expect(w.mapStep).toBe(2);
  });

  it('sandbox map never grows', () => {
    const w = World.create(5, 'sandbox');
    addAnts(w, 300);
    for (let i = 0; i < 30; i++) w.step(STEP_S);
    expect(w.mapStep).toBe(0);
    expect(w.mapVersion).toBe(0);
    expect(w.terrain.w).toBe(terrainSize(0).w);
    expect(w.terrain.h).toBe(terrainSize(0).h);
  });

  it('growth does not consume the world rng', () => {
    const a = World.create(8, 'normal');
    const b = World.create(8, 'normal');
    a.growMapTo(4);
    for (let i = 0; i < 5; i++) expect(a.rng.next()).toBe(b.rng.next());
  });

  it('explored grid covers the new map', () => {
    const w = World.create(6, 'normal');
    const cw0 = Math.ceil(w.terrain.w / EXPLORE_CELL);
    w.explored[3 * cw0 + 7] = 2.5;
    w.explored[cw0 * Math.ceil(w.terrain.h / EXPLORE_CELL) - 1] = 1.5; // last cell of the old grid
    const lastX = cw0 - 1;
    const lastY = Math.ceil(w.terrain.h / EXPLORE_CELL) - 1;
    w.growMapTo(3);
    const cw = Math.ceil(w.terrain.w / EXPLORE_CELL);
    const ch = Math.ceil(w.terrain.h / EXPLORE_CELL);
    expect(w.explored.length).toBe(cw * ch);
    expect(w.explored[3 * cw + 7]).toBe(2.5);
    expect(w.explored[lastY * cw + lastX]).toBe(1.5);
    let sum = 0;
    for (const v of w.explored) sum += v;
    expect(sum).toBe(4);
  });

  it('ants, food and pheromone keep their coordinates after growth', () => {
    const w = World.create(12, 'normal');
    addAnts(w, 5);
    const berry = w.placeFood('berry', 200, 60)!;
    w.pher.deposit(100, 80, 3);
    const before = w.ants.map((a) => ({ x: a.x, y: a.y }));
    const food = { x: berry.x, y: berry.y };
    w.growMapTo(2);
    expect(w.ants.map((a) => ({ x: a.x, y: a.y }))).toEqual(before);
    expect({ x: berry.x, y: berry.y }).toEqual(food);
    expect(w.food[0]).toBe(berry);
    expect(w.pher.sample(100, 80)).toBe(3);
  });
});
