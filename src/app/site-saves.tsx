// Saves while watching a site (M3.12): save the world and the site as they stand, load any save,
// and autosave once a month of play. The worker serializes and gzips its own world, so saving
// never stalls the page; the store keeps the bytes in IndexedDB as the world-map saves do.

import { useEffect, useRef, useState } from 'react';
import type { WorldState } from '../engine';
import { openSaveStore, type SaveStore, type SaveSummary } from '../platform/save-store';
import type { SiteHost } from '../platform/site-host';
import { dayText } from './site-panels';
import { shortDate } from './site-season';

/** Autosaves are at least this far apart in real time, so 16× and "Next notable" are not slowed. */
const AUTOSAVE_MIN_MS = 30_000;

export const autosaveName = (site: string) => `Autosave · ${site}`;

/** The save list's date: the day, then the site when the save is of one. */
export function saveLine(save: SaveSummary): string {
  const where = save.site ?? 'the world map';
  return `${where} · ${shortDate(save.day)} · seed ${save.seed}`;
}

interface Props {
  host: SiteHost;
  siteName: string;
  day: number;
  /** The clock is running (autosave only saves play). */
  playing: boolean;
  autosaveDays: number;
  open: boolean;
  setOpen(open: boolean): void;
  onLoad(world: WorldState): void;
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

  const write = async (saveName: string): Promise<SaveSummary> => {
    if (!store) throw new Error('Saves are not ready yet.');
    running.current = true;
    setBusy(true);
    try {
      const { header, data } = await host.save();
      const saved = await store.saveCompressed(saveName, header, data);
      last.current = { day: header.day, at: performance.now() };
      setSaves(await store.list());
      return saved;
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
    write(autosaveName(siteName)).then(
      (saved) => setLastAuto(saved.day),
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
  const shownName = name ?? `${siteName}, ${shortDate(day)}`;

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
              void attempt(async () => {
                const saved = await write(shownName);
                return `Saved “${saved.name}” at ${dayText(saved.day)}.`;
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
                        props.onLoad(loaded);
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
