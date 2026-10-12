import { test, expect, firefox, webkit } from '@playwright/test';
import { courseLessons } from '../../packages/shared/src/courses';
import { waylineCards } from '../../packages/games/wayline/engine';
test.beforeEach(async () => {
  test.setTimeout(70000);
  await new Promise((resolve) => setTimeout(resolve, 61000));
});
test('all three courses require moves and lead to real guided bot matches', async ({ page }) => {
  test.setTimeout(120000);
  for (const game of ['chess', 'checkers', 'wayline'] as const) {
    await page.goto(`/learn/${game}/course`);
    await expect(page.getByRole('button', { name: 'Наступний крок', exact: true })).toHaveCount(0);
    for (const lesson of courseLessons(game)) {
      await expect(page.getByRole('heading', { name: lesson.title.uk, exact: true })).toBeVisible();
      await expect(page.locator('.coach-instruction')).not.toBeEmpty();
      await expect(page.locator('.board-files span')).toHaveCount(game === 'wayline' ? 5 : 8);
      const a = lesson.answer;
      if ('path' in a) {
        for (const square of a.path) await page.locator(`[data-square="${square}"]`).click();
      } else if ('card' in a) {
        await page
          .getByRole('button', { name: waylineCards.find((c) => c.id === a.card)!.uk, exact: true })
          .click();
        await page.locator(`[data-square="${a.from}"]`).click();
        await page.locator(`[data-square="${a.to}"]`).click();
      } else {
        await page.locator(`[data-square="${a.from}"]`).click();
        await page.locator(`[data-square="${a.to}"]`).click();
        if (a.promotion)
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Ферзь', exact: true })
            .click();
      }
      await page.getByRole('button', { name: 'Наступний крок', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Курс завершено', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Навчальна партія', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/play/${game}/.*training=1`));
    await page.locator('.game-help summary').click();
    await page.getByRole('button', { name: 'Показати допустимий хід', exact: true }).click();
    await expect(page.locator('.game-help [role="status"]')).toBeVisible();
  }
});
test('Firefox and WebKit support mobile courses, settings and bot boards', async () => {
  test.setTimeout(120000);
  for (const browserType of [firefox, webkit]) {
    const browser = await browserType.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto('http://localhost:5173/settings');
      await page.getByRole('combobox', { name: 'Оформлення карток' }).click();
      await page.getByRole('option', { name: 'З координатною сіткою', exact: true }).click();
      await page.getByLabel('Ефект взяття').uncheck();
      await page.getByRole('button', { name: 'Зберегти зміни', exact: true }).click();
      await page.reload();
      await expect(page.getByRole('combobox', { name: 'Оформлення карток' })).toContainText(
        'З координатною сіткою',
      );
      for (const game of ['chess', 'checkers', 'wayline']) {
        await page.goto(`http://localhost:5173/learn/${game}/course`);
        await page
          .getByRole('button', { name: 'Перейти до вільної практики', exact: true })
          .click();
        await expect(page.locator('[data-square]').first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
    } finally {
      await browser.close();
    }
  }
});
