// A realm's allies, overlord and vassals: each tie with its years and the story events that made,
// tested and ended it, then its free cities' pacts of defence on one quiet line. The ties are
// rebuilt from the record (ties.ts).

import { Fragment, useMemo, useState } from 'react';
import { yearText, type Id, type SimEvent } from '../engine';
import { Link, useLegends } from './legends-ctx';
import { tiesOf, type Tie, type TieEnd } from './ties';

/** Alliances and vassalages listed before "show all"; vassalages and ties still holding always show. */
const TIES_SHOWN = 6;
/** Calls to arms listed under one alliance before "and n more". */
const CALLS_SHOWN = 3;
/** Pacts of defence named before "and n more". */
const PACTS_SHOWN = 8;

/** The short ending beside a tie's years. */
const ENDING: Record<TieEnd, string> = {
  refused: 'ended at a refused call',
  betrayed: 'oath broken',
  war: 'ended in war',
  knelt: 'lapsed',
  revolt: 'ended in revolt',
  freed: "ended with the overlord's fall",
  fell: 'ended with a fall',
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

function years(tie: Tie): string {
  return tie.to === undefined
    ? `since ${yearText(tie.from)}`
    : `${yearText(tie.from)}–${yearText(tie.to)}`;
}

export function TiesSection({ civId }: { civId: Id }) {
  const { world, year } = useLegends();
  const [all, setAll] = useState(false);
  const ties = useMemo(() => tiesOf(world, civId), [world, civId, world.events.length]);
  const main = ties.filter((t) => t.kind !== 'defence');
  const pacts = ties.filter((t) => t.kind === 'defence');
  if (ties.length === 0) return null;
  // Vassalages and ties still holding always show; the newest others fill up to the limit.
  const keep = new Set(main.filter((t) => t.kind === 'vassal' || t.to === undefined));
  for (let k = main.length - 1; k >= 0 && keep.size < TIES_SHOWN; k -= 1) keep.add(main[k]!);
  const shown = all ? main : main.filter((t) => keep.has(t));
  const pactsShown = all ? pacts : pacts.slice(-PACTS_SHOWN);
  const more = main.length - shown.length + pacts.length - pactsShown.length;
  return (
    <>
      <div className="lg-sect">
        <span>Allies and vassals · {main.length}</span>
        {(more > 0 || all) && (
          <button type="button" className="lg-booklink" onClick={() => setAll(!all)}>
            {all ? 'Fewer' : `Show all ${main.length + pacts.length}`}
          </button>
        )}
      </div>
      {shown.length > 0 && (
        <ol className="lg-annals lg-ties" data-testid="realm-ties">
          {shown.map((tie) => (
            <TieItem key={tie.start} tie={tie} civId={civId} later={tie.from > year} />
          ))}
        </ol>
      )}
      {pacts.length > 0 && (
        <p className="lg-pacts" data-testid="realm-pacts">
          <strong>Pacts of defence</strong> · {pacts.length}:{' '}
          {pactsShown.map((tie, k) => {
            const other = tie.a === civId ? tie.b : tie.a;
            return (
              <Fragment key={tie.start}>
                {k > 0 && ', '}
                <span className={tie.from > year ? 'later' : undefined}>
                  <Link to={{ kind: 'civ', id: other }}>
                    {world.civs.get(other)?.name ?? 'a realm'}
                  </Link>{' '}
                  <span className="yrs">({years(tie)})</span>
                </span>
              </Fragment>
            );
          })}
          {pacts.length > pactsShown.length && ` and ${pacts.length - pactsShown.length} more`}
        </p>
      )}
    </>
  );
}

function TieItem({ tie, civId, later }: { tie: Tie; civId: Id; later: boolean }) {
  const { world, index } = useLegends();
  const other = tie.a === civId ? tie.b : tie.a;
  const name = (id: Id | undefined) => world.civs.get(id ?? -1)?.name ?? 'a realm';
  /** A realm as a linked noun phrase; the page's own realm is "it". */
  const civ = (id: Id | undefined) =>
    id === civId ? (
      'it'
    ) : id === undefined || !world.civs.has(id) ? (
      'a realm'
    ) : (
      <>
        the <Link to={{ kind: 'civ', id }}>{name(id)}</Link>
      </>
    );
  /** A realm opening a sentence: "It" for the page's own realm, else "The X". */
  const subject = (id: Id | undefined) => (id === civId ? 'It' : `The ${name(id)}`);
  const label =
    tie.kind === 'alliance' ? 'Allied with' : tie.b === civId ? 'Vassal of' : 'Overlord of';
  const end: SimEvent | undefined = tie.end === undefined ? undefined : index.event(tie.end);

  const lines: { id: Id | undefined; year: number; text: React.ReactNode }[] = [];
  lines.push({ id: tie.start, year: tie.from, text: startText() });
  const calls = tie.calls.filter((c) => c.answered || c.event !== tie.end);
  for (const call of calls.slice(0, CALLS_SHOWN)) {
    lines.push({
      id: call.event,
      year: call.year,
      text: (
        <>
          {subject(call.ally)} answered the call against{' '}
          {call.enemyId === undefined ? call.enemy : civ(call.enemyId)}.
        </>
      ),
    });
  }
  if (calls.length > CALLS_SHOWN) {
    lines.push({
      id: undefined,
      year: tie.from,
      text: `and ${plural(calls.length - CALLS_SHOWN, 'one more call', 'more calls')} answered`,
    });
  }
  if (tie.ended !== undefined && tie.to !== undefined) {
    lines.push({ id: tie.end, year: tie.to, text: endText(tie.ended) });
  }

  return (
    <li data-tie={tie.kind} className={later ? 'later' : undefined}>
      <div className="era">
        <strong>{label}</strong> {civ(other)}{' '}
        <span className="yrs">
          {years(tie)}
          {tie.ended !== undefined && `, ${ENDING[tie.ended]}`}
        </span>
      </div>
      <ul>
        {lines.map((line, k) => (
          <li key={k}>
            {line.id === undefined ? (
              <span className="yrs">{'…'}</span>
            ) : (
              <Link
                to={{ kind: 'event', id: line.id }}
                className="lg-evlink"
                title="Open this event"
              >
                {yearText(line.year)}
              </Link>
            )}{' '}
            {line.text}
          </li>
        ))}
      </ul>
    </li>
  );

  function startText(): React.ReactNode {
    if (tie.kind === 'alliance') {
      const why = tie.why ?? '';
      return why.startsWith('sealed') ? (
        <>{why.charAt(0).toUpperCase() + why.slice(1)}.</>
      ) : (
        <>Sworn{why ? ` ${why}` : ''}.</>
      );
    }
    const lost = tie.sites === undefined ? '' : plural(tie.sites, 'a place', 'places');
    return tie.b === civId ? (
      <>Beaten in war{lost ? `, it gave up ${lost}` : ''} and knelt, paying tribute each year.</>
    ) : (
      <>
        Took them as vassals after a war{lost ? ` that won ${lost}` : ''}, with tribute each year.
      </>
    );
  }

  function endText(ended: TieEnd): React.ReactNode {
    const word = tie.kind === 'alliance' ? 'alliance' : 'tribute';
    switch (ended) {
      case 'refused': {
        const call = tie.calls.find((c) => c.event === tie.end);
        return (
          <>
            {subject(tie.by)} refused the call against{' '}
            {call?.enemyId === undefined ? (call?.enemy ?? 'a foe') : civ(call.enemyId)}, and the
            alliance ended.
          </>
        );
      }
      case 'betrayed': {
        const how = typeof end?.data.outcomeShort === 'string' ? end.data.outcomeShort : '';
        const victim = tie.by === tie.a ? tie.b : tie.a;
        // "marched on them" names the victim plainly; any other outcome reads as it is.
        return how.startsWith('marched') ? (
          <>
            {subject(tie.by)} broke the oath and marched on {civ(victim)}.
          </>
        ) : (
          <>
            {subject(tie.by)} broke the oath to {civ(victim)}
            {how ? ` and ${how}` : ''}.
          </>
        );
      }
      case 'war':
        return <>The two went to war, and the alliance ended.</>;
      case 'knelt': {
        const lord = typeof end?.data.overlord === 'string' ? end.data.overlord : undefined;
        return (
          <>
            The alliance lapsed when {tie.by === civId ? 'it' : `the ${name(tie.by)}`} knelt
            {lord ? ` to the ${lord}` : ''}.
          </>
        );
      }
      case 'revolt':
        return (
          <>
            {subject(tie.b)} rose against {civ(tie.a)} after{' '}
            {plural(tie.to! - tie.from, 'a year', 'years')}.
          </>
        );
      case 'freed':
        return (
          <>
            {subject(tie.a)} fell, and {tie.b === civId ? 'it' : `the ${name(tie.b)}`} went free.
          </>
        );
      case 'fell':
        return (
          <>
            {subject(tie.by)} fell, and the {word} ended with it.
          </>
        );
    }
  }
}
