/**
 * The tunnel network as a plain graph: every polyline point is a node (points with the same coordinates are one node, which is
 * how a side tunnel joins the one it branches from), consecutive points are joined by an edge as long as the distance between
 * them. Shortest paths come from Dijkstra with a binary heap. Pure functions, no state.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Graph {
  nodes: Pt[];
  adj: { to: number; w: number }[][];
  index: Map<string, number>;
}

const key = (p: Pt): string => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

export function buildGraph(polylines: readonly (readonly Pt[])[]): Graph {
  const nodes: Pt[] = [];
  const adj: { to: number; w: number }[][] = [];
  const index = new Map<string, number>();
  const node = (p: Pt): number => {
    const k = key(p);
    let i = index.get(k);
    if (i === undefined) {
      i = nodes.length;
      nodes.push({ x: p.x, y: p.y });
      adj.push([]);
      index.set(k, i);
    }
    return i;
  };
  for (const line of polylines) {
    let prev = -1;
    for (const p of line) {
      const i = node(p);
      if (prev >= 0 && prev !== i) {
        const w = Math.hypot(nodes[i].x - nodes[prev].x, nodes[i].y - nodes[prev].y);
        adj[prev].push({ to: i, w });
        adj[i].push({ to: prev, w });
      }
      prev = i;
    }
  }
  return { nodes, adj, index };
}

/** Index of the node closest to `p` (-1 for an empty graph). */
export function nearestNode(g: Graph, p: Pt): number {
  const exact = g.index.get(key(p));
  if (exact !== undefined) return exact;
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < g.nodes.length; i++) {
    const d = (g.nodes[i].x - p.x) ** 2 + (g.nodes[i].y - p.y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

export interface Distances {
  dist: Float64Array;
  prev: Int32Array;
}

/** Dijkstra from one node: path lengths to every node (Infinity when unreachable) and the predecessor tree. */
export function distancesFrom(g: Graph, src: number): Distances {
  const n = g.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  if (src < 0 || src >= n) return { dist, prev };
  dist[src] = 0;
  // binary min-heap of [distance, node]
  const hd: number[] = [0];
  const hn: number[] = [src];
  const swap = (a: number, b: number): void => {
    [hd[a], hd[b]] = [hd[b], hd[a]];
    [hn[a], hn[b]] = [hn[b], hn[a]];
  };
  while (hd.length) {
    const d = hd[0];
    const u = hn[0];
    const ld = hd.pop()!;
    const ln = hn.pop()!;
    if (hd.length) {
      hd[0] = ld;
      hn[0] = ln;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < hd.length && hd[l] < hd[m]) m = l;
        if (r < hd.length && hd[r] < hd[m]) m = r;
        if (m === i) break;
        swap(i, m);
        i = m;
      }
    }
    if (d > dist[u]) continue;
    for (const e of g.adj[u]) {
      const nd = d + e.w;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = u;
        hd.push(nd);
        hn.push(e.to);
        let i = hd.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (hd[p] <= hd[i]) break;
          swap(i, p);
          i = p;
        }
      }
    }
  }
  return { dist, prev };
}

/** The node chain from the source of `d` to `dst` (null when unreachable). */
export function pathFrom(g: Graph, d: Distances, dst: number): Pt[] | null {
  if (dst < 0 || dst >= g.nodes.length || !Number.isFinite(d.dist[dst])) return null;
  const out: Pt[] = [];
  for (let i = dst; i >= 0; i = d.prev[i]) out.push({ x: g.nodes[i].x, y: g.nodes[i].y });
  return out.reverse();
}

/** Shortest polyline from the node nearest to `from` to the node nearest to `to` (null when they are not connected). */
export function shortestPath(g: Graph, from: Pt, to: Pt): Pt[] | null {
  const a = nearestNode(g, from);
  const b = nearestNode(g, to);
  if (a < 0 || b < 0) return null;
  return pathFrom(g, distancesFrom(g, a), b);
}

export function pathLength(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}
