import { test, expect, type Page } from '@playwright/test';
import { lessons } from '../../packages/shared/src/lessons';

test.beforeAll(async () => {
  test.setTimeout(70000);
  await new Promise((resolve) => setTimeout(resolve, 61000));
});

test('touch menus, saved preferences and learning on an emulated phone', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.goto('/settings');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    for (const label of await page.locator('.check-label').all())
      expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('combobox', { name: 'Оформлення карток' }).tap();
    await menuFits(page, 'listbox');
    await page.getByRole('option', { name: 'З координатною сіткою', exact: true }).tap();
    await page.getByRole('button', { name: 'Зберегти зміни', exact: true }).tap();
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Оформлення карток' })).toContainText(
      'З координатною сіткою',
    );
    await page.locator('.language-button').tap();
    await menuFits(page, 'menu');
    await page.getByRole('menuitem', { name: 'English', exact: true }).tap();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.locator('.profile-trigger').tap();
    await menuFits(page, 'menu');
    await page.getByRole('menuitem', { name: 'Your account', exact: true }).tap();
    await expect(page).toHaveURL(/account/);
    await page.goto('/learn/chess/chess-bishop');
    await page.locator('[data-square="c1"]').tap();
    await page.locator('[data-square="f4"]').tap();
    await expect(page.getByRole('heading', { name: 'Lesson complete', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
});

async function menuFits(page: Page, role: 'menu' | 'listbox') {
  const menu = page.getByRole(role);
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox(),
    view = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(view.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(view.height + 1);
}

test('real quick play, human-readable recent games and board orientation', async ({ page }) => {
  await page.goto('/');
  await page.locator('.quick-play').getByRole('button', { name: 'Грати', exact: true }).click();
  await expect(page).toHaveURL(/\/play\/chess\//);
  const id = page.url().split('/').at(-1)!;
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('[data-square="e4"]')).toHaveAttribute('aria-label', /Білі Пішак/);
  await expect(page.locator('.board-files span').first()).toHaveText('A');
  await page.getByRole('button', { name: 'Перевернути дошку', exact: true }).click();
  await expect(page.locator('.board-files span').first()).toHaveText('H');
  await expect(page.locator('.board-ranks span').first()).toHaveText('1');
  await page.goto('/');
  const row = page
    .locator('.match-row')
    .filter({ has: page.locator(`a[href="/play/chess/${id}"]`) });
  await expect(row).toContainText('Шахи');
  await expect(row).toContainText('Бот');
  await expect(row).toContainText('Ходів:');
  await expect(row).not.toContainText(id.slice(0, 8));
  await row.getByRole('link', { name: 'Продовжити' }).click();
  await expect(page).toHaveURL(new RegExp(id));
});

test('tactical hints are opt-in and guided exercises explain coordinates', async ({ page }) => {
  await page.goto('/learn/chess/chess-mate');
  await expect(page.locator('.coach-instruction')).not.toContainText('G7');
  await expect(page.locator('.hint-arrow')).toHaveCount(0);
  await expect(page.locator('.hint-square')).toHaveCount(0);
  await page.getByRole('button', { name: 'Показати підказку', exact: true }).click();
  await expect(page.locator('.coach-instruction')).toContainText('G7');
  await expect(page.locator('.hint-arrow')).toBeVisible();
  await page.getByRole('button', { name: 'Сховати підказку', exact: true }).click();
  await expect(page.locator('.hint-arrow')).toHaveCount(0);
  await page.goto('/learn/chess/chess-bishop');
  await expect(page.locator('.coach-instruction')).toContainText('C1');
  await expect(page.locator('.coach-instruction')).toContainText('F4');
  await page.locator('[data-square="c1"]').click();
  await expect(page.getByText('Вибрано: C1', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-square="d1"]')).toBeFocused();
  await page.locator('[data-square="f4"]').click();
  await expect(page.getByRole('heading', { name: 'Урок пройдено', exact: true })).toBeVisible();
});

test('catalog actions, consistent preview surfaces and mobile promotion modal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/games');
  await expect(page.locator('.game-card')).toHaveCount(3);
  const backgrounds = await page
    .locator('.card-art-link')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
  expect(new Set(backgrounds).size).toBe(1);
  for (const [index, game] of ['chess', 'checkers', 'wayline'].entries()) {
    const card = page.locator('.game-card').nth(index);
    await expect(card.getByRole('link', { name: 'Грати', exact: true })).toHaveAttribute(
      'href',
      `/games/${game}`,
    );
    await expect(card.getByRole('link', { name: 'Навчитися грати', exact: true })).toHaveAttribute(
      'href',
      `/learn/${game}/course`,
    );
  }
  await page.goto('/learn/chess/chess-promotion');
  await page.locator('[data-square="a7"]').click();
  await page.locator('[data-square="a8"]').click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  const box = await modal.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await expect(modal.getByRole('button', { name: 'Ферзь', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(page.locator('[data-square="a8"]')).toBeFocused();
  await page.locator('[data-square="a8"]').click();
  await modal.getByRole('button', { name: 'Ферзь', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Урок пройдено', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.locator('.guide').evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none');
});

test('signed-in layout matrix, both languages and themes, every choice menu', async ({ page }) => {
  test.setTimeout(720000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => {
    // Navigating away deliberately cancels in-flight requests. Other failures matter.
    if (r.failure()?.errorText !== 'net::ERR_ABORTED')
      errors.push(`${r.failure()?.errorText} ${r.url()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  const username = `polish_${Date.now()}`;
  await page.goto('/register');
  await page.getByLabel('Електронна пошта', { exact: true }).fill(`${username}@example.test`);
  await page.getByLabel('Ім’я користувача').fill(username);
  await page.getByLabel('Пароль', { exact: true }).fill('Local UI Test Passphrase!');
  await page.getByRole('button', { name: 'Створити акаунт', exact: true }).click();
  await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible();
  // Cache genuine local API responses for a repeatable layout-only matrix.
  // Gameplay, persistence and authorization are exercised with live APIs in other tests.
  const data: Record<string, unknown> = {};
  for (const path of [
    '/auth/me',
    '/platform/profile',
    '/learn',
    '/daily',
    '/platform/friends',
    '/platform/notifications',
    '/platform/leaderboards',
    '/platform/recent',
  ]) {
    const r = await page.request.get('/api' + path);
    expect(r.ok()).toBe(true);
    data['/api' + path] = await r.json();
  }
  const plays: string[] = [];
  for (const game of ['chess', 'checkers', 'wayline']) {
    const base = game === 'chess' ? '/chess' : '/board';
    const created = await page.request.post('/api' + base + '/matches', {
      headers: { origin: 'http://localhost:5173', 'x-plyvra-client': 'web' },
      data: {
        ...(game === 'chess' ? {} : { game }),
        mode: 'bot',
        side: 'w',
        timeControl: 'none',
        difficulty: 'beginner',
      },
    });
    expect(created.ok()).toBe(true);
    const body = await created.json();
    data['/api' + base + '/matches/' + body.match.id] = body;
    plays.push(`/play/${game}/${body.match.id}`);
  }
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const lesson = lessons.find((l) => path === '/api/learn/' + l.id);
    return route.fulfill({ json: lesson ? { lesson } : (data[path] ?? { ok: true }) });
  });
  const paths = [
    '/',
    '/games',
    '/account',
    '/friends',
    '/leaderboards',
    '/notifications',
    '/settings',
    '/login',
    '/register',
    '/games/chess',
    '/games/checkers',
    '/games/wayline',
    '/learn',
    '/learn/chess/course',
    '/learn/checkers/course',
    '/learn/wayline/course',
    ...plays,
  ];
  for (const lang of ['uk', 'en'])
    for (const theme of ['dark', 'light']) {
      await page.evaluate(
        ({ lang, theme }) => {
          localStorage.setItem('plyvra-language', lang);
          localStorage.setItem('plyvra-theme', theme);
        },
        { lang, theme },
      );
      for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920, 844]) {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
        for (const path of paths) {
          if (path === '/') await page.goto(path);
          else {
            // Exercise client route transitions just like browser history traversal.
            // Fresh bootstrap for each viewport is covered by the first route and
            // the separate public-page matrix; avoid 684 redundant module reloads.
            await page.evaluate((path) => {
              history.pushState(null, '', path);
              dispatchEvent(new PopStateEvent('popstate'));
            }, path);
          }
          await expect(page.getByRole('main')).toHaveAttribute('data-route', path);
          await expect(page.locator('h1').first()).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          if (path === '/settings')
            await expect(page.locator('input[name=displayName]')).toBeVisible();
          if (path === '/friends') await expect(page.locator('input[name=q]')).toBeVisible();
          if (path === '/') await expect(page.locator('.progress-panel')).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${path}: ${width}, ${lang}, ${theme}`,
          ).toBe(true);
          const board = page.locator('.play-board');
          if (await board.count()) {
            const b = await board.boundingBox();
            expect(b!.x).toBeGreaterThanOrEqual(0);
            expect(b!.x + b!.width).toBeLessThanOrEqual(width + 1);
            expect(Math.abs(b!.width - b!.height)).toBeLessThan(2);
            await expect(page.locator('.board-files')).toBeVisible();
          }
          // Check visible targets, menu collision, Escape and focus restoration.
          if (width === 390 || width === 1440) {
            for (const choice of await page.getByRole('combobox').all()) {
              const target = await choice.boundingBox();
              expect(target!.height).toBeGreaterThanOrEqual(44);
              await choice.click();
              await menuFits(page, 'listbox');
              await page.keyboard.press('ArrowDown');
              await page.keyboard.press('Escape');
              await expect(choice).toBeFocused();
            }
          }
          if (
            ((width === 1440 && lang === 'en' && theme === 'dark') ||
              (width === 390 && lang === 'uk' && theme === 'light')) &&
            ['/', '/games', '/account', '/friends', '/settings', '/learn/chess/course'].includes(
              path,
            )
          ) {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({
              path: `.local/polish-${width}-${lang}-${theme}-${path.replaceAll('/', '-') || 'home'}.png`,
              fullPage: true,
            });
          }
        }
      }
      await page.goto('/');
      for (const trigger of [page.locator('.language-button'), page.locator('.profile-trigger')]) {
        await trigger.click();
        await menuFits(page, 'menu');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
      }
    }
  expect(errors).toEqual([]);
});
