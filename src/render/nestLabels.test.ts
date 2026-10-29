import { describe, expect, it } from 'vitest';
import { chamberLabel, labelPlates, type Plate } from './nestLabels';
import { nestLayout, type NestLayout } from './nestLayout';

const mk = (seed: number, q: number, p: number, l: number): NestLayout =>
  nestLayout({ seed, queens: q, pantries: p, larvaeChambers: l, loads: { ants: 100, pantry: Array(6).fill(25), larvae: Array(4).fill(10) }, width: 320, height: 200 });
const plates = (lt: NestLayout): Plate[] => labelPlates(lt.chambers, lt.tunnels, lt.width, lt.height, lt.surfaceY);
const hit = (a: Plate, b: Plate): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('chamberLabel', () => {
  it('names the kinds in Czech and numbers them only when there are several', () => {
    expect(chamberLabel({ kind: 'queen', index: 0 }, false)).toBe('Královna');
    expect(chamberLabel({ kind: 'larvae', index: 0 }, false)).toBe('Larvy');
    expect(chamberLabel({ kind: 'pantry', index: 0 }, false)).toBe('Spíž');
    expect(chamberLabel({ kind: 'pantry', index: 1 }, true)).toBe('Spíž 2');
    expect(chamberLabel({ kind: 'queen', index: 7 }, true)).toBe('Královna 8');
  });
});

describe('labelPlates', () => {
  it('gives every chamber a plate with the right text, numbered per kind only for several', () => {
    const lt = mk(5, 3, 1, 2);
    const ps = plates(lt);
    expect(ps.map((p) => p.text)).toEqual(lt.chambers.map((c) => ({ queen: 'Královna', larvae: 'Larvy', pantry: 'Spíž' })[c.kind] + (c.kind === 'pantry' ? '' : ` ${c.index + 1}`)));
  });

  it('puts a plate right above its chamber when there is room (day 1)', () => {
    let above = 0;
    for (let s = 1; s <= 30; s++) {
      const lt = mk(s * 31, 1, 1, 1);
      for (const [i, p] of plates(lt).entries()) {
        const c = lt.chambers[i];
        if (Math.abs(p.x + p.w / 2 - c.cx) < 1.5 && p.y + p.h <= c.cy) above++;
      }
    }
    expect(above).toBeGreaterThanOrEqual(30 * 3 * 0.5);
  }, 60000);

  it('never lets two plates overlap and keeps them inside the picture (200 seeds at 8 + 6 + 4 chambers, and at other levels)', () => {
    for (let i = 0; i < 200; i++) {
      const seed = i * 7919 + 3;
      for (const [q, p, l] of [[8, 6, 4], [3, 3, 2], [6, 1, 1]]) {
        const lt = mk(seed, q, p, l);
        const ps = plates(lt);
        expect(ps).toHaveLength(q + p + l);
        for (let a = 0; a < ps.length; a++) {
          expect(ps[a].x, `seed ${seed}`).toBeGreaterThanOrEqual(0);
          expect(ps[a].x + ps[a].w, `seed ${seed}`).toBeLessThanOrEqual(lt.width);
          expect(ps[a].y, `seed ${seed}`).toBeGreaterThan(lt.surfaceY);
          expect(ps[a].y + ps[a].h, `seed ${seed}`).toBeLessThanOrEqual(lt.height);
          for (let b = a + 1; b < ps.length; b++) expect(hit(ps[a], ps[b]), `seed ${seed} ${ps[a].text} / ${ps[b].text}`).toBe(false);
        }
      }
    }
  }, 120000);

  it('is deterministic, and plates never overlap whether the chambers are empty or full', () => {
    for (const [ants, fill, larv] of [[1, 0, 0], [300, 25, 10]]) {
      for (let i = 0; i < 60; i++) {
        const lt = nestLayout({ seed: i * 7919 + 3, queens: 8, pantries: 6, larvaeChambers: 4, loads: { ants, pantry: Array(6).fill(fill), larvae: Array(4).fill(larv) }, width: 320, height: 200 });
        const ps = plates(lt);
        expect(plates(lt)).toEqual(ps);
        for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) expect(hit(ps[a], ps[b]), `seed ${i} ${ants}`).toBe(false);
      }
    }
  }, 120000);

  it('keeps most plates off the tunnels', () => {
    let on = 0;
    let n = 0;
    for (let s = 1; s <= 40; s++) {
      const lt = mk(s * 101, 6, 4, 3);
      for (const p of plates(lt)) {
        n++;
        if (lt.tunnels.some((t) => t.points.some((q) => q.x > p.x && q.x < p.x + p.w && q.y > p.y && q.y < p.y + p.h))) on++;
      }
    }
    expect(on / n).toBeLessThan(0.15);
  }, 60000);
});
