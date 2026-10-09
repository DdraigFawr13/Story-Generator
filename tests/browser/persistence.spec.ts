import { test, expect, type Page } from '@playwright/test';
import { digestCanonical } from '../../src/adapters/crypto';
import { simulateSettlement } from '../../src/sim/settlement';

const consoleErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page)).toEqual([]);
});

async function fixture<T>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    async ({ name, args }) => {
      const modulePath = '/tests/fixtures/persistence-browser.ts';
      const module = await import(modulePath);
      return module[name](...args);
    },
    { name, args },
  );
}
async function menu(page: Page) {
  if (!(await page.getByLabel('World seed', { exact: true }).isVisible()))
    await page.locator('.world-menu summary').click();
}
async function fresh(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText('0');
}
async function steps(page: Page, count: number) {
  for (let i = 0; i < count; i++) await page.getByRole('button', { name: 'Step one week' }).click();
}
async function save(page: Page, tick: number) {
  await menu(page);
  await page.getByRole('button', { name: 'Save world', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText(`Saved through week ${tick}.`);
}

test('save, reload and paused Resume continue the complete world: 57+80 = 137', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await fresh(page);
  await fixture(page, 'writeFixture', 'RIVERSIDE', 57);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await expect(page.getByTestId('tick')).toHaveText('57');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume local save' })).toBeEnabled();
  expect(await page.getByTestId('tick').count()).toBe(0);
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await expect(page.getByTestId('tick')).toHaveText('57');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await steps(page, 80);
  await save(page, 137);
  expect(await fixture(page, 'storedDigest')).toEqual({
    tick: 137,
    seed: 'RIVERSIDE',
    digest: await digestCanonical(simulateSettlement('RIVERSIDE', 137).state),
  });
  expect(errors).toEqual([]);
});

test('aborting after put success retains the old complete IndexedDB slot', async ({ page }) => {
  await fresh(page);
  await fixture(page, 'writeFixture', 'RIVERSIDE', 40);
  const result = await fixture<{ rejected: boolean; before: unknown; after: unknown }>(
    page,
    'abortAfterRequestSuccess',
  );
  expect(result.rejected).toBe(true);
  expect(result.after).toEqual(result.before);
});

for (const checksummed of [false, true])
  test(`corrupt ${checksummed ? 'checksummed' : 'damaged'} saves stay stored and cannot replace a running world`, async ({
    page,
  }) => {
    await fresh(page);
    await fixture(page, 'writeFixture', 'RIVERSIDE', 12);
    await fixture(page, 'damageSlot', checksummed);
    await menu(page);
    await page.getByRole('button', { name: 'Resume local save' }).click();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByTestId('tick')).toHaveText('0');
    await page.reload();
    await expect(page.getByRole('alert')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Resume local save' })).toBeDisabled();
    await page.getByRole('button', { name: 'New world', exact: true }).click();
    await steps(page, 21);
    await menu(page);
    await expect(
      page.getByRole('button', { name: 'Replace local save with this world' }),
    ).toBeEnabled();
    const slot = await fixture<{ payload: { tick: number } }>(page, 'readSlot');
    expect(slot.payload.tick).toBe(12);
  });

test('quota failure preserves the old save and a later manual retry saves current progress', async ({
  page,
}) => {
  await fresh(page);
  await save(page, 0);
  await steps(page, 2);
  await page.evaluate(() => {
    const native = IDBObjectStore.prototype.put;
    Object.assign(window, {
      restorePut: () => {
        IDBObjectStore.prototype.put = native;
      },
    });
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Injected quota failure', 'QuotaExceededError');
    };
  });
  await menu(page);
  await page.getByRole('button', { name: 'Save world', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('quota');
  expect((await fixture<{ tick: number }>(page, 'storedDigest')).tick).toBe(0);
  await expect(page.getByTestId('tick')).toHaveText('2');
  await page.evaluate(() => {
    (window as unknown as { restorePut: () => void }).restorePut();
  });
  await save(page, 2);
});

test('a new candidate cannot autosave over the existing world without explicit replacement', async ({
  page,
}) => {
  await fresh(page);
  await save(page, 0);
  await menu(page);
  await page.getByLabel('World seed', { exact: true }).fill('WORLD_B');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await steps(page, 21);
  expect((await fixture<{ seed: string }>(page, 'storedDigest')).seed).toBe('RIVERSIDE');
  await menu(page);
  await page.getByRole('button', { name: 'Replace local save with this world' }).click();
  await expect(page.locator('.save-status')).toContainText('Saved through week 21.');
  expect((await fixture<{ seed: string }>(page, 'storedDigest')).seed).toBe('WORLD_B');
});

test('two tabs share a single writer and takeover reloads the latest committed save', async ({
  page,
  context,
}) => {
  await fresh(page);
  await steps(page, 3);
  await save(page, 3);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('.save-status')).toContainText('Read-only');
  await expect(second.getByTestId('tick')).toHaveText('3');
  await expect(second.getByRole('button', { name: 'Step one week' })).toBeDisabled();
  await steps(page, 2);
  await save(page, 5);
  await page.close();
  await second.getByRole('button', { name: 'Take ownership' }).click();
  await expect(second.getByTestId('tick')).toHaveText('5');
  await expect(second.getByRole('button', { name: 'Step one week' })).toBeEnabled();
  await expect(second.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('a non-owner cannot start unsaved play with an empty or unsupported slot', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New world', exact: true })).toBeEnabled();
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.locator('.save-status')).toContainText('Read-only');
  await expect(second.getByRole('button', { name: 'New world', exact: true })).toBeDisabled();
  await fixture(page, 'unsupportedSlot');
  await page.close();
  await second.getByRole('button', { name: 'Take ownership' }).click();
  await expect(second.getByRole('alert')).toContainText('unsupported');
  await second.getByRole('button', { name: 'New world', exact: true }).click();
  await steps(second, 1);
  expect(await fixture(second, 'readSlot')).toEqual({ envelopeVersion: 99 });
});

test('missing locking capability allows explicit unsaved play with no save claims', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined });
  });
  await fresh(page);
  await steps(page, 1);
  await expect(page.locator('.save-status')).toContainText('Unsaved play');
  await menu(page);
  await expect(page.getByRole('button', { name: 'Save world', exact: true })).toBeDisabled();
});

