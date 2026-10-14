// The Town room: watch a town from People and play a day, enter from the rail's picker and the
// last-watched shortcut, leave for Tales, use the browser's back button, and fit a phone.
import { expect, test, type Page } from '@playwright/test';

async function inTales(page: Page) {
  await page.goto('/?seed=SMOKE&size=128');
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Pause history' }).click();
}

/** Open people until one has a Watch button that works, and press it. */
async function watchFromPeople(page: Page) {
  await page.getByRole('button', { name: 'People', exact: true }).click();
  const index = page.getByTestId('people-index');
  await expect(index).toBeVisible();
  await index.getByRole('button', { name: 'Legends', exact: true }).click();
  await index.getByRole('searchbox', { name: 'Search people' }).fill('a');
  const rows = index.locator('.pp-row');
  await expect(rows.first()).toBeVisible();
  for (let i = 0; i < 12; i += 1) {
    await rows.nth(i).click();
    const watch = page
      .getByTestId('person-page')
      .getByRole('button', { name: /^Watch / })
      .first();
    if (await watch.isEnabled().catch(() => false)) {
      await watch.click();
      return;
    }
    await page.goBack();
    await expect(index).toBeVisible();
  }
  throw new Error('No person in the first twelve lives in a town that can be watched.');
}

test('a town is watched from People, a day plays, and Leave returns to Tales', async ({ page }) => {
  await inTales(page);
  await watchFromPeople(page);
  const town = page.getByTestId('town');
  await expect(town).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('town-canvas')).toHaveAttribute('data-state', 'ready');
  await expect(page).toHaveURL(/site=\d+.*room=town&follow=\d+/);
  await expect(town.getByRole('heading', { level: 1 })).not.toBeEmpty();
  await expect(page.getByTestId('town-sub')).toContainText('you can follow');
  await expect(page.getByTestId('town-following')).toBeVisible();
  await expect(page.getByTestId('town-needs')).toBeVisible();
  // Old rail badge is gone in every room.
  await expect(page.locator('.rm-room .soon')).toHaveCount(0);

  // Play: the date and time of day move on.
  const clock = page.getByTestId('town-clock');
  const before = await clock.getAttribute('data-day');
  await page.getByTestId('town-speed-16').click();
  await expect(page.getByTestId('town-play')).toHaveText(/Pause/);
  await expect(clock).not.toHaveAttribute('data-day', before!, { timeout: 20_000 });
  await page.getByTestId('town-play').click();
  await expect(page.getByTestId('town-play')).toHaveText(/Play/);

  // Follow someone else from "With them", when anyone shares the room.
  const names = page.getByTestId('town-with').getByRole('button');
  if ((await names.count()) > 0) {
    const other = (await names.first().textContent())!;
    await names.first().click();
    await expect(page.getByTestId('town-following-name')).toHaveText(other);
  }

  // Leave for the world: Tales; the rail's Town item returns to the same town; back works.
  await page.getByTestId('town-leave').click();
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Town', exact: true }).click();
  await expect(town).toBeVisible({ timeout: 30_000 });
  await page.goBack();
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
});

test('the rail picks a town when none has been watched, and Hall of records leaves for Legends', async ({
  page,
}) => {
  await inTales(page);
  await page.getByRole('button', { name: 'Town', exact: true }).click();
  const picker = page.getByTestId('town-picker');
  await expect(picker).toBeVisible();
  await expect(page).toHaveURL(/room=town/);
  await picker.getByTestId('town-pick').first().click();
  const town = page.getByTestId('town');
  await expect(town).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('town-records').click();
  await expect(page.locator('.lg-crumbs')).toBeVisible({ timeout: 30_000 });
  await expect(town).toHaveCount(0);
});

test('the Town room fits a phone: map on top, a sheet, the tab bar below', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=SMOKE&size=128&room=town');
  const picker = page.getByTestId('town-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await picker.getByTestId('town-pick').first().click();
  const town = page.getByTestId('town');
  await expect(town).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('town-canvas')).toHaveAttribute('data-state', 'ready');
  const noSideways = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await noSideways()).toBe(true);
  const canvas = await page.getByTestId('town-canvas').boundingBox();
  const side = page.locator('.tw-side');
  const sideBox = await side.boundingBox();
  const rail = await page.locator('.rm-rail').boundingBox();
  expect(canvas!.y).toBeLessThan(sideBox!.y);
  expect(sideBox!.y + sideBox!.height).toBeLessThanOrEqual(rail!.y + 1);
  expect(rail!.y + rail!.height).toBeGreaterThan(800);
  // The sheet opens taller and the page still fits.
  await page.getByRole('button', { name: 'Show more' }).click();
  await expect
    .poll(async () => (await side.boundingBox())!.height)
    .toBeGreaterThan(sideBox!.height + 100);
  expect(await noSideways()).toBe(true);
});
