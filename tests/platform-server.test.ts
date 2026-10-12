import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/server/src/app';
import { pool } from '../apps/server/src/database';
import { boardActions } from '../packages/games/board-engine';
import type { BoardView } from '../packages/shared/src/board-contracts';
import { lessons } from '../packages/shared/src/lessons';
import { scenarios, solutions, replayScenario } from '../packages/shared/src/scenarios';
let app: Awaited<ReturnType<typeof buildApp>>,
  ip = 1;
const matches: string[] = [],
  accounts: string[] = [];
const h = (cookie = '') => ({ origin: 'http://localhost:5173', 'x-plyvra-client': 'web', cookie });
async function post(url: string, payload: object, cookie = '') {
  return app.inject({
    method: 'POST',
    url: '/api' + url,
    payload,
    headers: h(cookie),
    remoteAddress: `127.7.0.${ip++}`,
  });
}
async function get(url: string, cookie = '') {
  return app.inject({ url: '/api' + url, headers: h(cookie), remoteAddress: `127.8.0.${ip++}` });
}
const cookie = (r: { headers: Record<string, unknown> }) =>
  String(r.headers['set-cookie']).split(';')[0];
async function guest() {
  return cookie(await post('/chess/player', {}));
}
async function register(guestCookie = '') {
  const username = 'p_' + randomUUID().slice(0, 8),
    password = 'Platform Test Passphrase!';
  const r = await post(
    '/auth/register',
    { email: `${username}@example.test`, username, password },
    guestCookie,
  );
  expect(r.statusCode).toBe(201);
  accounts.push(r.json().user.id);
  return { cookie: cookie(r), username, password, id: r.json().user.id };
}
async function create(game: string, c: string, mode = 'private', side = 'w') {
  const r = await post(
    '/board/matches',
    { game, mode, side, timeControl: 'none', difficulty: 'beginner' },
    c,
  );
  expect(r.statusCode).toBe(200);
  matches.push(r.json().match.id);
  return r.json() as { match: BoardView; invite: string };
}
async function move(c: string, m: BoardView) {
  return post(
    `/board/matches/${m.id}/actions`,
    {
      actionId: randomUUID(),
      expectedVersion: m.version,
      action: { type: 'move', payload: boardActions(m.game, m.state)[0] },
    },
    c,
  );
}
beforeAll(async () => {
  app = await buildApp();
});
for (const game of ['chess', 'checkers', 'wayline']) {
  it(`${game}: recent games expose useful match facts only to their participants`, async () => {
    const a = await register(),
      b = await register(),
      outsider = await guest();
    const endpoint = game === 'chess' ? '/chess' : '/board';
    const created = await post(
      `${endpoint}/matches`,
      {
        ...(game === 'chess' ? {} : { game }),
        mode: 'private',
        side: 'w',
        timeControl: 'none',
        difficulty: 'beginner',
      },
      a.cookie,
    );
    expect(created.statusCode).toBe(200);
    const { match: initial, invite } = created.json();
    if (game !== 'chess') matches.push(initial.id);
    try {
      const waiting = (await get('/platform/recent', a.cookie))
        .json()
        .matches.find((m: { id: string }) => m.id === initial.id);
      expect(waiting).toMatchObject({
        game,
        status: 'waiting',
        opponent: null,
        your_side: 'w',
        move_count: 0,
        bot: false,
        ranked: false,
        time_control: 'none',
      });
      const joined = await post(`${endpoint}/join`, { invite }, b.cookie);
      expect(joined.statusCode).toBe(200);
      const match = joined.json().match;
      const moved = await post(
        `${endpoint}/matches/${initial.id}/actions`,
        {
          actionId: randomUUID(),
          expectedVersion: match.version,
          action:
            game === 'chess'
              ? { type: 'move', from: 'e2', to: 'e4' }
              : {
                  type: 'move',
                  payload: boardActions(game as 'checkers' | 'wayline', match.state)[0],
                },
        },
        a.cookie,
      );
      expect(moved.statusCode).toBe(200);
      const recent = (await get('/platform/recent', a.cookie))
        .json()
        .matches.find((m: { id: string }) => m.id === initial.id);
      expect(recent).toMatchObject({
        game,
        status: 'active',
        opponent: b.username,
        move_count: 1,
        your_side: 'w',
      });
      expect(Object.keys(recent).sort()).toEqual(
        [
          'id',
          'game',
          'status',
          'created_at',
          'updated_at',
          'result',
          'time_control',
          'difficulty',
          'ranked',
          'bot',
          'your_side',
          'opponent',
          'move_count',
        ].sort(),
      );
      expect(JSON.stringify(recent)).not.toContain('@example.test');
      expect((await get('/platform/recent', outsider)).json().matches).toEqual([]);
      const theirs = (await get('/platform/recent', b.cookie))
        .json()
        .matches.find((m: { id: string }) => m.id === initial.id);
      expect(theirs).toMatchObject({ opponent: a.username, your_side: 'b', move_count: 1 });
    } finally {
      if (game === 'chess') await pool.query('DELETE FROM chess_matches WHERE id=$1', [initial.id]);
    }
  });
}
it('course progression rejects skipped steps and validates every previous action', async () => {
  const c = await guest();
  const steps = lessons.filter((l) => l.game === 'wayline');
  expect(
    (
      await post(
        `/learn/${steps[1].id}/complete`,
        { action: steps[1].answer, courseActions: [] },
        c,
      )
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await post(
        `/learn/${steps[1].id}/complete`,
        { action: steps[1].answer, courseActions: [{}] },
        c,
      )
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await post(
        `/learn/${steps[1].id}/complete`,
        { action: steps[1].answer, courseActions: [steps[0].answer] },
        c,
      )
    ).json().completed,
  ).toBe(true);
});
it('same-browser linked accounts may play but cannot earn match XP or rating', async () => {
  const a = await register(),
    b = await register();
  await pool.query('INSERT INTO account_devices(user_id,device_hash) VALUES($1,$3),($2,$3)', [
    a.id,
    b.id,
    'a'.repeat(64),
  ]);
  const r = await create('checkers', a.cookie);
  let m = (await post('/board/join', { invite: r.invite }, b.cookie)).json().match as BoardView;
  for (let i = 0; i < 6; i++) {
    const response = await move(m.state.turn === 'w' ? a.cookie : b.cookie, m);
    expect(response.statusCode).toBe(200);
    m = response.json().match;
  }
  expect(
    (
      await post(
        `/board/matches/${m.id}/actions`,
        { actionId: randomUUID(), expectedVersion: m.version, action: { type: 'resign' } },
        a.cookie,
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (await pool.query('SELECT 1 FROM experience WHERE user_id=ANY($1::uuid[])', [[a.id, b.id]]))
      .rowCount,
  ).toBe(0);
  expect(
    (await pool.query('SELECT rated FROM match_results WHERE match_id=$1', [m.id])).rows.every(
      (r) => !r.rated,
    ),
  ).toBe(true);
});
afterAll(async () => {
  await app.close();
  await pool.query('DELETE FROM board_queue WHERE matched_id=ANY($1::uuid[])', [matches]);
  await pool.query('DELETE FROM board_matches WHERE id=ANY($1::uuid[])', [matches]);
  await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [accounts]);
  await pool.end();
});
for (const game of ['checkers', 'wayline']) {
  it(`${game}: private rooms, authorization, CAS and idempotent actions`, async () => {
    const a = await guest(),
      b = await guest(),
      outsider = await guest(),
      r = await create(game, a);
    expect((await get(`/board/matches/${r.match.id}`, outsider)).statusCode).toBe(403);
    const joined = await post('/board/join', { invite: r.invite }, b);
    expect(joined.statusCode).toBe(200);
    const m = joined.json().match as BoardView;
    expect((await move(b, m)).statusCode).toBe(409);
    const body = {
      actionId: randomUUID(),
      expectedVersion: m.version,
      action: { type: 'move', payload: boardActions(m.game, m.state)[0] },
    };
    const first = await post(`/board/matches/${m.id}/actions`, body, a);
    expect(first.statusCode).toBe(200);
    expect((await post(`/board/matches/${m.id}/actions`, body, a)).json().match.version).toBe(
      first.json().match.version,
    );
    expect(
      (await post(`/board/matches/${m.id}/actions`, { ...body, actionId: randomUUID() }, a))
        .statusCode,
    ).toBe(409);
    const refreshed = await get(`/board/matches/${m.id}`, b);
    expect(refreshed.json().match.state.history).toHaveLength(1);
  });
  it(`${game}: worker bot makes a legal move without a human opponent`, async () => {
    const a = await guest(),
      r = await create(game, a, 'bot', 'b');
    let m = r.match;
    for (let i = 0; i < 35 && !m.state.history.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      m = (await get(`/board/matches/${m.id}`, a)).json().match;
    }
    expect(m.state.history).toHaveLength(1);
    expect(m.state.turn).toBe('b');
  });
}
it('guests can practice lessons but cannot claim permanent progress or ranked games', async () => {
  const c = await guest(),
    lesson = lessons[0];
  const done = await post(`/learn/${lesson.id}/complete`, { action: lesson.answer }, c);
  expect(done.json()).toEqual({ completed: true, saved: false });
  expect((await get('/platform/profile', c)).json().guest).toBe(true);
  expect(
    (await post('/board/queue', { game: 'checkers', timeControl: '10+0', ranked: true }, c))
      .statusCode,
  ).toBe(403);
});
it('registration adopts guest rooms atomically; unsupported rule versions cannot accept moves', async () => {
  const guestCookie = await guest(),
    room = await create('checkers', guestCookie),
    a = await register(guestCookie);
  const mine = await get(`/board/matches/${room.match.id}`, a.cookie);
  expect(mine.statusCode).toBe(200);
  expect(mine.json().match.white).toBe(a.username);
  expect(mine.json().match.rulesVersion).toBe('draughts64-online-v1');
  expect((await get(`/board/matches/${room.match.id}`, guestCookie)).statusCode).toBe(403);
  await pool.query('UPDATE board_matches SET rules_version=$2 WHERE id=$1', [
    room.match.id,
    'unsupported-future-version',
  ]);
  const rejected = await move(a.cookie, mine.json().match);
  expect(rejected.statusCode).toBe(503);
  expect(rejected.json().error).toBe('RULESET_UNAVAILABLE');
});
it('lesson rewards are exactly once; profiles never expose private account data', async () => {
  const a = await register(),
    lesson = lessons[0];
  expect(
    (await post(`/learn/${lesson.id}/complete`, { action: { from: 'e2', to: 'e3' } }, a.cookie))
      .statusCode,
  ).toBe(400);
  for (let i = 0; i < 3; i++)
    expect(
      (await post(`/learn/${lesson.id}/complete`, { action: lesson.answer }, a.cookie)).statusCode,
    ).toBe(200);
  const p = (await get('/platform/profile', a.cookie)).json().profile;
  expect(p.xp).toBe(15);
  expect(p.lessons).toHaveLength(1);
  const publicP = (await get(`/platform/profile/${a.username}`)).json().profile;
  expect(publicP.email).toBeUndefined();
  expect(publicP.settings).toBeUndefined();
});
it('friend requests, consent, shared history, block and notification ownership', async () => {
  const a = await register(),
    b = await register();
  expect(
    (await post('/platform/friends/request', { username: b.username }, a.cookie)).statusCode,
  ).toBe(200);
  const notices = (await get('/platform/notifications', b.cookie)).json().notifications;
  expect(notices).toHaveLength(1);
  expect(
    (await post('/platform/friends/respond', { username: a.username, accept: true }, b.cookie))
      .statusCode,
  ).toBe(200);
  const friends = (await get('/platform/friends', a.cookie)).json().friends;
  expect(friends[0].status).toBe('accepted');
  expect(friends[0].online).toBeNull();
  expect((await get(`/platform/friends/${b.username}/history`, a.cookie)).json().matches).toEqual(
    [],
  );
  expect(
    (await post('/platform/block', { username: b.username, block: true }, a.cookie)).statusCode,
  ).toBe(200);
  expect(
    (await post('/platform/friends/request', { username: a.username }, b.cookie)).statusCode,
  ).toBe(403);
  expect((await get('/platform/friends', b.cookie)).json().friends).toHaveLength(0);
});
it('password changes revoke old sessions; deletion requires credentials and removes account', async () => {
  const a = await register(),
    newPassword = 'New Platform Passphrase!';
  expect(
    (await post('/platform/password', { currentPassword: 'wrong', newPassword }, a.cookie))
      .statusCode,
  ).toBe(401);
  expect(
    (await post('/platform/password', { currentPassword: a.password, newPassword }, a.cookie))
      .statusCode,
  ).toBe(200);
  expect((await get('/auth/me', a.cookie)).json().user).toBeNull();
  const login = await post('/auth/login', {
    email: `${a.username}@example.test`,
    password: newPassword,
  });
  expect(login.statusCode).toBe(200);
  expect(
    (await post('/platform/delete-account', { password: 'wrong' }, cookie(login))).statusCode,
  ).toBe(401);
  expect(
    (await post('/platform/delete-account', { password: newPassword }, cookie(login))).statusCode,
  ).toBe(200);
  expect((await get(`/platform/profile/${a.username}`)).statusCode).toBe(404);
});
it('settings persist, profile privacy applies, and online status requires consent', async () => {
  const a = await register(),
    b = await register();
  const settings = {
    displayName: 'Player',
    bio: 'A short bio',
    avatar: 'slate',
    publicProfile: false,
    showOnline: true,
    invitations: 'friends',
    timezone: 'Pacific/Kiritimati',
    preferences: { sound: false, animations: false, board: 'walnut', pieces: 'outline' },
  };
  expect((await post('/platform/settings', settings, a.cookie)).statusCode).toBe(200);
  expect((await get(`/platform/profile/${a.username}`, b.cookie)).statusCode).toBe(403);
  const p = (await get('/platform/profile', a.cookie)).json().profile;
  expect(p.displayName).toBe('Player');
  expect(p.settings.preferences.pieces).toBe('outline');
  expect(p.today).toBe(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Kiritimati',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
  );
  expect(
    (await post('/platform/settings', { ...settings, timezone: 'Invalid/Timezone' }, a.cookie))
      .statusCode,
  ).toBe(400);
  await post('/platform/friends/request', { username: b.username }, a.cookie);
  await post('/platform/friends/respond', { username: a.username, accept: true }, b.cookie);
  await post('/platform/presence', {}, a.cookie);
  expect((await get('/platform/friends', b.cookie)).json().friends[0].online).toBe(true);
});
it('ranked matchmaking records both Glicko ratings exactly once and excludes bots', async () => {
  const a = await register(),
    b = await register();
  await pool.query('UPDATE users SET email_verified=true WHERE id=ANY($1::uuid[])', [[a.id, b.id]]);
  expect(
    (await post('/board/queue', { game: 'checkers', timeControl: '10+0', ranked: true }, a.cookie))
      .statusCode,
  ).toBe(200);
  const queue = await post(
    '/board/queue',
    { game: 'checkers', timeControl: '10+0', ranked: true },
    b.cookie,
  );
  const id = queue.json().match.id;
  expect(id).toBeTruthy();
  matches.push(id);
  let m = (await get(`/board/matches/${id}`, a.cookie)).json().match as BoardView;
  expect(m.ranked).toBe(true);
  for (let i = 0; i < 6; i++) {
    const active = m.state.turn === m.yourSide ? a.cookie : b.cookie;
    const r = await move(active, m);
    expect(r.statusCode).toBe(200);
    // Always resolve whose side belongs to the first browser, independent of response actor.
    m = (await get(`/board/matches/${id}`, a.cookie)).json().match;
  }
  const resign = { actionId: randomUUID(), expectedVersion: m.version, action: { type: 'resign' } };
  expect((await post(`/board/matches/${id}/actions`, resign, a.cookie)).statusCode).toBe(200);
  expect((await post(`/board/matches/${id}/actions`, resign, a.cookie)).statusCode).toBe(200);
  const rated = await pool.query(
    'SELECT rating,games FROM ratings WHERE user_id=ANY($1::uuid[]) AND pool=$2',
    [[a.id, b.id], 'checkers'],
  );
  expect(rated.rows).toHaveLength(2);
  expect(rated.rows.every((r) => r.games === 1)).toBe(true);
  expect(rated.rows.map((r) => r.rating).sort((x, y) => x - y)[0]).toBeLessThan(1500);
  const results = await pool.query('SELECT * FROM match_results WHERE match_id=$1', [id]);
  expect(results.rows).toHaveLength(2);
  expect(
    Number(
      (await pool.query('SELECT sum(amount) xp FROM experience WHERE user_id=$1', [a.id])).rows[0]
        .xp,
    ),
  ).toBe(30);
});
it('v2 tactical API rejects forged prefixes, keeps solutions private, and supports hints and all games', async () => {
  const c = await guest();
  for (const game of ['chess', 'checkers', 'wayline']) {
    const s = scenarios.find((v) => v.game === game && v.stages.length > 1)!;
    const meta = (await get(`/scenarios/${s.id}`, c)).json();
    expect(meta.scenario.version).toBe(2);
    expect(meta.scenario.stages).toBeUndefined();
    expect(meta.solution).toBeUndefined();
    expect((await post(`/scenarios/${s.id}/step`, { version: 1, actions: [] }, c)).statusCode).toBe(
      400,
    );
    expect(
      (await post(`/scenarios/${s.id}/step`, { version: 2, actions: [{ fake: true }] }, c))
        .statusCode,
    ).toBe(400);
    const first = solutions(s)[0];
    const r = await post(`/scenarios/${s.id}/step`, { version: 2, actions: [first] }, c);
    expect(r.statusCode).toBe(200);
    expect(r.json().completed).toBe(false);
    expect(r.json().replies).toHaveLength(1);
    expect(r.json().saved).toBe(false);
    for (const level of [1, 2, 3]) {
      const hint = (
        await post(`/scenarios/${s.id}/step`, { version: 2, actions: [first], hint: level }, c)
      ).json();
      expect(hint.hint.en).toBeTruthy();
      expect(hint.direction !== undefined).toBe(level === 3);
      expect(hint.focus !== undefined).toBe(level >= 2);
    }
    const revealed = (
      await post(`/scenarios/${s.id}/step`, { version: 2, actions: [first], solution: true }, c)
    ).json();
    expect(revealed.solution).toHaveLength(s.stages.length - 1);
    const done = (
      await post(
        `/scenarios/${s.id}/step`,
        { version: 2, actions: [first, ...revealed.solution] },
        c,
      )
    ).json();
    expect(done.completed).toBe(true);
    expect(done.saved).toBe(false);
  }
}, 30000);
it('v2 progress resumes server-validated prefixes and awards XP idempotently without losing legacy progress', async () => {
  const a = await register();
  const s = scenarios.find((v) => v.id === 'wayline-tactic-exchange-plan')!;
  await post(`/learn/${lessons[0].id}/complete`, { action: lessons[0].answer }, a.cookie);
  const before = Number(
    (await pool.query('SELECT sum(amount) xp FROM experience WHERE user_id=$1', [a.id])).rows[0].xp,
  );
  const first = solutions(s)[0];
  const prefix = replayScenario(s, [first]);
  const second = solutions(s, prefix.state, 1)[0];
  await post(`/scenarios/${s.id}/step`, { version: 2, actions: [first] }, a.cookie);
  expect(
    Number(
      (await pool.query('SELECT sum(amount) xp FROM experience WHERE user_id=$1', [a.id])).rows[0]
        .xp,
    ),
  ).toBe(before);
  const resumed = (
    await post(`/scenarios/${s.id}/step`, { version: 2, actions: [first] }, a.cookie)
  ).json();
  expect(resumed.state).toEqual(prefix.state);
  for (let repeat = 0; repeat < 2; repeat++) {
    const r = await post(
      `/scenarios/${s.id}/step`,
      { version: 2, actions: [first, second] },
      a.cookie,
    );
    expect(r.statusCode).toBe(200);
    expect(r.json().saved).toBe(true);
  }
  const done = (await get('/scenarios', a.cookie))
    .json()
    .scenarios.find((v: { id: string }) => v.id === s.id);
  expect(done.completed).toBe(true);
  expect((await get('/learn', a.cookie)).json().lessons[0].completed).toBe(true);
  expect(
    Number(
      (await pool.query('SELECT sum(amount) xp FROM experience WHERE user_id=$1', [a.id])).rows[0]
        .xp,
    ),
  ).toBe(before + 15);
  const guestItems = (await get('/scenarios', await guest())).json().scenarios;
  expect(guestItems.every((v: { completed: boolean }) => !v.completed)).toBe(true);
});
