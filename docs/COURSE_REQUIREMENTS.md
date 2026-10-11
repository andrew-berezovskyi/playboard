# Університетські вимоги — Playboard

Щонайменше три сторінки різного наповнення: / — вибір гри та продовження партій; /games — каталог з пошуком; /learn — інтерактивні задачі. Додатково: ігрові lobby/play для трьох ігор, профілі, друзі, рейтинги, налаштування та справжні форми реєстрації/входу.

Семантичний HTML: header/nav/main/section/article/aside, labels, buttons, links. React/TypeScript компілюється у JavaScript. CSS — читабельні файли, без Tailwind.

Grid: app-shell, dashboard-grid, game-grid, play-layout, play-board, settings-grid, lesson-workspace. Flexbox: topbar, навігація, actions, player strips, movement-cards та списки. Медіазапити: 640, 800, 960, 1100, 1280px; телефон показує панель під дошкою. Локальний Fixel підтримує українську. Є focus і skip-to-content, reduced-motion, перемикання звуку й анімацій.

Playwright перевіряє overflow на 320/375/390/430/768/1024/1440/1920px; шахову дошку на тих самих ширинах, шашки та Wayline на 320px і desktop, навчання на 375px. Емуляція Chromium не замінює фізичні iPhone Safari/Android. Результати — STATUS.md.
