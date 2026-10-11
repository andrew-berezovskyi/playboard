import { afterEach, expect, it, vi } from 'vitest';
import { config } from '../apps/server/src/config';
import { sendAuthMail } from '../apps/server/src/mail';

const previous = {
  MAIL_TRANSPORT: config.MAIL_TRANSPORT,
  BREVO_API_KEY: config.BREVO_API_KEY,
  MAIL_FROM_EMAIL: config.MAIL_FROM_EMAIL,
};
afterEach(() => {
  Object.assign(config, previous);
  vi.unstubAllGlobals();
});
function configure() {
  config.MAIL_TRANSPORT = 'brevo';
  config.BREVO_API_KEY = 'test-provider-key';
  config.MAIL_FROM_EMAIL = 'sender@example.com';
}
it('delivers email via HTTPS with the token in a fragment, not a query', async () => {
  configure();
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: 'test' })));
  vi.stubGlobal('fetch', fetchMock);
  await sendAuthMail('recipient@example.com', 'test-token', 'reset');
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.brevo.com/v3/smtp/email');
  expect(options.headers['api-key']).toBe('test-provider-key');
  const payload = JSON.parse(options.body);
  expect(payload.to).toEqual([{ email: 'recipient@example.com' }]);
  expect(payload.textContent).toContain('/reset-password#test-token');
  expect(payload.textContent).not.toContain('?test-token');
});
it('fails without exposing provider responses or silently using a local outbox', async () => {
  configure();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('secret-provider-body', { status: 401 })),
  );
  await expect(sendAuthMail('recipient@example.com', 'test-token', 'verify')).rejects.toThrow(
    'Email provider rejected delivery',
  );
});
it('requires provider credentials and an acknowledged message', async () => {
  configure();
  config.BREVO_API_KEY = undefined;
  await expect(sendAuthMail('recipient@example.com', 'test-token', 'verify')).rejects.toThrow(
    'Email provider is not configured',
  );
  configure();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  await expect(sendAuthMail('recipient@example.com', 'test-token', 'verify')).rejects.toThrow(
    'Email provider did not acknowledge delivery',
  );
});
