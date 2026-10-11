import { z } from 'zod';
export const brand = { name: 'Playboard', workingName: 'BoardArena' } as const;
export const registerSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase().trim()),
    username: z
      .string()
      .trim()
      .min(3)
      .max(24)
      .regex(/^[a-zA-Z0-9_]+$/)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase().trim()),
    password: z.string().min(1).max(128),
  })
  .strict();
export const emailSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase().trim()),
  })
  .strict();
export const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const resetSchema = tokenSchema.extend({ password: z.string().min(12).max(128) }).strict();
export type UserView = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
};
export type GameId = 'chess' | 'checkers' | 'wayline';
export const gameCatalog: {
  id: GameId;
  board: number;
  stage: number;
  status: 'planned' | 'beta';
}[] = [
  { id: 'chess', board: 8, stage: 2, status: 'beta' },
  { id: 'checkers', board: 8, stage: 3, status: 'beta' },
  { id: 'wayline', board: 5, stage: 4, status: 'beta' },
];
export type Side = 'first' | 'second';
export type Outcome = { winner: Side | null; reason: string };
export interface GameEngine<State, Action> {
  readonly id: GameId;
  readonly rulesVersion: string;
  initialState(): State;
  legalActions(state: State): readonly Action[];
  isLegal(state: State, action: Action): boolean;
  apply(state: State, action: Action): State;
  currentPlayer(state: State): Side;
  outcome(state: State): Outcome | null;
  serialize(state: State): string;
  deserialize(serialized: string): State;
  validateState(state: unknown): state is State;
  replay(actions: readonly Action[]): State;
}
export const matchCommandSchema = z
  .object({
    matchId: z.uuid(),
    actionId: z.uuid(),
    expectedVersion: z.number().int().nonnegative(),
    payload: z.unknown(),
  })
  .strict();
