import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeAll(async () => {
  test.setTimeout(70000);
  await new Promise((resolve) => setTimeout(resolve, 61000));
});
test('navigation, full localization, search and theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Готовий до партії?' })).toBeVisible();
  await page.getByRole('button', { name: 'Змінити мову' }).click();
  await page.getByRole('menuitem', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ready to play?' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ready to play?' })).toBeVisible();
  await page.goto('/games');
  await page.getByRole('searchbox').fill('chess');
  await expect(page.locator('.game-card')).toHaveCount(1);
  await page.locator('.game-card').getByRole('link', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chess' })).toBeVisible();
  await page.getByRole('button', { name: 'Change theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/not-a-route');
  await expect(page.getByRole('heading', { name: 'This page is off the board.' })).toBeVisible();
});
test('real registration, session reload and logout', async ({ page }) => {
  const id = `e2e_${Date.now()}`;
  await page.goto('/register');
  await page.getByLabel('Електронна пошта', { exact: true }).fill(`${id}@example.test`);
  await page.getByLabel('Ім’я користувача').fill(id);
  await page.getByLabel('Пароль', { exact: true }).fill('Local Browser Passphrase!');
  // Registration includes password hashing and local email delivery. On a shared
  // CI runner it may exceed the default 5s UI assertion budget; still require a
  // real successful server response rather than masking errors with retries.
  const registration = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/register') && response.request().method() === 'POST',
    { timeout: 20000 },
  );
  await page.getByRole('button', { name: 'Створити акаунт', exact: true }).click();
  expect((await registration).status()).toBe(201);
  await expect(page).toHaveURL(/account/);
  await expect(page.getByRole('heading', { name: id })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: id })).toBeVisible();
  await expect(
    page.locator('.topbar').getByRole('button', { name: 'Вийти', exact: true }),
  ).toHaveCount(0);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Вийти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Гостьовий профіль' })).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Увійти', exact: true }).click();
  await page.getByLabel('Електронна пошта', { exact: true }).fill(`${id}@example.test`);
  await page.getByLabel('Пароль', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Увійти', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Неправильна пошта або пароль.');
  await page.getByLabel('Пароль', { exact: true }).fill('Local Browser Passphrase!');
  await page.getByRole('button', { name: 'Увійти', exact: true }).click();
  await expect(page.getByRole('heading', { name: id })).toBeVisible();
});
test('keyboard skip link and server outage recovery', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'SERVICE_UNAVAILABLE' }),
    }),
  );
  await page.goto('/account');
  await expect(
    page.getByText('Не вдалося перевірити сесію. Можливо, сервер недоступний.'),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Перейти до вмісту' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: 'Спробувати ще раз' }).click();
  await expect(page.getByRole('heading', { name: 'Гостьовий профіль' })).toBeVisible();
});
test('phone navigation and offline state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Відкрити навігацію' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Каталог ігор' }).click();
  await expect(page.getByRole('heading', { name: 'Ігри' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Відкрити навігацію' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.context().setOffline(true);
  await expect(page.getByText('Немає з’єднання. Підключися, щоб продовжити.')).toBeVisible();
  await page.context().setOffline(false);
});
test('no horizontal overflow on target widths and all main pages', async ({ page }) => {
  test.setTimeout(120000);
  // This layout matrix does not exercise authentication; avoid flooding the shared
  // loopback IP with StrictMode's repeated session checks over 56 navigations.
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    }),
  );
  await page.route('**/api/chess/player', (route) =>
    route.fulfill({ json: { player: { name: 'Guest' } } }),
  );
  await page.route('**/api/platform/recent', (route) => route.fulfill({ json: { matches: [] } }));
  await page.route('**/api/platform/profile', (route) =>
    route.fulfill({ json: { profile: null, guest: true } }),
  );
  await page.route('**/api/daily', (route) =>
    route.fulfill({ json: { day: '2026-10-11', lesson: 'chess-pawn' } }),
  );
  await page.route('**/api/chess/matches', (route) => route.fulfill({ json: { matches: [] } }));
  await page.route('**/api/learn', (route) => route.fulfill({ json: { lessons: [] } }));
  for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      '/',
      '/games',
      '/games/chess',
      '/games/checkers',
      '/games/wayline',
      '/register',
      '/login',
      '/settings',
      '/account',
      '/learn',
    ]) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${path} at ${width}px`,
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/games/chess');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('capture real desktop and mobile interface', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/screenshots/overview-desktop.png', fullPage: true });
  await page.screenshot({ path: 'docs/screenshots/overview-preview.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/screenshots/overview-mobile.png', fullPage: true });
  await page.goto('/games');
  await expect(page.locator('h1')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/library-mobile.png', fullPage: true });
});
test('WCAG automatic checks on public pages and interactive lessons', async ({ page }) => {
  test.setTimeout(90000);
  const { lessons } = await import('../../packages/shared/src/lessons');
  await page.route('**/api/**', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1);
    return route.fulfill({
      json: {
        user: null,
        profile: null,
        guest: true,
        matches: [],
        lessons: [],
        players: [],
        season: [],
        lesson: lessons.find((l) => l.id === id) ?? 'chess-pawn',
      },
    });
  });
  for (const theme of ['dark', 'light']) {
    await page.addInitScript((value) => localStorage.setItem('plyvra-theme', value), theme);
    for (const path of [
      '/',
      '/games',
      '/login',
      '/register',
      '/account',
      '/settings',
      '/learn/chess/chess-pawn',
      '/leaderboards',
    ]) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
        `${path}, ${theme}`,
      ).toEqual([]);
    }
  }
});
