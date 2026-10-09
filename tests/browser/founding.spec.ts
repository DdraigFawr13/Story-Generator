import { test, expect } from '@playwright/test';
import { collectBrowserFixtures } from '../fixtures/browser';

test('100 terrain seeds and complete founding bytes agree with Node', async ({ page }) => {
  const expected = await collectBrowserFixtures();
  await page.goto('/');
  const observed = await page.evaluate(async (modulePath) => {
    const fixtures = await import(modulePath);
    return fixtures.collectBrowserFixtures();
  }, '/tests/fixtures/browser.ts');
  expect(observed).toEqual(expected);
});

test('founding facts, invalid-seed recovery and keyboard inspection work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await page.locator('.world-menu summary').click();
  await expect(page.getByRole('heading', { name: 'Settlement 47-20' })).toBeVisible();
  await expect(page.getByText('Founding — before spring', { exact: true })).toBeVisible();
  await expect(page.locator('.tile-facts')).toContainText('Tile 1327:');
  const originalCanvas = await page
    .locator('canvas')
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  await page.getByLabel('World seed', { exact: true }).fill('bad seed');
  await page.getByRole('button', { name: 'New world' }).click();
  await expect(page.getByRole('alert')).toContainText('1–64');
  await expect(page.getByRole('heading', { name: 'Settlement 47-20' })).toBeVisible();
  expect(
    await page.locator('canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
  ).toBe(originalCanvas);
  await page.getByLabel('World seed', { exact: true }).fill('RIVERSIDE');
  await page.getByRole('button', { name: 'New world' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Tile X').fill('0');
  await page.getByLabel('Tile Y').fill('0');
  await page.getByRole('button', { name: 'Inspect tile' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tile-facts')).toContainText('Tile 0:');
  const map = page.locator('canvas');
  const bounds = await map.boundingBox();
  await map.click({
    position: { x: (bounds!.width - 64 * 12) / 2 + 10.5 * 12, y: 20.5 * 12 },
  });
  await expect(page.locator('.tile-facts')).toContainText('Tile 1290:');
  await page.getByRole('button', { name: 'Random seed' }).click();
  await expect(page.getByLabel('World seed', { exact: true })).toHaveValue(/^[a-f0-9]{16}$/);
  expect(errors).toEqual([]);
});

test('clicking a partly visible map preserves scroll and selects the pointed tile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await page.getByLabel('Tile X').fill('0');
  await page.getByLabel('Tile Y').fill('0');
  await page.getByRole('button', { name: 'Inspect tile' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tile-facts')).toContainText('Tile 0:');
  const map = page.locator('canvas');
  await map.evaluate((canvas) => window.scrollBy(0, canvas.getBoundingClientRect().top + 60));
  const bounds = (await map.boundingBox())!;
  expect(bounds.y).toBeLessThan(0);
  const scroll = await page.evaluate(() => scrollY);
  await page.mouse.click(bounds.x + (bounds.width - 64 * 12) / 2 + 10.5 * 12, bounds.y + 20.5 * 12);
  await expect(map).toBeFocused();
  await expect(page.locator('.tile-facts')).toContainText('Tile 1290:');
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
});

test('pointer inspection preserves the clicked tile when the map is partly below the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await page.getByLabel('Tile X').fill('0');
  await page.getByLabel('Tile Y').fill('0');
  await page.getByRole('button', { name: 'Inspect tile' }).click();
  const map = page.locator('canvas');
  await map.evaluate((canvas) => {
    window.scrollTo(0, canvas.getBoundingClientRect().top + window.scrollY - innerHeight + 120);
  });
  const box = (await map.boundingBox())!;
  const scroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(box.x + (box.width - 64 * 12) / 2 + 10.5 * 12, box.y + 5.5 * 12);
  await page.mouse.down();
  await expect(map).toBeFocused();
  await page.mouse.up();
  await expect(page.locator('.tile-facts')).toContainText('Tile 330:');
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
});

for (const width of [320, 390, 768, 1280]) {
  test(`founding preview fits ${width}px and retains usable controls`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'New world', exact: true }).click();
    await page.locator('.world-menu summary').click();
    await expect(page.getByRole('heading', { name: 'Settlement 47-20' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    for (const button of await page.getByRole('button').all()) {
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await page.getByLabel('World seed', { exact: true }).fill('TERRAIN_000');
    await page.getByRole('button', { name: 'New world' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
