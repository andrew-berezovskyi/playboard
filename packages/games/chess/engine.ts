import { Chess, DEFAULT_POSITION, type Color, type Square } from 'chess.js';
import { z } from 'zod';
import type { GameEngine, Outcome } from '../../shared/src/contracts';
export const chessMoveSchema = z
  .object({
    from: z.string().regex(/^[a-h][1-8]$/),
    to: z.string().regex(/^[a-h][1-8]$/),
    promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
  })
  .strict();
export type ChessAction = z.infer<typeof chessMoveSchema>;
export const chessStateSchema = z
  .object({ initialFen: z.string(), fen: z.string(), moves: z.array(chessMoveSchema).max(2000) })
  .strict();
export type ChessState = z.infer<typeof chessStateSchema>;
export function loadChess(state: ChessState) {
  const chess = new Chess(state.initialFen);
  for (const move of state.moves) chess.move(move);
  if (chess.fen() !== state.fen) throw new Error('CORRUPT_STATE');
  return chess;
}
export function stateFromChess(chess: Chess, initialFen = DEFAULT_POSITION): ChessState {
  return {
    initialFen,
    fen: chess.fen(),
    moves: chess.history({ verbose: true }).map((m) => ({
      from: m.from,
      to: m.to,
      ...(m.promotion ? { promotion: m.promotion as 'q' | 'r' | 'b' | 'n' } : {}),
    })),
  };
}
export function repetitionCount(chess: Chess) {
  const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
  const current = key(chess.fen());
  const history = chess.history({ verbose: true });
  const positions = history.length
    ? [history[0].before, ...history.map((m) => m.after)]
    : [chess.fen()];
  return positions.filter((f) => key(f) === current).length;
}
export function drawClaims(chess: Chess) {
  return {
    repetition: repetitionCount(chess) >= 3,
    fiftyMoves: Number(chess.fen().split(' ')[4]) >= 100,
  };
}
export function automaticOutcome(chess: Chess): Outcome | null {
  if (chess.isCheckmate())
    return { winner: chess.turn() === 'w' ? 'second' : 'first', reason: 'checkmate' };
  if (chess.isStalemate()) return { winner: null, reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { winner: null, reason: 'insufficient_material' };
  if (isLockedPawnDeadPosition(chess)) return { winner: null, reason: 'dead_position' };
  if (repetitionCount(chess) >= 5) return { winner: null, reason: 'fivefold_repetition' };
  if (Number(chess.fen().split(' ')[4]) >= 150)
    return { winner: null, reason: 'seventy_five_moves' };
  return null;
}
// A proof for permanently locked pawn walls. Kings are allowed MORE mobility
// than the rules permit (opposing king attacks are ignored). If even this
// over-approximation cannot reach a pawn capture, the wall can never change.
export function isLockedPawnDeadPosition(chess: Chess) {
  const board = chess.board().flat();
  if (!board.some((p) => p?.type === 'p') || board.some((p) => p && !['k', 'p'].includes(p.type)))
    return false;
  if (chess.fen().split(' ')[3] !== '-') return false;
  const pawnAttack = (target: number, color: Color) =>
    board.some(
      (p, from) =>
        p?.type === 'p' &&
        p.color === color &&
        Math.floor(target / 8) - Math.floor(from / 8) === (color === 'w' ? -1 : 1) &&
        Math.abs((target % 8) - (from % 8)) === 1,
    );
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (p?.type !== 'p') continue;
    const forward = from + (p.color === 'w' ? -8 : 8);
    if (forward < 0 || forward >= 64 || board[forward]?.type !== 'p') return false;
    if (
      board.some(
        (other, to) =>
          other?.type === 'p' &&
          other.color !== p.color &&
          Math.floor(to / 8) - Math.floor(from / 8) === (p.color === 'w' ? -1 : 1) &&
          Math.abs((to % 8) - (from % 8)) === 1,
      )
    )
      return false;
  }
  for (const side of ['w', 'b'] as const) {
    const start = board.findIndex((p) => p?.type === 'k' && p.color === side),
      seen = new Set([start]),
      queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const at = queue[cursor];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const r = Math.floor(at / 8) + dr,
            c = (at % 8) + dc;
          if ((!dr && !dc) || r < 0 || r > 7 || c < 0 || c > 7) continue;
          const to = r * 8 + c,
            piece = board[to];
          if (
            seen.has(to) ||
            (piece?.type === 'p' && piece.color === side) ||
            pawnAttack(to, side === 'w' ? 'b' : 'w')
          )
            continue;
          if (piece?.type === 'p') return false;
          seen.add(to);
          queue.push(to);
        }
    }
  }
  return true;
}
// Material impossibility is side-specific. A lone minor can sometimes mate with
// enemy pieces blocking escape squares; two knights can mate by cooperation.
// Arbitrary blocked positions still need a full reachability adjudicator.
export function canPossiblyMate(chess: Chess, side: Color) {
  if (isLockedPawnDeadPosition(chess)) return false;
  const pieces = chess
    .board()
    .flat()
    .filter((p) => p && p.type !== 'k');
  const mine = pieces.filter((p) => p!.color === side);
  const enemy = pieces.filter((p) => p!.color !== side);
  if (!mine.length) return false;
  if (chess.isInsufficientMaterial()) return false;
  if (mine.every((p) => p!.type === 'n') && mine.length === 1)
    return enemy.some((p) => p!.type !== 'q');
  if (mine.every((p) => p!.type === 'b')) {
    const bishops = chess
      .board()
      .flatMap((rank, row) =>
        rank.flatMap((p, column) =>
          p?.type === 'b' && p.color === side ? [(row + column) % 2] : [],
        ),
      );
    if (new Set(bishops).size === 1) {
      const enemySupport = chess
        .board()
        .flatMap((rank, row) =>
          rank.flatMap((p, column) =>
            p && p.color !== side && p.type !== 'k'
              ? [{ type: p.type, color: (row + column) % 2 }]
              : [],
          ),
        );
      return enemySupport.some(
        (p) => p.type === 'p' || p.type === 'n' || (p.type === 'b' && p.color !== bishops[0]),
      );
    }
  }
  return true;
}
export const chessEngine: GameEngine<ChessState, ChessAction> = {
  id: 'chess',
  rulesVersion: 'standard-v1',
  initialState: () => stateFromChess(new Chess()),
  legalActions: (state) =>
    loadChess(state)
      .moves({ verbose: true })
      .map((m) => ({
        from: m.from,
        to: m.to,
        ...(m.promotion ? { promotion: m.promotion as 'q' | 'r' | 'b' | 'n' } : {}),
      })),
  isLegal: (state, action) => {
    try {
      const input = chessMoveSchema.parse(action);
      return !!loadChess(state).move(input);
    } catch {
      return false;
    }
  },
  apply: (state, action) => {
    const chess = loadChess(state);
    chess.move(chessMoveSchema.parse(action));
    return stateFromChess(chess, state.initialFen);
  },
  currentPlayer: (state) => (loadChess(state).turn() === 'w' ? 'first' : 'second'),
  outcome: (state) => automaticOutcome(loadChess(state)),
  serialize: (state) => JSON.stringify(state),
  deserialize: (serialized) => {
    const state = chessStateSchema.parse(JSON.parse(serialized));
    loadChess(state);
    return state;
  },
  validateState: (state: unknown): state is ChessState => {
    try {
      loadChess(chessStateSchema.parse(state));
      return true;
    } catch {
      return false;
    }
  },
  replay: (actions) => {
    const chess = new Chess();
    for (const action of actions) chess.move(chessMoveSchema.parse(action));
    return stateFromChess(chess);
  },
};
export function moveAt(state: ChessState, index: number) {
  const chess = new Chess(state.initialFen);
  for (const move of state.moves.slice(0, index)) chess.move(move);
  return chess.fen();
}
export function legalFrom(chess: Chess, square: string) {
  return chess.moves({ square: square as Square, verbose: true });
}
