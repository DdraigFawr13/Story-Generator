import { test, expect } from '@playwright/test';
import { residentFixtures } from '../fixtures/residents-browser';

test('resident founding identities and restored bytes match Node without changing P1 state', async ({
  page,
}) => {
  const expected = residentFixtures();
  await page.goto('/');
  const observed = await page.evaluate(async (path) => {
    const module = await import(path);
    return module.residentFixtures();
  }, '/tests/fixtures/residents-browser.ts');
  expect(observed).toEqual(expected);
  expect(observed.every((fixture: { unchanged: boolean }) => fixture.unchanged)).toBe(true);
});
