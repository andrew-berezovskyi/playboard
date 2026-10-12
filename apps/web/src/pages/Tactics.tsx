import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ensurePlayer } from '../api';
import { courseCopy } from '../../../../packages/shared/src/courses';
import type {
  TrainingState,
  TrainingAction,
  Scenario,
  Text,
} from '../../../../packages/shared/src/scenarios';
import { chessEngine, loadChess, type ChessState } from '../../../../packages/games/chess/engine';
import { boardActions, type BoardState } from '../../../../packages/games/board-engine';
import { type WaylineState, waylineCards } from '../../../../packages/games/wayline/engine';
import { BoardCoordinates, squareName } from '../BoardCoordinates';
import { ChessPiece } from '../ChessPiece';
import { BoardPiece } from '../BoardPiece';
import { Guide } from '../Guide';
import { LessonActions, PageHeading } from '../ProductUI';
import { Modal } from '../ui';

type View = Pick<Scenario, 'id' | 'game' | 'version' | 'title' | 'objective' | 'difficulty'> & {
  total: number;
};
type Result = {
  state: TrainingState;
  stage: number;
  total: number;
  completed: boolean;
  saved: boolean;
  hint?: Text;
  focus?: string | number;
  direction?: TrainingAction;
  solution?: TrainingAction[];
  explanation?: Text;
};
const numeric = (square: string | number, size: number) =>
  typeof square === 'number'
    ? square
    : (size - Number(square[1])) * size + 'abcdefgh'.indexOf(square[0]);
const endpoints = (a: TrainingAction, size: number) =>
  'path' in a
    ? [a.path[0], a.path.at(-1)!]
    : [a.from === null ? -1 : numeric(a.from, size), a.to === null ? -1 : numeric(a.to, size)];
