import { Icon } from './components';
import { Guide } from './Guide';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { courseCopy, type CourseGame } from '../../../packages/shared/src/courses';
export function GameHelp({
  game,
  training = false,
  hint,
}: {
  game: CourseGame;
  training?: boolean;
  hint?: string;
}) {
  const { i18n } = useTranslation();
  const copy = courseCopy[i18n.language === 'uk' ? 'uk' : 'en'];
  const [show, setShow] = useState(false);
  return (
    <details className="game-help">
      <summary>
        <Icon name="learn" /> {copy.help}
      </summary>
      <p>{copy[game]}</p>
      <Link className="text-link" to={`/learn/${game}/course`}>
        {copy.title}
      </Link>
      {training && (
        <>
          <div className="training-coach">
            <Guide happy={show} />
            <p>{copy.training}</p>
          </div>
          <button
            className="button secondary"
            aria-pressed={show}
            disabled={!hint}
            onClick={() => setShow(!show)}
          >
            <Icon name="hint" />
            {copy.hint}
          </button>
          {show && hint && <p role="status">{hint}</p>}
        </>
      )}
    </details>
  );
}
