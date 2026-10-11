import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { buildApp } from '../apps/server/src/app';
import { pool } from '../apps/server/src/database';
import type { MatchView, MatchAck, ChessCommand } from '../packages/shared/src/chess-contracts';
let app: Awaited<ReturnType<typeof buildApp>>,
  white = '',
  black = '',
  intruder = '',
  id = '',
  invite = '',
  port = 0,
  ip = 60;
const ids = new Set<string>(),
  sockets: Socket[] = [];
const headers = (cookie: string) => ({
  origin: 'http://localhost:5173',
  'x-plyvra-client': 'web',
  cookie,
});
async function post(path: string, body: object, cookie: string) {
  return app.inject({
    method: 'POST',
    url: `/api/chess${path}`,
    headers: headers(cookie),
    payload: body,
    remoteAddress: `127.3.0.${ip++}`,
  });
}
async function current(cookie = white, matchId = id): Promise<MatchView> {
  const result = await app.inject({ url: `/api/chess/matches/${matchId}`, headers: { cookie } });
  expect(result.statusCode).toBe(200);
  return result.json().match;
}
async function action(cookie: string, body: ChessCommand['action'], matchId = id) {
  const state = await current(cookie, matchId);
  return post(
    `/matches/${matchId}/actions`,
    { actionId: randomUUID(), expectedVersion: state.version, action: body },
    cookie,
  );
}
async function guest() {
  const r = await post('/player', {}, '');
  return String(r.headers['set-cookie']).split(';')[0];
}
async function create(cookie: string, timeControl = 'none') {
  const r = await post(
    '/matches',
    { mode: 'private', side: 'w', difficulty: 'beginner', timeControl },
    cookie,
  );
  expect(r.statusCode).toBe(200);
  ids.add(r.json().match.id);
  return r.json() as { match: MatchView; invite: string };
}
async function connect(cookie: string) {
  const socket = io(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    extraHeaders: { Origin: 'http://localhost:5173', Cookie: cookie },
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}
async function emit(socket: Socket, event: string, data: unknown): Promise<MatchAck> {
  return new Promise((resolve, reject) =>
    socket
      .timeout(5000)
      .emit(event, data, (e: Error | null, ack: MatchAck) => (e ? reject(e) : resolve(ack))),
  );
}
beforeAll(async () => {
  app = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  port = (app.server.address() as { port: number }).port;
  white = await guest();
  black = await guest();
  intruder = await guest();
});
afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await app.close();
  await pool.query('DELETE FROM chess_queue WHERE matched_id=ANY($1::uuid[])', [[...ids]]);
  await pool.query('DELETE FROM chess_matches WHERE id=ANY($1::uuid[])', [[...ids]]);
  await pool.end();
});
describe('authoritative chess matches with real PostgreSQL and sockets', () => {
  it('creates private room, joins a second identity and rejects a third', async () => {
    const r = await create(white);
    id = r.match.id;
    invite = r.invite;
    expect(r.match.status).toBe('waiting');
    expect(invite).toHaveLength(48);
    const joined = await post('/join', { invite }, black);
    expect(joined.json().match.status).toBe('active');
    expect(joined.json().match.yourSide).toBe('b');
    expect((await post('/join', { invite }, intruder)).statusCode).toBe(409);
  });
  it('rejects out-of-turn, illegal moves, forged results and private reads', async () => {
    expect((await action(black, { type: 'move', from: 'e7', to: 'e5' })).json().error).toBe(
      'NOT_YOUR_TURN',
    );
    expect((await action(white, { type: 'move', from: 'e2', to: 'e5' })).json().error).toBe(
      'ILLEGAL_MOVE',
    );
    expect(
      (await app.inject({ url: `/api/chess/matches/${id}`, headers: { cookie: intruder } }))
        .statusCode,
    ).toBe(403);
    const state = await current();
    expect(
      (
        await post(
          `/matches/${id}/actions`,
          {
            actionId: randomUUID(),
            expectedVersion: state.version,
            action: { type: 'move', from: 'e2', to: 'e4', winner: 'first' },
          },
          white,
        )
      ).statusCode,
    ).toBe(400);
  });
  it('serializes simultaneous commands and makes retries idempotent', async () => {
    const state = await current(),
      command = {
        actionId: randomUUID(),
        expectedVersion: state.version,
        action: { type: 'move', from: 'e2', to: 'e4' },
      };
    const concurrent = await Promise.all([
      post(`/matches/${id}/actions`, command, white),
      post(
        `/matches/${id}/actions`,
        { ...command, actionId: randomUUID(), action: { type: 'move', from: 'd2', to: 'd4' } },
        white,
      ),
    ]);
    expect(concurrent.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const success =
      concurrent[0].statusCode === 200
        ? command
        : { ...command, action: { type: 'move', from: 'd2', to: 'd4' } };
    if (concurrent[0].statusCode === 200) {
      expect((await post(`/matches/${id}/actions`, success, white)).statusCode).toBe(200);
    }
    expect((await current()).state.moves).toHaveLength(1);
  });
  it('reconnects two actual clients to the persisted snapshot and exchanges a move', async () => {
    const first = await connect(white),
      second = await connect(black);
    expect((await emit(first, 'match:join', id)).match?.state.moves).toHaveLength(1);
    const state = (await emit(second, 'match:join', id)).match!;
    const move = await emit(second, 'match:action', {
      actionId: randomUUID(),
      expectedVersion: state.version,
      action: { type: 'move', from: 'e7', to: 'e5' },
    });
    expect(move.match?.state.moves).toHaveLength(2);
    second.disconnect();
    const reconnect = await connect(black);
    expect((await emit(reconnect, 'match:join', id)).match?.state.moves).toHaveLength(2);
    const malicious = await connect(intruder);
    expect((await emit(malicious, 'match:join', id)).error).toBe('NOT_A_PARTICIPANT');
  });
  it('offers/accepts draws, stores result and requires rematch consent', async () => {
    expect((await action(white, { type: 'offer_draw' })).statusCode).toBe(200);
    expect((await action(white, { type: 'accept_draw' })).json().error).toBe('NO_DRAW_OFFER');
    const result = await action(black, { type: 'accept_draw' });
    expect(result.json().match.result.reason).toBe('agreement');
    const next = await post(`/matches/${id}/rematch`, {}, white);
    const nextId = next.json().match.id;
    ids.add(nextId);
    expect(next.json().match.status).toBe('waiting');
    expect((await post(`/matches/${id}/rematch`, {}, black)).json().match.status).toBe('active');
    expect((await current(white, nextId)).yourSide).toBe('b');
  });
  it('uses elapsed server time and grants an increment only on valid moves', async () => {
    const r = await create(white, '3+2');
    await post('/join', { invite: r.invite }, black);
    await pool.query(
      "UPDATE chess_matches SET turn_started_at=now()-interval '10 seconds' WHERE id=$1",
      [r.match.id],
    );
    const moved = await action(white, { type: 'move', from: 'e2', to: 'e4' }, r.match.id);
    const match = moved.json().match as MatchView;
    expect(match.whiteMs).toBeGreaterThan(170000);
    expect(match.whiteMs).toBeLessThan(173000);
    expect(match.blackMs).toBeGreaterThan(179000);
  });
  it('restores expired clocks from the DB rather than trusting the browser', async () => {
    const r = await create(white, '1+0');
    await post('/join', { invite: r.invite }, black);
    await pool.query(
      "UPDATE chess_matches SET turn_started_at=now()-interval '70 seconds' WHERE id=$1",
      [r.match.id],
    );
    const restored = await current(white, r.match.id);
    expect(restored.status).toBe('finished');
    expect(restored.result).toEqual({ winner: 'second', reason: 'timeout' });
  });
  it('matches only real queued identities with the same time control', async () => {
    expect((await post('/queue', { timeControl: '15+10' }, white)).json().waiting).toBe(true);
    expect((await post('/queue', { timeControl: '10+0' }, black)).json().waiting).toBe(true);
    const matched = await post('/queue', { timeControl: '15+10' }, black);
    const match = matched.json().match as MatchView;
    expect(match.status).toBe('active');
    ids.add(match.id);
    expect((await post('/queue', { timeControl: '15+10' }, white)).json().match.id).toBe(match.id);
    await post('/queue/cancel', {}, white);
    await post('/queue/cancel', {}, black);
  });
  it('server worker produces a legal persisted bot reply', async () => {
    const response = await post(
        '/matches',
        { mode: 'bot', timeControl: 'none', side: 'w', difficulty: 'beginner' },
        white,
      ),
      match = response.json().match as MatchView;
    ids.add(match.id);
    expect((await action(white, { type: 'move', from: 'e2', to: 'e4' }, match.id)).statusCode).toBe(
      200,
    );
    await expect
      .poll(async () => (await current(white, match.id)).state.moves.length, {
        timeout: 8000,
        interval: 100,
      })
      .toBe(2);
    const ended = await action(white, { type: 'resign' }, match.id);
    expect(ended.json().match.result.reason).toBe('resignation');
  });
  it('restores a real match and running clock after the application restarts', async () => {
    const room = await create(white, '3+2');
    await post('/join', { invite: room.invite }, black);
    await action(white, { type: 'move', from: 'e2', to: 'e4' }, room.match.id);
    const before = await current(black, room.match.id);
    await app.close();
    app = await buildApp();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    port = typeof address === 'object' && address ? address.port : 0;
    const after = await current(black, room.match.id);
    expect(after.state).toEqual(before.state);
    expect(after.version).toBe(before.version);
    expect(after.blackMs).toBeLessThan(before.blackMs);
    expect(
      (await action(black, { type: 'move', from: 'e7', to: 'e5' }, room.match.id)).json().match
        .state.moves,
    ).toHaveLength(2);
  });
});
