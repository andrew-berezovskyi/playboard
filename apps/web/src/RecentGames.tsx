import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from './components';
import { EmptyState } from './ui';
export type RecentMatch = {
  id: string;
  game: string;
  status: 'waiting' | 'active' | 'finished';
  created_at: string;
  updated_at: string;
  time_control: string;
  difficulty: string;
  ranked: boolean;
  bot: boolean;
  your_side: 'w' | 'b';
  opponent: string | null;
  move_count: number;
  result: { winner: 'first' | 'second' | null; reason: string } | null;
};
export function RecentGames({ matches, limit = 6 }: { matches: RecentMatch[]; limit?: number }) {
  const { t, i18n } = useTranslation();
  if (!matches.length)
    return (
      <EmptyState
        icon={<Icon name="history" />}
        title={t('polish.noRecent')}
        action={
          <Link className="button" to="/games">
            {t('product.play')}
          </Link>
        }
      >
        {t('polish.noRecentNote')}
      </EmptyState>
    );
  return (
    <div className="match-list">
      {matches.slice(0, limit).map((m) => {
        const winner = m.result?.winner;
        const status =
          m.status !== 'finished'
            ? m.status
            : !m.result
              ? 'finished'
              : winner === null
                ? 'draw'
                : winner === (m.your_side === 'w' ? 'first' : 'second')
                  ? 'victory'
                  : 'defeat';
        return (
          <article className="match-row" key={m.id}>
            <span className="match-icon">
              <Icon
                name={m.game === 'chess' ? 'chess' : m.game === 'checkers' ? 'games' : 'wayline'}
              />
            </span>
            <div className="match-summary">
              <h3>
                {t(`games.${m.game}`)}{' '}
                <span>· {m.time_control === 'none' ? t('chess.none') : m.time_control}</span>
              </h3>
              <p>
                {m.bot
                  ? `${t('polish.bot')} · ${t(`chess.${m.difficulty}`)}`
                  : m.opponent === 'Guest'
                    ? t('polish.guest')
                    : (m.opponent ?? t('polish.waiting'))}
              </p>
              <div className="match-meta">
                <span className={`match-status status-${status}`}>{t(`polish.${status}`)}</span>
                <span>{t(m.ranked ? 'product.ranked' : 'polish.unrated')}</span>
                <span>{t('polish.moves', { count: m.move_count ?? 0 })}</span>
                <time dateTime={m.updated_at ?? m.created_at}>
                  {new Intl.DateTimeFormat(i18n.language, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(m.updated_at ?? m.created_at))}
                </time>
              </div>
            </div>
            <Link className="button compact" to={`/play/${m.game}/${m.id}`}>
              {t(m.status === 'finished' ? 'polish.view' : 'polish.continue')}
              <Icon name="arrow" />
            </Link>
          </article>
        );
      })}
    </div>
  );
}
