import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameCatalog } from '../../../../packages/shared/src/contracts';
import { GameCard } from '../components';
export default function Games() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const games = gameCatalog.filter((g) =>
    `${t(`games.${g.id}`)} ${g.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <header className="page-heading">
        <h1>{t('polish.catalog')}</h1>
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
