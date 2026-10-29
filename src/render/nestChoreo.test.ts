import { describe, expect, it } from 'vitest';
import { ANT_RGBA, antDirection, CALLOW_RGBA } from './antArt';
import {
  HATCH_LEAVE_S,
  MAX_NEST_WALK,
  MOUTH_RISE,
  NURSE_CYCLE_S,
  nestAntPose,
  nurseCycleS,
  UNLOAD_NOMINAL_S,
  type NestAntLike,
  type NestPose,
} from './nestChoreo';
import { paintedPoints } from './nestArt';
import { buildGraph, distancesFrom, nearestNode } from './nestGraph';
import { insideChamber, nestLayout, type Chamber, type NestLayout, type Pt } from './nestLayout';

const layoutFor = (queens: number, ants = 40, pantries = 2, larvaeChambers = 2, seed = 7): NestLayout =>
  nestLayout({
    seed,
    queens,
    pantries,
    larvaeChambers,
    loads: { ants, pantry: [25, 12, 5, 0, 0, 0].slice(0, pantries), larvae: [10, 4, 1, 0].slice(0, larvaeChambers) },
    width: 320,
    height: 200,
  });

const nurse = (id: number): NestAntLike => ({ id, role: 'nurse', nestKind: 'nurse', timer: 0 });
const hatch = (id: number, timer: number): NestAntLike => ({ id, role: 'forager', nestKind: 'hatch', timer });
const unload = (id: number, timer: number): NestAntLike => ({ id, role: 'forager', nestKind: 'unload', timer });

const FRAME = 1 / 30;
/** The speed limit (art px/s x FINE) expressed per frame, plus a little slack for the per-id offsets. */
const STEP_LIMIT = MAX_NEST_WALK * FRAME + 0.05;
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when the point lies inside a chamber outline (+ tolerance) or within half a tunnel width (+ tolerance) of a tunnel polyline. */
function insideGeometry(p: Pt, layout: NestLayout, tol = 1): boolean {
  for (const c of layout.chambers) if (insideChamber(c, p.x, p.y, tol)) return true;
  for (const t of layout.tunnels) {
    const pts = paintedPoints(t, layout.entrance.y - MOUTH_RISE);
    for (let i = 0; i + 1 < pts.length; i++) {
      const w = (t.widths[Math.min(i, t.widths.length - 1)] ?? t.width) / 2;
      if (segDist(p, pts[i], pts[i + 1]) <= w + tol) return true;
    }
  }
  return false;
}
const inChamber = (p: Pt, c: Chamber, pad = 0): boolean => insideChamber(c, p.x, p.y, pad);
const ofKind = (l: NestLayout, kind: Chamber['kind']): Chamber[] => l.chambers.filter((c) => c.kind === kind);
const inAny = (p: Pt, cs: Chamber[], pad = 0): boolean => cs.some((c) => inChamber(p, c, pad));
const mouth = (l: NestLayout): Pt => ({ x: l.entrance.x, y: l.entrance.y - MOUTH_RISE });

describe('nestAntPose: purity', () => {
  it('returns the same pose for the same inputs, does not touch the ant and is finite', () => {
    const l = layoutFor(3);
    const ants = [nurse(3), hatch(7, 18.2), hatch(8, 3.1), unload(9, 3.3), unload(10, 5)];
    for (const a of ants) {
      const copy = JSON.stringify(a);
      for (const t of [0, 1.7, 33.3, 120]) {
        const p1 = nestAntPose(a, l, t);
        const p2 = nestAntPose(a, layoutFor(3), t); // a different layout object with the same numbers
        expect(p1).toEqual(p2);
        for (const v of [p1.x, p1.y]) expect(Number.isFinite(v)).toBe(true);
        expect(p1.dir16).toBeGreaterThanOrEqual(0);
        expect(p1.dir16).toBeLessThan(16);
        expect([0, 1, 2, 3]).toContain(p1.frame);
        expect(['walk', 'stand', 'feed', 'tend']).toContain(p1.pose);
      }
      expect(JSON.stringify(a)).toBe(copy);
    }
  });

  it('can write into a reusable pose object', () => {
    const l = layoutFor(2);
    const out: NestPose = { x: 0, y: 0, dir16: 0, frame: 0, carrying: null, pose: 'walk', callow: false, queen: -1 };
    const r = nestAntPose(nurse(4), l, 5, out);
    expect(r).toBe(out);
    expect(out).toEqual(nestAntPose(nurse(4), l, 5));
  });
});

