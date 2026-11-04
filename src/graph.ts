// The Shannon switching game on a multigraph, and three ways to decide it.
//
// Short claims an edge (we contract it), Cut deletes one. Short wins when the
// two terminals s and t meet, Cut wins when they are disconnected.
//
// Lehman (1964): with Cut to move, Short wins iff some vertex set S ∋ s, t
// carries two edge-disjoint spanning trees of G[S]. With Short to move, Short
// wins iff some contraction G/e satisfies that.
//
//   secondWins       — the (2,2) pebble game (Lee & Streinu): the criterion
//                      holds iff the pair {s, t} is dependent in the
//                      (2,2)-sparsity matroid, i.e. 3 pebbles cannot be
//                      gathered on s and t.
//   secondWinsBrute  — Nash-Williams–Tutte by brute force: every S ∋ s, t and
//                      every partition of S.
//   Minimax          — the game itself, with a memo shared across graphs.
//   treePacking      — two edge-disjoint forests of maximum total size
//                      (Edmonds' matroid partition), for drawing the trees.

export type Edge = readonly [number, number];

/** Vertices 0..n−1. Edges may repeat; loops are allowed and never help. */
export interface Graph {
  n: number;
  edges: Edge[];
}

// ---------------------------------------------------------------- pebbles

/** A finished (2,2) pebble game: the accepted edges, oriented. */
export class Pebbles {
  readonly peb: Int32Array;
  readonly out: number[][]; // out[v] = heads of accepted edges whose pebble left v
  readonly accepted: number[] = [];
  private mark: Int32Array;
  private stamp = 0;

  readonly n: number;
  constructor(n: number) {
    this.n = n;
    this.peb = new Int32Array(n).fill(2);
    this.out = Array.from({ length: n }, () => []);
    this.mark = new Int32Array(n);
  }

  /** Move one free pebble to v without touching the vertices in `keep`. */
  private fetch(v: number, keep: number[]): boolean {
    this.stamp++;
    const st = this.stamp;
    for (const k of keep) this.mark[k] = st;
    this.mark[v] = st;
    // DFS along out-edges for a vertex holding a pebble.
    const parent = new Map<number, number>();
    const stack = [v];
    while (stack.length) {
      const x = stack.pop()!;
      for (const y of this.out[x]) {
        if (this.mark[y] === st) continue;
        this.mark[y] = st;
        parent.set(y, x);
        if (this.peb[y] > 0) {
          // Reverse the path v → … → x → y.
          this.peb[y]--;
          let w = y;
          while (w !== v) {
            const p = parent.get(w)!;
            const o = this.out[p];
            o.splice(o.indexOf(w), 1);
            this.out[w].push(p);
            w = p;
          }
          this.peb[v]++;
          return true;
        }
        stack.push(y);
      }
    }
    return false;
  }

  /** Gather as many pebbles as possible on u and v (each holds at most 2). */
  gather(u: number, v: number): number {
    if (u === v) {
      while (this.peb[u] < 2 && this.fetch(u, [])) {}
      return this.peb[u];
    }
    while (this.peb[u] < 2 && this.fetch(u, [v])) {}
    while (this.peb[v] < 2 && this.fetch(v, [u])) {}
    return this.peb[u] + this.peb[v];
  }

  /** Try to accept edge (u, v); true if it is independent. */
  add(u: number, v: number, id: number): boolean {
    if (u === v) return false; // a loop needs 3 pebbles on one vertex
    if (this.gather(u, v) < 3) return false;
    const from = this.peb[u] > 0 ? u : v;
    const to = from === u ? v : u;
    this.peb[from]--;
    this.out[from].push(to);
    this.accepted.push(id);
    return true;
  }
}

export function pebbleGame(g: Graph): Pebbles {
  const p = new Pebbles(g.n);
  g.edges.forEach(([u, v], i) => p.add(u, v, i));
  return p;
}

/** Lehman's criterion with Cut to move, by the pebble game. */
export function secondWins(g: Graph, s: number, t: number): boolean {
  if (s === t) return true;
  const p = pebbleGame(g);
  return p.gather(s, t) < 3;
}

/** Contract edge i: its endpoints become one vertex (the smaller label). */
export function contract(g: Graph, i: number): { g: Graph; map: (v: number) => number } {
  const [a, b] = g.edges[i];
  const keep = Math.min(a, b), gone = Math.max(a, b);
  const map = (v: number) => (v === gone ? keep : v);
  const edges: Edge[] = [];
  g.edges.forEach(([u, v], j) => { if (j !== i) edges.push([map(u), map(v)]); });
  return { g: { n: g.n, edges }, map };
}

export function deleteEdge(g: Graph, i: number): Graph {
  return { n: g.n, edges: g.edges.filter((_, j) => j !== i) };
}

/** With Short to move: a move that leaves secondWins true. */
export function firstWins(g: Graph, s: number, t: number): boolean {
  if (s === t) return true;
  for (let i = 0; i < g.edges.length; i++) {
    const [u, v] = g.edges[i];
    if (u === v) continue;
    const { g: h, map } = contract(g, i);
    if (secondWins(h, map(s), map(t))) return true;
  }
  return false;
}

