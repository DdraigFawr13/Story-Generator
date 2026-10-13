// The Chronicle tab (M3.1, reworked in M3.11): the days watched, newest first, with filters by kind
// and importance, small lines folded into a monthly rollup, and the historian's recaps; then the
// site's history from the legends.

import { biography, type Id, type LegendRef } from '../engine';
import { CHRONICLE_WINDOW, EventItem, LegendLines, shortDay, type PanelProps } from './site-panels';

export interface LiveLine {
  day: number;
  /** An event id; absent for the opening note. */
  eventId?: Id;
  text?: string;
}

const FLOORS: [number, string][] = [
  [0, 'All'],
  [3, '★'],
  [6, '★★'],
  [9, '★★★'],
];

export function ChroniclePane({
  m,
  a,
  ui,
  live,
}: Omit<PanelProps, 'sel'> & { live: readonly LiveLine[] }) {
  const ref: LegendRef = { kind: 'site', id: m.site.id };
  const every = m.index.events(ref);
  const bio = biography(m.world, m.content, m.narrator, m.index, ref);
  // Days watched have their own "At the site" list, so this one stops at arrival.
  const arrived = m.active.enteredDay;
  const ids = (ui.mode === 'highlights' ? bio.lines.map((l) => l.eventId) : [...every]).filter(
    (id) => {
      const event = m.index.event(id);
      return event !== undefined && event.day <= arrived;
    },
  );
  const groups = m.content.typeGroups ?? [];
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const type of g.types) groupOf.set(type, g.id);
  const present = groups.filter((g) =>
    ids.some((id) => groupOf.get(m.index.event(id)!.type) === g.id),
  );
  const shown = ids
    .filter((id) => {
      const event = m.index.event(id)!;
      return !ui.hidden.has(groupOf.get(event.type) ?? '') && event.importance >= ui.floor;
    })
    .reverse();
  return (
    <div className="page">
      <div className="sect">
        At the site <span className="r">newest first</span>
      </div>
      {ui.liveOnly !== null && (
        <div className="chips" role="group" aria-label="Shown at the site">
          <button
            type="button"
            className="chip tg"
            aria-pressed={true}
            title="Show every event again"
            onClick={() => ui.setLiveOnly(null)}
          >
            {ui.liveOnly} only ×
          </button>
        </div>
      )}
      <ul className="chron">
        {[...live]
          .filter(
            (line) =>
              ui.liveOnly === null ||
              (line.eventId !== undefined &&
                m.typeDefs.get(m.index.event(line.eventId)?.type ?? '')?.category === ui.liveOnly),
          )
          .reverse()
          .map((line, k) =>
            line.eventId !== undefined ? (
              <EventItem
                key={`${line.eventId}:${k}`}
                m={m}
                a={a}
                ui={ui}
                id={line.eventId}
                path={`l${line.eventId}`}
                label={shortDay(line.day)}
              />
            ) : (
              <li key={`n${k}`} className="ev now">
                <span className="y">{shortDay(line.day)}</span>
                <span className="txt">{line.text}</span>
              </li>
            ),
          )}
      </ul>
      <div className="sect">
        Before you arrived <span className="r">from the legends</span>
      </div>
      <div className="toolrow">
        <div className="seg" role="group" aria-label="Which events">
          {(
            [
              ['highlights', 'Highlights'],
              ['all', 'Every event'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={ui.mode === value}
              onClick={() => ui.setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Importance at least">
          {FLOORS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={ui.floor === value}
              title={`Importance ${label}`}
              onClick={() => ui.setFloor(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="chips" role="group" aria-label="Kinds of event">
        {present.map((g) => (
          <button
            key={g.id}
            type="button"
            className="chip tg"
            aria-pressed={!ui.hidden.has(g.id)}
            onClick={() => ui.toggleGroup(g.id)}
          >
            {g.label.toLowerCase()}
          </button>
        ))}
      </div>
      <p className="quiet">
        {shown.length} of {ids.length} events shown, newest first. &quot;why?&quot; unfolds the
        causes one step at a time.
      </p>
      {shown.length === 0 ? (
        <ul className="chron">
          <li className="empty">No events match.</li>
        </ul>
      ) : (
        <LegendLines m={m} a={a} ui={ui} ids={shown.slice(0, ui.limit)} prefix="c" />
      )}
      {shown.length > ui.limit && (
        <button type="button" onClick={ui.more}>
          Show {CHRONICLE_WINDOW} more ({ui.limit} of {shown.length})
        </button>
      )}
    </div>
  );
}
