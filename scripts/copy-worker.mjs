import { copyFile } from 'node:fs/promises';
await copyFile('apps/server/src/bot-worker.mjs', 'dist/server/bot-worker.mjs');
