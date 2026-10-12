import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { courseCopy, courseLessons } from '../../../../packages/shared/src/courses';
import type { Lesson } from '../../../../packages/shared/src/lessons';
import { api, ensurePlayer } from '../api';
import Learning from './Learning';
import { NotFound } from './Games';
export default function Course() {
  const { gameId } = useParams();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Lesson['answer'][]>([]);
  const [step, setStep] = useState(0);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
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
          key={steps[step].id}
          lessonOverride={steps[step].id}
          courseActions={answers}
          onSolved={(action) => setAnswers([...answers, action])}
        />
      ) : (
        <h2>{copy.finish}</h2>
      )}
      <div className="actions">
        {step < steps.length && answers.length > step && (
          <button className="button primary" onClick={() => setStep(step + 1)}>
            {copy.next}
          </button>
        )}
        <button className="button" disabled={busy} onClick={() => void practice()}>
          {step >= steps.length ? copy.practice : copy.skip}
        </button>
        <Link className="text-link" to={`/learn/${gameId}`}>
          {copy.help}
        </Link>
      </div>
      {error && <p role="alert">{copy.error}</p>}
    </>
  );
}
