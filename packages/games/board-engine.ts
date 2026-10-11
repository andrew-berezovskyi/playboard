import { checkersEngine, type CheckersState, type CheckersAction } from './checkers/engine';
import { waylineEngine, type WaylineState, type WaylineAction } from './wayline/engine';
export type BoardState = CheckersState | WaylineState;
export type BoardAction = CheckersAction | WaylineAction;
export const boardActions = (game: string, state: BoardState): BoardAction[] =>
  game === 'checkers'
    ? [...checkersEngine.legalActions(state as CheckersState)]
    : [...waylineEngine.legalActions(state as WaylineState)];
export const applyBoard = (game: string, state: BoardState, action: BoardAction): BoardState =>
  game === 'checkers'
    ? checkersEngine.apply(state as CheckersState, action as CheckersAction)
    : waylineEngine.apply(state as WaylineState, action as WaylineAction);
export const boardOutcome = (game: string, state: BoardState) =>
  game === 'checkers'
    ? checkersEngine.outcome(state as CheckersState)
    : waylineEngine.outcome(state as WaylineState);
