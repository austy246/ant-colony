import { describe, expect, it } from 'vitest';
import { buildGraph, distancesFrom, nearestNode } from './nestGraph';
import {
  CHAMBER_ORDER,
  FLOOR,
  insideChamber,
  maxExtent,
  NEST_H,
  NEST_STEP_H,
  NEST_STEP_W,
  NEST_W,
  nestLayout,
  nestSceneSize,
  type Chamber,
  type NestInput,
  type NestLayout,
} from './nestLayout';

const base: NestInput = {
  seed: 5,
  queens: 1,
  pantries: 1,
  larvaeChambers: 1,
  loads: { ants: 1, pantry: [10], larvae: [2] },
  width: 320,
  height: 200,
};
const lay = (o: Partial<NestInput> = {}): NestLayout => nestLayout({ ...base, ...o });
const full = (seed: number): NestLayout =>
  lay({ seed, queens: 8, pantries: 6, larvaeChambers: 4, loads: { ants: 300, pantry: Array(6).fill(25), larvae: Array(4).fill(10) } });
const byKind = (l: NestLayout, k: Chamber['kind']): Chamber[] => l.chambers.filter((c) => c.kind === k);
const seeds = Array.from({ length: 200 }, (_, i) => i * 7919 + 3);

describe('nestLayout: counts follow the need', () => {
  it('has exactly the requested number of chambers of each kind, ids unique, no bedroom', () => {
    for (const [q, p, l] of [[1, 1, 1], [2, 3, 2], [8, 1, 1], [1, 6, 4], [8, 6, 4], [3, 2, 4]]) {
      const lt = lay({ queens: q, pantries: p, larvaeChambers: l });
      expect(byKind(lt, 'queen')).toHaveLength(q);
      expect(byKind(lt, 'pantry')).toHaveLength(p);
      expect(byKind(lt, 'larvae')).toHaveLength(l);
      expect(lt.chambers).toHaveLength(q + p + l);
      expect(new Set(lt.chambers.map((c) => c.id)).size).toBe(lt.chambers.length);
      expect(new Set(lt.chambers.map((c) => c.kind))).toEqual(new Set(['queen', 'larvae', 'pantry']));
    }
  });

  it('clamps and sanitises the counts, the seed and NaN loads', () => {
    expect(byKind(lay({ queens: 0 }), 'queen')).toHaveLength(1);
    expect(byKind(lay({ queens: 99 }), 'queen')).toHaveLength(8);
    expect(byKind(lay({ queens: NaN }), 'queen')).toHaveLength(1);
    expect(byKind(lay({ pantries: 99 }), 'pantry')).toHaveLength(6);
    expect(byKind(lay({ pantries: -3 }), 'pantry')).toHaveLength(1);
    expect(byKind(lay({ larvaeChambers: 99 }), 'larvae')).toHaveLength(4);
    const l = lay({ seed: NaN, queens: 3, loads: { ants: NaN, pantry: [NaN], larvae: [-4, Infinity] } });
    for (const c of l.chambers) {
      expect(Number.isFinite(c.cx + c.cy + c.rx + c.ry)).toBe(true);
      expect(c.rx).toBeGreaterThan(0);
      expect(c.ry).toBeGreaterThan(0);
    }
  });

  it('defines one fixed generation order of 8 queens, 6 pantries and 4 larvae chambers that starts queen, larvae, pantry', () => {
    expect(CHAMBER_ORDER).toHaveLength(18);
    expect(CHAMBER_ORDER.slice(0, 3).map((s) => `${s.kind}${s.index}`)).toEqual(['queen0', 'larvae0', 'pantry0']);
    for (const [kind, n] of [['queen', 8], ['pantry', 6], ['larvae', 4]] as const) {
      expect(CHAMBER_ORDER.filter((s) => s.kind === kind).map((s) => s.index)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });
});

describe('nestLayout: random but stable', () => {
  it('is deterministic for a seed', () => {
    expect(full(11)).toEqual(full(11));
    expect(lay({ seed: 4 })).toEqual(lay({ seed: 4 }));
  });

  it('never moves an existing chamber (or its tunnel) when another one is added', () => {
    for (const seed of [1, 2, 3, 77, 1234, 99999]) {
      const grow = [
        [1, 1, 1], [1, 2, 1], [1, 2, 2], [2, 2, 2], [2, 3, 2], [3, 3, 2], [3, 4, 3], [4, 5, 3], [5, 6, 4], [6, 6, 4], [8, 6, 4],
      ];
      let prev: NestLayout | null = null;
      for (const [q, p, l] of grow) {
        const cur = lay({ seed, queens: q, pantries: p, larvaeChambers: l });
        if (prev) {
          for (const a of prev.chambers) {
            const b = cur.chambers.find((c) => c.id === a.id)!;
            expect(b, `${seed} ${a.id}`).toBeDefined();
            expect([b.cx, b.cy, b.rxMax, b.ryMax, b.lobes]).toEqual([a.cx, a.cy, a.rxMax, a.ryMax, a.lobes]);
            const ta = prev.tunnels.find((t) => t.to === a.id)!;
            const tb = cur.tunnels.find((t) => t.to === a.id)!;
            expect(tb.points).toEqual(ta.points);
            expect(tb.widths).toEqual(ta.widths);
          }
          expect(cur.entrance).toEqual(prev.entrance);
        }
        prev = cur;
      }
    }
  });

  it('keeps the geometry when only the loads change', () => {
    const a = lay({ seed: 9, queens: 3, pantries: 3, larvaeChambers: 2 });
    const b = lay({ seed: 9, queens: 3, pantries: 3, larvaeChambers: 2, loads: { ants: 200, pantry: [25, 25, 9], larvae: [10, 4] } });
    expect(b.chambers.map((c) => [c.id, c.cx, c.cy])).toEqual(a.chambers.map((c) => [c.id, c.cx, c.cy]));
    expect(b.tunnels).toEqual(a.tunnels);
  });

  it('gives different seeds different nests (the centres of the first three chambers differ for >= 95 % of seed pairs)', () => {
    const firsts = seeds.slice(0, 60).map((s) => lay({ seed: s }).chambers.map((c) => `${c.cx},${c.cy}`));
    let pairs = 0;
    let differ = 0;
    for (let i = 0; i < firsts.length; i++) {
      for (let j = i + 1; j < firsts.length; j++) {
        pairs++;
        if (firsts[i].every((p, k) => p !== firsts[j][k])) differ++;
      }
    }
    expect(differ / pairs).toBeGreaterThanOrEqual(0.95);
    // and the full late-game nests differ as a whole
    const wholes = new Set(seeds.slice(0, 40).map((s) => full(s).chambers.map((c) => `${c.cx},${c.cy}`).join(';')));
    expect(wholes.size).toBe(40);
  });

  it('digs curved tunnels: not straight lines, not T shapes, with branching', () => {
    let curvy = 0;
    let total = 0;
    for (const seed of seeds.slice(0, 30)) {
      for (const t of full(seed).tunnels) {
        if (t.to === 'shaft' || t.points.length < 8) continue;
        total++;
        // largest distance of the polyline from the chord between its ends
        const a = t.points[0];
        const b = t.points[t.points.length - 1];
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        let dev = 0;
        for (const p of t.points) dev = Math.max(dev, Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L);
        if (dev >= 1.5) curvy++;
        // no axis-aligned long runs
        let run = 0;
        let worst = 0;
        for (let i = 1; i < t.points.length; i++) {
          if (Math.abs(t.points[i].x - t.points[i - 1].x) < 0.05 || Math.abs(t.points[i].y - t.points[i - 1].y) < 0.05) run++;
          else run = 0;
          worst = Math.max(worst, run);
        }
        expect(worst).toBeLessThan(20);
      }
    }
    expect(curvy / total).toBeGreaterThan(0.75);
    // not every tunnel starts at the shaft: side tunnels branch from other tunnels
    let branching = 0;
    for (const seed of seeds.slice(0, 30)) {
      const l = full(seed);
      const shaft = l.tunnels.find((t) => t.to === 'shaft')!;
      const onShaft = new Set(shaft.points.map((p) => `${p.x},${p.y}`));
      for (const t of l.tunnels) if (t.to !== 'shaft' && !onShaft.has(`${t.points[0].x},${t.points[0].y}`)) branching++;
    }
    expect(branching).toBeGreaterThan(30 * 2);
  });

  it('varies the tunnel width between 3 and 5 fine px along the tunnel', () => {
    const widths = new Set<number>();
    for (const seed of seeds.slice(0, 20)) {
      for (const t of full(seed).tunnels) {
        expect(t.widths).toHaveLength(t.points.length);
        for (const w of t.widths) {
          expect(w).toBeGreaterThanOrEqual(3);
          expect(w).toBeLessThanOrEqual(5);
          widths.add(Math.round(w));
        }
        expect(t.width).toBeGreaterThanOrEqual(3);
        expect(t.width).toBeLessThanOrEqual(5);
      }
    }
    expect(widths).toEqual(new Set([3, 4, 5]));
  });

  it('digs exactly one entrance shaft and no decorative side tunnels or empty rooms', () => {
    for (const seed of seeds.slice(0, 40)) {
      for (const [q, p, l] of [[1, 1, 1], [3, 3, 2], [8, 6, 4]]) {
        const lt = lay({ seed, queens: q, pantries: p, larvaeChambers: l });
        expect(lt.tunnels.filter((t) => t.to === 'shaft')).toHaveLength(1);
        expect(lt.tunnels).toHaveLength(1 + lt.chambers.length);
        expect(new Set(lt.tunnels.map((t) => t.to))).toEqual(new Set(['shaft', ...lt.chambers.map((c) => c.id)]));
        expect('alcoves' in lt).toBe(false);
        // only the shaft reaches the surface line
        const up = lt.tunnels.filter((t) => t.points.some((pt) => pt.y <= lt.surfaceY + 0.001));
        expect(up.map((t) => t.to)).toEqual(['shaft']);
        expect(lt.tunnels[0].points[0]).toEqual(lt.entrance);
      }
    }
  });
});

describe('nestLayout: the tunnels form a tree', () => {
  const states: [number, number, number][] = [[1, 1, 1], [2, 2, 1], [3, 3, 2], [5, 4, 3], [8, 6, 4], [1, 6, 4], [8, 1, 1]];
  const edges = (g: ReturnType<typeof buildGraph>): number => g.adj.reduce((n, a) => n + a.length, 0) / 2;

  it('is connected, has no loops, every leaf is a chamber centre and every chamber centre is a leaf (200 seeds, 7 need levels)', () => {
    for (const seed of seeds) {
      for (const [q, p, l] of states) {
        const lt = lay({ seed, queens: q, pantries: p, larvaeChambers: l });
        const g = buildGraph(lt.tunnels.map((t) => t.points));
        const d = distancesFrom(g, nearestNode(g, lt.entrance));
        expect(d.dist.every((v) => Number.isFinite(v)), `seed ${seed} ${q}.${p}.${l} connected`).toBe(true);
        expect(edges(g), `seed ${seed} ${q}.${p}.${l} tree`).toBe(g.nodes.length - 1);
        const centres = new Set(lt.chambers.map((c) => `${c.cx},${c.cy}`));
        const leaves = g.nodes.filter((n, i) => g.adj[i].length === 1 && !(n.x === lt.entrance.x && n.y === lt.entrance.y)).map((n) => `${n.x},${n.y}`);
        expect(new Set(leaves), `seed ${seed} ${q}.${p}.${l} leaves`).toEqual(centres);
      }
    }
  });

  it('is short: the tunnels to the chambers are at most 30 % longer than the straight connections to the nearest tunnel', () => {
    let ok = 0;
    for (const seed of seeds.slice(0, 100)) {
      const lt = full(seed);
      const shaft = lt.tunnels.find((t) => t.to === 'shaft')!;
      let own = 0;
      let straight = 0;
      for (const t of lt.tunnels) {
        if (t === shaft) continue;
        for (let i = 1; i < t.points.length; i++) own += Math.hypot(t.points[i].x - t.points[i - 1].x, t.points[i].y - t.points[i - 1].y);
        const c = lt.chambers.find((x) => x.id === t.to)!;
        // shortest connection from the centre to any other tunnel point that is not inside this chamber
        let best = Infinity;
        for (const o of lt.tunnels) {
          const oc = lt.chambers.find((x) => x.id === o.to);
          const allowed = o === shaft || (oc && oc !== c && (oc.index < 1 || (oc.kind === c.kind && oc.index < c.index)));
          if (!allowed) continue;
          for (const pt of o.points) if (pt !== o.points[o.points.length - 1]) best = Math.min(best, Math.hypot(pt.x - c.cx, pt.y - c.cy));
        }
        straight += best;
      }
      if (own <= straight * 1.3) ok++;
    }
    expect(ok / 100).toBeGreaterThanOrEqual(0.95);
  });

  it('has no two tunnels running side by side (3 fine px) away from where one branches off the other', () => {
    for (const seed of seeds.slice(0, 60)) {
      const lt = full(seed);
      for (const a of lt.tunnels) {
        for (const b of lt.tunnels) {
          if (a === b) continue;
          for (let j = 0; j < b.points.length; j++) {
            const pb = b.points[j];
            // the neighbourhood of a branching point is where two tunnels meet
            if (Math.hypot(pb.x - a.points[0].x, pb.y - a.points[0].y) < 14 || Math.hypot(pb.x - b.points[0].x, pb.y - b.points[0].y) < 14) continue;
            for (const pa of a.points) {
              if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 3) throw new Error(`seed ${seed}: ${b.to} runs along ${a.to} at ${pb.x},${pb.y}`);
            }
          }
        }
      }
    }
  });
});

describe('nestLayout: shapes', () => {
  it('chambers are irregular blobs, not ellipses, with a flat floor', () => {
    let irregular = 0;
    let n = 0;
    for (const seed of seeds.slice(0, 20)) {
      for (const c of full(seed).chambers) {
        n++;
        expect(c.lobes.length).toBeGreaterThanOrEqual(2);
        expect(c.lobes.length).toBeLessThanOrEqual(3);
        // radial deviation from the plain ellipse along the outline
        let lo = Infinity;
        let hi = -Infinity;
        for (let a = 0; a < Math.PI * 2; a += 0.1) {
          let r = 1;
          for (const l of c.lobes) r += l.a * Math.cos(l.k * a + l.ph);
          lo = Math.min(lo, r);
          hi = Math.max(hi, r);
        }
        if (hi - lo > 0.06) irregular++;
        // the floor is flat: below it nothing is inside, and it is wide
        const floor = Math.round(c.cy + 0.68 * c.ry);
        expect(insideChamber(c, c.cx, floor + 3)).toBe(false);
        let run = 0;
        for (let x = Math.floor(c.cx - c.rx); x <= c.cx + c.rx; x++) if (insideChamber(c, x + 0.5, floor - 1.5)) run++;
        expect(run).toBeGreaterThan(c.rx * 0.9);
        expect(insideChamber(c, c.cx, c.cy)).toBe(true);
        expect(insideChamber(c, c.cx + c.rx * 1.5, c.cy)).toBe(false);
      }
    }
    expect(irregular / n).toBeGreaterThan(0.9);
  });
});

describe('nestLayout: sizes follow the load', () => {
  const grows = (mk: (v: number) => Partial<NestInput>, pick: (l: NestLayout) => Chamber, values: number[]): void => {
    let prev = -1;
    let prevY = -1;
    for (const v of values) {
      const c = pick(lay({ queens: 2, pantries: 2, larvaeChambers: 2, ...mk(v) }));
      expect(c.rx).toBeGreaterThanOrEqual(prev);
      expect(c.ry).toBeGreaterThanOrEqual(prevY);
      expect(c.rx).toBeLessThanOrEqual(c.rxMax + 1e-9);
      prev = c.rx;
      prevY = c.ry;
    }
    const first = pick(lay({ queens: 2, pantries: 2, larvaeChambers: 2, ...mk(values[0]) }));
    const last = pick(lay({ queens: 2, pantries: 2, larvaeChambers: 2, ...mk(values[values.length - 1]) }));
    expect(last.rx).toBeGreaterThan(first.rx + 1);
    expect(first.rx).toBeGreaterThan(first.rxMax * 0.45); // an empty chamber keeps a visible size
  };

  it('queen chambers grow with the ants (sub-linearly)', () => {
    grows((v) => ({ loads: { ants: v, pantry: [5, 0], larvae: [3, 0] } }), (l) => byKind(l, 'queen')[1], [0, 1, 4, 10, 40, 100, 200, 300]);
    const q = (a: number) => byKind(lay({ loads: { ants: a, pantry: [], larvae: [] } }), 'queen')[0].rx;
    expect(q(200) - q(100)).toBeLessThan(q(100) - q(0));
  });
  it('each pantry grows with its own fill', () => {
    grows((v) => ({ loads: { ants: 5, pantry: [25, v], larvae: [3, 0] } }), (l) => byKind(l, 'pantry')[1], [0, 1, 5, 10, 15, 20, 25]);
    const l = lay({ pantries: 3, loads: { ants: 5, pantry: [25, 12, 0], larvae: [1] } });
    const [a, b, c] = byKind(l, 'pantry');
    expect(a.rx / a.rxMax).toBeGreaterThan(b.rx / b.rxMax);
    expect(b.rx / b.rxMax).toBeGreaterThan(c.rx / c.rxMax);
  });
  it('each larvae chamber grows with its own larvae', () => {
    grows((v) => ({ loads: { ants: 5, pantry: [5, 0], larvae: [10, v] } }), (l) => byKind(l, 'larvae')[1], [0, 1, 2, 4, 6, 8, 10]);
  });
  it('a chamber ignores the loads of the others', () => {
    const a = lay({ queens: 2, pantries: 2, loads: { ants: 1, pantry: [3, 3], larvae: [1] } });
    const b = lay({ queens: 2, pantries: 2, loads: { ants: 1, pantry: [3, 25], larvae: [9] } });
    expect(byKind(a, 'pantry')[0].rx).toBe(byKind(b, 'pantry')[0].rx);
    expect(byKind(a, 'queen')[0].rx).toBe(byKind(b, 'queen')[0].rx);
    expect(byKind(a, 'pantry')[1].rx).toBeLessThan(byKind(b, 'pantry')[1].rx);
  });
  it('carries the load of every chamber so that the choreography can see it', () => {
    const l = lay({ pantries: 2, loads: { ants: 7, pantry: [25, 8], larvae: [4] } });
    expect(byKind(l, 'pantry').map((c) => c.load)).toEqual([25, 8]);
    expect(byKind(l, 'larvae')[0].load).toBe(4);
    expect(byKind(l, 'queen')[0].load).toBe(7);
  });
});

describe('nestLayout: geometry at 8 queens + 6 pantries + 4 larvae chambers (200 seeds)', () => {
  const layouts = seeds.map((s) => full(s));

  it('has 18 chambers, all inside the area and below the soil line', () => {
    for (const [i, l] of layouts.entries()) {
      expect(l.chambers, `seed ${seeds[i]}`).toHaveLength(18);
      for (const c of l.chambers) {
        const e = maxExtent(c);
        expect(c.cx - e.rx, `${seeds[i]} ${c.id}`).toBeGreaterThanOrEqual(0);
        expect(c.cx + e.rx, `${seeds[i]} ${c.id}`).toBeLessThanOrEqual(l.width);
        expect(c.cy - e.ry, `${seeds[i]} ${c.id}`).toBeGreaterThan(l.surfaceY + 6);
        expect(c.cy + e.ry, `${seeds[i]} ${c.id}`).toBeLessThanOrEqual(l.height);
      }
      for (const t of l.tunnels) for (const p of t.points) if (t.to !== 'shaft' || p.y > l.surfaceY) expect(p.y).toBeGreaterThan(l.surfaceY - 0.01);
    }
  });

  it('has no two chambers overlapping at their maximum size (the real blobs, with a gap)', () => {
    for (const [i, l] of layouts.entries()) {
      const all: Chamber[] = l.chambers;
      for (let a = 0; a < all.length; a++) {
        for (let b = a + 1; b < all.length; b++) {
          const A = all[a];
          const B = all[b];
          const ea = maxExtent(A);
          const eb = maxExtent(B);
          // cheap reject, then sample the max-size blob of A against B's
          if (Math.abs(A.cx - B.cx) > ea.rx + eb.rx + 3 || Math.abs(A.cy - B.cy) > ea.ry + eb.ry + 3) continue;
          const Am = { ...A, rx: A.rxMax, ry: A.ryMax };
          const Bm = { ...B, rx: B.rxMax, ry: B.ryMax };
          for (let y = A.cy - ea.ry; y <= A.cy + ea.ry; y += 1) {
            for (let x = A.cx - ea.rx; x <= A.cx + ea.rx; x += 1) {
              if (insideChamber(Am, x, y, 0.5) && insideChamber(Bm, x, y, 0.5)) throw new Error(`seed ${seeds[i]}: ${A.id} overlaps ${B.id} at ${x},${y}`);
            }
          }
        }
      }
    }
  });

  it('keeps every tunnel out of every other chamber (max sizes)', () => {
    for (const [i, l] of layouts.entries()) {
      for (const t of l.tunnels) {
        for (const c of l.chambers) {
          if (t.to === c.id) continue;
          const m = { ...c, rx: c.rxMax, ry: c.ryMax };
          for (const p of t.points) {
            if (insideChamber(m, p.x, p.y, 0.5)) throw new Error(`seed ${seeds[i]}: tunnel ${t.to} runs through ${c.id} at ${p.x},${p.y}`);
          }
        }
      }
    }
  });

  it('connects every chamber to the entrance through the tunnel graph, with a way short enough to walk in 5 s', () => {
    for (const [i, l] of layouts.entries()) {
      const g = buildGraph(l.tunnels.map((t) => t.points));
      const d = distancesFrom(g, nearestNode(g, l.entrance));
      for (const c of l.chambers) {
        const n = nearestNode(g, { x: c.cx, y: c.cy });
        expect(g.nodes[n], `seed ${seeds[i]} ${c.id}`).toEqual({ x: c.cx, y: c.cy });
        expect(Number.isFinite(d.dist[n]), `seed ${seeds[i]} ${c.id} reachable`).toBe(true);
        expect(d.dist[n], `seed ${seeds[i]} ${c.id}`).toBeLessThanOrEqual(330);
      }
    }
  });

  it('puts the entrance at the surface and the first pantry within the reach of an unloading forager', () => {
    for (const [i, l] of layouts.entries()) {
      expect(l.entrance.y).toBeLessThanOrEqual(l.surfaceY);
      const g = buildGraph(l.tunnels.map((t) => t.points));
      const d = distancesFrom(g, nearestNode(g, l.entrance));
      const p0 = l.chambers.find((c) => c.id === 'pantry0')!;
      expect(d.dist[nearestNode(g, { x: p0.cx, y: p0.cy })], `seed ${seeds[i]}`).toBeLessThanOrEqual(135);
    }
  });

  it('is fast enough to generate (memoised per seed)', () => {
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) full(100000 + k);
    expect(performance.now() - t0).toBeLessThan(40000);
    const t1 = performance.now();
    for (let k = 0; k < 2000; k++) full(100000 + (k % 20));
    expect(performance.now() - t1).toBeLessThan(500);
  }, 90000);
});

