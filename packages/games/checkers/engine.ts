import { z } from 'zod';
import type { GameEngine, Outcome } from '../../shared/src/contracts';
export const checkersActionSchema = z
  .object({ path: z.array(z.number().int().min(0).max(63)).min(2).max(14) })
  .strict();
export type CheckersAction = z.infer<typeof checkersActionSchema>;
export type CheckersState = {
  board: number[];
  turn: 'w' | 'b';
  history: CheckersAction[];
  keys: string[];
  kingQuiet: number;
  materialQuiet: number;
  endgameKey: string;
  endgameMoves: number;
  initialBoard: number[];
  initialTurn: 'w' | 'b';
};
const directions = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;
const color = (p: number) => (p > 0 ? 'w' : 'b');
const index = (r: number, c: number) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);
const promoted = (piece: number, to: number) =>
  Math.abs(piece) === 1 && ((piece > 0 && to < 8) || (piece < 0 && to >= 56)) ? piece * 2 : piece;
export const checkersKey = (s: Pick<CheckersState, 'board' | 'turn'>) => s.board.join(',') + s.turn;
export function createCheckers(board?: number[], turn: 'w' | 'b' = 'w'): CheckersState {
  const initial =
    board?.slice() ??
    Array.from({ length: 64 }, (_, i) =>
      (Math.floor(i / 8) + (i % 8)) % 2 === 1 ? (i < 24 ? -1 : i >= 40 ? 1 : 0) : 0,
    );
  return {
    board: initial.slice(),
    turn,
    history: [],
    keys: [checkersKey({ board: initial, turn })],
    kingQuiet: 0,
    materialQuiet: 0,
    endgameKey: '',
    endgameMoves: 0,
    initialBoard: initial,
    initialTurn: turn,
  };
}
export function checkersActions(s: CheckersState): CheckersAction[] {
  const captures: CheckersAction[] = [],
    quiet: CheckersAction[] = [];
  function walk(board: number[], at: number, piece: number, path: number[], taken: Set<number>) {
    let continued = false;
    for (const [dr, dc] of directions) {
      const r = Math.floor(at / 8),
        c = at % 8;
      if (Math.abs(piece) === 1) {
        const enemy = index(r + dr, c + dc),
          to = index(r + 2 * dr, c + 2 * dc);
        if (
          enemy >= 0 &&
          to >= 0 &&
          board[enemy] &&
          color(board[enemy]) !== color(piece) &&
          !taken.has(enemy) &&
          !board[to]
        ) {
          continued = true;
          const next = board.slice();
          next[at] = 0;
          next[to] = promoted(piece, to);
          walk(next, to, next[to], [...path, to], new Set([...taken, enemy]));
        }
      } else {
        let enemy = -1;
        for (let step = 1; step < 8; step++) {
          const to = index(r + dr * step, c + dc * step);
          if (to < 0) break;
          if (board[to]) {
            if (enemy >= 0 || color(board[to]) === color(piece) || taken.has(to)) break;
            enemy = to;
            continue;
          }
          if (enemy >= 0) {
            continued = true;
            const next = board.slice();
            next[at] = 0;
            next[to] = piece;
            walk(next, to, piece, [...path, to], new Set([...taken, enemy]));
          }
        }
      }
    }
    if (!continued && taken.size) captures.push({ path });
  }
  for (let at = 0; at < 64; at++) {
    const piece = s.board[at];
    if (!piece || color(piece) !== s.turn) continue;
    walk(s.board, at, piece, [at], new Set());
    for (const [dr, dc] of directions) {
      if (Math.abs(piece) === 1 && dr !== (piece > 0 ? -1 : 1)) continue;
      for (let step = 1; step <= (Math.abs(piece) === 2 ? 7 : 1); step++) {
        const to = index(Math.floor(at / 8) + dr * step, (at % 8) + dc * step);
        if (to < 0 || s.board[to]) break;
        quiet.push({ path: [at, to] });
      }
    }
  }
  return captures.length ? captures : quiet;
}
function endgame(board: number[]) {
  const w = board.filter((p) => p > 0),
    b = board.filter((p) => p < 0),
    counts = [w, b];
  for (let side = 0; side < 2; side++) {
    const strong = counts[side],
      weak = counts[1 - side];
    if (weak.length !== 1 || Math.abs(weak[0]) !== 2 || !strong.some((p) => Math.abs(p) === 2))
      continue;
    const lone = board.findIndex((p) => p === (side === 0 ? -2 : 2)),
      diagonal = Math.floor(lone / 8) + (lone % 8) === 7;
    if (strong.length <= 2 || (strong.length === 3 && diagonal))
      return {
        key: `${side}:5:${strong.map(Math.abs).sort()}`,
        limit: 5,
        side: side === 0 ? 'w' : 'b',
      };
    if (strong.filter((p) => Math.abs(p) === 2).length >= 3)
      return { key: `${side}:15`, limit: 15, side: side === 0 ? 'w' : 'b' };
  }
  return null;
}
export function applyCheckers(s: CheckersState, input: CheckersAction): CheckersState {
  const action = checkersActionSchema.parse(input);
  if (!checkersActions(s).some((a) => JSON.stringify(a) === JSON.stringify(action)))
    throw new Error('ILLEGAL_MOVE');
  const board = s.board.slice(),
    startPiece = board[action.path[0]],
    taken: number[] = [];
  let piece = startPiece;
  for (let i = 1; i < action.path.length; i++) {
    const from = action.path[i - 1],
      to = action.path[i],
      dr = Math.sign(Math.floor(to / 8) - Math.floor(from / 8)),
      dc = Math.sign((to % 8) - (from % 8)),
      distance = Math.abs(Math.floor(to / 8) - Math.floor(from / 8));
    for (let step = 1; step < distance; step++) {
      const p = index(Math.floor(from / 8) + dr * step, (from % 8) + dc * step);
      if (board[p] && color(board[p]) !== s.turn) taken.push(p);
    }
    board[from] = 0;
    piece = promoted(piece, to);
    board[to] = piece;
  }
  for (const square of taken) board[square] = 0;
  const turn = s.turn === 'w' ? 'b' : 'w',
    isPromotion = piece !== startPiece,
    end = endgame(board),
    changed = taken.length > 0 || isPromotion;
  return {
    ...s,
    board,
    turn,
    history: [...s.history, action],
    keys: [...s.keys, checkersKey({ board, turn })],
    kingQuiet: !taken.length && Math.abs(startPiece) === 2 ? s.kingQuiet + 1 : 0,
    materialQuiet: changed ? 0 : s.materialQuiet + 1,
    endgameKey: end?.key ?? '',
    endgameMoves: end
      ? (end.key === s.endgameKey ? s.endgameMoves : 0) + (s.turn === end.side ? 1 : 0)
      : 0,
  };
}
export function checkersOutcome(s: CheckersState): Outcome | null {
  if (!s.board.some((p) => p && color(p) === s.turn))
    return { winner: s.turn === 'w' ? 'second' : 'first', reason: 'no_pieces' };
  if (!checkersActions(s).length)
    return { winner: s.turn === 'w' ? 'second' : 'first', reason: 'no_moves' };
  if (s.keys.filter((k) => k === s.keys.at(-1)).length >= 3)
    return { winner: null, reason: 'repetition' };
  if (s.kingQuiet >= 30) return { winner: null, reason: 'kings_only' };
  const end = endgame(s.board);
  if (end && s.endgameMoves >= end.limit) return { winner: null, reason: 'material_limit' };
  const total = s.board.filter(Boolean).length;
  if (
    s.board.some((p) => p === 2) &&
    s.board.some((p) => p === -2) &&
    ((total >= 4 && total <= 5 && s.materialQuiet >= 60) ||
      (total >= 6 && total <= 7 && s.materialQuiet >= 120))
  )
    return { winner: null, reason: 'material_limit' };
  return null;
}
export const checkersEngine: GameEngine<CheckersState, CheckersAction> = {
  id: 'checkers',
  rulesVersion: 'draughts64-online-v1',
  initialState: () => createCheckers(),
  legalActions: checkersActions,
  isLegal: (s, a) =>
    checkersActionSchema.safeParse(a).success &&
    checkersActions(s).some((m) => JSON.stringify(m) === JSON.stringify(a)),
  apply: applyCheckers,
  currentPlayer: (s) => (s.turn === 'w' ? 'first' : 'second'),
  outcome: checkersOutcome,
  serialize: JSON.stringify,
  deserialize(raw) {
    const s = JSON.parse(raw);
    if (!this.validateState(s)) throw new Error('INVALID_STATE');
    return s;
  },
  validateState(value): value is CheckersState {
    try {
      const s = value as CheckersState;
      if (
        !Array.isArray(s.initialBoard) ||
        s.initialBoard.length !== 64 ||
        s.initialBoard.some(
          (p, i) =>
            ![-2, -1, 0, 1, 2].includes(p) || (p && (Math.floor(i / 8) + (i % 8)) % 2 !== 1),
        ) ||
        !['w', 'b'].includes(s.initialTurn) ||
        !Array.isArray(s.history) ||
        s.history.length > 1000
      )
        return false;
      let replay = createCheckers(s.initialBoard, s.initialTurn);
      for (const a of s.history) replay = applyCheckers(replay, a);
      return JSON.stringify(replay) === JSON.stringify(s);
    } catch {
      return false;
    }
  },
  replay: (actions) => actions.reduce(applyCheckers, createCheckers()),
};
