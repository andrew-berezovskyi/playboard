import {
  House,
  LayoutGrid,
  CircleUserRound,
  ArrowRight,
  Sun,
  Moon,
  Menu,
  X,
  GraduationCap,
  Trophy,
  Users,
  Bell,
  Award,
  Flame,
  History,
  Play,
  Search,
  Settings,
  Lightbulb,
  Volume2,
  UserPlus,
  RotateCcw,
  Crown,
  Route,
  ChartNoAxesCombined,
  Clock,
  Share2,
  CircleMinus,
  Equal,
} from 'lucide-react';
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
const icons = {
  home: House,
  games: LayoutGrid,
  user: CircleUserRound,
  arrow: ArrowRight,
  sun: Sun,
  moon: Moon,
  menu: Menu,
  close: X,
  learn: GraduationCap,
  trophy: Trophy,
  friends: Users,
  bell: Bell,
  award: Award,
  flame: Flame,
  history: History,
  play: Play,
  search: Search,
  settings: Settings,
  hint: Lightbulb,
  sound: Volume2,
  invite: UserPlus,
  rematch: RotateCcw,
  chess: Crown,
  wayline: Route,
  rating: ChartNoAxesCombined,
  clock: Clock,
  share: Share2,
  loss: CircleMinus,
  draw: Equal,
};
export function Icon({ name }: { name: keyof typeof icons }) {
  const Glyph = icons[name];
  return <Glyph className="ui-icon" size={20} strokeWidth={1.7} aria-hidden="true" />;
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
        <h2>{t(`games.${game.id}`)}</h2>
        <div className="game-card-actions">
          <Link className="button primary" to={`/games/${game.id}`}>
            <Icon name="play" />
            {t('product.play')}
          </Link>
          <Link className="button secondary" to={`/learn/${game.id}/course`}>
            <Icon name="learn" />
            {t('polish.learn')}
          </Link>
        </div>
      </div>
    </article>
  );
}
