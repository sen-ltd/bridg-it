// Every check in the article, in one run.
//
//   node tools/compute.mts [maxVertices] [exactBridgit] [out]
//
// Writes the out file after each job (atomically) and finishes with
// "stopped": "done".
import { writeFileSync, renameSync } from 'node:fs';
import * as G from '../src/graph.ts';
import * as B from '../src/bridgit.ts';

const MAXV = Number(process.argv[2] ?? 6);
const EXACT = Number(process.argv[3] ?? 3);
const out = process.argv[4] ?? 'runs/compute.json';
const started = Date.now();
const body: Record<string, unknown> = { maxVertices: MAXV, exactBridgit: EXACT, node: process.version, stopped: null, jobs: {} };
const jobs = body.jobs as Record<string, unknown>;

function save() {
  body.seconds = (Date.now() - started) / 1000;
  writeFileSync(out + '.tmp', JSON.stringify(body, null, 1));
  renameSync(out + '.tmp', out);
}
function job(name: string, f: () => Record<string, unknown>) {
  const t = Date.now();
  const r = f();
  r.seconds = (Date.now() - t) / 1000;
  jobs[name] = r;
  console.log(name, JSON.stringify(r).slice(0, 400));
  save();
}

/** A memo-sharing minimax that checks Lehman's criterion at every state it solves. */
function checkedMinimax(brute: boolean | (() => boolean)) {
  const useBrute = typeof brute === 'function' ? brute : () => brute;
  const stat = { states: 0, pebbleBad: 0, bruteBad: 0, bruteChecked: 0, shortToMoveStates: 0, cutToMoveStates: 0, shortWinsStates: 0 };
  const mm = new G.Minimax((g, s, t, shortToMove, win) => {
    stat.states++;
    if (win) stat.shortWinsStates++;
    if (shortToMove) {
      stat.shortToMoveStates++;
      if (G.firstWins(g, s, t) !== win) stat.pebbleBad++;
    } else {
      stat.cutToMoveStates++;
      if (G.secondWins(g, s, t) !== win) stat.pebbleBad++;
      if (useBrute()) { stat.bruteChecked++; if (G.secondWinsBrute(g, s, t) !== win) stat.bruteBad++; }
    }
  });
  return { mm, stat };
}

// 1. Every labelled simple graph on k ≤ MAXV vertices, terminals 0 and 1.
// Nash-Williams–Tutte by brute force at every state up to 6 vertices; on 7 only the pebble game
// (the brute force costs 32 vertex sets × 877 partitions per state there).
job('allGraphs', () => {
  let curK = 0;
  const { mm, stat } = checkedMinimax(() => curK <= 6);
  const pruned = new G.Minimax(undefined, true);
  let prunedBad = 0;
  const perK: Record<string, unknown>[] = [];
  for (let k = 2; k <= MAXV; k++) {
    const pairs: G.Edge[] = [];
    for (let u = 0; u < k; u++) for (let v = u + 1; v < k; v++) pairs.push([u, v]);
    curK = k;
    const t0 = Date.now();
    let shortBoth = 0, cutBoth = 0, firstWins = 0, anomaly = 0, connectedST = 0;
    let pebbleFirst = 0, pebbleSecond = 0;
    for (let mask = 0; mask < 2 ** pairs.length; mask++) {
      const edges = pairs.filter((_, i) => Math.floor(mask / 2 ** i) % 2 === 1);
      const g = { n: k, edges };
      if (G.connected(k, edges, 0, 1)) connectedST++;
      const a = mm.solve(g, 0, 1, true), b = mm.solve(g, 0, 1, false);
      if (a !== G.firstWins(g, 0, 1)) pebbleFirst++;
      if (k <= 6 && (pruned.solve(g, 0, 1, true) !== a || pruned.solve(g, 0, 1, false) !== b)) prunedBad++;
      if (b !== G.secondWins(g, 0, 1)) pebbleSecond++;
      if (a && b) shortBoth++;
      else if (!a && !b) cutBoth++;
      else if (a && !b) firstWins++;
      else anomaly++;
    }
    perK.push({ prunedMinimaxBadSoFar: prunedBad, vertices: k, graphs: 2 ** pairs.length, connectedST, shortWinsEither: shortBoth, cutWinsEither: cutBoth, firstPlayerWins: firstWins, secondWinsOnly: anomaly, pebbleFirstBad: pebbleFirst, pebbleSecondBad: pebbleSecond, seconds: (Date.now() - t0) / 1000, statesSoFar: stat.states });
    console.log(JSON.stringify(perK[perK.length - 1]));
    jobs.allGraphs = { perK, ...stat, partial: true };
    save();
  }
  return { perK, ...stat, minimaxNodes: mm.nodes, prunedMinimaxBad: prunedBad, prunedStates: pruned.memo.size };
});

