import { LessonActions } from '../ProductUI';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { courseCopy, courseLessons } from '../../../../packages/shared/src/courses';
import type { Lesson } from '../../../../packages/shared/src/lessons';
import { api, ensurePlayer } from '../api';
import Learning from './Learning';
import { NotFound } from './Games';
import { Modal } from '../ui';
export default function Course() {
  const { gameId } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Lesson['answer'][]>([]);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState(0);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    if (gameId !== 'chess' && gameId !== 'checkers' && gameId !== 'wayline') return;
    let active = true;
    void api<{ lessons: { id: string; completed: boolean }[] }>('/learn')
      .then((result) => {
        if (!active) return;
        const steps = courseLessons(gameId);
        let count = 0;
        while (
          count < steps.length &&
          result.lessons.some((l) => l.id === steps[count].id && l.completed)
        )
          count++;
        setAnswers(steps.slice(0, count).map((l) => l.answer));
        setStep(count);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [gameId]);
  if (gameId !== 'chess' && gameId !== 'checkers' && gameId !== 'wayline') return <NotFound />;
  const steps = courseLessons(gameId),
    copy = courseCopy[i18n.language === 'uk' ? 'uk' : 'en'];
  async function practice() {
    setBusy(true);
    setError(false);
    try {
      await ensurePlayer();
      const result = await api<{ match: { id: string } }>(
        gameId === 'chess' ? '/chess/matches' : '/board/matches',
        {
          ...(gameId === 'chess' ? {} : { game: gameId }),
          mode: 'bot',
          timeControl: 'none',
          side: 'w',
          difficulty: 'beginner',
        },
      );
      navigate(`/play/${gameId}/${result.match.id}?training=1`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="dashboard-heading course-heading">
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
        <p aria-live="polite">
          {copy.step} {Math.min(step + 1, steps.length)} / {steps.length}
        </p>
        <progress aria-label={copy.title} value={answers.length} max={steps.length} />
      </header>
      {step < steps.length ? (
        <Learning
          key={`${steps[step].id}-${attempt}`}
          lessonOverride={steps[step].id}
          courseActions={answers}
          onSolved={(action) => setAnswers([...answers, action])}
        />
      ) : (
        <h2>{copy.finish}</h2>
      )}
      <LessonActions>
        {step < steps.length && answers.length > step && (
          <button className="button primary" onClick={() => setStep(step + 1)}>
            {copy.next}
          </button>
        )}
        {answers.length > step && (
          <button
            className="button tertiary"
            onClick={() => {
              setAnswers(answers.slice(0, step));
              setAttempt(attempt + 1);
            }}
          >
            {t('learning2.retry')}
          </button>
        )}
        {step === steps.length && (
          <button
            className="button tertiary"
            onClick={() => {
              setAnswers([]);
              setStep(0);
              setAttempt(attempt + 1);
            }}
          >
            {t('learning2.retry')}
          </button>
        )}
        <button className="button secondary" disabled={busy} onClick={() => void practice()}>
          {copy.practice}
        </button>
        <button className="button tertiary" onClick={() => setHelpOpen(true)}>
          {copy.help}
        </button>
      </LessonActions>
      {helpOpen && (
        <Modal label={copy.help} onClose={() => setHelpOpen(false)}>
          <h2>{copy.help}</h2>
          <p>{copy[gameId]}</p>
          <LessonActions>
            <Link className="button secondary" to={`/learn/${gameId}`}>
              {t('learning2.back')}
            </Link>
            <button className="button tertiary" onClick={() => setHelpOpen(false)}>
              {t('learning2.close')}
            </button>
          </LessonActions>
        </Modal>
      )}
      {error && <p role="alert">{copy.error}</p>}
    </>
  );
}
