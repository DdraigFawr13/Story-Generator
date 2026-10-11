export const BOOKMARK_KEY = 'story-generator.reader-bookmarks.v1';
export const BOOKMARK_LIMIT = 32;
const WORLD_LIMIT = 16;
export interface ReadingBookmark {
  kind: 'resident' | 'household';
  id: number;
  origin: string;
}
interface BookmarkWorld {
  key: string;
  subjects: ReadingBookmark[];
}

function decode(value: string | null): BookmarkWorld[] {
  if (value === null || value.length > 262144) return [];
  let data: { schema?: unknown; worlds?: unknown } | null;
  try {
    data = JSON.parse(value) as typeof data;
  } catch {
    return [];
  }
  if (!data || data.schema !== 1 || !Array.isArray(data.worlds) || data.worlds.length > WORLD_LIMIT)
    return [];
  const worlds: BookmarkWorld[] = [];
  for (const row of data.worlds as BookmarkWorld[]) {
    if (
      !row ||
      typeof row.key !== 'string' ||
      row.key.length > 256 ||
      worlds.some((world) => world.key === row.key) ||
      !Array.isArray(row.subjects) ||
      row.subjects.length > BOOKMARK_LIMIT
    )
      return [];
    const seen = new Set<string>();
    for (const item of row.subjects) {
      if (
        !item ||
        (item.kind !== 'resident' && item.kind !== 'household') ||
        !Number.isSafeInteger(item.id) ||
        item.id < 1 ||
        typeof item.origin !== 'string' ||
        item.origin.length > 256 ||
        seen.has(`${item.kind}:${item.id}`)
      )
        return [];
      seen.add(`${item.kind}:${item.id}`);
    }
    worlds.push({
      key: row.key,
      subjects: row.subjects.map(({ kind, id, origin }) => ({ kind, id, origin })),
    });
  }
  return worlds;
}

export function readBookmarks(key: string): { subjects: ReadingBookmark[]; available: boolean } {
  try {
    const worlds = decode(localStorage.getItem(BOOKMARK_KEY));
    return { subjects: worlds.find((world) => world.key === key)?.subjects ?? [], available: true };
  } catch {
    return { subjects: [], available: false };
  }
}

export function writeBookmarks(key: string, subjects: ReadingBookmark[]): boolean {
  try {
    const worlds = decode(localStorage.getItem(BOOKMARK_KEY)).filter((world) => world.key !== key);
    if (subjects.length) worlds.push({ key, subjects });
    const value = JSON.stringify({ schema: 1, worlds: worlds.slice(-WORLD_LIMIT) });
    // Validate the same limits on writes and reads, before touching preference storage.
    const checked = decode(value);
    if (checked.length !== Math.min(worlds.length, WORLD_LIMIT)) return false;
    localStorage.setItem(BOOKMARK_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function watchBookmarks(
  key: string,
  listener: (value: ReturnType<typeof readBookmarks>) => void,
) {
  const changed = (event: StorageEvent) => {
    if (event.key === BOOKMARK_KEY || event.key === null) listener(readBookmarks(key));
  };
  window.addEventListener('storage', changed);
  return () => window.removeEventListener('storage', changed);
}
