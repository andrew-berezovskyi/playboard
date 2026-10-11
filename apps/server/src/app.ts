import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { config, origins } from './config';
import { db, pool } from './database';
import { users, sessions, authTokens } from './schema';
import { sendAuthMail } from './mail';
import { registerChess } from './chess-service';
import { registerPlatform } from './platform-service';
import { registerBoards } from './board-service';
import { registerLearning } from './learning-service';
import { registerWeb } from './web';
import {
  registerSchema,
  loginSchema,
  emailSchema,
  tokenSchema,
  resetSchema,
  gameCatalog,
  type UserView,
} from '../../../packages/shared/src/contracts';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('hex');
export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const view = (user: typeof users.$inferSelect): UserView => ({
  id: user.id,
  username: user.username,
  email: user.email,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt.toISOString(),
});
const cookieName = config.NODE_ENV === 'production' ? '__Host-plyvra_session' : 'plyvra_session';
const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 7,
};

export async function buildApp() {
  const app = Fastify({
    bodyLimit: 16384,
    trustProxy: config.TRUSTED_PROXY_CIDRS
      ? config.TRUSTED_PROXY_CIDRS.split(',').map((value) => value.trim())
      : false,
    logger:
      config.NODE_ENV !== 'test'
        ? {
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
            serializers: {
              req: (r) => ({ method: r.method, url: r.url.split('?')[0], remoteAddress: r.ip }),
            },
          }
        : false,
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: [
          "'self'",
          config.WEB_ORIGIN.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:'),
        ],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
    },
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (
        !req.headers.origin ||
        !origins.has(req.headers.origin) ||
        req.headers['x-plyvra-client'] !== 'web'
      )
        return reply.code(403).send({ error: 'FORBIDDEN_ORIGIN' });
      if (!req.headers['content-type']?.startsWith('application/json'))
        return reply.code(415).send({ error: 'JSON_REQUIRED' });
    }
  });
  app.setErrorHandler((error, req, reply) => {
    if ((error as { publicCode?: string }).publicCode)
      return reply
        .code((error as { statusCode: number }).statusCode)
        .send({ error: (error as { publicCode: string }).publicCode });
    if (error instanceof ZodError) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500)
      return reply
        .code(status)
        .send({ error: status === 429 ? 'TOO_MANY_REQUESTS' : 'INVALID_REQUEST' });
    req.log.error({ code: (error as { code?: string }).code }, 'Request failed');
    return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE' });
  });
  if (config.SERVE_WEB === 'true') await registerWeb(app);
  else app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'NOT_FOUND' }));
  const dummyHash = await hashPassword(newToken());
  async function sessionUser(token: string | undefined) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const [row] = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
    return row?.user ?? null;
  }
  async function createSession(userId: string, old: string | undefined) {
    const token = newToken();
    await db.transaction(async (tx) => {
      if (old) await tx.delete(sessions).where(eq(sessions.tokenHash, hashToken(old)));
      await tx.insert(sessions).values({
        tokenHash: hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
    });
    return token;
  }
  async function deliverToken(userId: string, email: string, purpose: 'verify' | 'reset') {
    const token = newToken();
    await db.insert(authTokens).values({
      tokenHash: hashToken(token),
      userId,
      purpose,
      expiresAt: new Date(Date.now() + (purpose === 'verify' ? 86400000 : 3600000)),
    });
    try {
      await sendAuthMail(email, token, purpose);
    } catch {
      await db.delete(authTokens).where(eq(authTokens.tokenHash, hashToken(token)));
      app.log.error('Auth email delivery failed');
      throw new Error('Email delivery unavailable');
    }
  }
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/api/ready', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ok', database: 'connected' };
    } catch {
      return reply.code(503).send({ error: 'DATABASE_UNAVAILABLE' });
    }
  });
  app.get('/api/games', async () => ({ games: gameCatalog }));
  app.get('/api/auth/me', async (req) => {
    const user = await sessionUser(req.cookies[cookieName]);
    return { user: user ? view(user) : null };
  });
  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  async function recordDevice(
    userId: string,
    req: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) {
    const name = config.NODE_ENV === 'production' ? '__Host-playboard_device' : 'playboard_device';
    const previous = req.cookies[name];
    const token = previous && /^[a-f0-9]{64}$/.test(previous) ? previous : newToken();
    await pool.query(
      'INSERT INTO account_devices(user_id,device_hash) VALUES($1,$2) ON CONFLICT(user_id,device_hash) DO UPDATE SET seen_at=now()',
      [userId, hashToken(token)],
    );
    reply.setCookie(name, token, { ...cookieOptions, maxAge: 90 * 86400 });
  }
  app.post('/api/auth/register', authLimit, async (req, reply) => {
    const input = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    let user: typeof users.$inferSelect;
    try {
      [user] = await db.transaction(async (tx) => {
        const created = await tx
          .insert(users)
          .values({ email: input.email, username: input.username, passwordHash })
          .returning();
        const guestToken =
          req.cookies[config.NODE_ENV === 'production' ? '__Host-plyvra_guest' : 'plyvra_guest'];
        if (guestToken && /^[a-f0-9]{64}$/.test(guestToken)) {
          const identity = `guest:${hashToken(guestToken)}`,
            next = `user:${created[0].id}`;
          for (const table of ['chess_participants', 'board_participants']) {
            // Constant internal table names; all user-derived values are parameters.
            await tx.execute(
              sql`UPDATE ${sql.raw(table)} SET identity=${next},user_id=${created[0].id},display_name=${created[0].username} WHERE identity=${identity}`,
            );
          }
        }
        return created;
      });
    } catch (error) {
      if (
        (error as { cause?: { code?: string } }).cause?.code === '23505' ||
        (error as { code?: string }).code === '23505'
      )
        return reply.code(409).send({ error: 'ACCOUNT_UNAVAILABLE' });
      throw error;
    }
    let mailDelivered = true;
    try {
      await deliverToken(user.id, user.email, 'verify');
    } catch {
      mailDelivered = false;
    }
    const token = await createSession(user.id, req.cookies[cookieName]);
    reply.setCookie(cookieName, token, cookieOptions);
    await recordDevice(user.id, req, reply);
    return reply.code(201).send({ user: view(user), mailDelivered });
  });
  app.post('/api/auth/login', authLimit, async (req, reply) => {
    const input = loginSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, input.email));
    const valid = await argon2.verify(user?.passwordHash ?? dummyHash, input.password);
    if (!user || !valid) return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    const token = await createSession(user.id, req.cookies[cookieName]);
    reply.setCookie(cookieName, token, cookieOptions);
    await recordDevice(user.id, req, reply);
    return { user: view(user) };
  });
  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[cookieName];
    if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });
  app.post('/api/auth/verify-email', authLimit, async (req, reply) => {
    const { token } = tokenSchema.parse(req.body);
    const ok = await db.transaction(async (tx) => {
      const [entry] = await tx
        .delete(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, hashToken(token)),
            eq(authTokens.purpose, 'verify'),
            gt(authTokens.expiresAt, new Date()),
          ),
        )
        .returning();
      if (!entry) return false;
      await tx.update(users).set({ emailVerified: true }).where(eq(users.id, entry.userId));
      await tx
        .delete(authTokens)
        .where(and(eq(authTokens.userId, entry.userId), eq(authTokens.purpose, 'verify')));
      return true;
    });
    return ok ? { ok: true } : reply.code(400).send({ error: 'INVALID_TOKEN' });
  });
  app.post('/api/auth/resend-verification', authLimit, async (req, reply) => {
    const user = await sessionUser(req.cookies[cookieName]);
    if (!user) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!user.emailVerified) await deliverToken(user.id, user.email, 'verify');
    return { ok: true };
  });
  app.post('/api/auth/forgot-password', authLimit, async (req) => {
    const { email } = emailSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user) {
      try {
        await deliverToken(user.id, user.email, 'reset');
      } catch {
        /* generic response prevents account enumeration */
      }
    }
    return { ok: true };
  });
  app.post('/api/auth/reset-password', authLimit, async (req, reply) => {
    const { token, password } = resetSchema.parse(req.body);
    const passwordHash = await hashPassword(password);
    const ok = await db.transaction(async (tx) => {
      const [entry] = await tx
        .delete(authTokens)
        .where(
          and(
            eq(authTokens.tokenHash, hashToken(token)),
            eq(authTokens.purpose, 'reset'),
            gt(authTokens.expiresAt, new Date()),
          ),
        )
        .returning();
      if (!entry) return false;
      // Lock the user before updating and invalidating other tokens/sessions.
      await tx.update(users).set({ passwordHash }).where(eq(users.id, entry.userId));
      await tx.delete(sessions).where(eq(sessions.userId, entry.userId));
      await tx
        .delete(authTokens)
        .where(and(eq(authTokens.userId, entry.userId), eq(authTokens.purpose, 'reset')));
      return true;
    });
    if (!ok) return reply.code(400).send({ error: 'INVALID_TOKEN' });
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });
  // Opportunistic bounded-frequency cleanup instead of accumulating expired secrets forever.
  const chess = await registerChess(app, async (cookies) => {
    const user = await sessionUser(cookies[cookieName]);
    return user ? { identity: `user:${user.id}`, name: user.username, userId: user.id } : null;
  });
  await registerPlatform(app, {
    actorFrom: chess.actorFrom,
    hashPassword,
    clearSession: (reply) => {
      reply.clearCookie(cookieName, { path: '/' });
    },
  });
  await registerBoards(app, chess.io, chess.actorFrom);
  registerLearning(app, chess.actorFrom);
  const cleanup = setInterval(() => {
    void Promise.all([
      db.delete(sessions).where(lt(sessions.expiresAt, new Date())),
      db.delete(authTokens).where(lt(authTokens.expiresAt, new Date())),
    ]).catch(() => app.log.error('Auth cleanup failed'));
  }, 3600000);
  cleanup.unref();
  app.addHook('onClose', async () => {
    clearInterval(cleanup);
  });
  return app;
}
