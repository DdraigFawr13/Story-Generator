// The Tales room on a phone: the stage never scrolls sideways and the key sits behind a "?" button.
import { expect, test } from '@playwright/test';

test('the Tales stage stays put on a phone and the key opens from the ? button', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=SMOKE&size=128');
  const stage = page.getByTestId('tales-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Pause history' }).click();
  for (const mode of ['Realms', 'Peoples', 'Faiths', 'Plain', 'Land']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
  }
  await page.locator('.tr-chooser-btn').click();
  await expect(page.getByRole('group', { name: 'Pauses on' })).toBeVisible();
  expect(await stage.evaluate((el) => el.scrollLeft)).toBe(0);

  // The key is hidden until the "?" is tapped.
  const key = page.locator('.tr-key');
  await expect(key).toBeHidden();
  await page.getByRole('button', { name: 'Map key' }).click();
  await expect(key).toBeVisible();
});
