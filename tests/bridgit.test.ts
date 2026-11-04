import { describe, expect, it } from 'vitest';
import * as G from '../src/graph.ts';
import * as B from '../src/bridgit.ts';

function randomGraph(r: () => number, nMin: number, nMax: number, mMax: number): G.Graph {
  const n = nMin + Math.floor(r() * (nMax - nMin + 1));
  const m = Math.floor(r() * (mMax + 1));
  const edges: G.Edge[] = [];
  for (let i = 0; i < m; i++) edges.push([Math.floor(r() * n), Math.floor(r() * n)]);
  return { n, edges };
}

describe('Lehman criterion', () => {
  it('pebble game = Nash-Williams–Tutte brute force = minimax on random multigraphs', () => {
    const r = B.rng(1);
    const mm = new G.Minimax();
    for (let k = 0; k < 600; k++) {
      const g = randomGraph(r, 2, 6, 11);
      const minimaxSecond = mm.solve(g, 0, 1, false);
      expect(G.secondWins(g, 0, 1)).toBe(minimaxSecond);
      expect(G.secondWinsBrute(g, 0, 1)).toBe(minimaxSecond);
      expect(G.firstWins(g, 0, 1)).toBe(mm.solve(g, 0, 1, true));
    }
  });

  it('every labelled graph on 5 vertices, and every state minimax reaches', () => {
    let bad = 0, states = 0;
    const mm = new G.Minimax((g, s, t, shortToMove, win) => {
      states++;
      if ((shortToMove ? G.firstWins(g, s, t) : G.secondWins(g, s, t)) !== win) bad++;
    });
    const pairs: G.Edge[] = [];
    for (let u = 0; u < 5; u++) for (let v = u + 1; v < 5; v++) pairs.push([u, v]);
    for (let mask = 0; mask < 1 << pairs.length; mask++) {
      const g = { n: 5, edges: pairs.filter((_, i) => mask >> i & 1) };
      mm.solve(g, 0, 1, true);
      mm.solve(g, 0, 1, false);
    }
    expect(states).toBeGreaterThan(2000);
    expect(bad).toBe(0);
  });

  it('dropping dead edges and reordering Short\'s moves never change the outcome (all graphs on 5 vertices)', () => {
    const plain = new G.Minimax(), pruned = new G.Minimax(undefined, true), ordered = new G.Minimax(undefined, true, true);
    const pairs: G.Edge[] = [];
    for (let u = 0; u < 5; u++) for (let v = u + 1; v < 5; v++) pairs.push([u, v]);
    for (let mask = 0; mask < 1 << pairs.length; mask++) {
      const g = { n: 5, edges: pairs.filter((_, i) => mask >> i & 1) };
      for (const first of [true, false]) {
        const want = plain.solve(g, 0, 1, first);
        expect(pruned.solve(g, 0, 1, first)).toBe(want);
        expect(ordered.solve(g, 0, 1, first)).toBe(want);
      }
    }
    // a pendant edge and a dangling triangle are dead; the s–t triangle is not
    const g: G.Graph = { n: 6, edges: [[0, 1], [0, 2], [2, 1], [2, 3], [1, 4], [4, 5], [5, 1]] };
    expect(G.liveEdges(6, g.edges, 0, 1)).toEqual([[0, 1], [0, 2], [2, 1]]);
  });

  it('known small cases', () => {
    // a single edge s–t: whoever moves first wins it
    const e = { n: 2, edges: [[0, 1]] as G.Edge[] };
    expect(G.firstWins(e, 0, 1)).toBe(true);
    expect(G.secondWins(e, 0, 1)).toBe(false);
    // a doubled edge s–t is two trees on {s, t}
    expect(G.secondWins({ n: 2, edges: [[0, 1], [0, 1]] }, 0, 1)).toBe(true);
    // a 4-cycle s–a–t–b–s: two paths of length 2, Cut answers each claim on the same path
    const c4 = { n: 4, edges: [[0, 2], [2, 1], [1, 3], [3, 0]] as G.Edge[] };
    expect(G.secondWins(c4, 0, 1)).toBe(false);
    expect(G.firstWins(c4, 0, 1)).toBe(false);
    // a triangle s–t, s–a–t: Short moving first takes s–t
    const tri = { n: 3, edges: [[0, 1], [0, 2], [2, 1]] as G.Edge[] };
    expect(G.firstWins(tri, 0, 1)).toBe(true);
    expect(G.secondWins(tri, 0, 1)).toBe(false);
    // loops never help
    expect(G.secondWins({ n: 2, edges: [[0, 0], [1, 1], [0, 1]] }, 0, 1)).toBe(false);
  });
});

describe('two trees', () => {
  it('Edmonds partition reaches the rank of the 2-fold union matroid', () => {
    const r = B.rng(3);
    for (let k = 0; k < 150; k++) {
      const g = randomGraph(r, 3, 8, 12);
      const [a, b] = G.treePacking(g);
      expect(a.length + b.length).toBe(G.unionRankBrute(g));
      expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
      for (const f of [a, b]) {
        // each forest is acyclic
        const p = Int32Array.from({ length: g.n }, (_, i) => i);
        const find = (x: number): number => (p[x] === x ? x : (p[x] = find(p[x])));
        for (const id of f) {
          const [u, v] = g.edges[id];
          expect(find(u)).not.toBe(find(v));
          p[find(u)] = find(v);
        }
      }
    }
  });
});

