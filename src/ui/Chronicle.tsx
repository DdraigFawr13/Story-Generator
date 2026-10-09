import { useLayoutEffect, useRef } from 'react';
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
  const height = useRef(0);
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    if (element.scrollTop > 0 && height.current > 0)
      element.scrollTop += element.scrollHeight - height.current;
    height.current = element.scrollHeight;
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
        <button type="button" className="secondary back-map" onClick={onClose}>
          Back to map
        </button>
      </div>
      <p className="chronicle-note">
        Latest {Math.min(200, world.events.length)} of {world.events.length} records. Causes retain
        access to earlier records.
      </p>
      <div className="chronicle-body">
        <div ref={list} className="event-list" tabIndex={0} aria-label="Recent events">
          {world.events
            .slice(-200)
            .reverse()
            .map((event) => (
              <button
                type="button"
                key={event.id}
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
