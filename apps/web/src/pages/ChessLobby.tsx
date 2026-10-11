import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';
import { BoardArt } from '../components';
import {
  timeControls,
  type CreateChess,
  type MatchView,
} from '../../../../packages/shared/src/chess-contracts';
export default function ChessLobby() {
  const { t } = useTranslation(),
    navigate = useNavigate();
  const [mode, setMode] = useState<'bot' | 'private' | 'online'>('bot'),
    [side, setSide] = useState<CreateChess['side']>('w'),
    [difficulty, setDifficulty] = useState<CreateChess['difficulty']>('intermediate'),
    [time, setTime] = useState<CreateChess['timeControl']>('none'),
    [ranked, setRanked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [searching, setSearching] = useState(false),
    [recent, setRecent] = useState<{ id: string; status: string; created_at: string }[]>([]);
  const searchGeneration = useRef(0);
  useEffect(() => {
    api<{ matches: typeof recent }>('/chess/matches')
      .then((r) => setRecent(r.matches))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!searching) return;
    let active = true;
    const generation = ++searchGeneration.current;
    async function poll() {
      try {
        const result = await api<{ match?: MatchView }>('/chess/queue', {
          timeControl: time,
          ranked,
        });
        if (!active || generation !== searchGeneration.current) return;
        if (result.match) {
          await api('/chess/queue/cancel', {});
          navigate(`/play/chess/${result.match.id}`);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof ApiError ? e.code : 'UNKNOWN');
          setSearching(false);
        }
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [searching, time, ranked, navigate]);
  async function start() {
    setBusy(true);
    setError('');
    try {
      await api('/chess/player', {});
      if (mode === 'online') {
        setSearching(true);
        return;
      }
      const result = await api<{ match: MatchView; invite: string | null }>('/chess/matches', {
        mode,
        timeControl: time,
        side,
        difficulty,
      });
      if (result.invite) {
        try {
          sessionStorage.setItem(`invite:${result.match.id}`, result.invite);
        } catch {
          /* room link also passed in navigation state */
        }
      }
      navigate(`/play/chess/${result.match.id}`, { state: { invite: result.invite } });
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'UNKNOWN');
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    searchGeneration.current++;
    setSearching(false);
    try {
      await api('/chess/queue/cancel', {});
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'UNKNOWN');
    }
  }
  return (
    <>
      <Link className="text-link" to="/games">
        ← {t('common.back')}
      </Link>
      <header className="chess-lobby-heading">
        <div>
          <h1>{t('chess.title')}</h1>
          <p className="lead">{t('chess.intro')}</p>
        </div>
        <BoardArt game="chess" large />
      </header>
      <section className="lobby-panel">
        <div className="lobby-options">
          <h2>{t('chess.mode')}</h2>
          <div className="mode-picker">
            {(['bot', 'private', 'online'] as const).map((value) => (
              <button
                key={value}
                disabled={searching}
                className={mode === value ? 'selected' : ''}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {t(`chess.${value}`)}
              </button>
            ))}
          </div>
          <div className="option-grid">
            <label>
              {t('chess.time')}
              <select
                value={time}
                disabled={searching}
                onChange={(e) => setTime(e.target.value as CreateChess['timeControl'])}
              >
                {Object.keys(timeControls).map((key) => (
                  <option key={key} value={key}>
                    {key === 'none' ? t('chess.none') : key}
                  </option>
                ))}
              </select>
            </label>
            {mode !== 'online' && (
              <label>
                {t('chess.side')}
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value as CreateChess['side'])}
                >
                  {['w', 'b', 'random'].map((key) => (
                    <option key={key} value={key}>
                      {t(`chess.${key}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {mode === 'bot' && (
              <label>
                {t('chess.difficulty')}
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as CreateChess['difficulty'])}
                >
                  {['beginner', 'intermediate', 'advanced'].map((key) => (
                    <option key={key} value={key}>
                      {t(`chess.${key}`)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {mode === 'online' && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={ranked}
                onChange={(e) => setRanked(e.target.checked)}
                disabled={searching}
              />
              {t('product.ranked')}
            </label>
          )}
          {mode !== 'bot' && (
            <p className="local-mail">
              {t(mode === 'online' && ranked ? 'product.ranked' : 'chess.casual')}
            </p>
          )}
          {error && (
            <p role="alert" className="notice error">
              {t(`errors.${error}`, { defaultValue: t('errors.UNKNOWN') })}
            </p>
          )}
          {searching ? (
            <div className="notice" role="status">
              <p>{t('chess.searching')}</p>
              <p>{t('chess.queueNote')}</p>
              <button className="button" onClick={() => void cancel()}>
                {t('chess.cancel')}
              </button>
            </div>
          ) : (
            <button className="button primary" disabled={busy} onClick={() => void start()}>
              {t(
                busy
                  ? 'auth.working'
                  : mode === 'bot'
                    ? 'chess.start'
                    : mode === 'private'
                      ? 'chess.create'
                      : 'chess.search',
              )}
            </button>
          )}
        </div>
        <aside className="lobby-note">
          <span className="eyebrow accent">{t('chess.saved')}</span>
          <h3>{t('chess.persistence')}</h3>
          <p>{t('chess.rulesNote')}</p>
        </aside>
      </section>
      {recent.length > 0 && (
        <section>
          <h2>{t('chess.recent')}</h2>
          <div className="recent-matches">
            {recent.map((m) => (
              <Link key={m.id} to={`/play/chess/${m.id}`}>
                <span>{m.id.slice(0, 8)}</span>
                <span>{t(`chess.${m.status}`)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
export function JoinChess() {
  const { t } = useTranslation(),
    location = useLocation(),
    navigate = useNavigate();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const invite = location.hash.slice(1);
  async function join() {
    setBusy(true);
    try {
      await api('/chess/player', {});
      const { match } = await api<{ match: MatchView }>('/chess/join', { invite });
      navigate(`/play/chess/${match.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'UNKNOWN');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="empty-page">
      <h1>{t('chess.joinTitle')}</h1>
      <p>{t('chess.joinText')}</p>
      {error && (
        <p className="notice error" role="alert">
          {t(`errors.${error}`, { defaultValue: t('errors.UNKNOWN') })}
        </p>
      )}
      {/^[a-f0-9]{48}$/.test(invite) ? (
        <button className="button primary" disabled={busy} onClick={() => void join()}>
          {t(busy ? 'auth.working' : 'chess.join')}
        </button>
      ) : (
        <p className="notice error">{t('chess.invalidInvite')}</p>
      )}
    </div>
  );
}
