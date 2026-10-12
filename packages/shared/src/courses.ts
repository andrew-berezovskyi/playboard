import { lessons, type Lesson } from './lessons';
export type CourseGame = Lesson['game'];
export const courseLessons = (game: CourseGame) => lessons.filter((lesson) => lesson.game === game);
const guidance: Record<string, [string, string]> = {
  'chess-pawn': [
    'Пішак ходить уперед. З початкової клітинки він може пройти дві вільні клітинки.',
    'A pawn moves forward. From its starting square it may advance two clear squares.',
  ],
  'chess-rook': [
    'Тура рухається по горизонталі або вертикалі, не перестрибуючи фігури.',
    'A rook moves along ranks or files without jumping over pieces.',
  ],
  'chess-bishop': [
    'Слон рухається по діагоналі й завжди залишається на клітинках одного кольору.',
    'A bishop moves diagonally and always stays on the same square color.',
  ],
  'chess-knight': [
    'Кінь рухається літерою Г: дві клітинки в одному напрямку й одна вбік. Він може перестрибувати фігури.',
    'A knight moves two squares in one direction and one sideways. It can jump over pieces.',
  ],
  'chess-queen': [
    'Ферзь поєднує рухи тури й слона: прямі лінії та діагоналі.',
    'A queen combines rook and bishop movement: straight lines and diagonals.',
  ],
  'chess-king': [
    'Король ходить на одну клітинку, але не може опинитися під ударом.',
    'A king moves one square but cannot move into an attack.',
  ],
  'chess-capture': [
    'Пішак бере по діагоналі на одну клітинку вперед, а не прямо.',
    'A pawn captures one square diagonally forward, rather than straight ahead.',
  ],
  'chess-check': [
    'Шах означає загрозу королю. Суперник має прибрати її наступним ходом.',
    'Check is an attack on the king. The opponent must remove it on the next move.',
  ],
  'chess-defend': [
    'Під шахом треба відійти королем, закрити лінію атаки або взяти нападника.',
    'In check, move the king, block the attack or capture the attacker.',
  ],
  'chess-mate': [
    'Мат — це шах, від якого немає законного захисту. Обери клітинку, що перекриває всі виходи.',
    'Checkmate is check with no legal escape. Choose a square that covers every exit.',
  ],
  'chess-castle': [
    'Рокірування переміщує короля на дві клітинки до тури. Король не може бути під шахом чи проходити атаковані клітинки.',
    'Castling moves the king two squares toward a rook. The king cannot be in check or cross attacked squares.',
  ],
  'chess-en-passant': [
    'Взяття на проході можливе лише відразу після подвійного ходу сусіднього пішака.',
    'En passant is available only immediately after the adjacent pawn advances two squares.',
  ],
  'chess-promotion': [
    'На останній горизонталі пішак перетворюється на ферзя, туру, слона або коня. У цьому завданні обери ферзя.',
    'On the last rank a pawn promotes to a queen, rook, bishop or knight. Choose a queen in this task.',
  ],
  'checkers-move': [
    'Проста шашка ходить на одну вільну клітинку по діагоналі вперед.',
    'A man moves one empty square diagonally forward.',
  ],
  'checkers-capture': [
    'Якщо є взяття, звичайний хід заборонений. Перестрибни фішку суперника.',
    'When a capture exists, a quiet move is forbidden. Jump over the opposing piece.',
  ],
  'checkers-backward': [
    'На відміну від звичайного ходу, проста шашка може брати назад.',
    'Unlike a quiet move, a man can capture backwards.',
  ],
  'checkers-chain': [
    'Після першого взяття продовжуй тією самою фішкою, доки є наступне взяття.',
    'After the first capture, continue with the same piece while another capture is available.',
  ],
  'checkers-king': [
    'Дамка рухається й бере на будь-яку відстань по вільній діагоналі.',
    'A king slides and captures along any clear diagonal distance.',
  ],
  'checkers-promotion': [
    'Досягнувши останньої горизонталі під час взяття, шашка відразу продовжує як дамка.',
    'Reaching the last rank during a capture immediately promotes the man, which continues as a king.',
  ],
  'wayline-move': [
    'Картка визначає доступні переміщення. Центральна позначка — твоя фігура, інші — можливі цілі.',
    'The card defines movement. Its center marks your piece; other marks are possible targets.',
  ],
  'wayline-exchange': [
    'Після ходу використана картка стає відкритою, а ти отримуєш попередню відкриту картку.',
    'After moving, your used card becomes the open card and you receive the previously open card.',
  ],
  'wayline-capture': [
    'Захоплення навігатора суперника відразу завершує партію перемогою.',
    'Capturing the opposing navigator immediately wins the game.',
  ],
  'wayline-relay-first': [
    'Перший вузол має відвідати саме навігатор. Прогрес зберігається, коли він іде далі.',
    'Your navigator must visit the first relay. Progress remains when it moves away.',
  ],
  'wayline-relay-second': [
    'Після першого вузла навігатор має дістатися другого — це альтернативний шлях до перемоги.',
    'After the first relay, reach the second with your navigator for an alternative win.',
  ],
};
export const lessonGuidance = (id: string, language: 'uk' | 'en') =>
  guidance[id]?.[language === 'uk' ? 0 : 1] ?? '';
