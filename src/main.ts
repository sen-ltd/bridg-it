import './style.css';
import * as B from './bridgit.ts';
import findings from './findings.json';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = $('board') as unknown as SVGSVGElement;
const statusEl = $('status');
const verdictEl = $('verdict');
const hintsEl = $<HTMLInputElement>('hints');
const treesEl = $<HTMLInputElement>('trees');
const sizeSel = $<HTMLSelectElement>('sizeSel');
const youSel = $<HTMLSelectElement>('youSel');
const NS = 'http://www.w3.org/2000/svg';
const NAME = ['Red', 'Blue'];

let board: B.Board = B.makeBoard(5);
let owner: B.Owners = new Int8Array(board.slots.length).fill(-1);
let toMove: B.Player = 0;
let human: B.Player = 0;
let moves: { slot: number; by: B.Player; computer: boolean }[] = [];
let won: B.Player | null = null;
let hover = -1;
let thinking = false;

function newGame() {
  board = B.makeBoard(Number(sizeSel.value));
  owner = new Int8Array(board.slots.length).fill(-1);
  toMove = 0;
  human = Number(youSel.value) as B.Player;
  moves = [];
  won = null;
  hover = -1;
  render();
  if (human !== toMove) later(computerTurn);
}

function later(f: () => void) {
  thinking = true;
  setTimeout(() => { thinking = false; f(); }, 450);
}

function play(slot: number, computer: boolean) {
  owner[slot] = toMove;
  moves.push({ slot, by: toMove, computer });
  toMove = (1 - toMove) as B.Player;
  won = B.winner(board, owner);
  hover = -1;
}

function computerTurn() {
  if (won !== null || toMove === human) return;
  play(B.computerMove(board, owner, toMove), true);
  render();
}

function undo() {
  if (thinking) return;
  // Undo back to the human's previous turn.
  do {
    const m = moves.pop();
    if (!m) break;
    owner[m.slot] = -1;
    toMove = m.by;
  } while (moves.length && toMove !== human);
  if (toMove !== human && moves.length === 0) {
    won = null;
    render();
    later(computerTurn);
    return;
  }
  won = B.winner(board, owner);
  render();
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

function render() {
  const n = board.n;
  const S = n <= 3 ? 52 : n <= 4 ? 44 : n <= 6 ? 36 : 28; // pixels per lattice unit
  const M = S * 0.9;
  const W = 2 * n * S + 2 * M;
  const X = (x: number) => M + x * S;
  const Y = (y: number) => M + y * S;
  svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
  svg.replaceChildren();

  // goal sides
  el('rect', { x: X(0) - S * 0.55, y: Y(1) - S * 0.35, width: S * 0.22, height: Y(2 * n - 1) - Y(1) + S * 0.7, rx: 4, class: 'goal red' }, svg);
  el('rect', { x: X(2 * n) + S * 0.33, y: Y(1) - S * 0.35, width: S * 0.22, height: Y(2 * n - 1) - Y(1) + S * 0.7, rx: 4, class: 'goal red' }, svg);
  el('rect', { y: Y(0) - S * 0.55, x: X(1) - S * 0.35, height: S * 0.22, width: X(2 * n - 1) - X(1) + S * 0.7, rx: 4, class: 'goal blue' }, svg);
  el('rect', { y: Y(2 * n) + S * 0.33, x: X(1) - S * 0.35, height: S * 0.22, width: X(2 * n - 1) - X(1) + S * 0.7, rx: 4, class: 'goal blue' }, svg);

  const live = won === null;
  const humanTurn = live && toMove === human && !thinking;
  const hints = humanTurn && hintsEl.checked ? B.winningMoves(board, owner, toMove) : null;

  // Lehman's two trees: for the player who just moved if they hold a won game,
  // or, while the human hovers a winning crossing point, for the position after it.
  const treeOf = new Map<number, number>();
  let treeOwner: B.Player | null = null;
  if (treesEl.checked && live) {
    const holder = (1 - toMove) as B.Player;
    let o: B.Owners | null = null;
    if (humanTurn && hover >= 0 && hints?.get(hover)) {
      o = owner.slice();
      o[hover] = toMove;
      treeOwner = toMove;
    } else if (B.holdsWin(board, owner, holder)) {
      o = owner;
      treeOwner = holder;
    }
    if (o && treeOwner !== null) {
      const [a, c] = B.trees(board, o, treeOwner);
      a.forEach((i) => treeOf.set(i, 0));
      c.forEach((i) => treeOf.set(i, 1));
    }
  }

  const ends = (sl: B.Slot, p: B.Player): [number, number, number, number] => {
    const horiz = p === 0 ? sl.redHorizontal : !sl.redHorizontal;
    return horiz ? [sl.x - 1, sl.y, sl.x + 1, sl.y] : [sl.x, sl.y - 1, sl.x, sl.y + 1];
  };

  // tree overlays (under everything)
  if (treeOwner !== null) {
    for (const [i, k] of treeOf) {
      const [x1, y1, x2, y2] = ends(board.slots[i], treeOwner);
      el('line', { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), class: `tree t${k} ${treeOwner ? 'blue' : 'red'}` }, svg);
    }
  }

  // bridges
  const last = moves.length ? moves[moves.length - 1].slot : -1;
  board.slots.forEach((sl, i) => {
    if (owner[i] === -1) return;
    const p = owner[i] as B.Player;
    const [x1, y1, x2, y2] = ends(sl, p);
    el('line', { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), class: `bridge ${p ? 'blue' : 'red'}${i === last ? ' last' : ''}` }, svg);
  });

  // dots
  for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) el('circle', { cx: X(2 * c), cy: Y(2 * r + 1), r: S * 0.17, class: 'dot red' }, svg);
  for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) el('circle', { cx: X(2 * c + 1), cy: Y(2 * r), r: S * 0.17, class: 'dot blue' }, svg);

  // free crossing points
  board.slots.forEach((sl, i) => {
    if (owner[i] !== -1 || !live) return;
    const g = el('g', { class: humanTurn ? 'slot pick' : 'slot' }, svg);
    if (humanTurn && i === hover) {
      const [x1, y1, x2, y2] = ends(sl, toMove);
      el('line', { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), class: `bridge ghost ${toMove ? 'blue' : 'red'}` }, g);
    }
    const w = hints?.get(i);
    el('circle', { cx: X(sl.x), cy: Y(sl.y), r: S * 0.3, class: 'hit' + (w === undefined ? '' : w ? ' win' : ' lose') }, g);
    if (w !== undefined) {
      const t = el('text', { x: X(sl.x), y: Y(sl.y) + S * 0.11, class: 'mark ' + (w ? 'win' : 'lose'), 'font-size': S * 0.32 }, g);
      t.textContent = w ? '✓' : '✗';
    }
    if (humanTurn) {
      g.addEventListener('mouseenter', () => { hover = i; render(); });
      g.addEventListener('mouseleave', () => { if (hover === i) { hover = -1; render(); } });
      g.addEventListener('click', () => {
        if (won !== null || toMove !== human || thinking) return;
        play(i, false);
        render();
        if (won === null) later(computerTurn);
      });
    }
  });

  renderStatus(hints);
  renderVerdict();
}

