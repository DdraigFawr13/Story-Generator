import { test, expect, type Page } from '@playwright/test';
import { digestCanonical } from '../../src/adapters/crypto';
import { buildRecap } from '../../src/controller/recaps';
import { advanceSettlement, simulateSettlement } from '../../src/sim/settlement';
import { createSettlement } from '../../src/sim/settlement-initial';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const collected: string[] = [];
  errors.set(page, collected);
  page.on('pageerror', (error) => collected.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') collected.push(message.text());
  });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function fixture<T>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    async ({ name, args }) => {
      const path = '/tests/fixtures/persistence-browser.ts';
      const module = await import(path);
      return module[name](...args);
    },
    { name, args },
  );
}
async function menu(page: Page) {
  if (!(await page.getByLabel('World seed', { exact: true }).isVisible()))
    await page.locator('.world-menu summary').click();
}
async function openAt(page: Page, tick: number, version?: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved through week 0.');
  await fixture(page, 'writeFixture', 'RIVERSIDE', tick, version);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText(String(tick));
}
async function save(page: Page, tick: number) {
  await menu(page);
  await page.getByRole('button', { name: 'Save world', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText(`Saved through week ${tick}.`);
  return fixture(page, 'storedDigest');
}
async function clock(page: Page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
}

for (const [speed, duration] of [
  [1, 15000],
  [4, 3750],
  [16, 938],
] as const)
  test(`yearly reading pauses exactly at week 48 at ${speed}x and continues explicitly`, async ({
    page,
  }) => {
    await clock(page);
    await openAt(page, 47);
    await expect(page.getByLabel('Automatic recaps')).toHaveValue('yearly');
    await page.getByRole('button', { name: `${speed}x`, exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.clock.runFor(duration * 2);
    await expect(page.getByTestId('tick')).toHaveText('48');
    const reader = page.getByRole('region', { name: 'Historical recap', exact: true });
    await expect(reader.getByRole('heading', { name: 'Year 1', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    const digest = await save(page, 48);
    expect(digest).toEqual({
      tick: 48,
      seed: 'RIVERSIDE',
      digest: await digestCanonical(simulateSettlement('RIVERSIDE', 48).state),
    });
    await page.clock.runFor(duration * 10);
    await expect(page.getByTestId('tick')).toHaveText('48');
    await reader.getByRole('button', { name: 'Continue watching', exact: true }).click();
    await page.clock.runFor(duration);
    await expect(page.getByTestId('tick')).toHaveText('49');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });

test('seasonal/off preferences persist while manual Step and reload remain paused', async ({
  page,
}) => {
  await clock(page);
  await openAt(page, 11);
  await page.getByLabel('Automatic recaps').selectOption('seasonal');
  await page.getByRole('button', { name: 'Step one week', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Historical recap', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(15000 * 13);
  await expect(page.getByTestId('tick')).toHaveText('24');
  await expect(page.getByRole('heading', { name: 'Summer · Year 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close recap', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Read history', exact: true })).toBeFocused();
  await page.getByLabel('Automatic recaps').selectOption('off');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(15000 * 25);
  await expect(page.getByTestId('tick')).toHaveText('49');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await save(page, 49);
  await page.reload();
  await expect(page.getByLabel('Automatic recaps')).toHaveValue('off');
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText('49');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Read history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Year 1', exact: true })).toBeVisible();
});

test('earlier years and seasons use historical records while the current world stays unchanged', async ({
  page,
}) => {
  await openAt(page, 144);
  const before = await fixture(page, 'storedDigest');
  await page.getByRole('button', { name: 'Read history', exact: true }).click();
  await page.locator('.recap-history > summary').click();
  await page.getByRole('button', { name: 'Previous period', exact: true }).click();
  await page.getByRole('button', { name: 'Previous period', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Year 1', exact: true })).toBeFocused();
  const recap = buildRecap(simulateSettlement('RIVERSIDE', 48).state, {
    kind: 'yearly',
    endTick: 48,
  });
  const expected = recap.paragraphs.map((p) => p.tokens.map((t) => t.text).join('')).join(' ');
  expect((await page.locator('.recap-prose').innerText()).replace(/\s+/g, ' ')).toBe(
    expected.replace(/\s+/g, ' '),
  );
  await page.getByLabel('Recap period').selectOption('seasonal');
  await expect(page.getByRole('heading', { name: 'Winter · Year 1', exact: true })).toBeVisible();
  await expect(page.locator('.recap-prose')).toContainText('dormant crops and no crop food');
  await page.getByLabel('Season number').fill('1');
  await page.getByRole('button', { name: 'Read period', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spring · Year 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close recap', exact: true }).click();
  expect(await save(page, 144)).toEqual(before);
});

test('retained v1 saves read their own winter crop history and continue under their original rules', async ({
  page,
}) => {
  await openAt(page, 48, 'p1-settlement-v1');
  const original = await fixture(page, 'storedDigest');
  await page.getByRole('button', { name: 'Read history', exact: true }).click();
  const reader = page.getByRole('region', { name: 'Historical recap', exact: true });
  await reader.locator('.recap-history > summary').click();
  await reader.getByLabel('Recap period').selectOption('seasonal');
  await expect(page.locator('.recap-prose')).toContainText('the winter harvest');
  await expect(page.locator('.recap-prose')).not.toContainText('dormant crops');
  expect(await fixture(page, 'storedDigest')).toEqual(original);
  await reader.getByRole('button', { name: 'Close recap', exact: true }).click();
  await page.getByRole('button', { name: 'Step one week', exact: true }).click();
  const saved = await save(page, 49);
  expect(saved).toEqual({
    seed: 'RIVERSIDE',
    tick: 49,
    digest: await digestCanonical(
      advanceSettlement(createSettlement('RIVERSIDE', 'p1-settlement-v1'), 49).state,
    ),
  });
});

test('recap evidence and causal inspection return to the same prose, scroll and keyboard link', async ({
  page,
}) => {
  await openAt(page, 48);
  const before = await fixture(page, 'storedDigest');
  await page.getByRole('button', { name: 'Read history', exact: true }).click();
  const link = page.locator('.recap-prose .recap-link').last();
  await link.focus();
  const scroll = await page.locator('.recap-body').evaluate((el) => el.scrollTop);
  await link.click();
  await expect(page.locator('.event-details h3')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Back to recap', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to recap', exact: true }).click();
  await expect(link).toBeFocused();
  expect(await page.locator('.recap-body').evaluate((el) => el.scrollTop)).toBeCloseTo(scroll, 0);
  await page.locator('.recap-prose .recap-link').filter({ hasText: 'the spring harvest' }).click();
  await expect(page.locator('.event-details h3')).toBeFocused();
  await page.locator('.cause-button').first().click();
  await expect(page.locator('.event-details h3')).toBeFocused();
  await page.getByRole('button', { name: 'Back to recap', exact: true }).click();
  await page.locator('.recap-prose .recap-link').last().click();
  await expect(page.getByRole('button', { name: /^Return to record/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to recap', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect(await save(page, 48)).toEqual(before);
});

test('accepted replacement resets the reader while rejected Resume preserves it', async ({
  page,
}) => {
  await openAt(page, 48);
  await page.getByRole('button', { name: 'Read history', exact: true }).click();
  await fixture(page, 'damageSlot', false);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Year 1', exact: true })).toBeVisible();
  await expect(page.getByTestId('tick')).toHaveText('48');
  await fixture(page, 'writeFixture', 'RIVERSIDE', 60);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Historical recap', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('tick')).toHaveText('60');
  await page.getByRole('button', { name: 'Read history', exact: true }).click();
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Historical recap', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('tick')).toHaveText('0');
});

for (const [width, height] of [
  [320, 568],
  [390, 650],
] as const)
  test(`phone reader at 200% text remains readable and returns from evidence at ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await openAt(page, 48);
    await page.addStyleTag({ content: ':root { font-size: 200%; }' });
    const before = await fixture(page, 'storedDigest');
    await page.getByRole('button', { name: 'Read history', exact: true }).click();
    const reader = page.getByRole('region', { name: 'Historical recap', exact: true });
    const close = reader.getByRole('button', { name: 'Close recap', exact: true });
    await expect(close).toBeInViewport();
    await expect(page.locator('.recap-prose > p').first()).toBeInViewport();
    const canvas = await page.locator('canvas').boundingBox();
    const sheet = await reader.boundingBox();
    expect(canvas!.y).toBeLessThan(sheet!.y);
    await reader.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const link = page.locator('.recap-prose .recap-link').last();
    await link.focus();
    const scroll = await reader.evaluate((el) => el.scrollTop);
    await link.press('Enter');
    await expect(page.locator('.event-details h3')).toBeFocused();
    await page.getByRole('button', { name: 'Back to recap', exact: true }).click();
    await expect(link).toBeFocused();
    expect(await reader.evaluate((el) => el.scrollTop)).toBeCloseTo(scroll, 0);
    await expect(close).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await close.click();
    await expect(page.getByRole('button', { name: 'Read history', exact: true })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    expect(await fixture(page, 'storedDigest')).toEqual(before);
  });
