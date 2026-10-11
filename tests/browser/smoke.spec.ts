// The one Chromium smoke (REBOOT_PLAN §11). Grows with each phase toward
// generate → legends → embark → play → save → reload → continue.
import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // Failed requests are reported with their URL below; the console copy has none.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      errors.push(message.text());
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.pathname !== '/favicon.ico') {
      errors.push(`${response.status()} ${url.pathname}`);
    }
  });
  return errors;
}

test('the new engine shell generates a world and advances it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?next');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('new engine');
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByLabel('Seed').fill('SMOKE');
  await page.getByRole('button', { name: 'New world' }).click();
  await page.getByRole('button', { name: '+1 year' }).click();
  await expect(page.getByText('Year 2', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('listitem').first()).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('the legacy app still founds and steps a settlement', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText('0');
  await page.getByRole('button', { name: 'Step one week' }).click();
  await expect(page.getByTestId('tick')).toHaveText('1');
  expect(errors).toEqual([]);
});
