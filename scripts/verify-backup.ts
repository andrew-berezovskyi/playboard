import pg from 'pg';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const base = 'postgresql://postgres:local-development-only@127.0.0.1:54329/';
const name = 'playboard_backup_' + randomUUID().replaceAll('-', '').slice(0, 12);
const admin = new pg.Client({ connectionString: base + 'postgres' });
await admin.connect();
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: base + name,
  PG_BIN: process.env.PG_BIN ?? resolve('.local/tools/pg-client'),
};
const run = (args: string[]) =>
  new Promise<void>((ok, fail) => {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', ...args], {
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', fail);
    child.on('exit', (c) => (c === 0 ? ok() : fail(new Error('Backup check subprocess failed'))));
  });
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  await run(['scripts/migrate.ts']);
  const db = new pg.Client({ connectionString: base + name });
  await db.connect();
  const user = (
    await db.query(
      "INSERT INTO users(email,username,password_hash) VALUES('backup@example.test','backup_fixture','fixture-not-an-auth-password') RETURNING id",
    )
  ).rows[0].id;
  await db.query('INSERT INTO user_profiles(user_id,preferences) VALUES($1,$2)', [
    user,
    JSON.stringify({ cards: 'diagram', captureEffect: false }),
  ]);
  await db.end();
  await run(['scripts/backup.ts', '--file=.local/backups/verification.dump']);
  const changed = new pg.Client({ connectionString: base + name });
  await changed.connect();
  await changed.query('DELETE FROM users');
  await changed.end();
  await run([
    'scripts/backup.ts',
    '--restore',
    '--file=.local/backups/verification.dump',
    '--confirm-overwrite',
  ]);
  const restored = new pg.Client({ connectionString: base + name });
  await restored.connect();
  const row = (
    await restored.query('SELECT preferences FROM user_profiles WHERE user_id=$1', [user])
  ).rows[0];
  if (row?.preferences.cards !== 'diagram' || row.preferences.captureEffect !== false)
    throw new Error('Restore differs from backup');
  await restored.end();
  console.log('Backup/restore verified with foreign keys, UUID and JSONB in an isolated database.');
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}
