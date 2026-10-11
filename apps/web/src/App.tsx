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
    [online, setOnline] = useState(navigator.onLine),
    [profileMenu, setProfileMenu] = useState(false),
    [languageMenu, setLanguageMenu] = useState(false);
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
    document.title = `Playboard · ${t(location.pathname.startsWith('/games') ? 'nav.games' : location.pathname === '/account' ? 'nav.account' : 'nav.home')}`;
  }, [location.pathname, t]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);
  useEffect(() => {
    if (!profileMenu && !languageMenu) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof PointerEvent && (event.target as Element).closest('.popover-anchor'))
        return;
      setProfileMenu(false);
      setLanguageMenu(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [profileMenu, languageMenu]);
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main">
        {t('nav.skip')}
      </a>
      <div className="app-shell">
        <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
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
              <Icon name="games" />
              {t('product.learn')}
            </NavLink>
            <NavLink to="/leaderboards" onClick={() => setMenu(false)}>
              <Icon name="games" />
              {t('product.leaderboards')}
            </NavLink>
            <NavLink to="/friends" onClick={() => setMenu(false)}>
              <Icon name="user" />
              {t('product.friends')}
            </NavLink>
          </nav>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-label={t(menu ? 'nav.close' : 'nav.menu')}
            >
              <Icon name={menu ? 'close' : 'menu'} />
            </button>
            <div className="topbar-actions">
              <div className="popover-anchor">
                <button
                  className="language-button"
                  aria-label={t('nav.language')}
                  aria-expanded={languageMenu}
                  onClick={() => {
                    setLanguageMenu(!languageMenu);
                    setProfileMenu(false);
                  }}
                >
                  <CountryFlag language={i18n.language} />
                </button>
                {languageMenu && (
                  <div className="header-popover">
                    {(['uk', 'en'] as const).map((lang) => (
                      <button
                        key={lang}
                        aria-pressed={i18n.language === lang}
                        onClick={() => {
                          void i18n.changeLanguage(lang);
                          setLanguageMenu(false);
                        }}
                      >
                        <CountryFlag language={lang} />
                        {lang === 'uk' ? 'Українська' : 'English'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="icon-button"
                aria-label={t('nav.theme')}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
              </button>
              <div className="popover-anchor">
                <button
                  className="profile-trigger"
                  aria-label={t('product.profileMenu')}
                  aria-expanded={profileMenu}
                  onClick={() => {
                    setProfileMenu(!profileMenu);
                    setLanguageMenu(false);
                  }}
                >
                  {user ? user.username.slice(0, 1).toUpperCase() : <Icon name="user" />}
                </button>
                {profileMenu && (
                  <div className="header-popover">
                    <span className="popover-caption">{user?.username ?? t('chess.guest')}</span>
                    <Link to="/account" onClick={() => setProfileMenu(false)}>
                      {t('nav.account')}
                    </Link>
                    <Link to="/settings" onClick={() => setProfileMenu(false)}>
                      {t('product.settings')}
                    </Link>
                    {user && (
                      <Link to="/notifications" onClick={() => setProfileMenu(false)}>
                        {t('product.notifications')}
                      </Link>
                    )}
                    {!user && (
                      <Link to="/register" onClick={() => setProfileMenu(false)}>
                        {t('auth.register')}
                      </Link>
                    )}
                  </div>
                )}
              </div>
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
          <main id="main" tabIndex={-1}>
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
