import { simulateLivingSettlement } from '../../src/sim/living';
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

test('new winter rules show dormant fields and real labor while a legacy save keeps its rules', async ({
  page,
}) => {
  await fresh(page);
  await fixture(page, 'writeFixture', 'RIVERSIDE', 47);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await page.getByRole('button', { name: 'Step one week' }).click();
  await expect(page.getByTestId('tick')).toHaveText('48');
  await expect(page.getByText('Dashed plots: fields resting in winter')).toBeVisible();
  await expect(
    page.getByText('Winter fields rest; no crop harvest', { exact: true }),
  ).toBeVisible();
  await page.getByText('Last week’s work', { exact: true }).click();
  await expect(page.locator('.labor-summary')).toContainText('Foraging');
  await expect(
    page
      .locator('.labor-summary dl div')
      .filter({ has: page.getByText('Fields', { exact: true }) }),
  ).toContainText('0');
  await save(page, 48);
  expect(await fixture(page, 'storedDigest')).toEqual({
    tick: 48,
    seed: 'RIVERSIDE',
    digest: await digestCanonical(simulateSettlement('RIVERSIDE', 48).state),
  });
  await fixture(page, 'writeFixture', 'RIVERSIDE', 47, 'p1-settlement-v1');
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await expect(page.getByText('This world retains reduced winter crop production.')).toBeVisible();
  await page.getByRole('button', { name: 'Step one week' }).click();
  await expect(page.getByRole('button', { name: /winter harvest brings \d+ food/ })).toBeVisible();
  await expect(page.getByText('Dashed plots: fields resting in winter')).toHaveCount(0);
  await save(page, 48);
  const slot = await fixture<{ payload: { simulationVersion: string } }>(page, 'readSlot');
  expect(slot.payload.simulationVersion).toBe('p1-settlement-v1');
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

for (const [speed, weekMs] of [
  [1, 15000],
  [4, 3750],
  [16, 938],
] as const)
  test(`eight-week autosave at ${speed}x commits complete state and resumes paused`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
    await fresh(page);
    await expect(page.locator('.save-status')).toContainText('Saved through week 0.');
    await expect(page.locator('.save-status')).toContainText(
      'Autosave requests every 8 weeks (two active minutes at 1x)',
    );
    await page.getByRole('button', { name: `${speed}x`, exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.clock.runFor(weekMs * 7);
    await expect(page.getByTestId('tick')).toHaveText('7');
    expect((await fixture<{ tick: number }>(page, 'storedDigest')).tick).toBe(0);
    await page.clock.runFor(weekMs);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.locator('.save-status')).toContainText('Saved through week 8.');
    expect(await fixture(page, 'storedDigest')).toEqual({
      tick: 8,
      seed: 'RIVERSIDE',
      digest: await digestCanonical(simulateLivingSettlement('RIVERSIDE', 8).state),
    });
    await page.reload();
    await page.getByRole('button', { name: 'Resume local save', exact: true }).click();
    await expect(page.getByTestId('tick')).toHaveText('8');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  });

test('playback and repeated hidden returns stay paused without catch-up', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await fresh(page);
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
  await details
    .getByRole('button', { name: /^#\d+:/ })
    .first()
    .click();
  await expect(page.getByTestId('tick')).toHaveText('12');
});

for (const viewport of [
  { width: 1200, height: 900, fontSize: '16px' },
  { width: 390, height: 650, fontSize: '32px' },
  { width: 320, height: 568, fontSize: '32px' },
])
  test(`keyboard cause navigation returns through the chain at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await fresh(page);
    await save(page, 0);
    await fixture(page, 'writeFixture', 'RIVERSIDE', 12);
    await page.getByRole('button', { name: 'Resume local save' }).click();
    const before = await fixture(page, 'storedDigest');
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, viewport.fontSize);
    if (viewport.width < 761) await page.getByRole('button', { name: 'Open chronicle' }).click();
    const snapshot = simulateSettlement('RIVERSIDE', 12).state;
    const harvest = snapshot.events.find((event) => event.type === 'harvest')!;
    const cause = harvest.causes
      .map((id) => snapshot.events[id - 1]!)
      .find((event) => event.causes.length > 0)!;
    const origin = snapshot.events[cause.causes[0]! - 1]!;
    await page.getByRole('button', { name: /spring harvest brings/ }).click();
    const evidence = page.getByRole('region', { name: 'Event evidence' });
    const heading = evidence.getByRole('heading', { level: 3 });
    async function activate(name: RegExp | string) {
      await evidence.getByRole('button', { name }).focus();
      const scroll = await page.evaluate(() => scrollY);
      await page.keyboard.press('Enter');
      await expect(heading).toBeFocused();
      expect(await page.evaluate(() => scrollY)).toBe(scroll);
      const headingBox = (await heading.boundingBox())!;
      const scroller = viewport.width < 761 ? page.locator('.chronicle-content') : evidence;
      const scrollerBox = (await scroller.boundingBox())!;
      expect(headingBox.y).toBeGreaterThanOrEqual(scrollerBox.y);
      expect(headingBox.y).toBeLessThan(scrollerBox.y + scrollerBox.height);
    }
    await activate(new RegExp(`^#${cause.id}:`));
    await expect(evidence).toContainText(`record #${cause.id} ·`);
    await expect(page.locator('.tile-facts')).toContainText(`Tile ${cause.location.tile}:`);
    await page.keyboard.press('Tab');
    await expect(
      evidence.getByRole('button', { name: `Return to record #${harvest.id}` }),
    ).toBeFocused();
    await activate(new RegExp(`^#${origin.id}:`));
    await expect(evidence).toContainText(`record #${origin.id} ·`);
    await activate(`Return to record #${cause.id}`);
    await expect(evidence).toContainText(`record #${cause.id} ·`);
    await activate(`Return to record #${harvest.id}`);
    await expect(evidence).toContainText(`record #${harvest.id} ·`);
    await expect(evidence.getByRole('button', { name: /Return to record/ })).toHaveCount(0);
    await activate(new RegExp(`^#${cause.id}:`));
    await evidence.getByRole('button', { name: 'Next record' }).click();
    await expect(evidence.getByRole('button', { name: /Return to record/ })).toHaveCount(0);
    await page.getByRole('button', { name: /spring harvest brings/ }).click();
    await activate(new RegExp(`^#${cause.id}:`));
    await page.getByLabel('Record number').fill('1');
    await page.getByRole('button', { name: 'Find record' }).click();
    await expect(evidence.getByRole('button', { name: /Return to record/ })).toHaveCount(0);
    if (viewport.width < 761) await page.keyboard.press('Escape');
    await expect(page.getByTestId('tick')).toHaveText('12');
    await save(page, 12);
    expect(await fixture(page, 'storedDigest')).toEqual(before);
  });

test('cause return survives ordinary weeks and resets on accepted Resume', async ({ page }) => {
  await fresh(page);
  await save(page, 0);
  await fixture(page, 'writeFixture', 'RIVERSIDE', 12);
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await page.getByRole('button', { name: /spring harvest brings/ }).click();
  const evidence = page.getByRole('region', { name: 'Event evidence' });
  await evidence
    .getByRole('button', { name: /^#\d+:/ })
    .first()
    .click();
  const returnButton = evidence.getByRole('button', { name: /Return to record/ });
  await expect(returnButton).toBeVisible();
  await steps(page, 1);
  await expect(returnButton).toBeVisible();
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await expect(page.getByTestId('tick')).toHaveText('12');
  await expect(returnButton).toHaveCount(0);
});

for (const { tick, version } of [
  { tick: 12, version: 'p1-settlement-v1' },
  { tick: 24, version: 'p1-settlement-v2' },
])
  test(`resuming the same seed at week ${tick} on ${version} resets inspection`, async ({
    page,
  }) => {
    await fresh(page);
    await save(page, 0);
    await fixture(page, 'writeFixture', 'RIVERSIDE', 12);
    await page.getByRole('button', { name: 'Resume local save' }).click();
    await expect(page.getByTestId('tick')).toHaveText('12');
    await page.getByLabel('Record number').fill('1');
    await page.getByRole('button', { name: 'Find record' }).click();
    await expect(page.getByRole('region', { name: 'Event evidence' })).toContainText('record #1');
    await page.getByLabel('Tile X').fill('0');
    await page.getByLabel('Tile Y').fill('0');
    await page.getByRole('button', { name: 'Inspect tile' }).click();
    await expect(page.locator('.tile-facts')).toContainText('Tile 0:');
    await fixture(page, 'writeFixture', 'RIVERSIDE', tick, version);
    const before = await fixture(page, 'storedDigest');
    await page.getByRole('button', { name: 'Resume local save' }).click();
    await expect(page.getByTestId('tick')).toHaveText(String(tick));
    await expect(page.locator('.tile-facts')).toContainText('Tile 1327:');
    await expect(page.getByLabel('Record number')).toHaveValue('');
    await expect(page.getByRole('region', { name: 'Event evidence' })).toContainText(
      'Select a record',
    );
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await save(page, tick);
    expect(await fixture(page, 'storedDigest')).toEqual(before);
  });

test('rejected Resume retains the current inspection and archive lookup', async ({ page }) => {
  await fresh(page);
  await save(page, 0);
  await page.getByLabel('Record number').fill('1');
  await page.getByRole('button', { name: 'Find record' }).click();
  await page.getByLabel('Tile X').fill('0');
  await page.getByLabel('Tile Y').fill('0');
  await page.getByRole('button', { name: 'Inspect tile' }).click();
  await fixture(page, 'damageSlot');
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await expect(page.getByRole('alert')).toContainText('checksum');
  await expect(page.locator('.tile-facts')).toContainText('Tile 0:');
  await expect(page.getByLabel('Record number')).toHaveValue('1');
  await expect(page.getByRole('region', { name: 'Event evidence' })).toContainText('record #1');
  await expect(page.getByTestId('tick')).toHaveText('0');
});

test('regenerating the same founding seed resets inspection', async ({ page }) => {
  await fresh(page);
  await page.getByLabel('Record number').fill('1');
  await page.getByRole('button', { name: 'Find record' }).click();
  await page.getByLabel('Tile X').fill('0');
  await page.getByLabel('Tile Y').fill('0');
  await page.getByRole('button', { name: 'Inspect tile' }).click();
  await menu(page);
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await expect(page.locator('.tile-facts')).toContainText('Tile 1327:');
  await expect(page.getByLabel('Record number')).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Event evidence' })).toContainText(
    'Select a record',
  );
  await expect(page.getByTestId('tick')).toHaveText('0');
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

test('phone pan, zoom, pointer selection and keyboard navigation leave the saved history unchanged', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fresh(page);
  await save(page, 0);
  const before = await fixture(page, 'storedDigest'),
    map = page.locator('canvas');
  const pixels = () => map.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  const first = await pixels();
  const residents = page.getByRole('button', { name: 'Show population markers' });
  await expect(residents).toHaveAttribute('aria-pressed', 'true');
  await residents.click();
  await expect(residents).toHaveAttribute('aria-pressed', 'false');
  expect(await pixels()).not.toBe(first);
  await residents.focus();
  await page.keyboard.press('Space');
  await expect(residents).toHaveAttribute('aria-pressed', 'true');
  expect(await pixels()).toBe(first);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  expect(await pixels()).not.toBe(first);
  await map.focus();
  await page.keyboard.press('ArrowLeft');
  const panned = await pixels();
  await page.getByRole('button', { name: 'Focus selected tile' }).click();
  expect(await pixels()).not.toBe(panned);
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.tile-facts')).toContainText('Tile 1327:');
  await page.getByRole('button', { name: 'Focus selected tile' }).click();
  await map.click({ position: { x: box.width / 2 + 24, y: box.height / 2 } });
  await expect(page.locator('.tile-facts')).toContainText('Tile 1328:');
  await save(page, 0);
  expect(await fixture(page, 'storedDigest')).toEqual(before);
});

test('resident dots follow a saved population and remain read-only through reload and advancement', async ({
  page,
}) => {
  await fresh(page);
  await expect(page.locator('#population-help')).toContainText('24 of 24 residents');
  await expect(page.locator('#population-help')).toContainText('Dots use recorded home tiles');
  await fixture(page, 'writeFixture', 'RIVERSIDE', 48);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await expect(page.locator('#population-help')).toContainText('23 of 23 residents');
  const before = await fixture(page, 'storedDigest');
  await page.getByRole('button', { name: 'Show population markers' }).click();
  await expect(page.locator('#population-help')).toContainText(
    'Population: 23. Resident dots are hidden.',
  );
  await save(page, 48);
  expect(await fixture(page, 'storedDigest')).toEqual(before);
  await page.reload();
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await expect(page.locator('#population-help')).toContainText('23 of 23 residents');
  await page.getByRole('button', { name: 'Step one week' }).click();
  await save(page, 49);
  expect(await fixture(page, 'storedDigest')).toEqual({
    tick: 49,
    seed: 'RIVERSIDE',
    digest: await digestCanonical(simulateSettlement('RIVERSIDE', 49).state),
  });
});

test('older archive records remain accessible outside the 200-headline window without seeking time', async ({
  page,
}) => {
  test.setTimeout(60000);
  await fresh(page);
  await save(page, 0);
  await fixture(page, 'writeFixture', 'RIVERSIDE', 1000);
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await expect(page.getByTestId('tick')).toHaveText('1000');
  expect(await page.locator('.event-list .event-button').count()).toBe(200);
  await page.getByLabel('Record number').fill('1');
  await page.getByRole('button', { name: 'Find record' }).click();
  await expect(page.getByRole('region', { name: 'Event evidence' })).toContainText(
    '24 residents found a settlement',
  );
  await expect(page.getByRole('button', { name: 'Previous record' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next record' }).click();
  await expect(page.getByRole('region', { name: 'Event evidence' })).toContainText('record #2');
  await expect(page.getByTestId('tick')).toHaveText('1000');
});

test('reading an older live record preserves its scroll position while new weeks arrive', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await fresh(page);
  await fixture(page, 'writeFixture', 'RIVERSIDE', 1000);
  await menu(page);
  await page.getByRole('button', { name: 'Resume local save' }).click();
  await expect(page.getByTestId('tick')).toHaveText('1000');
  // This test measures live-list anchoring across a year boundary without a reading pause.
  await page.getByLabel('Automatic recaps').selectOption('off');
  await page.locator('.event-list').evaluate((element) => {
    element.scrollTop = 600;
    element.dispatchEvent(new Event('scroll'));
  });
  const anchor = await page.locator('.event-list').evaluate((element) => {
    const top = element.getBoundingClientRect().top;
    const item = [...element.querySelectorAll<HTMLElement>('[data-event-id]')].find(
      (item) => item.getBoundingClientRect().bottom > top,
    )!;
    return { id: item.dataset.eventId, offset: item.getBoundingClientRect().top - top };
  });
  await page.getByRole('button', { name: '16x', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.clock.runFor(11250);
  await expect(page.getByTestId('tick')).toHaveText('1012');
  const offset = await page
    .locator(`[data-event-id="${anchor.id}"]`)
    .evaluate(
      (element) =>
        element.getBoundingClientRect().top - element.parentElement!.getBoundingClientRect().top,
    );
  expect(Math.abs(offset - anchor.offset)).toBeLessThan(2);
});

test('phone sheet retains visible map context and event focus after panning elsewhere', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await fresh(page);
  await steps(page, 12);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Pan west' }).click();
  await page.getByRole('button', { name: 'Open chronicle' }).click();
  await page.getByRole('button', { name: /spring harvest brings/ }).click();
  const map = page.locator('canvas'),
    mapBox = (await map.boundingBox())!,
    sheetBox = (await page.getByRole('region', { name: 'Chronicle' }).boundingBox())!;
  expect(Math.min(mapBox.y + mapBox.height, sheetBox.y) - Math.max(mapBox.y, 0)).toBeGreaterThan(
    100,
  );
  await map.click({ position: { x: mapBox.width / 2, y: mapBox.height / 2 } });
  await expect(page.locator('.tile-facts')).toContainText('Tile 1327:');
  await map.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open chronicle' })).toBeFocused();
  await expect(page.getByTestId('tick')).toHaveText('12');
});

for (const width of [320, 390])
  test(`viewer wraps enlarged text and retains 44px targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fresh(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '20px';
    });
    await page.getByRole('button', { name: 'Open chronicle' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    for (const button of await page.getByRole('button').all()) {
      if (!(await button.isVisible())) continue;
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

for (const { width, height } of [
  { width: 320, height: 568 },
  { width: 390, height: 650 },
])
  test(`phone evidence stays reachable at 200% text on ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await fresh(page);
    await steps(page, 12);
    await save(page, 12);
    const before = await fixture(page, 'storedDigest');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    const opener = page.getByRole('button', { name: 'Open chronicle' });
    await opener.click();
    const sheet = page.getByRole('region', { name: 'Chronicle' });
    const mapBox = (await page.locator('canvas').boundingBox())!;
    const sheetBox = (await sheet.boundingBox())!;
    expect(Math.min(mapBox.y + mapBox.height, sheetBox.y) - Math.max(mapBox.y, 0)).toBeGreaterThan(
      100,
    );
    expect(
      await page.locator('.event-list').evaluate((element) => element.clientHeight),
    ).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: /spring harvest brings/ }).click();
    const evidence = page.getByRole('region', { name: 'Event evidence' });
    const cause = evidence.getByRole('button', { name: /^#\d+:/ }).first();
    const causeId = Number((await cause.textContent())!.match(/^#(\d+):/)![1]);
    await cause.click();
    await expect(evidence).toContainText(`record #${causeId}`);
    await evidence.getByRole('button', { name: 'Next record' }).click();
    await expect(evidence).toContainText(`record #${causeId + 1}`);
    await evidence.getByRole('button', { name: 'Previous record' }).click();
    await expect(evidence).toContainText(`record #${causeId}`);
    await page.getByLabel('Record number').fill('2');
    await page.getByRole('button', { name: 'Find record' }).click();
    await expect(evidence).toContainText('record #2');
    const back = page.getByRole('button', { name: 'Back to map' });
    const backBox = (await back.boundingBox())!;
    expect(backBox.y).toBeGreaterThanOrEqual(sheetBox.y);
    expect(backBox.y + backBox.height).toBeLessThanOrEqual(sheetBox.y + sheetBox.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await back.click();
    await expect(opener).toBeFocused();
    await expect(sheet).toBeHidden();
    await opener.click();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('tick')).toHaveText('12');
    await save(page, 12);
    expect(await fixture(page, 'storedDigest')).toEqual(before);
  });
