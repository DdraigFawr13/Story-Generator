import { test, expect, type Page } from '@playwright/test';
import { BOOKMARK_KEY } from '../../src/adapters/reader-bookmarks';
import type { LivingSettlementState } from '../../src/sim/living-state';
import { bookmarkIdentity } from '../../src/controller/bookmarks';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
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
async function fresh(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved through week 0.');
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Read residents', exact: true }).click();
}
async function addResident(page: Page, id = 17) {
  await page.locator(`[data-person-id="${id}"]`).click();
  await page.getByRole('button', { name: 'Bookmark resident', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove bookmark', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}
async function resume(page: Page, tick = 0) {
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText(String(tick));
}

test('resident and household shortcuts survive reload and evidence return without altering the saved world', async ({
  page,
}) => {
  await fresh(page);
  const before = await fixture(page, 'storedDigest');
  await open(page);
  await addResident(page);
  await page
    .locator('.resident-profile')
    .getByRole('button', { name: 'Hazel · #11', exact: true })
    .click();
  await page.getByRole('button', { name: 'Bookmark household', exact: true }).click();
  await expect(page.locator('[data-bookmark-open]')).toHaveCount(2);
  expect(await fixture(page, 'storedDigest')).toEqual(before);
  await page.reload();
  await resume(page);
  await open(page);
  await page.locator('[data-bookmark-open="resident:17"]').click();
  await expect(page.locator('.resident-profile h3')).toBeFocused();
  const source = page.locator('.personal-records [data-resident-source-id]').first();
  await source.focus();
  const scroll = await page.locator('.resident-content').evaluate((el) => el.scrollTop);
  await source.press('Enter');
  await expect(page.locator('.event-details h3')).toBeFocused();
  await page.getByRole('button', { name: 'Back to resident', exact: true }).click();
  await expect(source).toBeFocused();
  expect(await page.locator('.resident-content').evaluate((el) => el.scrollTop)).toBeCloseTo(
    scroll,
    0,
  );
  await page.locator('[data-bookmark-open="household:11"]').click();
  await expect(page.locator('.household-profile h3')).toBeFocused();
  await page.locator('[data-bookmark-remove="resident:17"]').click();
  await expect(page.locator('[data-bookmark-remove="household:11"]')).toBeFocused();
  await page.locator('[data-bookmark-remove="household:11"]').click();
  await expect(page.getByRole('heading', { name: 'Your bookmarks', exact: true })).toBeFocused();
  expect(await fixture(page, 'storedDigest')).toEqual(before);
});

test('shortcuts follow their seed while accepted replacement resets the profile and rejected Resume retains it', async ({
  page,
}) => {
  await fresh(page);
  await open(page);
  await addResident(page);
  await fixture(page, 'damageSlot', true);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.locator('.resident-profile h3')).toHaveText('Rian Hazel · #17');
  await expect(page.locator('[data-bookmark-open="resident:17"]')).toHaveCount(1);
  await fixture(page, 'writeNamedFixture', 'RIVERSIDE', 0);
  await resume(page);
  await open(page);
  await expect(page.locator('.resident-profile')).toHaveCount(0);
  await expect(page.locator('[data-bookmark-open="resident:17"]')).toHaveCount(1);
  await menu(page);
  await page.getByLabel('World seed', { exact: true }).fill('OTHER_SEED');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await open(page);
  await expect(page.locator('[data-bookmark-open]')).toHaveCount(0);
  await resume(page);
  await open(page);
  await expect(page.locator('[data-bookmark-open="resident:17"]')).toHaveCount(1);
});

test('unrecorded or mismatched shortcuts are disabled and removable instead of inventing histories', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          schema: 1,
          worlds: [
            {
              key: JSON.stringify(['p2-settlement-v1', 'RIVERSIDE']),
              subjects: [
                { kind: 'resident', id: 999, origin: 'unrecorded' },
                { kind: 'resident', id: 17, origin: 'different identity' },
              ],
            },
          ],
        }),
      ),
    { key: BOOKMARK_KEY },
  );
  await fresh(page);
  const before = await fixture(page, 'storedDigest');
  await open(page);
  await expect(page.locator('[data-bookmark-open="resident:999"]')).toBeDisabled();
  await expect(page.locator('[data-bookmark-open="resident:17"]')).toBeDisabled();
  await expect(page.locator('.reading-bookmarks')).toContainText('Not recorded in this history.');
  await page.locator('[data-bookmark-remove="resident:999"]').click();
  await expect(page.locator('[data-bookmark-remove="resident:17"]')).toBeFocused();
  await addResident(page);
  await expect(page.locator('[data-bookmark-open="resident:17"]')).toBeEnabled();
  await expect(page.locator('[data-bookmark-open]')).toHaveCount(1);
  expect(await fixture(page, 'storedDigest')).toEqual(before);
});

