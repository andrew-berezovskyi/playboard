import { Chess, type Square } from 'chess.js';
import {
  chessEngine,
  loadChess,
  stateFromChess,
  type ChessState,
  type ChessAction,
} from '../../games/chess/engine';
import {
  boardActions,
  applyBoard,
  boardOutcome,
  type BoardState,
  type BoardAction,
} from '../../games/board-engine';
import { createCheckers } from '../../games/checkers/engine';
import { createWayline, type WaylineState } from '../../games/wayline/engine';
export type TrainingState = ChessState | BoardState;
export type TrainingAction = ChessAction | BoardAction;
export type Text = { uk: string; en: string };
export type Goal = {
  kind:
    | 'mate'
    | 'mate-two'
    | 'fork'
    | 'capture'
    | 'safe'
    | 'protect'
    | 'promote'
    | 'relay'
    | 'card'
    | 'win';
  piece?: string | number;
  min?: number;
  card?: string;
};
export type Scenario = {
  version: 2;
  id: string;
  game: 'chess' | 'checkers' | 'wayline';
  title: Text;
  objective: Text;
  explanation: Text;
  hints: Text[];
  state: TrainingState;
  stages: Goal[];
  difficulty: 1 | 2 | 3;
};
const text = (uk: string, en: string): Text => ({ uk, en });
export const trainingActions = (game: Scenario['game'], state: TrainingState): TrainingAction[] =>
  game === 'chess'
    ? [...chessEngine.legalActions(state as ChessState)]
    : boardActions(game, state as BoardState);
export const trainingApply = (
  game: Scenario['game'],
  state: TrainingState,
  action: TrainingAction,
): TrainingState =>
  game === 'chess'
    ? chessEngine.apply(state as ChessState, action as ChessAction)
    : applyBoard(game, state as BoardState, action as BoardAction);
