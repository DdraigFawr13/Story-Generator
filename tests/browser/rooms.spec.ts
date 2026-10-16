// The rooms are home: a new world (with its history length) is made from the rail, and a link to a
// page with no room named opens that page in the rooms, not the classic viewer.
import { expect, test } from '@playwright/test';

test('the rail makes a new world with a longer history, played in Tales', async ({ page }) => {
  await page.goto('/?seed=SMOKE&size=128');
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip to the present' }).click();
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'New world' });
  await sheet.getByLabel('Seed').fill('ROOMS');
  await sheet.getByLabel('History').selectOption('500');
  await sheet.getByRole('button', { name: 'Make the world' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/seed=ROOMS.*years=500|years=500.*seed=ROOMS/, { timeout: 60_000 });
  await expect(page.getByTestId('tales-stage')).toBeVisible();
  await page.getByRole('button', { name: 'Skip to the present' }).click();
  await expect(page.getByTestId('tales-year')).toHaveText('Year 500');
});

test('a page link with no room opens in the rooms, with the classic viewer out of reach', async ({
  page,
}) => {
  await page.goto('/?seed=SMOKE&size=128&open=civ:1');
  await expect(page.getByTestId('record-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Legends' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate' })).toHaveCount(0);
});
