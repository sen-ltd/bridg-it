// Turn runs/compute.json (+ runs/exact-4.json when finished) into the short
// list the page shows, src/findings.json.
//
//   node tools/report.mts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const c = JSON.parse(readFileSync('runs/compute.json', 'utf8'));
if (c.stopped !== 'done') throw new Error('runs/compute.json is not finished');
const j = c.jobs;
const ex4 = existsSync('runs/exact-4.json') ? JSON.parse(readFileSync('runs/exact-4.json', 'utf8')) : null;
const fmt = (x: number) => x.toLocaleString('en-US');
const items: { ok: boolean; text: string; detail: string }[] = [];

const ag = j.allGraphs;
const perK = ag.perK as { vertices: number; graphs: number; pebbleFirstBad: number; pebbleSecondBad: number; secondWinsOnly: number }[];
const graphs = perK.reduce((s, k) => s + k.graphs, 0);
const maxK = perK[perK.length - 1].vertices;
items.push({
  ok: ag.pebbleBad === 0 && ag.bruteBad === 0 && perK.every((k) => k.pebbleFirstBad === 0 && k.pebbleSecondBad === 0),
  text: `Lehman's criterion = plain minimax, every graph up to ${maxK} vertices`,
  detail: `${fmt(graphs)} labelled graphs, both players first; ${fmt(ag.states)} positions reached, each checked (Nash-Williams–Tutte by brute force at ${fmt(ag.bruteChecked)} of them)`,
});
const sg = j.sampledGraphs.rows as { vertices: number; graphs: number; states: number; pebbleBad: number; secondWinsOnly: number }[];
items.push({
  ok: sg.every((r) => r.pebbleBad === 0 && r.secondWinsOnly === 0),
  text: `the same on random graphs with 7 and 8 vertices`,
  detail: sg.map((r) => `${fmt(r.graphs)} graphs on ${r.vertices}`).join(', ') + `; ${fmt(sg.reduce((s, r) => s + r.states, 0))} positions, each checked`,
});
const rm = j.randomMultigraphs;
items.push({
  ok: rm.pebbleVsBruteBad === 0,
  text: `pebble game = brute force on random multigraphs`,
  detail: `${fmt(rm.cases)} multigraphs on 7–9 vertices, every vertex set and every partition`,
});
items.push({
  ok: rm.treePackingVsUnionRankBad === 0,
  text: `the two trees drawn are as large as possible`,
  detail: `Edmonds' partition = rank of the 2-fold union, ${fmt(rm.treeCases)} multigraphs, every edge subset`,
});
const be = j.bridgitExact.rows as { n: number; slots: number; redFirstWins: boolean; redSecondWins: boolean; winningFirstMoves: number; criterionAgrees: number; states: number }[];
const exactRows = [...be];
if (ex4?.stopped === 'done') exactRows.push({ n: 4, slots: ex4.openings.length, redFirstWins: ex4.winningOpenings > 0, redSecondWins: ex4.redSecondWins, winningFirstMoves: ex4.winningOpenings, criterionAgrees: ex4.agree, states: ex4.states });
const top = exactRows[exactRows.length - 1];
items.push({
  ok: exactRows.every((r) => r.redFirstWins && !r.redSecondWins && r.winningFirstMoves === r.slots && r.criterionAgrees === r.slots),
  text: `Bridg-It up to ${top.n} × ${top.n + 1} by minimax`,
  detail: `first player wins with every one of the ${top.slots} openings, as Lehman says (${fmt(top.states)} positions)`,
});
const op = j.openings.rows as { n: number; edges: number; winningOpenings: number; openingsLeavingExactlyTwoTrees: number }[];
const opTop = op[op.length - 1];
const five = op.find((r) => r.n === 5)!;
items.push({
  ok: op.every((r) => r.winningOpenings === r.edges && r.openingsLeavingExactlyTwoTrees === r.edges),
  text: `every opening wins and leaves exactly two spanning trees`,
  detail: `${five.edges} of ${five.edges} on 5 × 6; every board up to ${opTop.n} × ${opTop.n + 1} (${fmt(opTop.edges)} openings there)`,
});
const du = j.duality.rows as { n: number; positions: number; bothOrNeitherWin: number }[];
items.push({
  ok: du.every((r) => r.bothOrNeitherWin === 0),
  text: `no draws: Red's graph and Blue's graph agree`,
  detail: `${fmt(du.reduce((s, r) => s + r.positions, 0))} random positions, boards 2 × 3 to ${du[du.length - 1].n} × ${du[du.length - 1].n + 1}`,
});
const sp = j.selfPlay.rows as { n: number; games: number; modes: string[]; redWinsVsRandom: number; redWinsVsComputer: number }[];
const both = (r: (typeof sp)[number]) => r.modes.includes('both');
items.push({
  ok: sp.every((r) => r.redWinsVsRandom === r.games && (!both(r) || r.redWinsVsComputer === r.games)),
  text: `the computer moving first never loses`,
  detail: `${fmt(sp.reduce((s, r) => s + r.games * (both(r) ? 2 : 1), 0))} games against random play (boards 3 × 4 to ${sp[sp.length - 1].n} × ${sp[sp.length - 1].n + 1}) and against itself (up to 5 × 6)`,
});
writeFileSync('src/findings.json', JSON.stringify({ items }, null, 1) + '\n');
console.log(JSON.stringify(items, null, 1));
