import { test, expect, type Page } from '@playwright/test';
// Browser suites share a loopback IP. Separate their request bursts while
// preserving the application's real per-IP limits.
test.beforeAll(async () => {
  test.setTimeout(70000);
  await new Promise((resolve) => setTimeout(resolve, 61000));
});
async function move(page: Page, from: string, to: string) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}
test('two real browsers play, reconnect, draw, export and consent to rematch', async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const white = await a.newPage(),
    black = await b.newPage();
  try {
    await white.goto('/games/chess');
    await white.getByRole('button', { name: 'Запросити друга' }).click();
    await white.getByRole('button', { name: 'Створити приватну кімнату' }).click();
    await expect(white.locator('#invite-link')).toBeVisible();
    await black.goto(await white.locator('#invite-link').inputValue());
    await black.getByRole('button', { name: 'Приєднатися до кімнати' }).click();
    await expect(white.getByRole('heading', { name: 'Твій хід', exact: true })).toBeVisible();
    await move(white, 'e2', 'e4');
    await expect(black.locator('[data-square="e4"]')).toHaveAttribute('aria-label', /Білі Пішак/);
    await move(black, 'e7', 'e5');
    await expect(white.locator('[data-square="e5"]')).toHaveAttribute('aria-label', /Чорні Пішак/);
    await b.setOffline(true);
    await expect(black.getByText(/З’єднання втрачено/)).toBeVisible();
    await b.setOffline(false);
    await expect(black.getByText(/З’єднання втрачено/)).toHaveCount(0, { timeout: 15000 });
    await white.reload();
    await expect(white.locator('[data-square="e5"]')).toHaveAttribute('aria-label', /Чорні Пішак/);
    await white.getByRole('button', { name: 'Запропонувати нічию', exact: true }).click();
    await black.getByRole('button', { name: 'Прийняти нічию' }).click();
    await expect(white.getByRole('heading', { name: 'Нічия', exact: true })).toBeVisible();
    await white.getByRole('button', { name: 'Початкова позиція' }).click();
    await expect(white.locator('[data-square="e2"]')).toHaveAttribute('aria-label', /Білі Пішак/);
    const download = white.waitForEvent('download');
    await white.getByRole('button', { name: 'Експортувати PGN' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pgn$/);
    await white.getByRole('button', { name: 'Зіграти ще раз' }).click();
    await expect(white.getByText(/погодиться на повторну партію/)).toBeVisible();
    await black.getByRole('button', { name: 'Зіграти ще раз' }).click();
    await expect(black.getByRole('heading', { name: 'Твій хід', exact: true })).toBeVisible();
    await expect(white.getByRole('heading', { name: 'Хід суперника', exact: true })).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});
test('bot game is playable on phones and desktops, with a clean board screenshot', async ({
  page,
}) => {
  await page.goto('/games/chess');
  await page.getByRole('button', { name: 'Почати партію', exact: true }).click();
  await expect(page.locator('.play-board')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Твій хід', exact: true })).toBeVisible();
  await move(page, 'e2', 'e4');
  await expect(page.locator('.move-list')).toContainText('e4');
  await expect(page.getByRole('heading', { name: 'Твій хід', exact: true })).toBeVisible({
    timeout: 15000,
  });
  for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `board at ${width}px`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({ path: 'docs/screenshots/chess-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/screenshots/chess-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Здатися', exact: true }).click();
  await page.getByRole('button', { name: 'Підтвердити здачу' }).click();
  await expect(page.getByRole('heading', { name: 'Чорні перемогли', exact: true })).toBeVisible();
});
