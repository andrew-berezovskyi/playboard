import 'dotenv/config';
import { z } from 'zod';
import { isIP } from 'node:net';
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),
  TRUSTED_PROXY_CIDRS: z
    .string()
    .default('')
    .refine((value) =>
      value
        .split(',')
        .filter(Boolean)
        .every((entry) => {
          const [address, prefix] = entry.trim().split('/');
          const version = isIP(address);
          return (
            entry.trim().split('/').length <= 2 &&
            !!version &&
            (prefix === undefined ||
              (/^\d+$/.test(prefix) && Number(prefix) <= (version === 4 ? 32 : 128)))
          );
        }),
    ),
  DATABASE_SSL_CA_FILE: z.string().optional(),
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:local-development-only@127.0.0.1:54329/plyvra'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z
    .string()
    .default(
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173',
    ),
  MAIL_TRANSPORT: z.enum(['outbox', 'smtp']).default('outbox'),
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Playboard <hello@playboard.local>'),
});
export const config = envSchema.parse(process.env);
if (config.NODE_ENV === 'production') {
  if (!process.env.DATABASE_URL || config.DATABASE_URL.includes('local-development-only'))
    throw new Error('Production requires a private DATABASE_URL');
  const sslMode = new URL(config.DATABASE_URL).searchParams.get('sslmode');
  if (sslMode && sslMode !== 'verify-full')
    throw new Error('Production database TLS must verify its certificate and hostname');
  if (
    !config.WEB_ORIGIN.startsWith('https://') ||
    config.MAIL_TRANSPORT !== 'smtp' ||
    !config.SMTP_USER ||
    !config.SMTP_PASSWORD
  )
    throw new Error('Production requires HTTPS and authenticated SMTP');
}
export const origins = new Set(config.ALLOWED_ORIGINS.split(',').map((v) => v.trim()));
if (!origins.has(config.WEB_ORIGIN)) throw new Error('WEB_ORIGIN must be in ALLOWED_ORIGINS');
if (config.NODE_ENV === 'production' && [...origins].some((v) => !v.startsWith('https://')))
  throw new Error('Production origins must use HTTPS');