function renderStatus(hints: Map<number, boolean> | null) {
  const you = NAME[human];
  if (won !== null) {
    statusEl.innerHTML = won === human
      ? `<strong class="win-t">You win.</strong> ${you} is joined up in ${moves.length} bridges.`
      : `<strong class="lose-t">${NAME[won]} wins.</strong> Press <em>New game</em> or Undo.`;
    return;
  }
  if (toMove !== human) { statusEl.innerHTML = `${NAME[toMove]} is thinking…`; return; }
  const last = moves[moves.length - 1];
  const intro = last ? `The computer took the crossing at (${board.slots[last.slot].x}, ${board.slots[last.slot].y}). ` : '';
  if (hints) {
    const good = [...hints.values()].filter(Boolean).length;
    statusEl.innerHTML = intro + (good
      ? `Your move, ${you}: <strong class="win-t">${good}</strong> of ${hints.size} crossing points win.`
      : `Your move, ${you}: no crossing point wins any more, the computer holds two trees.`) +
      (good && treesEl.checked ? ' Hover a ✓ to see the two trees it leaves you.' : '');
  } else statusEl.innerHTML = intro + `Your move, ${you}.`;
}

function renderVerdict() {
  if (won !== null) {
    verdictEl.innerHTML = `<div class="big ${won ? 'blue-t' : 'red-t'}">${NAME[won]} has won</div>`;
    return;
  }
  const v = B.viewOf(board, owner, toMove);
  const wins = [...B.winningMoves(board, owner, toMove).values()].filter(Boolean).length;
  const holder = (1 - toMove) as B.Player;
  const holds = B.holdsWin(board, owner, holder);
  const winnerP = holds ? holder : toMove;
  const free = owner.filter((o) => o === -1).length;
  verdictEl.innerHTML = `
    <div class="big ${winnerP ? 'blue-t' : 'red-t'}">${NAME[winnerP]} wins</div>
    <p class="verdict">${holds
      ? `${NAME[holder]} holds two edge-disjoint trees joining its goals; whatever ${NAME[toMove]} cuts, one tree mends the other.`
      : `${NAME[toMove]} is to move and ${wins} of ${free} crossing points win.`}</p>
    <div class="qrow"><span>${NAME[toMove]}'s graph</span><b>${new Set(v.graph.edges.flat()).size} vertices · ${v.graph.edges.length} edges</b></div>
    <div class="qrow"><span>bridges built</span><b>${moves.length}</b></div>`;
}

function renderPaper() {
  const items = (findings as { items: { ok: boolean; text: string; detail: string }[] }).items;
  $('paper').innerHTML = `<ul>${items
    .map((it) => `<li><span class="${it.ok ? 'ok' : 'no'}">${it.ok ? '✓' : '✗'}</span>${it.text}<span class="d">${it.detail}</span></li>`)
    .join('')}</ul>`;
}

$('newGame').addEventListener('click', newGame);
$('undo').addEventListener('click', undo);
hintsEl.addEventListener('change', render);
treesEl.addEventListener('change', render);
sizeSel.addEventListener('change', newGame);
youSel.addEventListener('change', newGame);
renderPaper();
newGame();