export function equivalent(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const normalize = (v: object) =>
    JSON.stringify(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
  return normalize(a as object) === normalize(b as object);
}
const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(game: Scenario['game'], state: TrainingState, side: 'w' | 'b'): number {
  if (game === 'chess')
    return loadChess(state as ChessState)
      .board()
      .flat()
      .reduce((n, p) => n + (p?.color === side ? values[p.type] : 0), 0);
  return (state as BoardState).board.reduce(
    (n, p) => n + ((p > 0 ? 'w' : 'b') === side && p ? (Math.abs(p) === 2 ? 3 : 1) : 0),
    0,
  );
}
function mateInOne(state: TrainingState): boolean {
  return trainingActions('chess', state).some((a) =>
    loadChess(trainingApply('chess', state, a) as ChessState).isCheckmate(),
  );
}
export function meetsGoal(
  s: Scenario,
  before: TrainingState,
  action: TrainingAction,
  after: TrainingState,
  goal: Goal,
): boolean {
  if (goal.card && goal.kind !== 'card' && (!('card' in action) || action.card !== goal.card))
    return false;
  if (goal.kind === 'capture')
    return material(s.game, before, 'b') - material(s.game, after, 'b') >= (goal.min ?? 1);
  if (goal.kind === 'win')
    return s.game === 'chess'
      ? loadChess(after as ChessState).isCheckmate()
      : boardOutcome(s.game, after as BoardState)?.winner === 'first';
  if (s.game === 'chess') {
    const c = loadChess(after as ChessState),
      a = action as ChessAction;
    if (goal.kind === 'mate') return c.isCheckmate();
    if (goal.kind === 'mate-two')
      return (
        !c.isGameOver() &&
        trainingActions('chess', after).every((reply) =>
          mateInOne(trainingApply('chess', after, reply)),
        )
      );
    if (goal.kind === 'promote')
      return !!a.promotion && (a.promotion === 'q' || a.promotion === 'r');
    if (goal.kind === 'fork') {
      if (c.get(a.to as Square)?.type !== 'n') return false;
      const knight = c.get(a.to as Square);
      const board = c.board().flat();
      const r = 8 - Number(a.to[1]),
        col = 'abcdefgh'.indexOf(a.to[0]);
      return (
        board.filter(
          (p) =>
            p &&
            p.color !== knight?.color &&
            ['q', 'r', 'k'].includes(p.type) &&
            ((Math.abs(8 - Number(p.square[1]) - r) === 2 &&
              Math.abs('abcdefgh'.indexOf(p.square[0]) - col) === 1) ||
              (Math.abs(8 - Number(p.square[1]) - r) === 1 &&
                Math.abs('abcdefgh'.indexOf(p.square[0]) - col) === 2)),
        ).length >= 2
      );
    }
    if (goal.kind === 'safe' || goal.kind === 'protect') {
      const target = goal.piece as Square;
      const dest = a.from === target ? (a.to as Square) : target;
      return (
        !!c.get(dest) &&
        c.get(dest)?.color === 'w' &&
        (goal.kind === 'protect'
          ? a.from !== target && c.isAttacked(dest, 'w')
          : !c.isAttacked(dest, 'b'))
      );
    }
  } else {
    const b = after as BoardState,
      a = action as BoardAction;
    const from = 'path' in a ? a.path[0] : a.from,
      to = 'path' in a ? a.path.at(-1)! : a.to;
    if (goal.kind === 'promote')
      return (
        from !== null &&
        to !== null &&
        Math.abs((before as BoardState).board[from]) === 1 &&
        b.board[to] === 2
      );
    if (goal.kind === 'relay')
      return s.game === 'wayline' && (b as WaylineState).relay.w >= (goal.min ?? 1);
    if (goal.kind === 'card')
      return (
        s.game === 'wayline' &&
        (b as WaylineState).hands.w.includes(goal.card!) &&
        (goal.piece === undefined || from === goal.piece)
      );
    if (goal.kind === 'safe') {
      const target = Number(goal.piece);
      const dest = from === target ? to : target;
      if (dest === null || b.board[dest] <= 0) return false;
      return trainingActions(s.game, b).every(
        (reply) => (trainingApply(s.game, b, reply) as BoardState).board[dest] > 0,
      );
    }
  }
  return false;
}
// Controlled opponent prioritizes winning/capturing moves, then a stable tie break.
// This is an instructional opponent, not a claim of optimal engine analysis.
export function opponentReply(s: Scenario, state: TrainingState): TrainingAction | undefined {
  if (
    s.game === 'chess'
      ? loadChess(state as ChessState).isGameOver()
      : !!boardOutcome(s.game, state as BoardState)
  )
    return;
  return trainingActions(s.game, state).sort((a, b) => {
    const score = (v: TrainingAction) => {
      const next = trainingApply(s.game, state, v);
      return (
        material(s.game, state, 'w') -
        material(s.game, next, 'w') +
        (s.game === 'chess'
          ? loadChess(next as ChessState).isCheckmate()
            ? 100
            : 0
          : boardOutcome(s.game, next as BoardState)?.winner === 'second'
            ? 100
            : 0)
      );
    };
    return score(b) - score(a) || JSON.stringify(a).localeCompare(JSON.stringify(b));
  })[0];
}
export function solutions(
  s: Scenario,
  state: TrainingState = s.state,
  stage = 0,
): TrainingAction[] {
  return trainingActions(s.game, state).filter((a) => {
    const after = trainingApply(s.game, state, a);
    if (!meetsGoal(s, state, a, after, s.stages[stage])) return false;
    if (stage === s.stages.length - 1) return true;
    const reply = opponentReply(s, after);
    return !!reply && solutions(s, trainingApply(s.game, after, reply), stage + 1).length > 0;
  });
}
export function replayScenario(s: Scenario, inputs: unknown[]) {
  let state = s.state;
  const replies: TrainingAction[] = [];
  if (inputs.length > s.stages.length) throw Error('LESSON_WRONG');
  for (let stage = 0; stage < inputs.length; stage++) {
    const action = solutions(s, state, stage).find((a) => equivalent(a, inputs[stage]));
    if (!action) throw Error('LESSON_WRONG');
    state = trainingApply(s.game, state, action);
    if (stage < s.stages.length - 1) {
      const reply = opponentReply(s, state);
      if (!reply) throw Error('LESSON_WRONG');
      replies.push(reply);
      state = trainingApply(s.game, state, reply);
    }
  }
  return {
    version: s.version,
    state,
    stage: inputs.length,
    total: s.stages.length,
    completed: inputs.length === s.stages.length,
    replies,
  };
}
function make(
  id: string,
  game: Scenario['game'],
  title: Text,
  objective: Text,
  explanation: Text,
  state: TrainingState,
  stages: Goal[],
  hints: Text[],
): Scenario {
  return {
    version: 2,
    id: `${game}-tactic-${id}`,
    game,
    title,
    objective,
    explanation,
    state,
    stages,
    hints,
    difficulty: stages.length > 1 ? 3 : 2,
  };
}
const ch = (fen: string) => stateFromChess(new Chess(fen), fen);
const cb = (pieces: [number, number][]) => {
  const b = Array<number>(64).fill(0);
  for (const [i, p] of pieces) b[i] = p;
  return createCheckers(b);
};
const wb = (
  pieces: [number, number][],
  setup = ['stride', 'arc', 'crosswind', 'orbit', 'beacon'],
  relay = 0,
) => {
  const s = createWayline(setup);
  s.board = Array<number>(25).fill(0);
  for (const [i, p] of pieces) s.board[i] = p;
  s.relay.w = relay;
  s.keys = [
    JSON.stringify([
      s.board,
      s.turn,
      [...s.hands.w].sort(),
      [...s.hands.b].sort(),
      s.open,
      s.relay,
    ]),
  ];
  return s;
};
const captureHints = [
  text(
    'Спочатку порівняй цінність фігур та можливі відповіді.',
    'Compare piece values and possible replies first.',
  ),
  text('Перевір незахищені фігури суперника.', 'Look for undefended opposing pieces.'),
  text(
    'Знайди взяття, яке виконує мету позиції.',
    'Find a capture that meets the position objective.',
  ),
];
const safeHints = [
  text('Визнач загрозу до вибору свого ходу.', 'Identify the threat before selecting a move.'),
  text(
    'Перевір усі доступні взяття суперника після твого ходу.',
    'Check every opponent capture after your move.',
  ),
  text(
    'Збережи цільову фігуру, а не лише зроби допустимий хід.',
    'Keep the target piece safe, not merely make a legal move.',
  ),
];
export const scenarios: Scenario[] = [
  make(
    'defend-knight',
    'chess',
    text('Захист незахищеної фігури', 'Defend a loose piece'),
    text(
      'Кінь на D4 атакований турою. Додай йому захист, не відступаючи конем.',
      'The knight on D4 is attacked by a rook. Add a defender without retreating the knight.',
    ),
    text(
      'Пішак підтримує коня. Взяття коня турою тепер допускає вигідне взяття у відповідь.',
      'The pawn supports the knight. A rook capture can now be answered by a favourable recapture.',
    ),
    ch('7k/8/8/8/3N2r1/8/2P5/7K w - - 0 1'),
    [{ kind: 'protect', piece: 'd4' }],
    safeHints,
  ),
  make(
    'king-safety',
    'chess',
    text('Безпека короля', 'King safety'),
    text(
      'Король під шахом. Усунь шах і загрозу турі на A1.',
      'Your king is in check. Remove the check and keep the rook on A1 safe.',
    ),
    text(
      'Взяття нападника усуває шах і захищає туру.',
      'Capturing the attacker removes the check and protects the rook.',
    ),
    ch('7k/8/8/8/8/8/r6K/R7 w - - 0 1'),
    [{ kind: 'safe', piece: 'a1' }],
    safeHints,
  ),
  make(
    'knight-fork',
    'chess',
    text('Подвійний напад', 'A double threat'),
    text(
      'Створи конем одночасну загрозу двом важливим фігурам.',
      'Use your knight to threaten two major pieces at once.',
    ),
    text(
      'Кінь атакує ферзя й туру: суперник не може зберегти обидві одним ходом.',
      'The knight attacks queen and rook: one move cannot save both.',
    ),
    ch('7k/4q3/5r2/8/8/2N5/8/7K w - - 0 1'),
    [{ kind: 'fork' }],
    captureHints,
  ),
  make(
    'save-rook',
    'chess',
    text('Збережи туру', 'Save your rook'),
    text(
      'Тура на A1 під загрозою слона. Збережи її без втрати матеріалу.',
      'The rook on A1 is threatened by a bishop. Keep it safe.',
    ),
    text(
      'Перехід поза діагональ слона зберігає матеріал. Кілька безпечних клітинок рівноцінні.',
      'Moving off the bishop diagonal saves material. Several safe squares are equivalent.',
    ),
    ch('7k/8/8/8/3b4/8/8/R6K w - - 0 1'),
    [{ kind: 'safe', piece: 'a1' }],
    safeHints,
  ),
  make(
    'mate-one',
    'chess',
    text('Заверши атаку', 'Finish the attack'),
    text('Знайди мат в один хід.', 'Find checkmate in one move.'),
    text(
      'Ферзь перекриває відступ, а король підтримує його. Шах без мату недостатній.',
      'The queen cuts off escape squares while the king supports it. A check alone is not enough.',
    ),
    ch('7k/8/5KQ1/8/8/8/8/8 w - - 0 1'),
    [{ kind: 'mate' }],
    safeHints,
  ),
  make(
    'mate-two',
    'chess',
    text('План на два ходи', 'A two-move plan'),
    text(
      'Підготуй вимушений мат у два свої ходи. Суперник відповість.',
      'Prepare forced mate in two of your moves. The opponent will reply.',
    ),
    text(
      'Перший хід обмежує короля. Після відповіді ферзь закриває останній відступ.',
      'King and queen coordinate to restrict escape. After the reply close the final square.',
    ),
    ch('7k/8/5K2/5Q2/8/8/8/8 w - - 0 1'),
    [{ kind: 'mate-two' }, { kind: 'mate' }],
    safeHints,
  ),
  make(
    'material',
    'chess',
    text('Цінність фігур', 'Piece value'),
    text(
      'Виграй щонайменше туру одним ходом.',
      'Win at least a rook worth of material in one move.',
    ),
    text(
      'Незахищений ферзь дорожчий за пішака. Вибір взяття визначає вигоду.',
      'The undefended queen is worth more than a pawn. Your capture choice determines the gain.',
    ),
    ch('7k/8/8/3q4/8/8/1p6/3R3K w - - 0 1'),
    [{ kind: 'capture', min: 5 }],
    captureHints,
  ),
  make(
    'pawn-ending',
    'chess',
    text('Пішакове закінчення', 'Pawn ending'),
    text(
      'Перетвори прохідного пішака на важку фігуру.',
      'Promote the passed pawn to a major piece.',
    ),
    text(
      'На останній горизонталі пішак перетворюється. Ферзь або тура виконують ціль.',
      'On the final rank the pawn promotes. A queen or rook meets the objective.',
    ),
    ch('7k/P7/8/8/8/8/8/7K w - - 0 1'),
    [{ kind: 'promote' }],
    captureHints,
  ),
  make(
    'capture-or-save',
    'chess',
    text('Взяття чи захист?', 'Capture or defend?'),
    text(
      'Не спокушайся пішаком: збережи туру на A1 від слона.',
      'Do not be tempted by a knight: save the rook on A1 from the bishop.',
    ),
    text(
      'Взяття пішака на A2 залишає туру на діагоналі. Безпечний хід важливіший.',
      'Capturing the knight leaves the rook on the bishop diagonal. Safety comes first.',
    ),
    ch('7k/8/8/8/8/8/1b6/R1n4K w - - 0 1'),
    [{ kind: 'safe', piece: 'a1' }],
    safeHints,
  ),
  make(
    'queen-trap',
    'chess',
    text('Уникай пастки', 'Avoid the trap'),
    text(
      'Ферзь на D1 під ударом коня. Збережи ферзя, а не бери випадковий пішак.',
      'The queen on D1 is attacked by a knight. Save it rather than take a loose pawn.',
    ),
    text(
      'Перевірка клітинок коня допомагає обрати безпечний відступ ферзя.',
      'Checking the knight attacks reveals safe queen retreats.',
    ),
    ch('7k/8/8/8/8/2n5/1p6/3Q3K w - - 0 1'),
    [{ kind: 'safe', piece: 'd1' }],
    safeHints,
  ),
  make(
    'mandatory',
    'checkers',
    text('Взяття має пріоритет', 'Capture takes priority'),
    text(
      'Обери взяття з виграшем матеріалу; тихий хід заборонений.',
      'Choose a material-winning capture; quiet moves are forbidden.',
    ),
    text(
      'У Draughts-64 взяття обов’язкове, включно зі взяттям назад.',
      'Draughts-64 requires captures, including backwards captures.',
    ),
    cb([
      [42, 1],
      [33, -1],
      [1, -1],
      [46, 1],
    ]),
    [{ kind: 'capture' }],
    captureHints,
  ),
  make(
    'chain',
    'checkers',
    text('Повна комбінація', 'Complete the combination'),
    text(
      'Зніми щонайменше дві шашки за одну серію.',
      'Capture at least two men in a single sequence.',
    ),
    text(
      'Не можна зупинити серію, поки та сама шашка може продовжити взяття.',
      'A capture sequence cannot stop while the same piece can capture again.',
    ),
    cb([
      [42, 1],
      [33, -1],
      [17, -1],
      [7, -1],
      [46, 1],
      [37, -1],
    ]),
    [{ kind: 'capture', min: 2 }],
    captureHints,
  ),
  make(
    'choose-chain',
    'checkers',
    text('Обери вигідну серію', 'Choose the stronger sequence'),
    text(
      'Серед доступних серій обери ту, що виграє щонайменше дві шашки.',
      'Among available sequences choose one that wins at least two men.',
    ),
    text(
      'Правила дозволяють різні серії; найдовша не є автоматично обов’язковою. Тут ціль — матеріальна вигода.',
      'Different sequences are legal; the longest is not automatically compulsory. This exercise asks for material gain.',
    ),
    cb([
      [21, 1],
      [30, -1],
      [46, -1],
      [17, 1],
      [26, -1],
      [56, -1],
    ]),
    [{ kind: 'capture', min: 2 }],
    captureHints,
  ),
  make(
    'safe-man',
    'checkers',
    text('Захист від взяття', 'Avoid a capture'),
    text(
      'Збережи шашку на C3 від відповіді суперника.',
      'Keep the man on C3 safe from the opponent reply.',
    ),
    text(
      'Перед тихим ходом перевір можливий стрибок через твою шашку.',
      'Before a quiet move check whether the opponent can jump your man.',
    ),
    cb([
      [42, 1],
      [26, -1],
      [7, -1],
      [46, 1],
    ]),
    [{ kind: 'safe', piece: 42 }],
    safeHints,
  ),
  make(
    'crown',
    'checkers',
    text('Шлях до дамки', 'The path to promotion'),
    text('Досягни останньої горизонталі та отримай дамку.', 'Reach the final rank and promote.'),
    text(
      'Після перетворення дамка може продовжувати взяття на великій відстані.',
      'After promotion a flying king can continue capturing over long distances.',
    ),
    cb([
      [17, 1],
      [10, -1],
      [12, -1],
      [56, -1],
      [42, 1],
    ]),
    [{ kind: 'promote' }],
    captureHints,
  ),
  make(
    'flying',
    'checkers',
    text('Дальня атака', 'A flying attack'),
    text('Дамкою виграй щонайменше одну шашку.', 'Win at least one man with the flying king.'),
    text(
      'Дамка проходить вільні клітинки до суперника й обирає допустиму клітинку за ним.',
      'A flying king crosses empty squares to the enemy and may land on a legal square beyond it.',
    ),
    cb([
      [42, 2],
      [28, -1],
      [7, -1],
    ]),
    [{ kind: 'capture' }],
    captureHints,
  ),
  make(
    'ending',
    'checkers',
    text('Виграшне закінчення', 'Winning ending'),
    text('Зніми останню шашку суперника.', 'Capture the last opposing man.'),
    text(
      'Відсутність фігур завершує гру; неповна серія не виконає мету.',
      'Removing the final opposing piece wins the game.',
    ),
    cb([
      [42, 2],
      [28, -1],
    ]),
    [{ kind: 'win' }],
    captureHints,
  ),
  make(
    'two-captures',
    'checkers',
    text('Два тактичні удари', 'Two tactical strikes'),
    text(
      'Виграй матеріал, дочекайся відповіді й знову виграй матеріал.',
      'Win material, wait for a reply, then win material again.',
    ),
    text(
      'Після першого взяття потрібно заново оцінити позицію, а не завершувати вправу.',
      'After the first capture reassess the position rather than stopping the exercise.',
    ),
    cb([
      [7, 2],
      [12, 1],
      [14, -1],
      [17, -1],
      [26, 1],
      [35, -1],
      [53, -1],
    ]),
    [{ kind: 'capture' }, { kind: 'capture' }],
    captureHints,
  ),
  make(
    'navigator',
    'wayline',
    text('Ціль — навігатор', 'Target the navigator'),
    text(
      'Захопи навігатора суперника правильним вибором картки.',
      'Capture the opposing navigator by choosing the right card.',
    ),
    text(
      'Картка визначає доступний напрямок. Захоплення навігатора завершує гру.',
      'The card determines available directions. Capturing the navigator ends the game.',
    ),
    wb([
      [22, 2],
      [17, -2],
      [20, 1],
    ]),
    [{ kind: 'win' }],
    captureHints,
  ),
  make(
    'protect-navigator',
    'wayline',
    text('Захист навігатора', 'Protect the navigator'),
    text(
      'Збережи навігатора на C2 від наступного захоплення.',
      'Keep the navigator on C2 safe from the next capture.',
    ),
    text(
      'Перевір картки в руці суперника, а не лише його поточну клітинку.',
      'Check the opponent hand, not only its current square.',
    ),
    wb([
      [17, 2],
      [7, -2],
      [11, -1],
      [20, 1],
    ]),
    [{ kind: 'safe', piece: 17 }],
    safeHints,
  ),
  make(
    'relay',
    'wayline',
    text('Боротьба за вузол', 'Contest the relay'),
    text(
      'Займи перший вузол маршруту навігатором.',
      'Occupy the first relay square with your navigator.',
    ),
    text(
      'Лише навігатор просуває relay-маршрут; розвідник не виконує цю ціль.',
      'Only the navigator advances the relay route; a scout cannot meet this objective.',
    ),
    wb([
      [16, 2],
      [2, -2],
      [20, 1],
    ]),
    [{ kind: 'relay', min: 1 }],
    captureHints,
  ),
  make(
    'finish-relay',
    'wayline',
    text('Заверши маршрут', 'Finish the route'),
    text(
      'Після першого вузла займи другий і виграй.',
      'After the first relay square occupy the second and win.',
    ),
    text(
      'Другий вузол має значення лише після першого. Порядок визначає результат.',
      'The second square counts only after the first. Order determines the result.',
    ),
    wb(
      [
        [12, 2],
        [2, -2],
        [20, 1],
      ],
      ['orbit', 'arc', 'crosswind', 'stride', 'beacon'],
      1,
    ),
    [{ kind: 'win' }],
    captureHints,
  ),
  make(
    'exchange-plan',
    'wayline',
    text('Плануй обмін', 'Plan the exchange'),
    text(
      'Зроби хід навігатором із C1 так, щоб отримати відкритий Маяк. Потім займи вузол.',
      'Move the navigator from C1 to obtain the open Beacon card, then reach a relay square after the reply.',
    ),
    text(
      'Використана картка виходить із руки, відкрита входить. План охоплює наступний хід.',
      'The used card leaves your hand and the open card enters. Plan for the next turn.',
    ),
    wb([
      [22, 2],
      [2, -2],
      [20, 1],
    ]),
    [
      { kind: 'card', card: 'beacon', piece: 22 },
      { kind: 'relay', min: 1, card: 'beacon' },
    ],
    captureHints,
  ),
  make(
    'block-capture',
    'wayline',
    text('Зірви загрозу', 'Disrupt the threat'),
    text(
      'Виграй розвідника й збережи власного навігатора після відповіді.',
      'Win a scout, then keep your navigator safe after the reply.',
    ),
    text(
      'Негайна вигода корисна лише коли наступний хід не втрачає навігатора.',
      'An immediate gain matters only if the next move preserves your navigator.',
    ),
    wb([
      [22, 2],
      [2, -2],
      [17, -1],
      [20, 1],
      [9, -1],
    ]),
    [{ kind: 'capture' }, { kind: 'safe', piece: 17 }],
    safeHints,
  ),
  make(
    'card-capture',
    'wayline',
    text('Картка й ціль', 'Card and target'),
    text(
      'Знайди захоплення розвідника серед кількох напрямків руху.',
      'Find a scout capture among several movement directions.',
    ),
    text(
      'Зміна картки змінює допустимі клітинки. Порівнюй обидві перед ходом.',
      'Changing the card changes reachable squares. Compare both before moving.',
    ),
    wb([
      [22, 2],
      [2, -2],
      [16, -1],
      [20, 1],
    ]),
    [{ kind: 'capture' }],
    captureHints,
  ),
  make(
    'long-plan',
    'wayline',
    text('Далі за перший вузол', 'Beyond the first relay'),
    text(
      'Займи перший вузол, переживи відповідь і збережи навігатора.',
      'Reach the first relay, face the reply, then preserve your navigator.',
    ),
    text(
      'Просування маршруту та безпека — дві різні цілі. Вправа перевіряє обидві.',
      'Route progress and safety are separate goals. This exercise checks both.',
    ),
    wb([
      [16, 2],
      [2, -2],
      [20, 1],
      [9, -1],
    ]),
    [
      { kind: 'relay', min: 1 },
      { kind: 'safe', piece: 11 },
    ],
    safeHints,
  ),
];
