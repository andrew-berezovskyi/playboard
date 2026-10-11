import pg from 'pg';
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from './config';
import * as schema from './schema';
const databaseUrl = new URL(config.DATABASE_URL);
if (config.NODE_ENV === 'production') {
  // URI ssl parameters otherwise override pg's verified SSL configuration.
  for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
    databaseUrl.searchParams.delete(parameter);
}
export const pool = new pg.Pool({
  connectionString: databaseUrl.toString(),
  max: 5,
  connectionTimeoutMillis: 5000,
  ...(config.NODE_ENV === 'production'
    ? {
        ssl: {
          rejectUnauthorized: true,
          ...(config.DATABASE_SSL_CA_FILE
            ? { ca: readFileSync(config.DATABASE_SSL_CA_FILE, 'utf8') }
            : {}),
        },
      }
    : {}),
});
export const db = drizzle(pool, { schema });
