import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameCatalog } from '../../../../packages/shared/src/contracts';
import { BoardArt, GameCard } from '../components';
export default function Games() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const games = gameCatalog.filter((g) =>
    `${t(`games.${g.id}`)} ${g.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <header className="page-heading">
        <h1>{t('games.title')}</h1>
        <p className="lead">{t('games.intro')}</p>
      </header>
      <div className="catalog-tools">
        <label className="search-label">
          <span>{t('common.search')}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
          />
        </label>
        <span className="count">{t('games.count', { count: games.length })}</span>
      </div>
      <div className="game-grid">
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
      {!games.length && <p className="notice">{t('games.none')}</p>}
    </>
  );
}
export function GameDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const game = gameCatalog.find((g) => g.id === id);
  if (!game) return <NotFound />;
  return (
    <>
      <Link className="text-link" to="/games">
        ← {t('common.back')}
      </Link>
      <section className="detail-hero">
        <div>
          <span className="eyebrow accent">{t(`games.${game.id}Tag`)}</span>
          <h1>{t(`games.${game.id}`)}</h1>
          <p className="lead">{t(`games.${game.id}Desc`)}</p>
          <div className="game-meta">
            <span>{t('games.players')}</span>
            <span>{t(`games.${game.id}Time`)}</span>
          </div>
          <p className="notice">{t('games.status', { number: game.stage })}</p>
        </div>
        <BoardArt game={game.id} large />
      </section>
      <section className="detail-text">
        <div>
          <h2>{t('games.rules')}</h2>
          <p>{t(`games.${game.id}Rules`)}</p>
        </div>
        <div>
          <h2>{t('games.next')}</h2>
          <p>{t('games.nextItems')}</p>
        </div>
      </section>
    </>
  );
}
export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="empty-page">
      <span className="display-code">404</span>
      <h1>{t('common.notFound')}</h1>
      <Link className="button primary" to="/">
        {t('common.goHome')}
      </Link>
    </div>
  );
}
