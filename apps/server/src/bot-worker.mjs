import { parentPort, workerData } from 'node:worker_threads';
import { Chess } from 'chess.js';
const chess = new Chess(workerData.fen);
const levels = {
  beginner: { depth: 1, ms: 100 },
  intermediate: { depth: 2, ms: 450 },
  advanced: { depth: 4, ms: 1400 },
};
const limits = levels[workerData.difficulty] ?? levels.intermediate;
const deadline = Date.now() + limits.ms,
  values = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
let nodes = 0;
function evaluate() {
  let score = 0;
  for (const row of chess.board())
    for (const p of row) {
      if (!p) continue;
      const file = p.square.charCodeAt(0) - 97,
        rank = Number(p.square[1]) - 1;
      const center = 14 - 2 * (Math.abs(file - 3.5) + Math.abs(rank - 3.5));
      const advancement = p.color === 'w' ? rank : 7 - rank;
      const position =
        p.type === 'p' ? advancement * 7 : p.type === 'n' || p.type === 'b' ? center * 4 : 0;
      score += (p.color === 'w' ? 1 : -1) * (values[p.type] + position);
    }
  return score * (chess.turn() === 'w' ? 1 : -1);
}
function ordered() {
  return chess
    .moves({ verbose: true })
    .sort(
      (a, b) =>
        (values[b.captured] ?? 0) * 10 -
        (values[b.piece] ?? 0) -
        ((values[a.captured] ?? 0) * 10 - (values[a.piece] ?? 0)),
    );
}
function search(depth, alpha, beta, ply) {
  nodes++;
  if ((nodes & 63) === 0 && Date.now() > deadline) throw new Error('BUDGET');
  if (chess.isCheckmate()) return -100000 + ply;
  if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition())
    return 0;
  if (depth === 0) return evaluate();
  let best = -Infinity;
  for (const m of ordered()) {
    chess.move(m);
    let score;
    try {
      score = -search(depth - 1, -beta, -alpha, ply + 1);
    } finally {
      chess.undo();
    }
    best = Math.max(best, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return best;
}
const moves = ordered();
let best = moves[0],
  completedDepth = 0;
for (let depth = 1; depth <= limits.depth; depth++) {
  let candidate = best,
    value = -Infinity;
  try {
    for (const move of moves) {
      if (Date.now() > deadline) throw new Error('BUDGET');
      chess.move(move);
      let score;
      try {
        score = -search(depth - 1, -Infinity, -value, 1);
      } finally {
        chess.undo();
      }
      if (score > value) {
        value = score;
        candidate = move;
      }
    }
    best = candidate;
    completedDepth = depth;
  } catch {
    break;
  }
}
parentPort.postMessage({
  move: best
    ? { from: best.from, to: best.to, ...(best.promotion ? { promotion: best.promotion } : {}) }
    : null,
  nodes,
  completedDepth,
});
