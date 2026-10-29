import { describe, expect, it } from 'vitest';
import { buildGraph, nearestNode, pathLength, shortestPath, type Pt } from './nestGraph';

// A small hand-made network:
//
//   A(0,0) --10-- B(10,0) --10-- C(20,0)
//                  |                |
//                  5               30 (long way round)
//                  |                |
//                 D(10,5) -------- E(20,30)   dead end F(10,-8) hangs off B
const A = { x: 0, y: 0 };
const B = { x: 10, y: 0 };
const C = { x: 20, y: 0 };
const D = { x: 10, y: 5 };
const E = { x: 20, y: 30 };
const F = { x: 10, y: -8 };
const lines: Pt[][] = [[A, B, C], [B, D, E], [C, E], [B, F]];

describe('nestGraph', () => {
  it('merges shared points and finds the shortest path', () => {
    const g = buildGraph(lines);
    expect(g.nodes).toHaveLength(6);
    const p = shortestPath(g, A, E)!;
    // A-B-C-E = 10 + 10 + 30 = 50; A-B-D-E = 10 + 5 + hypot(10, 25) = 42.9 -> the latter
    expect(p[0]).toEqual(A);
    expect(p[p.length - 1]).toEqual(E);
    expect(p).toContainEqual(D);
    expect(pathLength(p)).toBeCloseTo(15 + Math.hypot(10, 25), 6);
    expect(pathLength(shortestPath(g, F, C)!)).toBeCloseTo(8 + 10, 6);
  });

  it('is symmetric, handles the same node and snaps to the nearest node', () => {
    const g = buildGraph(lines);
    const ab = shortestPath(g, A, E)!;
    const ba = shortestPath(g, E, A)!;
    expect(ba).toEqual(ab.slice().reverse());
    expect(shortestPath(g, C, C)).toEqual([C]);
    expect(g.nodes[nearestNode(g, { x: 9.2, y: 4.1 })]).toEqual(D);
    expect(shortestPath(g, { x: 0.3, y: 0.2 }, { x: 19.6, y: 0.4 })!.map((p) => p.x)).toEqual([0, 10, 20]);
  });

  it('returns null between disconnected parts', () => {
    const g = buildGraph([[A, B], [{ x: 100, y: 100 }, { x: 110, y: 100 }]]);
    expect(shortestPath(g, A, { x: 110, y: 100 })).toBeNull();
  });

  it('prefers the geometrically shorter of two routes even with many small steps', () => {
    const detour: Pt[] = [];
    for (let i = 0; i <= 20; i++) detour.push({ x: i * 5, y: 40 * Math.sin((i / 20) * Math.PI) });
    const direct: Pt[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const g = buildGraph([detour, direct]);
    const p = shortestPath(g, { x: 0, y: 0 }, { x: 100, y: 0 })!;
    expect(p).toHaveLength(2);
  });
});
