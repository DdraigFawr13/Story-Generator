// The one Chromium smoke (REBOOT_PLAN §11). Grows with each phase toward
// generate → legends → embark → play → save → reload → continue.
import { expect, test, type Page } from '@playwright/test';
import { SMOKE, smokeExpected } from './smoke-expected';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // Failed requests are reported with their URL below; the console copy has none.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      errors.push(message.text());
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.pathname !== '/favicon.ico') {
      errors.push(`${response.status()} ${url.pathname}`);
    }
  });
  return errors;
}

/** A generated world plays its history first; skip to the present and return to the map there. */
async function closePlayback(page: Page) {
  const stage = page.getByTestId('tales-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip to the present' }).click();
  await openClassic(page);
}

/** The classic viewer (old map, Legends pane, saves) opens from the rail's new-world sheet. */
async function openClassic(page: Page) {
  await page.getByRole('button', { name: 'New world', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'New world' })
    .getByRole('button', { name: 'Classic viewer' })
    .click();
  await expect(page.getByTestId('tales-stage')).toHaveCount(0);
}

test('the world map generates, inspects, saves, reloads and advances', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=SMOKE&size=128');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('world map');
  // A new world plays its 250 years first; skip to the present, then explore the map.
  const stage = page.getByTestId('tales-stage');
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('tales-year')).toHaveText(/^Year \d+$/);
  // The storybook map draws in Realms mode; the first play runs to the present without pausing,
  // and a replay at speed pauses to ask.
  await expect(stage.locator('canvas')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Realms', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Years a second').selectOption('60');
  const present = page.getByRole('dialog', { name: 'The present day' });
  await expect(present).toBeVisible({ timeout: 30_000 });
  const card = page.getByRole('dialog', { name: 'History paused' });
  await expect(card).toHaveCount(0);
  await present.getByRole('button', { name: 'Replay' }).click();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: 'Keep playing' }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Skip to the present' }).click();
  await expect(present).toBeVisible();
  await openClassic(page);
  const map = page.getByTestId('world-map');
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(map).toHaveAttribute('data-seed', 'SMOKE');
  await expect(page.getByRole('alert')).toHaveCount(0);
  // The generated cells match Node's for the same world, so Chromium and Node agree (no float drift).
  await expect(map).toHaveAttribute('data-cells-digest', smokeExpected().cells);

  // Legends: open the first civ, unfold a "why?", follow a cause to its event, show it on the map.
  const legends = page.getByRole('region', { name: 'Legends' });
  await legends.getByRole('button', { name: /^Civs/ }).click();
  await legends.locator('.lg-list li a').first().click();
  const civHeading = await legends.getByRole('heading', { level: 3 }).textContent();
  // Follow the first "why?" whose first cause has causes of its own, so "Expand all" below has
  // something to unfold (which line that is depends on the seed's history).
  const expandAll = legends.getByRole('button', { name: 'Expand all' });
  for (let n = 0; ; n += 1) {
    await legends
      .getByRole('button', { name: /^why\?/ })
      .nth(n)
      .click();
    await legends.locator('.lg-tree .y a').first().click();
    await expect(page).toHaveURL(/open=event:\d+/);
    // The event page has rendered once its "Why it happened" line is up.
    await expect(legends.getByText(/^Why it happened/)).toBeVisible();
    if ((await expandAll.count()) > 0 || n >= 9) break;
    await page.goBack();
    await expect(legends.getByRole('heading', { level: 3 })).toHaveText(civHeading!);
  }
  // An event page is headed by its title, with the year as the eyebrow.
  const heading = legends.getByRole('heading', { level: 3 });
  await expect(heading).not.toHaveText(/^Year \d+/);
  await expect(heading).not.toHaveText('');
  await expect(legends.locator('.lg-kind')).toHaveText(/^Year \d+/);
  await expect(page).toHaveURL(/open=event:\d+/);
  await legends.getByRole('button', { name: /^Open on the map at Year \d+/ }).click();
  await expect(map).toHaveAttribute('data-focus', /^\d+,\d+$/);

  // "Expand all" unfolds the causes of the causes.
  await expect(legends.locator('.lg-tree')).toHaveCount(0);
  await legends.getByRole('button', { name: 'Expand all' }).click();
  await expect(legends.locator('.lg-tree').first()).toBeVisible();

  // Browser back returns to the previous Legends page, and forward to the event again.
  await page.goBack();
  await expect(page).toHaveURL(/open=civ:\d+/);
  await expect(heading).toHaveText(civHeading!);
  await page.goForward();
  await expect(page).toHaveURL(/open=event:\d+/);

  // Phone width: the Legends body is capped at the viewport and shows text below the heading.
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Legends' }).click();
  await expect(legends.locator('.lg-summary')).toBeInViewport();
  const body = await legends.locator('.lg-body').boundingBox();
  expect(body!.height).toBeGreaterThan(150);
  await page.setViewportSize(desktop);

  const rainfall = page.getByRole('button', { name: 'Rainfall' });
  await rainfall.click();
  await expect(rainfall).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/layer=rainfall/);

  // Region names are an overlay, on by default, toggled with N.
  const names = page.getByLabel(/^Names/);
  await expect(names).toBeChecked();
  await page.keyboard.press('n');
  await expect(names).not.toBeChecked();
  await page.keyboard.press('n');
  await expect(names).toBeChecked();

  // Likely roads are an overlay too, on by default, toggled with R.
  const roads = page.getByLabel(/^Roads/);
  await expect(roads).toBeChecked();
  await page.keyboard.press('r');
  await expect(roads).not.toBeChecked();
  await page.keyboard.press('r');
  await expect(roads).toBeChecked();

  // Sites are an overlay on by default, toggled with S; the Peoples layer colours territory.
  const sites = page.getByLabel(/^Sites/);
  await expect(sites).toBeChecked();
  await page.keyboard.press('s');
  await expect(sites).not.toBeChecked();
  await page.keyboard.press('s');
  await expect(sites).toBeChecked();
  const peoples = page.getByRole('button', { name: 'Peoples' });
  await peoples.click();
  await expect(peoples).toHaveAttribute('aria-pressed', 'true');

  await page.locator('canvas.map').click();
  const inspector = page.getByRole('complementary', { name: 'Cell inspector' });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole('heading')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(inspector).toHaveCount(0);

  // Save → reload → load → continue.
  await page.getByRole('button', { name: '+1 year' }).click();
  const date = page.getByText(/, Year \d+$/).first();
  const savedDate = await date.textContent();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved "SMOKE"');
  await page.reload();
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(date).not.toHaveText(savedDate!);
  await page.getByRole('button', { name: 'Load SMOKE' }).click();
  await expect(page.getByRole('status')).toContainText('Loaded "SMOKE"');
  await expect(date).toHaveText(savedDate!);
  await expect(map).toHaveAttribute('data-state', 'ready');
  await page.getByRole('button', { name: '+1 month' }).click();
  await expect(date).not.toHaveText(savedDate!);
  expect(errors).toEqual([]);
});

