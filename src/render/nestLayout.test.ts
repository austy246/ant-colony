import { describe, expect, it } from 'vitest';
import { nestLayout, type Chamber, type NestState } from './nestLayout';

const base: NestState = { ants: 1, stock: 10, larvae: 2, queens: 1, width: 320, height: 200 };
const lay = (o: Partial<NestState> = {}) => nestLayout({ ...base, ...o });
const byKind = (l: ReturnType<typeof nestLayout>, k: Chamber['kind']) => l.chambers.filter((c) => c.kind === k);
const one = (l: ReturnType<typeof nestLayout>, k: Chamber['kind']) => byKind(l, k)[0];

describe('nestLayout structure', () => {
  it('always has a pantry and a larvae chamber, one queen chamber per queen, and no bedroom', () => {
    for (let q = 1; q <= 8; q++) {
      const l = lay({ queens: q });
      expect(byKind(l, 'queen')).toHaveLength(q);
      expect(byKind(l, 'larvae')).toHaveLength(1);
      expect(byKind(l, 'pantry')).toHaveLength(1);
      expect(l.chambers).toHaveLength(q + 2);
      expect(new Set(l.chambers.map((c) => c.kind))).toEqual(new Set(['queen', 'larvae', 'pantry']));
      expect(new Set(l.chambers.map((c) => c.id)).size).toBe(l.chambers.length);
    }
  });

  it('clamps and sanitises the queen count and NaN inputs', () => {
    expect(byKind(lay({ queens: 0 }), 'queen')).toHaveLength(1);
    expect(byKind(lay({ queens: 99 }), 'queen')).toHaveLength(8);
    expect(byKind(lay({ queens: NaN }), 'queen')).toHaveLength(1);
    const l = nestLayout({ ants: NaN, stock: NaN, larvae: -4, queens: 2, width: 320, height: 200 });
    for (const c of l.chambers) {
      expect(Number.isFinite(c.cx + c.cy + c.rx + c.ry)).toBe(true);
      expect(c.rx).toBeGreaterThan(0);
      expect(c.ry).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    expect(nestLayout({ ...base, queens: 5, ants: 80 })).toEqual(nestLayout({ ...base, queens: 5, ants: 80 }));
  });

  it('keeps earlier queen chambers where they were when another queen appears', () => {
    const a = byKind(lay({ queens: 3 }), 'queen');
    const b = byKind(lay({ queens: 4 }), 'queen');
    for (let i = 0; i < 3; i++) {
      expect(b[i].id).toBe(a[i].id);
      expect(b[i].cx).toBe(a[i].cx);
      expect(b[i].cy).toBe(a[i].cy);
    }
  });

  it('connects the entrance to every chamber with its own tunnel of constant width', () => {
    const l = lay({ queens: 8 });
    for (const c of l.chambers) {
      const t = l.tunnels.filter((x) => x.to === c.id);
      expect(t).toHaveLength(1);
      const p = t[0].points;
      expect(p[0]).toEqual(l.entrance);
      const end = p[p.length - 1];
      expect(((end.x - c.cx) / c.rx) ** 2 + ((end.y - c.cy) / c.ry) ** 2).toBeLessThanOrEqual(1);
      expect(t[0].width).toBeGreaterThan(0);
    }
    expect(new Set(l.tunnels.map((t) => t.width)).size).toBe(1);
  });

  it('puts the entrance at the surface', () => {
    const l = lay();
    expect(l.entrance.y).toBeLessThanOrEqual(l.surfaceY);
    expect(l.entrance.x).toBeGreaterThan(0);
    expect(l.entrance.x).toBeLessThan(l.width);
  });
});

describe('nestLayout sizes', () => {
  const grows = (key: keyof NestState, kind: Chamber['kind'], values: number[]): void => {
    let prev = -1;
    let prevY = -1;
    for (const v of values) {
      const c = one(lay({ [key]: v, queens: 2 }), kind);
      expect(c.rx).toBeGreaterThanOrEqual(prev);
      expect(c.ry).toBeGreaterThanOrEqual(prevY);
      prev = c.rx;
      prevY = c.ry;
    }
    const first = one(lay({ [key]: values[0], queens: 2 }), kind);
    const last = one(lay({ [key]: values[values.length - 1], queens: 2 }), kind);
    expect(last.rx).toBeGreaterThan(first.rx);
  };

  it('queen chambers grow with ants', () => grows('ants', 'queen', [0, 1, 4, 10, 40, 100, 200, 300]));
  it('larvae chamber grows with larvae', () => grows('larvae', 'larvae', [0, 1, 2, 5, 10, 20, 40]));
  it('pantry grows with stock (sub-linearly)', () => {
    grows('stock', 'pantry', [0, 1, 5, 10, 30, 100, 300, 500]);
    const p = (s: number) => one(lay({ stock: s }), 'pantry').rx;
    expect(p(400) - p(200)).toBeLessThan(p(200) - p(0));
  });

  it('every queen chamber has the same size and the other chambers ignore ants', () => {
    const l = lay({ queens: 4, ants: 50 });
    const q = byKind(l, 'queen');
    expect(new Set(q.map((c) => c.rx)).size).toBe(1);
    expect(one(lay({ ants: 1 }), 'pantry')).toEqual(one(lay({ ants: 300 }), 'pantry'));
  });
});

describe('nestLayout geometry at the extremes', () => {
  const states: Partial<NestState>[] = [
    {},
    { ants: 300, stock: 500, larvae: 100, queens: 8 },
    { ants: 300, stock: 500, larvae: 40, queens: 8 },
    { ants: 300, stock: 0, larvae: 0, queens: 8 },
    { ants: 0, stock: 500, larvae: 40, queens: 1 },
    { ants: 1e9, stock: 1e9, larvae: 1e9, queens: 1e9 },
  ];
  const box = (c: Chamber) => ({ x0: c.cx - c.rx, x1: c.cx + c.rx, y0: c.cy - c.ry, y1: c.cy + c.ry });

  for (const [i, s] of states.entries()) {
    it(`no overlap and nothing outside the area (state ${i})`, () => {
      const l = lay(s);
      for (const c of l.chambers) {
        const b = box(c);
        expect(b.x0).toBeGreaterThanOrEqual(0);
        expect(b.x1).toBeLessThanOrEqual(l.width);
        expect(b.y0).toBeGreaterThan(l.surfaceY);
        expect(b.y1).toBeLessThanOrEqual(l.height);
      }
      for (let a = 0; a < l.chambers.length; a++) {
        for (let b = a + 1; b < l.chambers.length; b++) {
          const p = box(l.chambers[a]);
          const q = box(l.chambers[b]);
          const apart = p.x1 + 2 <= q.x0 || q.x1 + 2 <= p.x0 || p.y1 + 2 <= q.y0 || q.y1 + 2 <= p.y0;
          expect(apart, `${l.chambers[a].id} vs ${l.chambers[b].id}`).toBe(true);
        }
      }
    });
  }
});
