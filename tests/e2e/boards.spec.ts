import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeAll(async () => {
  test.setTimeout(70000);
  await new Promise((resolve) => setTimeout(resolve, 61000));
});
for (const game of ['checkers', 'wayline']) {
  test(`${game}: two browsers play a private game and restore it on a phone`, async ({
    browser,
  }) => {
    const a = await browser.newContext(),
      b = await browser.newContext();
    try {
      const white = await a.newPage(),
        black = await b.newPage();
      await white.goto(`/games/${game}`);
      await white.getByRole('button', { name: 'Запросити друга', exact: true }).click();
      await white.getByRole('button', { name: 'Створити приватну кімнату', exact: true }).click();
      const invitation = await white.locator('#invite-link').inputValue();
      await black.goto(invitation);
      await black.getByRole('button', { name: 'Приєднатися до кімнати', exact: true }).click();
      await expect(white.getByRole('heading', { name: 'Твій хід', exact: true })).toBeVisible();
      const response = await white.request.get(
        '/api/board/matches/' + white.url().split('/').at(-1),
      );
      const m = response.json();
      const { boardActions } = await import('../../packages/games/board-engine');
      const match = (await m).match,
        action = boardActions(match.game, match.state)[0];
      if ('path' in action) {
        for (const square of action.path) await white.locator(`[data-square="${square}"]`).click();
      } else {
        const { waylineCards } = await import('../../packages/games/wayline/engine');
        await white
          .getByRole('button', {
            name: waylineCards.find((c) => c.id === action.card)!.uk,
            exact: true,
          })
          .click();
        await white.locator(`[data-square="${action.from}"]`).click();
        await white.locator(`[data-square="${action.to}"]`).click();
      }
      await expect(black.locator('.board-history li')).toHaveCount(1);
      await black.setViewportSize({ width: 320, height: 740 });
      await black.reload();
      await expect(black.locator('.board-history li')).toHaveCount(1);
      expect(await black.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await white.getByRole('button', { name: 'Запропонувати нічию', exact: true }).click();
      await black.getByRole('button', { name: 'Прийняти нічию', exact: true }).click();
      await expect(white.getByRole('heading', { name: 'Нічия', exact: true })).toBeVisible();
      const audit = await new AxeBuilder({ page: black })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
      await black.evaluate(() => window.scrollTo(0, 0));
      await black.screenshot({ path: `docs/screenshots/${game}-mobile.png`, fullPage: true });
      await white.setViewportSize({ width: 1440, height: 1000 });
      await white.screenshot({ path: `docs/screenshots/${game}-desktop.png`, fullPage: true });
    } finally {
      await a.close();
      await b.close();
    }
  });
}
test('guest learns by making a move, sees current language and uses Fixel without generated images', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.dashboard-game')).toHaveCount(3);
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Fixel');
  await expect(page.locator('.language-button svg path')).toHaveAttribute('fill', '#2785d6');
  await page.goto('/learn/chess/chess-pawn');
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.getByRole('heading', { name: 'Урок пройдено', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Зареєструйся');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/lesson-mobile.png', fullPage: true });
});