describe('Bridg-It board', () => {
  it('has n² + (n−1)² crossing points, one short of two spanning trees', () => {
    for (let n = 1; n <= 9; n++) {
      const b = B.makeBoard(n);
      expect(b.slots.length).toBe(n * n + (n - 1) * (n - 1));
      expect(b.vertices).toBe(n * (n - 1) + 2);
      expect(b.slots.length).toBe(2 * (b.vertices - 1) - 1);
      // each crossing point is used once
      expect(new Set(b.slots.map((s) => `${s.x},${s.y}`)).size).toBe(b.slots.length);
    }
  });

  it('every opening of the 5 × 6 board wins and leaves exactly two spanning trees', () => {
    const b = B.makeBoard(5);
    const empty = new Int8Array(b.slots.length).fill(-1);
    const w = B.winningMoves(b, empty, 0);
    expect([...w.values()].filter(Boolean).length).toBe(41);
    expect(B.holdsWin(b, empty, 0)).toBe(false);
    expect(B.holdsWin(b, empty, 1)).toBe(false);
    for (let i = 0; i < b.slots.length; i++) {
      const o = empty.slice();
      o[i] = 0;
      const [t1, t2] = B.trees(b, o, 0);
      expect(t1.length).toBe(b.vertices - 2);
      expect(t2.length).toBe(b.vertices - 2);
    }
  });

  it('the 3 × 4 board by plain minimax agrees with Lehman on every opening', () => {
    const b = B.makeBoard(3);
    const empty = new Int8Array(b.slots.length).fill(-1);
    const v = B.viewOf(b, empty, 0);
    const mm = new G.Minimax();
    expect(mm.solve(v.graph, v.s, v.t, true)).toBe(true);
    expect(mm.solve(v.graph, v.s, v.t, false)).toBe(false);
    const lehman = B.winningMoves(b, empty, 0);
    v.graph.edges.forEach((_, i) => {
      const { g, map } = G.contract(v.graph, i);
      expect(mm.solve(g, map(v.s), map(v.t), false)).toBe(lehman.get(v.slotOf[i]));
    });
  });

  it('no draws: Red\'s graph and Blue\'s graph always name the same winner', () => {
    const r = B.rng(5);
    for (const n of [3, 4, 5]) {
      const b = B.makeBoard(n);
      for (let g = 0; g < 30; g++) {
        const o = new Int8Array(b.slots.length).fill(-1);
        let p: B.Player = 0;
        for (const i of [...o.keys()].sort(() => r() - 0.5)) {
          if (B.winner(b, o) !== null) break;
          const red = B.viewOf(b, o, 0), blue = B.viewOf(b, o, 1);
          const redWins = p === 0 ? G.firstWins(red.graph, red.s, red.t) : G.secondWins(red.graph, red.s, red.t);
          const blueWins = p === 1 ? G.firstWins(blue.graph, blue.s, blue.t) : G.secondWins(blue.graph, blue.s, blue.t);
          expect(redWins).not.toBe(blueWins);
          o[i] = p;
          p = (1 - p) as B.Player;
        }
      }
    }
  });

  it('a finished board has exactly one winner', () => {
    const r = B.rng(9);
    for (let g = 0; g < 50; g++) {
      const b = B.makeBoard(2 + (g % 5));
      const o = new Int8Array(b.slots.length);
      for (let i = 0; i < o.length; i++) o[i] = r() < 0.5 ? 0 : 1;
      const red = B.viewOf(b, o, 0), blue = B.viewOf(b, o, 1);
      expect(red.s === red.t).not.toBe(blue.s === blue.t);
    }
  });

  it('the computer moving first never loses to random play', () => {
    const r = B.rng(13);
    for (const n of [3, 4, 5]) {
      const b = B.makeBoard(n);
      for (let g = 0; g < 8; g++) {
        const o = new Int8Array(b.slots.length).fill(-1);
        let p: B.Player = 0;
        let w: B.Player | null;
        while ((w = B.winner(b, o)) === null) {
          let i: number;
          if (p === 0) i = B.computerMove(b, o, 0, r);
          else {
            const free = [...o.keys()].filter((k) => o[k] === -1);
            i = free[Math.floor(r() * free.length)];
          }
          o[i] = p;
          p = (1 - p) as B.Player;
        }
        expect(w).toBe(0);
      }
    }
  });

  it('the computer moving first never loses to itself', () => {
    const r = B.rng(17);
    const b = B.makeBoard(5);
    for (let g = 0; g < 4; g++) {
      const o = new Int8Array(b.slots.length).fill(-1);
      let p: B.Player = 0;
      while (B.winner(b, o) === null) {
        o[B.computerMove(b, o, p, r)] = p;
        p = (1 - p) as B.Player;
      }
      expect(B.winner(b, o)).toBe(0);
    }
  });
});
