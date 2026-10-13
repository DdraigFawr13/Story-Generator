// The Chronicle tab (M3.1, reworked in M3.11): the days watched, newest first, with filters by kind
// and importance, small lines folded into a monthly rollup, and the historian's recaps; then the
// site's history from the legends.

import { Fragment } from 'react';
import {
  biography,
  dateOf,
  type EventTypeDef,
  type Id,
  type LegendRef,
  type SimEvent,
} from '../engine';
import {
  CHRONICLE_WINDOW,
  EventItem,
  LegendLines,
  RecapCard,
  dayText,
  shortDay,
  type SiteModel,
  type PanelProps,
} from './site-panels';

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

const LIVE_FLOORS: [number, string][] = [
  [0, 'All'],
  [3, 'Notable'],
  [5, 'Major'],
];
const KIND_ORDER = ['life', 'social', 'nature', 'threat', 'politics', 'magic'];

/** "market days" for a type: its rollup label, else its title without the {placeholders}. */
function rollupPhrase(def: EventTypeDef | undefined, type: string, n: number): string {
  if (def?.rollup) return `${n} ${n === 1 ? def.rollup[0] : def.rollup[1]}`;
  const raw = (def?.title ?? type)
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const title = raw.charAt(0).toLowerCase() + raw.slice(1);
  return n === 1 ? title : n === 2 ? `${title} twice` : `${title} ${n} times`;
}

/** "4 market days, 2 skills gained and stores spoiling twice". */
function rollupText(m: SiteModel, events: readonly SimEvent[]): string {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  const parts = [...counts].map(([type, n]) => rollupPhrase(m.typeDefs.get(type), type, n));
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

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
  // The watched days: kind and importance filters, newest first, grouped by month.
  const categoryOf = (line: LiveLine): string | undefined =>
    line.eventId === undefined
      ? undefined
      : m.typeDefs.get(m.index.event(line.eventId)?.type ?? '')?.category;
  const kinds = KIND_ORDER.filter((kind) => live.some((line) => categoryOf(line) === kind));
  const recapTypes = new Set([
    m.content.chronicle.recap.seasonType,
    m.content.chronicle.recap.yearType,
  ]);
  const months: {
    key: string;
    heading: string;
    lines: LiveLine[];
    small: SimEvent[];
  }[] = [];
  for (const line of [...live].reverse()) {
    const event = line.eventId === undefined ? undefined : m.index.event(line.eventId);
    if (line.eventId !== undefined) {
      if (!event) continue;
      const kind = categoryOf(line);
      // "recap" (from the Site tab) shows only the historian's recaps.
      const only = ui.liveOnly === 'recap' ? recapTypes.has(event.type) : kind === ui.liveOnly;
      if (ui.liveOnly !== null && !only) continue;
      if (kind !== undefined && ui.liveHidden.has(kind)) continue;
      if (event.importance < ui.liveFloor) continue;
    }
    const date = dateOf(line.day);
    const key = `${date.year}:${date.month}`;
    let month = months[months.length - 1];
    if (month?.key !== key) {
      month = { key, heading: dayText(line.day).replace(/^\d+ /, ''), lines: [], small: [] };
      months.push(month);
    }
    if (event && event.importance < m.content.chronicle.rollupBelow) month.small.push(event);
    else month.lines.push(line);
  }
  return (
    <div className="page">
      <div className="sect">
        At the site <span className="r">newest first</span>
      </div>
      <div className="toolrow">
        <div className="seg" role="group" aria-label="Importance at least">
          {LIVE_FLOORS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={ui.liveFloor === value}
              onClick={() => ui.setLiveFloor(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="chips" role="group" aria-label="Kinds of event at the site">
        {ui.liveOnly !== null && (
          <button
            type="button"
            className="chip tg"
            aria-pressed={true}
            title="Show every event again"
            onClick={() => ui.setLiveOnly(null)}
          >
            {ui.liveOnly === 'recap' ? 'recaps' : ui.liveOnly} only ×
          </button>
        )}
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            className="chip tg"
            aria-pressed={!ui.liveHidden.has(kind)}
            onClick={() => ui.toggleLiveKind(kind)}
          >
            {kind}
          </button>
        ))}
      </div>
      <ul className="chron">
        {months.length === 0 && <li className="empty">No events match.</li>}
        {months.map((month) => (
          <Fragment key={month.key}>
            <li className="month">{month.heading}</li>
            {month.lines.map((line, k) =>
              line.eventId === undefined ? (
                <li key={`n${k}`} className="ev now">
                  <span className="y">{shortDay(line.day)}</span>
                  <span className="txt">{line.text}</span>
                </li>
              ) : recapTypes.has(m.index.event(line.eventId)?.type ?? '') ? (
                <RecapCard
                  key={`${line.eventId}:${k}`}
                  m={m}
                  a={a}
                  ui={ui}
                  id={line.eventId}
                  path={`l${line.eventId}`}
                />
              ) : (
                <EventItem
                  key={`${line.eventId}:${k}`}
                  m={m}
                  a={a}
                  ui={ui}
                  id={line.eventId}
                  path={`l${line.eventId}`}
                  label={shortDay(line.day)}
                />
              ),
            )}
            {month.small.length > 0 && (
              <li className="ev rollup">
                <span className="y" />
                <span className="txt">
                  Also: {rollupText(m, month.small)}{' '}
                  <button
                    type="button"
                    className="why"
                    aria-expanded={ui.unfolded.has(`roll:${month.key}`)}
                    onClick={() => ui.toggleUnfold(`roll:${month.key}`)}
                  >
                    {ui.unfolded.has(`roll:${month.key}`) ? 'hide' : 'show'}
                  </button>
                </span>
              </li>
            )}
            {ui.unfolded.has(`roll:${month.key}`) &&
              month.small.map((event) => (
                <EventItem
                  key={`r${event.id}`}
                  m={m}
                  a={a}
                  ui={ui}
                  id={event.id}
                  path={`l${event.id}`}
                  label={shortDay(event.day)}
                />
              ))}
          </Fragment>
        ))}
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
