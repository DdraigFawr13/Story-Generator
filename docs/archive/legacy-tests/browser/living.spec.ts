import { expect, test } from '@playwright/test';
import { livingFixtures } from '../fixtures/living-browser';

test('individual life, work and saved continuation match Node in complete bytes', async ({
  page,
}) => {
  const expected = await livingFixtures();
  await page.goto('/');
  const actual = await page.evaluate(async (path) => {
    const module = await import(path);
    return module.livingFixtures();
  }, '/tests/fixtures/living-browser.ts');
  expect(actual).toEqual(expected);
  expect(actual.every((fixture: { equal: boolean }) => fixture.equal)).toBe(true);
});
