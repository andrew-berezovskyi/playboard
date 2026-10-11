import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import { pool } from './database';
import { config, origins } from './config';
import {
  chessEngine,
  loadChess,
  automaticOutcome,
  drawClaims,
  canPossiblyMate,
  type ChessState,
  type ChessAction,
} from '../../../packages/games/chess/engine';
import {
  createChessSchema,
  chessCommandSchema,
  timeControls,
  type CreateChess,
  type ChessCommand,
  type MatchView,
  type MatchAck,
} from '../../../packages/shared/src/chess-contracts';
import type { Outcome } from '../../../packages/shared/src/contracts';
import { recordResult } from './progress';

export type Actor = { identity: string; name: string; userId: string | null };
type Authenticate = (cookies: Record<string, string | undefined>) => Promise<Actor | null>;
type Row = {
  id: string;
  rules_version: string;
  state: ChessState;
  version: number;
  status: MatchView['status'];
  mode: MatchView['mode'];
  difficulty: CreateChess['difficulty'];
  time_control: CreateChess['timeControl'];
  white_ms: string | number;
  black_ms: string | number;
  turn_started_at: Date | null;
  result: Outcome | null;
  draw_offer: 'w' | 'b' | null;
  rematch_id: string | null;
  rematch_requested_side: 'w' | 'b' | null;
  ranked: boolean;
};
type Participant = {
  identity: string;
  side: 'w' | 'b';
  display_name: string;
  user_id: string | null;
};
const tokenHash = (v: string) => createHash('sha256').update(v).digest('hex');
export function chessError(code: string, statusCode = 400): never {
  throw Object.assign(new Error(code), { statusCode, publicCode: code });
}
const idSchema = z.uuid();
const guestCookie = config.NODE_ENV === 'production' ? '__Host-plyvra_guest' : 'plyvra_guest';
const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 86400 * 7,
};
async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
async function participants(c: PoolClient, id: string) {
  return (await c.query<Participant>('SELECT * FROM chess_participants WHERE match_id=$1', [id]))
    .rows;
}
function settleClock(row: Row, now: number) {
  if (row.status !== 'active' || row.time_control === 'none' || !row.turn_started_at) return;
  const chess = loadChess(row.state),
    side = chess.turn(),
    elapsed = Math.max(0, now - row.turn_started_at.getTime());
  if (side === 'w') row.white_ms = Math.max(0, Number(row.white_ms) - elapsed);
  else row.black_ms = Math.max(0, Number(row.black_ms) - elapsed);
  row.turn_started_at = new Date(now);
  if (Number(side === 'w' ? row.white_ms : row.black_ms) <= 0) {
    const other = side === 'w' ? 'b' : 'w';
    row.status = 'finished';
    row.result = {
      winner: canPossiblyMate(chess, other) ? (other === 'w' ? 'first' : 'second') : null,
      reason: 'timeout',
    };
    row.draw_offer = null;
  }
}
async function save(c: PoolClient, row: Row) {
  await c.query(
    'UPDATE chess_matches SET state=$2,version=$3,status=$4,white_ms=$5,black_ms=$6,turn_started_at=$7,result=$8,draw_offer=$9,rematch_id=$10,updated_at=now() WHERE id=$1',
    [
      row.id,
      JSON.stringify(row.state),
      row.version,
      row.status,
      row.white_ms,
      row.black_ms,
      row.turn_started_at,
      row.result ? JSON.stringify(row.result) : null,
      row.draw_offer,
      row.rematch_id,
    ],
  );
  await recordResult(c, 'chess', row);
}
async function createRow(c: PoolClient, actor: Actor, input: CreateChess, opponent?: Actor) {
  const side = input.side === 'random' ? (randomBytes(1)[0] % 2 ? 'w' : 'b') : input.side;
  const invite = randomBytes(24).toString('hex');
  const control = timeControls[input.timeControl];
  const active = input.mode === 'bot' || !!opponent;
  const row = (
    await c.query<Row>(
      'INSERT INTO chess_matches(state,status,mode,difficulty,time_control,white_ms,black_ms,turn_started_at,invite_hash) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8) RETURNING *',
      [
        JSON.stringify(chessEngine.initialState()),
        active ? 'active' : 'waiting',
        input.mode,
        input.difficulty,
        input.timeControl,
        control.initial,
        active ? new Date() : null,
        input.mode === 'private' ? tokenHash(invite) : null,
      ],
    )
  ).rows[0];
  await c.query(
    'INSERT INTO chess_participants(match_id,side,identity,display_name,user_id) VALUES($1,$2,$3,$4,$5)',
    [row.id, side, actor.identity, actor.name, actor.userId],
  );
  const other = side === 'w' ? 'b' : 'w';
  if (input.mode === 'bot')
    await c.query(
      'INSERT INTO chess_participants(match_id,side,identity,display_name) VALUES($1,$2,$3,$4)',
      [row.id, other, `bot:${row.id}`, 'Bot'],
    );
  else if (opponent)
    await c.query(
      'INSERT INTO chess_participants(match_id,side,identity,display_name,user_id) VALUES($1,$2,$3,$4,$5)',
      [row.id, other, opponent.identity, opponent.name, opponent.userId],
    );
  return { row, invite };
}