test('old /?next links open their page in the rooms', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?next&seed=SMOKE&size=128&open=race:human');
  const record = page.getByTestId('record-page');
  await expect(record).toBeVisible({ timeout: 30_000 });
  await expect(record.getByRole('heading', { level: 3 })).not.toHaveText('');
  // Links the app writes no longer carry the flag.
  await expect(page).not.toHaveURL(/[?&]next/);
  expect(errors).toEqual([]);
});

test('a site can be watched: embark, play, inspect a person and return to the map', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const smokeMap = smokeExpected();
  await page.goto(`/?seed=${SMOKE.seed}&size=${SMOKE.size}`);
  await closePlayback(page);
  const map = page.getByTestId('world-map');
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });

  // The first standing site in the Sites list: open its page, ask to watch it, confirm.
  const legends = page.getByRole('region', { name: 'Legends' });
  await legends.getByRole('button', { name: /^Sites/ }).click();
  await legends.getByLabel(/standing in Year/).check();
  await legends.locator('.lg-list li a').first().click();
  await expect(page).toHaveURL(new RegExp(`open=site:${smokeMap.site}\\b`));
  await legends.getByRole('button', { name: 'Watch this site' }).click();
  await legends.getByRole('button', { name: 'Start watching' }).click();

  // The local map matches Node's for the same site, so Chromium and Node agree.
  const canvas = page.getByTestId('site-canvas');
  await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-localmap-digest', smokeMap.localMap);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Story Generator — ');
  await expect(page).toHaveURL(new RegExp(`site=${smokeMap.site}&day=0`));

  // Four days a second: the date moves.
  const date = page.getByTestId('site-date');
  const start = await date.textContent();
  await page.getByRole('button', { name: '4×' }).click();
  await expect(date).not.toHaveText(start!, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Pause' }).click();

  // M3.12: save the site, play on, load the save: the clock and the view go back to the saved
  // moment. The Site tab is open, so the save keeps it.
  await page.getByRole('tab', { name: /^Site/ }).click();
  await page.getByRole('button', { name: 'Saves' }).click();
  const saves = page.getByRole('dialog', { name: 'Saves' });
  await saves.getByLabel('Save as').fill('smoke site');
  await saves.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(saves.getByRole('status')).toContainText('Saved “smoke site”');
  // The same name again asks first; "Keep both" adds a number instead of replacing.
  await saves.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(saves.getByRole('group', { name: 'Replace the save?' })).toBeVisible();
  await saves.getByRole('button', { name: 'Keep both' }).click();
  await expect(saves.getByRole('status')).toContainText('Saved “smoke site (2)”');
  const savedDate = await date.textContent();
  // The on-page link names the saved moment at once; the address bar follows it a moment later.
  const savedLink = (await page.getByTestId('site-link').textContent()) ?? '';
  const savedPoint = /[?&]day=\d+(&b=\d)?/.exec(savedLink)![0];
  await page.getByRole('button', { name: 'Saves' }).click();
  await page.getByRole('button', { name: '4×' }).click();
  await expect(date).not.toHaveText(savedDate!, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  // The address bar follows the on-page link a moment later, and a tick already under way can
  // still move both after Pause; reload only once the two name the same moment.
  await expect
    .poll(async () => {
      const link = (await page.getByTestId('site-link').textContent()) ?? '';
      const point = /[?&]day=\d+(&b=\d)?&/.exec(link)?.[0];
      return point !== undefined && page.url().includes(point.slice(1));
    })
    .toBe(true);
  // Reload (the link replays the site to where play stopped), then load the save and continue.
  await page.reload();
  await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(date).not.toHaveText(savedDate!);
  await page.getByRole('button', { name: 'Saves' }).click();
  await page.getByRole('button', { name: 'Load smoke site', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(date).toHaveText(savedDate!);
  await expect(page.getByRole('tab', { name: /^Site/ })).toHaveAttribute('aria-selected', 'true');
  // The link names the saved moment, so it replays to the same place.
  await expect(page).toHaveURL(new RegExp(savedPoint.replace('?', '\\?')));
  // "Next notable" runs on until something important happens, then pauses on it.
  await page.getByRole('button', { name: 'Next notable', exact: true }).click();
  await expect(date).not.toHaveText(savedDate!, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Next notable', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
    { timeout: 60_000 },
  );

  // People: the first person's name heads the Inspect page.
  await page.getByRole('tab', { name: /^People/ }).click();
  const first = page.locator('.sv-root .pane .pp').first();
  const name = await first.getAttribute('data-name');
  await first.click();
  await expect(page.getByRole('tab', { name: 'Inspect' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.sv-root .pane h3')).toHaveText(name!);
  // M3.3: every person has a Work fact, whatever their job.
  await expect(page.locator('.sv-root .pane .facts dt', { hasText: /^Work$/ })).toBeVisible();

  // "Open in Legends" for the site this view was entered from still adds a history entry, so
  // Back returns to the site.
  await page.getByRole('tab', { name: /^Site/ }).click();
  await expect(page.locator('.sv-root .pane .sect', { hasText: /^Work$/ })).toBeVisible();
  // M3.4: the weather chip sits in the time bar and the Site tab has its Season section.
  await expect(page.getByTestId('site-weather')).toContainText('°C');
  await expect(page.getByTestId('season')).toBeVisible();
  await page.getByRole('button', { name: 'Open in Legends' }).click();
  await expect(page.getByRole('region', { name: 'Legends' })).toBeVisible();
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await page.goBack();
  await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`site=${smokeMap.site}&day=`));

  // The breadcrumb returns to the world map.
  await page.getByRole('button', { name: 'World map' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('world map');
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  expect(errors).toEqual([]);
});
