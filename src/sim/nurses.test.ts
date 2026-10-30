import { describe, expect, it } from 'vitest';
import {
  FOOD_PER_ANT, FOOD_PER_QUEEN, LARVAE_PER_NURSE, NEST, NURSE_EVAL_S, NURSE_MAX_FRACTION, NURSES_PER_QUEEN, STEP_S,
} from './constants';
import { validateSave, worldFromSave, worldToSave, type SaveV1 } from './serialize';
import { Surface } from './terrain';
import { World, type Ant } from './world';

const EXTRA = { introDone: true, camera: { x: 0, y: 0, zoom: 1 } };

function flatWorld(seed = 1): World {
  const w = World.create(seed);
  w.stock = 0;
  w.terrain.surface.fill(Surface.Ground);
  w.terrain.speed.fill(1);
  return w;
}

/** `ants` surface wanderers, `queens` queens, `larvae` fed larvae; nothing stepped. */
function colony(ants: number, queens: number, larvae: number, seed = 1): World {
  const w = flatWorld(seed);
  for (let i = 0; i < ants; i++) w.spawnAnt();
  w.totalDelivered = (queens - 1) * FOOD_PER_QUEEN;
  w.stock = larvae * FOOD_PER_ANT;
  return w;
}

function run(w: World, seconds: number): void {
  const n = Math.round(seconds / STEP_S);
  for (let i = 0; i < n; i++) w.step(STEP_S);
}

/** Turns an existing ant into a hatchling / unloader / nurse inside the nest. */
function intoNest(a: Ant, kind: 'hatch' | 'unload' | 'nurse', timer: number): Ant {
  a.state = 'nest';
  a.nestKind = kind;
  a.timer = kind === 'nurse' ? 0 : timer;
  a.role = kind === 'nurse' ? 'nurse' : 'forager';
  a.targetFood = null;
  return a;
}

describe('desired nurses', () => {
  it('constants', () => {
    expect(NURSES_PER_QUEEN).toBe(2);
    expect(LARVAE_PER_NURSE).toBe(5);
    expect(NURSE_MAX_FRACTION).toBe(0.3);
    expect(NURSE_EVAL_S).toBe(2);
  });

  it('min(queens * 2 + ceil(larvae / 5), floor(ants * 0.3)) at several states', () => {
    const table: [ants: number, queens: number, larvae: number, want: number][] = [
      [10, 1, 0, 2], // min(2, 3)
      [3, 1, 0, 0], // floor(0.9) = 0
      [100, 3, 12, 9], // min(6 + 3, 30)
      [10, 1, 1, 3], // min(2 + 1, 3)
      [10, 1, 6, 3], // min(2 + 2, 3): capped by the fraction
      [100, 8, 0, 16], // 8 queens
      [20, 1, 0, 2],
      [0, 1, 0, 0],
      [1, 1, 0, 0],
      [4, 1, 0, 1], // min(2, floor(1.2) = 1)
    ];
    for (const [ants, queens, larvae, want] of table) {
      const w = colony(ants, queens, larvae);
      expect(w.queens).toBe(queens);
      expect(w.larvae).toBe(larvae);
      expect(w.desiredNurses, `${ants} ants, ${queens} queens, ${larvae} larvae`).toBe(want);
    }
  });

  it('the fraction cap floors n * 0.3 exactly (3 -> 0, 4 -> 1, 9 -> 2, 10 -> 3, 20 -> 6, 30 -> 9, 70 -> 21)', () => {
    const w = colony(0, 8, 40); // need = 16 + 8 = 24: always above the cap tested here
    const want: [number, number][] = [[3, 0], [4, 1], [6, 1], [7, 2], [9, 2], [10, 3], [20, 6], [30, 9], [60, 18], [70, 21]];
    for (const [n, cap] of want) {
      while (w.ants.length < n) w.spawnAnt();
      expect(w.desiredNurses, `${n} ants`).toBe(cap);
    }
  });

  it('nurses counts ants with role nurse', () => {
    const w = colony(5, 1, 0);
    expect(w.nurses).toBe(0);
    intoNest(w.ants[0], 'nurse', 0);
    intoNest(w.ants[1], 'nurse', 0);
    expect(w.nurses).toBe(2);
  });
});

