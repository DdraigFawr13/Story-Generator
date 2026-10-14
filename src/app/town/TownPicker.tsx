// The Town room before a town is chosen: the towns that can be watched, largest first. It is
// shown when the rail's Town item is pressed and no town has been watched yet.

import { useDeferredValue, useMemo, useState } from 'react';
import { sitePopulation, type Id, type WorldState } from '../../engine';
import { cap } from '../format';
import { RoomShell, type RoomId } from '../rooms/Rooms';
import './town.css';
import '../tales/fonts.css';

interface Props {
  world: WorldState;
  /** False while another site is starting. */
  enabled: boolean;
  onRoom: (room: RoomId) => void;
  onWatch: (siteId: Id) => void;
}

/** Rows shown before the search narrows the list. */
const SHOWN = 120;

export function TownPicker({ world, enabled, onRoom, onWatch }: Props) {
  const [text, setText] = useState('');
  const needle = useDeferredValue(text.trim().toLowerCase());
  const rows = useMemo(() => {
    const list = [...world.sites.values()]
      .filter((s) => s.ruinedYear === undefined)
      .map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        pop: sitePopulation(s),
        realm: s.civId === null ? undefined : world.civs.get(s.civId)?.name,
      }))
      .sort((a, b) => b.pop - a.pop || a.id - b.id);
    return list;
  }, [world]);
  const shown = (
    needle === ''
      ? rows
      : rows.filter((r) => `${r.name} ${r.kind} ${r.realm ?? ''}`.toLowerCase().includes(needle))
  ).slice(0, SHOWN);
  // A world still being built has no towns yet; say so rather than "0 towns".
  const loading = world.sites.size === 0;
  return (
    <RoomShell current="town" onRoom={onRoom} className="tw-root" data-testid="town-picker">
      <main className="tw-pick">
        <header className="tw-pick-head">
          <h1>Choose a town to watch</h1>
          <input
            type="search"
            value={text}
            placeholder="Find a town or a realm"
            aria-label="Find a town or a realm"
            onChange={(event) => setText(event.target.value)}
          />
          <p data-testid="town-picker-line">
            {loading
              ? 'Reading the world…'
              : `${rows.length} ${rows.length === 1 ? 'town stands' : 'towns still stand'}. You watch one day at a time, and follow the people who live there.`}
          </p>
        </header>
        <div className="tw-pick-list">
          {shown.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={!enabled}
              data-testid="town-pick"
              onClick={() => onWatch(r.id)}
            >
              <b>{r.name}</b>
              <small>
                {cap(r.kind)}
                {r.realm ? ` of the ${r.realm}` : ''} · {r.pop.toLocaleString('en-US')} people
              </small>
            </button>
          ))}
          {!loading && shown.length === 0 && <p className="tw-quiet">No town matches.</p>}
        </div>
      </main>
    </RoomShell>
  );
}
