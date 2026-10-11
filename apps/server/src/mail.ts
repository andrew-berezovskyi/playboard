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
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    requireTLS: config.NODE_ENV === 'production',
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: config.SMTP_FROM, to: email, subject, text });
}
