import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from './database';
import { chessError, type Actor } from './chess-service';
import { timeControls, type CreateChess } from '../../../packages/shared/src/chess-contracts';
import {
  createBoardSchema,
  boardCommandSchema,
  type BoardView,
  type BoardCommand,
} from '../../../packages/shared/src/board-contracts';
import { checkersEngine } from '../../../packages/games/checkers/engine';
import { createWayline, waylineCards, waylineEngine } from '../../../packages/games/wayline/engine';
import {
  boardActions,
  applyBoard,
  boardOutcome,
  type BoardState,
  type BoardAction,
} from '../../../packages/games/board-engine';
import { recordResult } from './progress';
import type { Outcome } from '../../../packages/shared/src/contracts';
type Row = {
  id: string;
  rules_version: string;
  game: 'checkers' | 'wayline';
  state: BoardState;
  version: number;
  status: BoardView['status'];
  mode: BoardView['mode'];
  difficulty: CreateChess['difficulty'];
  time_control: CreateChess['timeControl'];
  white_ms: number;
  black_ms: number;
  turn_started_at: Date | null;
  result: Outcome | null;
  draw_offer: 'w' | 'b' | null;
  rematch_id: string | null;
  rematch_requested_side: 'w' | 'b' | null;
  ranked: boolean;
};
type Seat = { side: 'w' | 'b'; identity: string; display_name: string; user_id: string | null };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function tx<T>(fn: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const value = await fn(c);
    await c.query('COMMIT');
    return value;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
const seats = async (c: PoolClient, id: string) =>
  (await c.query<Seat>('SELECT * FROM board_participants WHERE match_id=$1', [id])).rows;
function settle(row: Row) {
  if (row.status !== 'active' || row.time_control === 'none' || !row.turn_started_at) return;
  const side = row.state.turn,
    key = side === 'w' ? 'white_ms' : 'black_ms';
  row[key] = Math.max(0, Number(row[key]) - (Date.now() - row.turn_started_at.getTime()));
  row.turn_started_at = new Date();
  if (row[key] <= 0) {
    row.status = 'finished';
    row.result = { winner: side === 'w' ? 'second' : 'first', reason: 'timeout' };
    row.draw_offer = null;
  }
}
async function save(c: PoolClient, r: Row) {
  await c.query(
    'UPDATE board_matches SET state=$2,version=$3,status=$4,white_ms=$5,black_ms=$6,turn_started_at=$7,result=$8,draw_offer=$9,rematch_id=$10,updated_at=now() WHERE id=$1',
    [
      r.id,
      JSON.stringify(r.state),
      r.version,
      r.status,
      r.white_ms,
      r.black_ms,
      r.turn_started_at,
      r.result ? JSON.stringify(r.result) : null,
      r.draw_offer,
      r.rematch_id,
    ],
  );
  await recordResult(c, r.game, r);
}
async function create(
  c: PoolClient,
  a: Actor,
  input: z.infer<typeof createBoardSchema>,
  other?: Actor,
  ranked = false,
) {
  const control = timeControls[input.timeControl],
    side = input.side === 'random' ? (randomBytes(1)[0] % 2 ? 'w' : 'b') : input.side,
    invite = randomBytes(24).toString('hex'),
    active = input.mode === 'bot' || !!other;
  const deck = waylineCards.map((c) => c.id);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const state =
    input.game === 'checkers' ? checkersEngine.initialState() : createWayline(deck.slice(0, 5));
  const r = (
    await c.query<Row>(
      'INSERT INTO board_matches(game,state,status,mode,difficulty,time_control,white_ms,black_ms,turn_started_at,invite_hash,ranked,rules_version) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11) RETURNING *',
      [
        input.game,
        JSON.stringify(state),
        active ? 'active' : 'waiting',
        input.mode,
        input.difficulty,
        input.timeControl,
        control.initial,
        active ? new Date() : null,
        input.mode === 'private' ? hash(invite) : null,
        ranked,
        input.game === 'checkers' ? checkersEngine.rulesVersion : waylineEngine.rulesVersion,
      ],
    )
  ).rows[0];
  await c.query(
    'INSERT INTO board_participants(match_id,side,identity,display_name,user_id) VALUES($1,$2,$3,$4,$5)',
    [r.id, side, a.identity, a.name, a.userId],
  );
  if (input.mode === 'bot') other = { identity: `bot:${r.id}`, name: 'Bot', userId: null };
  if (other)
    await c.query(
      'INSERT INTO board_participants(match_id,side,identity,display_name,user_id) VALUES($1,$2,$3,$4,$5)',
      [r.id, side === 'w' ? 'b' : 'w', other.identity, other.name, other.userId],
    );
  return { row: r, invite };
}
export async function registerBoards(
  app: FastifyInstance,
  io: Server,
  actorFrom: (cookies: Record<string, string | undefined>) => Promise<Actor | null>,
) {
  const online = new Map<string, Map<string, Set<string>>>(),
    bots = new Set<string>(),
    workers = new Set<Worker>();
  let closed = false,
    maintaining = false;
  const actor = async (cookies: Record<string, string | undefined>) => {
    const a = await actorFrom(cookies);
    if (!a) chessError('UNAUTHORIZED', 401);
    return a;
  };
  const notify = (id: string) => io.to(`board:${id}`).emit('board:changed', { id });
  async function read(id: string, a: Actor): Promise<BoardView> {
    z.uuid().parse(id);
    let timedOut = false;
    const result = await tx(async (c) => {
      const r = (await c.query<Row>('SELECT * FROM board_matches WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!r) chessError('NOT_FOUND', 404);
      if (
        r.rules_version !==
        (r.game === 'checkers' ? checkersEngine.rulesVersion : waylineEngine.rulesVersion)
      )
        chessError('RULESET_UNAVAILABLE', 503);
      const p = await seats(c, id),
        seat = p.find((p) => p.identity === a.identity);
      if (!seat) chessError('NOT_A_PARTICIPANT', 403);
      const status = r.status;
      settle(r);
      if (status !== r.status) {
        r.version++;
        await save(c, r);
        await c.query(
          'INSERT INTO board_events(match_id,action_id,actor,sequence,payload) VALUES($1,$2,$3,$4,$5)',
          [id, randomUUID(), 'server', r.version, JSON.stringify({ type: 'timeout' })],
        );
        timedOut = true;
      }
      return {
        id,
        game: r.game,
        state: r.state,
        version: r.version,
        status: r.status,
        mode: r.mode,
        difficulty: r.difficulty,
        timeControl: r.time_control,
        whiteMs: Number(r.white_ms),
        blackMs: Number(r.black_ms),
        turnStartedAt: r.turn_started_at?.getTime() ?? null,
        serverNow: Date.now(),
        white: p.find((p) => p.side === 'w')?.display_name ?? null,
        black: p.find((p) => p.side === 'b')?.display_name ?? null,
        yourSide: seat.side,
        result: r.result,
        drawOffer: r.draw_offer,
        rematchId: r.rematch_id,
        ranked: r.ranked,
        rulesVersion: r.rules_version,
        connected: {
          w: p.some(
            (p) =>
              p.side === 'w' &&
              (p.identity.startsWith('bot:') || !!online.get(id)?.get(p.identity)?.size),
          ),
          b: p.some(
            (p) =>
              p.side === 'b' &&
              (p.identity.startsWith('bot:') || !!online.get(id)?.get(p.identity)?.size),
          ),
        },
      };
    });
    if (timedOut) notify(id);
    return result;
  }
  async function command(id: string, a: Actor, input: BoardCommand) {
    z.uuid().parse(id);
    await tx(async (c) => {
      const r = (await c.query<Row>('SELECT * FROM board_matches WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!r) chessError('NOT_FOUND', 404);
      if (
        r.rules_version !==
        (r.game === 'checkers' ? checkersEngine.rulesVersion : waylineEngine.rulesVersion)
      )
        chessError('RULESET_UNAVAILABLE', 503);
      const p = await seats(c, id),
        seat = p.find((p) => p.identity === a.identity);
      if (!seat) chessError('NOT_A_PARTICIPANT', 403);
      const duplicate = (
        await c.query<{ actor: string }>(
          'SELECT actor FROM board_events WHERE match_id=$1 AND action_id=$2',
          [id, input.actionId],
        )
      ).rows[0];
      if (duplicate) {
        if (duplicate.actor !== a.identity) chessError('ACTION_ID_CONFLICT', 409);
        return;
      }
      if (r.status !== 'active') chessError('MATCH_NOT_ACTIVE', 409);
      if (input.expectedVersion !== r.version) chessError('STALE_VERSION', 409);
      settle(r);
      if (!r.result) {
        const action = input.action;
        if (action.type === 'move') {
          if (seat.side !== r.state.turn) chessError('NOT_YOUR_TURN', 409);
          if (
            !boardActions(r.game, r.state).some(
              (m) => JSON.stringify(m) === JSON.stringify(action.payload),
            )
          )
            chessError('ILLEGAL_MOVE');
          r.state = applyBoard(r.game, r.state, action.payload as BoardAction);
          const key = seat.side === 'w' ? 'white_ms' : 'black_ms';
          r[key] = Number(r[key]) + timeControls[r.time_control].increment;
          r.turn_started_at = new Date();
          r.draw_offer = null;
          r.result = boardOutcome(r.game, r.state);
        } else if (action.type === 'resign')
          r.result = { winner: seat.side === 'w' ? 'second' : 'first', reason: 'resignation' };
        else if (action.type === 'offer_draw') {
          if (r.mode === 'bot') chessError('BOT_NO_DRAW');
          r.draw_offer = seat.side;
        } else if (action.type === 'accept_draw') {
          if (!r.draw_offer || r.draw_offer === seat.side) chessError('NO_DRAW_OFFER');
          r.result = { winner: null, reason: 'agreement' };
        } else if (action.type === 'decline_draw') {
          if (!r.draw_offer || r.draw_offer === seat.side) chessError('NO_DRAW_OFFER');
          r.draw_offer = null;
        }
      }
      if (r.result) {
        r.status = 'finished';
        r.draw_offer = null;
      }
      r.version++;
      await save(c, r);
      await c.query(
        'INSERT INTO board_events(match_id,action_id,actor,sequence,payload) VALUES($1,$2,$3,$4,$5)',
        [id, input.actionId, a.identity, r.version, JSON.stringify(input.action)],
      );
    });
    notify(id);
    void runBot(id);
    return read(id, a);
  }
  async function runBot(id: string) {
    if (closed || bots.has(id)) return;
    bots.add(id);
    try {
      const r = (await pool.query<Row>('SELECT * FROM board_matches WHERE id=$1', [id])).rows[0];
      if (!r || r.status !== 'active' || r.mode !== 'bot') return;
      const p = (await pool.query<Seat>('SELECT * FROM board_participants WHERE match_id=$1', [id]))
          .rows,
        seat = p.find((p) => p.side === r.state.turn);
      if (!seat?.identity.startsWith('bot:')) return;
      const dev = import.meta.url.endsWith('.ts');
      const move = await new Promise<BoardAction | null>((resolve, reject) => {
        const w = new Worker(
          new URL(dev ? './board-bot-worker.ts' : './board-bot-worker.js', import.meta.url),
          {
            workerData: { game: r.game, state: r.state, difficulty: r.difficulty },
            ...(dev ? { execArgv: ['--import', 'tsx'] } : {}),
          },
        );
        workers.add(w);
        const deadline = setTimeout(() => {
          workers.delete(w);
          void w.terminate();
          reject(new Error('BOT_TIMEOUT'));
        }, 6000);
        w.once('message', (move: BoardAction) => {
          clearTimeout(deadline);
          workers.delete(w);
          resolve(move);
          void w.terminate();
        });
        w.once('error', (e) => {
          clearTimeout(deadline);
          workers.delete(w);
          reject(e);
        });
        w.once('exit', (code) => {
          clearTimeout(deadline);
          workers.delete(w);
          if (code !== 0) reject(new Error('BOT_EXIT'));
        });
      });
      if (move && !closed)
        await command(
          id,
          { identity: seat.identity, name: 'Bot', userId: null },
          {
            actionId: randomUUID(),
            expectedVersion: r.version,
            action: { type: 'move', payload: move },
          },
        );
    } catch (e) {
      if (
        (e as { publicCode?: string }).publicCode !== 'STALE_VERSION' &&
        (e as { publicCode?: string }).publicCode !== 'MATCH_NOT_ACTIVE'
      )
        app.log.error('Board bot failed');
    } finally {
      bots.delete(id);
    }
  }
  app.post('/api/board/matches', async (req) => {
    const a = await actor(req.cookies),
      v = createBoardSchema.parse(req.body),
      r = await tx((c) => create(c, a, v));
    void runBot(r.row.id);
    return { match: await read(r.row.id, a), invite: v.mode === 'private' ? r.invite : null };
  });
  app.get('/api/board/matches/:id', async (req) => {
    const { id } = req.params as { id: string },
      a = await actor(req.cookies);
    const match = await read(id, a);
    void runBot(id);
    return { match };
  });
  app.post('/api/board/join', async (req) => {
    const a = await actor(req.cookies),
      { invite } = z
        .object({ invite: z.string().regex(/^[a-f0-9]{48}$/) })
        .strict()
        .parse(req.body);
    const id = await tx(async (c) => {
      const r = (
        await c.query<Row>('SELECT * FROM board_matches WHERE invite_hash=$1 FOR UPDATE', [
          hash(invite),
        ])
      ).rows[0];
      if (!r) chessError('INVALID_INVITE', 404);
      const p = await seats(c, r.id);
      if (p.some((s) => s.identity === a.identity)) return r.id;
      if (r.status !== 'waiting' || p.length !== 1) chessError('ROOM_FULL', 409);
      await c.query(
        'INSERT INTO board_participants(match_id,side,identity,display_name,user_id) VALUES($1,$2,$3,$4,$5)',
        [r.id, p[0].side === 'w' ? 'b' : 'w', a.identity, a.name, a.userId],
      );
      r.status = 'active';
      r.turn_started_at = new Date();
      r.version++;
      await save(c, r);
      return r.id;
    });
    notify(id);
    return { match: await read(id, a) };
  });
  app.post('/api/board/matches/:id/actions', async (req) => ({
    match: await command(
      (req.params as { id: string }).id,
      await actor(req.cookies),
      boardCommandSchema.parse(req.body),
    ),
  }));
  app.post('/api/board/matches/:id/rematch', async (req) => {
    const a = await actor(req.cookies),
      { id } = req.params as { id: string };
    z.uuid().parse(id);
    const next = await tx(async (c) => {
      const r = (await c.query<Row>('SELECT * FROM board_matches WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!r) chessError('NOT_FOUND', 404);
      const p = await seats(c, id),
        seat = p.find((p) => p.identity === a.identity);
      if (!seat) chessError('NOT_A_PARTICIPANT', 403);
      if (r.status !== 'finished') chessError('MATCH_NOT_FINISHED', 409);
      if (r.rematch_id) {
        if (r.rematch_requested_side !== seat.side)
          await c.query(
            "UPDATE board_matches SET status='active',turn_started_at=now(),version=version+1 WHERE id=$1 AND status='waiting'",
            [r.rematch_id],
          );
        return r.rematch_id;
      }
      const other = p.find((p) => p.side !== seat.side)!;
      const result = await create(
        c,
        a,
        {
          game: r.game,
          mode: r.mode,
          difficulty: r.difficulty,
          timeControl: r.time_control,
          side: seat.side === 'w' ? 'b' : 'w',
        },
        r.mode === 'private'
          ? { identity: other.identity, name: other.display_name, userId: other.user_id }
          : undefined,
        false,
      );
      if (r.mode === 'private')
        await c.query(
          "UPDATE board_matches SET status='waiting',turn_started_at=NULL WHERE id=$1",
          [result.row.id],
        );
      await c.query(
        'UPDATE board_matches SET rematch_id=$2,rematch_requested_side=$3 WHERE id=$1',
        [id, result.row.id, seat.side],
      );
      return result.row.id;
    });
    notify(id);
    notify(next);
    void runBot(next);
    return { match: await read(next, a) };
  });
  app.post('/api/board/queue', async (req) => {
    const a = await actor(req.cookies),
      v = z
        .object({
          game: z.enum(['checkers', 'wayline']),
          timeControl: z.enum(['none', '1+0', '3+0', '3+2', '5+0', '10+0', '15+10']),
          ranked: z.boolean().default(false),
        })
        .strict()
        .parse(req.body);
    if (v.ranked) {
      if (!a.userId || v.timeControl === 'none') chessError('RANKED_REQUIRES_ACCOUNT', 403);
      const u = (await pool.query('SELECT email_verified FROM users WHERE id=$1', [a.userId]))
        .rows[0];
      if (!u?.email_verified) chessError('EMAIL_NOT_VERIFIED', 403);
    }
    const id = await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('board-queue'))");
      await c.query("DELETE FROM board_queue WHERE heartbeat_at<now()-interval '45 seconds'");
      const own = (
        await c.query('SELECT matched_id FROM board_queue WHERE identity=$1', [a.identity])
      ).rows[0];
      if (own?.matched_id) return own.matched_id as string;
      await c.query(
        'INSERT INTO board_queue(identity,game,display_name,user_id,time_control,ranked) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(identity) DO UPDATE SET heartbeat_at=now(),game=$2,time_control=$5,ranked=$6',
        [a.identity, v.game, a.name, a.userId, v.timeControl, v.ranked],
      );
      const candidates = (
        await c.query(
          'SELECT * FROM board_queue WHERE game=$1 AND time_control=$2 AND ranked=$3 AND identity<>$4 AND matched_id IS NULL ORDER BY queued_at',
          [v.game, v.timeControl, v.ranked, a.identity],
        )
      ).rows;
      for (const candidate of candidates) {
        if (a.userId && candidate.user_id) {
          if (
            (
              await c.query(
                'SELECT 1 FROM blocks WHERE (owner=$1 AND target=$2) OR(owner=$2 AND target=$1)',
                [a.userId, candidate.user_id],
              )
            ).rowCount
          )
            continue;
          if (v.ranked) {
            const ratings = (
              await c.query<{ user_id: string; rating: number }>(
                'SELECT user_id,rating FROM ratings WHERE pool=$1 AND user_id=ANY($2::uuid[])',
                [v.game, [a.userId, candidate.user_id]],
              )
            ).rows;
            const mine = ratings.find((r) => r.user_id === a.userId)?.rating ?? 1500,
              theirs = ratings.find((r) => r.user_id === candidate.user_id)?.rating ?? 1500,
              range = 150 + ((Date.now() - new Date(candidate.queued_at).getTime()) / 1000) * 5;
            if (Math.abs(mine - theirs) > range) continue;
          }
        }
        const r = await create(
          c,
          a,
          {
            game: v.game,
            mode: 'private',
            timeControl: v.timeControl,
            side: 'random',
            difficulty: 'intermediate',
          },
          { identity: candidate.identity, name: candidate.display_name, userId: candidate.user_id },
          v.ranked,
        );
        await c.query('UPDATE board_queue SET matched_id=$1 WHERE identity=ANY($2::text[])', [
          r.row.id,
          [a.identity, candidate.identity],
        ]);
        return r.row.id;
      }
      return null;
    });
    return id ? { match: await read(id, a) } : { waiting: true };
  });
  app.post('/api/board/queue/cancel', async (req) => {
    const a = await actor(req.cookies);
    await pool.query('DELETE FROM board_queue WHERE identity=$1', [a.identity]);
    return { ok: true };
  });
  io.on('connection', (socket) => {
    let joined: { id: string; identity: string } | null = null,
      count = 0,
      start = Date.now();
    const cookies = () =>
      Object.fromEntries(
        (socket.request.headers.cookie ?? '').split(';').map((v) => v.trim().split('=')),
      );
    const remove = () => {
      if (joined) {
        online.get(joined.id)?.get(joined.identity)?.delete(socket.id);
        notify(joined.id);
      }
    };
    const ack = async (callback: (v: unknown) => void, fn: () => Promise<BoardView>) => {
      try {
        if (Date.now() - start > 60000) {
          start = Date.now();
          count = 0;
        }
        if (++count > 90) chessError('TOO_MANY_REQUESTS', 429);
        callback({ match: await fn() });
      } catch (e) {
        callback({
          error:
            (e as { publicCode?: string }).publicCode ??
            (e instanceof z.ZodError ? 'INVALID_INPUT' : 'SERVICE_UNAVAILABLE'),
        });
      }
    };
    socket.on('board:join', (id: unknown, callback: (v: unknown) => void) => {
      if (typeof callback !== 'function') return;
      void ack(callback, async () => {
        const a = await actor(cookies()),
          matchId = z.uuid().parse(id);
        await read(matchId, a);
        remove();
        if (joined) await socket.leave(`board:${joined.id}`);
        joined = { id: matchId, identity: a.identity };
        if (!online.has(matchId)) online.set(matchId, new Map());
        if (!online.get(matchId)!.has(a.identity)) online.get(matchId)!.set(a.identity, new Set());
        online.get(matchId)!.get(a.identity)!.add(socket.id);
        await socket.join(`board:${matchId}`);
        notify(matchId);
        void runBot(matchId);
        return read(matchId, a);
      });
    });
    socket.on('board:action', (v: unknown, callback: (v: unknown) => void) => {
      if (typeof callback !== 'function') return;
      void ack(callback, async () => {
        if (!joined) chessError('NOT_A_PARTICIPANT', 403);
        return command(joined.id, await actor(cookies()), boardCommandSchema.parse(v));
      });
    });
    socket.on('disconnect', remove);
  });
  const timer = setInterval(() => {
    if (closed || maintaining) return;
    maintaining = true;
    void pool
      .query<{ id: string }>(
        "SELECT id FROM board_matches WHERE status='active' AND (mode='bot' OR(time_control<>'none' AND turn_started_at+(CASE WHEN state->>'turn'='w' THEN white_ms ELSE black_ms END)*interval '1 millisecond'<=now())) LIMIT 100",
      )
      .then(async (rows) => {
        for (const r of rows.rows) {
          const p = (
            await pool.query<Seat>('SELECT * FROM board_participants WHERE match_id=$1 LIMIT 1', [
              r.id,
            ])
          ).rows[0];
          if (p)
            await read(r.id, { identity: p.identity, name: p.display_name, userId: p.user_id });
          void runBot(r.id);
        }
      })
      .catch(() => {
        if (!closed) app.log.error('Board maintenance failed');
      })
      .finally(() => {
        maintaining = false;
      });
  }, 2000);
  timer.unref();
  app.addHook('preClose', async () => {
    closed = true;
    clearInterval(timer);
    await Promise.all([...workers].map((w) => w.terminate()));
  });
  return { read, command };
}
