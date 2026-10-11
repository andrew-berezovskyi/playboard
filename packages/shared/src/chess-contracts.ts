import { z } from 'zod';
import type { ChessState } from '../../games/chess/engine';
import { chessMoveSchema } from '../../games/chess/engine';
import type { Outcome } from './contracts';
export const timeControls = {
  none: { initial: 0, increment: 0 },
  '1+0': { initial: 60000, increment: 0 },
  '3+0': { initial: 180000, increment: 0 },
  '3+2': { initial: 180000, increment: 2000 },
  '5+0': { initial: 300000, increment: 0 },
  '10+0': { initial: 600000, increment: 0 },
  '15+10': { initial: 900000, increment: 10000 },
} as const;
export const createChessSchema = z
  .object({
    mode: z.enum(['private', 'bot']),
    timeControl: z.enum(['none', '1+0', '3+0', '3+2', '5+0', '10+0', '15+10']),
    side: z.enum(['w', 'b', 'random']).default('random'),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
  })
  .strict();
export type CreateChess = z.infer<typeof createChessSchema>;
export const chessCommandSchema = z
  .object({
    actionId: z.uuid(),
    expectedVersion: z.number().int().nonnegative(),
    action: z.discriminatedUnion('type', [
      chessMoveSchema.extend({ type: z.literal('move') }).strict(),
      z.object({ type: z.literal('resign') }).strict(),
      z.object({ type: z.literal('offer_draw') }).strict(),
      z.object({ type: z.literal('accept_draw') }).strict(),
      z.object({ type: z.literal('decline_draw') }).strict(),
      z
        .object({ type: z.literal('claim_draw'), intendedMove: chessMoveSchema.optional() })
        .strict(),
    ]),
  })
  .strict();
export type ChessCommand = z.infer<typeof chessCommandSchema>;
export type MatchView = {
  id: string;
  state: ChessState;
  version: number;
  status: 'waiting' | 'active' | 'finished';
  mode: 'private' | 'bot';
  difficulty: CreateChess['difficulty'];
  timeControl: CreateChess['timeControl'];
  whiteMs: number;
  blackMs: number;
  turnStartedAt: number | null;
  serverNow: number;
  white: string | null;
  black: string | null;
  yourSide: 'w' | 'b';
  result: Outcome | null;
  drawOffer: 'w' | 'b' | null;
  rematchId: string | null;
  connected: { w: boolean; b: boolean };
  ranked: boolean;
  rulesVersion: string;
};
export type MatchAck = { match?: MatchView; error?: string };
