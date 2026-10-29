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
