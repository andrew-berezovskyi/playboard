import { z } from 'zod';
import { createChessSchema, type MatchView } from './chess-contracts';
import type { CheckersState, CheckersAction } from '../../games/checkers/engine';
import type { WaylineState, WaylineAction } from '../../games/wayline/engine';
export const createBoardSchema = createChessSchema
  .extend({ game: z.enum(['checkers', 'wayline']) })
  .strict();
export const boardCommandSchema = z
  .object({
    actionId: z.uuid(),
    expectedVersion: z.number().int().nonnegative(),
    action: z.discriminatedUnion('type', [
      z.object({ type: z.literal('move'), payload: z.unknown() }).strict(),
      z.object({ type: z.literal('resign') }).strict(),
      z.object({ type: z.literal('offer_draw') }).strict(),
      z.object({ type: z.literal('accept_draw') }).strict(),
      z.object({ type: z.literal('decline_draw') }).strict(),
    ]),
  })
  .strict();
export type BoardCommand = z.infer<typeof boardCommandSchema>;
export type BoardView = Omit<MatchView, 'state'> & {
  game: 'checkers' | 'wayline';
  state: CheckersState | WaylineState;
  ranked: boolean;
};
export type BoardAction = CheckersAction | WaylineAction;
