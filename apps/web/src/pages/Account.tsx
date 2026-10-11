import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '../session';
import { api, ApiError } from '../api';
export default function Account() {
  const { t, i18n } = useTranslation();
  const { user, loading, error, refresh } = useSession();
  const location = useLocation();
  const [message, setMessage] = useState<string>(location.state?.message ?? ''),
    [failure, setFailure] = useState(''),
    [pending, setPending] = useState(false);
  if (loading) return <p role="status">{t('common.loading')}</p>;
  if (error)
    return (
      <div className="notice error">
        <p>{t('account.sessionError')}</p>
        <button className="button" onClick={() => void refresh()}>
          {t('common.retry')}
        </button>
      </div>
    );
  if (!user)
    return (
      <div className="empty-page">
        <h1>{t('account.loginRequired')}</h1>
        <Link className="button primary" to="/login">
          {t('nav.login')}
        </Link>
      </div>
    );
  async function resend() {
    setPending(true);
    setFailure('');
    try {
      await api('/auth/resend-verification', {});
      setMessage('resent');
    } catch (err) {
      setFailure(err instanceof ApiError ? err.code : 'UNKNOWN');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <header className="page-heading">
        <span className="eyebrow accent">{t('nav.account')}</span>
        <h1>{t('account.title')}</h1>
      </header>
      <section className="profile">
        <span className="avatar" aria-hidden="true">
          {user.username.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h2>{user.username}</h2>
          <p>
            {t('account.joined', {
              date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
                new Date(user.createdAt),
              ),
            })}
          </p>
        </div>
      </section>
      {message && (
        <p className="notice" role="status">
          {t(`auth.${message}`)}
        </p>
      )}
      {failure && (
        <p className="notice error" role="alert">
          {t(`errors.${failure}`, { defaultValue: t('errors.UNKNOWN') })}
        </p>
      )}
      <section className="account-details">
        <h2>{t('account.emailStatus')}</h2>
        <p>{user.email}</p>
        <span className="development">
          {t(user.emailVerified ? 'account.verified' : 'account.unverified')}
        </span>
        <p>{t('account.privacy')}</p>
        {!user.emailVerified && (
          <button disabled={pending} className="button" onClick={() => void resend()}>
            {t(pending ? 'auth.working' : 'auth.resend')}
          </button>
        )}
      </section>
      <aside className="local-note">
        <h3>{t('account.start')}</h3>
        <p>{t('account.startText')}</p>
        <Link className="text-link" to="/games">
          {t('home.browse')}
        </Link>
      </aside>
    </>
  );
}
