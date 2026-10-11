import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api';
import { useSession } from '../session';
import { Logo } from '../components';
import type { UserView } from '../../../../packages/shared/src/contracts';
export default function Auth() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { setUser, refresh } = useSession();
  const mode = pathname.slice(1),
    register = mode === 'register',
    login = mode === 'login',
    forgot = mode === 'forgot-password',
    verify = mode === 'verify-email',
    reset = mode === 'reset-password';
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const [token] = useState(() => hash.slice(1));
  const validToken = /^[a-f0-9]{64}$/.test(token);
  const title = register
    ? 'registerTitle'
    : login
      ? 'loginTitle'
      : forgot
        ? 'forgotTitle'
        : verify
          ? 'verifyTitle'
          : 'resetTitle';
  const submitLabel = register
    ? 'register'
    : login
      ? 'login'
      : forgot
        ? 'sendReset'
        : verify
          ? 'verify'
          : 'reset';
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError('');
    const fields = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    fields.forEach((value, key) => {
      body[key] = String(value);
    });
    if (verify || reset) body.token = token;
    try {
      const result = await api<{ user?: UserView; mailDelivered?: boolean }>(`/auth/${mode}`, body);
      if (result.user) {
        setUser(result.user);
        navigate('/account', {
          state: {
            message: register ? (result.mailDelivered ? 'checkMail' : 'mailFailed') : undefined,
          },
          replace: true,
        });
      } else {
        setSuccess(forgot ? 'sent' : verify ? 'verified' : 'resetDone');
        if (reset) setUser(null);
        if (verify) await refresh();
        window.history.replaceState(null, '', pathname);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'UNKNOWN');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-aside">
        <Logo />
        <h2>{t('home.featureTitle')}</h2>
        <p>{t('product.homeIntro')}</p>
      </section>
      <section className="auth-panel">
        <h1>{t(`auth.${title}`)}</h1>
        {(register || login || forgot || verify) && (
          <p>
            {t(
              `auth.${register ? 'registerText' : login ? 'loginText' : forgot ? 'forgotText' : 'verifyText'}`,
            )}
          </p>
        )}
        {error && (
          <div className="notice error" role="alert">
            {t(`errors.${error}`, { defaultValue: t('errors.UNKNOWN') })}
          </div>
        )}
        {success ? (
          <div className="notice" role="status">
            {t(`auth.${success}`)}
            <Link className="text-link" to={verify ? '/account' : '/login'}>
              {t(verify ? 'nav.account' : 'nav.login')}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            {(register || login || forgot) && (
              <label>
                {t('auth.email')}
                <input name="email" type="email" autoComplete="email" required maxLength={254} />
              </label>
            )}
            {register && (
              <label>
                {t('auth.username')}
                <input
                  name="username"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={24}
                  pattern="[a-zA-Z0-9_]+"
                  aria-label={t('auth.username')}
                  aria-describedby="username-help"
                />
                <small id="username-help">{t('auth.usernameHelp')}</small>
              </label>
            )}
            {(register || login || reset) && (
              <label>
                {t('auth.password')}
                <input
                  name="password"
                  type="password"
                  autoComplete={login ? 'current-password' : 'new-password'}
                  required
                  minLength={login ? 1 : 12}
                  maxLength={128}
                  aria-label={t('auth.password')}
                  aria-describedby={login ? undefined : 'password-help'}
                />
                {!login && <small id="password-help">{t('auth.passwordHelp')}</small>}
              </label>
            )}
            {(verify || reset) && !validToken && (
              <p className="notice error">{t('auth.invalidLink')}</p>
            )}
            <button
              className="button primary full"
              disabled={pending || ((verify || reset) && !validToken)}
            >
              {t(`auth.${pending ? 'working' : submitLabel}`)}
            </button>
          </form>
        )}
        {login && (
          <Link className="text-link form-link" to="/forgot-password">
            {t('auth.forgot')}
          </Link>
        )}
        {(login || register) && (
          <p className="form-switch">
            {t(login ? 'auth.needAccount' : 'auth.haveAccount')}{' '}
            <Link to={login ? '/register' : '/login'}>
              {t(login ? 'auth.register' : 'auth.login')}
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
