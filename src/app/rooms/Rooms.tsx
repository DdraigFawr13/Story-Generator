// The shared room shell: the rail down the left (the tab bar on a phone) and the room beside it.
// Tales, People, Book and Town all use it, so the rooms look and switch the same way.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { HISTORY_YEARS, type HistoryLength, type WorldSize } from '../map-view';
import './rooms.css';

/**
 * What every room needs to make a new world: the world shown, the generator's progress, and the
 * calls. The app provides it; the rail's world button opens the sheet that uses it.
 */
export interface WorldControls {
  seed: string;
  size: WorldSize;
  years: HistoryLength;
  /** Generation under way, with what it is doing. */
  busy: { label: string; fraction: number } | null;
  /** Why the last seed was refused, if it was. */
  seedError: string | null;
  /** Make a world and play its history in Tales. */
  generate: (seed: string, size: WorldSize, years: HistoryLength) => void;
  /** The classic viewer: map layers, saves and founding an outpost. */
  classic: () => void;
}
export const WorldControlsContext = createContext<WorldControls | null>(null);

const YEAR_WORDS: Record<HistoryLength, string> = {
  250: '250 years',
  500: '500 years (slower)',
  1000: '1000 years (slowest)',
};

/** The sheet behind the rail's world button: seed, size and how many years of history. */
function WorldSheet({ controls, onClose }: { controls: WorldControls; onClose: () => void }) {
  const [seed, setSeed] = useState(controls.seed);
  const [size, setSize] = useState<WorldSize>(controls.size);
  const [years, setYears] = useState<HistoryLength>(controls.years);
  const box = useRef<HTMLFormElement>(null);
  // A click outside or Escape closes it.
  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (box.current && !box.current.contains(target)) {
        if (!(target as Element).closest?.('.rm-new')) onClose();
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <form
      ref={box}
      className="rm-sheet"
      role="dialog"
      aria-label="New world"
      onSubmit={(event) => {
        event.preventDefault();
        controls.generate(seed, size, years);
        // The room's own bar shows the progress; a refused seed reopens the sheet with why.
        onClose();
      }}
    >
      <h2>A new world</h2>
      <p className="rm-small">This world is {controls.seed}.</p>
      <label>
        <span>Seed</span>
        <input
          value={seed}
          spellCheck={false}
          aria-invalid={controls.seedError !== null}
          onChange={(event) => setSeed(event.target.value)}
        />
      </label>
      {controls.seedError && (
        <p role="alert" className="rm-err">
          {controls.seedError}
        </p>
      )}
      <label>
        <span>Size</span>
        <select value={size} onChange={(event) => setSize(Number(event.target.value) as WorldSize)}>
          <option value={256}>256 × 256</option>
          <option value={128}>128 × 128 (small)</option>
        </select>
      </label>
      <label>
        <span>History</span>
        <select
          value={years}
          onChange={(event) => setYears(Number(event.target.value) as HistoryLength)}
        >
          {HISTORY_YEARS.map((y) => (
            <option key={y} value={y}>
              {YEAR_WORDS[y]}
            </option>
          ))}
        </select>
      </label>
      <div className="rm-acts">
        <button type="submit" className="p" disabled={controls.busy !== null}>
          {controls.busy ? 'Making…' : 'Make the world'}
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="rm-small">
        Its history plays in Tales once made.{' '}
        <button type="button" className="rm-classic" onClick={controls.classic}>
          Classic viewer
        </button>{' '}
        keeps the map layers, saves and outposts.
      </p>
    </form>
  );
}

export type RoomId = 'tales' | 'people' | 'book' | 'town' | 'world';

/** Small line icons (24 px grid, 1.5 px strokes, the text colour), one per room. */
const ICONS: Record<RoomId, ReactNode> = {
  // An open scroll with its roll at each end and lines of writing.
  tales: (
    <>
      <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6" />
      <path d="M6 4a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1h2V4" />
      <path d="M6 20a2 2 0 0 1-2-2v-1a1 1 0 0 1 1-1h2v4" />
      <path d="M11 9h5M11 12.5h5M11 16h3" />
    </>
  ),
  // A head and shoulders.
  people: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
    </>
  ),
  // A closed book with its spine and a page edge.
  book: (
    <>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5z" />
      <path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3" />
      <path d="M9 8h6" />
    </>
  ),
  // A house with a door.
  town: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  // A globe: the circle, a meridian and two parallels.
  world: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <path d="M12 4c2.5 2.3 3.7 5 3.7 8s-1.2 5.7-3.7 8c-2.5-2.3-3.7-5-3.7-8S9.5 6.3 12 4z" />
    </>
  ),
};

const ROOMS: { id: RoomId; label: string }[] = [
  { id: 'tales', label: 'Tales' },
  { id: 'people', label: 'People' },
  { id: 'book', label: 'Book' },
  { id: 'town', label: 'Town' },
];

/** The rail. `current` is the room on show; every other room calls `onRoom`. */
export function Rail({ current, onRoom }: { current: RoomId; onRoom: (room: RoomId) => void }) {
  const controls = useContext(WorldControlsContext);
  const [sheet, setSheet] = useState(false);
  // A new world arriving closes the sheet; a refused seed opens it again to say why.
  const made = controls ? `${controls.seed}|${controls.size}|${controls.years}` : '';
  useEffect(() => setSheet(false), [made]);
  const refused = controls?.seedError ?? null;
  useEffect(() => {
    if (refused) setSheet(true);
  }, [refused]);
  const item = (id: RoomId, label: string) => (
    <button
      key={id}
      type="button"
      className={`rm-room${current === id ? ' on' : ''}`}
      aria-current={current === id ? 'page' : undefined}
      onClick={() => onRoom(id)}
    >
      <svg
        className="rm-ico"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICONS[id]}
      </svg>
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="rm-rail" aria-label="Rooms">
      {controls && (
        <button
          type="button"
          className="rm-room rm-new"
          aria-label="New world"
          aria-expanded={sheet}
          title={`This world is ${controls.seed}. Make a new one.`}
          onClick={() => setSheet((o) => !o)}
        >
          <svg
            className="rm-ico"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8.5v7M8.5 12h7" />
          </svg>
          <span className="long">New world</span>
          <span className="short">New</span>
        </button>
      )}
      {ROOMS.map((r) => item(r.id, r.label))}
      <span className="rm-grow" />
      {item('world', 'World')}
      {controls && sheet && (
        <>
          <div className="rm-backdrop" aria-hidden="true" />
          <WorldSheet controls={controls} onClose={() => setSheet(false)} />
        </>
      )}
    </nav>
  );
}

/** A room: the rail plus its content. `className` carries the room's own root styles. */
export function RoomShell({
  current,
  onRoom,
  className,
  children,
  ...rest
}: {
  current: RoomId;
  onRoom: (room: RoomId) => void;
  className: string;
  children: ReactNode;
  'data-testid'?: string;
  'data-mode'?: string;
}) {
  const busy = useContext(WorldControlsContext)?.busy ?? null;
  return (
    <div className={`rm-root ${className}`} {...rest}>
      <Rail current={current} onRoom={onRoom} />
      {children}
      {busy && (
        <div className="rm-busy" role="status" aria-live="polite">
          <i style={{ width: `${Math.round(busy.fraction * 100)}%` }} />
          <span>{busy.label}</span>
        </div>
      )}
    </div>
  );
}
