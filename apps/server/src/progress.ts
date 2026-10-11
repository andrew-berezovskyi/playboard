import type { PoolClient } from 'pg';
import { glicko2, type Rating } from '../../../packages/shared/src/rating';
import type { Outcome } from '../../../packages/shared/src/contracts';
export async function awardActivity(c: PoolClient, userId: string, source: string, amount: number) {
  await c.query('INSERT INTO user_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING', [userId]);
  await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
  const day = (
    await c.query<{ day: string }>(
      'SELECT to_char(now() AT TIME ZONE timezone,\'YYYY-MM-DD\') AS "day" FROM user_profiles WHERE user_id=$1',
      [userId],
    )
  ).rows[0].day;
  const inserted = await c.query(
    'INSERT INTO experience(user_id,source,amount) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING source',
    [userId, source, amount],
  );
  if (!inserted.rowCount) return false;
  await c.query('INSERT INTO daily_activity(user_id,day) VALUES($1,$2) ON CONFLICT DO NOTHING', [
    userId,
    day,
  ]);
  return true;
}
type Seat = { user_id: string | null; side: 'w' | 'b'; identity: string };
export async function recordResult(
  c: PoolClient,
  game: string,
  row: {
    id: string;
    result: Outcome | null;
    ranked?: boolean;
    time_control: string;
    mode: string;
    state: { moves?: unknown[]; history?: unknown[] };
  },
) {
  if (!row.result) return;
  const table = game === 'chess' ? 'chess_participants' : 'board_participants';
  const seats = (
    await c.query<Seat>(`SELECT user_id,side,identity FROM ${table} WHERE match_id=$1`, [row.id])
  ).rows;
  const accounts = seats
    .filter((s) => s.user_id)
    .sort((a, b) => a.user_id!.localeCompare(b.user_id!));
  for (const s of accounts)
    await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [s.user_id]);
  const linked =
    accounts.length === 2 &&
    !!(
      await c.query(
        "SELECT 1 FROM account_devices a JOIN account_devices b ON a.device_hash=b.device_hash WHERE a.user_id=$1 AND b.user_id=$2 AND a.seen_at>now()-interval '90 days' AND b.seen_at>now()-interval '90 days' LIMIT 1",
        [accounts[0].user_id, accounts[1].user_id],
      )
    ).rowCount;
  const bot = row.mode === 'bot',
    eligible =
      accounts.length === 2 &&
      !linked &&
      !bot &&
      ((row.state.moves?.length ?? row.state.history?.length ?? 0) >= 6 ||
        !['resignation', 'timeout', 'agreement'].includes(row.result.reason));
  const inserted: Seat[] = [];
  for (const s of accounts) {
    const other = seats.find((p) => p.side !== s.side),
      score =
        row.result.winner === null
          ? 0.5
          : row.result.winner === (s.side === 'w' ? 'first' : 'second')
            ? 1
            : 0;
    const r = await c.query(
      'INSERT INTO match_results(match_id,user_id,game,opponent_id,score,rated,bot) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING user_id',
      [row.id, s.user_id, game, other?.user_id ?? null, score, !!row.ranked && eligible, bot],
    );
    if (!r.rowCount) continue;
    inserted.push(s);
    if (eligible) {
      const count = Number(
        (
          await c.query<{ count: string }>(
            "SELECT count(*) FROM match_results WHERE user_id=$1 AND opponent_id=$2 AND created_at>=date_trunc('day',now())",
            [s.user_id, other?.user_id],
          )
        ).rows[0].count,
      );
      if (count <= 3)
        await awardActivity(c, s.user_id!, `match:${row.id}`, 30 + (score === 1 ? 20 : 0));
    }
    if (score === 1)
      await c.query(
        "INSERT INTO achievements(user_id,code) VALUES($1,'first_win') ON CONFLICT DO NOTHING",
        [s.user_id],
      );
    const count = Number(
      (
        await c.query<{ count: string }>('SELECT count(*) FROM match_results WHERE user_id=$1', [
          s.user_id,
        ])
      ).rows[0].count,
    );
    if (count >= 10)
      await c.query(
        "INSERT INTO achievements(user_id,code) VALUES($1,'ten_games') ON CONFLICT DO NOTHING",
        [s.user_id],
      );
    if (
      Number(
        (
          await c.query<{ count: string }>(
            'SELECT count(DISTINCT game) FROM match_results WHERE user_id=$1',
            [s.user_id],
          )
        ).rows[0].count,
      ) === 3
    )
      await c.query(
        "INSERT INTO achievements(user_id,code) VALUES($1,'three_games') ON CONFLICT DO NOTHING",
        [s.user_id],
      );
  }
  if (!row.ranked || !eligible || inserted.length !== 2) return;
  // Prevent repeated same-pair games from farming a ranked pool in a UTC day.
  const pairCount = Number(
    (
      await c.query<{ count: string }>(
        "SELECT count(*) FROM match_results WHERE user_id=$1 AND opponent_id=$2 AND rated=true AND created_at>=date_trunc('day',now())",
        [accounts[0].user_id, accounts[1].user_id],
      )
    ).rows[0].count,
  );
  if (pairCount > 3) {
    await c.query('UPDATE match_results SET rated=false WHERE match_id=$1', [row.id]);
    return;
  }
  const pool =
    game === 'chess'
      ? `chess:${['1+0'].includes(row.time_control) ? 'bullet' : ['3+0', '3+2', '5+0'].includes(row.time_control) ? 'blitz' : 'rapid'}`
      : game;
  const prior = new Map<string, Rating>();
  for (const s of accounts) {
    await c.query('INSERT INTO ratings(user_id,pool) VALUES($1,$2) ON CONFLICT DO NOTHING', [
      s.user_id,
      pool,
    ]);
    const r = (
      await c.query<Rating>(
        'SELECT rating,deviation,volatility FROM ratings WHERE user_id=$1 AND pool=$2 FOR UPDATE',
        [s.user_id, pool],
      )
    ).rows[0];
    prior.set(s.user_id!, r);
  }
  for (const s of accounts) {
    const other = accounts.find((o) => o.side !== s.side)!,
      score =
        row.result.winner === null
          ? 0.5
          : row.result.winner === (s.side === 'w' ? 'first' : 'second')
            ? 1
            : 0,
      before = prior.get(s.user_id!)!,
      next = glicko2(before, [{ ...prior.get(other.user_id!)!, score }]);
    await c.query(
      'UPDATE ratings SET rating=$3,deviation=$4,volatility=$5,games=games+1 WHERE user_id=$1 AND pool=$2',
      [s.user_id, pool, next.rating, next.deviation, next.volatility],
    );
    await c.query(
      'INSERT INTO rating_history(match_id,user_id,pool,before_rating,after_rating) VALUES($1,$2,$3,$4,$5)',
      [row.id, s.user_id, pool, before.rating, next.rating],
    );
  }
}
