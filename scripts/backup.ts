import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { config } from '../apps/server/src/config';
const restore = process.argv.includes('--restore');
const fileArg = process.argv.find((v) => v.startsWith('--file='))?.slice(7);
if (restore && (!fileArg || !process.argv.includes('--confirm-overwrite')))
  throw new Error(
    'Restore requires --file=<dump> --confirm-overwrite. It replaces the configured database contents.',
  );
const directory = resolve('.local/backups');
await mkdir(directory, { recursive: true });
const file = fileArg
  ? resolve(fileArg)
  : join(directory, `playboard-${new Date().toISOString().replaceAll(':', '-')}.dump`);
if (restore && !(await stat(file)).isFile()) throw new Error('Dump file is missing');
const url = new URL(config.DATABASE_URL);
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGSSLMODE:
    url.searchParams.get('sslmode') ??
    (config.NODE_ENV === 'production' ? 'verify-full' : 'disable'),
};
const tool = restore ? 'pg_restore' : 'pg_dump';
const executable = process.env.PG_BIN
  ? join(process.env.PG_BIN, tool + (process.platform === 'win32' ? '.exe' : ''))
  : tool;
const args = restore
  ? [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      '--single-transaction',
      '--dbname',
      env.PGDATABASE,
      file,
    ]
  : ['--format=custom', '--no-owner', '--no-acl', '--file', file];
await new Promise<void>((ok, fail) => {
  const child = spawn(executable, args, {
    env,
    stdio: ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  });
  child.on('error', () =>
    fail(new Error('PostgreSQL client unavailable. Set PG_BIN to its bin directory.')),
  );
  child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${tool} failed (${code})`))));
});
console.log(`${restore ? 'Restored' : 'Backup saved'}: ${file}`);
