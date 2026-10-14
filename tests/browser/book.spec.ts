// The Book room: a Tales card opens the chapter that holds its event, a name opens a margin note,
// Back returns to Tales; the room fits a phone.
import { expect, test, type Page } from '@playwright/test';

async function readStoryFromCard(page: Page) {
  await page.goto('/?seed=SMOKE&size=128');
  await expect(page.getByTestId('tales-stage')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Years a second').selectOption('60');
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
  const next = pageEl.getByRole('button', { name: /›$/ });
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
