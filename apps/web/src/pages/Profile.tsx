import { Icon } from '../components';
import { EmptyState } from '../ui';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';
import type { Profile as Data } from '../profile-types';
import { useSession } from '../session';
export default function Profile() {
  const { username } = useParams(),
    { user, loading, error: sessionError, refresh } = useSession(),
    { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<Data | null>(null),
    [error, setError] = useState(''),
    [loadingProfile, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ profile: Data | null }>(
      username ? `/platform/profile/${encodeURIComponent(username)}` : '/platform/profile',
    )
      .then((r) => {
        if (active) {
          setProfile(r.profile);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.code : 'UNKNOWN');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [username, user, revision]);
  if (loading || loadingProfile) return <p role="status">{t('common.loading')}</p>;
  if (sessionError)
    return (
      <div className="notice error">
        <p>{t('account.sessionError')}</p>
        <button className="button" onClick={() => void refresh()}>
          {t('common.retry')}
        </button>
      </div>
    );
  if (error)
    return (
      <div className="empty-page">
        <h1>
          {t(
            error === 'PRIVATE_PROFILE'
              ? 'product.privateProfile'
              : error === 'NOT_FOUND'
                ? 'product.notFound'
                : 'polish.error',
          )}
        </h1>
        {!['PRIVATE_PROFILE', 'NOT_FOUND'].includes(error) && (
          <button
            className="button"
            onClick={() => {
              setError('');
              setLoading(true);
              setRevision((r) => r + 1);
            }}
          >
            {t('common.retry')}
          </button>
        )}
      </div>
    );
  if (!profile)
    return (
      <>
        <header className="dashboard-heading">
          <h1>{t('product.guestProfile')}</h1>
          <p>{t('product.guestStorage')}</p>
        </header>
        <div className="guest-profile-actions">
          <Link className="button primary" to="/register">
            {t('auth.register')}
          </Link>
          <Link className="button" to="/login">
            {t('nav.login')}
          </Link>
          <Link className="button secondary" to="/games">
            {t('product.play')}
          </Link>
        </div>
      </>
    );
  return (
    <>
      <section className="profile">
        <span className={`avatar avatar-${profile.avatar}`} aria-hidden="true">
          {profile.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1>{profile.displayName}</h1>
          <p>@{profile.username}</p>
          {profile.bio && <p>{profile.bio}</p>}
          <small>
            {t('product.joined')} ·{' '}
            {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
              new Date(profile.createdAt),
            )}
          </small>
        </div>
        {!username && (
          <Link className="button secondary" to="/settings">
            <Icon name="settings" />
            {t('product.settings')}
          </Link>
        )}
      </section>
      <div className="stat-grid">
        {(['games', 'wins', 'draws', 'losses'] as const).map((key) => (
          <div className="stat-item" key={key}>
            <Icon
              name={
                key === 'games'
                  ? 'games'
                  : key === 'wins'
                    ? 'trophy'
                    : key === 'draws'
                      ? 'draw'
                      : 'loss'
              }
            />
            <strong>{profile.stats[key]}</strong>
            <span>{t(`product.${key === 'games' ? 'gamesPlayed' : key}`)}</span>
          </div>
        ))}
      </div>
      <section className="dashboard-section settings-card">
        <div className="section-heading">
          <h2>
            {t('product.level')} {profile.level}
          </h2>
          <span>{profile.xp} XP</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label={t('product.level')}
          aria-valuenow={profile.xp}
          aria-valuemin={100 * (profile.level - 1) ** 2}
          aria-valuemax={100 * profile.level ** 2}
        >
          <span
            style={{
              width: `${Math.min(100, ((profile.xp - 100 * (profile.level - 1) ** 2) / (100 * (profile.level ** 2 - (profile.level - 1) ** 2))) * 100)}%`,
            }}
          />
        </div>
        <p>
          {t('product.league')}: {t(`product.${profile.league}`)} · {profile.seasonPoints}
        </p>
        <p>
          <Icon name="flame" /> {t('product.streak')}: {profile.streak} · {t('product.bestStreak')}:{' '}
          {profile.bestStreak}
        </p>
      </section>
      <section className="dashboard-section">
        <h2>
          <Icon name="rating" /> {t('product.ratings')}
        </h2>
        <p className="rating-explanation">{t('polish.ratingHelp')}</p>
        <div className="simple-list">
          {profile.ratings.length ? (
            profile.ratings.map((r) => (
              <div key={r.pool} className="simple-row">
                <span>
                  {t(`games.${r.pool.split(':')[0]}`)}
                  {r.pool.includes(':') ? ` · ${t(`product.${r.pool.split(':')[1]}`)}` : ''}
                </span>
                <strong>{Math.round(r.rating)}</strong>
                <span>
                  {r.games < 10 ? t('product.provisional') : ''} · ±{Math.round(r.deviation)} ·{' '}
                  {r.games} {t('product.ratedGames')}
                </span>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<Icon name="rating" />}
              title={t('product.unrated')}
              action={
                !username && (
                  <Link className="button secondary" to="/games">
                    {t('product.play')}
                  </Link>
                )
              }
            />
          )}
        </div>
      </section>
      <section className="dashboard-section">
        <h2>
          <Icon name="award" /> {t('product.achievements')}
        </h2>
        <div className="simple-list">
          {profile.achievements.map((a) => (
            <div className="simple-row" key={a.code}>
              <Icon name="award" />
              {t(`product.${a.code}`)}
            </div>
          ))}
          {!profile.achievements.length && (
            <EmptyState icon={<Icon name="award" />} title={t('polish.achievementsEmpty')} />
          )}
        </div>
      </section>
      <section className="dashboard-section">
        <h2>{t('product.history')}</h2>
        <div className="continue-list">
          {profile.history.map((m) => {
            const content = (
              <>
                <span>
                  {t(`games.${m.game}`)} ·{' '}
                  {t(
                    m.score === 1
                      ? 'product.wins'
                      : m.score === 0
                        ? 'product.losses'
                        : 'product.draws',
                  )}
                </span>
                <span>
                  {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short' }).format(
                    new Date(m.created_at),
                  )}
                </span>
              </>
            );
            return username && username !== user?.username ? (
              <div className="history-summary" key={m.match_id}>
                {content}
              </div>
            ) : (
              <Link key={m.match_id} to={`/play/${m.game}/${m.match_id}`}>
                {content}
              </Link>
            );
          })}
        </div>
        {!profile.history.length && (
          <EmptyState icon={<Icon name="history" />} title={t('product.noGames')} />
        )}
      </section>
      <section className="dashboard-section">
        <h2>{t('product.tutorials')}</h2>
        <p>
          {profile.lessons.length} {t('product.completed')}
        </p>
        <Link className="text-link" to="/learn">
          {t('product.learn')} →
        </Link>
      </section>
      <section className="dashboard-section">
        <h2>{t('product.activity')}</h2>
        <div className="activity-grid">
          {Array.from({ length: 90 }, (_, i) =>
            new Date(Date.parse(`${profile.today}T00:00:00Z`) - (89 - i) * 86400000)
              .toISOString()
              .slice(0, 10),
          ).map((day) => (
            <span
              title={day}
              key={day}
              className={`activity-day ${profile.activity.includes(day) ? 'active' : ''}`}
            />
          ))}
          {!profile.activity.length && <p>{t('product.noActivity')}</p>}
        </div>
      </section>
      <section className="dashboard-section">
        <h2>
          {t('product.friends')} · {profile.friendCount}
        </h2>
        {!username && (
          <Link className="text-link" to="/friends">
            {t('product.friends')} →
          </Link>
        )}
      </section>
      {profile.ratingHistory.length > 0 && (
        <section className="dashboard-section">
          <h2>{t('product.ratings')}</h2>
          <div className="simple-list">
            {profile.ratingHistory.map((r) => (
              <div className="simple-row" key={r.match_id}>
                <span>{t(`games.${r.pool.split(':')[0]}`)}</span>
                <span>
                  {Math.round(r.before_rating)} → {Math.round(r.after_rating)}
                </span>
                <time dateTime={r.created_at}>
                  {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short' }).format(
                    new Date(r.created_at),
                  )}
                </time>
              </div>
            ))}
          </div>
        </section>
      )}
      {user && !username && (
        <section className="dashboard-section settings-card">
          <h2>{t('account.emailStatus')}</h2>
          <p>
            {user.email} · {t(user.emailVerified ? 'account.verified' : 'account.unverified')}
          </p>
          {!user.emailVerified && (
            <button
              className="button"
              onClick={() => {
                void api('/auth/resend-verification', {}).catch(() => setError('UNKNOWN'));
              }}
            >
              {t('auth.resend')}
            </button>
          )}
        </section>
      )}
    </>
  );
}
