// The People room: open a person from the index and from a Tales card, follow them back into
// Tales, and use the browser's back button.
import { expect, test, type Page } from '@playwright/test';

async function inTales(page: Page) {
  await page.goto('/?seed=SMOKE&size=128');
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Pause history' }).click();
}

test('a person opens from the index, Follow returns to Tales, and back returns to the page', async ({
  page,
}) => {
  await inTales(page);
  await page.getByRole('button', { name: 'People', exact: true }).click();
  const index = page.getByTestId('people-index');
  await expect(index).toBeVisible();
  // Rulers: every world has them, while a small world may end its history with no legend.
  await index.getByRole('button', { name: 'Rulers', exact: true }).click();
  await index.getByRole('searchbox', { name: 'Search people' }).fill('a');
  await index.locator('.pp-row').first().click();
  const pageEl = page.getByTestId('person-page');
  await expect(pageEl).toBeVisible();
  await expect(page).toHaveURL(/open=person:\d+/);
  const name = await pageEl.getByRole('heading', { level: 1 }).textContent();
  await pageEl.getByRole('tab', { name: 'Family' }).click();
  // A person with a house links to its family tree; the frame opens and the page never scrolls sideways.
  const treeLink = pageEl.getByRole('link', { name: /See the family tree/ });
  if (await treeLink.count()) {
    await treeLink.click();
    await expect(page.getByTestId('house-tree')).toBeVisible();
    await page.goBack();
    await expect(pageEl).toBeVisible();
    await pageEl.getByRole('tab', { name: 'Family' }).click();
  }
  await pageEl.getByRole('tab', { name: 'Life' }).click();
  await expect(pageEl.locator('.pp-life li').first()).toBeVisible();
  // Follow opens Tales with this person followed.
  await pageEl.getByRole('button', { name: /^Follow (his|her) story$/ }).click();
  await expect(page.getByTestId('tales-stage')).toBeVisible();
  const chip = page.locator('.tr-chip.following');
  await expect(chip).toContainText(name!);
  // Following does not pause the first play: it runs to the present without a card.
  await expect(chip).toContainText('no pauses on the first play');
  await page.getByLabel('Years a second').selectOption('60');
  const playing = page.getByRole('button', { name: 'Play history' });
  if (await playing.count()) await playing.click();
  await expect(page.getByRole('dialog', { name: 'The present day' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('dialog', { name: 'History paused' })).toHaveCount(0);
  // Back returns to the person's page.
  await page.goBack();
  await expect(page.getByTestId('person-page').getByRole('heading', { level: 1 })).toHaveText(
    name!,
  );
});

test('a Tales card opens the person, and the page fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=SMOKE&size=128');
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Years a second').selectOption('60');
  // The first play runs to the present without pausing; a replay pauses to ask.
  const present = page.getByRole('dialog', { name: 'The present day' });
  await present.getByRole('button', { name: 'Replay' }).click({ timeout: 30_000 });
  const card = page.getByRole('dialog', { name: 'History paused' });
  const who = card.getByRole('button', { name: /^Who is / });
  // Cards come and go on their own; take the first that names a person.
  await expect(who).toBeVisible({ timeout: 60_000 });
  await who.click();
  const pageEl = page.getByTestId('person-page');
  await expect(pageEl).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Sections' })).toBeVisible();
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(sideways).toBe(false);
  await pageEl.getByRole('button', { name: /^Follow (his|her) story$/ }).click();
  await expect(page.locator('.tr-chip.following')).toBeVisible();
  // Back twice: the page, then Tales where it stood.
  await page.goBack();
  await expect(pageEl).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('tales-stage')).toBeVisible();
});

test('the Tales chip opens the person and Back returns to the same year and follow; a reload restores them', async ({
  page,
}) => {
  await inTales(page);
  await page.getByRole('button', { name: 'People', exact: true }).click();
  await expect(page).toHaveURL(/room=people/);
  const index = page.getByTestId('people-index');
  // Rulers: every world has them, while a small world may end its history with no legend.
  await index.getByRole('button', { name: 'Rulers', exact: true }).click();
  await index.locator('.pp-row').first().click();
  const pageEl = page.getByTestId('person-page');
  await expect(page).toHaveURL(/open=person:\d+/);
  const name = (await pageEl.getByRole('heading', { level: 1 }).textContent())!;
  await pageEl.getByRole('button', { name: /^Follow (his|her) story$/ }).click();
  await expect(page.locator('.tr-chip.following')).toContainText(name);
  await page.getByRole('button', { name: 'Pause history' }).click();
  await expect(page).toHaveURL(/room=tales&follow=\d+&year=\d+/);
  await page.waitForTimeout(1200);
  const followUrl = page.url();
  const tales = (url: string) => {
    const q = new URL(url).searchParams;
    return [q.get('room'), q.get('follow'), q.get('year')];
  };

  // The name in the chip opens the person: a new entry, and Back lands on the same Tales view.
  await page.locator('.tr-chip.following .tr-who').click();
  await expect(page.getByTestId('person-page').getByRole('heading', { level: 1 })).toHaveText(name);
  await expect(page).toHaveURL(/open=person:\d+/);
  await page.goBack();
  await expect(page.locator('.tr-chip.following')).toContainText(name);
  expect(tales(page.url())).toEqual(tales(followUrl));
  // The page before Tales was the person page that started the follow.
  await page.goBack();
  await expect(page.getByTestId('person-page').getByRole('heading', { level: 1 })).toHaveText(name);

  // A shared Follow link opens Tales following the same person.
  await page.goto(followUrl);
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tr-chip.following')).toContainText(name);
  await page.reload();
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tr-chip.following')).toContainText(name);
  expect(tales(page.url())[1]).toBe(tales(followUrl)[1]);
});

test('the People index reloads to the index, a person page to that person, and more rows load as it scrolls', async ({
  page,
}) => {
  await page.goto('/?seed=SMOKE&size=128&room=people');
  const index = page.getByTestId('people-index');
  await expect(index).toBeVisible({ timeout: 30_000 });
  const rows = index.locator('.pp-row');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  expect(before).toBeLessThanOrEqual(80);
  // Search takes words in any order.
  await index.getByRole('searchbox', { name: 'Search people' }).fill('zzzz nobody');
  await expect(index.getByText('Nobody matches those filters.')).toBeVisible();
  await index.getByRole('searchbox', { name: 'Search people' }).fill('');
  await expect(rows.first()).toBeVisible();
  if ((await index.locator('.pp-sentinel').count()) > 0) {
    await index.locator('.pp-sentinel').scrollIntoViewIfNeeded();
    await expect.poll(() => rows.count()).toBeGreaterThan(before);
  }
  await rows.first().click();
  await expect(page).toHaveURL(/open=person:\d+/);
  const name = (await page
    .getByTestId('person-page')
    .getByRole('heading', { level: 1 })
    .textContent())!;
  await page.reload();
  await expect(page.getByTestId('person-page').getByRole('heading', { level: 1 })).toHaveText(
    name,
    {
      timeout: 30_000,
    },
  );
});
