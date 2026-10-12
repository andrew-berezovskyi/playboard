import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './components';
export function PageHeading({
  title,
  icon,
}: {
  title: string;
  icon: Parameters<typeof Icon>[0]['name'];
}) {
  return (
    <header className="dashboard-heading page-heading">
      <h1>
        <Icon name={icon} />
        <span>{title}</span>
      </h1>
    </header>
  );
}
export function LessonActions({ children, label }: { children: ReactNode; label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="group" className="lesson-actions" aria-label={label ?? t('learning2.actions')}>
      {children}
    </div>
  );
}
export function StatBadges({ streak, wins }: { streak: number; wins?: number }) {
  const { t } = useTranslation();
  const tier =
    streak === 0 ? 0 : streak < 3 ? 1 : streak < 7 ? 2 : streak < 14 ? 3 : streak < 30 ? 4 : 5;
  const label = `${t('product.streak')}: ${streak}`;
  return (
    <div className="stat-badges">
      <span className={`stat-badge streak-tier-${tier}`} title={label} aria-label={label}>
        <Icon name="flame" />
        <strong>{streak}</strong>
      </span>
      {wins !== undefined && (
        <span
          className="stat-badge"
          title={`${t('product.wins')}: ${wins}`}
          aria-label={`${t('product.wins')}: ${wins}`}
        >
          <Icon name="trophy" />
          <strong>{wins}</strong>
        </span>
      )}
    </div>
  );
}
