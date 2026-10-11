import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { buildApp, hashToken } from '../apps/server/src/app';
import { db, pool } from '../apps/server/src/database';
import { users, sessions, authTokens } from '../apps/server/src/schema';
const suffix = randomUUID().slice(0, 8),
  email = `test_${suffix}@example.test`,
  username = `test_${suffix}`,
  password = 'Original Test Passphrase!';
let app: Awaited<ReturnType<typeof buildApp>>,
  cookie = '',
  userId = '',
  ip = 1;
const headers = (cookieValue = '') => ({
  origin: 'http://localhost:5173',
  'x-plyvra-client': 'web',
  ...(cookieValue ? { cookie: cookieValue } : {}),
});
async function post(path: string, payload: Record<string, unknown>, cookieValue = '') {
  return app.inject({
    method: 'POST',
    url: `/api/auth/${path}`,
    headers: headers(cookieValue),
    payload,
    remoteAddress: `127.1.0.${ip++}`,
  });
}
const responseCookie = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0];
async function mailToken(purpose: 'verify' | 'reset') {
  const files = (await readdir('.local/mail')).sort().reverse();
  for (const file of files) {
    const mail = JSON.parse(await readFile(`.local/mail/${file}`, 'utf8'));
    if (
      mail.to === email &&
      mail.text.includes(purpose === 'verify' ? '/verify-email#' : '/reset-password#')
    )
      return String(mail.text).match(/#([a-f0-9]{64})/)![1];
  }
  throw new Error('Expected local email');
}
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  if (userId) await db.delete(users).where(eq(users.id, userId));
  await app.close();
  await pool.end();
});
describe('real PostgreSQL authentication', () => {
  it('health and readiness are separate and catalog is honest', async () => {
    expect((await app.inject('/api/ready')).json().database).toBe('connected');
    expect(
      (await app.inject('/api/games'))
        .json()
        .games.every((g: { status: string; id: string }) => g.status === 'beta'),
    ).toBe(true);
  });
  it('rejects CSRF, missing custom headers and non-JSON bodies', async () => {
    const evil = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: 'http://evil.test', 'x-plyvra-client': 'web' },
      payload: { email, username, password },
    });
    expect(evil.statusCode).toBe(403);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: 'http://localhost:5173' },
      payload: {},
    });
    expect(missing.statusCode).toBe(403);
    const form = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...headers(), 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'x=1',
    });
    expect(form.statusCode).toBe(415);
  });
  it('persists registration, hashes credentials, sets a private cookie', async () => {
    const res = await post('register', { email, username, password });
    expect(res.statusCode).toBe(201);
    userId = res.json().user.id;
    cookie = responseCookie(res);
    expect(String(res.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(res.headers['set-cookie'])).toContain('SameSite=Lax');
    const [stored] = await db.select().from(users).where(eq(users.id, userId));
    expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(res.body).not.toContain('passwordHash');
    const [session] = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(session.tokenHash).toBe(hashToken(cookie.split('=')[1]));
  });
  it('restores session and rejects forged cookies', async () => {
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { cookie } })).json().user.username,
    ).toBe(username);
    expect(
      (
        await app.inject({ url: '/api/auth/me', headers: { cookie: 'plyvra_session=forged' } })
      ).json().user,
    ).toBeNull();
  });
  it('rejects duplicate accounts and invalid registration', async () => {
    expect((await post('register', { email, username, password })).statusCode).toBe(409);
    expect(
      (await post('register', { email: 'bad', username: 'x', password: 'tiny' })).statusCode,
    ).toBe(400);
  });
  it('email verification is atomic and single use', async () => {
    const token = await mailToken('verify');
    expect((await post('verify-email', { token })).statusCode).toBe(200);
    expect((await post('verify-email', { token })).statusCode).toBe(400);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { cookie } })).json().user.emailVerified,
    ).toBe(true);
  });
  it('login rejects invalid credentials and rotates the current session', async () => {
    expect((await post('login', { email, password: 'wrong' })).statusCode).toBe(401);
    const login = await post('login', { email, password }, cookie);
    expect(login.statusCode).toBe(200);
    const previous = cookie;
    cookie = responseCookie(login);
    expect(cookie).not.toBe(previous);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { cookie: previous } })).json().user,
    ).toBeNull();
  });
  it('unknown reset requests have the same public response', async () => {
    const known = await post('forgot-password', { email });
    const unknown = await post('forgot-password', { email: 'absent@example.test' });
    expect(known.statusCode).toBe(unknown.statusCode);
    expect(known.body).toBe(unknown.body);
  });
  it('password reset is single use, invalidates sessions, changes credentials', async () => {
    const token = await mailToken('reset'),
      newPassword = 'Replacement Test Passphrase!';
    expect((await post('reset-password', { token, password: newPassword })).statusCode).toBe(200);
    expect((await post('reset-password', { token, password: newPassword })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).json().user).toBeNull();
    expect((await post('login', { email, password })).statusCode).toBe(401);
    const login = await post('login', { email, password: newPassword });
    expect(login.statusCode).toBe(200);
    cookie = responseCookie(login);
  });
  it('expired tokens and sessions cannot authenticate', async () => {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(0) })
      .where(eq(sessions.userId, userId));
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).json().user).toBeNull();
    const token = 'a'.repeat(64);
    await db
      .insert(authTokens)
      .values({ tokenHash: hashToken(token), userId, purpose: 'verify', expiresAt: new Date(0) });
    expect((await post('verify-email', { token })).statusCode).toBe(400);
  });
  it('logout revokes the server session', async () => {
    cookie = responseCookie(
      await post('login', { email, password: 'Replacement Test Passphrase!' }),
    );
    expect((await post('logout', {}, cookie)).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie } })).json().user).toBeNull();
  });
  it('resend requires an authenticated identity', async () => {
    expect((await post('resend-verification', {})).statusCode).toBe(401);
  });
  it('has security headers and limits login attempts', async () => {
    const response = await app.inject('/api/health');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    let status = 0;
    for (let n = 0; n < 11; n++) {
      status = (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: headers(),
          payload: { email, password: 'wrong' },
          remoteAddress: '127.9.0.1',
        })
      ).statusCode;
    }
    expect(status).toBe(429);
  });
});
