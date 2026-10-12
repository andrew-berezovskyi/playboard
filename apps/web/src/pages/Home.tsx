import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components';
import { Choice, EmptyState } from '../ui';
import { RecentGames, type RecentMatch } from '../RecentGames';
import { api, ensurePlayer } from '../api';
import { useSession } from '../session';
import type { Profile } from '../profile-types';
type LessonListing = {
  id: string;
  game: string;
  title: { uk: string; en: string };
  completed: boolean;
};
type Invite = {
  id: string;
  kind: string;
  username: string;
  read: boolean;
  payload: { game?: string; invite?: string };
};
export default function Home() {
  const { t, i18n } = useTranslation(),
    { user, loading } = useSession(),
    navigate = useNavigate();
  const [recent, setRecent] = useState<RecentMatch[]>([]),
    [profile, setProfile] = useState<Profile | null>(null),
    [daily, setDaily] = useState(''),
    [lessons, setLessons] = useState<LessonListing[]>([]),
    [invites, setInvites] = useState<Invite[]>([]),
    [error, setError] = useState(false),
    [fetching, setFetching] = useState(true),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [game, setGame] = useState(() => {
      try {
        const stored = localStorage.getItem('playboard-quick-game');
        return stored && ['chess', 'checkers', 'wayline'].includes(stored) ? stored : 'chess';
      } catch {
        return 'chess';
      }
    }),
    [mode, setMode] = useState('bot');
  useEffect(() => {
    if (loading) return;
    let active = true;
    async function load() {
      setFetching(true);
      const results = await Promise.allSettled([
        ensurePlayer().then(() => api<{ matches: RecentMatch[] }>('/platform/recent')),
        api<{ lesson: string }>('/daily'),
        api<{ lessons: LessonListing[] }>('/learn'),
        user ? api<{ profile: Profile }>('/platform/profile') : Promise.resolve({ profile: null }),
        user
          ? api<{ notifications: Invite[] }>('/platform/notifications')
          : Promise.resolve({ notifications: [] }),
      ]);
      if (!active) return;
      const [r, d, l, p, n] = results;
      if (r.status === 'fulfilled') setRecent(r.value.matches);
      if (d.status === 'fulfilled') setDaily(d.value.lesson);
      if (l.status === 'fulfilled') setLessons(l.value.lessons);
      if (p.status === 'fulfilled') setProfile(p.value.profile);
      if (n.status === 'fulfilled')
        setInvites(n.value.notifications.filter((x) => !x.read && x.kind === 'game_invite'));
      setError(results.some((x) => x.status === 'rejected'));
      setFetching(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [user, loading, revision]);
  const lang = i18n.language === 'uk' ? 'uk' : 'en',
    challenge = lessons.find((l) => l.id === daily),
    next = lessons.find((l) => !l.completed);
  async function start() {
    try {
      localStorage.setItem('playboard-quick-game', game);
    } catch {
      /* optional preference */
    }
    if (mode !== 'bot') {
      navigate(`/games/${game}?mode=${mode}`);
      return;
    }
    setBusy(true);
    try {
      await ensurePlayer();
      const result = await api<{ match: { id: string } }>(
        game === 'chess' ? '/chess/matches' : '/board/matches',
        {
          ...(game === 'chess' ? {} : { game }),
          mode: 'bot',
          side: 'w',
          difficulty: 'intermediate',
          timeControl: 'none',
        },
      );
      navigate(`/play/${game}/${result.match.id}`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overview">
      <header className="overview-heading">
        <div>
          <h1>{user ? t('polish.welcome', { name: user.username }) : t('polish.guestWelcome')}</h1>
          <p>{t('polish.quickIntro')}</p>
        </div>
        <Link className="button compact" to="/games">
          <Icon name="games" />
          {t('polish.catalog')}
        </Link>
      </header>
      {error && (
        <div className="notice error" role="alert">
          {t('polish.error')}{' '}
          <button
            className="button compact"
            onClick={() => {
              setError(false);
              setRevision((r) => r + 1);
            }}
          >
            {t('polish.retry')}
          </button>
        </div>
      )}
      <div className="overview-grid">
        <section className="quick-play panel">
          <h2>
            <Icon name="play" />
            {t('polish.quickPlay')}
          </h2>
          <div className="quick-form">
            <label>
              {t('polish.game')}
              <Choice value={game} onChange={(e) => setGame(e.target.value)}>
                {['chess', 'checkers', 'wayline'].map((g) => (
                  <option value={g} key={g}>
                    {t(`games.${g}`)}
                  </option>
                ))}
              </Choice>
            </label>
            <label>
              {t('polish.opponent')}
              <Choice value={mode} onChange={(e) => setMode(e.target.value)}>
                {['bot', 'private', 'online'].map((m) => (
                  <option value={m} key={m}>
                    {t(`chess.${m}`)}
                  </option>
                ))}
              </Choice>
            </label>
            <button className="button primary" disabled={busy} onClick={() => void start()}>
              <Icon name="play" />
              {t(busy ? 'auth.working' : mode === 'bot' ? 'product.play' : 'polish.start')}
            </button>
          </div>
        </section>
        <section className="daily-panel panel">
          <h2>
            <Icon name="hint" />
            {t('polish.daily')}
          </h2>
          {challenge ? (
            <>
              <span className="quiet-label">{t(`games.${challenge.game}`)}</span>
              <h3>{challenge.title[lang]}</h3>
              <Link
                className="button secondary"
                to={`/learn/${challenge.game}/${challenge.id}?daily=1`}
              >
                {t('polish.startChallenge')}
                <Icon name="arrow" />
              </Link>
            </>
          ) : (
            <p role="status">{t(fetching ? 'common.loading' : 'polish.error')}</p>
          )}
        </section>
        <section className="recent-panel panel">
          <div className="section-heading">
            <h2>
              <Icon name="history" />
              {t('polish.recent')}
            </h2>
          </div>
          {fetching ? <p role="status">{t('polish.loading')}</p> : <RecentGames matches={recent} />}
        </section>
        <aside className="overview-aside">
          {user ? (
            profile ? (
              <section className="progress-panel panel">
                <h2>
                  <Icon name="rating" />
                  {t('polish.progress')}
                </h2>
                <div className="progress-head">
                  <strong>
                    {t('product.level')} {profile.level}
                  </strong>
                  <span>{profile.xp} XP</span>
                </div>
                <progress
                  aria-label={t('product.level')}
                  value={profile.xp - 100 * (profile.level - 1) ** 2}
                  max={100 * (2 * profile.level - 1)}
                />
                <div className="progress-metrics">
                  <span>
                    <Icon name="flame" />
                    {profile.streak} · {t('product.streak')}
                  </span>
                  <span>
                    <Icon name="trophy" />
                    {profile.stats.wins} · {t('product.wins')}
                  </span>
                </div>
                <div className="rating-mini">
                  {profile.ratings.map((r) => (
                    <span key={r.pool}>
                      {t(`games.${r.pool.split(':')[0]}`)}{' '}
                      {r.pool.includes(':') && `· ${t(`product.${r.pool.split(':')[1]}`)}`}
                      <strong>{Math.round(r.rating)}</strong>
                    </span>
                  ))}
                </div>
                <Link className="text-link" to="/account">
                  {t('polish.profile')}
                  <Icon name="arrow" />
                </Link>
              </section>
            ) : (
              <section className="panel">
                <p role="status">{t(fetching ? 'common.loading' : 'polish.error')}</p>
              </section>
            )
          ) : (
            <section className="guest-panel panel">
              <Icon name="user" />
              <h2>{t('polish.guestProgress')}</h2>
              <p>{t('polish.guestProgressNote')}</p>
              <Link className="button secondary" to="/register">
                {t('auth.register')}
              </Link>
            </section>
          )}
          <section className="learning-panel panel">
            <h2>
              <Icon name="learn" />
              {t('polish.nextLesson')}
            </h2>
            {next && (
              <p>
                {t(`games.${next.game}`)} · {next.title[lang]}
              </p>
            )}
            <Link className="button secondary" to={next ? `/learn/${next.game}/course` : '/learn'}>
              {t('polish.learn')}
              <Icon name="arrow" />
            </Link>
          </section>
          {user && (
            <section className="invites-panel panel">
              <h2>
                <Icon name="invite" />
                {t('polish.invites')}
              </h2>
              {invites.length ? (
                invites.slice(0, 3).map((n) => (
                  <div className="invite-item" key={n.id}>
                    <p>
                      {t('polish.notificationInvite', {
                        name: n.username ?? t('polish.guest'),
                        game: t(`games.${n.payload.game}`),
                      })}
                    </p>
                    <Link
                      className="button compact"
                      to={`/join/${n.payload.game}#${n.payload.invite}`}
                    >
                      {t('product.open')}
                    </Link>
                  </div>
                ))
              ) : (
                <EmptyState title={t('polish.noInvites')} />
              )}
              <Link className="text-link" to="/notifications">
                {t('polish.readAll')}
              </Link>
            </section>
          )}
        </aside>
      </div>
      <Link className="discover-strip" to="/games">
        <Icon name="games" />
        <span>
          <strong>{t('polish.discover')}</strong>
          <small>{t('polish.discoverNote')}</small>
        </span>
        <Icon name="arrow" />
      </Link>
    </div>
  );
}
