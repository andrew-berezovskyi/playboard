import { describe, expect, it } from 'vitest';
import {
  checkersEngine,
  createCheckers,
  checkersActions,
  applyCheckers,
} from '../packages/games/checkers/engine';
import {
  waylineEngine,
  createWayline,
  waylineActions,
  applyWayline,
  type WaylineState,
} from '../packages/games/wayline/engine';
import { chessEngine } from '../packages/games/chess/engine';
import { lessons } from '../packages/shared/src/lessons';
import { glicko2 } from '../packages/shared/src/rating';

describe('independent board engines', () => {
  it('starts with twelve draughts on each side and seven legal opening moves', () => {
    const s = createCheckers();
    expect(s.board.filter((p) => p === 1)).toHaveLength(12);
    expect(s.board.filter((p) => p === -1)).toHaveLength(12);
    expect(checkersActions(s)).toHaveLength(7);
  });
  it('requires captures, including backward captures, and rejects unfinished sequences', () => {
    const board = Array(64).fill(0);
    board[42] = 1;
    board[51] = -1;
    board[1] = -1;
    const s = createCheckers(board);
    expect(checkersActions(s)).toEqual([{ path: [42, 60] }]);
    expect(() => applyCheckers(s, { path: [42, 33] })).toThrow();
    const chain = lessons.find((l) => l.id === 'checkers-chain')!;
    expect(chain).toBeDefined();
    if (chain && 'path' in chain.answer)
      expect(
        checkersEngine.isLegal(chain.state as ReturnType<typeof createCheckers>, {
          path: chain.answer.path.slice(0, 2),
        }),
      ).toBe(false);
  });
  it('promotes in a capture sequence and continues as a flying king', () => {
    const board = Array(64).fill(0);
    board[17] = 1;
    board[10] = -1;
    board[12] = -1;
    board[56] = -1;
    const s = createCheckers(board),
      next = applyCheckers(s, { path: [17, 3, 21] });
    expect(next.board[21]).toBe(2);
    expect(next.board[10]).toBe(0);
    expect(next.board[12]).toBe(0);
  });
  it('replays serialized games and rejects tampered histories', () => {
    let s = createCheckers();
    for (let i = 0; i < 12; i++) s = applyCheckers(s, checkersActions(s)[0]);
    expect(checkersEngine.deserialize(checkersEngine.serialize(s))).toEqual(s);
    const bad = structuredClone(s);
    bad.board[0] = 1;
    expect(checkersEngine.validateState(bad)).toBe(false);
    let w = createWayline();
    for (let i = 0; i < 8; i++) {
      if (waylineEngine.outcome(w)) break;
      w = applyWayline(w, waylineActions(w)[0]);
    }
    expect(waylineEngine.deserialize(waylineEngine.serialize(w))).toEqual(w);
    const wb = structuredClone(w);
    wb.open = 'invalid';
    expect(waylineEngine.validateState(wb)).toBe(false);
  });
  it('exchanges a used Wayline card and rotates moves for the opponent', () => {
    const s = createWayline(),
      a = waylineActions(s)[0],
      next = applyWayline(s, a);
    expect(next.open).toBe(a.card);
    expect(next.hands.w).toContain(s.open);
    expect(next.hands.b).toEqual(s.hands.b);
    expect(next.turn).toBe('b');
    expect(waylineActions(next).length).toBeGreaterThan(0);
    expect(() => applyWayline(s, { card: a.card, from: a.from, to: a.from })).toThrow();
  });
  it('all authored lessons have a legal solution', () => {
    expect(lessons).toHaveLength(24);
    for (const lesson of lessons) {
      const engine =
        lesson.game === 'chess'
          ? chessEngine
          : lesson.game === 'checkers'
            ? checkersEngine
            : waylineEngine;
      // The union is dispatched by the lesson's game discriminant.
      expect(
        (engine.isLegal as (s: unknown, a: unknown) => boolean)(lesson.state, lesson.answer),
        lesson.id,
      ).toBe(true);
    }
  });
  it('Wayline wins by navigator capture or the second relay, not a scout relay visit', () => {
    for (const id of ['wayline-capture', 'wayline-relay-second']) {
      const lesson = lessons.find((l) => l.id === id)!;
      expect(lesson, id).toBeDefined();
      const state = applyWayline(
        lesson.state as WaylineState,
        lesson.answer as Parameters<typeof applyWayline>[1],
      );
      expect(waylineEngine.outcome(state)?.winner, id).toBe('first');
    }
    const s = createWayline();
    s.board = Array(25).fill(0);
    s.board[22] = 2;
    s.board[2] = -2;
    s.board[16] = 1;
    s.hands.w = ['stride', 'arc'];
    expect(applyWayline(s, { card: 'stride', from: 16, to: 11 }).relay.w).toBe(0);
  });
  it('Wayline forbids voluntary passes and terminates repetition and the move limit', () => {
    const s = createWayline();
    expect(() => applyWayline(s, { card: s.hands.w[0], from: null, to: null })).toThrow();
    expect(waylineEngine.outcome({ ...s, keys: [s.keys[0], s.keys[0], s.keys[0]] })?.reason).toBe(
      'repetition',
    );
    expect(
      waylineEngine.outcome({ ...s, history: Array(200).fill(waylineActions(s)[0]) })?.reason,
    ).toBe('move_limit');
    expect(waylineEngine.outcome({ ...s, passes: 2 })?.reason).toBe('blocked');
  });
  it('draughts draw counters preserve win precedence and distinguish side to move', () => {
    const s = createCheckers();
    expect(checkersEngine.outcome({ ...s, keys: [s.keys[0], s.keys[0], s.keys[0]] })?.reason).toBe(
      'repetition',
    );
    expect(checkersEngine.outcome({ ...s, kingQuiet: 29 })).toBeNull();
    expect(checkersEngine.outcome({ ...s, kingQuiet: 30 })?.winner).toBeNull();
    const empty = createCheckers(Array(64).fill(0));
    expect(checkersEngine.outcome({ ...empty, kingQuiet: 30 })?.winner).toBe('second');
  });
  it('matches Glickman’s published Glicko-2 numerical example', () => {
    const result = glicko2({ rating: 1500, deviation: 200, volatility: 0.06 }, [
      { rating: 1400, deviation: 30, volatility: 0.06, score: 1 },
      { rating: 1550, deviation: 100, volatility: 0.06, score: 0 },
      { rating: 1700, deviation: 300, volatility: 0.06, score: 0 },
    ]);
    // The paper rounds intermediate values; retain full precision here.
    expect(Math.abs(result.rating - 1464.06)).toBeLessThan(0.02);
    expect(Math.abs(result.deviation - 151.52)).toBeLessThan(0.02);
    expect(result.volatility).toBeCloseTo(0.059996, 5);
  });
});