export async function registerChess(app: FastifyInstance, authenticate: Authenticate) {
  const online = new Map<string, Map<string, Set<string>>>();
  const botRunning = new Set<string>();
  let closed = false;
  const activeWorkers = new Set<Worker>();
  const io = new SocketServer(app.server, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 16384,
    allowRequest: (req, cb) => cb(null, !!req.headers.origin && origins.has(req.headers.origin)),
    cors: { origin: [...origins], credentials: true },
  });
  async function actorFrom(cookies: Record<string, string | undefined>) {
    const account = await authenticate(cookies);
    if (account) return account;
    const token = cookies[guestCookie];
    if (token && /^[a-f0-9]{64}$/.test(token))
      return { identity: `guest:${tokenHash(token)}`, name: 'Guest', userId: null };
    return null;
  }
  async function requireActor(cookies: Record<string, string | undefined>) {
    const actor = await actorFrom(cookies);
    if (!actor) chessError('UNAUTHORIZED', 401);
    return actor;
  }
  async function read(id: string, actor: Actor): Promise<MatchView> {
    idSchema.parse(id);
    let timedOut = false;
    const view: MatchView = await transaction(async (c) => {
      const row = (await c.query<Row>('SELECT * FROM chess_matches WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!row) chessError('NOT_FOUND', 404);
      if (row.rules_version !== chessEngine.rulesVersion) chessError('RULESET_UNAVAILABLE', 503);
      const seats = await participants(c, id),
        seat = seats.find((p) => p.identity === actor.identity);
      if (!seat) chessError('NOT_A_PARTICIPANT', 403);
      const before = row.status;
      settleClock(row, Date.now());
      if (before !== row.status) {
        row.version++;
        await save(c, row);
        await c.query(
          'INSERT INTO chess_events(match_id,action_id,actor,sequence,payload) VALUES($1,$2,$3,$4,$5)',
          [row.id, randomUUID(), 'server', row.version, JSON.stringify({ type: 'timeout' })],
        );
        timedOut = true;
      }
      const presence = online.get(id);
      return {
        id,
        state: row.state,
        version: row.version,
        status: row.status,
        mode: row.mode,
        difficulty: row.difficulty,
        timeControl: row.time_control,
        whiteMs: Number(row.white_ms),
        blackMs: Number(row.black_ms),
        turnStartedAt: row.turn_started_at?.getTime() ?? null,
        serverNow: Date.now(),
        white: seats.find((p) => p.side === 'w')?.display_name ?? null,
        black: seats.find((p) => p.side === 'b')?.display_name ?? null,
        yourSide: seat.side,
        result: row.result,
        drawOffer: row.draw_offer,
        rematchId: row.rematch_id,
        ranked: row.ranked,
        rulesVersion: row.rules_version,
        connected: {
          w: seats.some(
            (p) =>
              p.side === 'w' &&
              (p.identity.startsWith('bot:') || !!presence?.get(p.identity)?.size),
          ),
          b: seats.some(
            (p) =>
              p.side === 'b' &&
              (p.identity.startsWith('bot:') || !!presence?.get(p.identity)?.size),
          ),
        },
      };
    });
    if (timedOut) await notify(id);
    return view;
  }
  async function notify(id: string) {
    io.to(id).emit('match:changed', { id });
  }
  async function command(id: string, actor: Actor, input: ChessCommand) {
    idSchema.parse(id);
    await transaction(async (c) => {
      const row = (await c.query<Row>('SELECT * FROM chess_matches WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!row) chessError('NOT_FOUND', 404);
      if (row.rules_version !== chessEngine.rulesVersion) chessError('RULESET_UNAVAILABLE', 503);
      const seats = await participants(c, id),
        seat = seats.find((p) => p.identity === actor.identity);
      if (!seat) chessError('NOT_A_PARTICIPANT', 403);
      const duplicate = (
        await c.query<{ actor: string }>(
          'SELECT actor FROM chess_events WHERE match_id=$1 AND action_id=$2',
          [id, input.actionId],
        )
      ).rows[0];
      if (duplicate) {
        if (duplicate.actor !== actor.identity) chessError('ACTION_ID_CONFLICT', 409);
        return;
      }
      if (row.status !== 'active') chessError('MATCH_NOT_ACTIVE', 409);
      if (row.version !== input.expectedVersion) chessError('STALE_VERSION', 409);
      settleClock(row, Date.now());
      if (!row.result) {
        const chess = loadChess(row.state),
          action = input.action;
        if (action.type === 'move') {
          if (chess.turn() !== seat.side) chessError('NOT_YOUR_TURN', 409);
          const { type: _, ...move } = action;
          void _;
          if (!chessEngine.isLegal(row.state, move)) chessError('ILLEGAL_MOVE');
          row.state = chessEngine.apply(row.state, move);
          row.draw_offer = null;
          if (row.time_control !== 'none') {
            const inc = timeControls[row.time_control].increment;
            if (seat.side === 'w') row.white_ms = Number(row.white_ms) + inc;
            else row.black_ms = Number(row.black_ms) + inc;
          }
          row.result = automaticOutcome(loadChess(row.state));
          if (row.result) row.status = 'finished';
          row.turn_started_at = new Date();
        } else if (action.type === 'resign') {
          row.status = 'finished';
          row.result = { winner: canPossiblyMate(chess, seat.side === 'w' ? 'b' : 'w') ? (seat.side === 'w' ? 'second' : 'first') : null, reason: 'resignation' };
          row.draw_offer = null;
        } else if (action.type === 'offer_draw') {
          if (row.mode === 'bot') chessError('BOT_DRAW_UNAVAILABLE');
          if (row.draw_offer) chessError('DRAW_ALREADY_OFFERED', 409);
          row.draw_offer = seat.side;
        } else if (action.type === 'decline_draw') {
          if (!row.draw_offer || row.draw_offer === seat.side) chessError('NO_DRAW_OFFER');
          row.draw_offer = null;
        } else if (action.type === 'accept_draw') {
          if (!row.draw_offer || row.draw_offer === seat.side) chessError('NO_DRAW_OFFER');
          row.status = 'finished';
          row.result = { winner: null, reason: 'agreement' };
          row.draw_offer = null;
        } else if (action.type === 'claim_draw') {
          if (chess.turn() !== seat.side) chessError('NOT_YOUR_TURN', 409);
          if (action.intendedMove) {
            try {
              chess.move(action.intendedMove);
            } catch {
              chessError('ILLEGAL_MOVE');
            }
          }
          const claims = drawClaims(chess);
          if (!claims.repetition && !claims.fiftyMoves) chessError('DRAW_NOT_CLAIMABLE');
          row.status = 'finished';
          row.result = {
            winner: null,
            reason: claims.repetition ? 'threefold_claim' : 'fifty_move_claim',
          };
          row.draw_offer = null;
        }
      }
      row.version++;
      await c.query(
        'INSERT INTO chess_events(match_id,action_id,actor,sequence,payload) VALUES($1,$2,$3,$4,$5)',
        [id, input.actionId, actor.identity, row.version, JSON.stringify(input.action)],
      );
      await save(c, row);
    });
    await notify(id);
    void runBot(id);
    return read(id, actor);
  }
  async function runBot(id: string) {
    if (closed || botRunning.has(id)) return;
    botRunning.add(id);
    try {
      const row = (await pool.query<Row>('SELECT * FROM chess_matches WHERE id=$1', [id])).rows[0];
      if (!row || row.mode !== 'bot' || row.status !== 'active') return;
      const side = loadChess(row.state).turn(),
        seat = (
          await pool.query<Participant>(
            'SELECT * FROM chess_participants WHERE match_id=$1 AND side=$2',
            [id, side],
          )
        ).rows[0];
      if (!seat?.identity.startsWith('bot:')) return;
      const move = await new Promise<ChessAction | null>((resolve, reject) => {
        const worker = new Worker(new URL('./bot-worker.mjs', import.meta.url), {
          workerData: { fen: row.state.fen, difficulty: row.difficulty },
        });
        activeWorkers.add(worker);
        const deadline = setTimeout(() => {
          void worker.terminate();
          reject(new Error('BOT_TIMEOUT'));
        }, 5000);
        worker.once('message', (result: { move: ChessAction | null }) => {
          clearTimeout(deadline);
          activeWorkers.delete(worker);
          resolve(result.move);
          void worker.terminate();
        });
        worker.once('error', (error) => {
          clearTimeout(deadline);
          activeWorkers.delete(worker);
          reject(error);
        });
        worker.once('exit', (code) => {
          clearTimeout(deadline);
          activeWorkers.delete(worker);
          if (code !== 0) reject(new Error('BOT_EXIT'));
        });
      });
      if (move && !closed)
        await command(
          id,
          { identity: seat.identity, name: 'Bot', userId: null },
          {
            actionId: randomUUID(),
            expectedVersion: row.version,
            action: { type: 'move', ...move },
          },
        );
    } catch (error) {
      if (
        (error as { publicCode?: string }).publicCode !== 'STALE_VERSION' &&
        (error as { publicCode?: string }).publicCode !== 'MATCH_NOT_ACTIVE'
      )
        app.log.error('Bot move could not complete');
    } finally {
      botRunning.delete(id);
    }
  }
  app.post('/api/chess/player', async (req, reply) => {
    let actor = await actorFrom(req.cookies);
    if (!actor) {
      const token = randomBytes(32).toString('hex');
      reply.setCookie(guestCookie, token, cookieOptions);
      actor = { identity: `guest:${tokenHash(token)}`, name: 'Guest', userId: null };
    }
    return { name: actor.name };
  });
  app.post('/api/chess/matches', async (req) => {
    const actor = await requireActor(req.cookies),
      input = createChessSchema.parse(req.body);
    const result = await transaction((c) => createRow(c, actor, input));
    void runBot(result.row.id);
    return {
      match: await read(result.row.id, actor),
      invite: input.mode === 'private' ? result.invite : null,
    };
  });
  app.get('/api/chess/matches/:id', async (req) => {
    const actor = await requireActor(req.cookies),
      { id } = req.params as { id: string };
    const match = await read(id, actor);
    void runBot(id);
    return { match };
  });
  app.get('/api/chess/matches', async (req) => {
    const actor = await requireActor(req.cookies);
    const rows = await pool.query<{ id: string; status: string; created_at: Date }>(
      'SELECT m.id,m.status,m.created_at FROM chess_matches m JOIN chess_participants p ON p.match_id=m.id WHERE p.identity=$1 ORDER BY m.created_at DESC LIMIT 10',
      [actor.identity],
    );
    return { matches: rows.rows };
  });
  app.post('/api/chess/join', async (req) => {
    const actor = await requireActor(req.cookies),
      { invite } = z
        .object({ invite: z.string().regex(/^[a-f0-9]{48}$/) })
        .strict()
        .parse(req.body);
    const id = await transaction(async (c) => {
      const row = (
        await c.query<Row>('SELECT * FROM chess_matches WHERE invite_hash=$1 FOR UPDATE', [
          tokenHash(invite),
        ])
      ).rows[0];
      if (!row) chessError('INVALID_INVITE', 404);
      const seats = await participants(c, row.id);
      if (seats.some((p) => p.identity === actor.identity)) return row.id;
      if (row.status !== 'waiting' || seats.length !== 1) chessError('ROOM_FULL', 409);
      const side = seats[0].side === 'w' ? 'b' : 'w';
      await c.query(
        'INSERT INTO chess_participants(match_id,side,identity,display_name,user_id) VALUES($1,$2,$3,$4,$5)',
        [row.id, side, actor.identity, actor.name, actor.userId],
      );
      row.status = 'active';
      row.turn_started_at = new Date();
      row.version++;
      await save(c, row);
      return row.id;
    });
    await notify(id);
    return { match: await read(id, actor) };
  });
  app.post('/api/chess/matches/:id/actions', async (req) => {
    const { id } = req.params as { id: string };
    return {
      match: await command(id, await requireActor(req.cookies), chessCommandSchema.parse(req.body)),
    };
  });
  app.post('/api/chess/matches/:id/rematch', async (req) => {
    const actor = await requireActor(req.cookies),
      { id } = req.params as { id: string };
    idSchema.parse(id);
    const next = await transaction(async (c) => {
      const row = (await c.query<Row>('SELECT * FROM chess_matches WHERE id=$1 FOR UPDATE', [id]))
        .rows[0];
      if (!row) chessError('NOT_FOUND', 404);
      const seats = await participants(c, id),
        seat = seats.find((p) => p.identity === actor.identity);
      if (!seat) chessError('NOT_A_PARTICIPANT', 403);
      if (row.status !== 'finished') chessError('MATCH_NOT_FINISHED', 409);
      if (row.rematch_id) {
        if (row.rematch_requested_side !== seat.side) {
          const next = (
            await c.query<Row>('SELECT * FROM chess_matches WHERE id=$1 FOR UPDATE', [
              row.rematch_id,
            ])
          ).rows[0];
          if (next.status === 'waiting') {
            next.status = 'active';
            next.turn_started_at = new Date();
            next.version++;
            await save(c, next);
          }
        }
        return row.rematch_id;
      }
      const other = seats.find((p) => p.side !== seat.side);
      if (!other) chessError('NO_OPPONENT');
      const result = await createRow(
        c,
        actor,
        {
          mode: row.mode,
          timeControl: row.time_control,
          difficulty: row.difficulty,
          side: seat.side === 'w' ? 'b' : 'w',
        },
        row.mode === 'private'
          ? { identity: other.identity, name: other.display_name, userId: other.user_id }
          : undefined,
      );
      row.rematch_id = result.row.id;
      if (row.mode === 'private') {
        result.row.status = 'waiting';
        result.row.turn_started_at = null;
        await save(c, result.row);
        await c.query('UPDATE chess_matches SET rematch_requested_side=$2 WHERE id=$1', [
          id,
          seat.side,
        ]);
      }
      row.version++;
      await save(c, row);
      return result.row.id;
    });
    await notify(id);
    await notify(next);
    void runBot(next);
    return { match: await read(next, actor) };
  });
  // Unrated queue: all new players share one provisional pool until ratings exist.
  const queueInput = z
    .object({
      timeControl: z.enum(['none', '1+0', '3+0', '3+2', '5+0', '10+0', '15+10']),
      ranked: z.boolean().default(false),
    })
    .strict();
  app.post('/api/chess/queue', async (req) => {
    const actor = await requireActor(req.cookies),
      { timeControl, ranked } = queueInput.parse(req.body);
    if (ranked) {
      if (!actor.userId || timeControl === 'none') chessError('RANKED_REQUIRES_ACCOUNT', 403);
      const user = (
        await pool.query('SELECT email_verified FROM users WHERE id=$1', [actor.userId])
      ).rows[0];
      if (!user?.email_verified) chessError('EMAIL_NOT_VERIFIED', 403);
    }
    const id = await transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(726452)');
      await c.query(
        "DELETE FROM chess_queue WHERE heartbeat_at < now()-interval '45 seconds' AND matched_id IS NULL",
      );
      const existing = (
        await c.query<{ matched_id: string | null; time_control: string }>(
          'SELECT matched_id,time_control FROM chess_queue WHERE identity=$1',
          [actor.identity],
        )
      ).rows[0];
      if (existing?.matched_id) return existing.matched_id;
      await c.query(
        'INSERT INTO chess_queue(identity,display_name,user_id,time_control,ranked) VALUES($1,$2,$3,$4,$5) ON CONFLICT(identity) DO UPDATE SET heartbeat_at=now(),time_control=excluded.time_control,ranked=excluded.ranked',
        [actor.identity, actor.name, actor.userId, timeControl, ranked],
      );
      const candidates = (
        await c.query<{
          identity: string;
          display_name: string;
          user_id: string | null;
          queued_at: Date;
        }>(
          'SELECT * FROM chess_queue WHERE identity<>$1 AND time_control=$2 AND ranked=$3 AND matched_id IS NULL ORDER BY queued_at FOR UPDATE',
          [actor.identity, timeControl, ranked],
        )
      ).rows;
      let opponent: (typeof candidates)[number] | undefined;
      for (const candidate of candidates) {
        if (actor.userId && candidate.user_id) {
          if (
            (
              await c.query(
                'SELECT 1 FROM blocks WHERE (owner=$1 AND target=$2) OR(owner=$2 AND target=$1)',
                [actor.userId, candidate.user_id],
              )
            ).rowCount
          )
            continue;
          if (ranked) {
            const ratingPool = `chess:${timeControl === '1+0' ? 'bullet' : ['3+0', '3+2', '5+0'].includes(timeControl) ? 'blitz' : 'rapid'}`;
            const ratings = (
              await c.query<{ user_id: string; rating: number }>(
                'SELECT user_id,rating FROM ratings WHERE pool=$1 AND user_id=ANY($2::uuid[])',
                [ratingPool, [actor.userId, candidate.user_id]],
              )
            ).rows;
            const mine = ratings.find((r) => r.user_id === actor.userId)?.rating ?? 1500,
              theirs = ratings.find((r) => r.user_id === candidate.user_id)?.rating ?? 1500;
            if (
              Math.abs(mine - theirs) >
              150 + ((Date.now() - candidate.queued_at.getTime()) / 1000) * 5
            )
              continue;
          }
        }
        opponent = candidate;
        break;
      }
      if (!opponent) return null;
      const result = await createRow(
        c,
        actor,
        { mode: 'private', timeControl, side: 'random', difficulty: 'intermediate' },
        { identity: opponent.identity, name: opponent.display_name, userId: opponent.user_id },
      );
      await c.query('UPDATE chess_matches SET ranked=$2 WHERE id=$1', [result.row.id, ranked]);
      await c.query('UPDATE chess_queue SET matched_id=$1 WHERE identity=ANY($2)', [
        result.row.id,
        [actor.identity, opponent.identity],
      ]);
      return result.row.id;
    });
    return id ? { match: await read(id, actor) } : { waiting: true };
  });
  app.post('/api/chess/queue/cancel', async (req) => {
    const actor = await requireActor(req.cookies);
    await pool.query('DELETE FROM chess_queue WHERE identity=$1', [actor.identity]);
    return { ok: true };
  });
  const socketCookies = (raw: string | undefined) => {
    const parsed: Record<string, string> = {};
    for (const part of (raw ?? '').split(';')) {
      const index = part.indexOf('=');
      if (index > 0) parsed[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
    return parsed;
  };
  io.use(async (socket, next) => {
    try {
      await requireActor(socketCookies(socket.request.headers.cookie));
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });
  io.on('connection', (socket) => {
    let joined: { id: string; identity: string } | null = null;
    let windowStart = Date.now(),
      count = 0;
    async function ackRequest(ack: (result: MatchAck) => void, fn: () => Promise<MatchView>) {
      try {
        if (Date.now() - windowStart > 60000) {
          windowStart = Date.now();
          count = 0;
        }
        if (++count > 90) chessError('TOO_MANY_REQUESTS', 429);
        ack({ match: await fn() });
      } catch (error) {
        ack({
          error:
            (error as { publicCode?: string }).publicCode ??
            (error instanceof z.ZodError ? 'INVALID_INPUT' : 'SERVICE_UNAVAILABLE'),
        });
      }
    }
    function removePresence() {
      if (joined) {
        online.get(joined.id)?.get(joined.identity)?.delete(socket.id);
        const id = joined.id;
        if (!online.get(id)?.get(joined.identity)?.size) online.get(id)?.delete(joined.identity);
        if (!online.get(id)?.size) online.delete(id);
        void notify(id);
      }
    }
    socket.on('match:join', (id: unknown, ack: (result: MatchAck) => void) => {
      if (typeof ack !== 'function') return;
      void ackRequest(ack, async () => {
        const matchId = idSchema.parse(id),
          actor = await requireActor(socketCookies(socket.request.headers.cookie));
        await read(matchId, actor);
        removePresence();
        if (joined) await socket.leave(joined.id);
        await socket.join(matchId);
        joined = { id: matchId, identity: actor.identity };
        if (!online.has(matchId)) online.set(matchId, new Map());
        if (!online.get(matchId)!.has(actor.identity))
          online.get(matchId)!.set(actor.identity, new Set());
        online.get(matchId)!.get(actor.identity)!.add(socket.id);
        await notify(matchId);
        void runBot(matchId);
        return read(matchId, actor);
      });
    });
    socket.on('match:action', (input: unknown, ack: (result: MatchAck) => void) => {
      if (typeof ack !== 'function') return;
      void ackRequest(ack, async () => {
        if (!joined) chessError('NOT_A_PARTICIPANT', 403);
        const actor = await requireActor(socketCookies(socket.request.headers.cookie));
        return command(joined.id, actor, chessCommandSchema.parse(input));
      });
    });
    socket.on('disconnect', () => removePresence());
  });
  let maintaining = false;
  const timer = setInterval(() => {
    if (maintaining || closed) return;
    maintaining = true;
    void pool
      .query<{ id: string }>(
        "SELECT id FROM chess_matches WHERE status='active' AND (mode='bot' OR (time_control <> 'none' AND turn_started_at + (CASE WHEN state->>'fen' LIKE '% w %' THEN white_ms ELSE black_ms END) * interval '1 millisecond' <= now())) LIMIT 100",
      )
      .then(async (result) => {
        for (const item of result.rows) {
          const changed = await transaction(async (c) => {
            const row = (
              await c.query<Row>('SELECT * FROM chess_matches WHERE id=$1 FOR UPDATE', [item.id])
            ).rows[0];
            const status = row.status;
            settleClock(row, Date.now());
            if (status !== row.status) {
              row.version++;
              await save(c, row);
              await c.query(
                'INSERT INTO chess_events(match_id,action_id,actor,sequence,payload) VALUES($1,$2,$3,$4,$5)',
                [row.id, randomUUID(), 'server', row.version, JSON.stringify({ type: 'timeout' })],
              );
              return true;
            }
            return false;
          });
          if (changed) await notify(item.id);
          void runBot(item.id);
        }
      })
      .catch(() => {
        if (!closed) app.log.error('Match maintenance failed');
      })
      .finally(() => {
        maintaining = false;
      });
  }, 2000);
  timer.unref();
  app.addHook('preClose', async () => {
    closed = true;
    clearInterval(timer);
    await Promise.all([...activeWorkers].map((w) => w.terminate()));
    io.disconnectSockets(true);
    io.engine.close();
  });
  return { command, read, actorFrom, io };
}
