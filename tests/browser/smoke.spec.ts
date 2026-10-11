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

test('the world map generates, inspects, saves, reloads and advances', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?next&seed=SMOKE&size=128');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('world map');
  const map = page.getByTestId('world-map');
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(map).toHaveAttribute('data-seed', 'SMOKE');
  await expect(page.getByRole('alert')).toHaveCount(0);

  const rainfall = page.getByRole('button', { name: 'Rainfall' });
  await rainfall.click();
  await expect(rainfall).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/layer=rainfall/);

  // Region names are an overlay, on by default, toggled with N.
  const names = page.getByLabel(/^Names/);
  await expect(names).toBeChecked();
  await page.keyboard.press('n');
  await expect(names).not.toBeChecked();
  await page.keyboard.press('n');
  await expect(names).toBeChecked();

  // Likely roads are an overlay too, on by default, toggled with R.
  const roads = page.getByLabel(/^Roads/);
  await expect(roads).toBeChecked();
  await page.keyboard.press('r');
  await expect(roads).not.toBeChecked();
  await page.keyboard.press('r');
  await expect(roads).toBeChecked();

  await page.locator('canvas.map').click();
  const inspector = page.getByRole('complementary', { name: 'Cell inspector' });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole('heading')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(inspector).toHaveCount(0);

  // Save → reload → load → continue.
  await page.getByRole('button', { name: '+1 year' }).click();
  const date = page.getByText(/, Year \d+$/).first();
  const savedDate = await date.textContent();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved "SMOKE"');
  await page.reload();
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(date).not.toHaveText(savedDate!);
  await page.getByRole('button', { name: 'Load SMOKE' }).click();
  await expect(page.getByRole('status')).toContainText('Loaded "SMOKE"');
  await expect(date).toHaveText(savedDate!);
  await expect(map).toHaveAttribute('data-state', 'ready');
  await page.getByRole('button', { name: '+1 month' }).click();
  await expect(date).not.toHaveText(savedDate!);
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