describe('nurse promotion and demotion', () => {
  it('no promotion before 2 s of sim time have passed; then the colony catches up (hatchlings inside become nurses)', () => {
    const w = colony(10, 1, 0, 2); // wants 2
    const h = intoNest(w.ants[0], 'hatch', 100);
    const h2 = intoNest(w.ants[1], 'hatch', 100);
    run(w, 1.8);
    expect(w.nurses).toBe(0);
    run(w, 0.4);
    expect(w.nurses).toBe(2);
    for (const a of [h, h2]) {
      expect(a.role).toBe('nurse');
      expect(a.state).toBe('nest');
      expect(a.nestKind).toBe('nurse');
      expect(a.targetFood).toBeNull();
    }
  });

  it('re-evaluates every 2 s, not every substep: a change in the wanted count shows at the next 2 s mark', () => {
    const w = colony(10, 1, 0, 3);
    for (let i = 0; i < 4; i++) intoNest(w.ants[i], 'hatch', 1000);
    run(w, 2.1);
    expect(w.nurses).toBe(2);
    w.totalDelivered = 100; // 2 queens: wants min(4, 3) = 3
    run(w, 0.5); // 2.6 s, next mark at 4 s
    expect(w.nurses).toBe(2);
    run(w, 1.6); // 4.2 s
    expect(w.nurses).toBe(3);
  });

  it('promotion prefers hatchlings (soonest to emerge first), then unloading ants; surface ants are never promoted', () => {
    const w = colony(10, 1, 6, 4); // wants min(2 + 2, 3) = 3
    const unload1 = intoNest(w.ants[0], 'unload', 500);
    const hatchLate = intoNest(w.ants[1], 'hatch', 900);
    const hatchSoon = intoNest(w.ants[2], 'hatch', 400);
    const unload2 = intoNest(w.ants[3], 'unload', 300);
    w.stock = 6 * FOOD_PER_ANT;
    w.started = false; // no hatching: only the nurse rule acts
    run(w, 2.1);
    expect(w.nurses).toBe(3);
    expect(hatchSoon.role).toBe('nurse');
    expect(hatchLate.role).toBe('nurse');
    expect(unload2.role).toBe('nurse'); // the unloader closer to emerging
    expect(unload1.role).toBe('forager');
    expect(w.ants.slice(4).every((a) => a.role === 'forager' && a.state !== 'nest')).toBe(true);
  });

  it('with nobody inside the nest nobody is promoted (surface ants are left alone)', () => {
    const w = colony(10, 1, 0, 5);
    w.started = false;
    run(w, 10);
    expect(w.nurses).toBe(0);
    expect(w.antsInNest).toBe(0);
  });

  it('a promoted unloader loses its food target', () => {
    const w = colony(10, 1, 0, 6);
    const f = w.placeFood('berry', 150, 100)!;
    const u = intoNest(w.ants[0], 'unload', 50);
    u.targetFood = f.id;
    run(w, 2.1);
    expect(u.role).toBe('nurse');
    expect(u.targetFood).toBeNull();
  });

  it('demotion: the oldest nurse emerges at the entrance as a wandering forager', () => {
    const w = colony(10, 1, 0, 7); // wants 2
    const [a, b, c] = [w.ants[0], w.ants[1], w.ants[2]];
    intoNest(a, 'nurse', 0);
    intoNest(b, 'nurse', 0);
    intoNest(c, 'nurse', 0);
    a.age = 10;
    b.age = 500;
    c.age = 100;
    w.started = false;
    run(w, 2.1);
    expect(w.nurses).toBe(2);
    expect(b.role).toBe('forager');
    expect(b.state).toBe('wander');
    expect(b.nestKind).toBeUndefined();
    expect(Math.hypot(b.x - NEST.x, b.y - NEST.y)).toBeLessThanOrEqual(6);
    for (const n of [a, c]) {
      expect(n.role).toBe('nurse');
      expect(n.state).toBe('nest');
    }
  });

  it('nurses never emerge on their own, never forage and are never touched: 300 s next to food and a beetle', () => {
    const w = colony(30, 1, 0, 8); // 30 ants: losing one to the beetle cannot shrink the wanted count below 2
    w.started = false;
    const nurses = [intoNest(w.ants[0], 'nurse', 0), intoNest(w.ants[1], 'nurse', 0)];
    const berry = w.placeFood('berry', NEST.x + 14, NEST.y)!;
    const beetle = w.placeFood('beetle', NEST.x + 12, NEST.y + 6)!;
    beetle.wanderT = 1e6;
    const pos = nurses.map((n) => [n.x, n.y]);
    for (let sec = 0; sec < 300; sec++) {
      run(w, 1);
      for (const n of nurses) {
        expect(n.state).toBe('nest');
        expect(n.role).toBe('nurse');
        expect(n.carry).toBe(0);
      }
    }
    nurses.forEach((n, i) => expect([n.x, n.y]).toEqual(pos[i]));
    expect(berry.id).toBeGreaterThan(0);
    expect(w.ants).toContain(nurses[0]);
    expect(w.ants).toContain(nurses[1]);
  }, 60_000);

  it('nurses count in ants.length, antsInNest and the MAX_ANTS cap, not in antsOnSurface', () => {
    const w = colony(10, 1, 0, 9);
    intoNest(w.ants[0], 'nurse', 0);
    expect(w.ants).toHaveLength(10);
    expect(w.antsInNest).toBe(1);
    expect(w.antsOnSurface).toBe(9);
  });

  it('a hatchling of a colony that needs nurses becomes one instead of emerging (integration)', () => {
    const w = colony(10, 1, 0, 10); // 10 surface wanderers, wants 2 nurses, ants/0.3 -> 3 once the 11th appears
    w.stock = FOOD_PER_ANT;
    run(w, 10.5);
    expect(w.ants).toHaveLength(11);
    const h = w.ants[10];
    expect(h.state).toBe('nest');
    run(w, 2.1);
    expect(h.role).toBe('nurse');
    run(w, 60); // way past the normal 30 s stay
    expect(h.state).toBe('nest');
    expect(h.role).toBe('nurse');
  });
});

