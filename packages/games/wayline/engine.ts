import { z } from 'zod';
import type { GameEngine, Outcome } from '../../shared/src/contracts';
export const waylineCards = [
  {
    id: 'stride',
    uk: 'Крок',
    en: 'Stride',
    moves: [
      [0, 1],
      [0, 2],
      [0, -1],
    ],
  },
  {
    id: 'arc',
    uk: 'Дуга',
    en: 'Arc',
    moves: [
      [-1, 1],
      [1, 1],
      [0, -1],
    ],
  },
  {
    id: 'crosswind',
    uk: 'Бічний вітер',
    en: 'Crosswind',
    moves: [
      [-2, 0],
      [2, 0],
      [0, 1],
    ],
  },
  {
    id: 'orbit',
    uk: 'Орбіта',
    en: 'Orbit',
    moves: [
      [-1, 0],
      [1, 0],
      [0, -1],
    ],
  },
  {
    id: 'switchback',
    uk: 'Серпантин',
    en: 'Switchback',
    moves: [
      [-1, 2],
      [1, 0],
      [0, -1],
    ],
  },
  {
    id: 'beacon',
    uk: 'Маяк',
    en: 'Beacon',
    moves: [
      [0, 1],
      [-1, -1],
      [1, -1],
    ],
  },
  {
    id: 'bridge',
    uk: 'Міст',
    en: 'Bridge',
    moves: [
      [-1, 1],
      [1, -1],
      [2, 0],
    ],
  },
  {
    id: 'drift',
    uk: 'Дрейф',
    en: 'Drift',
    moves: [
      [-1, 0],
      [1, 1],
      [0, -2],
    ],
  },
  {
    id: 'compass',
    uk: 'Компас',
    en: 'Compass',
    moves: [
      [-1, 1],
      [1, 1],
      [0, -2],
    ],
  },
  {
    id: 'loop',
    uk: 'Петля',
    en: 'Loop',
    moves: [
      [-2, 1],
      [1, 0],
      [0, -1],
    ],
  },
] as const;
export const waylineActionSchema = z
  .object({
    card: z.string().refine((v) => waylineCards.some((c) => c.id === v)),
    from: z.number().int().min(0).max(24).nullable(),
    to: z.number().int().min(0).max(24).nullable(),
  })
  .strict();
export type WaylineAction = z.infer<typeof waylineActionSchema>;
export type WaylineState = {
  board: number[];
  turn: 'w' | 'b';
  hands: { w: string[]; b: string[] };
  open: string;
  relay: { w: number; b: number };
  passes: number;
  history: WaylineAction[];
  keys: string[];
  setup: string[];
};
const owner = (p: number) => (p > 0 ? 'w' : 'b');
const key = (s: WaylineState) =>
  JSON.stringify([s.board, s.turn, [...s.hands.w].sort(), [...s.hands.b].sort(), s.open, s.relay]);
export function createWayline(setup?: string[]): WaylineState {
  const cards = setup ?? waylineCards.slice(0, 5).map((c) => c.id);
  if (
    cards.length !== 5 ||
    new Set(cards).size !== 5 ||
    cards.some((id) => !waylineCards.some((c) => c.id === id))
  )
    throw new Error('INVALID_SETUP');
  const s: WaylineState = {
    board: [-1, -1, -2, -1, -1, ...Array<number>(15).fill(0), 1, 1, 2, 1, 1],
    turn: 'w',
    hands: { w: cards.slice(0, 2), b: cards.slice(2, 4) },
    open: cards[4],
    relay: { w: 0, b: 0 },
    passes: 0,
    history: [],
    keys: [],
    setup: cards.slice(),
  };
  s.keys = [key(s)];
  return s;
}
export function waylineActions(s: WaylineState): WaylineAction[] {
  const actions: WaylineAction[] = [],
    rotation = s.turn === 'w' ? 1 : -1;
  for (const cardId of s.hands[s.turn]) {
    const card = waylineCards.find((c) => c.id === cardId)!;
    for (let from = 0; from < 25; from++) {
      if (!s.board[from] || owner(s.board[from]) !== s.turn) continue;
      const r = Math.floor(from / 5),
        c = from % 5;
      for (const [dx, dy] of card.moves) {
        const x = c + dx * rotation,
          y = r - dy * rotation,
          to = y * 5 + x;
        if (x < 0 || x >= 5 || y < 0 || y >= 5 || (s.board[to] && owner(s.board[to]) === s.turn))
          continue;
        actions.push({ card: cardId, from, to });
      }
    }
  }
  return actions.length ? actions : s.hands[s.turn].map((card) => ({ card, from: null, to: null }));
}
export function applyWayline(s: WaylineState, input: WaylineAction): WaylineState {
  const action = waylineActionSchema.parse(input);
  if (!waylineActions(s).some((a) => JSON.stringify(a) === JSON.stringify(action)))
    throw new Error('ILLEGAL_MOVE');
  const board = s.board.slice(),
    relay = { ...s.relay },
    hands = { w: s.hands.w.slice(), b: s.hands.b.slice() };
  if (action.from !== null && action.to !== null) {
    const piece = board[action.from];
    board[action.from] = 0;
    board[action.to] = piece;
    const target = s.turn === 'w' ? [11, 13] : [13, 11];
    if (Math.abs(piece) === 2 && action.to === target[relay[s.turn]]) relay[s.turn]++;
  }
  hands[s.turn][hands[s.turn].indexOf(action.card)] = s.open;
  const next = {
    ...s,
    board,
    hands,
    open: action.card,
    relay,
    turn: s.turn === 'w' ? ('b' as const) : ('w' as const),
    passes: action.from === null ? s.passes + 1 : 0,
    history: [...s.history, action],
    keys: s.keys.slice(),
  };
  next.keys.push(key(next));
  return next;
}
export function waylineOutcome(s: WaylineState): Outcome | null {
  if (!s.board.includes(-2)) return { winner: 'first', reason: 'navigator_capture' };
  if (!s.board.includes(2)) return { winner: 'second', reason: 'navigator_capture' };
  if (s.relay.w === 2) return { winner: 'first', reason: 'relay_win' };
  if (s.relay.b === 2) return { winner: 'second', reason: 'relay_win' };
  if (s.passes >= 2) return { winner: null, reason: 'blocked' };
  if (s.keys.filter((k) => k === s.keys.at(-1)).length >= 3)
    return { winner: null, reason: 'repetition' };
  if (s.history.length >= 200) return { winner: null, reason: 'move_limit' };
  return null;
}
export const waylineEngine: GameEngine<WaylineState, WaylineAction> = {
  id: 'wayline',
  rulesVersion: 'wayline-v1',
  initialState: () => createWayline(),
  legalActions: waylineActions,
  isLegal: (s, a) =>
    waylineActionSchema.safeParse(a).success &&
    waylineActions(s).some((m) => JSON.stringify(m) === JSON.stringify(a)),
  apply: applyWayline,
  currentPlayer: (s) => (s.turn === 'w' ? 'first' : 'second'),
  outcome: waylineOutcome,
  serialize: JSON.stringify,
  deserialize(raw) {
    const s = JSON.parse(raw);
    if (!this.validateState(s)) throw new Error('INVALID_STATE');
    return s;
  },
  validateState(value): value is WaylineState {
    try {
      const s = value as WaylineState;
      if (!Array.isArray(s.history) || s.history.length > 200) return false;
      const replay = s.history.reduce(applyWayline, createWayline(s.setup));
      return JSON.stringify(replay) === JSON.stringify(s);
    } catch {
      return false;
    }
  },
  replay: (actions) => actions.reduce(applyWayline, createWayline()),
};
