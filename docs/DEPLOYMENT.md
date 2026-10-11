# Render Free deployment

The hosting configuration uses one Render Web Service for the frontend, API and Socket.IO, Neon PostgreSQL in Frankfurt, and Brevo's HTTPS transactional email API. Live beta: [playboard-rc19.onrender.com](https://playboard-rc19.onrender.com), launched on 11 October 2026. Both READMEs link to the verified deployment.

## Render service

- GitHub repository: andrew-berezovskyi/playboard, branch main.
- Runtime: Node 24; region Frankfurt; compute plan Free.
- Build: `npm ci --include=dev && npm run build`.
- Start: `npm run db:migrate && npm start`.
- Health check: `/api/ready` (checks PostgreSQL).
- Set `NODE_ENV=production`, `HOST=0.0.0.0`, `SERVE_WEB=true`, `MAIL_TRANSPORT=brevo`.
- Enter `DATABASE_URL`, `BREVO_API_KEY` and the verified sender `MAIL_FROM_EMAIL` only in Render's environment settings. Never commit their values.

The platform-provided `RENDER_EXTERNAL_URL` determines the exact HTTPS origin and allowlist unless explicitly overridden. Frontend routes, API and WebSocket use the same origin, avoiding cross-site session cookies. Only files inside `dist/web` are served; unknown API/assets retain 404 responses. HTML is not cached; content-hashed assets use immutable caching. The source `render.yaml` contains configuration and secret placeholders only.

## Database and email

Use the Neon pooled PostgreSQL connection, changing `sslmode=require` to `sslmode=verify-full`. Production certificate and hostname verification stay enabled. Migrations run transactionally under an advisory lock before the server starts. Never use local fixture credentials or seed production with local data.

Render Free blocks outbound SMTP ports 25, 465 and 587. Brevo sends through HTTPS instead. Its API key and a verified sender are required; local outbox delivery is forbidden in production. The owner received the registration confirmation email and reported successful confirmation on the live site. Password-reset inbox delivery needs a separate user check. Provider API acceptance alone does not prove inbox delivery.

## Free limits and launch checks

Render Free can sleep after 15 minutes without traffic and has shared monthly allowances; the existing hotel service shares the workspace. Its filesystem is ephemeral, so match state and sessions remain in PostgreSQL. Neon and Brevo also enforce quotas. Do not enable paid upgrades or artificial keep-alive traffic.

Before completing launch, check HTTPS and headers, Secure/HttpOnly cookies, direct SPA routes, all three bot games, a real two-client WebSocket match, reconnect, email delivery and database persistence. Proxy CIDRs must be verified against the actual hosting path before trusting forwarded client IPs; the default remains fail-safe and ignores these headers. Backup schedules and quotas require separate operational validation. Physical device/manual accessibility checks and the documented rare game-rule limitations remain open.

Official references: [Render Free](https://render.com/docs/free), [Render environment variables](https://render.com/docs/environment-variables), [Neon](https://neon.com/docs/introduction), [Brevo transactional API](https://developers.brevo.com/docs/send-a-transactional-email).

## Launch verification — 11 October 2026

All seven migrations ran against Neon. The deployed application passed public HTTPS/CSP and readiness checks, Secure/HttpOnly guest cookies, protected-file/API 404 checks, one legal move plus a bot reply in each of the three games, and a two-identity private WebSocket chess match with reconnect restoring its persisted move. The chess UI also restored both moves after reload. Local checks passed 66 server/unit tests, typecheck, lint and build; GitHub CI passed 14 browser scenarios across Chromium, Firefox and WebKit. These checks do not constitute a load test or production operations certification.