test('quota-denied bookmark storage keeps session shortcuts and reports that they will not persist', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Preference quota', 'QuotaExceededError');
    };
  });
  await fresh(page);
  const before = await fixture(page, 'storedDigest');
  await open(page);
  await addResident(page);
  await expect(page.locator('.reading-bookmarks')).toContainText(
    'Changes last for this open session.',
  );
  await expect(page.locator('[data-bookmark-open="resident:17"]')).toBeEnabled();
  expect(await fixture(page, 'storedDigest')).toEqual(before);
  await page.reload();
  await resume(page);
  await open(page);
  await expect(page.locator('[data-bookmark-open]')).toHaveCount(0);
  expect(await fixture(page, 'storedDigest')).toEqual(before);
});

test('another tab receives passive shortcut changes while writer ownership and save bytes stay unchanged', async ({
  page,
  context,
}) => {
  await fresh(page);
  const before = await fixture(page, 'storedDigest');
  const other = await context.newPage();
  other.on('pageerror', (error) => errors.get(page)!.push(error.message));
  other.on('console', (message) => {
    if (message.type() === 'error') errors.get(page)!.push(message.text());
  });
  try {
    await other.goto('/');
    await expect(other.locator('.save-status')).toContainText('Read-only');
    await expect(other.getByTestId('tick')).toHaveText('0');
    await open(other);
    await open(page);
    await addResident(page);
    await expect(other.locator('[data-bookmark-open="resident:17"]')).toBeEnabled();
    await other.locator('[data-bookmark-remove="resident:17"]').click();
    await expect(page.locator('[data-bookmark-open]')).toHaveCount(0);
    expect(await fixture(page, 'storedDigest')).toEqual(before);
    await expect(page.getByRole('button', { name: 'Step one week', exact: true })).toBeEnabled();
    await expect(other.getByRole('button', { name: 'Step one week', exact: true })).toBeDisabled();
  } finally {
    await other.close();
  }
});

test('naturally deceased residents and retired households keep usable factual bookmarks', async ({
  page,
}) => {
  test.setTimeout(90000);
  await fresh(page);
  await fixture(page, 'writeNamedFixture', 'LIVES_4', 1000);
  await resume(page, 1000);
  const stored = await fixture<{ payload: LivingSettlementState }>(page, 'readSlot');
  const world = stored.payload;
  const dead = world.world.residents.find((person) => person.deathEventId !== null)!;
  const retired = world.world.households.find(
    (household) => world.world.entities[household.id - 1]!.retired,
  )!;
  const subjects = [
    bookmarkIdentity(world, { kind: 'resident', id: dead.id })!,
    bookmarkIdentity(world, { kind: 'household', id: retired.id })!,
  ];
  const before = await fixture(page, 'storedDigest');
  await page.evaluate(
    ({ key, subjects }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          schema: 1,
          worlds: [{ key: JSON.stringify(['p2-settlement-v1', 'LIVES_4']), subjects }],
        }),
      );
      window.dispatchEvent(new StorageEvent('storage', { key }));
    },
    { key: BOOKMARK_KEY, subjects },
  );
  await open(page);
  await page.locator(`[data-bookmark-open="resident:${dead.id}"]`).click();
  await expect(page.locator('.resident-profile')).toContainText('Age at death');
  await page.locator(`[data-bookmark-open="household:${retired.id}"]`).click();
  await expect(page.locator('.household-profile')).toContainText('No living members');
  await expect(page.locator('.personal-records [data-resident-source-id]')).not.toHaveCount(0);
  expect(await fixture(page, 'storedDigest')).toEqual(before);
});

for (const [width, height] of [
  [320, 568],
  [390, 650],
] as const)
  test(`phone shortcuts and removal preserve keyboard return and map context at 200% on ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await fresh(page);
    const before = await fixture(page, 'storedDigest');
    await page.addStyleTag({ content: ':root {font-size:200%;}' });
    await open(page);
    await addResident(page);
    const shortcut = page.locator('[data-bookmark-open="resident:17"]');
    await shortcut.focus();
    await shortcut.press('Enter');
    await expect(page.locator('.resident-profile h3')).toBeFocused();
    const source = page.locator('.personal-records [data-resident-source-id]').first();
    await source.focus();
    await source.press('Enter');
    await expect(page.locator('.event-details h3')).toBeInViewport();
    await page.getByRole('button', { name: 'Back to resident', exact: true }).click();
    await expect(source).toBeFocused();
    await page.locator('[data-bookmark-remove="resident:17"]').click();
    await expect(page.getByRole('heading', { name: 'Your bookmarks', exact: true })).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Close residents', exact: true }),
    ).toBeInViewport();
    const canvas = await page.locator('canvas').boundingBox();
    const reader = await page
      .getByRole('region', { name: 'Resident histories', exact: true })
      .boundingBox();
    expect(canvas!.y).toBeLessThan(reader!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const remove = page.getByRole('button', { name: 'Bookmark resident', exact: true });
    const bounds = await remove.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Read residents', exact: true })).toBeFocused();
    expect(await fixture(page, 'storedDigest')).toEqual(before);
  });