describe('save: nurses', () => {
  it('nurses survive a JSON save round-trip and keep their role', () => {
    const w = colony(12, 1, 0, 11);
    intoNest(w.ants[0], 'nurse', 0);
    intoNest(w.ants[1], 'nurse', 0);
    run(w, 3);
    const s = JSON.parse(JSON.stringify(worldToSave(w, EXTRA))) as SaveV1;
    const r = worldFromSave(validateSave(s)!);
    expect(r.nurses).toBe(2);
    expect(r.ants).toEqual(w.ants);
    expect(r.ants[0].nestKind).toBe('nurse');
    run(r, 120);
    expect(r.ants[0].state).toBe('nest');
    expect(r.ants[1].state).toBe('nest');
  });
});

describe('majors and the nest', () => {
  it('majors are never promoted to nurses, and a major nurse goes out to the surface', () => {
    const w = World.create(41, 'normal');
    w.noSpider = true;
    w.stock = 1e6;
    for (let i = 0; i < 12; i++) w.spawnAnt(true);
    for (const a of w.ants) a.major = true;
    for (let i = 0; i < 60; i++) w.step(0.5);
    expect(w.ants.filter((a) => a.role === 'nurse' && a.major)).toHaveLength(0);

    const m = w.spawnAnt(true);
    m.major = true;
    m.role = 'nurse';
    m.nestKind = 'nurse';
    for (let i = 0; i < 10; i++) w.step(0.5);
    expect(m.role).toBe('forager');
    expect(m.state).not.toBe('nest');
  });
});
