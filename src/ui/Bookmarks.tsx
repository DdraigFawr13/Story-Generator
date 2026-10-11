import { useLayoutEffect, useRef } from 'react';
import {
  bookmarkEntries,
  BOOKMARK_LIMIT,
  type BookmarkSubject,
  type ReadingBookmark,
} from '../controller/bookmarks';
import type { LivingSettlementSnapshot } from '../controller/residents';

export function Bookmarks({
  world,
  subjects,
  available,
  onChoose,
  onRemove,
}: {
  world: LivingSettlementSnapshot;
  subjects: ReadingBookmark[];
  available: boolean;
  onChoose: (subject: BookmarkSubject) => void;
  onRemove: (index: number) => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnIndex = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (returnIndex.current === null) return;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('[data-bookmark-remove]');
    const target = buttons?.[Math.min(returnIndex.current, buttons.length - 1)] ?? heading.current;
    returnIndex.current = null;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }, [subjects]);
  return (
    <section className="reading-bookmarks" aria-label="Reading bookmarks">
      <h3 ref={heading} tabIndex={-1}>
        Your bookmarks
      </h3>
      {!available && (
        <p role="status">Bookmark storage is unavailable. Changes last for this open session.</p>
      )}
      {!subjects.length ? (
        <p>Open a history, then choose Bookmark.</p>
      ) : (
        <ul ref={list} className="bookmark-list">
          {bookmarkEntries(world, subjects).map((item, index) => (
            <li key={`${item.kind}:${item.id}`}>
              <button
                type="button"
                className="secondary"
                data-bookmark-open={`${item.kind}:${item.id}`}
                disabled={!item.available}
                onClick={() => onChoose(item)}
              >
                {item.label} · #{item.id}
              </button>
              {!item.available && <small>Not recorded in this history.</small>}
              <button
                type="button"
                className="secondary"
                data-bookmark-remove={`${item.kind}:${item.id}`}
                aria-label={`Remove bookmark for ${item.label}`}
                onClick={() => {
                  returnIndex.current = index;
                  onRemove(index);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {subjects.length >= BOOKMARK_LIMIT && (
        <p role="status">
          All {BOOKMARK_LIMIT} bookmark spaces are used. Remove one to add another.
        </p>
      )}
      <details>
        <summary>About bookmarks</summary>
        <p className="note">
          Reading shortcuts for this seed stay in this browser and never change what happens in the
          world.
        </p>
        <p className="note">Up to 32 per seed; the 16 most recently updated seeds are kept.</p>
      </details>
    </section>
  );
}
