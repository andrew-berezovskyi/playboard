import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
const client = new pg.Client({
  connectionString: 'postgresql://postgres:local-development-only@127.0.0.1:54329/postgres',
});
await client.connect();
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='plyvra_test'")).rowCount)
  await client.query('CREATE DATABASE plyvra_test');
await client.end();
const test = new pg.Client({
  connectionString: 'postgresql://postgres:local-development-only@127.0.0.1:54329/plyvra_test',
});
await test.connect();
try {
  await test.query('BEGIN');
  await test.query('SELECT pg_advisory_xact_lock(726451)');
  await test.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const name of (await readdir('apps/server/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    if ((await test.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount)
      continue;
    await test.query(await readFile(`apps/server/migrations/${name}`, 'utf8'));
    await test.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
  }
  await test.query('COMMIT');
} catch (error) {
  await test.query('ROLLBACK');
  throw error;
} finally {
  await test.end();
}
