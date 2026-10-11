import { db, pool } from '../apps/server/src/database';
import { users } from '../apps/server/src/schema';
import { hashPassword } from '../apps/server/src/app';
import { config } from '../apps/server/src/config';
if (
  config.NODE_ENV !== 'development' ||
  !['localhost', '127.0.0.1'].includes(new URL(config.DATABASE_URL).hostname)
)
  throw new Error('Seed allowed only on a local development database');
const passwordHash = await hashPassword('LocalDemoOnly!2026');
await db
  .insert(users)
  .values({
    email: 'demo@plyvra.local',
    username: 'demo_player',
    passwordHash,
    emailVerified: true,
  })
  .onConflictDoNothing();
console.log('Local demo: demo@plyvra.local / LocalDemoOnly!2026');
await pool.end();
