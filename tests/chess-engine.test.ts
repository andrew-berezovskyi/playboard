import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { Worker } from 'node:worker_threads';
import {
  chessEngine,
  stateFromChess,
  loadChess,
  automaticOutcome,
  drawClaims,
  repetitionCount,
  canPossiblyMate,
  isLockedPawnDeadPosition,
  type ChessAction,
} from '../packages/games/chess/engine';
describe('standard chess engine', () => {
  it('starts with 20 legal moves and rejects impossible moves', () => {
    const s = chessEngine.initialState();
    expect(chessEngine.legalActions(s)).toHaveLength(20);
    expect(chessEngine.isLegal(s, { from: 'e2', to: 'e5' })).toBe(false);
    expect(chessEngine.currentPlayer(chessEngine.apply(s, { from: 'e2', to: 'e4' }))).toBe(
      'second',
    );
  });
  it('castles only through unattacked squares', () => {
    let s = stateFromChess(
      new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),
      'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
    );
    s = chessEngine.apply(s, { from: 'e1', to: 'g1' });
    expect(loadChess(s).get('f1')?.type).toBe('r');
    const fen = 'r3kr1r/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    expect(chessEngine.isLegal(stateFromChess(new Chess(fen), fen), { from: 'e1', to: 'g1' })).toBe(
      false,
    );
  });
  it('implements en passant and expires its right', () => {
    const c = new Chess();
    ['e4', 'a6', 'e5', 'd5'].forEach((m) => c.move(m));
    const s = chessEngine.apply(stateFromChess(c), { from: 'e5', to: 'd6' });
    expect(loadChess(s).get('d5')).toBeUndefined();
    expect(loadChess(s).get('d6')?.type).toBe('p');
    c.move('Nf3');
    c.move('Nf6');
    expect(chessEngine.isLegal(stateFromChess(c), { from: 'e5', to: 'd6' })).toBe(false);
  });
  it('supports all promotion choices and checks king safety', () => {
    const fen = '7k/P7/8/8/8/8/8/7K w - - 0 1';
    for (const promotion of ['q', 'r', 'b', 'n'] as const) {
      const s = chessEngine.apply(stateFromChess(new Chess(fen), fen), {
        from: 'a7',
        to: 'a8',
        promotion,
      });
      expect(loadChess(s).get('a8')?.type).toBe(promotion);
    }
    const pinned = '4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1';
    expect(
      chessEngine.isLegal(stateFromChess(new Chess(pinned), pinned), { from: 'e2', to: 'a2' }),
    ).toBe(false);
  });
  it('detects mate, stalemate and material draws', () => {
    const c = new Chess();
    ['f3', 'e5', 'g4', 'Qh4#'].forEach((m) => c.move(m));
    expect(automaticOutcome(c)).toEqual({ winner: 'second', reason: 'checkmate' });
    expect(automaticOutcome(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))?.reason).toBe('stalemate');
    expect(automaticOutcome(new Chess('7k/8/8/8/8/8/8/K7 w - - 0 1'))?.reason).toBe(
      'insufficient_material',
    );
  });
  it('distinguishes threefold claim from automatic fivefold', () => {
    const c = new Chess();
    for (let cycle = 0; cycle < 2; cycle++) ['Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach((m) => c.move(m));
    expect(repetitionCount(c)).toBe(3);
    expect(drawClaims(c).repetition).toBe(true);
    expect(automaticOutcome(c)).toBeNull();
    for (let cycle = 0; cycle < 2; cycle++) ['Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach((m) => c.move(m));
    expect(automaticOutcome(c)?.reason).toBe('fivefold_repetition');
  });
  it('distinguishes 50 move claim from automatic 75', () => {
    const c = new Chess('7k/8/8/8/8/8/R7/K7 w - - 99 50');
    c.move('Ra3');
    expect(drawClaims(c).fiftyMoves).toBe(true);
    expect(automaticOutcome(c)).toBeNull();
    const automatic = new Chess('7k/8/8/8/8/8/R7/K7 w - - 149 75');
    automatic.move('Ra3');
    expect(automaticOutcome(automatic)?.reason).toBe('seventy_five_moves');
  });
  it('replays, preserves PGN/FEN and rejects corrupt restoration', () => {
    const actions = [
        { from: 'e2', to: 'e4' },
        { from: 'e7', to: 'e5' },
      ],
      s = chessEngine.replay(actions);
    expect(chessEngine.deserialize(chessEngine.serialize(s))).toEqual(s);
    expect(loadChess(s).pgn()).toContain('1. e4 e5');
    expect(chessEngine.validateState({ ...s, fen: chessEngine.initialState().fen })).toBe(false);
  });
  it('does not award a timeout win to a bare king', () => {
    const c = new Chess('7k/8/8/8/8/8/R7/K7 w - - 0 1');
    expect(canPossiblyMate(c, 'b')).toBe(false);
    expect(canPossiblyMate(c, 'w')).toBe(true);
  });
  it('uses the mating material of the surviving side, including enemy blockers', () => {
    expect(canPossiblyMate(new Chess('7k/8/8/8/8/8/B7/K6r w - - 0 1'), 'w')).toBe(false);
    expect(canPossiblyMate(new Chess('7k/8/8/8/8/8/N7/K6q w - - 0 1'), 'w')).toBe(false);
    expect(canPossiblyMate(new Chess('7k/8/8/8/8/8/N7/K6r w - - 0 1'), 'w')).toBe(true);
    expect(canPossiblyMate(new Chess('7k/8/8/8/8/8/NN6/K7 w - - 0 1'), 'w')).toBe(true);
  });
  it('proves a locked pawn wall dead without declaring movable pawn positions dead', () => {
    const wall = new Chess('7k/8/8/p1p1p1p1/P1P1P1P1/8/8/K7 w - - 0 1');
    expect(isLockedPawnDeadPosition(wall)).toBe(true);
    expect(automaticOutcome(wall)?.reason).toBe('dead_position');
    expect(isLockedPawnDeadPosition(new Chess())).toBe(false);
    expect(isLockedPawnDeadPosition(new Chess('7k/8/8/p7/P7/8/8/K7 w - - 0 1'))).toBe(false);
  });
  it('worker bots return legal moves at every difficulty', async () => {
    for (const difficulty of ['beginner', 'intermediate', 'advanced']) {
      const result = await new Promise<{ move: ChessAction; completedDepth: number }>(
        (resolve, reject) => {
          const worker = new Worker(new URL('../apps/server/src/bot-worker.mjs', import.meta.url), {
            workerData: { fen: new Chess().fen(), difficulty },
          });
          worker.once('message', (r) => {
            resolve(r);
            void worker.terminate();
          });
          worker.once('error', reject);
        },
      );
      expect(chessEngine.isLegal(chessEngine.initialState(), result.move)).toBe(true);
      expect(result.completedDepth).toBeGreaterThanOrEqual(difficulty === 'beginner' ? 1 : 2);
    }
  });
});
