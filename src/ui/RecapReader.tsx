import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  buildRecap,
  completedPeriods,
  periodWeeks,
  periodTitle,
  type RecapKind,
  type RecapPeriod,
} from '../controller/recaps';
import { dateLabel, headline } from '../controller/chronicle';
import type { SettlementSnapshot } from '../controller/world';

export function RecapReader({
  world,
  period,
  visible,
  canContinue,
  onChoose,
  onInspect,
  onClose,
  onContinue,
}: {
  world: SettlementSnapshot;
  period: RecapPeriod;
  visible: boolean;
  canContinue: boolean;
  onChoose: (period: RecapPeriod) => void;
  onInspect: (eventId: number) => void;
  onClose: () => void;
  onContinue: () => void;
}) {
  const recap = useMemo(() => buildRecap(world, period), [world, period.kind, period.endTick]);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const readingPosition = useRef(0);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const pagePosition = useRef(0);
  const previousPeriod = useRef('');
  const number = period.endTick / periodWeeks(period.kind);
  const maximum = completedPeriods(world.tick, period.kind);
  const [jump, setJump] = useState(String(number));
  const [error, setError] = useState('');
  useEffect(() => {
    setJump(String(number));
    setError('');
  }, [number, period.kind]);
  useLayoutEffect(() => {
    if (!visible) return;
    const key = `${period.kind}:${period.endTick}`;
    if (previousPeriod.current !== key) {
      previousPeriod.current = key;
      readingPosition.current = 0;
      returnFocus.current = null;
    }
    const desktop = window.matchMedia('(min-width: 761px)').matches;
    const scroller = desktop ? body.current : panel.current;
    if (scroller) scroller.scrollTop = readingPosition.current;
    if (desktop && returnFocus.current) window.scrollTo({ top: pagePosition.current });
    const target = returnFocus.current ?? heading.current;
    target?.focus({ preventScroll: true });
    if (desktop && !returnFocus.current) heading.current?.scrollIntoView({ block: 'nearest' });
    returnFocus.current = null;
  }, [visible, period.kind, period.endTick]);
  function inspect(id: number, button: HTMLButtonElement) {
    readingPosition.current =
      (window.matchMedia('(min-width: 761px)').matches ? body.current : panel.current)?.scrollTop ??
      0;
    pagePosition.current = window.scrollY;
    returnFocus.current = button;
    onInspect(id);
  }
  function choose(kind: RecapKind, index: number) {
    onChoose({ kind, endTick: index * periodWeeks(kind) });
  }
  return (
    <section
      className="recap-reader"
      ref={panel}
      aria-label="Historical recap"
      hidden={!visible}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="recap-heading">
        <div>
          <p className="eyebrow">{world.world.settlement.name} · From the settlement chronicle</p>
          <h2 tabIndex={-1} ref={heading}>
            {periodTitle(period)}
          </h2>
        </div>
        <button type="button" className="secondary" onClick={onClose}>
          Close recap
        </button>
      </div>
      <details className="recap-history">
        <summary>Browse history</summary>
        <p className="recap-range">
          Completed weeks {recap.startTick}–{recap.endTick}. The world is paused at week{' '}
          {world.tick}.
        </p>
        <div className="recap-navigation" aria-label="Recap history">
          <label>
            Recap period
            <select
              value={period.kind}
              onChange={(event) => {
                const kind = event.target.value as RecapKind;
                choose(
                  kind,
                  Math.max(
                    1,
                    Math.min(
                      completedPeriods(world.tick, kind),
                      Math.floor(period.endTick / periodWeeks(kind)),
                    ),
                  ),
                );
              }}
            >
              <option value="yearly" disabled={completedPeriods(world.tick, 'yearly') === 0}>
                Yearly
              </option>
              <option value="seasonal">Seasonal</option>
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            disabled={number === 1}
            onClick={() => choose(period.kind, number - 1)}
          >
            Previous period
          </button>
          <button
            type="button"
            className="secondary"
            disabled={number === maximum}
            onClick={() => choose(period.kind, number + 1)}
          >
            Next period
          </button>
          <button
            type="button"
            className="secondary"
            disabled={number === maximum}
            onClick={() => choose(period.kind, maximum)}
          >
            Latest period
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const index = Number(jump);
              if (jump && Number.isSafeInteger(index) && index >= 1 && index <= maximum) {
                setError('');
                choose(period.kind, index);
              } else setError(`Choose a period from 1 to ${maximum}.`);
            }}
          >
            <label>
              {period.kind === 'yearly' ? 'Year number' : 'Season number'}
              <input
                type="number"
                min="1"
                max={maximum}
                value={jump}
                onChange={(event) => setJump(event.target.value)}
              />
            </label>
            <button type="submit" className="secondary">
              Read period
            </button>
          </form>
        </div>
      </details>
      {error && <p role="alert">{error}</p>}
      <div className="recap-body" ref={body} tabIndex={0} aria-label="Recap prose and sources">
        <div className="recap-prose">
          {recap.paragraphs.map((paragraph, index) => (
            <p key={index}>
              {paragraph.tokens.map((token, position) =>
                token.kind === 'text' ? (
                  token.text
                ) : (
                  <button
                    key={position}
                    type="button"
                    className="recap-link"
                    data-record-id={token.eventId}
                    onClick={(event) => inspect(token.eventId, event.currentTarget)}
                  >
                    {token.text}
                  </button>
                ),
              )}
            </p>
          ))}
        </div>
        {recap.sourceIds.length > 0 && (
          <details className="recap-sources">
            <summary>Supporting records ({recap.sourceIds.length})</summary>
            <p>
              Totals combine the records below. Follow a record to inspect its facts and causes.
            </p>
            <ul>
              {recap.sourceIds.map((id) => {
                const event = world.events[id - 1]!;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={(click) => inspect(id, click.currentTarget)}
                    >
                      {dateLabel(event.tick)} · #{id}: {headline(event)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
      <div className="recap-footer">
        <p>Reading and inspection keep the world paused.</p>
        <button type="button" disabled={!canContinue} onClick={onContinue}>
          Continue watching
        </button>
      </div>
    </section>
  );
}
