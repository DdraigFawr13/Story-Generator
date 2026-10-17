// The Tales room on a phone: the stage never scrolls sideways, the event filter opens from the
// chip and the key (with the mode's legend) sits behind a "?" button.
import { expect, test } from '@playwright/test';
import { allWorks } from '../../src/app/tales/works';
import { DEFAULT_CONTENT } from '../../src/content';
import { generateWorld } from '../../src/engine';

/**
 * The first seed whose 128 world raised a great work or made a great item, found in Node at test
 * time: a history change can leave any one seed (SMOKE since the great beasts change) with none.
 */
function worksSeed(): string {
  for (const seed of ['SMOKE', 'TALES', 'S1', 'S2', 'S3']) {
    const world = generateWorld(seed, { width: 128, height: 128 }, DEFAULT_CONTENT);
    if (allWorks(world).length > 0) return seed;
  }
  throw new Error('No world has a great work; searched SMOKE, TALES, S1, S2, S3. Add seeds.');
}

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

test('Explore the map stays in Tales: marks follow the Show filter, the map zooms', async ({
  page,
}) => {
  await page.goto(`/?seed=${worksSeed()}&size=128`);
  const stage = page.getByTestId('tales-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip to the present' }).click();
  await page.getByRole('button', { name: 'Explore the map' }).click();
  // Still the Tales room, not the classic viewer.
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute('data-explore', 'true');
  // The classic viewer's map (a canvas under the world-map test id) is not on the page.
  await expect(page.getByTestId('world-map')).toHaveCount(0);
  const marks = stage.locator('[data-testid="event-mark"]:not(.leaving)');
  await expect(marks.first()).toBeVisible();
  const wars = stage.locator('[data-testid="event-mark"][data-kind="war"]:not(.leaving)');
  expect(await wars.count()).toBeGreaterThan(0);
  await page.locator('.tr-chooser-btn').click();
  await page.getByRole('group', { name: 'Events' }).getByLabel('Show wars').uncheck();
  await expect(wars).toHaveCount(0);
  // Great works stand beside their towns until unticked.
  const works = stage.locator('[data-testid="work-mark"]');
  expect(await works.count()).toBeGreaterThan(0);
  await page.getByRole('group', { name: 'Events' }).getByLabel('Show great works').uncheck();
  await expect(works).toHaveCount(0);
  await page.getByRole('group', { name: 'Events' }).getByLabel('Show great works').check();
  // Perilous places stand at their own cells until unticked.
  const places = stage.locator('[data-testid="place-mark"]');
  expect(await places.count()).toBeGreaterThan(0);
  await page.getByRole('group', { name: 'Events' }).getByLabel('Show perilous places').uncheck();
  await expect(places).toHaveCount(0);
  await page.getByRole('group', { name: 'Events' }).getByLabel('Show perilous places').check();
  // A place's card opens its page, and Back returns to the explored map with the card open.
  await page.locator('.tr-chooser-btn').click();
  await places.first().dispatchEvent('click');
  const placeCard = page.getByRole('dialog', { name: 'Perilous place' });
  await expect(placeCard).toBeVisible();
  await placeCard.getByRole('button', { name: 'Its story' }).click();
  await expect(page.getByTestId('record-page').locator('.lg-kind')).toHaveText('Perilous place');
  await page.goBack();
  await expect(stage).toHaveAttribute('data-explore', 'true');
  await expect(placeCard).toBeVisible();
  await placeCard.getByRole('button', { name: 'Close' }).click();
  // It comes back centred on the place; start the rest from the whole map.
  await page.getByRole('button', { name: 'Whole map' }).click();
  await expect(stage).toHaveAttribute('data-zoom', '1.00');
  await page.locator('.tr-chooser-btn').click();

  // The key is folded away in explore; the ? button opens it and it lists the marks.
  const key = page.getByTestId('tales-key');
  await expect(key).toBeHidden();
  await page.getByRole('button', { name: 'Map key' }).click();
  await expect(key.locator('[data-legend="events"]')).toBeVisible();
  await page.getByRole('button', { name: 'Map key' }).click();
  await expect(key).toBeHidden();
  // On the whole map a mark is a dot; the glyph (an svg) comes with the zoom.
  await expect(marks.first().locator('svg')).toHaveCount(0);

  // Zoom in with the button; the whole-map button resets it.
  await expect(stage).toHaveAttribute('data-zoom', '1.00');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(stage).not.toHaveAttribute('data-zoom', '1.00');
  await expect(marks.first().locator('svg')).toHaveCount(1);
  await page.getByRole('button', { name: 'Whole map' }).click();
  await expect(stage).toHaveAttribute('data-zoom', '1.00');

  // A town opens its card.
  await page.locator('[data-testid="town-hit"]').first().click();
  await expect(page.getByRole('dialog', { name: 'Town' })).toBeVisible();
});

test('a shared Tales link waits at its year until Play', async ({ page }) => {
  await page.goto('/?seed=SMOKE&size=128&room=tales&year=40');
  const stage = page.getByTestId('tales-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  const year = page.getByRole('slider', { name: 'Year' });
  await expect(year).toHaveValue('40');
  await page.waitForTimeout(1000);
  await expect(year).toHaveValue('40');
  await page.getByRole('button', { name: 'Play history' }).click();
  await expect(year).not.toHaveValue('40');
});

test('a shared Tales link at the present opens as a finished play', async ({ page }) => {
  await page.goto('/?seed=SMOKE&size=128&room=tales&year=999');
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Explore the map' })).toBeVisible();
});