describe('nestLayout: sizes follow sizeLoads, not the current loads', () => {
  const sizeLoads = { ants: 100, pantry: [20, 10], larvae: [8] };
  const a = lay({ queens: 2, pantries: 2, larvaeChambers: 1, sizeLoads, loads: { ants: 1, pantry: [0, 0], larvae: [0] } });
  const b = lay({ queens: 2, pantries: 2, larvaeChambers: 1, sizeLoads, loads: { ants: 100, pantry: [25, 25], larvae: [10] } });

  it('chamber size ignores current loads when sizeLoads is given', () => {
    expect(a.chambers.length).toBe(b.chambers.length);
    for (let i = 0; i < a.chambers.length; i++) {
      expect(a.chambers[i].rx).toBe(b.chambers[i].rx);
      expect(a.chambers[i].ry).toBe(b.chambers[i].ry);
    }
    expect(a.chambers.some((c, i) => c.load !== b.chambers[i].load)).toBe(true);
  });

  it('chamber grows with larger sizeLoads', () => {
    const lo = lay({ sizeLoads: { ants: 4, pantry: [2], larvae: [1] } });
    const hi = lay({ sizeLoads: { ants: 200, pantry: [25], larvae: [10] } });
    for (let i = 0; i < lo.chambers.length; i++) {
      expect(hi.chambers[i].rx).toBeGreaterThanOrEqual(lo.chambers[i].rx);
      expect(hi.chambers[i].ry).toBeGreaterThanOrEqual(lo.chambers[i].ry);
    }
    expect(hi.chambers.some((c, i) => c.rx > lo.chambers[i].rx)).toBe(true);
  });
});

