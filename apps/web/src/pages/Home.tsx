import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameCatalog } from '../../../../packages/shared/src/contracts';
import { BoardArt } from '../components';
import { api } from '../api';
import { useSession } from '../session';
type Recent = { id: string; game: string; status: string };
export default function Home() {
  const { t } = useTranslation(),
    { user } = useSession();
  const [recent, setRecent] = useState<Recent[]>([]),
    [daily, setDaily] = useState('');
  useEffect(() => {
    void api<{ lesson: string }>('/daily')
      .then((r) => setDaily(r.lesson))
      .catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    api<{ matches: Recent[] }>('/platform/recent')
      .then((r) => {
        if (active) setRecent(r.matches);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);
  return (
    <>
      <header className="dashboard-heading">
        <h1>{t('product.homeTitle')}</h1>
        <p>{t('product.homeIntro')}</p>
      </header>
      <div className="dashboard-grid">
        {gameCatalog.map((game) => (
          <article className="dashboard-game" key={game.id}>
            <BoardArt game={game.id} />
            <h2>{t(`games.${game.id}`)}</h2>
            <p>{t(`games.${game.id}Desc`)}</p>
            <Link className="button primary" to={`/games/${game.id}`}>
              {t('product.play')}
            </Link>
            <Link className="text-link" to={`/learn/${game.id}`}>
              {t('product.learn')}
            </Link>
          </article>
        ))}
      </div>
      {daily && (
        <section className="dashboard-section settings-card">
          <h2>{t('product.daily')}</h2>
          <Link className="text-link" to={`/learn/${daily.split('-')[0]}/${daily}?daily=1`}>
            {t('product.learn')} →
          </Link>
        </section>
      )}
      {recent.filter((m) => m.status !== 'finished').length > 0 && (
        <section className="dashboard-section">
          <h2>{t('product.continue')}</h2>
          <div className="continue-list">
            {recent
              .filter((m) => m.status !== 'finished')
              .map((m) => (
                <Link key={m.id} to={`/play/${m.game}/${m.id}`}>
                  <span>{t(`games.${m.game}`)}</span>
                  <span>{t('product.continue')} →</span>
                </Link>
              ))}
          </div>
        </section>
      )}
      {!user && (
        <section className="dashboard-section settings-card">
          <h2>{t('product.guestTitle')}</h2>
          <p>{t('product.guestNote')}</p>
          <Link className="text-link" to="/register">
            {t('auth.register')} →
          </Link>
        </section>
      )}
    </>
  );
}
