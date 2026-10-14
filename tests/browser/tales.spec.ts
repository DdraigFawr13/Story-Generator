// The Tales room on a phone: the stage never scrolls sideways, the event filter opens from the
// chip and the key (with the mode's legend) sits behind a "?" button.
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
  const events = page.getByRole('group', { name: 'Events' });
  await expect(events).toBeVisible();
  // Hiding an event kind also stops it pausing.
  await events.getByLabel('Show wars').uncheck();
  await expect(events.getByLabel('Pause on wars')).toBeDisabled();
  expect(await stage.evaluate((el) => el.scrollLeft)).toBe(0);

  // The key is hidden until the "?" is tapped.
  const key = page.locator('.tr-key');
  await expect(key).toBeHidden();
  await page.getByRole('button', { name: 'Map key' }).click();
  await expect(key).toBeVisible();
  await expect(key.locator('[data-legend="land"]')).toBeVisible();
});
