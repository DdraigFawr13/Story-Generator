// The Book room: a Tales card opens the chapter that holds its event, a name opens a margin note
// (a realm's name opens a realm note, and Escape closes any note), Back returns to Tales; the room
// fits a phone, where search results show under the box.
import { expect, test, type Page } from '@playwright/test';

async function readStoryFromCard(page: Page) {
  await page.goto('/?seed=SMOKE&size=128');
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Years a second').selectOption('60');
  // The first play runs to the present without pausing; a replay pauses to ask.
  const present = page.getByRole('dialog', { name: 'The present day' });
  await present.getByRole('button', { name: 'Replay' }).click({ timeout: 30_000 });
  const card = page.getByRole('dialog', { name: 'History paused' });
  const read = card.getByRole('button', { name: 'Read the story' });
  await expect(read).toBeVisible({ timeout: 60_000 });
  await read.click();
  await expect(page.getByTestId('book')).toBeVisible();
}

test('Read the story opens the chapter, a name opens a margin note, and Back returns to Tales', async ({
  page,
}) => {
  await readStoryFromCard(page);
  await expect(page).toHaveURL(/room=book&book=\d+&ch=\d+&ev=\d+/);
  const pageEl = page.getByTestId('book-page');
  await expect(pageEl.locator('.bk-title')).toBeVisible();
  await expect(pageEl.locator('.bk-hl')).toBeInViewport();
  const names = pageEl.locator('.bk-name[data-kind="person"], .bk-name[data-kind="place"]');
  await expect(names.first()).toBeVisible();
  await names.first().click();
  const note = page.getByTestId('book-note');
  await expect(note).toBeVisible();
  // The note opens in the margin; the page stays where it is.
  await expect(page).toHaveURL(/room=book/);
  await expect(pageEl.locator('.bk-title')).toBeVisible();
  // Chapter navigation adds a history entry and Back returns to the same chapter.
  const url = page.url();
  const next = pageEl.getByRole('button', { name: /^Next chapter/ });
  if (await next.isEnabled()) {
    await next.click();
    await expect(page).not.toHaveURL(url);
    await page.goBack();
    await expect(page).toHaveURL(url);
  }
  await page.goBack();
  await expect(page.getByTestId('tales-stage')).toBeVisible();
});

test('the rail opens a book, and on a phone the contents are a drawer with no sideways scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=SMOKE&size=128');
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Pause history' }).click();
  await page.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page.getByTestId('book')).toBeVisible();
  await expect(page).toHaveURL(/room=book&book=\d+&ch=0/);
  await expect(page.locator('.bk-toc')).not.toBeInViewport();
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(sideways).toBe(false);
  await page.getByRole('button', { name: 'Contents' }).click();
  await expect(page.locator('.bk-toc')).toBeInViewport();
  await page.locator('.bk-chapters button').nth(1).click();
  await expect(page).toHaveURL(/ch=1/);
  await expect(page.locator('.bk-toc')).not.toBeInViewport();
  // A reload restores the chapter.
  await page.reload();
  await expect(page.getByTestId('book')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/ch=1/);
});

test('a realm name opens a realm note without leaving the page, and Escape closes any note', async ({
  page,
}) => {
  await readStoryFromCard(page);
  const pageEl = page.getByTestId('book-page');
  const civ = pageEl.locator('.bk-name[data-kind="civ"]');
  // Realm names turn up in most paragraphs; step on until a chapter has one.
  for (let step = 0; step < 6 && (await civ.count()) === 0; step += 1) {
    const next = pageEl.getByRole('button', { name: /^Next chapter/ });
    if (!(await next.isEnabled())) break;
    await next.click();
  }
  await expect(civ.first()).toBeVisible();
  const url = page.url();
  const entries = await page.evaluate(() => window.history.length);
  await civ.first().click();
  const note = page.getByTestId('book-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute('data-kind', 'civ');
  await expect(note).toContainText(/Held Years \d+/);
  await expect(note.getByRole('button', { name: 'Read its book' })).toBeVisible();
  await expect(note.getByRole('link', { name: /See on map/ })).toBeVisible();
  // The note joins the address on the same history entry, so Back from the Town room reopens it.
  expect(page.url()).toMatch(/&note=civ:\d+$/);
  expect(page.url().replace(/&note=civ:\d+$/, '')).toBe(url);
  expect(await page.evaluate(() => window.history.length)).toBe(entries);
  // A second click on another name swaps the note instead of closing it.
  await pageEl.locator('.bk-name[data-kind="person"], .bk-name[data-kind="place"]').first().click();
  await expect(note).toBeVisible();
  await expect(note).not.toHaveAttribute('data-kind', 'civ');
  await page.keyboard.press('Escape');
  await expect(note).toBeHidden();
});

test('on a phone the search results list under the box, with life years, and Escape closes a note sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await readStoryFromCard(page);
  await page.getByLabel('Search the book').fill('a');
  const results = page.locator('.bk-results');
  await expect(results).toBeVisible();
  await expect(results.locator('.bk-hit').first()).toBeVisible();
  // The contents drawer stays shut; every person row names the years of a life.
  await expect(page.locator('.bk-toc')).not.toBeInViewport();
  const people = results.locator('.bk-hit small', { hasText: /Year|born/ });
  await expect(people.first()).toHaveText(/(Year \S+\u2013\S*|born Year \S+)$/);
  await results.locator('.bk-hit').first().click();
  await expect(results).toBeHidden();
  const names = page
    .getByTestId('book-page')
    .locator('.bk-name[data-kind="person"], .bk-name[data-kind="place"]');
  await names.first().click();
  const note = page.getByTestId('book-note');
  await expect(note).toBeVisible();
  const sheet = await page.locator('.bk-margin').boundingBox();
  expect(sheet!.height).toBeLessThanOrEqual(844 * 0.45 + 1);
  await page.keyboard.press('Escape');
  await expect(note).toBeHidden();
});
