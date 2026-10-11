import { Chess } from 'chess.js';
import { stateFromChess, type ChessState, type ChessAction } from '../../games/chess/engine';
import {
  createCheckers,
  type CheckersState,
  type CheckersAction,
} from '../../games/checkers/engine';
import {
  createWayline,
  waylineCards,
  type WaylineState,
  type WaylineAction,
} from '../../games/wayline/engine';
export type Lesson = {
  id: string;
  game: 'chess' | 'checkers' | 'wayline';
  title: { uk: string; en: string };
  task: { uk: string; en: string };
  state: ChessState | CheckersState | WaylineState;
  answer: ChessAction | CheckersAction | WaylineAction;
};
const chess = (
  id: string,
  uk: string,
  en: string,
  fen: string,
  from: string,
  to: string,
  promotion?: 'q',
): Lesson => ({
  id: `chess-${id}`,
  game: 'chess',
  title: { uk, en },
  task: {
    uk: `Зроби хід ${from} → ${to}${promotion ? ' з перетворенням на ферзя' : ''}.`,
    en: `Play ${from} → ${to}${promotion ? ' and promote to a queen' : ''}.`,
  },
  state: stateFromChess(new Chess(fen), fen),
  answer: { from, to, ...(promotion ? { promotion } : {}) },
});
const board = (pieces: [number, number][]) => {
  const b = Array<number>(64).fill(0);
  for (const [i, p] of pieces) b[i] = p;
  return b;
};
const draught = (
  id: string,
  uk: string,
  en: string,
  pieces: [number, number][],
  path: number[],
): Lesson => ({
  id: `checkers-${id}`,
  game: 'checkers',
  title: { uk, en },
  task: {
    uk: `Виконай шлях ${path.map((i) => `${'abcdefgh'[i % 8]}${8 - Math.floor(i / 8)}`).join(' → ')}.`,
    en: `Play ${path.map((i) => `${'abcdefgh'[i % 8]}${8 - Math.floor(i / 8)}`).join(' → ')}.`,
  },
  state: createCheckers(board(pieces)),
  answer: { path },
});
const way = (
  id: string,
  uk: string,
  en: string,
  card: string,
  from: number,
  to: number,
  custom?: { pieces: [number, number][]; relay?: number },
): Lesson => {
  const setup = [
      card,
      ...['stride', 'arc', 'crosswind', 'orbit', 'beacon'].filter((c) => c !== card),
    ].slice(0, 5),
    state = createWayline(setup);
  if (custom) {
    state.board = Array<number>(25).fill(0);
    for (const [i, p] of custom.pieces) state.board[i] = p;
    if (custom.relay) state.relay.w = custom.relay;
  }
  return {
    id: `wayline-${id}`,
    game: 'wayline',
    title: { uk, en },
    task: {
      uk: `Обери картку «${waylineCards.find((c) => c.id === card)!.uk}» і зроби хід ${'abcde'[from % 5]}${5 - Math.floor(from / 5)} → ${'abcde'[to % 5]}${5 - Math.floor(to / 5)}.`,
      en: `Choose “${waylineCards.find((c) => c.id === card)!.en}” and play ${'abcde'[from % 5]}${5 - Math.floor(from / 5)} → ${'abcde'[to % 5]}${5 - Math.floor(to / 5)}.`,
    },
    state,
    answer: { card, from, to },
  };
};
export const lessons: Lesson[] = [
  chess('pawn', 'Перший хід пішака', 'Your first pawn move', new Chess().fen(), 'e2', 'e4'),
  chess(
    'rook',
    'Прямі лінії тури',
    'Rook files and ranks',
    '7k/8/8/8/8/8/8/R6K w - - 0 1',
    'a1',
    'a5',
  ),
  chess(
    'bishop',
    'Діагоналі слона',
    'Bishop diagonals',
    '7k/8/8/8/8/8/8/2B4K w - - 0 1',
    'c1',
    'f4',
  ),
  chess('knight', 'Стрибок коня', 'The knight jump', '7k/8/8/8/8/8/8/1N5K w - - 0 1', 'b1', 'c3'),
  chess('queen', 'Сила ферзя', 'The queen', '7k/8/8/8/8/8/8/3Q3K w - - 0 1', 'd1', 'd5'),
  chess(
    'king',
    'Безпечний крок короля',
    'The king step',
    'k7/8/8/8/8/8/8/7K w - - 0 1',
    'h1',
    'g2',
  ),
  chess('capture', 'Взяття пішака', 'Pawn capture', 'k7/8/8/3p4/4P3/8/8/7K w - - 0 1', 'e4', 'd5'),
  chess('check', 'Створи шах', 'Give check', '7k/8/8/8/8/8/8/R6K w - - 0 1', 'a1', 'a8'),
  chess('defend', 'Вийди з-під шаху', 'Escape check', 'r6k/8/8/8/8/8/8/K7 w - - 0 1', 'a1', 'b1'),
  chess('mate', 'Мат одним ходом', 'Mate in one', '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', 'g6', 'g7'),
  chess('castle', 'Рокірування', 'Castling', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1', 'g1'),
  chess(
    'en-passant',
    'Взяття на проході',
    'En passant',
    '7k/8/8/3pP3/8/8/8/7K w - d6 0 1',
    'e5',
    'd6',
  ),
  chess(
    'promotion',
    'Перетворення пішака',
    'Promotion',
    '7k/P7/8/8/8/8/8/7K w - - 0 1',
    'a7',
    'a8',
    'q',
  ),
  draught(
    'move',
    'Діагональний хід',
    'A diagonal move',
    [
      [42, 1],
      [17, -1],
    ],
    [42, 33],
  ),
  draught(
    'capture',
    'Обов’язкове взяття',
    'Mandatory capture',
    [
      [42, 1],
      [33, -1],
      [1, -1],
    ],
    [42, 24],
  ),
  draught(
    'backward',
    'Взяття назад',
    'Capture backwards',
    [
      [42, 1],
      [51, -1],
      [1, -1],
    ],
    [42, 60],
  ),
  draught(
    'chain',
    'Серія взяттів',
    'Capture chain',
    [
      [42, 1],
      [33, -1],
      [17, -1],
      [7, -1],
    ],
    [42, 24, 10],
  ),
  draught(
    'king',
    'Дальній хід дамки',
    'Flying king',
    [
      [42, 2],
      [1, -1],
    ],
    [42, 14],
  ),
  draught(
    'promotion',
    'Перетворення під час серії',
    'Promotion during capture',
    [
      [17, 1],
      [10, -1],
      [12, -1],
      [56, -1],
    ],
    [17, 3, 21],
  ),
  way('move', 'Картка руху', 'A movement card', 'stride', 22, 17),
  way('exchange', 'Обмін картками', 'Exchange cards', 'arc', 22, 16),
  way('capture', 'Захопи навігатора', 'Capture the navigator', 'stride', 22, 17, {
    pieces: [
      [22, 2],
      [17, -2],
    ],
  }),
  way('relay-first', 'Перший вузол маршруту', 'First relay square', 'stride', 16, 11, {
    pieces: [
      [16, 2],
      [2, -2],
    ],
  }),
  way('relay-second', 'Заверши маршрут', 'Complete the relay', 'orbit', 12, 13, {
    pieces: [
      [12, 2],
      [2, -2],
    ],
    relay: 1,
  }),
];
