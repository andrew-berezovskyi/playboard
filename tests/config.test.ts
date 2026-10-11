import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function hostedConfig(overrides: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://fixture:fixture@db.example.com/playboard?sslmode=verify-full',
    RENDER_EXTERNAL_URL: 'https://playboard-test.onrender.com',
    MAIL_TRANSPORT: 'brevo',
    BREVO_API_KEY: 'test-provider-key',
    MAIL_FROM_EMAIL: 'sender@example.com',
    DOTENV_CONFIG_PATH: join(tmpdir(), 'playboard-no-dotenv-fixture'),
    ...overrides,
  };
  delete env.WEB_ORIGIN;
  delete env.ALLOWED_ORIGINS;
  return execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "import {config,origins} from './apps/server/src/config.ts'; console.log(JSON.stringify({origin:config.WEB_ORIGIN,allowed:[...origins]}))",
    ],
    { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}
it('uses the actual Render HTTPS address for the single-origin allowlist', () => {
  expect(JSON.parse(hostedConfig())).toEqual({
    origin: 'https://playboard-test.onrender.com',
    allowed: ['https://playboard-test.onrender.com'],
  });
});
it('rejects insecure hosted origins, unverified database TLS and missing mail credentials', () => {
  expect(() =>
    hostedConfig({ RENDER_EXTERNAL_URL: 'http://playboard-test.onrender.com' }),
  ).toThrow();
  expect(() =>
    hostedConfig({
      DATABASE_URL: 'postgresql://fixture:fixture@db.example.com/playboard?sslmode=require',
    }),
  ).toThrow();
  expect(() => hostedConfig({ BREVO_API_KEY: '' })).toThrow();
});
