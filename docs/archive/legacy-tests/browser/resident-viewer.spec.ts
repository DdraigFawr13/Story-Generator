import { test, expect, type Page } from '@playwright/test';
import { canonicalJson } from '../../src/sim/canonical';
import { simulateLivingSettlement } from '../../src/sim/living';
import { createLivingSettlement } from '../../src/sim/living-initial';
import { advanceSettlement } from '../../src/sim/settlement';
import { createSettlement } from '../../src/sim/settlement-initial';
import type { WorldState, WorldSnapshot } from '../../src/sim/world';
import { residentDossier, residentName, ageLabel } from '../../src/controller/residents';
import { headline } from '../../src/controller/chronicle';
import { buildRecap } from '../../src/controller/recaps';

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
  await expect(page.getByTestId('tick')).toHaveText('0');
  await expect(page.locator('.save-status')).toContainText('Saved through week 0.');
}
async function namedAt(page: Page, tick: number) {
  await fresh(page);
  await fixture(page, 'writeNamedFixture', 'RIVERSIDE', tick);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText(String(tick));
}
async function save(page: Page, tick: number) {
  await menu(page);
  await page.getByRole('button', { name: 'Save world', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText(`Saved through week ${tick}.`);
  return (await fixture<{ payload: WorldState }>(page, 'readSlot')).payload;
}
async function openResidents(page: Page) {
  await page.getByRole('button', { name: 'Read residents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The residents', exact: true })).toBeFocused();
}
async function choose(page: Page, id: number) {
  if (!(await page.getByLabel('Find a resident', { exact: true }).isVisible()))
    await page.locator('.resident-roster > summary').click();
  await page.getByRole('combobox', { name: 'Resident status', exact: true }).selectOption('all');
  await page.getByRole('combobox', { name: 'Household', exact: true }).selectOption('all');
  await page.getByLabel('Find a resident', { exact: true }).fill(`#${id}`);
  await page.locator(`[data-person-id="${id}"]`).click();
  await expect(page.locator('.resident-profile h3')).toBeFocused();
}
let sample: ReturnType<typeof simulateLivingSettlement>['state'] | undefined;
function longWorld() {
  return (sample ??= simulateLivingSettlement('RIVERSIDE', 1000).state);
}
function prose(world: WorldSnapshot, id: number) {
  return residentDossier(world, id)!
    .paragraphs.map((paragraph) => paragraph.tokens.map((token) => token.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ');
}

test('a fresh named world saves complete identities and presents factual founding histories', async ({
  page,
}) => {
  await fresh(page);
  const expected = createLivingSettlement('RIVERSIDE');
  expect(canonicalJson(await save(page, 0))).toBe(canonicalJson(expected));
  await openResidents(page);
  await expect(page.locator('.resident-list [data-person-id]')).toHaveCount(24);
  await page
    .getByRole('combobox', { name: 'Household', exact: true })
    .selectOption(String(expected.world.households[0]!.id));
  await expect(page.locator('.resident-list [data-person-id]')).toHaveCount(4);
  await choose(page, expected.world.residents[0]!.id);
  await choose(page, expected.world.residents[0]!.id);
  await expect(page.locator('.resident-profile')).toContainText(
    'Parentage and earlier family life are unrecorded.',
  );
  expect((await page.locator('.resident-prose').innerText()).replace(/\s+/g, ' ')).toBe(
    prose(expected, 17),
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Read residents', exact: true })).toBeFocused();
  expect(canonicalJson(await save(page, 0))).toBe(canonicalJson(expected));
});

test('named save, reload and paused Resume preserve the complete world through 57+80 weeks', async ({
  page,
}) => {
  test.setTimeout(90000);
  await namedAt(page, 57);
  await page.reload();
  await expect(page.getByTestId('tick')).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText('57');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  for (let i = 0; i < 80; i++)
    await page.getByRole('button', { name: 'Step one week', exact: true }).click();
  expect(canonicalJson(await save(page, 137))).toBe(
    canonicalJson(simulateLivingSettlement('RIVERSIDE', 137).state),
  );
  await openResidents(page);
  await choose(page, 17);
  expect((await page.locator('.resident-prose').innerText()).replace(/\s+/g, ' ')).toBe(
    prose(simulateLivingSettlement('RIVERSIDE', 137).state, 17),
  );
});

test('named playback updates a passive profile and pauses at the exact yearly recap boundary', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await namedAt(page, 46);
  await openResidents(page);
  await choose(page, 17);
  await page.getByRole('button', { name: '16x', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(938);
  await expect(page.getByTestId('tick')).toHaveText('47');
  await expect(page.locator('.resident-profile')).toBeVisible();
  await page.clock.runFor(938 * 2);
  await expect(page.getByTestId('tick')).toHaveText('48');
  await expect(page.getByRole('region', { name: 'Resident histories', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('heading', { name: 'Year 1', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  const world = simulateLivingSettlement('RIVERSIDE', 48).state;
  const recap = buildRecap(world, { kind: 'yearly', endTick: 48 });
  expect((await page.locator('.recap-prose').innerText()).replace(/\s+/g, ' ')).toBe(
    recap.paragraphs
      .map((paragraph) => paragraph.tokens.map((token) => token.text).join(''))
      .join(' ')
      .replace(/\s+/g, ' '),
  );
  expect(canonicalJson(await save(page, 48))).toBe(canonicalJson(world));
  await page.clock.runFor(938 * 10);
  await expect(page.getByTestId('tick')).toHaveText('48');
});

for (const version of ['p1-settlement-v1', 'p1-settlement-v2'])
  test(`an existing ${version} world keeps its history and original reducer`, async ({ page }) => {
    await fresh(page);
    await fixture(page, 'writeFixture', 'RIVERSIDE', 47, version);
    await menu(page);
    await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
    await expect(page.getByTestId('tick')).toHaveText('47');
    await expect(page.getByRole('button', { name: 'Read residents', exact: true })).toHaveCount(0);
    await expect(
      page.getByText(
        'This saved world records population totals. Named residents begin in fresh worlds.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Step one week', exact: true }).click();
    expect(canonicalJson(await save(page, 48))).toBe(
      canonicalJson(advanceSettlement(createSettlement('RIVERSIDE', version), 48).state),
    );
  });

test('real births link only known parents and children, while deceased ages remain at death', async ({
  page,
}) => {
  test.setTimeout(90000);
  const world = longWorld();
  const born = world.world.residents.find((person) => person.birthEventId !== null)!;
  const parent = world.world.residents.find((person) => person.id === born.parentIds[0])!;
  const deceased = world.world.residents.find((person) => person.deathEventId !== null)!;
  await namedAt(page, 1000);
  await openResidents(page);
  await choose(page, born.id);
  await expect(page.locator('.resident-profile')).toContainText('Further parentage is unknown.');
  expect((await page.locator('.resident-prose').innerText()).replace(/\s+/g, ' ')).toBe(
    prose(world, born.id),
  );
  await page
    .locator('.resident-profile')
    .getByRole('button', { name: `${residentName(parent)} · #${parent.id}`, exact: true })
    .click();
  await expect(page.locator('.resident-profile h3')).toHaveText(
    `${residentName(parent)} · #${parent.id}`,
  );
  await expect(page.locator('.resident-relations')).toContainText(residentName(born));
  await page.getByRole('button', { name: `Back to ${residentName(born)}`, exact: true }).click();
  await expect(page.locator('.resident-profile h3')).toHaveText(
    `${residentName(born)} · #${born.id}`,
  );
  await choose(page, deceased.id);
  const age = ageLabel(residentDossier(world, deceased.id)!.ageWeeks);
  await expect(
    page
      .locator('.resident-profile dl div')
      .filter({ has: page.getByText('Age at death', { exact: true }) }),
  ).toContainText(age);
  await page.getByText('Recorded death inputs', { exact: true }).click();
  await expect(page.locator('.resident-profile')).toContainText('Modeled risk draw');
  await page.getByRole('button', { name: 'Step one week', exact: true }).click();
  await expect(
    page
      .locator('.resident-profile dl div')
      .filter({ has: page.getByText('Age at death', { exact: true }) }),
  ).toContainText(age);
});

test('personal evidence and causes return to the exact timeline source without changing saved history', async ({
  page,
}) => {
  await namedAt(page, 48);
  const world = simulateLivingSettlement('RIVERSIDE', 48).state;
  const dossier = residentDossier(world, 17)!;
  const work = dossier.records
    .filter((record) => world.events[record.eventId - 1]!.type === 'work_changed')
    .at(-1)!;
  await openResidents(page);
  await choose(page, 17);
  const source = page.locator(`.personal-records [data-resident-source-id="${work.eventId}"]`);
  await source.focus();
  const scroll = await page.locator('.resident-content').evaluate((el) => el.scrollTop);
  await source.press('Enter');
  await expect(page.locator('.event-details h3')).toBeFocused();
  await expect(page.locator('.event-details h3')).toHaveText(
    headline(world.events[work.eventId - 1]!),
  );
  const causes = page.locator('.cause-button');
  expect(await causes.count()).toBeGreaterThan(0);
  await causes.first().click();
  await expect(page.locator('.event-details h3')).toBeFocused();
  await page.getByRole('button', { name: 'Back to resident', exact: true }).click();
  await expect(source).toBeFocused();
  expect(await page.locator('.resident-content').evaluate((el) => el.scrollTop)).toBeCloseTo(
    scroll,
    0,
  );
  await source.press('Enter');
  await expect(page.getByRole('button', { name: /^Return to record/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(source).toBeFocused();
  await page.keyboard.press('Escape');
  expect(canonicalJson(await save(page, 48))).toBe(canonicalJson(world));
});

test('recorded family deaths retain chronology, source focus and complete saved history on desktop and zoomed phones', async ({
  page,
}) => {
  test.setTimeout(90000);
  const world = longWorld();
  const subject = world.world.residents.find((person) => {
    if (person.deathEventId === null) return false;
    return world.world.residents.some(
      (child) =>
        child.parentIds.includes(person.id) &&
        child.deathEventId !== null &&
        world.events[child.deathEventId - 1]!.tick > world.events[person.deathEventId! - 1]!.tick,
    );
  })!;
  expect(subject).toBeDefined();
  const dossier = residentDossier(world, subject.id)!;
  const child = dossier.children
    .filter((person) => person.deathEventId !== null)
    .sort((a, b) => b.deathEventId! - a.deathEventId!)[0]!;
  await namedAt(page, 1000);
  const stored = await fixture(page, 'readSlot');
  await openResidents(page);
  await choose(page, subject.id);
  await expect(page.locator('.resident-prose')).toContainText(
    `After ${residentName(subject)}'s death`,
  );
  await expect(page.locator('.resident-prose')).toContainText(
    `known child ${residentName(child)} (#${child.id})`,
  );
  expect((await page.locator('.resident-prose').innerText()).replace(/\s+/g, ' ')).toBe(
    prose(world, subject.id),
  );
  const source = page.locator(`.resident-prose [data-resident-source-id="${child.deathEventId}"]`);
  for (const viewport of [null, { width: 320, height: 568 }, { width: 390, height: 650 }]) {
    if (viewport) {
      await page.keyboard.press('Escape');
      await page.setViewportSize(viewport);
      if (viewport.width === 320) await page.addStyleTag({ content: ':root {font-size:200%;}' });
      await page.getByRole('button', { name: 'Read residents', exact: true }).click();
      await expect(source).toBeFocused();
      await expect(
        page.getByRole('button', { name: 'Close residents', exact: true }),
      ).toBeInViewport();
      const canvas = await page.locator('canvas').boundingBox();
      const reader = await page
        .getByRole('region', { name: 'Resident histories', exact: true })
        .boundingBox();
      expect(canvas!.y).toBeLessThan(reader!.y);
    }
    await source.focus();
    const scroll = await page.locator('.resident-content').evaluate((el) => el.scrollTop);
    await source.press('Enter');
    await expect(page.locator('.event-details h3')).toBeFocused();
    await expect(page.locator('.event-details')).toContainText(`record #${child.deathEventId}`);
    await page.getByRole('button', { name: 'Back to resident', exact: true }).click();
    await expect(source).toBeFocused();
    await expect(source).toBeInViewport();
    expect(await page.locator('.resident-content').evaluate((el) => el.scrollTop)).toBeCloseTo(
      scroll,
      0,
    );
    if (viewport) {
      await expect(
        page.getByRole('button', { name: 'Close residents', exact: true }),
      ).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await source.evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
    }
    expect(await fixture(page, 'readSlot')).toEqual(stored);
  }
});

test('rejected Resume preserves the profile and accepted same-world replacement clears its view state', async ({
  page,
}) => {
  await namedAt(page, 48);
  await openResidents(page);
  await choose(page, 17);
  const before = await page.locator('.resident-profile').innerText();
  await fixture(page, 'damageSlot', true);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  expect(await page.locator('.resident-profile').innerText()).toBe(before);
  await fixture(page, 'writeNamedFixture', 'RIVERSIDE', 48);
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Resident histories', exact: true })).toHaveCount(
    0,
  );
  await openResidents(page);
  await expect(page.locator('.resident-profile')).toHaveCount(0);
  await expect(page.getByLabel('Find a resident', { exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Resident status', exact: true })).toHaveValue(
    'living',
  );
  await expect(page.getByRole('combobox', { name: 'Household', exact: true })).toHaveValue('all');
});

test('personal pagination reaches retained records beyond the latest 200 world headlines', async ({
  page,
}) => {
  test.setTimeout(90000);
  const world = longWorld();
  const dossier = world.world.residents
    .map((person) => residentDossier(world, person.id)!)
    .sort((a, b) => b.records.length - a.records.length)[0]!;
  expect(dossier.records.length).toBeGreaterThan(32);
  await namedAt(page, 1000);
  await openResidents(page);
  await choose(page, dossier.person.id);
  const ids: number[] = [];
  for (;;) {
    ids.push(
      ...(await page
        .locator('.personal-records [data-resident-source-id]')
        .evaluateAll((elements) =>
          elements.map((el) => Number((el as HTMLElement).dataset.residentSourceId)),
        )),
    );
    const earlier = page.getByRole('button', { name: 'Earlier personal records', exact: true });
    if (await earlier.isDisabled()) break;
    await earlier.click();
  }
  expect(ids).toEqual(dossier.records.map((record) => record.eventId).reverse());
  expect(ids.at(-1)).toBeLessThan(world.events.length - 200);
  const first = page.locator(`.personal-records [data-resident-source-id="${ids.at(-1)}"]`);
  await first.click();
  await expect(page.locator('.event-details')).toContainText(`record #${ids.at(-1)} · tile`);
  await page.getByRole('button', { name: 'Back to resident', exact: true }).click();
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  expect(canonicalJson(await save(page, 1000))).toBe(canonicalJson(world));
});

for (const [width, height] of [
  [320, 568],
  [390, 650],
] as const)
  test(`resident histories retain map context, keyboard return and 44px targets at 200% text on ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await fresh(page);
    await page.getByRole('button', { name: 'Step one week', exact: true }).click();
    const world = await save(page, 1);
    await page.addStyleTag({ content: ':root { font-size: 200%; }' });
    const opener = page.getByRole('button', { name: 'Read residents', exact: true });
    await opener.focus();
    await opener.press('Enter');
    const reader = page.getByRole('region', { name: 'Resident histories', exact: true });
    const close = reader.getByRole('button', { name: 'Close residents', exact: true });
    await expect(close).toBeInViewport();
    const canvas = await page.locator('canvas').boundingBox();
    const sheet = await reader.boundingBox();
    expect(canvas!.y).toBeLessThan(sheet!.y);
    await choose(page, 17);
    await expect(page.locator('.resident-profile h3')).toBeInViewport();
    const source = page.locator('.personal-records [data-resident-source-id]').last();
    await source.focus();
    const scroll = await page.locator('.resident-content').evaluate((el) => el.scrollTop);
    await source.press('Enter');
    await expect(page.locator('.event-details h3')).toBeFocused();
    await expect(page.locator('.event-details h3')).toBeInViewport();
    await page.getByRole('button', { name: 'Back to resident', exact: true }).click();
    await expect(source).toBeFocused();
    await expect(source).toBeInViewport();
    expect(await page.locator('.resident-content').evaluate((el) => el.scrollTop)).toBeCloseTo(
      scroll,
      0,
    );
    await expect(close).toBeInViewport();
    const targets = await reader
      .locator('button, input, select, summary')
      .evaluateAll((elements) =>
        elements
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => el.getBoundingClientRect().height),
      );
    expect(targets.every((height) => height >= 44)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await expect(opener).toBeInViewport();
    expect(canonicalJson(await save(page, 1))).toBe(canonicalJson(world));
  });