test('playback and repeated hidden returns stay paused without catch-up', async ({ page }) => {
  await page.clock.install();
  await fresh(page);
  await page.clock.pauseAt(new Date());
  await page.getByRole('button', { name: '16x', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(938);
  await expect(page.getByTestId('tick')).toHaveText('1');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(60000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.getByTestId('tick')).toHaveText('1');
  }
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(938);
  await expect(page.getByTestId('tick')).toHaveText('2');
});

test('chronicle selection uses actual facts and locations without changing the week', async ({
  page,
}) => {
  await fresh(page);
  await steps(page, 12);
  await page.getByRole('button', { name: /spring harvest brings/ }).click();
  const details = page.getByRole('region', { name: 'Event evidence' });
  await expect(details).toContainText('Recorded facts');
  await expect(details).toContainText('Changes at this event');
  await expect(details).toContainText('Recorded causes');
  await expect(page.locator('.tile-facts')).toContainText('Tile 1327:');
  await details.getByRole('button').first().click();
  await expect(page.getByTestId('tick')).toHaveText('12');
});

test('phone chronicle has keyboard opening, independent scrolling and focus return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fresh(page);
  await steps(page, 12);
  const opener = page.getByRole('button', { name: 'Open chronicle' });
  await opener.click();
  await page.getByRole('button', { name: /spring harvest brings/ }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Back to map' }).focus();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await expect(page.getByTestId('tick')).toHaveText('12');
});