// ---------------------------------------------------------------- brute force

/** Every set partition of `items`, as block-index arrays (restricted growth strings). */
export function forEachPartition(k: number, f: (block: Int32Array, blocks: number) => boolean | void): void {
  const a = new Int32Array(k);
  const rec = (i: number, max: number): boolean => {
    if (i === k) return f(a, max + 1) === true;
    for (let b = 0; b <= max + 1; b++) {
      a[i] = b;
      if (rec(i + 1, Math.max(max, b))) return true;
    }
    return false;
  };
  if (k === 0) return;
  a[0] = 0;
  rec(1, 0);
}

/** Does G[S] have two edge-disjoint spanning trees? Nash-Williams–Tutte, every partition. */
export function twoTreesBrute(g: Graph, S: number[]): boolean {
  const idx = new Map<number, number>();
  S.forEach((v, i) => idx.set(v, i));
  const inner = g.edges.filter(([u, v]) => idx.has(u) && idx.has(v) && u !== v).map(([u, v]) => [idx.get(u)!, idx.get(v)!]);
  let ok = true;
  forEachPartition(S.length, (block, blocks) => {
    let cross = 0;
    for (const [u, v] of inner) if (block[u] !== block[v]) cross++;
    if (cross < 2 * (blocks - 1)) { ok = false; return true; }
  });
  return ok;
}

