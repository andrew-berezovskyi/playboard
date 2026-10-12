import { LessonActions, PageHeading } from '../ProductUI';
import { Modal } from '../ui';
import { BoardCoordinates, squareName } from '../BoardCoordinates';
import { Icon } from '../components';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError, ensurePlayer } from '../api';
import { BoardArt } from '../components';
import { ChessPiece } from '../ChessPiece';
import { BoardPiece } from '../BoardPiece';
import { Guide } from '../Guide';
import { useSession } from '../session';
import type { Lesson } from '../../../../packages/shared/src/lessons';
import {
  chessEngine,
  type ChessState,
  type ChessAction,
} from '../../../../packages/games/chess/engine';
import {
  boardActions,
  applyBoard,
  type BoardState,
  type BoardAction,
} from '../../../../packages/games/board-engine';
import { loadChess } from '../../../../packages/games/chess/engine';
import { waylineCards, type WaylineState } from '../../../../packages/games/wayline/engine';
import { courseCopy, lessonGuidance } from '../../../../packages/shared/src/courses';
type Listing = {
  id: string;
  game: string;
  title: { uk: string; en: string };
  task: { uk: string; en: string };
  completed: boolean;
};
type LearningProps = {
  lessonOverride?: string;
  courseActions?: Lesson['answer'][];
  onSolved?: (action: Lesson['answer']) => void;
};
export default function Learning(props: LearningProps = {}) {
  const { gameId, lessonId } = useParams();
  return <LessonView key={props.lessonOverride ?? lessonId ?? gameId ?? 'catalog'} {...props} />;
}
function LessonView({ lessonOverride, courseActions, onSolved }: LearningProps) {
  const { gameId, lessonId: routeLesson } = useParams(),
    { t, i18n } = useTranslation(),
    { user } = useSession(),
    [search] = useSearchParams();
  const lessonId = lessonOverride ?? routeLesson;
  const [tactics, setTactics] = useState<
    {
      id: string;
      game: string;
      title: { uk: string; en: string };
      completed: boolean;
      difficulty: number;
    }[]
  >([]);
  const [list, setList] = useState<Listing[]>([]),
    [lesson, setLesson] = useState<Lesson | null>(null),
    [state, setState] = useState<Lesson['state'] | null>(null),
    [path, setPath] = useState<number[]>([]),
    [card, setCard] = useState(''),
    [error, setError] = useState(''),
    [complete, setComplete] = useState(false),
    [saved, setSaved] = useState(false),
    [hint, setHint] = useState(false),
    [busy, setBusy] = useState(false),
    [promotion, setPromotion] = useState<ChessAction | null>(null);
  const lang = i18n.language === 'uk' ? 'uk' : 'en';
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await ensurePlayer();
        if (lessonId) {
          const r = await api<{ lesson: Lesson }>(`/learn/${lessonId}`);
          if (active) {
            setLesson(r.lesson);
            setState(r.lesson.state);
          }
          if (!lessonOverride) {
            const catalog = await api<{ lessons: Listing[] }>('/learn');
            if (active) setList(catalog.lessons);
          }
        } else {
          const r = await api<{ lessons: Listing[] }>('/learn');
          if (active) setList(r.lessons);
          const tacticalList = await api<{ scenarios: typeof tactics }>('/scenarios');
          if (active) setTactics(tacticalList.scenarios);
        }
      } catch {
        if (active) setError('UNKNOWN');
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [lessonId, lessonOverride]);
  const chess = useMemo(
    () => (state && lesson?.game === 'chess' ? loadChess(state as ChessState) : null),
    [state, lesson],
  );
  const actions = useMemo(
    () =>
      state && lesson
        ? lesson.game === 'chess'
          ? chessEngine.legalActions(state as ChessState)
          : boardActions(lesson.game, state as BoardState)
        : [],
    [state, lesson],
  );
  if (!lessonId)
    return (
      <>
        <PageHeading title={gameId ? t(`games.${gameId}`) : t('product.learn')} icon="learn" />
        {!gameId ? (
          <div className="dashboard-grid">
            {(['chess', 'checkers', 'wayline'] as const).map((game) => (
              <Link className="game-card learn-game-card" to={`/learn/${game}`} key={game}>
                <div className="card-art-link">
                  <BoardArt game={game} />
                </div>
                <div className="card-body">
                  <h2>{t(`games.${game}`)}</h2>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <>
            {' '}
            <h2>{t('learning2.fundamentals')}</h2>
            <div className="lesson-grid">
              <Link className="lesson-card" to={`/learn/${gameId}/course`}>
                <h2>{courseCopy[lang].title}</h2>
                <p>{courseCopy[lang].intro}</p>
              </Link>
              {list
                .filter((l) => l.game === gameId)
                .map((l) => (
                  <Link className="lesson-card" key={l.id} to={`/learn/${l.game}/${l.id}`}>
                    <h2>{l.title[lang]}</h2>
                    <p>
                      {t(
                        [
                          'chess-mate',
                          'chess-defend',
                          'checkers-chain',
                          'wayline-capture',
                        ].includes(l.id)
                          ? 'polish.puzzleType'
                          : 'polish.lessonType',
                      )}
                    </p>
                    {l.completed && <span>{t('product.completed')} ✓</span>}
                  </Link>
                ))}
            </div>
            <section className="dashboard-section">
              <h2>{t('learning2.tactics')}</h2>
              <div className="lesson-grid">
                {tactics
                  .filter((s) => s.game === gameId)
                  .map((s) => (
                    <Link
                      className="lesson-card"
                      key={s.id}
                      to={`/learn/${s.game}/tactics/${s.id}`}
                    >
                      <h3>{s.title[lang]}</h3>
                      <p>{t('learning2.level', { level: s.difficulty })}</p>
                      {s.completed && <span>{t('product.completed')} ✓</span>}
                    </Link>
                  ))}
              </div>
            </section>
          </>
        )}
        {error && <p role="alert">{t('product.error')}</p>}
      </>
    );
  if (!lesson || !state)
    return (
      <p role={error ? 'alert' : 'status'}>
        {t(error ? 'product.error' : 'product.lessonLoading')}
      </p>
    );
  const tactical =
    !lessonOverride &&
    (search.get('daily') === '1' ||
      ['chess-mate', 'chess-defend', 'checkers-chain', 'wayline-capture'].includes(lesson.id));
  const siblings = list.filter((l) => l.game === lesson.game);
  const nextLesson = siblings[siblings.findIndex((l) => l.id === lesson.id) + 1];
  const size = lesson.game === 'wayline' ? 5 : 8;
  const answer = lesson.answer;
  const source =
    'path' in answer
      ? answer.path[0]
      : typeof answer.from === 'string'
        ? (8 - Number(answer.from[1])) * 8 + 'abcdefgh'.indexOf(answer.from[0])
        : answer.from;
  const destination =
    'path' in answer
      ? answer.path.at(-1)!
      : typeof answer.to === 'string'
        ? (8 - Number(answer.to[1])) * 8 + 'abcdefgh'.indexOf(answer.to[0])
        : answer.to;
  const from = source === null ? '' : squareName(source, size).toUpperCase();
  const to = destination === null ? '' : squareName(destination, size).toUpperCase();
  const originPiece =
    lesson.game === 'chess'
      ? loadChess(lesson.state as ChessState).get(
          (!('path' in answer) && typeof answer.from === 'string'
            ? answer.from
            : 'a1') as import('chess.js').Square,
        )?.type
      : null;
  const pieceName =
    lesson.game === 'chess'
      ? lang === 'uk'
        ? { p: 'пішака', r: 'туру', n: 'коня', b: 'слона', q: 'ферзя', k: 'короля' }[
            originPiece ?? 'p'
          ]
        : t(`chess.${originPiece === 'b' ? 'bPiece' : originPiece}`).toLowerCase()
      : lang === 'uk'
        ? lesson.game === 'checkers'
          ? Math.abs((lesson.state as BoardState).board[source ?? 0]) === 2
            ? 'дамку'
            : 'шашку'
          : Math.abs((lesson.state as BoardState).board[source ?? 0]) === 2
            ? 'навігатора'
            : 'розвідника'
        : t(
            lesson.game === 'checkers'
              ? Math.abs((lesson.state as BoardState).board[source ?? 0]) === 2
                ? 'product.king'
                : 'product.man'
              : Math.abs((lesson.state as BoardState).board[source ?? 0]) === 2
                ? 'product.navigator'
                : 'product.scout',
          ).toLowerCase();
  const instruction =
    'path' in answer && answer.path.length > 2
      ? t('polish.multiInstruction', {
          path: answer.path.map((i) => squareName(i, size).toUpperCase()).join(' → '),
        })
      : t('polish.instruction', { piece: pieceName, from, to });
  const selected = lesson.game === 'chess' ? path[0] : path.at(-1),
    targets = actions
      .filter((a) =>
        'path' in a
          ? path.length > 0 && a.path.slice(0, path.length).every((v, i) => v === path[i])
          : 'card' in a
            ? a.card === (card || (state as WaylineState).hands.w[0]) && a.from === path[0]
            : a.from === `${'abcdefgh'[path[0] % 8]}${8 - Math.floor(path[0] / 8)}`,
      )
      .map((a) =>
        'path' in a
          ? a.path[path.length]
          : 'card' in a
            ? a.to
            : Number(8 - Number(a.to[1])) * 8 + 'abcdefgh'.indexOf(a.to[0]),
      );
  async function submit(action: ChessAction | BoardAction) {
    if (busy || complete) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ completed: boolean; saved: boolean }>(
        `/learn/${lesson!.id}/complete`,
        { action, daily: search.get('daily') === '1', ...(courseActions ? { courseActions } : {}) },
      );
      setState(
        lesson!.game === 'chess'
          ? chessEngine.apply(state as ChessState, action as ChessAction)
          : applyBoard(lesson!.game, state as BoardState, action as BoardAction),
      );
      setComplete(result.completed);
      setSaved(result.saved);
      onSolved?.(action);
      setPath([]);
      setPromotion(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'UNKNOWN');
    } finally {
      setBusy(false);
    }
  }
  function click(index: number) {
    if (complete || busy) return;
    if (lesson!.game === 'chess') {
      const square = `${'abcdefgh'[index % 8]}${8 - Math.floor(index / 8)}`,
        piece = chess!.get(square as import('chess.js').Square);
      if (piece?.color === 'w') {
        setPath([index]);
        setError('');
        return;
      }
      if (path.length) {
        const action = actions.find((a) =>
          'promotion' in a
            ? false
            : !('path' in a) &&
              !('card' in a) &&
              a.from === `${'abcdefgh'[path[0] % 8]}${8 - Math.floor(path[0] / 8)}` &&
              a.to === square,
        ) as ChessAction | undefined;
        const promotionAction = actions.find(
          (a) =>
            !('path' in a) &&
            !('card' in a) &&
            a.from === `${'abcdefgh'[path[0] % 8]}${8 - Math.floor(path[0] / 8)}` &&
            a.to === square &&
            a.promotion,
        ) as ChessAction | undefined;
        if (promotionAction) setPromotion(promotionAction);
        else if (action) void submit(action);
        else setError('LESSON_WRONG');
      }
    } else if (lesson!.game === 'checkers') {
      if (path.length && targets.includes(index)) {
        const next = [...path, index],
          action = actions.find(
            (a) => 'path' in a && JSON.stringify(a.path) === JSON.stringify(next),
          );
        if (action) void submit(action as BoardAction);
        else setPath(next);
      } else if ((state as BoardState).board[index] > 0) setPath([index]);
      else setError('LESSON_WRONG');
    } else {
      const action = actions.find(
        (a) =>
          'card' in a &&
          a.card === (card || (state as WaylineState).hands.w[0]) &&
          a.from === path[0] &&
          a.to === index,
      );
      if (action) void submit(action as BoardAction);
      else if ((state as BoardState).board[index] > 0) setPath([index]);
      else setError('LESSON_WRONG');
    }
  }
  return (
    <>
      <Link className="text-link" to={`/learn/${lesson.game}`}>
        ← {t('product.lessons')}
      </Link>
      <header className="lesson-heading">
        <Guide happy={complete} />
        <div>
          <h1>{lesson.title[lang]}</h1>
          <p className="quiet-label">{t(tactical ? 'polish.puzzleType' : 'polish.lessonType')}</p>
        </div>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error === 'LESSON_WRONG' ? courseCopy[lang].wrong : t('product.error')}
          {error === 'LESSON_WRONG' && (
            <span>
              {' '}
              {hint || !tactical ? lessonGuidance(lesson.id, lang) : t('polish.coordinates')}
            </span>
          )}
        </p>
      )}
      <div className="lesson-workspace">
        <div className={`play-board-frame coordinate-frame ${complete ? 'lesson-solved' : ''}`}>
          <BoardCoordinates size={size} />
          <div
            className="play-board"
            role="group"
            aria-label={t('product.boardLabel')}
            style={{
              gridTemplateColumns: `repeat(${size},minmax(0,1fr))`,
              gridTemplateRows: `repeat(${size},minmax(0,1fr))`,
            }}
          >
            {Array.from({ length: size * size }, (_, i) => {
              const square = `${'abcdefgh'[i % size]}${size - Math.floor(i / size)}`,
                piece = chess?.get(square as import('chess.js').Square),
                token = !chess ? (state as BoardState).board[i] : 0,
                source =
                  'path' in lesson.answer
                    ? lesson.answer.path[0]
                    : typeof lesson.answer.from === 'string'
                      ? Number(8 - Number(lesson.answer.from[1])) * 8 +
                        'abcdefgh'.indexOf(lesson.answer.from[0])
                      : lesson.answer.from;
              return (
                <button
                  key={i}
                  data-square={lesson.game === 'chess' ? square : i}
                  className={`board-square ${(Math.floor(i / size) + (i % size)) % 2 ? 'dark' : 'light'} ${selected === i ? 'is-selected' : ''} ${(hint || !tactical) && source === i ? 'hint-square' : ''}`}
                  onClick={() => click(i)}
                  disabled={busy || complete}
                  onKeyDown={(e) => {
                    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -size, ArrowDown: size }[
                      e.key
                    ];
                    if (delta !== undefined) {
                      e.preventDefault();
                      const next = i + delta;
                      if (next >= 0 && next < size * size)
                        (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
                    }
                  }}
                  aria-label={`${square.toUpperCase()}${piece ? ': ' + t(`chess.${piece.type === 'b' ? 'bPiece' : piece.type}`) : token ? ': ' + t(lesson.game === 'checkers' ? (Math.abs(token) === 2 ? 'product.king' : 'product.man') : Math.abs(token) === 2 ? 'product.navigator' : 'product.scout') : ''}`}
                >
                  {piece && <ChessPiece type={piece.type} color={piece.color} />}{' '}
                  {!!token && <BoardPiece game={lesson.game} piece={token} />}{' '}
                  {path.length > 0 && targets.includes(i) && <span className="legal-indicator" />}
                </button>
              );
            })}
          </div>
          {hint && !complete && source !== null && destination !== null && (
            <svg
              className="hint-arrow"
              viewBox={`0 0 ${size * 100} ${size * 100}`}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="lesson-arrow"
                  markerWidth="5"
                  markerHeight="5"
                  refX="3.5"
                  refY="2.5"
                  orient="auto"
                >
                  <path d="M0,0 L5,2.5 L0,5 Z" fill="currentColor" />
                </marker>
              </defs>
              <polyline
                points={('path' in answer ? answer.path : [source, destination])
                  .map((i) => `${(i % size) * 100 + 50},${Math.floor(i / size) * 100 + 50}`)
                  .join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth="9"
                strokeLinecap="round"
                opacity=".85"
                markerEnd="url(#lesson-arrow)"
              />
            </svg>
          )}
        </div>
        <section className="settings-card">
          <h2>
            <Icon name="learn" /> {t('polish.lessonHelp')}
          </h2>
          {!complete && (
            <>
              <p className="coach-instruction">
                {tactical && !hint ? t('polish.tactical') : instruction}
              </p>
              {(!tactical || hint) && (
                <p className="coach-note">{lessonGuidance(lesson.id, lang)}</p>
              )}
              {(!tactical || hint) && 'card' in answer && (
                <p className="coach-note">
                  {t('polish.chooseCard', {
                    card: waylineCards.find((c) => c.id === answer.card)?.[lang],
                  })}
                </p>
              )}
              <p className="coordinate-help">{t('polish.coordinates')}</p>
              {selected !== undefined && (
                <p aria-live="polite">
                  {t('polish.selectSquare', { square: squareName(selected, size).toUpperCase() })}
                </p>
              )}
            </>
          )}
          {lesson.game === 'wayline' && (
            <div className="movement-cards">
              {(state as WaylineState).hands.w.map((id) => (
                <button
                  className="button"
                  key={id}
                  aria-pressed={(card || (state as WaylineState).hands.w[0]) === id}
                  onClick={() => {
                    setCard(id);
                    setPath([]);
                  }}
                >
                  {waylineCards.find((c) => c.id === id)![lang]}
                </button>
              ))}
            </div>
          )}
          {promotion && (
            <Modal label={t('chess.promotion')} onClose={() => setPromotion(null)}>
              <h2>{t('chess.promotion')}</h2>
              <div className="promotion-options">
                {(['q', 'r', 'b', 'n'] as const).map((p) => (
                  <button
                    className="button"
                    key={p}
                    onClick={() => void submit({ ...promotion, promotion: p })}
                  >
                    {t(`chess.${p === 'b' ? 'bPiece' : p}`)}
                  </button>
                ))}
              </div>
              <button className="button secondary" onClick={() => setPromotion(null)}>
                {t('common.cancel')}
              </button>
            </Modal>
          )}
          {complete ? (
            <>
              <h2>{t('product.lessonComplete')}</h2>
              <p className="lesson-success" role="status">
                {lessonGuidance(lesson.id, lang)}
              </p>
              <p>{t('learning2.principle')}</p>
              <p role="status">{t(saved ? 'product.lessonSaved' : 'product.lessonGuest')}</p>
              {!onSolved && (
                <button
                  className="button"
                  onClick={() => {
                    setState(lesson.state);
                    setComplete(false);
                    setPath([]);
                  }}
                >
                  {t('product.lessonTry')}
                </button>
              )}
              {!onSolved && (
                <LessonActions>
                  <Link
                    className="button primary"
                    to={
                      nextLesson
                        ? `/learn/${lesson.game}/${nextLesson.id}`
                        : `/learn/${lesson.game}`
                    }
                  >
                    {t(nextLesson ? 'learning2.next' : 'learning2.back')}
                  </Link>
                  <Link className="button secondary" to={`/games/${lesson.game}`}>
                    {t('product.practice')}
                  </Link>
                </LessonActions>
              )}
            </>
          ) : (
            <>
              <button
                className="button secondary"
                aria-pressed={hint}
                onClick={() => setHint(!hint)}
              >
                <Icon name="hint" />
                {t(hint ? 'polish.hideHint' : 'polish.hint')}
              </button>
              {hint && <p className="coach-note">{t('polish.hintMove', { from, to })}</p>}
            </>
          )}
          {!user && (
            <p>
              <Link to="/register">{t('product.registerProgress')}</Link>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
