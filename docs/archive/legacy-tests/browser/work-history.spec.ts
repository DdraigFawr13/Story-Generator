import { test, expect, type Page } from '@playwright/test';
import { simulateLivingSettlement, advanceLivingSettlement } from '../../src/sim/living';
import { residentWorkHistory } from '../../src/controller/work-history';
import { canonicalJson } from '../../src/sim/canonical';

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
async function namedAt(page: Page, seed: string, tick: number) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved through week 0.');
  await fixture(page, 'writeNamedFixture', seed, tick);
  await expect(page.locator('.world-menu summary')).toBeVisible();
  if (!(await page.getByLabel('World seed', { exact: true }).isVisible()))
    await page.locator('.world-menu summary').click();
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText(String(tick));
}
async function choose(page: Page, id: number) {
  await page.getByRole('button', { name: 'Read residents', exact: true }).click();
  await page.getByRole('combobox', { name: 'Resident status', exact: true }).selectOption('all');
  await page.getByLabel('Find a resident', { exact: true }).fill(`#${id}`);
  await page.locator(`[data-person-id="${id}"]`).click();
  await expect(page.locator('.resident-profile h3')).toBeFocused();
  await page.locator('.resident-work > summary').click();
}

test('weekly histories match the complete saved world and return death evidence on zoomed phones', async ({
  page,
}) => {
  test.setTimeout(90000);
  const world = simulateLivingSettlement('TERRAIN_005', 1000).state;
  const person = world.world.residents.find(
    (person) =>
      person.deathEventId !== null &&
      residentWorkHistory(world, person.id)!.longest?.end?.type === 'deaths',
  )!;
  expect(person).toBeDefined();
  const history = residentWorkHistory(world, person.id)!;
  await namedAt(page, world.seed, world.tick);
  const stored = await fixture<{ payload: unknown }>(page, 'readSlot');
  expect(canonicalJson(stored.payload)).toBe(canonicalJson(world));
  await choose(page, person.id);
  const work = page.locator('.resident-work');
  for (const [role, weeks] of Object.entries(history.totals))
    await expect(work.locator(`[data-work-role="${role}"] dd`)).toHaveText(
      `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`,
    );
  await expect(work).toContainText('the week of death');
  // This naturally deceased sample's longest assignment ends at the death record.
  expect(history.longest!.end!.type).toBe('deaths');
  const source = work.locator(
    `[data-work-span-start] [data-resident-source-id="${person.deathEventId}"]`,
  );
  for (const viewport of [null, { width: 320, height: 568 }, { width: 390, height: 650 }]) {
    if (viewport) {
      await page.keyboard.press('Escape');
      await page.setViewportSize(viewport);
      if (viewport.width === 320) await page.addStyleTag({ content: ':root {font-size:200%;}' });
      await page.getByRole('button', { name: 'Read residents', exact: true }).click();
    }
    await source.scrollIntoViewIfNeeded();
    await source.focus();
    const scroll = await page.locator('.resident-content').evaluate((element) => element.scrollTop);
    await source.press('Enter');
    await expect(page.locator('.event-details')).toContainText(`record #${person.deathEventId}`);
    await expect(page.locator('.event-details h3')).toBeFocused();
    await page.getByRole('button', { name: 'Back to resident', exact: true }).click();
    await expect(source).toBeFocused();
    await expect(source).toBeInViewport();
    expect(
      await page.locator('.resident-content').evaluate((element) => element.scrollTop),
    ).toBeCloseTo(scroll, 0);
    expect(await fixture(page, 'readSlot')).toEqual(stored);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (viewport) {
      await expect(
        page.getByRole('button', { name: 'Close residents', exact: true }),
      ).toBeInViewport();
      expect(
        await source.evaluate((element) => element.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
      const canvas = await page.locator('canvas').boundingBox();
      const reader = await page
        .getByRole('region', { name: 'Resident histories', exact: true })
        .boundingBox();
      expect(canvas!.y).toBeLessThan(reader!.y);
    }
    if (process.env.STORY_GENERATOR_WORK_CAPTURE === '1')
      await page.screenshot({
        path: `docs/evidence/phase2-work-${viewport ? `${viewport.width}-text` : 'desktop'}.png`,
      });
  }
});

test('inspected assignment stays selected when playback produces a new longest span', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  const initial = simulateLivingSettlement('RIVERSIDE', 6).state;
  const old = residentWorkHistory(initial, 25)!.longest!;
  const updated = residentWorkHistory(advanceLivingSettlement(initial, 1).state, 25)!;
  expect(updated.longest!.start.id).not.toBe(old.start.id);
  await namedAt(page, 'RIVERSIDE', 6);
  await choose(page, 25);
  const work = page.locator('.resident-work');
  const source = work.locator(
    `[data-work-span-start="${old.start.id}"] [data-resident-source-id="${old.start.id}"]`,
  );
  await page.getByRole('button', { name: '16x', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await source.click();
  await expect(page.locator('.event-details h3')).toBeFocused();
  await page.clock.runFor(938);
  await expect(page.getByTestId('tick')).toHaveText('7');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const stored = await fixture(page, 'readSlot');
  await page.getByRole('button', { name: 'Back to resident', exact: true }).click();
  await expect(source).toBeFocused();
  await expect(
    work.getByRole('heading', { name: 'Selected assignment span', exact: true }),
  ).toBeVisible();
  await expect(work.locator('[data-work-span-start]')).toHaveAttribute(
    'data-work-span-start',
    String(old.start.id),
  );
  await work.getByRole('button', { name: 'Show longest span', exact: true }).click();
  await expect(work.locator('[data-work-span-start]')).toHaveAttribute(
    'data-work-span-start',
    String(updated.longest!.start.id),
  );
  expect(await fixture(page, 'readSlot')).toEqual(stored);
});

test('a newborn has no assignment in the birth week and first gains one after stepping', async ({
  page,
}) => {
  const world = simulateLivingSettlement('TERRAIN_005', 96).state;
  const child = world.world.residents.find(
    (person) => person.birthEventId !== null && world.events[person.birthEventId - 1]!.tick === 96,
  )!;
  expect(child).toBeDefined();
  await namedAt(page, 'TERRAIN_005', 96);
  await choose(page, child.id);
  const work = page.locator('.resident-work');
  await expect(work).toContainText('No weekly assignment has been recorded yet.');
  await expect(work.locator('[data-work-role]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Step one week', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText('97');
  await expect(work.locator('[data-work-role="resting"] dd')).toHaveText('1 week');
  for (const role of ['fieldwork', 'foraging', 'repairing', 'building', 'gathering', 'caretaking'])
    await expect(work.locator(`[data-work-role="${role}"] dd`)).toHaveText('0 weeks');
});
