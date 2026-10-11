import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { brand, gameCatalog, type GameId } from '../../../packages/shared/src/contracts';
import { ChessPiece } from './ChessPiece';
import type { PieceSymbol } from 'chess.js';
export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect
          x="5"
          y="5"
          width="38"
          height="38"
          rx="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <rect x="12" y="12" width="10" height="10" rx="3" fill="currentColor" />
        <rect x="26" y="26" width="10" height="10" rx="3" fill="currentColor" />
        <circle cx="31" cy="17" r="4" fill="currentColor" opacity=".5" />
        <circle cx="17" cy="31" r="4" fill="currentColor" opacity=".5" />
      </svg>
      <span>{brand.name}</span>
    </span>
  );
}
export function Icon({
  name,
}: {
  name: 'home' | 'games' | 'user' | 'arrow' | 'sun' | 'moon' | 'menu' | 'close';
}) {
  const paths = {
    home: 'M3 10 12 3l9 7v10H5V10m4 10v-7h6v7',
    games: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',
    user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    moon: 'M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11',
    menu: 'M4 6h16M4 12h16M4 18h16',
    close: 'm6 6 12 12M6 18 18 6',
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function BoardArt({ game, large = false }: { game: GameId; large?: boolean }) {
  const { t } = useTranslation();
  const size = game === 'wayline' ? 5 : 8;
  return (
    <div
      className={`board-art ${game} ${large ? 'large' : ''}`}
      role="img"
      aria-label={t('games.preview')}
    >
      <div
        className="art-board"
        style={{
          gridTemplateColumns: `repeat(${size},minmax(0,1fr))`,
          gridTemplateRows: `repeat(${size},minmax(0,1fr))`,
        }}
      >
        {Array.from({ length: size * size }, (_, i) => {
          const row = Math.floor(i / size),
            col = i % size,
            dark = (row + col) % 2 === 1;
          let piece = '';
          if (game === 'chess') {
            const rows = ['rnbqkbnr', 'pppppppp', '', '', '', '', 'pppppppp', 'rnbqkbnr'];
            piece = rows[row]?.[col] ?? '';
          }
          if (game === 'checkers' && dark && (row < 3 || row > 4)) piece = '●';
          if (game === 'wayline' && (row === 0 || row === 4)) piece = col === 2 ? '◆' : '●';
          return (
            <span
              key={i}
              className={`art-cell ${dark ? 'square-dark' : 'square-light'} ${row < size / 2 ? 'far' : 'near'}`}
            >
              {game === 'chess' && piece ? (
                <ChessPiece type={piece as PieceSymbol} color={row < 4 ? 'b' : 'w'} />
              ) : (
                piece
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
export function GameCard({ game }: { game: (typeof gameCatalog)[number] }) {
  const { t } = useTranslation();
  return (
    <article className={`game-card card-${game.id}`}>
      <Link
        className="card-art-link"
        to={`/games/${game.id}`}
        aria-label={`${t(`games.${game.id}`)} — ${t('common.details')}`}
      >
        <BoardArt game={game.id} />
      </Link>
      <div className="card-body">
        <span className="eyebrow">{t(`games.${game.id}Tag`)}</span>
        <h3>
          <Link to={`/games/${game.id}`}>
            {t(`games.${game.id}`)}
            <Icon name="arrow" />
          </Link>
        </h3>
        <p>{t(`games.${game.id}Desc`)}</p>
        <div className="game-meta">
          <span>{t('games.players')}</span>
          <span>{t(`games.${game.id}Time`)}</span>
        </div>
        <span className="development">{game.status === 'planned' ? t('common.planned') : ''}</span>
      </div>
    </article>
  );
}