describe('nestAntPose: continuity and geometry', () => {
  it('nurses never move faster than the walking limit over a full cycle and stay in the tunnels / chambers', () => {
    for (const [queens, pantries, larvae] of [[1, 1, 1], [3, 3, 2], [8, 6, 4]]) {
      const l = layoutFor(queens, 40, pantries, larvae);
      for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        let prev: NestPose | null = null;
        const cycle = nurseCycleS(nurse(id), l);
        for (let t = 0; t <= cycle * 2 + 3; t += FRAME) {
          const p = nestAntPose(nurse(id), l, t);
          if (prev) expect(dist(prev, p), `queens ${queens} id ${id} t ${t.toFixed(2)}`).toBeLessThanOrEqual(STEP_LIMIT);
          expect(insideGeometry(p, l), `queens ${queens} id ${id} t ${t.toFixed(2)} at ${p.x.toFixed(1)},${p.y.toFixed(1)}`).toBe(true);
          prev = { ...p };
        }
      }
    }
  });

  it('a hatchling is continuous over its whole stay and stays in the tunnels / chambers', () => {
    for (const [queens, pantries, larvae] of [[1, 1, 1], [4, 3, 3]]) {
      const l = layoutFor(queens, 40, pantries, larvae);
      for (const id of [2, 5, 11, 40]) {
        for (const total of [25.5, 30, 34.5]) {
          let prev: NestPose | null = null;
          const t0 = 100 + id * 0.37;
          for (let k = 0; ; k++) {
            const timer = total - k * FRAME;
            const p = nestAntPose(hatch(id, Math.max(0, timer)), l, t0 + k * FRAME);
            if (prev) expect(dist(prev, p), `id ${id} total ${total} timer ${timer.toFixed(2)}`).toBeLessThanOrEqual(STEP_LIMIT);
            expect(insideGeometry(p, l), `id ${id} timer ${timer.toFixed(2)} at ${p.x.toFixed(1)},${p.y.toFixed(1)}`).toBe(true);
            prev = { ...p };
            if (timer <= 0) break;
          }
        }
      }
    }
  });

  it('an unloading forager is continuous over its whole stay, for stays from 4 to 6 s', () => {
    const l = layoutFor(3);
    for (const id of [1, 6, 13]) {
      for (const total of [4, 5, 6]) {
        let prev: NestPose | null = null;
        const t0 = 50;
        for (let k = 0; ; k++) {
          const timer = total - k * FRAME;
          const p = nestAntPose(unload(id, Math.max(0, timer)), l, t0 + k * FRAME);
          // the first sample of a stay starts at the mouth; nothing jumps afterwards
          if (prev) expect(dist(prev, p), `id ${id} total ${total} timer ${timer.toFixed(2)}`).toBeLessThanOrEqual(STEP_LIMIT);
          expect(insideGeometry(p, l), `id ${id} timer ${timer.toFixed(2)}`).toBe(true);
          prev = { ...p };
          if (timer <= 0) break;
        }
      }
    }
  });

  it('every walker of every kind is on a tunnel or in a chamber: 200 seeds x load states x 300 times', () => {
    const states: [number, number, number, number][] = [[1, 1, 1, 1], [3, 2, 2, 40], [6, 1, 1, 101], [8, 6, 4, 300]];
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const seed = i * 7919 + 3;
      const [queens, pantries, larvae, ants] = states[i % states.length];
      const l = layoutFor(queens, ants, pantries, larvae, seed);
      const walkers: NestAntLike[] = [];
      for (let id = 1; id <= 9; id++) walkers.push(nurse(id));
      for (let id = 10; id <= 14; id++) walkers.push(hatch(id, 2 + (id % 4) * 8), unload(id + 10, 0.4 + (id % 5)));
      for (let k = 0; k < 300; k++) {
        const t = k * 0.37 + i;
        for (const w of walkers) {
          const p = nestAntPose(w, l, t);
          // timers of hatchlings / unloaders follow the clock like in the game
          const a = w.nestKind === 'nurse' ? w : { ...w, timer: Math.max(0, w.timer - (k % 40) * 0.1) };
          const q = a === w ? p : nestAntPose(a, l, t);
          if (!insideGeometry(q, l)) throw new Error(`seed ${seed} ${w.nestKind} ${w.id} t ${t.toFixed(2)} at ${q.x.toFixed(1)},${q.y.toFixed(1)} is on bare soil`);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(200 * 300 * 10);
  }, 240000);

  it('walking ants face along the path they follow (the sprite direction is the direction of motion)', () => {
    const l = layoutFor(3);
    let checked = 0;
    let bad = 0;
    for (const id of [1, 2, 3, 4]) {
      for (let t = 0; t < NURSE_CYCLE_S; t += 0.1) {
        const a = nestAntPose(nurse(id), l, t);
        const b = nestAntPose(nurse(id), l, t + 0.05);
        if (a.pose !== 'walk' || b.pose !== 'walk' || dist(a, b) < 0.4) continue;
        const want = antDirection(Math.atan2(b.y - a.y, b.x - a.x));
        const off = Math.min((a.dir16 - want + 16) % 16, (want - a.dir16 + 16) % 16);
        if (off > 2) bad++;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(bad / checked).toBeLessThan(0.12);
  });
});

describe('nestAntPose: nurses', () => {
  it('different ids are out of step: poses of 8 nurses are rarely equal and never all the same', () => {
    const l = layoutFor(3);
    for (let t = 3; t < 60; t += 3.7) {
      const ps = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => nestAntPose(nurse(id), l, t));
      const keys = new Set(ps.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
      expect(keys.size, `t ${t}`).toBeGreaterThanOrEqual(6);
    }
    // nobody sits on the same pixels for long: two nurses of the same queen coincide in at most 8 % of the samples
    for (const [a, b] of [[1, 4], [2, 5], [3, 6], [1, 7]]) {
      let same = 0;
      let n = 0;
      for (let t = 0; t < NURSE_CYCLE_S * 3; t += 0.2) {
        const pa = nestAntPose(nurse(a), l, t);
        const pb = nestAntPose(nurse(b), l, t);
        if (Math.round(pa.x) === Math.round(pb.x) && Math.round(pa.y) === Math.round(pb.y)) same++;
        n++;
      }
      expect(same / n, `${a} vs ${b}`).toBeLessThan(0.08);
    }
  });

  it('repeats every cycle (24 s, or longer when the tunnels are so long that the walking speed limit needs it)', () => {
    expect(NURSE_CYCLE_S).toBeGreaterThanOrEqual(20);
    expect(NURSE_CYCLE_S).toBeLessThanOrEqual(28);
    const l = layoutFor(3);
    for (const id of [1, 2, 3]) {
      const cycle = nurseCycleS(nurse(id), l);
      expect(cycle).toBeGreaterThanOrEqual(NURSE_CYCLE_S);
      expect(cycle).toBeLessThan(40);
      for (const t of [0.4, 7.7, 19.9]) {
        const a = nestAntPose(nurse(id), l, t);
        const b = nestAntPose(nurse(id), l, t + cycle);
        expect(b.x).toBeCloseTo(a.x, 6);
        expect(b.y).toBeCloseTo(a.y, 6);
        expect(b.pose).toBe(a.pose);
        expect(b.carrying).toBe(a.carrying);
      }
    }
  });

  it('goes through all phases: pantry -> queen (crumb) -> feed -> egg to the larvae -> tend -> back', () => {
    for (const [queens, pantries, larvaeN] of [[1, 1, 1], [3, 2, 2], [8, 6, 4]]) {
      const l = layoutFor(queens, 40, pantries, larvaeN);
      const pantry = ofKind(l, 'pantry');
      const larvae = ofKind(l, 'larvae');
      for (const id of [1, 2, 3, 4, 9]) {
        const q = l.chambers.find((c) => c.id === `queen${id % queens}`)!;
        const poses = new Set<string>();
        let crumbWalk = 0;
        let feedInQueen = 0;
        let feeds = 0;
        let eggWalk = 0;
        let eggStart: Pt | null = null;
        let eggEnd: Pt | null = null;
        let eggDone: Pt | null = null;
        let prevEgg = false;
        let prevPos: Pt | null = null;
        let tendInLarvae = 0;
        let tends = 0;
        let sawPantryStand = false;
        const cycle = nurseCycleS(nurse(id), l);
        for (let t = 0; t < cycle * 2; t += 0.05) {
          const p = nestAntPose(nurse(id), l, t);
          poses.add(p.pose);
          expect(p.callow).toBe(false);
          expect(p.queen).toBe(id % queens);
          if (p.carrying === 'crumb' && p.pose === 'walk') crumbWalk++;
          if (p.pose === 'feed') {
            feeds++;
            if (inChamber(p, q, 1)) feedInQueen++;
            expect(p.carrying === 'crumb' || p.carrying === null).toBe(true);
          }
          const eggStep = p.carrying === 'egg' && p.pose === 'walk';
          if (eggStep) {
            eggWalk++;
            if (!prevEgg && t > 0) eggStart = { x: p.x, y: p.y };
            eggEnd = { x: p.x, y: p.y };
          } else if (prevEgg && eggStart) {
            eggDone = { x: prevPos!.x, y: prevPos!.y };
          }
          prevEgg = eggStep;
          prevPos = { x: p.x, y: p.y };
          if (p.pose === 'tend') {
            tends++;
            if (inAny(p, larvae, 1)) tendInLarvae++;
          }
          if (p.pose === 'stand' && inAny(p, pantry, 1)) sawPantryStand = true;
        }
        const tag = `queens ${queens} id ${id}`;
        for (const k of ['walk', 'stand', 'feed', 'tend']) expect(poses.has(k), `${tag} ${k}`).toBe(true);
        expect(crumbWalk, tag).toBeGreaterThan(20);
        expect(feeds, tag).toBeGreaterThanOrEqual(40); // about 3 s at 20 samples/s, minus the part that is not feeding
        expect(feedInQueen, tag).toBe(feeds);
        expect(eggWalk, tag).toBeGreaterThan(20);
        expect(eggStart, `${tag} egg run seen`).not.toBeNull();
        expect(inChamber(eggStart!, q, 2), `${tag} egg starts at the queen`).toBe(true);
        expect(inAny(eggDone ?? eggEnd!, larvae, 2), `${tag} egg ends at the larvae`).toBe(true);
        expect(tends, tag).toBeGreaterThan(30);
        expect(tendInLarvae, tag).toBe(tends);
        expect(sawPantryStand, tag).toBe(true);
      }
    }
  });

  it('feeds from one of the two nearest pantries and brings the egg to the nearest larvae chamber', () => {
    const l = layoutFor(4, 40, 5, 3, 21);
    const queens = ofKind(l, 'queen');
    const pantries = ofKind(l, 'pantry');
    const larvae = ofKind(l, 'larvae');
    const g = buildGraph(l.tunnels.map((t) => t.points));
    const near = (list: Chamber[], c: Chamber): Chamber[] => {
      const d = distancesFrom(g, nearestNode(g, { x: c.cx, y: c.cy })).dist;
      return list.slice().sort((a, b) => d[nearestNode(g, { x: a.cx, y: a.cy })] - d[nearestNode(g, { x: b.cx, y: b.cy })]);
    };
    let pantryOk = 0;
    let eggOk = 0;
    let n = 0;
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const q = queens[id % queens.length];
      let firstStand: Pt | null = null;
      let eggPlace: Pt | null = null;
      const cycle = nurseCycleS(nurse(id), l);
      for (let t = 0; t < cycle; t += 0.05) {
        const p = nestAntPose(nurse(id), l, t);
        if (p.pose === 'stand' && p.carrying === null && inAny(p, pantries, 1) && !firstStand) firstStand = { x: p.x, y: p.y };
        if (p.pose === 'tend' && p.carrying === 'egg') eggPlace = { x: p.x, y: p.y };
      }
      n++;
      if (firstStand) {
        const pc = pantries.find((c) => inChamber(firstStand!, c, 1))!;
        if (near(pantries, q).slice(0, 2).includes(pc)) pantryOk++;
      }
      if (eggPlace) {
        const lc = larvae.find((c) => inChamber(eggPlace!, c, 2))!;
        if (near(larvae, q)[0] === lc) eggOk++;
      }
    }
    expect(pantryOk).toBe(n);
    expect(eggOk).toBe(n);
  });

  it('the egg is a carrying value only on the way to the larvae and a crumb only on the way to the queen', () => {
    const l = layoutFor(2);
    let order = '';
    let last = '';
    for (let t = 0; t < nurseCycleS(nurse(3), l); t += 0.05) {
      const c = nestAntPose(nurse(3), l, t).carrying ?? 'none';
      if (c !== last) order += `${c},`;
      last = c;
    }
    const seq = order.split(',').filter(Boolean);
    expect(seq.filter((x) => x === 'crumb').length).toBeLessThanOrEqual(2);
    expect(seq.filter((x) => x === 'egg').length).toBeLessThanOrEqual(2);
    expect(order).toContain('crumb');
    expect(order).toContain('egg');
  });

  it('its gait frame follows the distance walked', () => {
    const l = layoutFor(3);
    const frames = new Set<number>();
    let moved = 0;
    for (let t = 0; t < NURSE_CYCLE_S; t += FRAME) {
      const a = nestAntPose(nurse(2), l, t);
      const b = nestAntPose(nurse(2), l, t + FRAME);
      if (a.pose === 'walk') frames.add(a.frame);
      if (a.pose === 'walk' && b.pose === 'walk' && a.frame !== b.frame) {
        expect(dist(a, b)).toBeGreaterThan(0.1);
        moved++;
      }
    }
    expect(frames.size).toBe(4);
    expect(moved).toBeGreaterThan(10);
  });
});

describe('nestAntPose: hatchlings', () => {
  it('start on the floor of a larvae chamber as callow ants and stay there until 5 s are left', () => {
    for (const queens of [1, 6]) {
      const l = layoutFor(queens);
      const larvae = ofKind(l, 'larvae');
      for (let timer = 34; timer > HATCH_LEAVE_S + 0.05; timer -= 0.7) {
        const p = nestAntPose(hatch(12, timer), l, 200 + (34 - timer));
        expect(p.callow, `timer ${timer}`).toBe(true);
        expect(inChamber(p, larvae[12 % larvae.length]), `timer ${timer} at ${p.x},${p.y}`).toBe(true);
        expect(p.carrying).toBeNull();
      }
    }
  });

  it('pick their larvae chamber by id', () => {
    const l = layoutFor(2, 40, 2, 3);
    const larvae = ofKind(l, 'larvae');
    for (const id of [3, 4, 5, 6]) {
      const p = nestAntPose(hatch(id, 20), l, 10);
      expect(inChamber(p, larvae[id % 3])).toBe(true);
    }
  });

  it('walk along the tunnel and are at the entrance exactly when the timer reaches 0', () => {
    const l = layoutFor(3);
    const m = mouth(l);
    for (const id of [2, 9, 31]) {
      const end = nestAntPose(hatch(id, 0), l, 80);
      expect(end.x).toBeCloseTo(m.x, 6);
      expect(end.y).toBeCloseTo(m.y, 6);
      expect(end.dir16).toBe(12);
      const past = nestAntPose(hatch(id, -2), l, 82);
      expect(past.x).toBeCloseTo(m.x, 6);
      expect(past.y).toBeCloseTo(m.y, 6);
      // 2 s before the end the ant is well on its way (not in the chamber any more), still not at the top
      const mid = nestAntPose(hatch(id, 2), l, 78);
      expect(inAny(mid, ofKind(l, 'larvae'))).toBe(false);
      expect(dist(mid, m)).toBeGreaterThan(5);
      expect(mid.pose).toBe('walk');
    }
  });

  it('a callow is not a worker: nurses and unloading ants are never callow', () => {
    const l = layoutFor(2);
    expect(nestAntPose(nurse(3), l, 4).callow).toBe(false);
    expect(nestAntPose(unload(3, 3), l, 4).callow).toBe(false);
  });
});

describe('nestAntPose: unloading foragers', () => {
  it('start and end at the mouth of the shaft, reach a pantry in between, and carry the crumb only in the first phase', () => {
    for (const queens of [1, 5]) {
      const l = layoutFor(queens, 40, 1, 1);
      const m = mouth(l);
      const pantries = ofKind(l, 'pantry');
      const a = nestAntPose(unload(4, UNLOAD_NOMINAL_S), l, 10);
      expect(dist(a, m)).toBeLessThan(0.01);
      expect(a.dir16).toBe(4);
      expect(a.carrying).toBe('crumb');
      const z = nestAntPose(unload(4, 0), l, 15);
      expect(dist(z, m)).toBeLessThan(0.01);
      expect(z.dir16).toBe(12);
      expect(z.carrying).toBeNull();
      let seq = '';
      let atPantry = false;
      let maxSpeed = 0;
      let prev: NestPose | null = null;
      for (let timer = UNLOAD_NOMINAL_S; timer >= 0; timer -= FRAME) {
        const p = nestAntPose(unload(4, timer), l, 10 + UNLOAD_NOMINAL_S - timer);
        const c = p.carrying ?? 'none';
        if (!seq.endsWith(c)) seq += seq ? `,${c}` : c;
        if (inAny(p, pantries, 1)) atPantry = true;
        if (prev) maxSpeed = Math.max(maxSpeed, dist(prev, p) / FRAME);
        prev = { ...p };
      }
      expect(seq, `queens ${queens}`).toBe('crumb,none');
      expect(atPantry).toBe(true);
      expect(maxSpeed).toBeLessThanOrEqual(MAX_NEST_WALK + 1);
    }
  });

  it('goes to the reachable pantry with the most free room (the first one when it is empty enough, the next when it is full)', () => {
    let second = 0;
    let first = 0;
    for (let seed = 1; seed <= 14; seed++) {
      const mk = (fill0: number): NestLayout =>
        nestLayout({ seed: seed * 31, queens: 1, pantries: 3, larvaeChambers: 1, loads: { ants: 5, pantry: [fill0, 0, 0], larvae: [1] }, width: 320, height: 200 });
      const stands = (l: NestLayout): Chamber | undefined => {
        const ps = ofKind(l, 'pantry');
        const p = nestAntPose(unload(4, 2.3), l, 10);
        return ps.find((c) => inChamber(p, c, 1));
      };
      const empty = stands(mk(0));
      const full = stands(mk(25));
      if (empty?.id === 'pantry0') first++;
      if (full && full.id !== 'pantry0') second++;
    }
    expect(first).toBeGreaterThanOrEqual(10);
    expect(second).toBeGreaterThanOrEqual(0);
  }, 60000);

  it('stands (unloading) for a while at the far end and a short stay is simply drawn nearer the entrance', () => {
    const l = layoutFor(2);
    const stands: number[] = [];
    for (let timer = 5; timer >= 0; timer -= 0.1) if (nestAntPose(unload(4, timer), l, 20).pose === 'stand') stands.push(timer);
    expect(stands.length).toBeGreaterThanOrEqual(6);
  });
});

describe('callow palette', () => {
  it('is a lighter greyish-brown variant of the worker palette without red-dominant pixels', () => {
    expect(CALLOW_RGBA).toHaveLength(ANT_RGBA.length);
    const body = 1;
    expect(CALLOW_RGBA[body]).not.toEqual(ANT_RGBA[body]);
    expect(CALLOW_RGBA[body].slice(0, 3)).toEqual([0x4a, 0x40, 0x38]);
    expect(CALLOW_RGBA[2].slice(0, 3)).toEqual([0x5e, 0x53, 0x48]);
    let differs = 0;
    CALLOW_RGBA.forEach(([r, g, b, a], i) => {
      expect(a).toBe(ANT_RGBA[i][3]);
      if (a > 0 && i !== 5 && i !== 6) {
        expect(r, `entry ${i}`).toBeLessThanOrEqual(g * 1.25 + 1);
        expect(r, `entry ${i}`).toBeGreaterThanOrEqual(b);
        if (r !== ANT_RGBA[i][0] || g !== ANT_RGBA[i][1] || b !== ANT_RGBA[i][2]) differs++;
      }
    });
    expect(differs).toBeGreaterThanOrEqual(4);
    const lum = (c: readonly number[]): number => c[0] + c[1] + c[2];
    expect(lum(CALLOW_RGBA[1])).toBeGreaterThan(lum(ANT_RGBA[1]));
  });
});
