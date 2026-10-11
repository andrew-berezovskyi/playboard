import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { courseCopy } from '../../../../packages/shared/src/courses';
import { api, ApiError, ensurePlayer } from '../api';
import { useSession } from '../session';
import { localPreferences, type Profile } from '../profile-types';
export default function Settings() {
  const { t, i18n } = useTranslation(),
    { user, setUser } = useSession(),
    navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null),
    [prefs, setPrefs] = useState(localPreferences),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false);
  useEffect(() => {
    let active = true;
    api<{ profile: Profile | null }>('/platform/profile')
      .then((r) => {
        if (active) {
          setProfile(r.profile);
          if (r.profile?.settings)
            setPrefs({ ...localPreferences(), ...r.profile.settings.preferences });
        }
      })
      .catch(() => {
        if (active) setError('UNKNOWN');
      });
    return () => {
      active = false;
    };
  }, [user]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(t('product.saved'));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'UNKNOWN');
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    await run(async () => {
      try {
        localStorage.setItem('playboard-preferences', JSON.stringify(prefs));
      } catch {
        /* optional storage */
      }
      if (user && profile?.settings)
        await api('/platform/settings', {
          displayName: String(fields.get('displayName') ?? profile.displayName),
          bio: String(fields.get('bio') ?? profile.bio),
          avatar: String(fields.get('avatar') ?? profile.avatar),
          publicProfile: fields.has('publicProfile'),
          showOnline: fields.has('showOnline'),
          invitations: String(fields.get('invitations') ?? 'friends'),
          timezone: String(fields.get('timezone') ?? profile.settings.timezone),
          preferences: prefs,
        });
    });
  }
  async function logout() {
    await run(async () => {
      await api('/auth/logout', {});
      setUser(null);
      await ensurePlayer();
      navigate('/account');
    });
  }
  return (
    <>
      <header className="dashboard-heading">
        <h1>{t('product.settings')}</h1>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {t(`errors.${error}`, { defaultValue: t('product.error') })}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <form onSubmit={(e) => void save(e)}>
        <div className="settings-grid">
          {user && profile && (
            <section className="settings-card">
              <h2>{t('product.profile')}</h2>
              <div className="simple-list">
                <label>
                  {t('product.displayName')}
                  <input name="displayName" maxLength={40} defaultValue={profile.displayName} />
                </label>
                <label>
                  {t('product.bio')}
                  <textarea name="bio" maxLength={500} defaultValue={profile.bio} />
                </label>
                <label>
                  {t('product.avatar')}
                  <select name="avatar" defaultValue={profile.avatar}>
                    {['navy', 'slate', 'rose', 'sage'].map((color) => (
                      <option key={color} value={color}>
                        {t(`product.${color}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}
          <section className="settings-card">
            <h2>{t('product.preferences')}</h2>
            <div className="simple-list">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.captureEffect}
                  onChange={(e) => setPrefs({ ...prefs, captureEffect: e.target.checked })}
                />
                {courseCopy[i18n.language === 'uk' ? 'uk' : 'en'].capture}
              </label>
              <label>
                {courseCopy[i18n.language === 'uk' ? 'uk' : 'en'].cards}
                <select
                  value={prefs.cards}
                  onChange={(e) =>
                    setPrefs({ ...prefs, cards: e.target.value as typeof prefs.cards })
                  }
                >
                  <option value="minimal">
                    {courseCopy[i18n.language === 'uk' ? 'uk' : 'en'].minimal}
                  </option>
                  <option value="diagram">
                    {courseCopy[i18n.language === 'uk' ? 'uk' : 'en'].diagram}
                  </option>
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.animations}
                  onChange={(e) => setPrefs({ ...prefs, animations: e.target.checked })}
                />
                {t('product.animations')}
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={prefs.sound}
                  onChange={(e) => setPrefs({ ...prefs, sound: e.target.checked })}
                />
                {t('product.sound')}
              </label>
              <label>
                {t('product.board')}
                <select
                  value={prefs.board}
                  onChange={(e) =>
                    setPrefs({ ...prefs, board: e.target.value as typeof prefs.board })
                  }
                >
                  <option value="classic">{t('product.classic')}</option>
                  <option value="walnut">{t('product.walnut')}</option>
                </select>
              </label>
              <label>
                {t('product.pieceSet')}
                <select
                  value={prefs.pieces}
                  onChange={(e) =>
                    setPrefs({ ...prefs, pieces: e.target.value as typeof prefs.pieces })
                  }
                >
                  <option value="solid">{t('product.solid')}</option>
                  <option value="outline">{t('product.outline')}</option>
                </select>
              </label>
            </div>
          </section>
          {profile?.settings && (
            <section className="settings-card">
              <h2>{t('product.privacy')}</h2>
              <div className="simple-list">
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="publicProfile"
                    defaultChecked={profile.settings.publicProfile}
                  />
                  {t('product.publicProfile')}
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="showOnline"
                    defaultChecked={profile.settings.showOnline}
                  />
                  {t('product.showOnline')}
                </label>
                <label>
                  {t('product.invitations')}
                  <select name="invitations" defaultValue={profile.settings.invitations}>
                    {['everyone', 'friends', 'none'].map((v) => (
                      <option key={v} value={v}>
                        {t(`product.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('product.timezone')}
                  <input name="timezone" defaultValue={profile.settings.timezone} required />
                </label>
              </div>
            </section>
          )}
        </div>
        <div className="actions" style={{ marginTop: 20 }}>
          <button disabled={busy} className="button primary">
            {t('product.save')}
          </button>
        </div>
      </form>
      {user ? (
        <section className="dashboard-section settings-card">
          <h2>{t('product.accountSecurity')}</h2>
          <button className="button" disabled={busy} onClick={() => void logout()}>
            {t('product.logout')}
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await api('/platform/password', {
                  currentPassword: f.get('currentPassword'),
                  newPassword: f.get('newPassword'),
                });
                setUser(null);
                navigate('/login');
              });
            }}
          >
            <h3>{t('product.password')}</h3>
            <label>
              {t('product.currentPassword')}
              <input
                type="password"
                name="currentPassword"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              {t('product.newPassword')}
              <input
                type="password"
                name="newPassword"
                minLength={12}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <button className="button" disabled={busy}>
              {t('product.password')}
            </button>
          </form>
          <button className="text-link danger-button" onClick={() => setDeleting(!deleting)}>
            {t('product.deleteAccount')}
          </button>
          {deleting && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  await api('/platform/delete-account', { password: f.get('password') });
                  setUser(null);
                  navigate('/');
                });
              }}
            >
              <p>{t('product.deleteNote')}</p>
              <label>
                {t('product.currentPassword')}
                <input type="password" name="password" required autoComplete="current-password" />
              </label>
              <button disabled={busy} className="button danger-button">
                {t('product.deleteConfirm')}
              </button>
            </form>
          )}
        </section>
      ) : (
        <section className="dashboard-section settings-card">
          <p>{t('product.guestNote')}</p>
          <Link className="button" to="/register">
            {t('auth.register')}
          </Link>
        </section>
      )}
    </>
  );
}
