import { afterAll, beforeAll, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerWeb } from '../apps/server/src/web';

const app = Fastify();
let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'playboard-web-'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Playboard</title>');
  await writeFile(join(root, 'assets', 'app-abcd.js'), 'console.log("app")');
  await writeFile(join(root, '_headers'), 'private deployment metadata');
  app.get('/api/health', async () => ({ status: 'ok' }));
  await registerWeb(app, root);
});
afterAll(async () => {
  await app.close();
  if (root) await rm(root, { recursive: true, force: true });
});
it('serves deep SPA routes while preserving API and asset errors', async () => {
  for (const method of ['GET', 'HEAD'] as const) {
    const response = await app.inject({ method, url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    if (method === 'HEAD') expect(response.body).toBe('');
  }
  for (const path of ['/', '/learn/chess/course', '/play/chess/123?training=1']) {
    const response = await app.inject({ url: path, headers: { accept: 'text/html' } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toContain('Playboard');
  }
  expect((await app.inject('/api/health')).json()).toEqual({ status: 'ok' });
  for (const path of [
    '/api/missing',
    '/socket.io/missing',
    '/assets/missing.js',
    '/.env',
    '/_headers',
  ])
    expect((await app.inject({ url: path, headers: { accept: 'text/html' } })).statusCode).toBe(
      404,
    );
  const asset = await app.inject('/assets/app-abcd.js');
  expect(asset.statusCode).toBe(200);
  expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  expect((await app.inject({ method: 'POST', url: '/learn/chess' })).statusCode).toBe(404);
});
