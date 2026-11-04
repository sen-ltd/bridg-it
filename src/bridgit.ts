// Gale's game (Bridg-It) of size n.
//
// Red dots: n rows × (n+1) columns; Red joins the left side to the right.
// Blue dots: (n+1) rows × n columns; Blue joins the top to the bottom.
// Drawn on one lattice, red dot (r, c) sits at (x, y) = (2c, 2r+1) and blue
// dot (r, c) at (2c+1, 2r). A bridge joins two neighbouring dots of one
// colour; red and blue bridges cross at a "slot", so each slot can be taken
// by one player only. Bridges between two dots of the same goal side are
// useless and not offered, which leaves n² + (n−1)² slots.
//
// From Red's side the game is the Shannon switching game on Red's graph,
// with the left column merged into the terminal s (vertex 0) and the right
// column into t (vertex 1): a red bridge is Short claiming an edge, a blue
// bridge across it is Cut deleting it. From Blue's side likewise, on Blue's
// graph. Red's graph has V = n(n−1) + 2 vertices and E = 2n² − 2n + 1 edges:
// exactly one edge short of two spanning trees, 2(V − 1) = 2n² − 2n + 2.

import { type Edge, type Graph, secondWins, treePacking } from './graph.ts';

export type Player = 0 | 1; // 0 = Red (left–right), 1 = Blue (top–bottom)

export interface Slot {
  /** lattice point where the two bridges cross */
  x: number;
  y: number;
  /** the edge in Red's graph and in Blue's graph */
  red: Edge;
  blue: Edge;
  /** true if the red bridge is horizontal */
  redHorizontal: boolean;
}

export interface Board {
  n: number;
  slots: Slot[];
  vertices: number; // in each player's graph
}

export function makeBoard(n: number): Board {
  const rv = (r: number, c: number) => (c === 0 ? 0 : c === n ? 1 : 2 + r * (n - 1) + (c - 1));
  const bv = (r: number, c: number) => (r === 0 ? 0 : r === n ? 1 : 2 + (r - 1) * n + c);
  const slots: Slot[] = [];
  // red horizontal (r, c)–(r, c+1) crosses blue vertical (r, c)–(r+1, c)
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      slots.push({ x: 2 * c + 1, y: 2 * r + 1, red: [rv(r, c), rv(r, c + 1)], blue: [bv(r, c), bv(r + 1, c)], redHorizontal: true });
  // red vertical (r, c)–(r+1, c), 1 ≤ c ≤ n−1, crosses blue horizontal (r+1, c−1)–(r+1, c)
  for (let r = 0; r + 1 < n; r++)
    for (let c = 1; c < n; c++)
      slots.push({ x: 2 * c, y: 2 * r + 2, red: [rv(r, c), rv(r + 1, c)], blue: [bv(r + 1, c - 1), bv(r + 1, c)], redHorizontal: false });
  slots.sort((a, b) => a.y - b.y || a.x - b.x);
  return { n, slots, vertices: n * (n - 1) + 2 };
}

/** owner[i] = −1 free, 0 Red, 1 Blue */
export type Owners = Int8Array;

export interface View {
  graph: Graph;
  s: number;
  t: number;
  /** edge index in `graph` → slot index */
  slotOf: number[];
}

/**
 * Player p's Shannon graph: p's bridges contracted, the opponent's deleted,
 * free slots as edges. Contraction is done with union–find, labels kept.
 */
export function viewOf(b: Board, owner: Owners, p: Player): View {
  const N = b.vertices;
  const par = Int32Array.from({ length: N }, (_, i) => i);
  const f = (x: number): number => (par[x] === x ? x : (par[x] = f(par[x])));
  const e = (sl: Slot) => (p === 0 ? sl.red : sl.blue);
  b.slots.forEach((sl, i) => {
    if (owner[i] === p) {
      const [u, v] = e(sl);
      const a = f(u), c = f(v);
      if (a !== c) par[Math.max(a, c)] = Math.min(a, c);
    }
  });
  const edges: Edge[] = [];
  const slotOf: number[] = [];
  b.slots.forEach((sl, i) => {
    if (owner[i] !== -1) return;
    const [u, v] = e(sl);
    edges.push([f(u), f(v)]);
    slotOf.push(i);
  });
  return { graph: { n: N, edges }, s: f(0), t: f(1), slotOf };
}

export function winner(b: Board, owner: Owners): Player | null {
  for (const p of [0, 1] as Player[]) {
    const v = viewOf(b, owner, p);
    if (v.s === v.t) return p;
  }
  return null;
}

/**
 * For the player to move, which free slots win? Taking slot i is Short
 * claiming that edge; afterwards the opponent moves, so the move wins iff
 * Lehman's criterion (Cut to move) holds on the contracted graph.
 */
export function winningMoves(b: Board, owner: Owners, p: Player): Map<number, boolean> {
  const res = new Map<number, boolean>();
  const v = viewOf(b, owner, p);
  v.graph.edges.forEach(([u, w], j) => {
    const slot = v.slotOf[j];
    if (u === w) { res.set(slot, false); return; } // a dead bridge
    const keep = Math.min(u, w), gone = Math.max(u, w);
    const m = (x: number) => (x === gone ? keep : x);
    const edges: Edge[] = [];
    v.graph.edges.forEach(([a, c], k) => { if (k !== j) edges.push([m(a), m(c)]); });
    res.set(slot, secondWins({ n: v.graph.n, edges }, m(v.s), m(v.t)));
  });
  return res;
}

/** Does player p, *not* to move, already hold a won position (Lehman's criterion)? */
export function holdsWin(b: Board, owner: Owners, p: Player): boolean {
  const v = viewOf(b, owner, p);
  return secondWins(v.graph, v.s, v.t);
}

/** Lehman's two trees for player p, as slot lists (free slots only). */
export function trees(b: Board, owner: Owners, p: Player): [number[], number[]] {
  const v = viewOf(b, owner, p);
  const [a, c] = treePacking(v.graph);
  return [a.map((j) => v.slotOf[j]), c.map((j) => v.slotOf[j])];
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The computer: a winning move if there is one (any of them wins, by
 * Lehman's theorem); otherwise the move after which the opponent has the
 * fewest winning replies.
 */
export function computerMove(b: Board, owner: Owners, p: Player, rand: () => number = Math.random): number {
  const wins = winningMoves(b, owner, p);
  const good = [...wins].filter(([, w]) => w).map(([i]) => i);
  if (good.length) {
    // Prefer bridges that sit in the middle of the board.
    const c = b.n;
    good.sort((i, j) => dist(b.slots[i], c) - dist(b.slots[j], c));
    const top = good.filter((i) => dist(b.slots[i], c) === dist(b.slots[good[0]], c));
    return top[Math.floor(rand() * top.length)];
  }
  let best = -1, bestCount = Infinity;
  const free = [...wins.keys()];
  for (const i of free) {
    owner[i] = p;
    const replies = [...winningMoves(b, owner, (1 - p) as Player).values()].filter(Boolean).length;
    owner[i] = -1;
    if (replies < bestCount || (replies === bestCount && rand() < 0.5)) { best = i; bestCount = replies; }
  }
  return best;
}

function dist(s: Slot, c: number): number {
  return Math.abs(s.x - c) + Math.abs(s.y - c);
}
