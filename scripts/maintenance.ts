import { pool } from '../apps/server/src/database';
const apply = process.argv.includes('--apply');
// Match histories and XP/rating ledgers are intentionally retained. These are
// needed for replay, accounting and abuse checks, unlike expired ephemeral data.
const policies = [
  ['sessions', 'expires_at < now()'],
  ['auth_tokens', 'expires_at < now()'],
  ['account_devices', "seen_at < now() - interval '90 days'"],
  ['notifications', "read = true AND created_at < now() - interval '90 days'"],
  ['chess_queue', "heartbeat_at < now() - interval '1 day'"],
  ['board_queue', "heartbeat_at < now() - interval '1 day'"],
  [
    'chess_matches',
    "status='waiting' AND created_at < now() - interval '30 days' AND NOT EXISTS (SELECT 1 FROM chess_matches previous WHERE previous.rematch_id=chess_matches.id) AND NOT EXISTS (SELECT 1 FROM chess_queue q WHERE q.matched_id=chess_matches.id)",
  ],
  [
    'board_matches',
    "status='waiting' AND created_at < now() - interval '30 days' AND NOT EXISTS (SELECT 1 FROM board_matches previous WHERE previous.rematch_id=board_matches.id) AND NOT EXISTS (SELECT 1 FROM board_queue q WHERE q.matched_id=board_matches.id)",
  ],
] as const;
try {
  for (const [table, condition] of policies) {
    const count = (await pool.query(`SELECT count(*) FROM ${table} WHERE ${condition}`)).rows[0]
      .count;
    console.log(`${table}: ${count} ${apply ? 'expired records to remove' : '(dry run)'}`);
    if (apply) await pool.query(`DELETE FROM ${table} WHERE ${condition}`);
  }
  console.log(
    'Match histories retained. Use provider storage alerts; never auto-upgrade to paid capacity.',
  );
} finally {
  await pool.end();
}
