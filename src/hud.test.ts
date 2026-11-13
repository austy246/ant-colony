import { describe, expect, it } from 'vitest';
import { World } from './sim/world';
import { hudParts, hudText } from './hud';

function colony(ants: number, nest: number, stock: number): World {
  const w = World.create(3);
  for (let i = 0; i < ants; i++) w.spawnAnt();
  w.stock = stock;
  for (let i = 0; i < nest; i++) {
    w.ants[i].state = 'nest';
    w.ants[i].nestKind = 'unload';
    w.ants[i].timer = 3;
  }
  return w;
}

describe('hudText', () => {
  it('shows the total and, when somebody is underground, the number on the surface in a second figure', () => {
    expect(hudText(colony(12, 7, 3.34))).toBe('Mravenci: 12 (na povrchu 5) · Zásoba: 3.3');
    expect(hudText(colony(5, 1, 10))).toBe('Mravenci: 5 (na povrchu 4) · Zásoba: 10.0');
    expect(hudText(colony(3, 3, 0))).toBe('Mravenci: 3 (na povrchu 0) · Zásoba: 0.0');
  });

  it('shows only the total while nobody is in the nest', () => {
    expect(hudText(colony(12, 0, 3.34))).toBe('Mravenci: 12 · Zásoba: 3.3');
    expect(hudText(colony(0, 0, 10))).toBe('Mravenci: 0 · Zásoba: 10.0');
  });

  it('works with a bare object that has the counters (no World needed) and survives a non-finite stock', () => {
    const fake = { ants: new Array(9), antsInNest: 4, antsOnSurface: 5, stock: NaN } as unknown as World;
    expect(hudText(fake)).toBe('Mravenci: 9 (na povrchu 5) · Zásoba: 0.0');
  });

  it('hudParts splits the text so the second figure can be drawn smaller; the parts add up to hudText', () => {
    const w = colony(12, 7, 3.34);
    expect(hudParts(w)).toEqual({ before: 'Mravenci: 12', small: ' (na povrchu 5)', after: ' · Zásoba: 3.3' });
    const none = hudParts(colony(4, 0, 1));
    expect(none.small).toBe('');
    expect(none.before + none.small + none.after).toBe(hudText(colony(4, 0, 1)));
  });
});

describe('raid warning', () => {
  it('counts the seconds down in the last RAID_WARN_S of the wait and only then', () => {
    const w = colony(5, 0, 1);
    expect(hudText(w)).not.toContain('Nálet za');
    w.raidWait = 200;
    expect(w.raidWarning).toBeNull();
    w.raidWait = 30.2;
    expect(hudText(w)).toContain('Nálet za 31 s!');
    w.noRaid = true;
    expect(w.raidWarning).toBeNull();
  });
});

describe('seasons and rain', () => {
  it('a season lasts SEASON_S, winter is slow and sparse, rain washes trails and stops spawns', async () => {
    const { SEASON_S, RAIN_S, SEASON_SPAWN_MUL } = await import('./sim/constants');
    const w = World.create(3, 'normal');
    expect(w.season).toBe(0);
    w.time = SEASON_S;
    expect(w.season).toBe(1);
    w.time = 3 * SEASON_S + 1;
    expect(w.season).toBe(3);
    expect(w.raining).toBe(false); // never in winter
    expect(SEASON_SPAWN_MUL[3]).toBeGreaterThan(SEASON_SPAWN_MUL[1]);
    // some block in the first three seasons does rain, and only within its first RAIN_S seconds
    let rained = 0;
    for (let t = 0; t < 3 * SEASON_S; t += 5) {
      w.time = t;
      if (w.raining) {
        rained++;
        expect(t % 180).toBeLessThan(RAIN_S);
      }
    }
    expect(rained).toBeGreaterThan(0);
    expect(World.create(3, 'sandbox').season).toBe(1); // sandbox: always summer, never rain
    w.fixedSeason = 2;
    w.time = 0;
    expect(w.season).toBe(2);
    expect(w.raining).toBe(false);
  });
});
