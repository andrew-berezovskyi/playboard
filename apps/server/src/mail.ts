import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from './config';
export async function sendAuthMail(email: string, token: string, purpose: 'verify' | 'reset') {
  const route = purpose === 'verify' ? 'verify-email' : 'reset-password';
  // The fragment is not sent to HTTP servers/referrer logs. The browser posts it as JSON.
  const link = `${config.WEB_ORIGIN}/${route}#${token}`;
  const subject =
    purpose === 'verify'
      ? 'Playboard — confirm your email / Підтвердіть email'
      : 'Playboard — reset your password / Відновіть пароль';
  const text = `${subject}\n\n${link}\n\nIf you did not request this, ignore this message. / Якщо ви цього не запитували, ігноруйте лист.`;
  if (config.MAIL_TRANSPORT === 'outbox') {
    if (config.NODE_ENV === 'production') throw new Error('Local outbox forbidden in production');
    await mkdir('.local/mail', { recursive: true });
    await writeFile(
      `.local/mail/${Date.now()}-${randomUUID()}.json`,
      JSON.stringify({ to: email, subject, text }, null, 2),
      { mode: 0o600 },
    );
    return;
  }
  if (config.MAIL_TRANSPORT === 'brevo') {
    if (!config.BREVO_API_KEY || !config.MAIL_FROM_EMAIL)
      throw new Error('Email provider is not configured');
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Playboard', email: config.MAIL_FROM_EMAIL },
        to: [{ email }],
        subject,
        textContent: text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    // Never include the provider body: it can echo addresses or sensitive links.
    if (!response.ok) throw new Error('Email provider rejected delivery');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('messageId' in result))
      throw new Error('Email provider did not acknowledge delivery');
    return;
  }
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    requireTLS: config.NODE_ENV === 'production',
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: config.SMTP_FROM, to: email, subject, text });
}
