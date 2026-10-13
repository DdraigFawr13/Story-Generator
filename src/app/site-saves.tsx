// Saves while watching a site (M3.12): save the world and the site as they stand, load any save,
// and autosave once a month of play. The worker serializes and gzips its own world, so saving
// never stalls the page; the store keeps the bytes in IndexedDB as the world-map saves do.

import { useEffect, useRef, useState } from 'react';
import type { WorldState } from '../engine';
import {
  openSaveStore,
  validateSaveName,
  type SaveHeader,
  type SaveStore,
  type SaveSummary,
  type SaveView,
} from '../platform/save-store';
import type { SiteHost } from '../platform/site-host';
import { dayText } from './site-panels';
import { shortDate } from './site-season';

/** Autosaves are at least this far apart in real time, so 16× and "Next notable" are not slowed. */
const AUTOSAVE_MIN_MS = 30_000;

export const autosaveName = (site: string) => `Autosave · ${site}`;

/** The default name of a save: the site and the day it holds. */
export const defaultSaveName = (site: string, day: number) => `${site}, ${shortDate(day)}`;

/** The name already says where and when (a default name), so the list need not repeat it. */
export const nameSaysWhen = (save: SaveSummary) =>
  save.name.includes(shortDate(save.day)) && (!save.site || save.name.includes(save.site));

/** The save list's second line: the site and day unless the name says them, then the seed. */
export function saveLine(save: SaveSummary): string {
  if (nameSaysWhen(save)) return `seed ${save.seed}`;
  const where = save.site ?? 'the world map';
  return `${where} · ${shortDate(save.day)} · seed ${save.seed}`;
}

/** "Name (2)", "Name (3)"…: the first name not in the list, kept within the 60-character limit. */
export function freeName(name: string, taken: readonly string[]): string {
  for (let n = 2; ; n += 1) {
    const tail = ` (${n})`;
    const next = `${name.slice(0, 60 - tail.length).trimEnd()}${tail}`;
    if (!taken.includes(next)) return next;
  }
}

/** A save taken from the worker that waits on "Replace?" because its name is in use. */
interface Pending {
  name: string;
  header: SaveHeader;
  data: Uint8Array;
  view: SaveView;
}

interface Props {
  host: SiteHost;
  siteName: string;
  day: number;
  /** The clock is running (autosave only saves play). */
  playing: boolean;
  autosaveDays: number;
  /** The view the link shows now; a save keeps it so loading opens the same scene. */
  view(): SaveView;
  open: boolean;
  setOpen(open: boolean): void;
  onLoad(world: WorldState, view?: SaveView): void;
}

