import staticFiles from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'node:path';

// A single origin keeps session cookies and Socket.IO on the same HTTPS host.
export async function registerWeb(app: FastifyInstance, root = resolve('dist/web')) {
  app.addHook('onRoute', (route) => {
    if (route.config && 'file' in route.config) route.config.rateLimit = false;
  });
  await app.register(staticFiles, {
    root,
    wildcard: false,
    index: false,
    dotfiles: 'deny',
    allowedPath: (path) => !path.split(/[\\/]/).some((part) => part.startsWith('_')),
    setHeaders(response, path) {
      response.header(
        'Cache-Control',
        path.endsWith('.html')
          ? 'no-store'
          : /[\\/]assets[\\/]/.test(path)
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
      );
    },
  });
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0];
    if (
      ['GET', 'HEAD'].includes(request.method) &&
      request.headers.accept?.includes('text/html') &&
      !/^\/(api|socket\.io|assets|fonts)(\/|$)/.test(path) &&
      !path.split('/').some((part) => part.startsWith('_')) &&
      !path.includes('.')
    )
      return reply.header('Cache-Control', 'no-store').sendFile('index.html');
    return reply.code(404).send({ error: 'NOT_FOUND' });
  });
}
