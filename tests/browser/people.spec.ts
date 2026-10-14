// The People room: open a person from the index and from a Tales card, follow them back into
// Tales, and use the browser's back button.
import { expect, test, type Page } from '@playwright/test';

async function inTales(page: Page) {
  await page.goto('/?seed=SMOKE&size=128');
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Pause history' }).click();
}

test('a person opens from the index, Follow returns to Tales, and back returns to the page', async ({
  page,
}) => {
  await inTales(page);
  await page.getByRole('button', { name: 'People', exact: true }).click();
  const index = page.getByTestId('people-index');
  await expect(index).toBeVisible();
  await index.getByRole('button', { name: 'Legends', exact: true }).click();
  await index.getByRole('searchbox', { name: 'Search people' }).fill('a');
  await index.locator('.pp-row').first().click();
  const pageEl = page.getByTestId('person-page');
  await expect(pageEl).toBeVisible();
  await expect(page).toHaveURL(/open=person:\d+/);
  const name = await pageEl.getByRole('heading', { level: 1 }).textContent();
  await pageEl.getByRole('tab', { name: 'Family' }).click();
  await pageEl.getByRole('tab', { name: 'Life' }).click();
  await expect(pageEl.locator('.pp-life li').first()).toBeVisible();
  // Follow opens Tales with this person followed.
  await pageEl.getByRole('button', { name: /^Follow (his|her) story$/ }).click();
  await expect(page.getByTestId('tales-stage')).toBeVisible();
  await expect(page.locator('.tr-chip.following')).toContainText(name!);
  // Back returns to the person's page.
  await page.goBack();
  await expect(page.getByTestId('person-page').getByRole('heading', { level: 1 })).toHaveText(
    name!,
  );
});

test('a Tales card opens the person, and the page fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=SMOKE&size=128');
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Years a second').selectOption('60');
  const card = page.getByRole('dialog', { name: 'History paused' });
  const who = card.getByRole('button', { name: /^Who is / });
  // Cards come and go on their own; take the first that names a person.
  await expect(who).toBeVisible({ timeout: 60_000 });
  await who.click();
  const pageEl = page.getByTestId('person-page');
  await expect(pageEl).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Sections' })).toBeVisible();
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(sideways).toBe(false);
  await pageEl.getByRole('button', { name: /^Follow (his|her) story$/ }).click();
  await expect(page.locator('.tr-chip.following')).toBeVisible();
  // Back twice: the page, then Tales where it stood.
  await page.goBack();
  await expect(pageEl).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('tales-stage')).toBeVisible();
});
