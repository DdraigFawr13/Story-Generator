import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dateLabel, eventDetails, headline } from '../controller/chronicle';
import type { SettlementSnapshot } from '../controller/world';

export function Chronicle({
  world,
  selectedId,
  onSelect,
  expanded,
  onClose,
}: {
  world: SettlementSnapshot;
  selectedId: number | null;
  onSelect: (id: number) => void;
  expanded: boolean;
  onClose: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const [record, setRecord] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (expanded) back.current?.focus({ preventScroll: true });
  }, [expanded]);
  function rememberAnchor() {
    const element = list.current;
    if (!element || element.scrollTop === 0) {
      anchor.current = null;
      return;
    }
    const top = element.getBoundingClientRect().top;
    const item = [...element.querySelectorAll<HTMLButtonElement>('[data-event-id]')].find(
      (item) => item.getBoundingClientRect().bottom > top,
    );
    anchor.current = item
      ? { id: item.dataset.eventId!, offset: item.getBoundingClientRect().top - top }
      : null;
  }
  useLayoutEffect(() => {
    const element = list.current,
      reading = anchor.current;
    if (!element || !reading) return;
    const item = element.querySelector<HTMLButtonElement>(`[data-event-id="${reading.id}"]`);
    if (item)
      element.scrollTop +=
        item.getBoundingClientRect().top - element.getBoundingClientRect().top - reading.offset;
  }, [world.events.length]);
  const selected = selectedId === null ? null : world.events[selectedId - 1];
  const details = selected ? eventDetails(selected) : null;
  return (
    <section
      id="chronicle"
      className={`chronicle ${expanded ? 'expanded' : ''}`}
      aria-label="Chronicle"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="map-heading">
        <h2>The chronicle</h2>
        <button type="button" className="secondary back-map" ref={back} onClick={onClose}>
          Back to map
        </button>
      </div>
      <p className="chronicle-note">
        Latest {Math.min(200, world.events.length)} of {world.events.length} records. Causes retain
        access to earlier records.
      </p>
      <form
        className="archive-search"
        onSubmit={(event) => {
          event.preventDefault();
          const id = Number(record);
          if (record !== '' && Number.isSafeInteger(id) && id > 0 && id <= world.events.length) {
            setError('');
            onSelect(id);
          } else setError(`Choose a record from 1 to ${world.events.length}.`);
        }}
      >
        <label>
          Record number
          <input
            type="number"
            min="1"
            max={world.events.length}
            value={record}
            onChange={(event) => setRecord(event.target.value)}
          />
        </label>
        <button type="submit" className="secondary">
          Find record
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="chronicle-body">
        <div
          ref={list}
          className="event-list"
          onScroll={rememberAnchor}
          tabIndex={0}
          aria-label="Recent events"
        >
          {world.events
            .slice(-200)
            .reverse()
            .map((event) => (
              <button
                type="button"
                key={event.id}
                data-event-id={event.id}
                className={`event-button ${selectedId === event.id ? 'selected' : ''}`}
                aria-pressed={selectedId === event.id}
                onClick={() => onSelect(event.id)}
              >
                <span className="event-date">
                  {dateLabel(event.tick)} · #{event.id}
                </span>
                <span>{headline(event)}</span>
              </button>
            ))}
        </div>
        <div className="event-details" role="region" aria-label="Event evidence">
          {selected && details ? (
            <>
              <h3>{headline(selected)}</h3>
              <p>
                {dateLabel(selected.tick)} · record #{selected.id} · tile {selected.location.tile}
              </p>
              <div className="archive-neighbors">
                <button
                  type="button"
                  className="secondary"
                  disabled={selected.id === 1}
                  onClick={() => onSelect(selected.id - 1)}
                >
                  Previous record
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={selected.id === world.events.length}
                  onClick={() => onSelect(selected.id + 1)}
                >
                  Next record
                </button>
              </div>
              <h4>Recorded facts</h4>
              <dl>
                {details.facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
              <h4>Changes at this event</h4>
              {details.effects.length ? (
                <dl>
                  {details.effects.map((effect) => (
                    <div key={effect.label}>
                      <dt>{effect.label}</dt>
                      <dd>{effect.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>No direct resource change was recorded.</p>
              )}
              <h4>Recorded causes</h4>
              {selected.causes.length ? (
                selected.causes.map((id) => (
                  <button
                    type="button"
                    className="secondary cause-button"
                    key={id}
                    onClick={() => onSelect(id)}
                  >
                    #{id}: {headline(world.events[id - 1]!)}
                  </button>
                ))
              ) : (
                <p>No earlier causal record is linked.</p>
              )}
            </>
          ) : (
            <p>Select a record to inspect its location, facts, changes and recorded causes.</p>
          )}
        </div>
      </div>
    </section>
  );
}
