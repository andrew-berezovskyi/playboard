# План реалізації

Кожен етап закінчується перевірками, виправленнями і звітом у docs/STATUS.md. Робота лише локальна, публікація тільки після дозволу.

0. Дослідження: вимоги, бренд, дизайн, стек/ліцензії, схема даних, безкоштовний хостинг і ризики. Результат: ARCHITECTURE/DATABASE/GAME_RULES/DEPLOYMENT.
1. Каркас: frontend/backend/PostgreSQL, міграції, UA/EN, responsive navigation, home/catalog/три game detail pages, register/login/logout/session, email verification/reset локально, profile, error/offline states. Gate: typecheck, lint, build, security/auth integration на реальній БД, browser E2E, ширини 320–1920.
2. Повні шахи: chess.js adapter, claim/automatic draw distinctions, власна дошка tap/drag/keyboard, workers bot difficulty, Socket.IO, гості/приватні кімнати/матчмейкінг, clocks, PGN/FEN/replay, persistence. Gate: всі спеціальні правила, два клієнти, reconnect/restart, IDOR/idempotency/clock races, bots.
3. Шашки 8×8: зафіксований variant, backward captures, flying kings, multi-capture promotion, draw counters, alpha-beta bots; спільні матчі/рейтинг. Gate: rule fixtures і online vertical slice.
4. Wayline: власні картки й графіка, exchange механіка + власна relay-варіація, worker bots, online, tutorial/rating contracts. Gate: правила/повторення/no-legal-action/перемога і touch UX.
5. Навчання й маскот: виконувані сценарії трьох ігор, перевірка дії, tutorial progress у БД, Кіп SVG emotions/reduced motion. Gate: урок неможливо пройти кнопкою Next без завдання.
6. Соціальний прогрес: Glicko-2, XP ledger, leagues/seasons, timezone streak, achievements, friends/block/privacy, notifications/cosmetics. Gate: exactly-once rewards, non-ranked/bot exclusions, privacy/anti-abuse, calendar boundaries.
7. Якість: WCAG, performance/Lighthouse, Safari/Android, production headers, data retention/backup, license review, secret/history audit, CI і документація. Gate: Definition of Done з ТЗ; GitHub/hosting ще потребують окремого дозволу.

Перевірка безпеки, адаптивності й перекладів виконується в кожному етапі, а не відкладається до етапу 7.

Актуальна ітерація: продуктові етапи 3–6 реалізовані локально; етапи 2/3 мають документовані рідкісні суддівські обмеження, етап 7 — відкриті release gates. Деталі в PLATFORM_IMPLEMENTATION.md і STATUS.md.

Ітерація продовження: курси/навчальні партії, додаткова кастомізація, shared-browser anti-farming, частина суддівських крайових випадків, backup/restore, maintenance, TLS/proxy і двомовний README додані. Повний залишок ТЗ та фактичні перевірки — у ITERATION_2026-10-11.md; статус beta зберігається.
