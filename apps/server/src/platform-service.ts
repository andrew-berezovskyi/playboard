import type { FastifyInstance } from 'fastify';
import type { Actor } from './chess-service';
import { chessError } from './chess-service';
import { pool } from './database';
import { z } from 'zod';
import argon2 from 'argon2';
type Dependencies = {
  actorFrom: (cookies: Record<string, string | undefined>) => Promise<Actor | null>;
  hashPassword: (password: string) => Promise<string>;
  clearSession: (reply: import('fastify').FastifyReply) => void;
};
export async function registerPlatform(app: FastifyInstance, deps: Dependencies) {
  const account = async (cookies: Record<string, string | undefined>) => {
    const actor = await deps.actorFrom(cookies);
    if (!actor?.userId) chessError('UNAUTHORIZED', 401);
    return actor;
  };
  app.get('/api/platform/recent', async (req) => {
    const actor = await deps.actorFrom(req.cookies);
    if (!actor) return { matches: [] };
    return {
      matches: (
        await pool.query(
          `SELECT m.id,'chess' game,m.status,m.created_at,m.updated_at,m.result,m.time_control,m.difficulty,m.ranked,m.mode='bot' bot,p.side your_side,
            (SELECT display_name FROM chess_participants WHERE match_id=m.id AND side<>p.side) opponent,
            jsonb_array_length(m.state->'moves') move_count
          FROM chess_matches m JOIN chess_participants p ON p.match_id=m.id WHERE p.identity=$1
          UNION ALL
          SELECT m.id,m.game,m.status,m.created_at,m.updated_at,m.result,m.time_control,m.difficulty,m.ranked,m.mode='bot' bot,p.side your_side,
            (SELECT display_name FROM board_participants WHERE match_id=m.id AND side<>p.side) opponent,
            jsonb_array_length(m.state->'history') move_count
          FROM board_matches m JOIN board_participants p ON p.match_id=m.id WHERE p.identity=$1
          ORDER BY updated_at DESC LIMIT 20`,
          [actor.identity],
        )
      ).rows,
    };
  });
  async function details(userId: string, own: boolean) {
    await pool.query('INSERT INTO user_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING', [
      userId,
    ]);
    const p = (
      await pool.query(
        'SELECT u.username,u.created_at,p.* FROM users u JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1',
        [userId],
      )
    ).rows[0];
    if (!own && !p.public_profile) chessError('PRIVATE_PROFILE', 403);
    const stats = (
      await pool.query(
        'SELECT count(*)::int games,count(*) FILTER(WHERE score=1)::int wins,count(*) FILTER(WHERE score=0.5)::int draws,count(*) FILTER(WHERE score=0)::int losses FROM match_results WHERE user_id=$1',
        [userId],
      )
    ).rows[0];
    const xp = Number(
      (
        await pool.query('SELECT COALESCE(sum(amount),0) xp FROM experience WHERE user_id=$1', [
          userId,
        ])
      ).rows[0].xp,
    );
    const days = (
      await pool.query<{ day: string }>(
        'SELECT to_char(day,\'YYYY-MM-DD\') AS "day" FROM daily_activity WHERE user_id=$1 ORDER BY day DESC',
        [userId],
      )
    ).rows.map((r) => r.day);
    const today = (
      await pool.query<{ day: string }>(
        'SELECT to_char(now() AT TIME ZONE timezone,\'YYYY-MM-DD\') AS "day" FROM user_profiles WHERE user_id=$1',
        [userId],
      )
    ).rows[0].day;
    const ordinal = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
    let streak = 0,
      best = 0,
      run = 0,
      last = -1;
    for (const d of days) {
      const n = ordinal(d);
      run = last === n + 1 ? run + 1 : 1;
      best = Math.max(best, run);
      last = n;
    }
    if (days.length && ordinal(today) - ordinal(days[0]) <= 1) {
      streak = 1;
      for (let i = 1; i < days.length && ordinal(days[i - 1]) - ordinal(days[i]) === 1; i++)
        streak++;
    }
    const season = (
      await pool.query(
        "SELECT COALESCE(sum(amount),0)::int points FROM experience WHERE user_id=$1 AND created_at>=date_trunc('month',now())",
        [userId],
      )
    ).rows[0].points as number;
    const league =
      season >= 3000
        ? 'master'
        : season >= 1800
          ? 'diamond'
          : season >= 1000
            ? 'platinum'
            : season >= 500
              ? 'gold'
              : season >= 200
                ? 'silver'
                : 'bronze';
    return {
      username: p.username,
      displayName: p.display_name || p.username,
      bio: p.bio,
      avatar: p.avatar,
      createdAt: p.created_at,
      stats,
      xp,
      level: 1 + Math.floor(Math.sqrt(xp / 100)),
      streak,
      bestStreak: best,
      today,
      activity: days.slice(0, 90),
      seasonPoints: season,
      league,
      ratings: (
        await pool.query('SELECT pool,rating,deviation,games FROM ratings WHERE user_id=$1', [
          userId,
        ])
      ).rows,
      ratingHistory: (
        await pool.query(
          'SELECT match_id,pool,before_rating,after_rating,created_at FROM rating_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
          [userId],
        )
      ).rows,
      friendCount: Number(
        (
          await pool.query(
            "SELECT count(*) FROM friendships WHERE status='accepted' AND (sender=$1 OR receiver=$1)",
            [userId],
          )
        ).rows[0].count,
      ),
      achievements: (
        await pool.query('SELECT code,unlocked_at FROM achievements WHERE user_id=$1', [userId])
      ).rows,
      lessons: (
        await pool.query('SELECT lesson,completed_at FROM tutorial_progress WHERE user_id=$1', [
          userId,
        ])
      ).rows,
      history: (
        await pool.query(
          'SELECT match_id,game,score,bot,rated,created_at FROM match_results WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
          [userId],
        )
      ).rows,
      ...(own
        ? {
            settings: {
              publicProfile: p.public_profile,
              showOnline: p.show_online,
              invitations: p.invitations,
              timezone: p.timezone,
              preferences: p.preferences,
            },
          }
        : {}),
    };
  }
  app.get('/api/platform/profile', async (req) => {
    const actor = await deps.actorFrom(req.cookies);
    return actor?.userId
      ? { profile: await details(actor.userId, true) }
      : { profile: null, guest: true };
  });
  app.get('/api/platform/profile/:username', async (req) => {
    const { username } = z.object({ username: z.string().max(24) }).parse(req.params),
      actor = await deps.actorFrom(req.cookies);
    const user = (
      await pool.query<{ id: string }>('SELECT id FROM users WHERE username=$1', [
        username.toLowerCase(),
      ])
    ).rows[0];
    if (!user) chessError('NOT_FOUND', 404);
    if (actor?.userId && actor.userId !== user.id && (await blocked(actor.userId, user.id)))
      chessError('PRIVATE_PROFILE', 403);
    return { profile: await details(user.id, actor?.userId === user.id) };
  });
  const preferences = z
    .object({
      sound: z.boolean(),
      animations: z.boolean(),
      board: z.enum(['classic', 'walnut']),
      pieces: z.enum(['solid', 'outline']),
      cards: z.enum(['minimal', 'diagram']).default('minimal'),
      captureEffect: z.boolean().default(true),
    })
    .strict();
  const settings = z
    .object({
      displayName: z.string().trim().max(40),
      bio: z.string().trim().max(500),
      avatar: z.enum(['navy', 'slate', 'rose', 'sage']),
      publicProfile: z.boolean(),
      showOnline: z.boolean(),
      invitations: z.enum(['everyone', 'friends', 'none']),
      timezone: z
        .string()
        .max(80)
        .refine((v) => {
          try {
            new Intl.DateTimeFormat('en', { timeZone: v });
            return true;
          } catch {
            return false;
          }
        }),
      preferences,
    })
    .strict();
  app.post('/api/platform/settings', async (req) => {
    const user = await account(req.cookies),
      v = settings.parse(req.body);
    await pool.query(
      'INSERT INTO user_profiles(user_id,display_name,bio,avatar,public_profile,show_online,invitations,timezone,preferences) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id) DO UPDATE SET display_name=$2,bio=$3,avatar=$4,public_profile=$5,show_online=$6,invitations=$7,timezone=$8,preferences=$9',
      [
        user.userId,
        v.displayName,
        v.bio,
        v.avatar,
        v.publicProfile,
        v.showOnline,
        v.invitations,
        v.timezone,
        JSON.stringify(v.preferences),
      ],
    );
    return { ok: true };
  });
  async function passwordCheck(userId: string, password: string, c: import('pg').PoolClient) {
    const u = (
      await c.query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',
        [userId],
      )
    ).rows[0];
    if (!u || !(await argon2.verify(u.password_hash, password)))
      chessError('INVALID_CREDENTIALS', 401);
  }
  const sensitive = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };
  app.post('/api/platform/password', sensitive, async (req, reply) => {
    const u = await account(req.cookies),
      { currentPassword, newPassword } = z
        .object({ currentPassword: z.string().max(128), newPassword: z.string().min(12).max(128) })
        .strict()
        .parse(req.body);
    const hash = await deps.hashPassword(newPassword),
      c = await pool.connect();
    try {
      await c.query('BEGIN');
      await passwordCheck(u.userId!, currentPassword, c);
      await c.query('UPDATE users SET password_hash=$2 WHERE id=$1', [u.userId, hash]);
      await c.query('DELETE FROM sessions WHERE user_id=$1', [u.userId]);
      await c.query("DELETE FROM auth_tokens WHERE user_id=$1 AND purpose='reset'", [u.userId]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    deps.clearSession(reply);
    return { ok: true };
  });
  app.post('/api/platform/delete-account', sensitive, async (req, reply) => {
    const u = await account(req.cookies),
      { password } = z
        .object({ password: z.string().max(128) })
        .strict()
        .parse(req.body);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await passwordCheck(u.userId!, password, c);
      for (const table of ['chess_participants', 'board_participants'])
        await c.query(
          `UPDATE ${table} SET identity=$2,display_name='Deleted player' WHERE user_id=$1`,
          [u.userId, `deleted:${u.userId}`],
        );
      await c.query('DELETE FROM users WHERE id=$1', [u.userId]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    deps.clearSession(reply);
    return { ok: true };
  });
  app.get('/api/platform/leaderboards', async (req) => {
    const { pool: ratingPool } = z
      .object({
        pool: z
          .enum(['chess:bullet', 'chess:blitz', 'chess:rapid', 'checkers', 'wayline'])
          .default('chess:rapid'),
      })
      .parse(req.query);
    return {
      players: (
        await pool.query(
          "SELECT u.username,COALESCE(NULLIF(p.display_name,''),u.username) name,p.avatar,r.rating,r.deviation,r.games FROM ratings r JOIN users u ON u.id=r.user_id LEFT JOIN user_profiles p ON p.user_id=u.id WHERE r.pool=$1 AND r.games>0 AND COALESCE(p.public_profile,true) ORDER BY r.rating DESC LIMIT 100",
          [ratingPool],
        )
      ).rows,
      season: (
        await pool.query(
          "SELECT u.username,COALESCE(sum(e.amount),0)::int points FROM experience e JOIN users u ON u.id=e.user_id LEFT JOIN user_profiles p ON p.user_id=u.id WHERE e.created_at>=date_trunc('month',now()) AND COALESCE(p.public_profile,true) GROUP BY u.username ORDER BY points DESC LIMIT 100",
        )
      ).rows,
    };
  });
  const targetSchema = z.object({ username: z.string().max(24) }).strict();
  const target = async (body: unknown) => {
    const { username } = targetSchema.parse(body);
    const u = (
      await pool.query<{ id: string }>('SELECT id FROM users WHERE username=$1', [
        username.toLowerCase(),
      ])
    ).rows[0];
    if (!u) chessError('NOT_FOUND', 404);
    return u.id;
  };
  const blocked = async (a: string, b: string) =>
    !!(
      await pool.query(
        'SELECT 1 FROM blocks WHERE (owner=$1 AND target=$2) OR (owner=$2 AND target=$1)',
        [a, b],
      )
    ).rowCount;
  app.get('/api/platform/search', async (req) => {
    const u = await account(req.cookies),
      { q } = z.object({ q: z.string().trim().min(2).max(24) }).parse(req.query);
    return {
      players: (
        await pool.query(
          'SELECT u.username,p.display_name,p.avatar FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.username LIKE $1 AND u.id<>$2 AND COALESCE(p.public_profile,true) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.owner=$2 AND b.target=u.id) OR(b.target=$2 AND b.owner=u.id)) ORDER BY u.username LIMIT 20',
          [q.toLowerCase().replace(/[%_]/g, '') + '%', u.userId],
        )
      ).rows,
    };
  });
  app.get('/api/platform/friends', async (req) => {
    const u = await account(req.cookies);
    return {
      friends: (
        await pool.query(
          "SELECT u.username,p.avatar,f.status,f.sender=$1 outgoing,CASE WHEN p.show_online AND f.status='accepted' THEN COALESCE(p.last_seen>now()-interval '90 seconds',false) ELSE NULL END online,COALESCE(NULLIF(p.display_name,''),u.username) name FROM friendships f JOIN users u ON u.id=CASE WHEN f.sender=$1 THEN f.receiver ELSE f.sender END LEFT JOIN user_profiles p ON p.user_id=u.id WHERE f.sender=$1 OR f.receiver=$1 ORDER BY f.created_at DESC",
          [u.userId],
        )
      ).rows,
      blocks: (
        await pool.query(
          'SELECT u.username FROM blocks b JOIN users u ON u.id=b.target WHERE b.owner=$1',
          [u.userId],
        )
      ).rows,
    };
  });
  app.post('/api/platform/presence', async (req) => {
    const u = await account(req.cookies);
    await pool.query(
      'UPDATE user_profiles SET last_seen=now() WHERE user_id=$1 AND show_online=true',
      [u.userId],
    );
    return { ok: true };
  });
  app.get('/api/platform/friends/:username/history', async (req) => {
    const u = await account(req.cookies);
    const { username } = z.object({ username: z.string().min(2).max(24) }).parse(req.params);
    const friend = (
      await pool.query(
        "SELECT u.id FROM users u JOIN friendships f ON (f.sender=u.id AND f.receiver=$1) OR(f.receiver=u.id AND f.sender=$1) WHERE u.username=$2 AND f.status='accepted'",
        [u.userId, username],
      )
    ).rows[0];
    if (!friend) chessError('NOT_FOUND', 404);
    return {
      matches: (
        await pool.query(
          'SELECT match_id,game,score,created_at FROM match_results WHERE user_id=$1 AND opponent_id=$2 ORDER BY created_at DESC LIMIT 30',
          [u.userId, friend.id],
        )
      ).rows,
    };
  });
  app.post('/api/platform/friends/request', async (req) => {
    const u = await account(req.cookies),
      id = await target(req.body);
    if (id === u.userId || (await blocked(u.userId!, id))) chessError('FORBIDDEN', 403);
    const r = await pool.query(
      "INSERT INTO friendships(sender,receiver,status) VALUES($1,$2,'pending') ON CONFLICT DO NOTHING RETURNING sender",
      [u.userId, id],
    );
    if (r.rowCount)
      await pool.query(
        "INSERT INTO notifications(user_id,kind,sender,payload) VALUES($1,'friend_request',$2,$3)",
        [id, u.userId, JSON.stringify({ username: u.name })],
      );
    return { ok: true };
  });
  app.post('/api/platform/friends/respond', async (req) => {
    const u = await account(req.cookies),
      { username, accept } = z
        .object({ username: z.string().max(24), accept: z.boolean() })
        .strict()
        .parse(req.body),
      id = await target({ username });
    if (accept && !(await blocked(u.userId!, id)))
      await pool.query(
        "UPDATE friendships SET status='accepted' WHERE sender=$1 AND receiver=$2 AND status='pending'",
        [id, u.userId],
      );
    else
      await pool.query(
        "DELETE FROM friendships WHERE sender=$1 AND receiver=$2 AND status='pending'",
        [id, u.userId],
      );
    return { ok: true };
  });
  app.post('/api/platform/friends/remove', async (req) => {
    const u = await account(req.cookies),
      id = await target(req.body);
    await pool.query(
      'DELETE FROM friendships WHERE (sender=$1 AND receiver=$2) OR(sender=$2 AND receiver=$1)',
      [u.userId, id],
    );
    return { ok: true };
  });
  app.post('/api/platform/block', async (req) => {
    const u = await account(req.cookies),
      { username, block } = z
        .object({ username: z.string().max(24), block: z.boolean() })
        .strict()
        .parse(req.body),
      id = await target({ username });
    if (id === u.userId) chessError('FORBIDDEN', 403);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      if (block) {
        await c.query('INSERT INTO blocks(owner,target) VALUES($1,$2) ON CONFLICT DO NOTHING', [
          u.userId,
          id,
        ]);
        await c.query(
          'DELETE FROM friendships WHERE (sender=$1 AND receiver=$2) OR(sender=$2 AND receiver=$1)',
          [u.userId, id],
        );
        await c.query(
          'DELETE FROM notifications WHERE (user_id=$1 AND sender=$2) OR(user_id=$2 AND sender=$1)',
          [u.userId, id],
        );
      } else await c.query('DELETE FROM blocks WHERE owner=$1 AND target=$2', [u.userId, id]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
    return { ok: true };
  });
  app.get('/api/platform/notifications', async (req) => {
    const u = await account(req.cookies);
    return {
      notifications: (
        await pool.query(
          'SELECT n.id,n.kind,n.payload,n.read,n.created_at,u.username FROM notifications n LEFT JOIN users u ON u.id=n.sender WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 50',
          [u.userId],
        )
      ).rows,
    };
  });
  app.post('/api/platform/notifications/read', async (req) => {
    const u = await account(req.cookies),
      { id } = z.object({ id: z.uuid() }).strict().parse(req.body);
    await pool.query('UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2', [
      id,
      u.userId,
    ]);
    return { ok: true };
  });
  app.post('/api/platform/invite', async (req) => {
    const u = await account(req.cookies),
      v = z
        .object({
          username: z.string().max(24),
          game: z.enum(['chess', 'checkers', 'wayline']),
          invite: z.string().regex(/^[a-f0-9]{48}$/),
        })
        .strict()
        .parse(req.body),
      id = await target({ username: v.username });
    if (id === u.userId || (await blocked(u.userId!, id))) chessError('FORBIDDEN', 403);
    const p = (await pool.query('SELECT invitations FROM user_profiles WHERE user_id=$1', [id]))
      .rows[0];
    const permissions = p?.invitations ?? 'friends';
    const friends = !!(
      await pool.query(
        "SELECT 1 FROM friendships WHERE status='accepted' AND ((sender=$1 AND receiver=$2) OR(sender=$2 AND receiver=$1))",
        [u.userId, id],
      )
    ).rowCount;
    if (permissions === 'none' || (permissions === 'friends' && !friends))
      chessError('FORBIDDEN', 403);
    const table = v.game === 'chess' ? 'chess_matches' : 'board_matches',
      participants = v.game === 'chess' ? 'chess_participants' : 'board_participants';
    const { createHash } = await import('node:crypto');
    const own = await pool.query(
      `SELECT 1 FROM ${table} m JOIN ${participants} p ON p.match_id=m.id WHERE m.invite_hash=$1 AND p.user_id=$2 AND m.status='waiting'${v.game === 'chess' ? '' : ' AND m.game=$3'}`,
      [
        createHash('sha256').update(v.invite).digest('hex'),
        u.userId,
        ...(v.game === 'chess' ? [] : [v.game]),
      ],
    );
    if (!own.rowCount) chessError('INVALID_INVITE', 403);
    await pool.query(
      "INSERT INTO notifications(user_id,kind,sender,payload) VALUES($1,'game_invite',$2,$3)",
      [id, u.userId, JSON.stringify({ game: v.game, invite: v.invite })],
    );
    return { ok: true };
  });
}