/** The "Saves" button and its popover; it stays mounted so the autosave keeps watching the days. */
export function SiteSaves(props: Props) {
  const { host, siteName, day, open, setOpen } = props;
  const [store, setStore] = useState<SaveStore | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAuto, setLastAuto] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  /** Day and wall-clock time of the last save, manual or auto, for the autosave's spacing. */
  const last = useRef({ day, at: performance.now() });
  const running = useRef(false);

  useEffect(() => {
    let alive = true;
    void openSaveStore().then(async (opened) => {
      if (!alive) return;
      setStore(opened.store);
      setPersistent(opened.persistent);
      setSaves(await opened.store.list());
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Stores a save taken from the worker under `saveName`, replacing any save of that name. */
  const keep = async (saveName: string, taken: Omit<Pending, 'name'>): Promise<SaveSummary> => {
    if (!store) throw new Error('Saves are not ready yet.');
    const saved = await store.saveCompressed(saveName, taken.header, taken.data, taken.view);
    last.current = { day: taken.header.day, at: performance.now() };
    setSaves(await store.list());
    return saved;
  };

  /**
   * Takes the world from the worker, then names it: an unedited name is built from the day the
   * save holds, not the day on screen when Save was pressed (the clock may have run on).
   */
  const write = async (
    nameFor: (day: number) => string,
    replace: boolean,
  ): Promise<SaveSummary | Pending> => {
    if (!store) throw new Error('Saves are not ready yet.');
    running.current = true;
    setBusy(true);
    try {
      const view = props.view();
      const { header, data } = await host.save();
      const saveName = validateSaveName(nameFor(header.day));
      if (!replace && (await store.list()).some((save) => save.name === saveName)) {
        return { name: saveName, header, data, view };
      }
      return await keep(saveName, { header, data, view });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  // Autosave: once `autosaveDays` of play have passed since the last save, into one slot per site.
  useEffect(() => {
    if (!store || !props.playing || running.current) return;
    if (day - last.current.day < props.autosaveDays) return;
    if (performance.now() - last.current.at < AUTOSAVE_MIN_MS) return;
    write(() => autosaveName(siteName), true).then(
      (saved) => setLastAuto((saved as SaveSummary).day),
      // A save cut short by another request (a link run, a manual save) waits for the next day.
      () => {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, store, props.playing]);

  const attempt = async (action: () => Promise<string>) => {
    try {
      setStatus(await action());
    } catch (problem) {
      const message = (problem as Error).message;
      setStatus(message === 'cancelled' ? 'The save was interrupted; try again.' : message);
    }
  };
  const shownName = name ?? defaultSaveName(siteName, day);
  const savedLine = (saved: SaveSummary) => `Saved “${saved.name}” at ${dayText(saved.day)}.`;

  return (
    <span className="saves">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="sv-saves"
        onClick={() => {
          setOpen(!open);
          setName(null);
          setStatus(null);
          setPending(null);
        }}
      >
        Saves
      </button>
      {open && (
        <div className="savepop" id="sv-saves" role="dialog" aria-label="Saves">
          <form
            className="saverow"
            onSubmit={(event) => {
              event.preventDefault();
              setPending(null);
              void attempt(async () => {
                const typed = name;
                const saved = await write(
                  (heldDay) => typed ?? defaultSaveName(siteName, heldDay),
                  false,
                );
                if ('data' in saved) {
                  setPending(saved);
                  return `A save named “${saved.name}” already exists.`;
                }
                return savedLine(saved);
              });
            }}
          >
            <label>
              <span>Save as</span>
              <input value={shownName} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="submit" disabled={!store || busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </form>
          <p className="quiet">
            {persistent
              ? 'Saves stay in this browser.'
              : 'This browser is not keeping saves; they last until the page closes.'}{' '}
            Autosave every {props.autosaveDays} days of play
            {lastAuto !== null ? `; last at ${dayText(lastAuto)}` : ''}.
          </p>
          {status && (
            <p className="savestatus" role="status">
              {status}
            </p>
          )}
          {pending && (
            <div className="saveask" role="group" aria-label="Replace the save?">
              <span>Replace the save “{pending.name}”?</span>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setPending(null);
                  void attempt(async () => savedLine(await keep(pending.name, pending)));
                }}
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  void attempt(async () => {
                    const taken = (await store!.list()).map((save) => save.name);
                    return savedLine(await keep(freeName(pending.name, taken), pending));
                  });
                }}
              >
                Keep both
              </button>
            </div>
          )}
          <ul className="savelist">
            {saves.length === 0 && <li className="quiet">No saves yet.</li>}
            {saves.map((save) => (
              <li key={save.name}>
                <span className="savename">{save.name}</span>
                <span className="savewhen">{saveLine(save)}</span>
                <span className="savebtns">
                  <button
                    type="button"
                    aria-label={`Load ${save.name}`}
                    disabled={busy}
                    onClick={() =>
                      void attempt(async () => {
                        const loaded = await store!.load(save.name);
                        setOpen(false);
                        props.onLoad(loaded, save.view);
                        return `Loaded “${save.name}”.`;
                      })
                    }
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${save.name}`}
                    disabled={busy}
                    onClick={() =>
                      void attempt(async () => {
                        await store!.remove(save.name);
                        setSaves(await store!.list());
                        return `Deleted “${save.name}”.`;
                      })
                    }
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