describe('nestLayout: normal mode grows the underground with the colony', () => {
  const fill = (n: number, v: number): number[] => Array<number>(n).fill(v);
  /** A normal-mode layout with q queens, p pantries and l larvae chambers, all full. */
  const grown = (seed: number, q: number, p: number, l: number, o: Partial<NestInput> = {}): NestLayout =>
    lay({ seed, queens: q, pantries: p, larvaeChambers: l, unbounded: true, loads: { ants: 2000, pantry: fill(p, 25), larvae: fill(l, 10) }, ...o });
  const growSeeds = [3, 5, 7922, 15841, 123457, 99991];

  it('scene size grows in steps of NEST_STEP_W x NEST_STEP_H and never shrinks for increasing counts', () => {
    expect(nestSceneSize(1, 1)).toEqual({ width: NEST_W, height: NEST_H, step: 0 });
    expect(nestSceneSize(6, 4)).toEqual({ width: NEST_W, height: NEST_H, step: 0 });
    expect(nestSceneSize(7, 4).step).toBe(1);
    expect(nestSceneSize(6, 5).step).toBe(1);
    let prev = nestSceneSize(1, 1);
    for (let n = 1; n <= 256; n++) {
      const s = nestSceneSize(n, Math.ceil(n / 2));
      expect(s.width).toBe(NEST_W + s.step * NEST_STEP_W);
      expect(s.height).toBe(NEST_H + s.step * NEST_STEP_H);
      expect(s.step).toBeGreaterThanOrEqual(prev.step);
      expect(nestSceneSize(n + 1, Math.ceil(n / 2)).step).toBeGreaterThanOrEqual(s.step);
      expect(nestSceneSize(n, Math.ceil(n / 2) + 1).step).toBeGreaterThanOrEqual(s.step);
      prev = s;
    }
    // the safety cap still fits a sensible picture
    expect(nestSceneSize(256, 128).width).toBeLessThanOrEqual(2000);
    for (const [p, l] of [[1, 1], [7, 5], [20, 12], [80, 40]]) {
      const lt = grown(5, 8, p, l);
      const s = nestSceneSize(p, l);
      expect([lt.width, lt.height]).toEqual([s.width, s.height]);
    }
  });

  it('layout with 20 pantries and 12 larvae chambers has no overlapping chambers', () => {
    for (const seed of growSeeds) {
      const lt = grown(seed, 8, 20, 12);
      expect(lt.chambers.filter((c) => c.kind === 'pantry')).toHaveLength(20);
      expect(lt.chambers.filter((c) => c.kind === 'larvae')).toHaveLength(12);
      expect(new Set(lt.chambers.map((c) => c.id)).size).toBe(lt.chambers.length);
      const big = lt.chambers.map((c) => ({ ...c, rx: c.rxMax, ry: c.ryMax }));
      for (let a = 0; a < big.length; a++) {
        const A = big[a];
        const ea = maxExtent(A);
        // inside the scene and below the soil line
        expect(A.cx - ea.rx, `${seed} ${A.id}`).toBeGreaterThanOrEqual(3);
        expect(A.cx + ea.rx, `${seed} ${A.id}`).toBeLessThanOrEqual(lt.width - 3);
        expect(A.cy - ea.ry, `${seed} ${A.id}`).toBeGreaterThan(lt.surfaceY + 8);
        expect(A.cy + FLOOR * A.ry, `${seed} ${A.id}`).toBeLessThanOrEqual(lt.height - 3); // the floor is flat
        for (let b = a + 1; b < big.length; b++) {
          const B = big[b];
          const eb = maxExtent(B);
          if (Math.abs(A.cx - B.cx) > ea.rx + eb.rx + 4 || Math.abs(A.cy - B.cy) > ea.ry + eb.ry + 4) continue;
          for (let y = Math.floor(A.cy - ea.ry); y <= Math.ceil(A.cy + ea.ry); y++) {
            for (let x = Math.floor(A.cx - ea.rx); x <= Math.ceil(A.cx + ea.rx); x++) {
              if (insideChamber(A, x, y, 1) && insideChamber(B, x, y, 1)) throw new Error(`seed ${seed}: ${A.id} overlaps ${B.id}`);
            }
          }
        }
      }
      // no tunnel runs through another chamber
      for (const t of lt.tunnels) {
        for (const c of big) {
          if (t.to === c.id) continue;
          for (const p of t.points) if (insideChamber(c, p.x, p.y, 0.5)) throw new Error(`seed ${seed}: tunnel ${t.to} runs through ${c.id}`);
        }
        for (const p of t.points) {
          expect(p.x).toBeGreaterThanOrEqual(2);
          expect(p.x).toBeLessThanOrEqual(lt.width - 2);
          expect(p.y).toBeLessThanOrEqual(lt.height - 2);
        }
      }
    }
  });

  it('connects every chamber, also the new ones, to the entrance through the tunnel graph', () => {
    for (const seed of growSeeds) {
      for (const [p, l] of [[7, 4], [6, 5], [20, 12], [60, 30]]) {
        const lt = grown(seed, 3, p, l);
        const g = buildGraph(lt.tunnels.map((t) => t.points));
        const d = distancesFrom(g, nearestNode(g, lt.entrance));
        for (const c of lt.chambers) {
          const n = nearestNode(g, { x: c.cx, y: c.cy });
          expect(g.nodes[n], `seed ${seed} ${c.id}`).toEqual({ x: c.cx, y: c.cy });
          expect(Number.isFinite(d.dist[n]), `seed ${seed} ${c.id} reachable`).toBe(true);
        }
      }
    }
  });

  it('adding chambers keeps the positions of the existing ones', () => {
    for (const seed of growSeeds) {
      const small = grown(seed, 8, 6, 4);
      const big = grown(seed, 8, 40, 20);
      for (const c of small.chambers) {
        const o = big.chambers.find((x) => x.id === c.id)!;
        expect([o.cx, o.cy, o.rxMax, o.ryMax], `${seed} ${c.id}`).toEqual([c.cx, c.cy, c.rxMax, c.ryMax]);
        expect(big.tunnels.find((t) => t.to === c.id)).toEqual(small.tunnels.find((t) => t.to === c.id));
      }
      // the new chambers too: growing one kind never moves the other, and more of a kind never moves the earlier ones
      const mid = grown(seed, 8, 25, 9);
      for (const c of mid.chambers) {
        const o = big.chambers.find((x) => x.id === c.id)!;
        expect([o.cx, o.cy], `${seed} ${c.id}`).toEqual([c.cx, c.cy]);
        expect(big.tunnels.find((t) => t.to === c.id)).toEqual(mid.tunnels.find((t) => t.to === c.id));
      }
      const onlyPantries = grown(seed, 8, 40, 4);
      for (const c of onlyPantries.chambers) {
        const o = big.chambers.find((x) => x.id === c.id)!;
        expect([o.cx, o.cy], `${seed} ${c.id}`).toEqual([c.cx, c.cy]);
      }
    }
  });

  it('layout is deterministic for the same seed and counts', () => {
    for (const seed of growSeeds) {
      const a = JSON.stringify(grown(seed, 5, 33, 17));
      const b = JSON.stringify(grown(seed, 5, 33, 17));
      expect(a).toBe(b);
    }
    expect(JSON.stringify(grown(5, 5, 33, 17).chambers.slice(18))).not.toBe(JSON.stringify(grown(6, 5, 33, 17).chambers.slice(18)));
  });

  it('is the same layout as today for counts within the old limits, and clamps them without the normal flag', () => {
    for (const seed of growSeeds) {
      for (const [q, p, l] of [[1, 1, 1], [3, 2, 4], [8, 6, 4]]) {
        const loads = { ants: 50, pantry: [25, 10], larvae: [10, 3] };
        const old = lay({ seed, queens: q, pantries: p, larvaeChambers: l, loads });
        expect(lay({ seed, queens: q, pantries: p, larvaeChambers: l, loads, unbounded: true })).toEqual(old);
        expect([old.width, old.height]).toEqual([320, 200]);
      }
      const clamped = lay({ seed, queens: 8, pantries: 40, larvaeChambers: 20 });
      expect(clamped.chambers).toHaveLength(18);
      expect([clamped.width, clamped.height]).toEqual([320, 200]);
    }
  });

  it('builds the largest nest (the safety cap) quickly enough', () => {
    const t0 = performance.now();
    const lt = grown(5, 8, 256, 128);
    expect(lt.chambers).toHaveLength(8 + 256 + 128);
    expect(performance.now() - t0).toBeLessThan(5000);
    const t1 = performance.now();
    for (let k = 0; k < 50; k++) grown(5, 8, 256, 128);
    expect(performance.now() - t1).toBeLessThan(500);
  }, 30000);
});
