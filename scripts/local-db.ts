import 'dotenv/config';
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
if (process.env.NODE_ENV === 'production') throw new Error('Local PostgreSQL is development-only');
await mkdir('.local', { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: '.local/postgres-utf8',
  user: 'postgres',
  password: 'local-development-only',
  port: 54329,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
});
if (!existsSync('.local/postgres-utf8/PG_VERSION')) await pg.initialise();
await pg.start();
const client = pg.getPgClient('postgres', '127.0.0.1');
await client.connect();
const existing = await client.query("SELECT 1 FROM pg_database WHERE datname='plyvra'");
await client.end();
if (!existing.rowCount) await pg.createDatabase('plyvra');
console.log('PostgreSQL ready on 127.0.0.1:54329. Keep this terminal open; Ctrl+C stops it.');
async function stop() {
  await pg.stop();
  process.exit(0);
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
setInterval(() => {}, 60000);
