// The shared room shell: the rail down the left (the tab bar on a phone) and the room beside it.
// Tales, People, Book and Town all use it, so the rooms look and switch the same way.

import type { ReactNode } from 'react';
import './rooms.css';

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
      <b className="rm-logo">S1</b>
      {ROOMS.map((r) => item(r.id, r.label))}
      <span className="rm-grow" />
      {item('world', 'World')}
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
  return (
    <div className={`rm-root ${className}`} {...rest}>
      <Rail current={current} onRoom={onRoom} />
      {children}
    </div>
  );
}