export default function Tactics() {
  const { scenarioId } = useParams();
  return <TacticalLesson key={scenarioId} />;
}
function TacticalLesson() {
  const { scenarioId } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'uk' ? 'uk' : 'en';
  const [scenario, setScenario] = useState<View | null>(null),
    [nextId, setNextId] = useState<string | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [answers, setAnswers] = useState<TrainingAction[]>([]),
    [path, setPath] = useState<number[]>([]),
    [card, setCard] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [helpOpen, setHelpOpen] = useState(false),
    [hintLevel, setHintLevel] = useState(0),
    [revealed, setRevealed] = useState<TrainingAction[]>([]),
    [promotion, setPromotion] = useState<TrainingAction[]>([]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await ensurePlayer();
        const r = await api<Result & { scenario: View }>(`/scenarios/${scenarioId}`);
        if (!active) return;
        const catalog = await api<{ scenarios: { id: string; game: string }[] }>('/scenarios');
        if (!active) return;
        const siblings = catalog.scenarios.filter((s) => s.game === r.scenario.game);
        setNextId(siblings[siblings.findIndex((s) => s.id === scenarioId) + 1]?.id ?? null);
        setScenario(r.scenario);
        setResult(r);
        let saved: TrainingAction[] = [];
        try {
          saved = JSON.parse(sessionStorage.getItem(`scenario-v2:${scenarioId}`) ?? '[]');
        } catch {
          /* Ignore corrupt local UI state. */
        }
        if (Array.isArray(saved) && saved.length) {
          try {
            const resumed = await api<Result>(`/scenarios/${scenarioId}/step`, {
              version: 2,
              actions: saved,
            });
            if (active) {
              setAnswers(saved);
              setResult(resumed);
            }
          } catch {
            sessionStorage.removeItem(`scenario-v2:${scenarioId}`);
          }
        }
      } catch {
        if (active) setError('UNKNOWN');
      }
    })();
    return () => {
      active = false;
    };
  }, [scenarioId]);
  if (!scenario || !result)
    return (
      <p role={error ? 'alert' : 'status'}>{error ? t('product.error') : t('common.loading')}</p>
    );
  const size = scenario.game === 'wayline' ? 5 : 8;
  const legal: TrainingAction[] =
    scenario.game === 'chess'
      ? [...chessEngine.legalActions(result.state as ChessState)]
      : boardActions(scenario.game, result.state as BoardState);
  const chess = scenario.game === 'chess' ? loadChess(result.state as ChessState) : null;
  const board = chess ? chess.board().flat() : (result.state as BoardState).board;
  const hand = scenario.game === 'wayline' ? (result.state as WaylineState).hands.w : [];
  const candidates = legal.filter((a) =>
    'path' in a
      ? path.length > 0 && a.path.slice(0, path.length).every((v, i) => v === path[i])
      : (!('card' in a) || a.card === (card || hand[0])) && endpoints(a, size)[0] === path[0],
  );
  const targets = candidates.map((a) =>
    'path' in a ? a.path[path.length] : endpoints(a, size)[1],
  );
  async function send(next: TrainingAction[]) {
    setBusy(true);
    setError('');
    try {
      const r = await api<Result>(`/scenarios/${scenarioId}/step`, { version: 2, actions: next });
      setResult(r);
      setAnswers(next);
      sessionStorage.setItem(`scenario-v2:${scenarioId}`, JSON.stringify(next));
      setPath([]);
      setCard('');
      setPromotion([]);
      setHintLevel(0);
    } catch {
      setError('learning2.wrong');
      setPath([]);
    } finally {
      setBusy(false);
    }
  }
  function select(index: number) {
    if (busy || result!.completed) return;
    if (targets.includes(index)) {
      const next = [...path, index];
      const moves = candidates.filter((a) =>
        'path' in a
          ? a.path.length === next.length && a.path.every((v, i) => v === next[i])
          : endpoints(a, size)[1] === index,
      );
      if (moves.length > 1 && moves.some((a) => 'promotion' in a)) setPromotion(moves);
      else if (moves[0]) void send([...answers, moves[0]]);
      else setPath(next);
      return;
    }
    const piece = board[index];
    if (
      chess
        ? typeof piece === 'object' && piece?.color === 'w'
        : typeof piece === 'number' && piece > 0
    ) {
      setPath([index]);
      setError('');
    } else setPath([]);
  }
  async function help(solution = false) {
    setBusy(true);
    setError('');
    try {
      const r = await api<Result>(`/scenarios/${scenarioId}/step`, {
        version: 2,
        actions: answers,
        ...(solution ? { solution: true } : { hint: Math.min(3, hintLevel + 1) }),
      });
      setResult({ ...result!, ...r });
      if (solution) setRevealed(r.solution ?? []);
      else setHintLevel(Math.min(3, hintLevel + 1));
    } catch {
      setError('product.error');
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setBusy(true);
    setCard('');
    setAnswers([]);
    setPath([]);
    setHintLevel(0);
    setRevealed([]);
    setError('');
    sessionStorage.removeItem(`scenario-v2:${scenarioId}`);
    void api<Result>(`/scenarios/${scenarioId}`)
      .then(setResult)
      .catch(() => setError('product.error'))
      .finally(() => setBusy(false));
  }
  const focus = result.focus === undefined ? -1 : numeric(result.focus, size);
  return (
    <>
      <Link className="text-link" to={`/learn/${scenario.game}`}>
        {t('learning2.back')}
      </Link>
      <PageHeading title={scenario.title[lang]} icon="learn" />
      <div className="lesson-workspace">
        <div className="play-board-frame coordinate-frame">
          <BoardCoordinates size={size} />
          <div
            className={`tactics-board ${scenario.game === 'chess' ? 'chess-board' : 'board-grid'}`}
            role="group"
            aria-label={t(`games.${scenario.game}`)}
            style={{ gridTemplateColumns: `repeat(${size},1fr)` }}
          >
            {board.map((piece, index) => (
              <button
                key={index}
                type="button"
                data-square={squareName(index, size)}
                aria-label={`${squareName(index, size).toUpperCase()}${chess && typeof piece === 'object' && piece ? ` ${t(`chess.${piece.color}`)} ${t(`chess.${piece.type === 'b' ? 'bPiece' : piece.type}`)}` : typeof piece === 'number' && piece ? ` ${t(`chess.${piece > 0 ? 'w' : 'b'}`)} ${t(scenario.game === 'checkers' ? (Math.abs(piece) === 2 ? 'product.king' : 'product.man') : Math.abs(piece) === 2 ? 'product.navigator' : 'product.scout')}` : ''}`}
                aria-pressed={path.includes(index)}
                disabled={busy || result.completed}
                className={`board-square ${(Math.floor(index / size) + (index % size)) % 2 ? 'dark' : 'light'} ${path.includes(index) ? 'selected' : ''} ${targets.includes(index) ? 'legal-target' : ''} ${focus === index ? 'hint-square' : ''}`}
                onClick={() => select(index)}
                onKeyDown={(e) => {
                  const offsets: Record<string, number> = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -size,
                    ArrowDown: size,
                  };
                  if (e.key in offsets) {
                    e.preventDefault();
                    const cells =
                      e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
                    cells
                      ?.item(Math.max(0, Math.min(size * size - 1, index + offsets[e.key])))
                      ?.focus();
                  }
                }}
              >
                {chess && typeof piece === 'object' && piece ? (
                  <ChessPiece color={piece.color} type={piece.type} />
                ) : typeof piece === 'number' && piece ? (
                  <BoardPiece piece={piece} game={scenario.game} />
                ) : null}
              </button>
            ))}
          </div>
        </div>
        <section className="settings-card tactic-coach">
          <div className="coach-title">
            <Guide happy={result.completed} />
            <h2>{t('polish.lessonHelp')}</h2>
          </div>
          <h2>{result.completed ? t('product.lessonComplete') : scenario.objective[lang]}</h2>
          <p aria-live="polite">
            {t('learning2.step', { stage: result.stage, total: result.total })}
          </p>
          <progress aria-label={t('learning2.progress')} value={result.stage} max={result.total} />
          {result.completed ? (
            <>
              <p>{result.explanation?.[lang]}</p>
              <p>{t(result.saved ? 'learning2.saved' : 'learning2.guest')}</p>
            </>
          ) : (
            <>
              <p>{t('learning2.select')}</p>
              {result.stage > 0 && <p role="status">{t('learning2.reply')}</p>}
              {hand.length > 0 && (
                <div className="movement-cards">
                  {hand.map((id) => (
                    <button
                      key={id}
                      className="button secondary"
                      aria-pressed={(card || hand[0]) === id}
                      onClick={() => {
                        setCard(id);
                        setPath([]);
                      }}
                    >
                      {waylineCards.find((v) => v.id === id)![lang]}
                    </button>
                  ))}
                </div>
              )}
              <LessonActions label={t('learning2.hints')}>
                <button
                  className="button secondary"
                  disabled={busy || hintLevel >= 3}
                  onClick={() => void help()}
                >
                  {t('learning2.hint', { level: Math.min(3, hintLevel + 1) })}
                </button>
                <button className="button tertiary" disabled={busy} onClick={() => void help(true)}>
                  {t('learning2.solution')}
                </button>
              </LessonActions>
              {hintLevel > 0 && (
                <p role="status">
                  {result.hint?.[lang]}
                  {result.direction &&
                    ` ${endpoints(result.direction, size)
                      .map((i) => squareName(i, size).toUpperCase())
                      .join(' → ')}`}
                </p>
              )}
              {revealed.length > 0 && (
                <>
                  <p>{t('learning2.assisted')}</p>
                  <ol>
                    {revealed.map((a, i) => (
                      <li key={i}>
                        {'card' in a ? `${waylineCards.find((v) => v.id === a.card)![lang]}: ` : ''}
                        {'path' in a
                          ? a.path.map((v) => squareName(v, size).toUpperCase()).join(' → ')
                          : endpoints(a, size)
                              .map((v) => squareName(v, size).toUpperCase())
                              .join(' → ')}
                        {'promotion' in a ? ` (${a.promotion})` : ''}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
          {error && <p role="alert">{t(error)}</p>}
          {busy && <p role="status">{t('common.loading')}</p>}
          <LessonActions>
            {result.completed && (
              <Link
                className="button primary"
                to={
                  nextId ? `/learn/${scenario.game}/tactics/${nextId}` : `/learn/${scenario.game}`
                }
              >
                {t(nextId ? 'learning2.next' : 'learning2.back')}
              </Link>
            )}
            <Link className="button secondary" to={`/games/${scenario.game}?mode=bot`}>
              {t('product.practice')}
            </Link>
            <button className="button tertiary" onClick={reset} disabled={busy}>
              {t('learning2.retry')}
            </button>
            <button className="button tertiary" onClick={() => setHelpOpen(true)}>
              {t('learning2.help')}
            </button>
          </LessonActions>
        </section>
      </div>
      {helpOpen && (
        <Modal label={t('learning2.help')} onClose={() => setHelpOpen(false)}>
          <h2>{t('learning2.help')}</h2>
          <p>{courseCopy[lang][scenario.game]}</p>
          <LessonActions>
            <Link className="button secondary" to={`/learn/${scenario.game}/course`}>
              {t('learning2.fundamentals')}
            </Link>
            <button className="button tertiary" onClick={() => setHelpOpen(false)}>
              {t('learning2.close')}
            </button>
          </LessonActions>
        </Modal>
      )}
      {promotion.length > 0 && (
        <Modal label={t('learning2.choosePromotion')} onClose={() => setPromotion([])}>
          <h2>{t('learning2.choosePromotion')}</h2>
          <LessonActions>
            {promotion.map((a, i) => (
              <button key={i} className="button" onClick={() => void send([...answers, a])}>
                {'promotion' in a ? t(`chess.${a.promotion === 'b' ? 'bPiece' : a.promotion}`) : ''}
              </button>
            ))}
          </LessonActions>
        </Modal>
      )}
    </>
  );
}
