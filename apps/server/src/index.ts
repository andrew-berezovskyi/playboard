import { buildApp } from './app';
import { config } from './config';
import { pool } from './database';
const app = await buildApp();
await app.listen({ host: config.HOST, port: config.PORT });
async function stop() {
  await app.close();
  await pool.end();
  process.exit(0);
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
