import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Roberts Rules.' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('presents the simulator status and private-authority boundary', async ({ page }) => {
  await expect(page.getByText('Pre-alpha / simulator first')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Publish what was approved.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Protect how it was decided.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Authentication required.' })).toBeVisible();
  await expect(page.getByText(/does not yet conduct binding or secure votes/i)).toBeVisible();
});

test('exposes a focusable, keyboard-activatable overview link', async ({ page }) => {
  const overviewLink = page.getByRole('link', { name: 'Subculture Collective' });
  await overviewLink.focus();
  await expect(overviewLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#overview$/);
});

test('fits the configured viewport without horizontal overflow', async ({ page }) => {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
