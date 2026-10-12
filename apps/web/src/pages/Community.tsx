import { PageHeading } from '../ProductUI';
import { Icon } from '../components';
import { Choice, EmptyState } from '../ui';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useSession } from '../session';
type Friend = {
  username: string;
  name: string;
  status: string;
  outgoing: boolean;
  online?: boolean;
};
export function Friends() {
  const { t } = useTranslation(),
    { user } = useSession(),
    navigate = useNavigate();
  const [friends, setFriends] = useState<Friend[]>([]),
    [blocks, setBlocks] = useState<{ username: string }[]>([]),
    [results, setResults] = useState<{ username: string }[]>([]),
    [searched, setSearched] = useState(false),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [game, setGame] = useState('chess');
  const [history, setHistory] = useState<{
    name: string;
    matches: { match_id: string; game: string; score: number }[];
  } | null>(null);
  async function load() {
    const r = await api<{ friends: Friend[]; blocks: { username: string }[] }>('/platform/friends');
    setFriends(r.friends);
    setBlocks(r.blocks);
  }
  useEffect(() => {
    if (user)
      void api<{ friends: Friend[]; blocks: { username: string }[] }>('/platform/friends')
        .then((r) => {
          setFriends(r.friends);
          setBlocks(r.blocks);
        })
        .catch(() => setError(true));
  }, [user]);
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError(false);
    try {
      await api(`/platform/${path}`, body);
      await load();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get('q'));
    setBusy(true);
    setError(false);
    try {
      const r = await api<{ players: { username: string }[] }>(
        `/platform/search?q=${encodeURIComponent(q)}`,
      );
      setResults(r.players);
      setSearched(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function invite(username: string) {
    setBusy(true);
    try {
      const r = await api<{ match: { id: string }; invite: string }>(
        game === 'chess' ? '/chess/matches' : '/board/matches',
        {
          ...(game === 'chess' ? {} : { game }),
          mode: 'private',
          side: 'random',
          timeControl: '10+0',
          difficulty: 'intermediate',
        },
      );
      await api('/platform/invite', { username, game, invite: r.invite });
      sessionStorage.setItem(`invite:${r.match.id}`, r.invite);
      navigate(`/play/${game}/${r.match.id}`, { state: { invite: r.invite } });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (!user)
    return (
      <div className="empty-page">
        <PageHeading title={t('product.friends')} icon="friends" />
        <Link className="button" to="/login">
          {t('nav.login')}
        </Link>
      </div>
    );
  return (
    <>
      <PageHeading title={t('product.friends')} icon="friends" />
      {error && (
        <p className="notice error" role="alert">
          {t('product.error')}
        </p>
      )}
      <form className="search-form" onSubmit={(e) => void search(e)}>
        <label>
          {t('product.searchPlayers')}
          <input name="q" type="search" minLength={2} maxLength={24} required />
        </label>
        <button className="button" disabled={busy}>
          <Icon name="search" />
          {t(busy ? 'auth.working' : 'product.search')}
        </button>
      </form>
      <div className="simple-list">
        {results.map((r) => (
          <div className="simple-row" key={r.username}>
            <Link to={`/profile/${r.username}`}>{r.username}</Link>
            <button
              className="button"
              disabled={busy}
              onClick={() => void action('friends/request', { username: r.username })}
            >
              {t('product.addFriend')}
            </button>
          </div>
        ))}
      </div>
      {searched && !results.length && (
        <EmptyState icon={<Icon name="search" />} title={t('polish.searchEmpty')} />
      )}
      <section className="dashboard-section">
        <h2>
          <Icon name="invite" /> {t('product.requests')}
        </h2>
        {!friends.some((f) => f.status === 'pending') && (
          <EmptyState title={t('polish.noRequests')} />
        )}
        <div className="simple-list">
          {friends
            .filter((f) => f.status === 'pending')
            .map((f) => (
              <div className="simple-row" key={f.username}>
                <Link to={`/profile/${f.username}`}>{f.name}</Link>
                {f.outgoing ? (
                  <span>{t('product.sent')}</span>
                ) : (
                  <div className="actions">
                    <button
                      disabled={busy}
                      className="button"
                      onClick={() =>
                        void action('friends/respond', { username: f.username, accept: true })
                      }
                    >
                      {t('product.accept')}
                    </button>
                    <button
                      disabled={busy}
                      className="button"
                      onClick={() =>
                        void action('friends/respond', { username: f.username, accept: false })
                      }
                    >
                      {t('product.decline')}
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      </section>
      <section className="dashboard-section">
        <h2>{t('product.friends')}</h2>
        <Choice aria-label={t('nav.games')} value={game} onChange={(e) => setGame(e.target.value)}>
          {['chess', 'checkers', 'wayline'].map((g) => (
            <option key={g} value={g}>
              {t(`games.${g}`)}
            </option>
          ))}
        </Choice>
        <div className="simple-list">
          {friends
            .filter((f) => f.status === 'accepted')
            .map((f) => (
              <div className="simple-row" key={f.username}>
                <Link to={`/profile/${f.username}`}>{f.name}</Link>
                {f.online !== undefined && (
                  <span>{t(f.online ? 'product.online' : 'product.offline')}</span>
                )}
                <div className="actions">
                  <button
                    className="text-link"
                    onClick={() => {
                      void api<{ matches: { match_id: string; game: string; score: number }[] }>(
                        `/platform/friends/${f.username}/history`,
                      )
                        .then((r) => setHistory({ name: f.name, matches: r.matches }))
                        .catch(() => setError(true));
                    }}
                  >
                    {t('product.history')}
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void invite(f.username)}
                  >
                    {t('product.invite')}
                  </button>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => void action('friends/remove', { username: f.username })}
                  >
                    {t('product.remove')}
                  </button>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => void action('block', { username: f.username, block: true })}
                  >
                    {t('product.block')}
                  </button>
                </div>
              </div>
            ))}
        </div>
        {!friends.some((f) => f.status === 'accepted') && (
          <EmptyState icon={<Icon name="friends" />} title={t('polish.noFriends')}>
            {t('polish.noFriendsNote')}
          </EmptyState>
        )}
      </section>
      {history && (
        <section className="dashboard-section settings-card">
          <h2>
            {t('product.history')} · {history.name}
          </h2>
          <div className="simple-list">
            {history.matches.map((m) => (
              <Link className="text-link" key={m.match_id} to={`/play/${m.game}/${m.match_id}`}>
                {t(`games.${m.game}`)} ·{' '}
                {t(
                  m.score === 1
                    ? 'product.wins'
                    : m.score === 0
                      ? 'product.losses'
                      : 'product.draws',
                )}
              </Link>
            ))}
          </div>
          {!history.matches.length && <p>{t('product.noGames')}</p>}
        </section>
      )}
      {blocks.length > 0 && (
        <section className="dashboard-section">
          <h2>{t('product.block')}</h2>
          {blocks.map((b) => (
            <div className="simple-row" key={b.username}>
              <span>{b.username}</span>
              <button
                className="button"
                disabled={busy}
                onClick={() => void action('block', { username: b.username, block: false })}
              >
                {t('product.unblock')}
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
export function Leaderboards() {
  const { t } = useTranslation();
  const { user } = useSession();
  const [pool, setPool] = useState('chess:rapid'),
    [players, setPlayers] = useState<
      { username: string; name: string; rating: number; deviation: number; games: number }[]
    >([]),
    [season, setSeason] = useState<{ username: string; points: number }[]>([]),
    [error, setError] = useState(false),
    [pending, setPending] = useState(true);
  useEffect(() => {
    let active = true;
    api<{ players: typeof players; season: typeof season }>(`/platform/leaderboards?pool=${pool}`)
      .then((r) => {
        if (active) {
          setError(false);
          setPlayers(r.players);
          setSeason(r.season);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [pool]);
  return (
    <>
      <PageHeading title={t('product.leaderboards')} icon="trophy" />
      <label>
        {t('product.pool')}
        <Choice
          value={pool}
          onChange={(e) => {
            setPending(true);
            setError(false);
            setPool(e.target.value);
          }}
        >
          {['chess:bullet', 'chess:blitz', 'chess:rapid', 'checkers', 'wayline'].map((p) => (
            <option key={p} value={p}>
              {t(`games.${p.split(':')[0]}`)}
              {p.includes(':') ? ` · ${t(`product.${p.split(':')[1]}`)}` : ''}
            </option>
          ))}
        </Choice>
      </label>
      {error && <p role="alert">{t('product.error')}</p>}
      {pending && <p role="status">{t('common.loading')}</p>}
      <div className="leaderboard-panel" aria-busy={pending}>
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th scope="col">{t('learning2.rank')}</th>
              <th scope="col">{t('learning2.player')}</th>
              <th scope="col">{t('learning2.rating')}</th>
              <th scope="col">{t('learning2.games')}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr
                key={p.username}
                className={p.username === user?.username ? 'current-player' : ''}
              >
                <td>#{i + 1}</td>
                <th scope="row">
                  <Link to={`/profile/${p.username}`}>{p.name}</Link>
                </th>
                <td title={t('polish.ratingHelp')}>
                  <strong>{Math.round(p.rating)}</strong>
                  <small> ±{Math.round(p.deviation)}</small>
                  {p.games < 10 && (
                    <small className="provisional">{t('product.provisional')}</small>
                  )}
                </td>
                <td>{p.games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!players.length && !error && !pending && (
        <EmptyState headingLevel={2} icon={<Icon name="trophy" />} title={t('product.noRatings')} />
      )}
      <p className="rating-explanation">{t('polish.ratingHelp')}</p>
      <section className="dashboard-section">
        <h2>
          <Icon name="award" /> {t('product.season')} · XP
        </h2>
        {!season.length && !error && !pending && <EmptyState title={t('polish.noSeason')} />}
        {!!season.length && (
          <div className="leaderboard-panel">
            <table className="leaderboard-table season-table">
              <thead>
                <tr>
                  <th scope="col">{t('learning2.rank')}</th>
                  <th scope="col">{t('learning2.player')}</th>
                  <th scope="col">{t('learning2.xp')}</th>
                </tr>
              </thead>
              <tbody>
                {season.map((p, i) => (
                  <tr
                    key={p.username}
                    className={p.username === user?.username ? 'current-player' : ''}
                  >
                    <td>#{i + 1}</td>
                    <th scope="row">
                      <Link to={`/profile/${p.username}`}>{p.username}</Link>
                    </th>
                    <td>
                      <strong>{p.points} XP</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
export function Notifications() {
  const { t } = useTranslation(),
    { user } = useSession();
  const [items, setItems] = useState<
      {
        id: string;
        kind: string;
        username: string;
        read: boolean;
        payload: { game?: string; invite?: string };
      }[]
    >([]),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () =>
      api<{ notifications: typeof items }>('/platform/notifications')
        .then((r) => {
          if (active) setItems(r.notifications);
        })
        .catch(() => {
          if (active) setError(true);
        });
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user]);
  return (
    <>
      <PageHeading title={t('product.notifications')} icon="bell" />
      {!user && (
        <Link className="button" to="/login">
          {t('nav.login')}
        </Link>
      )}
      {error && <p role="alert">{t('product.error')}</p>}
      <div className="simple-list">
        {items.map((n) => (
          <div className="simple-row" key={n.id}>
            <span>
              <Icon name={n.kind === 'game_invite' ? 'invite' : 'friends'} />{' '}
              {t(
                n.kind === 'game_invite'
                  ? 'polish.notificationInvite'
                  : n.kind === 'friend_request'
                    ? 'polish.notificationFriend'
                    : 'polish.notificationAccepted',
                { name: n.username ?? t('polish.guest'), game: t(`games.${n.payload.game}`) },
              )}
            </span>
            {n.kind === 'game_invite' && n.payload.game && n.payload.invite ? (
              <Link className="button" to={`/join/${n.payload.game}#${n.payload.invite}`}>
                {t('product.open')}
              </Link>
            ) : (
              <Link className="text-link" to="/friends">
                {t('product.open')}
              </Link>
            )}
            {!n.read && (
              <button
                className="text-link"
                onClick={() => {
                  void api('/platform/notifications/read', { id: n.id })
                    .then(() =>
                      setItems(items.map((x) => (x.id === n.id ? { ...x, read: true } : x))),
                    )
                    .catch(() => setError(true));
                }}
              >
                {t('product.markRead')}
              </button>
            )}
          </div>
        ))}
      </div>
      {user && !items.length && !error && (
        <div className="notifications-empty">
          <EmptyState
            headingLevel={2}
            icon={<Icon name="bell" />}
            title={t('polish.notificationsEmpty')}
          >
            {t('learning2.notificationsHelp')}
          </EmptyState>
        </div>
      )}
    </>
  );
}
