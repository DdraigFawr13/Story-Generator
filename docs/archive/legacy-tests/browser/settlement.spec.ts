import { test, expect } from '@playwright/test';
import { collectSettlementFixtures } from '../fixtures/settlement-browser';

test('real settlement state/events and captured continuation agree with Node', async ({ page }) => {
  test.setTimeout(60_000);
  const expected = await collectSettlementFixtures();
  for (const record of expected) expect(record.resumedDigest).toBe(record.digest);
  await page.goto('/');
  const observed = await page.evaluate(async (modulePath) => {
    const module = await import(modulePath);
    return module.collectSettlementFixtures();
  }, '/tests/fixtures/settlement-browser.ts');
  expect(observed).toEqual(expected);
});