export function validateCourseActions(game: CourseGame, actions: unknown[]) {
  const steps = courseLessons(game);
  return (
    actions.length > 0 &&
    actions.length <= steps.length &&
    actions.every((action, i) => JSON.stringify(action) === JSON.stringify(steps[i].answer))
  );
}
export const courseCopy = {
  uk: {
    title: 'Перші кроки',
    intro:
      'Виконай практичні кроки, а потім зіграй навчальну партію. Кожен крок відкривається після правильного ходу.',
    next: 'Наступний урок',
    step: 'Крок',
    finish: 'Курс завершено',
    practice: 'Практика з ботом',
    skip: 'Перейти до вільної практики',
    error: 'Не вдалося зберегти крок. Спробуй ще раз.',
    wrong:
      'Цей хід не виконує завдання. Зверни увагу на початкову клітинку, напрямок і ціль. Підказка покаже фігуру, яку потрібно обрати.',
    help: 'Правила й допомога',
    hint: 'Показати допустимий хід',
    training: 'Навчальна партія: підказки доступні тільки проти бота.',
    capture: 'Ефект взяття',
    cards: 'Оформлення карток',
    minimal: 'Мінімальне',
    diagram: 'З координатною сіткою',
    chess:
      'Фігури рухаються по-різному. Захищай короля: хід, що залишає його під шахом, заборонений. Мат завершує партію; пат означає нічию. Рокірування потребує вільного й безпечного шляху. Пішак перетворюється на останній горизонталі.',
    checkers:
      'Прості шашки ходять уперед по діагоналі, а беруть у двох напрямках. Взяття обов’язкове: заверши всю серію. Дамка рухається на будь-яку відстань по діагоналі. Під час серії можна стати дамкою; взяті фішки прибираються після її завершення.',
    wayline:
      'Обери одну зі своїх двох карток, потім фігуру й клітинку. Використана картка обмінюється на відкриту. Напрямки показано від твоєї сторони. Візьми навігатора суперника або послідовно відвідай обидва вузли своїм навігатором. Пас дозволено тільки коли жодна картка не дає ходу.',
  },
  en: {
    title: 'First steps',
    intro:
      'Complete the practical steps, then play a guided game. Each step unlocks after a correct move.',
    next: 'Next lesson',
    step: 'Step',
    finish: 'Course complete',
    practice: 'Practice with a bot',
    skip: 'Go to free practice',
    error: 'Could not save this step. Please try again.',
    wrong:
      'This move does not solve the task. Check the starting square, direction and target. The hint highlights the piece to select.',
    help: 'Rules and help',
    hint: 'Show a legal move',
    training: 'Guided game: hints are available only against a bot.',
    capture: 'Capture effect',
    cards: 'Card appearance',
    minimal: 'Minimal',
    diagram: 'Coordinate grid',
    chess:
      'Each piece moves differently. Protect your king: moves that leave it in check are illegal. Checkmate ends the game; stalemate is a draw. Castling needs a clear, safe path. A pawn promotes on the last rank.',
    checkers:
      'Men move diagonally forward and capture in both directions. Captures are mandatory: complete the entire chain. Kings slide along diagonals. Promotion can happen during a chain; captured pieces remain until the chain ends.',
    wayline:
      'Choose one of your two cards, then a piece and destination. The used card exchanges with the open card. Directions are shown from your side. Capture the opposing navigator or visit both relay squares in order with your navigator. Passing is allowed only when neither card offers a move.',
  },
};
