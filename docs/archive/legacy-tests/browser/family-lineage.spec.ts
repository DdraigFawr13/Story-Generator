import { test, expect, type Page } from '@playwright/test';
import { simulateLivingSettlement } from '../../src/sim/living';
import { residentName } from '../../src/controller/residents';
import { canonicalJson } from '../../src/sim/canonical';
import type { LivingSettlementState } from '../../src/sim/living-state';

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
async function fresh(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Saved through week 0.');
}
async function choose(page: Page, id: number) {
  if (!(await page.getByLabel('Find a resident', { exact: true }).isVisible()))
    await page.locator('.resident-roster > summary').click();
  await page.getByRole('combobox', { name: 'Resident status', exact: true }).selectOption('all');
  await page.getByLabel('Find a resident', { exact: true }).fill(`#${id}`);
  await page.locator(`[data-person-id="${id}"]`).click();
  await expect(page.locator('.resident-profile h3')).toBeFocused();
}

test('recorded generations link real births and retain exact evidence return on desktop and zoomed phones', async ({
  page,
}) => {
  test.setTimeout(90000);
  const world = simulateLivingSettlement('TERRAIN_005', 1000).state;
  const child = world.world.residents.find((person) =>
    person.parentIds.some(
      (id) => world.world.residents.find((parent) => parent.id === id)!.parentIds.length,
    ),
  )!;
  const parent = world.world.residents.find((person) => person.id === child.parentIds[0])!;
  const grandparent = world.world.residents.find((person) => person.id === parent.parentIds[0])!;
  await fresh(page);
  await fixture(page, 'writeNamedFixture', 'TERRAIN_005', 1000);
  await expect(page.locator('.world-menu summary')).toBeVisible();
  if (!(await page.getByLabel('World seed', { exact: true }).isVisible()))
    await page.locator('.world-menu summary').click();
  await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
  await expect(page.getByTestId('tick')).toHaveText('1000');
  const stored = await fixture<{ payload: LivingSettlementState }>(page, 'readSlot');
  expect(canonicalJson(stored.payload)).toBe(canonicalJson(world));
  await page.getByRole('button', { name: 'Read residents', exact: true }).click();
  await choose(page, grandparent.id);
  const family = page.locator('.resident-lineage');
  await family.locator('summary').click();
  const descendant = family.locator(`[data-lineage-person-id="${child.id}"]`);
  await expect(descendant).toContainText('Known grandchild');
  await expect(descendant).toContainText(`Known child of ${residentName(parent)} · #${parent.id}`);
  await family.getByLabel('Find in this lineage').fill(`#${child.id}`);
  await expect(family.locator('[data-lineage-person-id]')).toHaveCount(1);
  await descendant.locator('[data-lineage-open]').click();
  await expect(page.locator('.resident-profile h3')).toHaveText(
    `${residentName(child)} · #${child.id}`,
  );
  await expect(page.locator('.resident-profile h3')).toBeFocused();
  await family.locator('summary').click();
  await family.getByLabel('Family direction').selectOption('ancestors');
  const ancestor = family.locator(`[data-lineage-person-id="${grandparent.id}"]`);
  await expect(ancestor).toContainText('Known grandparent');
  await expect(ancestor).toContainText(`Known parent of ${residentName(parent)} · #${parent.id}`);
  await expect(family.locator('[data-lineage-person-id]')).toHaveCount(2);
  const source = ancestor.locator(`[data-resident-source-id="${parent.birthEventId}"]`);
  for (const viewport of [null, { width: 320, height: 568 }, { width: 390, height: 650 }]) {
    if (viewport) {
      await page.keyboard.press('Escape');
      await page.setViewportSize(viewport);
      if (viewport.width === 320) await page.addStyleTag({ content: ':root {font-size:200%;}' });
      await page.getByRole('button', { name: 'Read residents', exact: true }).click();
      await expect(source).toBeFocused();
    }
    await source.focus();
    const scroll = await page.locator('.resident-content').evaluate((element) => element.scrollTop);
    await source.press('Enter');
    await expect(page.locator('.event-details h3')).toBeFocused();
    await expect(page.locator('.event-details')).toContainText(`record #${parent.birthEventId}`);
    await page.getByRole('button', { name: 'Back to resident', exact: true }).click();
    await expect(source).toBeFocused();
    await expect(source).toBeInViewport();
    await expect(family.getByLabel('Family direction')).toHaveValue('ancestors');
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
    if (process.env.STORY_GENERATOR_LINEAGE_CAPTURE === '1')
      await page.screenshot({
        path: `docs/evidence/phase2-lineage-${viewport ? `${viewport.width}-text` : 'desktop'}.png`,
      });
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Read residents', exact: true })).toBeFocused();
});

test('founders have unknown earlier lineage and shared household names add no relatives', async ({
  page,
}) => {
  await fresh(page);
  await page.getByRole('button', { name: 'Read residents', exact: true }).click();
  await choose(page, 17);
  const family = page.locator('.resident-lineage');
  await family.locator('summary').click();
  await expect(family.locator('[data-lineage-person-id]')).toHaveCount(0);
  await expect(family).toContainText('No descendants are recorded');
  await family.getByLabel('Family direction').selectOption('ancestors');
  await expect(family).toContainText('No ancestors are recorded');
  await expect(family).toContainText('shared names do not establish kinship');
  await family.getByLabel('Find in this lineage').fill('Willow');
  await expect(family).toContainText('No recorded relatives match this search.');
});
