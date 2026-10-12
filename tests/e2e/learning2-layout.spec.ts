import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('seasonal columns, proportional headings and notification states at every breakpoint', async ({
  page,
}) => {
  test.setTimeout(180000);
  const user = {
    id: 'local-layout',
    username: 'layout_player',
    email: 'layout@example.test',
    emailVerified: true,
    createdAt: '2026-10-01',
  };
  let populated = false;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload = path.endsWith('/auth/me')
      ? { user }
      : path.endsWith('/leaderboards')
        ? {
            players: [
              {
                username: user.username,
                name: 'A player with a deliberately long display name',
                rating: 1500,
                deviation: 85,
                games: 2,
              },
            ],
            season: [
              { username: user.username, points: 12345 },
              { username: 'another_long_player_name', points: 99 },
            ],
          }
        : path.endsWith('/notifications')
          ? {
              notifications: populated
                ? [
                    {
                      id: 'fixture',
                      kind: 'friend_request',
                      username: 'another_long_player_name',
                      payload: {},
                      read: false,
                    },
                  ]
                : [],
            }
          : { ok: true };
    return route.fulfill({ json: payload });
  });
  for (const lang of ['uk', 'en'])
    for (const theme of ['dark', 'light']) {
      await page.addInitScript(
        ({ lang, theme }) => {
          localStorage.setItem('plyvra-language', lang);
          localStorage.setItem('plyvra-theme', theme);
        },
        { lang, theme },
      );
      for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/leaderboards');
        await expect(page.locator('.season-table tbody tr')).toHaveCount(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(page.locator('.season-table .current-player')).toHaveCount(1);
        const columns = await page
          .locator('.season-table tr')
          .evaluateAll((rows) =>
            rows.map((row) => [...row.children].map((cell) => cell.getBoundingClientRect().x)),
          );
        for (const row of columns) expect(row).toEqual(columns[0]);
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: `.local/learning2-table-${lang}-${theme}-${width}.png`,
            fullPage: true,
          });
        await page.goto('/notifications');
        await expect(page.locator('.notifications-empty')).toBeVisible();
        const icon = await page.locator('.page-heading h1 svg').boundingBox();
        expect(icon!.width).toBeGreaterThanOrEqual(28);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: `.local/learning2-notifications-${lang}-${theme}-${width}.png`,
            fullPage: true,
          });
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  populated = true;
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/notifications');
  await expect(page.locator('.simple-row')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/learning2-notification-populated-mobile.png',
    fullPage: true,
  });
  // A 1440px desktop at 200% browser zoom has a 720px CSS layout viewport.
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto('/leaderboards');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
