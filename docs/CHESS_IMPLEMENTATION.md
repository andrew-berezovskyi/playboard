# Шахи — локальний вертикальний зріз

Стан: **beta**, етап 2 ще не закрито повністю. Шашки, Wayline і рейтинги вже реалізовані локально; актуальний обсяг — PLATFORM_IMPLEMENTATION.md.

## Реалізовано

- chess.js як перевірений генератор ходів: рокірування, en passant, перетворення на чотири фігури, шах/мат/пат, SAN/FEN/PGN.
- Окремі заяви триразового повторення/50 ходів, у тому числі із запланованим ходом; автоматичні п’ятиразове повторення/75 ходів. Результат вирішує сервер.
- Tap, drag, клавіатура, поворот дошки, допустимі ходи, останній хід/шах, історія, replay завершеної партії, експорт PGN, копіювання FEN, два оформлення дошки, звук за бажанням.
- Гостьова HttpOnly identity або наявний акаунт. Приватні запрошення, справжня черга двох людей із однаковим time control. Усі матчі поки нерейтингові.
- Серверні контролі none, 1+0, 3+0, 3+2, 5+0, 10+0, 15+10. Час зберігається у PostgreSQL; сервер враховує elapsed time і після restart, increment лише за законний хід.
- Три рівні власного negamax/alpha-beta бота в Node worker_threads. Межі часу/глибини, аварійне завершення worker, повторна серверна валідація відповіді. Stockfish не інтегрований; відповідних GPL-залежностей не додано.
- Версійовані команди з UUID actionId, транзакції й row lock, idempotent повтор, IDOR/turn/version checks, атомарний запис результату й події до broadcast.
- Socket.IO через WebSocket із exact Origin та cookie authentication. При втраті мережі клієнт відключається, після відновлення приєднується й отримує актуальний snapshot. Серверні таймери продовжуються. Реванш приватної партії починається після згоди обох гравців.

## API

POST `/api/chess/player` ініціалізує гостьовий cookie за потреби. POST `/api/chess/matches` приймає mode private/bot, side w/b/random, difficulty beginner/intermediate/advanced, timeControl. GET `/api/chess/matches` повертає власні останні матчі. GET `/api/chess/matches/:id` доступний лише учаснику. POST `/api/chess/join` приймає invite (48 hex символів; у БД лише hash).

POST `/api/chess/matches/:id/actions`: `{actionId, expectedVersion, action}`. Дії: move, resign, offer_draw, accept_draw, decline_draw, claim_draw із optional intendedMove. POST `/api/chess/matches/:id/rematch`, POST `/api/chess/queue` із timeControl, POST `/api/chess/queue/cancel`.

Socket path `/socket.io`: `match:join` із matchId і acknowledgement; `match:action` із тією ж командою та acknowledgement `{match}`/`{error}`. `match:changed` сигналізує перечитати snapshot. Handshake має передавати Origin із ALLOWED_ORIGINS; локальний Vite proxy підтримує WS. Production proxy також повинен підтримувати upgrade.

## Зберігання

Міграції 0002_chess.sql і 0003_rematch_consent.sql: chess_matches (стан, clocks, status/version/result, rematch), chess_participants (учасники, сторони), chess_events (унікальні match/actionId і match/sequence), chess_queue (реальні identities та heartbeat). Queue stale після 45 секунд; матчі/історія зберігаються. Production retention та cleanup покинутих кімнат ще треба додати. SQL parameterized; ігрові таблиці наразі використовуються через pg, а auth — через Drizzle.

## Незакриті вимоги етапу 2

Повна перевірка рідкісних FIDE dead positions і можливості мату конкретної сторони при timeout ще потребує окремого adjudicator. Поточна оцінка покриває голого короля та стандартний insufficient material, але складні заблоковані позиції й деякі minor-piece cases не можна оголосити повністю відповідними FIDE. Тому статус beta є навмисним, а етап не оголошено завершеним.

Бот початківця/середнього/просунутого — власний пошук із різними бюджетами, без обіцянки Stockfish strength. Публічний антиаб’юз, distributed presence/matchmaking, cleanup/retention, фізичні iOS/Android й перевірка production proxy/безкоштовного хостингу залишаються release gates. Сервер наразі розрахований на один процес, як у поточній архітектурі.

## Локальний перегляд

Відкрити http://localhost:5173/games/chess. Для приватної гри: створити кімнату, скопіювати запрошення, відкрити його в іншому browser profile/інкогніто й приєднатися. Дві вкладки одного профілю мають одну identity і не є двома гравцями.

11.10 update: одиночний кінь/одноколірні слони й блокувальний матеріал суперника враховуються для timeout та resignation; додано доказ деяких незмінних пішакових бар’єрів. Універсальний adjudicator інших dead positions залишається відкритим. Підготовлено й перевірено операційні backup/restore і retention tooling; див. OPERATIONS.md.
