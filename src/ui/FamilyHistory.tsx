import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  residentLineage,
  lineageLabel,
  LINEAGE_PAGE_SIZE,
  type LineageDirection,
} from '../controller/family';
import { residentName, type LivingSettlementSnapshot } from '../controller/residents';
import { dateLabel } from '../controller/chronicle';

export function FamilyHistory({
  world,
  personId,
  onChoose,
  onInspect,
}: {
  world: LivingSettlementSnapshot;
  personId: number;
  onChoose: (id: number) => void;
  onInspect: (id: number, element: HTMLButtonElement) => void;
}) {
  const family = useMemo(() => residentLineage(world, personId), [world, personId]);
  const [direction, setDirection] = useState<LineageDirection>('descendants');
  const [query, setQuery] = useState('');
  const [requestedPage, setPage] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusPage = useRef(false);
  const matches = (family?.[direction] ?? []).filter((entry) =>
    `${residentName(entry.person)} #${entry.person.id}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(matches.length / LINEAGE_PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const shown = matches.slice(page * LINEAGE_PAGE_SIZE, (page + 1) * LINEAGE_PAGE_SIZE);
  useLayoutEffect(() => {
    if (!focusPage.current) return;
    focusPage.current = false;
    heading.current?.focus();
  }, [page]);
  if (!family) return null;
  return (
    <details className="resident-lineage">
      <summary>Recorded family across generations</summary>
      <p className="note">
        Follow recorded parent-child links. Earlier parentage may be unknown; shared names do not
        establish kinship.
      </p>
      <div className="lineage-controls">
        <label>
          Family direction
          <select
            value={direction}
            onChange={(event) => {
              setDirection(event.target.value as LineageDirection);
              setPage(0);
            }}
          >
            <option value="descendants">Descendants</option>
            <option value="ancestors">Ancestors</option>
          </select>
        </label>
        <label>
          Find in this lineage
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      <h4 tabIndex={-1} ref={heading}>
        {direction === 'ancestors' ? 'Recorded ancestors' : 'Recorded descendants'}
      </h4>
      <p className="note" aria-live="polite">
        {matches.length} recorded {matches.length === 1 ? direction.slice(0, -1) : direction} · page{' '}
        {page + 1} of {pages}. Each page shows up to {LINEAGE_PAGE_SIZE} people.
      </p>
      <ul className="lineage-list">
        {shown.map((entry) => {
          const via = direction === 'ancestors' ? entry.child : entry.parent;
          return (
            <li key={entry.person.id} data-lineage-person-id={entry.person.id}>
              <p>
                {lineageLabel(direction, entry.generation)} ·{' '}
                {entry.person.deathEventId === null ? 'living' : 'deceased'}
              </p>
              <button
                type="button"
                className="recap-link"
                data-lineage-open={entry.person.id}
                onClick={() => onChoose(entry.person.id)}
              >
                {residentName(entry.person)} · #{entry.person.id}
              </button>
              <p className="note">
                Known {direction === 'ancestors' ? 'parent' : 'child'} of {residentName(via)} · #
                {via.id}, recorded in{' '}
                <button
                  type="button"
                  className="recap-link"
                  data-resident-source-id={entry.birth.id}
                  onClick={(event) => onInspect(entry.birth.id, event.currentTarget)}
                >
                  the birth record at {dateLabel(entry.birth.tick)} · #{entry.birth.id}
                </button>
                .
              </p>
            </li>
          );
        })}
      </ul>
      {!matches.length && (
        <p>
          {query.trim()
            ? 'No recorded relatives match this search.'
            : `No ${direction} are recorded for this resident.`}
        </p>
      )}
      {pages > 1 && (
        <div className="control-row">
          <button
            type="button"
            className="secondary"
            disabled={page === 0}
            onClick={() => {
              focusPage.current = true;
              setPage(page - 1);
            }}
          >
            Previous relatives
          </button>
          <button
            type="button"
            className="secondary"
            disabled={page + 1 >= pages}
            onClick={() => {
              focusPage.current = true;
              setPage(page + 1);
            }}
          >
            Next relatives
          </button>
        </div>
      )}
    </details>
  );
}
