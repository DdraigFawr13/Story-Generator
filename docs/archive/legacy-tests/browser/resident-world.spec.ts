import { expect, test } from '@playwright/test';
import { residentWorldFixtures } from '../fixtures/resident-world-browser';

test('complete P2 world/save bytes and checksums match Node', async ({ page }) => {
  const expected = await residentWorldFixtures();
  await page.goto('/');
  const actual = await page.evaluate(async (path) => {
    const module = await import(path);
    return module.residentWorldFixtures();
  }, '/tests/fixtures/resident-world-browser.ts');
  expect(actual).toEqual(expected);
});
