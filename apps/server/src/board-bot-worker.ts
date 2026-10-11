import { parentPort, workerData } from 'node:worker_threads';
import {
  boardActions,
  applyBoard,
  boardOutcome,
  type BoardState,
  type BoardAction,
} from '../../../packages/games/board-engine';
const { game, state, difficulty } = workerData as {
  game: string;
  state: BoardState;
  difficulty: string;
};
const end =
    Date.now() + (difficulty === 'advanced' ? 1200 : difficulty === 'intermediate' ? 400 : 80),
  maxDepth = difficulty === 'advanced' ? 5 : difficulty === 'intermediate' ? 3 : 1;
function evaluate(s: BoardState) {
  const side = s.turn === 'w' ? 1 : -1;
  let value = 0;
  for (let i = 0; i < s.board.length; i++) {
    const p = s.board[i];
    if (!p) continue;
    const weight =
      game === 'checkers' ? (Math.abs(p) === 2 ? 320 : 100) : Math.abs(p) === 2 ? 1500 : 100;
    value += Math.sign(p) * weight;
    const n = game === 'checkers' ? 8 : 5,
      r = Math.floor(i / n),
      c = i % n;
    value += Math.sign(p) * (10 - Math.abs(c - (n - 1) / 2) * 3);
    if (game === 'checkers' && Math.abs(p) === 1) value += p > 0 ? (7 - r) * 5 : -r * 5;
  }
  if ('relay' in s) value += (s.relay.w - s.relay.b) * 200;
  return value * side;
}
function search(s: BoardState, depth: number, alpha: number, beta: number): number {
  if (Date.now() > end) throw new Error('BUDGET');
  const outcome = boardOutcome(game, s);
  if (outcome)
    return outcome.winner === null
      ? 0
      : outcome.winner === (s.turn === 'w' ? 'first' : 'second')
        ? 100000 + depth
        : -100000 - depth;
  if (!depth) return evaluate(s);
  let best = -Infinity;
  for (const action of boardActions(game, s)) {
    const value = -search(applyBoard(game, s, action), depth - 1, -beta, -alpha);
    best = Math.max(best, value);
    alpha = Math.max(alpha, value);
    if (alpha >= beta) break;
  }
  return best;
}
const actions = boardActions(game, state);
let best: BoardAction | null = actions[0] ?? null;
for (let depth = 1; depth <= maxDepth; depth++) {
  let candidate: BoardAction | null = best,
    score = -Infinity;
  try {
    for (const a of actions) {
      const value = -search(applyBoard(game, state, a), depth - 1, -Infinity, -score);
      if (value > score) {
        score = value;
        candidate = a;
      }
    }
    best = candidate;
  } catch {
    break;
  }
}
parentPort?.postMessage(best);
