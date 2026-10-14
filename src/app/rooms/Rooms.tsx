// The shared room shell: the rail down the left (the tab bar on a phone) and the room beside it.
// Tales and People both use it, so the rooms look and switch the same way.

import type { ReactNode } from 'react';
import './rooms.css';

export type RoomId = 'tales' | 'people' | 'book' | 'town' | 'world';

const ROOMS: { id: RoomId; label: string; soon?: boolean }[] = [
  { id: 'tales', label: 'Tales' },
  { id: 'people', label: 'People' },
  { id: 'book', label: 'Book' },
  { id: 'town', label: 'Town', soon: true },
];

/** The rail. `current` is the room on show; every other room calls `onRoom`. */
export function Rail({ current, onRoom }: { current: RoomId; onRoom: (room: RoomId) => void }) {
  const item = (id: RoomId, label: string, soon = false) => (
    <button
      key={id}
      type="button"
      className={`rm-room${current === id ? ' on' : ''}`}
      aria-current={current === id ? 'page' : undefined}
      onClick={() => onRoom(id)}
    >
      <i className={id === 'world' ? 'round' : ''} />
      <span>{label}</span>
      {soon && <em className="soon">soon</em>}
    </button>
  );
  return (
    <nav className="rm-rail" aria-label="Rooms">
      <b className="rm-logo">S1</b>
      {ROOMS.map((r) => item(r.id, r.label, r.soon))}
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
