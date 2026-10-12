import { describe, it, expect } from 'vitest';
import {
  scenarios,
  solutions,
  replayScenario,
  trainingActions,
  equivalent,
  meetsGoal,
  trainingApply,
} from '../packages/shared/src/scenarios';
import { lessons } from '../packages/shared/src/lessons';
import { loadChess, type ChessState } from '../packages/games/chess/engine';
describe('versioned tactical training', () => {
  it('keeps all legacy lesson identifiers and distinct v2 IDs', () => {
    expect(lessons).toHaveLength(24);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
    for (const game of ['chess', 'checkers', 'wayline']) {
      expect(scenarios.filter((s) => s.game === game).length).toBeGreaterThanOrEqual(4);
      expect(scenarios.some((s) => s.game === game && s.stages.length > 1)).toBe(true);
    }
    for (const s of scenarios) expect(lessons.some((l) => l.id === s.id)).toBe(false);
  });
  for (const s of scenarios)
    it(`${s.id}: engine-valid objectives, wrong moves and equivalent alternatives`, () => {
      let inputs: unknown[] = [];
      let r = replayScenario(s, inputs);
      expect(() => replayScenario(s, [{ from: 'a0', to: 'z9', path: [-1] }])).toThrow();
      while (!r.completed) {
        const legal = trainingActions(s.game, r.state),
          correct = solutions(s, r.state, r.stage);
        expect(correct.length).toBeGreaterThan(0);
        const wrong = legal.find((a) => !correct.some((b) => equivalent(a, b)));
        if (wrong) expect(() => replayScenario(s, [...inputs, wrong])).toThrow('LESSON_WRONG');
        for (const alternative of correct) {
          expect(
            meetsGoal(
              s,
              r.state,
              alternative,
              trainingApply(s.game, r.state, alternative),
              s.stages[r.stage],
            ),
          ).toBe(true);
          expect(() => replayScenario(s, [...inputs, alternative])).not.toThrow();
        }
        inputs = [...inputs, correct[0]];
        r = replayScenario(s, inputs);
        if (inputs.length < s.stages.length) expect(r.completed).toBe(false);
      }
      expect(r.stage).toBe(s.stages.length);
      expect(() => replayScenario(s, [...inputs, inputs[0]])).toThrow();
    }, 30000);
  it('king safety starts in actual check and accepts only moves that also save the rook', () => {
    const s = scenarios.find((s) => s.id === 'chess-tactic-king-safety')!;
    expect(loadChess(s.state as ChessState).isCheck()).toBe(true);
    expect(solutions(s)).toHaveLength(1);
  });
  it('promotions allow equivalent major pieces and reject insufficient minor-piece promotions', () => {
    const s = scenarios.find((s) => s.id === 'chess-tactic-pawn-ending')!;
    expect(solutions(s).map((a) => ('promotion' in a ? a.promotion : ''))).toEqual(
      expect.arrayContaining(['q', 'r']),
    );
    expect(() => replayScenario(s, [{ from: 'a7', to: 'a8', promotion: 'n' }])).toThrow();
  });
});
