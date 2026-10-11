import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dateLabel, eventDetails, headline } from '../controller/chronicle';
import { isIndividualWorld, type WorldSnapshot } from '../controller/world';
import { residentName } from '../controller/residents';
import {
  ALL_RECORDS,
  categoryLabel,
  filterChronicle,
  type ChronicleFilters,
} from '../controller/chronicle-filters';

export function Chronicle({
  world,
  selectedId,
  onSelect,
  expanded,
  onClose,
  focusRequest = 0,
  backToRecap = false,
  backToResident = false,
  backToHousehold = false,
}: {
  world: WorldSnapshot;
  selectedId: number | null;
  onSelect: (id: number) => void;
  expanded: boolean;
  onClose: () => void;
  focusRequest?: number;
  backToRecap?: boolean;
  backToResident?: boolean;
  backToHousehold?: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const evidence = useRef<HTMLDivElement>(null);
  const evidenceHeading = useRef<HTMLHeadingElement>(null);
  const focusEvidence = useRef(false);
  const previousFocusRequest = useRef(0);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const [record, setRecord] = useState('');
  const [error, setError] = useState('');
  const [causeTrail, setCauseTrail] = useState<number[]>([]);
  const [filters, setFilters] = useState<Readonly<ChronicleFilters>>(ALL_RECORDS);
  const [beforeId, setBeforeId] = useState<number | null>(null);
  const [pageTrail, setPageTrail] = useState<(number | null)[]>([]);
  const matches = useMemo(() => filterChronicle(world, filters), [world, filters]);
  const shown = useMemo(
    () =>
      matches
        .filter((event) => beforeId === null || event.id <= beforeId)
        .slice(-200)
        .reverse(),
    [matches, beforeId],
  );
  const categories = useMemo(
    () => [...new Set(world.events.map((event) => event.type))].sort(),
    [world.events],
  );
  const hasFilters =
    filters.personId !== null ||
    filters.householdId !== null ||
    filters.category !== 'all' ||
    filters.importance !== 'all';
  function changeFilters(next: Readonly<ChronicleFilters>) {
    setFilters(next);
    setBeforeId(null);
    setPageTrail([]);
    anchor.current = null;
    if (list.current) list.current.scrollTop = 0;
  }
  function changePage(before: number | null) {
    setBeforeId(before);
    anchor.current = null;
    if (list.current) list.current.scrollTop = 0;
  }
  useEffect(() => {
    if (expanded && focusRequest === 0) back.current?.focus({ preventScroll: true });
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
  useLayoutEffect(() => {
    const heading = evidenceHeading.current;
    const requested = focusRequest > 0 && previousFocusRequest.current !== focusRequest;
    previousFocusRequest.current = focusRequest;
    if ((!focusEvidence.current && !requested) || !heading) return;
    if (requested) setCauseTrail([]);
    focusEvidence.current = false;
    if (evidence.current) evidence.current.scrollTop = 0;
    if (content.current) {
      content.current.scrollTop +=
        heading.getBoundingClientRect().top - content.current.getBoundingClientRect().top - 16;
    }
    heading.focus({ preventScroll: true });
  }, [selectedId, focusRequest]);
  function selectRecord(id: number) {
    setCauseTrail([]);
    onSelect(id);
  }
  function followCause(id: number) {
    if (selectedId === null) return;
    // Canonical causes point strictly backward, bounding this trail by the retained archive.
    setCauseTrail((trail) => [...trail, selectedId]);
    focusEvidence.current = true;
    onSelect(id);
  }
  function returnToRecord() {
    const id = causeTrail.at(-1);
    if (id === undefined) return;
    setCauseTrail((trail) => trail.slice(0, -1));
    focusEvidence.current = true;
    onSelect(id);
  }
  const selected = selectedId === null ? null : world.events[selectedId - 1];
  const details = selected ? eventDetails(selected) : null;
  return (
    <section
      id="chronicle"
      className={`chronicle ${expanded ? 'expanded' : ''} ${backToRecap || backToResident || backToHousehold ? 'recap-evidence' : ''}`}
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
          {backToRecap
            ? 'Back to recap'
            : backToResident
              ? 'Back to resident'
              : backToHousehold
                ? 'Back to household'
                : 'Back to map'}
        </button>
      </div>
      <div className="chronicle-content" ref={content}>
        <p className="chronicle-note">
          {beforeId === null ? 'Latest' : 'Showing'} {shown.length} of {matches.length}{' '}
          {hasFilters ? 'matching ' : ''}records. Causes retain access to earlier records.
        </p>
        <details className="chronicle-filters">
          <summary>Filter records</summary>
          <div className="resident-filters">
            {isIndividualWorld(world) && (
              <>
                <label>
                  Person
                  <select
                    value={filters.personId ?? 'all'}
                    onChange={(event) =>
                      changeFilters({
                        ...filters,
                        personId:
                          event.currentTarget.value === 'all'
                            ? null
                            : Number(event.currentTarget.value),
                      })
                    }
                  >
                    <option value="all">All people</option>
                    {world.world.residents.map((person) => (
                      <option key={person.id} value={person.id}>
                        {residentName(person)} · #{person.id}
                        {person.deathEventId === null ? '' : ' · deceased'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Household records
                  <select
                    value={filters.householdId ?? 'all'}
                    onChange={(event) =>
                      changeFilters({
                        ...filters,
                        householdId:
                          event.currentTarget.value === 'all'
                            ? null
                            : Number(event.currentTarget.value),
                      })
                    }
                  >
                    <option value="all">All households</option>
                    {world.world.households.map((household) => (
                      <option key={household.id} value={household.id}>
                        {household.name} · #{household.id}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label>
              Record category
              <select
                value={filters.category}
                onChange={(event) =>
                  changeFilters({
                    ...filters,
                    category: event.currentTarget.value as ChronicleFilters['category'],
                  })
                }
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Record importance
              <select
                value={filters.importance}
                onChange={(event) =>
                  changeFilters({
                    ...filters,
                    importance: event.currentTarget.value as ChronicleFilters['importance'],
                  })
                }
              >
                <option value="all">All importance</option>
                <option value="major">Major</option>
                <option value="ordinary">Ordinary</option>
                <option value="minor">Minor</option>
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => changeFilters(ALL_RECORDS)}
              disabled={!hasFilters}
            >
              Clear record filters
            </button>
          </div>
          <p className="note">
            Person and household filters match recorded participants. Lookup and causes can open any
            retained record.
          </p>
        </details>
        <form
          className="archive-search"
          onSubmit={(event) => {
            event.preventDefault();
            const id = Number(record);
            if (record !== '' && Number.isSafeInteger(id) && id > 0 && id <= world.events.length) {
              setError('');
              selectRecord(id);
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
          <div className="chronicle-records">
            <div
              ref={list}
              className="event-list"
              onScroll={rememberAnchor}
              tabIndex={0}
              aria-label="Recent events"
            >
              {shown.map((event) => (
                <button
                  type="button"
                  key={event.id}
                  data-event-id={event.id}
                  className={`event-button ${selectedId === event.id ? 'selected' : ''}`}
                  aria-pressed={selectedId === event.id}
                  onClick={() => selectRecord(event.id)}
                >
                  <span className="event-date">
                    {dateLabel(event.tick)} · #{event.id}
                  </span>
                  <span>{headline(event)}</span>
                </button>
              ))}
              {shown.length === 0 && (
                <p className="chronicle-empty">No records match these filters.</p>
              )}
            </div>
            {(matches.length > 200 || beforeId !== null) && (
              <div className="chronicle-pages">
                <button
                  type="button"
                  className="secondary"
                  disabled={pageTrail.length === 0}
                  onClick={() => {
                    changePage(pageTrail.at(-1)!);
                    setPageTrail((previous) => previous.slice(0, -1));
                  }}
                >
                  Newer matching records
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!shown.length || !matches.some((event) => event.id < shown.at(-1)!.id)}
                  onClick={() => {
                    setPageTrail((previous) => [...previous, beforeId]);
                    changePage(shown.at(-1)!.id - 1);
                  }}
                >
                  Earlier matching records
                </button>
              </div>
            )}
          </div>
          <div className="event-details" role="region" aria-label="Event evidence" ref={evidence}>
            {selected && details ? (
              <>
                {hasFilters && !matches.some((event) => event.id === selected.id) && (
                  <p className="note">This source is outside your current filters.</p>
                )}
                <h3 ref={evidenceHeading} tabIndex={-1}>
                  {headline(selected)}
                </h3>
                <p>
                  {dateLabel(selected.tick)} · record #{selected.id} · tile {selected.location.tile}
                </p>
                <div className="archive-neighbors">
                  {causeTrail.length > 0 && (
                    <button type="button" className="secondary" onClick={returnToRecord}>
                      Return to record #{causeTrail.at(-1)}
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    disabled={selected.id === 1}
                    onClick={() => selectRecord(selected.id - 1)}
                  >
                    Previous record
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={selected.id === world.events.length}
                    onClick={() => selectRecord(selected.id + 1)}
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
                      onClick={() => followCause(id)}
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
      </div>
    </section>
  );
}
