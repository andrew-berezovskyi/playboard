import { ActionMenu, MenuItem, MenuLabel, MenuSeparator } from './ui';
import { lazy, Suspense, useEffect, useState, Component, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo, Icon } from './components';
import { useSession } from './session';
import { CountryFlag } from './CountryFlag';
import i18n from './i18n';
import Home from './pages/Home';
const Games = lazy(() => import('./pages/Games'));

const NotFound = lazy(() => import('./pages/Games').then((m) => ({ default: m.NotFound })));
const Auth = lazy(() => import('./pages/Auth'));
const Account = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const BoardLobby = lazy(() => import('./pages/BoardLobby'));
const JoinBoard = lazy(() => import('./pages/BoardLobby').then((m) => ({ default: m.JoinBoard })));
const BoardPlay = lazy(() => import('./pages/BoardPlay'));
const Learning = lazy(() => import('./pages/Learning'));
const Course = lazy(() => import('./pages/Course'));
const Friends = lazy(() => import('./pages/Community').then((m) => ({ default: m.Friends })));
const Leaderboards = lazy(() =>
  import('./pages/Community').then((m) => ({ default: m.Leaderboards })),
);
const Notifications = lazy(() =>
  import('./pages/Community').then((m) => ({ default: m.Notifications })),
);
const ChessLobby = lazy(() => import('./pages/ChessLobby'));
const JoinChess = lazy(() => import('./pages/ChessLobby').then((m) => ({ default: m.JoinChess })));
const ChessPlay = lazy(() => import('./pages/ChessPlay'));
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="notice error">
        <p>{i18n.t('common.error')}</p>
        <button className="button" onClick={() => window.location.reload()}>
          {i18n.t('common.retry')}
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const { t } = useTranslation();
  const { user } = useSession();
  const location = useLocation();
  const [menu, setMenu] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('plyvra-theme') ?? 'dark';
    } catch {
      return 'dark';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('plyvra-theme', theme);
    } catch {
      /* storage denied */
    }
  }, [theme]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    const path = location.pathname;
    const title = path.startsWith('/games')
      ? 'nav.games'
      : path.startsWith('/learn')
        ? 'product.learn'
        : path.startsWith('/leaderboards')
          ? 'product.leaderboards'
          : path.startsWith('/friends')
            ? 'product.friends'
            : path.startsWith('/notifications')
              ? 'product.notifications'
              : path.startsWith('/settings')
                ? 'product.settings'
                : path.startsWith('/account') || path.startsWith('/profile')
                  ? 'nav.account'
                  : path.startsWith('/play')
                    ? 'product.play'
                    : path === '/login'
                      ? 'nav.login'
                      : path === '/register'
                        ? 'auth.register'
                        : 'nav.home';
    document.title = `Playboard · ${t(title)}`;
  }, [location.pathname, t]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(false);
        document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();
      }
      if (e.key === 'Tab') {
        const items = Array.from(
          document.querySelectorAll<HTMLElement>('.sidebar a,.sidebar button'),
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.querySelector<HTMLElement>('.sidebar a')?.focus();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main">
        {t('nav.skip')}
      </a>
      <div className="app-shell">
        <aside className={`sidebar ${menu ? 'is-open' : ''}`} id="site-navigation">
          <button
            className="icon-button sidebar-close"
            aria-label={t('nav.close')}
            onClick={() => {
              setMenu(false);
              document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();
            }}
          >
            <Icon name="close" />
          </button>
          <Link to="/" onClick={() => setMenu(false)} aria-label="Playboard">
            <Logo />
          </Link>

          <nav aria-label={t('nav.menu')}>
            <NavLink to="/" end onClick={() => setMenu(false)}>
              <Icon name="home" />
              {t('nav.home')}
            </NavLink>
            <NavLink to="/games" onClick={() => setMenu(false)}>
              <Icon name="games" />
              {t('nav.games')}
            </NavLink>
            <NavLink to="/account" onClick={() => setMenu(false)}>
              <Icon name="user" />
              {t('nav.account')}
            </NavLink>
            <NavLink to="/learn" onClick={() => setMenu(false)}>
              <Icon name="learn" />
              {t('product.learn')}
            </NavLink>
            <NavLink to="/leaderboards" onClick={() => setMenu(false)}>
              <Icon name="trophy" />
              {t('product.leaderboards')}
            </NavLink>
            <NavLink to="/friends" onClick={() => setMenu(false)}>
              <Icon name="friends" />
              {t('product.friends')}
            </NavLink>
          </nav>
        </aside>
        {menu && (
          <button
            className="nav-backdrop"
            aria-label={t('nav.close')}
            onClick={() => setMenu(false)}
          />
        )}
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-controls="site-navigation"
              aria-label={t(menu ? 'nav.close' : 'nav.menu')}
            >
              <Icon name={menu ? 'close' : 'menu'} />
            </button>
            <div className="topbar-actions">
              <ActionMenu
                label={t('nav.language')}
                trigger={
                  <button className="language-button" aria-label={t('nav.language')}>
                    <CountryFlag language={i18n.language} />
                  </button>
                }
              >
                {(['uk', 'en'] as const).map((lang) => (
                  <MenuItem
                    key={lang}
                    className="menu-item"
                    onSelect={() => void i18n.changeLanguage(lang)}
                  >
                    <CountryFlag language={lang} />
                    <span>{lang === 'uk' ? 'Українська' : 'English'}</span>
                    {i18n.language === lang && (
                      <span className="menu-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </MenuItem>
                ))}
              </ActionMenu>
              <button
                className="icon-button"
                aria-label={t('nav.theme')}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              </button>
              {user && (
                <Link
                  className="icon-button"
                  aria-label={t('product.notifications')}
                  to="/notifications"
                >
                  <Icon name="bell" />
                </Link>
              )}
              <ActionMenu
                label={t('product.profileMenu')}
                trigger={
                  <button className="profile-trigger" aria-label={t('product.profileMenu')}>
                    {user ? user.username.slice(0, 1).toUpperCase() : <Icon name="user" />}
                  </button>
                }
              >
                <MenuLabel className="menu-caption">{user?.username ?? t('chess.guest')}</MenuLabel>
                <MenuSeparator className="menu-separator" />
                <MenuItem asChild className="menu-item">
                  <Link to="/account">
                    <Icon name="user" />
                    {t('nav.account')}
                  </Link>
                </MenuItem>
                <MenuItem asChild className="menu-item">
                  <Link to="/settings">
                    <Icon name="settings" />
                    {t('product.settings')}
                  </Link>
                </MenuItem>
                {user && (
                  <MenuItem asChild className="menu-item">
                    <Link to="/notifications">
                      <Icon name="bell" />
                      {t('product.notifications')}
                    </Link>
                  </MenuItem>
                )}
                {!user && (
                  <MenuItem asChild className="menu-item">
                    <Link to="/register">
                      <Icon name="invite" />
                      {t('auth.register')}
                    </Link>
                  </MenuItem>
                )}
              </ActionMenu>
              {!user && (
                <Link className="button compact" to="/login">
                  {t('nav.login')}
                </Link>
              )}
            </div>
          </header>
          {!online && (
            <p className="offline-banner" role="status">
              {t('common.offline')}
            </p>
          )}
          <main id="main" tabIndex={-1} data-route={location.pathname}>
            <Suspense
              fallback={
                <div className="skeleton" role="status">
                  {t('common.loading')}
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/games" element={<Games />} />

                <Route path="/games/chess" element={<ChessLobby />} />
                <Route path="/games/:gameId" element={<BoardLobby key={location.pathname} />} />
                <Route path="/join/chess" element={<JoinChess />} />
                <Route path="/join/:gameId" element={<JoinBoard />} />
                <Route
                  path="/play/:gameId/:matchId"
                  element={<BoardPlay key={location.pathname} />}
                />
                <Route
                  path="/play/chess/:matchId"
                  element={<ChessPlay key={location.pathname} />}
                />
                {['login', 'register', 'forgot-password', 'verify-email', 'reset-password'].map(
                  (route) => (
                    <Route key={route} path={`/${route}`} element={<Auth key={route} />} />
                  ),
                )}
                <Route path="/account" element={<Account />} />
                <Route path="/profile/:username" element={<Account />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/friends" element={<Friends />} />
                <Route path="/leaderboards" element={<Leaderboards />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/learn" element={<Learning key={location.pathname} />} />
                <Route path="/learn/:gameId/course" element={<Course key={location.pathname} />} />
                <Route path="/learn/:gameId" element={<Learning key={location.pathname} />} />
                <Route
                  path="/learn/:gameId/:lessonId"
                  element={<Learning key={location.pathname} />}
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
