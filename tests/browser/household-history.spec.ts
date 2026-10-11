import { test, expect, type Page } from '@playwright/test';
import { canonicalJson } from '../../src/sim/canonical';
import { createLivingSettlement } from '../../src/sim/living-initial';
import { simulateLivingSettlement } from '../../src/sim/living';
import type { WorldState, WorldSnapshot } from '../../src/sim/world';
import { householdDossier } from '../../src/controller/households';
import { residentName } from '../../src/controller/residents';
import { ALL_RECORDS, filterChronicle } from '../../src/controller/chronicle-filters';

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
async function fresh(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved through week 0.');
}
async function namedAt(page: Page, tick: number) {
  await fresh(page);
  await fixture(page, 'writeNamedFixture', 'LIVES_4', tick);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText(String(tick));
}
async function household(page: Page, id: number) {
  await page.getByRole('button', { name: 'Read residents', exact: true }).click();
  await page.locator('.household-roster > summary').click();
  await page.locator(`[data-household-id="${id}"]`).click();
  await expect(page.locator('.household-profile h3')).toBeFocused();
}
async function save(page: Page, tick: number) {
  await menu(page);
  await page.getByRole('button', { name: 'Save world', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText(`Saved through week ${tick}.`);
  return (await fixture<{ payload: WorldState }>(page, 'readSlot')).payload;
}
function paragraphText(world: WorldSnapshot, id: number) {
  return householdDossier(world, id)!
    .paragraphs.map((paragraph) => paragraph.tokens.map((token) => token.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ');
}
let long: ReturnType<typeof simulateLivingSettlement>['state'] | undefined;
function longWorld() {
  return (long ??= simulateLivingSettlement('LIVES_4', 1000).state);
}
async function recordIds(page: Page) {
  return page
    .locator('.event-list [data-event-id]')
    .evaluateAll((elements) =>
      elements.map((element) => Number((element as HTMLElement).dataset.eventId)),
    );
}
async function filters(page: Page) {
  await page.locator('.chronicle-filters > summary').click();
}

test('household reading uses actual members and supports member/household return without inventing kinship', async ({
  page,
}) => {
  await fresh(page);
  const world = createLivingSettlement('RIVERSIDE');
  await household(page, 11);
  await expect(page.locator('[data-household-person-id]')).toHaveCount(4);
  await expect(page.locator('.household-profile')).toContainText(
    'Parentage and earlier kinship are unrecorded.',
  );
  expect((await page.locator('.resident-prose').innerText()).replace(/\s+/g, ' ')).toBe(
    paragraphText(world, 11),
  );
  await page.locator('[data-household-person-id="17"]').click();
  await expect(page.locator('.resident-profile h3')).toHaveText(
    `${residentName(world.world.residents[0]!)} · #17`,
  );
  await page.getByRole('button', { name: 'Back to the Hazel household', exact: true }).click();
  await expect(page.locator('.household-profile h3')).toBeFocused();
  await page.keyboard.press('Escape');
  expect(canonicalJson(await save(page, 0))).toBe(canonicalJson(world));
});

test('a naturally retired household keeps deceased members and real death records', async ({
  page,
}) => {
  test.setTimeout(90000);
  const world = longWorld();
  const retired = world.world.households.find(
    (household) => world.world.entities[household.id - 1]!.retired,
  )!;
  await namedAt(page, 1000);
  await household(page, retired.id);
  await expect(page.locator('.household-profile')).toContainText('No living members');
  await expect(page.locator('.household-profile')).toContainText(
    'No living members have an assigned hut.',
  );
  expect((await page.locator('.resident-prose').innerText()).replace(/\s+/g, ' ')).toBe(
    paragraphText(world, retired.id),
  );
  const deceased = householdDossier(world, retired.id)!.deceased[0]!;
  await page.locator(`[data-household-person-id="${deceased.id}"]`).click();
  await expect(page.locator('.resident-profile')).toContainText('Age at death');
  await page
    .getByRole('button', { name: `Back to the ${retired.name} household`, exact: true })
    .click();
  await expect(page.locator('.household-profile h3')).toBeFocused();
});

test('household members expose real known parentage and historian prose with retained evidence', async ({
  page,
}) => {
  test.setTimeout(90000);
  const world = longWorld();
  const child = world.world.residents.find((person) => person.birthEventId !== null)!;
  await namedAt(page, 1000);
  await household(page, child.householdId);
  await expect(page.locator('.household-members')).toContainText('Further parentage is unknown.');
  expect((await page.locator('.resident-prose').innerText()).replace(/\s+/g, ' ')).toBe(
    paragraphText(world, child.householdId),
  );
  const ids = await page
    .locator('.personal-records [data-resident-source-id]')
    .evaluateAll((elements) =>
      elements.map((element) => Number((element as HTMLElement).dataset.residentSourceId)),
    );
  expect(ids).toEqual(
    householdDossier(world, child.householdId)!
      .records.slice(-32)
      .map((record) => record.eventId)
      .reverse(),
  );
});

test('household sources and causes return to the exact link, scroll and unchanged saved world', async ({
  page,
}) => {
  await fresh(page);
  await page.getByRole('button', { name: 'Step one week', exact: true }).click();
  const world = await save(page, 1);
  await household(page, 11);
  const source = page.locator('.personal-records [data-resident-source-id]').first();
  await source.focus();
  const scroll = await page.locator('.resident-content').evaluate((element) => element.scrollTop);
  await source.press('Enter');
  await expect(page.locator('.event-details h3')).toBeFocused();
  if (await page.locator('.cause-button').count())
    await page.locator('.cause-button').first().click();
  await page.getByRole('button', { name: 'Back to household', exact: true }).click();
  await expect(source).toBeFocused();
  expect(
    await page.locator('.resident-content').evaluate((element) => element.scrollTop),
  ).toBeCloseTo(scroll, 0);
  await page.keyboard.press('Escape');
  expect(canonicalJson(await save(page, 1))).toBe(canonicalJson(world));
});

test('combined archive filters include older real participants while causes remain accessible outside filters', async ({
  page,
}) => {
  test.setTimeout(90000);
  const world = longWorld();
  const child = world.world.residents.find((person) => person.birthEventId !== null)!;
  await namedAt(page, 1000);
  await filters(page);
  await page.getByRole('combobox', { name: 'Person', exact: true }).selectOption(String(child.id));
  await page
    .getByRole('combobox', { name: 'Household records', exact: true })
    .selectOption(String(child.householdId));
  await page.getByRole('combobox', { name: 'Record category', exact: true }).selectOption('births');
  await page
    .getByRole('combobox', { name: 'Record importance', exact: true })
    .selectOption('major');
  const expected = filterChronicle(world, {
    personId: child.id,
    householdId: child.householdId,
    category: 'births',
    importance: 'major',
  });
  expect(await recordIds(page)).toEqual(expected.map((event) => event.id).reverse());
  expect(expected.some((event) => event.id < world.events.length - 200)).toBe(true);
  await page.locator('.event-list [data-event-id]').first().click();
  await page.locator('.cause-button').first().click();
  await expect(page.locator('.event-details')).toContainText(
    'This source is outside your current filters.',
  );
  await page.getByRole('button', { name: /^Return to record/ }).click();
  await page.getByLabel('Record number', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Find record', exact: true }).click();
  await expect(page.locator('.event-details')).toContainText('record #1 · tile');
  expect(canonicalJson(await save(page, 1000))).toBe(canonicalJson(world));
});

test('complete archive pagination retains earlier matches and resets when filters change', async ({
  page,
}) => {
  test.setTimeout(90000);
  const world = longWorld();
  await namedAt(page, 1000);
  const ids: number[] = [];
  for (;;) {
    ids.push(...(await recordIds(page)));
    const earlier = page.getByRole('button', { name: 'Earlier matching records', exact: true });
    if (await earlier.isDisabled()) break;
    await earlier.click();
  }
  expect(ids).toEqual(world.events.map((event) => event.id).reverse());
  await filters(page);
  await page
    .getByRole('combobox', { name: 'Record category', exact: true })
    .selectOption('weather');
  expect(await recordIds(page)).toEqual(
    filterChronicle(world, { ...ALL_RECORDS, category: 'weather' })
      .map((event) => event.id)
      .reverse(),
  );
  await expect(
    page.getByRole('button', { name: 'Earlier matching records', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear record filters', exact: true }).click();
  expect(await recordIds(page)).toEqual(
    world.events
      .slice(-200)
      .map((event) => event.id)
      .reverse(),
  );
});

test('rejected replacement retains household reading and accepted replacement clears subjects and filters', async ({
  page,
}) => {
  await namedAt(page, 48);
  await filters(page);
  await page.getByRole('combobox', { name: 'Record category', exact: true }).selectOption('births');
  await household(page, 11);
  const before = await page.locator('.household-profile').innerText();
  await fixture(page, 'damageSlot', true);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  expect(await page.locator('.household-profile').innerText()).toBe(before);
  await fixture(page, 'writeNamedFixture', 'LIVES_4', 48);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Resident histories', exact: true })).toHaveCount(
    0,
  );
  await filters(page);
  await expect(page.getByRole('combobox', { name: 'Record category', exact: true })).toHaveValue(
    'all',
  );
  await page.getByRole('button', { name: 'Read residents', exact: true }).click();
  await expect(page.locator('.household-profile')).toHaveCount(0);
});

for (const [width, height] of [
  [320, 568],
  [390, 650],
] as const)
  test(`household phone reading and evidence preserve context and visible keyboard return at 200% on ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await fresh(page);
    const before = await fixture(page, 'storedDigest');
    await page.addStyleTag({ content: ':root { font-size:200%; }' });
    await household(page, 11);
    await expect(page.locator('.household-profile h3')).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'Close residents', exact: true }),
    ).toBeInViewport();
    const canvas = await page.locator('canvas').boundingBox();
    const reader = await page
      .getByRole('region', { name: 'Resident histories', exact: true })
      .boundingBox();
    expect(canvas!.y).toBeLessThan(reader!.y);
    const source = page.locator('.personal-records [data-resident-source-id]').first();
    await source.focus();
    await source.press('Enter');
    await expect(page.locator('.event-details h3')).toBeFocused();
    await expect(page.locator('.event-details h3')).toBeInViewport();
    await page.getByRole('button', { name: 'Back to household', exact: true }).click();
    await expect(source).toBeFocused();
    await expect(source).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    const opener = page.getByRole('button', { name: 'Read residents', exact: true });
    await expect(opener).toBeFocused();
    await expect(opener).toBeInViewport();
    expect(await fixture(page, 'storedDigest')).toEqual(before);
  });