// 1b. Random labelled graphs on 7 and 8 vertices (all of them would take hours): minimax vs pebbles at every state.
job('sampledGraphs', () => {
  const r = B.rng(77);
  const rows: Record<string, unknown>[] = [];
  for (const [k, count] of [[7, 30000], [8, 1000]] as const) {
    const t0 = Date.now();
    const { mm, stat } = checkedMinimax(false);
    const pairs: G.Edge[] = [];
    for (let u = 0; u < k; u++) for (let v = u + 1; v < k; v++) pairs.push([u, v]);
    let shortBoth = 0, cutBoth = 0, firstWins = 0, anomaly = 0;
    for (let i = 0; i < count; i++) {
      const edges = pairs.filter(() => r() < 0.5);
      const g = { n: k, edges };
      const a = mm.solve(g, 0, 1, true), b = mm.solve(g, 0, 1, false);
      if (a !== G.firstWins(g, 0, 1) || b !== G.secondWins(g, 0, 1)) stat.pebbleBad++;
      if (a && b) shortBoth++; else if (!a && !b) cutBoth++; else if (a) firstWins++; else anomaly++;
    }
    rows.push({ vertices: k, graphs: count, shortWinsEither: shortBoth, cutWinsEither: cutBoth, firstPlayerWins: firstWins, secondWinsOnly: anomaly, ...stat, seconds: (Date.now() - t0) / 1000 });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
  return { rows };
});

// 2. Random multigraphs on 7–9 vertices: pebbles vs Nash-Williams–Tutte by brute force, tree packing vs union rank.
job('randomMultigraphs', () => {
  const r = B.rng(2026);
  let cases = 0, bad = 0, wins = 0, treeBad = 0, treeCases = 0;
  for (let i = 0; i < 20000; i++) {
    const n = 7 + Math.floor(r() * 3);
    const m = Math.floor(r() * 22);
    const edges: G.Edge[] = [];
    for (let j = 0; j < m; j++) edges.push([Math.floor(r() * n), Math.floor(r() * n)]);
    const g = { n, edges };
    const a = G.secondWins(g, 0, 1);
    if (a !== G.secondWinsBrute(g, 0, 1)) bad++;
    if (a) wins++;
    cases++;
    if (m <= 16) {
      treeCases++;
      const [f1, f2] = G.treePacking(g);
      if (f1.length + f2.length !== G.unionRankBrute(g)) treeBad++;
    }
  }
  return { cases, criterionHolds: wins, pebbleVsBruteBad: bad, treeCases, treePackingVsUnionRankBad: treeBad };
});

// 3. Bridg-It exactly: the whole game tree from the empty board, by minimax on Red's graph.
job('bridgitExact', () => {
  const rows: Record<string, unknown>[] = [];
  for (let n = 1; n <= EXACT; n++) {
    const t0 = Date.now();
    const { mm, stat } = checkedMinimax(n <= 3);
    const b = B.makeBoard(n);
    const empty = new Int8Array(b.slots.length).fill(-1);
    const v = B.viewOf(b, empty, 0);
    const redFirst = mm.solve(v.graph, v.s, v.t, true);
    const redSecond = mm.solve(v.graph, v.s, v.t, false);
    // every first move, exactly
    let winningFirst = 0, criterionAgrees = 0;
    const lehman = B.winningMoves(b, empty, 0);
    v.graph.edges.forEach((_, i) => {
      const { g, map } = G.contract(v.graph, i);
      const w = mm.solve(g, map(v.s), map(v.t), false);
      if (w) winningFirst++;
      if (w === lehman.get(v.slotOf[i])) criterionAgrees++;
    });
    rows.push({ n, slots: b.slots.length, redFirstWins: redFirst, redSecondWins: redSecond, winningFirstMoves: winningFirst, criterionAgrees, ...stat, seconds: (Date.now() - t0) / 1000 });
    console.log(JSON.stringify(rows[rows.length - 1]));
    jobs.bridgitExact = { rows, partial: true };
    save();
  }
  return { rows };
});

// 4. Every opening, by Lehman's criterion, and whether Red's graph after it is exactly two spanning trees.
job('openings', () => {
  const rows: Record<string, unknown>[] = [];
  for (let n = 1; n <= 14; n++) {
    const t0 = Date.now();
    const b = B.makeBoard(n);
    const empty = new Int8Array(b.slots.length).fill(-1);
    const w = B.winningMoves(b, empty, 0);
    let tight = 0;
    for (let i = 0; i < b.slots.length; i++) {
      const o = empty.slice();
      o[i] = 0;
      const v = B.viewOf(b, o, 0);
      const [f1, f2] = G.treePacking(v.graph);
      if (f1.length + f2.length === v.graph.edges.length && f1.length === f2.length) tight++;
    }
    const V = b.vertices, E = b.slots.length;
    rows.push({ n, vertices: V, edges: E, twoTreesNeed: 2 * (V - 1), winningOpenings: [...w.values()].filter(Boolean).length, openingsLeavingExactlyTwoTrees: tight, blueHoldsWinAtStart: B.holdsWin(b, empty, 1), redHoldsWinAtStart: B.holdsWin(b, empty, 0), seconds: (Date.now() - t0) / 1000 });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
  return { rows };
});

// 5. No draws: in random positions, "the player to move wins" by Red's graph and by Blue's graph agree.
job('duality', () => {
  const r = B.rng(7);
  const rows: Record<string, unknown>[] = [];
  for (let n = 2; n <= 9; n++) {
    const b = B.makeBoard(n);
    let positions = 0, bad = 0, moverWins = 0;
    const games = n <= 6 ? 400 : 120;
    for (let g = 0; g < games; g++) {
      const o = new Int8Array(b.slots.length).fill(-1);
      let p: B.Player = 0;
      const order = [...o.keys()].sort(() => r() - 0.5);
      for (const i of order) {
        if (B.winner(b, o) !== null) break;
        const red = B.viewOf(b, o, 0), blue = B.viewOf(b, o, 1);
        // Red wins this position iff (Red to move) firstWins on Red's graph / secondWins if Blue to move.
        const redWins = p === 0 ? G.firstWins(red.graph, red.s, red.t) : G.secondWins(red.graph, red.s, red.t);
        const blueWins = p === 1 ? G.firstWins(blue.graph, blue.s, blue.t) : G.secondWins(blue.graph, blue.s, blue.t);
        if (redWins === blueWins) bad++;
        if ((p === 0) === redWins) moverWins++;
        positions++;
        o[i] = p;
        p = (1 - p) as B.Player;
      }
    }
    rows.push({ n, positions, bothOrNeitherWin: bad, moverWins });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
  return { rows };
});

// 6. The computer as Red (moving first) never loses; as Blue it wins when Red slips.
job('selfPlay', () => {
  const r = B.rng(11);
  const rows: Record<string, unknown>[] = [];
  const GAMES: Record<number, number> = { 3: 200, 4: 200, 5: 100, 6: 40, 7: 20 };
  for (let n = 3; n <= 7; n++) {
    const b = B.makeBoard(n);
    const games = GAMES[n];
    // The computer as the losing side looks one move ahead for every reply, which is slow on big boards.
    const modes = n <= 5 ? (['computerRed', 'computerBlue', 'both'] as const) : (['computerRed'] as const);
    let redWinsVsRandom = 0, blueWinsVsRandomRed = 0, redWinsVsComputer = 0, winningMovesSeen: number[] = [];
    for (let g = 0; g < games; g++) {
      for (const mode of modes) {
        const o = new Int8Array(b.slots.length).fill(-1);
        let p: B.Player = 0;
        let w: B.Player | null = null;
        while ((w = B.winner(b, o)) === null) {
          const computer = mode === 'both' || (mode === 'computerRed' ? p === 0 : p === 1);
          let i: number;
          if (computer) {
            if (mode === 'computerRed' && g < 30) winningMovesSeen.push([...B.winningMoves(b, o, p).values()].filter(Boolean).length);
            i = B.computerMove(b, o, p, r);
          } else {
            const free = [...o.keys()].filter((k) => o[k] === -1);
            i = free[Math.floor(r() * free.length)];
          }
          o[i] = p;
          p = (1 - p) as B.Player;
        }
        if (mode === 'computerRed' && w === 0) redWinsVsRandom++;
        if (mode === 'computerBlue' && w === 1) blueWinsVsRandomRed++;
        if (mode === 'both' && w === 0) redWinsVsComputer++;
      }
    }
    winningMovesSeen.sort((a, c) => a - c);
    rows.push({ n, games, modes: [...modes], redWinsVsRandom, blueWinsVsRandomRed, redWinsVsComputer, minWinningMovesForRed: winningMovesSeen[0], medianWinningMovesForRed: winningMovesSeen[winningMovesSeen.length >> 1] });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
  return { rows };
});

body.stopped = 'done';
save();
console.log('done', (Date.now() - started) / 1000);
