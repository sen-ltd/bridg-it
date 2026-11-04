// Bridg-It of size n solved by minimax on Red's graph, every opening
// separately, with a cap on the number of memoised states. Dead edges are
// dropped (pass 'noprune' to keep them) and Short's moves are tried in the
// order Lehman's criterion suggests; the verdicts come from the search.
//
//   node tools/exact.mts n cap [out]
import { writeFileSync, renameSync } from 'node:fs';
import * as G from '../src/graph.ts';
import * as B from '../src/bridgit.ts';

const n = Number(process.argv[2] ?? 4);
const cap = Number(process.argv[3] ?? 12_000_000);
const out = process.argv[4] ?? `runs/exact-${n}.json`;
const t0 = Date.now();
const openings: Record<string, unknown>[] = [];
const save = (stopped: string | null, extra: Record<string, unknown> = {}) => {
  writeFileSync(out + '.tmp', JSON.stringify({ n, cap, prune, node: process.version, stopped, seconds: (Date.now() - t0) / 1000, openings, ...extra }, null, 1));
  renameSync(out + '.tmp', out);
};
let states = 0;
const prune = process.argv[5] !== 'noprune';
const mm = new G.Minimax(() => { if (++states > cap) throw new Error('cap'); }, prune, true);
const b = B.makeBoard(n);
const empty = new Int8Array(b.slots.length).fill(-1);
const v = B.viewOf(b, empty, 0);
const lehman = B.winningMoves(b, empty, 0);
try {
  for (let i = 0; i < v.graph.edges.length; i++) {
    const { g, map } = G.contract(v.graph, i);
    const w = mm.solve(g, map(v.s), map(v.t), false);
    const sl = b.slots[v.slotOf[i]];
    openings.push({ slot: [sl.x, sl.y], redWins: w, lehman: lehman.get(v.slotOf[i]), statesSoFar: states, seconds: (Date.now() - t0) / 1000 });
    console.log(JSON.stringify(openings[openings.length - 1]));
    save(null);
  }
  const redSecond = mm.solve(v.graph, v.s, v.t, false);
  save('done', { states, redSecondWins: redSecond, winningOpenings: openings.filter((o) => o.redWins).length, agree: openings.filter((o) => o.redWins === o.lehman).length });
} catch (e) {
  save('cap', { states });
}
console.log('stopped', (Date.now() - t0) / 1000, states);