export function secondWinsBrute(g: Graph, s: number, t: number): boolean {
  if (s === t) return true;
  const verts = [...new Set(g.edges.flat())].filter((v) => v !== s && v !== t);
  for (let m = 0; m < 1 << verts.length; m++) {
    const S = [s, t];
    verts.forEach((v, i) => { if (m >> i & 1) S.push(v); });
    if (twoTreesBrute(g, S)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- minimax

/** Plays the game out. memo is keyed by the multiset of edges left, so it can be shared. */
export class Minimax {
  readonly memo = new Map<string, boolean>();
  nodes = 0;
  /** Called once per new state: (graph, s, t, shortToMove, shortWins). */
  readonly onState?: (g: Graph, s: number, t: number, shortToMove: boolean, win: boolean) => void;
  /** Drop dead edges (on no simple s–t path) before every lookup. */
  readonly prune: boolean;
  /**
   * Try Short's moves that Lehman's criterion calls winning first. Only the
   * order of the search changes; the answer still comes from playing it out.
   */
  readonly ordered: boolean;
  constructor(onState?: (g: Graph, s: number, t: number, shortToMove: boolean, win: boolean) => void, prune = false, ordered = false) {
    this.onState = onState;
    this.prune = prune;
    this.ordered = ordered;
  }

  solve(g: Graph, s: number, t: number, shortToMove: boolean): boolean {
    if (s === t) return true;
    // Drop loops: they are nobody's business.
    let edges = g.edges.filter(([u, v]) => u !== v).map(([u, v]) => (u < v ? [u, v] : [v, u]) as Edge);
    if (!connected(g.n, edges, s, t)) return false;
    if (this.prune) edges = liveEdges(g.n, edges, s, t);
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const key = (shortToMove ? 'S' : 'C') + String.fromCharCode(s, t) + edges.map(([u, v]) => String.fromCharCode(u * 64 + v)).join('');
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    this.nodes++;
    const h: Graph = { n: g.n, edges };
    let win: boolean;
    if (shortToMove) {
      win = false;
      const idx: number[] = [];
      for (let i = 0; i < edges.length; i++) {
        if (i > 0 && edges[i][0] === edges[i - 1][0] && edges[i][1] === edges[i - 1][1]) continue;
        idx.push(i);
      }
      const tries = this.ordered
        ? idx.map((i) => { const { g: c, map } = contract(h, i); return { c, s2: map(s), t2: map(t), good: secondWins(c, map(s), map(t)) }; })
            .sort((a, b) => Number(b.good) - Number(a.good))
        : null;
      for (let k = 0; k < idx.length && !win; k++) {
        if (tries) win = this.solve(tries[k].c, tries[k].s2, tries[k].t2, false);
        else {
          const { g: c, map } = contract(h, idx[k]);
          win = this.solve(c, map(s), map(t), false);
        }
      }
    } else {
      win = true;
      for (let i = 0; i < edges.length && win; i++) {
        if (i > 0 && edges[i][0] === edges[i - 1][0] && edges[i][1] === edges[i - 1][1]) continue;
        win = this.solve(deleteEdge(h, i), s, t, true);
      }
    }
    this.memo.set(key, win);
    this.onState?.(h, s, t, shortToMove, win);
    return win;
  }
}

/**
 * The edges lying on some simple s–t path: those in the same biconnected
 * block as an extra edge s–t (Tarjan). The others are dead for good — a
 * contraction or deletion never puts them on a path — and a move on one is a
 * pass, which never beats a real move in this game, so dropping them keeps
 * the outcome. (Checked against the unpruned search in the tests.)
 */
export function liveEdges(n: number, edges: readonly Edge[], s: number, t: number): Edge[] {
  const all: Edge[] = [...edges, [s, t]];
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  all.forEach(([u, v], i) => { if (u !== v) { adj[u].push([v, i]); adj[v].push([u, i]); } });
  const disc = new Int32Array(n).fill(-1), low = new Int32Array(n);
  const stack: number[] = [];
  let time = 0;
  const virt = all.length - 1;
  let keep: number[] | null = null;
  const dfs = (u: number, pe: number) => {
    disc[u] = low[u] = time++;
    for (const [v, id] of adj[u]) {
      if (id === pe) continue;
      if (disc[v] === -1) {
        stack.push(id);
        dfs(v, id);
        low[u] = Math.min(low[u], low[v]);
        if (low[v] >= disc[u]) {
          // pop one block
          const block: number[] = [];
          let x: number;
          do { x = stack.pop()!; block.push(x); } while (x !== id);
          if (block.includes(virt)) keep = block;
        }
      } else if (disc[v] < disc[u]) {
        stack.push(id);
        low[u] = Math.min(low[u], disc[v]);
      }
    }
  };
  dfs(s, -1);
  const k = new Set<number>(keep ?? []);
  return edges.filter((_, i) => k.has(i));
}

export function connected(n: number, edges: readonly Edge[], s: number, t: number): boolean {
  const p = Int32Array.from({ length: n }, (_, i) => i);
  const f = (x: number): number => (p[x] === x ? x : (p[x] = f(p[x])));
  for (const [u, v] of edges) p[f(u)] = f(v);
  return f(s) === f(t);
}

// ---------------------------------------------------------------- two trees

/** Path between a and b inside a forest given as edge ids, or null. */
function forestPath(n: number, g: Graph, forest: Set<number>, a: number, b: number): number[] | null {
  if (a === b) return [];
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  for (const id of forest) {
    const [u, v] = g.edges[id];
    adj[u].push([v, id]);
    adj[v].push([u, id]);
  }
  const via = new Map<number, [number, number]>();
  via.set(a, [-1, -1]);
  const q = [a];
  while (q.length) {
    const x = q.shift()!;
    if (x === b) break;
    for (const [y, id] of adj[x]) if (!via.has(y)) { via.set(y, [x, id]); q.push(y); }
  }
  if (!via.has(b)) return null;
  const path: number[] = [];
  for (let x = b; x !== a; ) { const [p, id] = via.get(x)!; path.push(id); x = p; }
  return path;
}

/**
 * Two edge-disjoint forests with |F1| + |F2| maximum (Edmonds' matroid
 * partition, shortest augmenting paths). Returns the edge ids of each forest.
 */
export function treePacking(g: Graph): [number[], number[]] {
  const F: [Set<number>, Set<number>] = [new Set(), new Set()];
  const where = new Int32Array(g.edges.length).fill(-1);
  for (let x = 0; x < g.edges.length; x++) {
    if (g.edges[x][0] === g.edges[x][1]) continue;
    // BFS over elements; label[z] = [parent element, forest z is pushed out of]
    const label = new Map<number, [number, number]>();
    label.set(x, [-1, -1]);
    const q = [x];
    let end: [number, number] | null = null; // [element, forest it enters freely]
    while (q.length && !end) {
      const y = q.shift()!;
      const [a, b] = g.edges[y];
      for (let i = 0; i < 2 && !end; i++) {
        if (where[y] === i) continue;
        const path = forestPath(g.n, g, F[i], a, b);
        if (path === null) { end = [y, i]; break; }
        for (const z of path) if (!label.has(z)) { label.set(z, [y, i]); q.push(z); }
      }
    }
    if (!end) continue;
    // Augment: y enters F_i; then for each step back, the parent enters the forest the child left.
    let [cur, into] = end;
    while (cur !== -1) {
      if (where[cur] >= 0) F[where[cur]].delete(cur);
      F[into].add(cur);
      const from = label.get(cur)!;
      where[cur] = into;
      // `from` = [parent, forest cur was pushed out of]; the parent takes that slot.
      const [parent, slot] = from;
      cur = parent;
      into = slot;
    }
  }
  return [[...F[0]], [...F[1]]];
}

/** The rank of the 2-fold union of the cycle matroid, by brute force over edge subsets (small graphs). */
export function unionRankBrute(g: Graph): number {
  const m = g.edges.length;
  let best = Infinity;
  for (let mask = 0; mask < 1 << m; mask++) {
    // rank(X) = n − components of (V, X), restricted to touched vertices
    const p = Int32Array.from({ length: g.n }, (_, i) => i);
    const f = (x: number): number => (p[x] === x ? x : (p[x] = f(p[x])));
    let r = 0, out = 0;
    for (let i = 0; i < m; i++) {
      if (mask >> i & 1) {
        const a = f(g.edges[i][0]), b = f(g.edges[i][1]);
        if (a !== b) { p[a] = b; r++; }
      } else out++;
    }
    best = Math.min(best, out + 2 * r);
  }
  return best;
}
