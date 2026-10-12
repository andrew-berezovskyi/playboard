import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  scenarios,
  solutions,
  replayScenario,
  type TrainingAction,
} from '../../packages/shared/src/scenarios';
import { waylineCards } from '../../packages/games/wayline/engine';
import { squareName } from '../../apps/web/src/BoardCoordinates';

test.use({ hasTouch: true });
test.beforeAll(async () => {
  test.setTimeout(70000);
  await new Promise((r) => setTimeout(r, 61000));
});
async function move(page: Page, action: TrainingAction, size: number) {
  if ('card' in action)
    await page
      .getByRole('button', {
        name: waylineCards.find((c) => c.id === action.card)!.en,
        exact: true,
      })
      .click();
  const squares =
    'path' in action
      ? action.path.map((v) => squareName(v, size))
      : [action.from, action.to].map((v) => (typeof v === 'number' ? squareName(v, size) : v));
  const response = page.waitForResponse(
    (r) => r.url().includes('/step') && r.request().method() === 'POST',
  );
  for (const square of squares) await page.locator(`[data-square="${square}"]`).click();
  if ('promotion' in action)
    await page
      .getByRole('dialog')
      .getByRole('button', { name: action.promotion === 'q' ? 'Queen' : 'Rook', exact: true })
      .click();
  expect((await response).ok()).toBe(true);
}
test('all 26 tactical positions finish through the real UI and authoritative API', async ({
  page,
}) => {
  test.setTimeout(360000);
  await page.addInitScript(() => localStorage.setItem('plyvra-language', 'en'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/learn/chess');
  // Use the actual language control; storage keys are an implementation detail.
  if ((await page.locator('html').getAttribute('lang')) !== 'en')
    await page.locator('.language-button').click();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const game of ['chess', 'checkers', 'wayline']) {
    if (game !== 'chess') {
      await page.waitForTimeout(61000);
      await page.goto(`/learn/${game}`);
    }
    const tasks = scenarios.filter((s) => s.game === game);
    await page.locator(`a[href="/learn/${game}/tactics/${tasks[0].id}"]`).click();
    for (const s of tasks) {
      await expect(page.getByRole('heading', { name: s.title.en, exact: true })).toBeVisible();
      let actions: TrainingAction[] = [];
      for (let stage = 0; stage < s.stages.length; stage++) {
        const state = replayScenario(s, actions).state;
        const action = solutions(s, state, stage).at(-1)!; // Exercise equivalent alternatives, not only first solution.
        await move(page, action, game === 'wayline' ? 5 : 8);
        actions = [...actions, action];
        if (stage + 1 < s.stages.length) {
          await expect(
            page.getByText('The opponent replied. Reassess the position.'),
          ).toBeVisible();
          await page.reload();
          await expect(
            page.getByText('The opponent replied. Reassess the position.'),
          ).toBeVisible();
        }
      }
      await expect(
        page.getByRole('heading', { name: 'Lesson complete', exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const boardBox = (await page.locator('.coordinate-frame').boundingBox())!;
      const coachBox = (await page.locator('.tactic-coach').boundingBox())!;
      expect(boardBox.width).toBeLessThanOrEqual(660);
      expect(coachBox.x).toBeGreaterThanOrEqual(boardBox.x + boardBox.width);
      await expect(page.getByRole('heading', { name: 'Your coach', exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      if (s.stages.length > 1)
        await page.screenshot({
          path: `.local/learning2-${game}-completed-desktop.png`,
          fullPage: true,
        });
      await page
        .getByRole('link', {
          name: s === tasks.at(-1) ? 'Back to learning' : 'Next lesson',
          exact: true,
        })
        .last()
        .click();
    }
  }
  expect(errors).toEqual([]);
});
test('phone hints, retry, language persistence, keyboard and accessible tactical layout', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.waitForTimeout(61000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/learn/chess/tactics/chess-tactic-knight-fork');
  await expect(page.locator('.tactics-board')).toBeVisible();
  await page.locator('[data-square="c3"]').click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-square="d3"]')).toBeFocused();
  await page.locator('.language-button').tap();
  await expect(page.locator('[data-square="c3"]')).toHaveAttribute('aria-pressed', 'true');
  const rejected = page.waitForResponse(
    (r) => r.url().includes('/step') && r.request().method() === 'POST',
  );
  await page.locator('[data-square="b5"]').click();
  expect((await rejected).status()).toBe(400);
  await expect(page.getByRole('alert')).toContainText('does not meet the objective');

  await page.getByRole('button', { name: 'Hint 1', exact: true }).click();
  await expect(page.locator('.hint-square')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hint 2', exact: true }).click();
  await expect(page.locator('.hint-square')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hint 3', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '→' })).toBeVisible();
  await page.getByRole('button', { name: 'View solution', exact: true }).click();
  await expect(
    page.getByText('Solution revealed. Repeat the task to practise independently.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Rules and help', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('king');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Rules and help', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Rules and help', exact: true }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByText('Solution revealed. Repeat the task to practise independently.'),
  ).toHaveCount(0);
  for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const nav of await page.locator('.lesson-actions').all()) {
      const boxes = await nav.locator('button,a').evaluateAll((nodes) =>
        nodes.map((n) => {
          const b = n.getBoundingClientRect();
          return { x: b.x, y: b.y, r: b.right, b: b.bottom };
        }),
      );
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++)
          expect(
            boxes[i].r <= boxes[j].x ||
              boxes[j].r <= boxes[i].x ||
              boxes[i].b <= boxes[j].y ||
              boxes[j].b <= boxes[i].y,
          ).toBe(true);
    }
  }
  for (const view of [
    { width: 844, height: 390 },
    { width: 720, height: 450 },
  ]) {
    await page.setViewportSize(view);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.local/learning2-tactics-mobile.png', fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('link', { name: 'Practice with a bot', exact: true }).hover();
  await page.waitForTimeout(220);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '.local/learning2-tactics-mobile-light.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.locator('.coach-emblem').evaluate((n) => getComputedStyle(n).animationName),
  ).toBe('none');
});
