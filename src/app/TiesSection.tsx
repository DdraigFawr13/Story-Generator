// A realm's allies, pacts of defence, overlord and vassals: each tie with its years and the story
// events that made, tested and ended it. The ties are rebuilt from the record (ties.ts).

import { Fragment, useMemo, useState } from 'react';
import { yearText, type Id, type SimEvent } from '../engine';
import { Link, useLegends } from './legends-ctx';
import { tiesOf, type Tie } from './ties';

/** Ties listed before "show all". */
const TIES_SHOWN = 6;
/** Calls to arms listed under one alliance before "and n more". */
const CALLS_SHOWN = 3;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

export function TiesSection({ civId }: { civId: Id }) {
  const { world } = useLegends();
  const [all, setAll] = useState(false);
  const ties = useMemo(() => tiesOf(world, civId), [world, civId, world.events.length]);
  if (ties.length === 0) return null;
  const shown = all ? ties : ties.slice(-TIES_SHOWN);
  return (
    <>
      <div className="lg-sect">
        <span>Allies and vassals · {ties.length}</span>
        {ties.length > TIES_SHOWN && (
          <button type="button" className="lg-booklink" onClick={() => setAll(!all)}>
            {all ? 'Latest only' : `Show all ${ties.length}`}
          </button>
        )}
      </div>
      <ol className="lg-annals lg-ties" data-testid="realm-ties">
        {shown.map((tie) => (
          <TieItem key={tie.start} tie={tie} civId={civId} />
        ))}
      </ol>
    </>
  );
}

function TieItem({ tie, civId }: { tie: Tie; civId: Id }) {
  const { world, index } = useLegends();
  const other = tie.a === civId ? tie.b : tie.a;
  const name = (id: Id | undefined) => world.civs.get(id ?? -1)?.name ?? 'a realm';
  const civ = (id: Id | undefined) =>
    id === undefined || !world.civs.has(id) ? (
      'a realm'
    ) : (
      <>
        the <Link to={{ kind: 'civ', id }}>{name(id)}</Link>
      </>
    );
  const label =
    tie.kind === 'alliance'
      ? 'Allied with'
      : tie.kind === 'defence'
        ? 'Pact of defence with'
        : tie.b === civId
          ? 'Vassal of'
          : 'Overlord of';
  const word = tie.kind === 'alliance' ? 'alliance' : tie.kind === 'defence' ? 'pact' : 'tribute';
  const end: SimEvent | undefined = tie.end === undefined ? undefined : index.event(tie.end);

  const lines: { id: Id | undefined; year: number; text: React.ReactNode }[] = [];
  lines.push({ id: tie.start, year: tie.from, text: startText(tie, civId) });
  const calls = tie.calls.filter((c) => c.answered || c.event !== tie.end);
  for (const call of calls.slice(0, CALLS_SHOWN)) {
    lines.push({
      id: call.event,
      year: call.year,
      text: (
        <>
          The {name(call.ally)} answered the call against{' '}
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
    const refused = tie.calls.find((c) => c.event === tie.end);
    let text: React.ReactNode;
    switch (tie.ended) {
      case 'refused':
        text = (
          <>
            The {name(tie.by)} refused the call against{' '}
            {refused?.enemyId === undefined ? (refused?.enemy ?? 'a foe') : civ(refused.enemyId)},
            and the alliance ended.
          </>
        );
        break;
      case 'betrayed': {
        const how = typeof end?.data.outcomeShort === 'string' ? end.data.outcomeShort : '';
        text = (
          <>
            The {name(tie.by)} broke the oath{how ? ` and ${how}` : ''}.
          </>
        );
        break;
      }
      case 'war':
        text = <>The two went to war, and the {word} ended.</>;
        break;
      case 'knelt': {
        const lord = typeof end?.data.overlord === 'string' ? end.data.overlord : undefined;
        text = (
          <>
            The alliance lapsed when the {name(tie.by)} knelt{lord ? ` to the ${lord}` : ''}.
          </>
        );
        break;
      }
      case 'revolt':
        text = (
          <>
            The {name(tie.b)} rose against {civ(tie.a)} after{' '}
            {plural(tie.to - tie.from, 'a year', 'years')}.
          </>
        );
        break;
      case 'freed':
        text = (
          <>
            The {name(tie.a)} fell, and the {name(tie.b)} went free.
          </>
        );
        break;
      case 'fell':
        text = (
          <>
            The {name(tie.by)} fell, and the {word} ended with it.
          </>
        );
        break;
    }
    lines.push({ id: tie.end, year: tie.to, text });
  }

  return (
    <li data-tie={tie.kind}>
      <div className="era">
        <strong>{label}</strong> {civ(other)}{' '}
        <span className="yrs">
          {tie.to === undefined
            ? `since ${yearText(tie.from)}`
            : `${yearText(tie.from)}–${yearText(tie.to)}`}
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

  function startText(t: Tie, me: Id): React.ReactNode {
    if (t.kind === 'alliance') {
      const why = t.why ?? '';
      return why.startsWith('sealed') ? (
        <>{cap(why)}.</>
      ) : (
        <Fragment>Sworn{why ? ` ${why}` : ''}.</Fragment>
      );
    }
    if (t.kind === 'defence') return <>Sworn to stand together against any attacker.</>;
    const lost = t.sites === undefined ? '' : plural(t.sites, 'a place', 'places');
    return t.b === me ? (
      <>Beaten in war{lost ? `, it gave up ${lost}` : ''} and knelt, paying tribute each year.</>
    ) : (
      <>
        Took them as vassals after a war{lost ? ` that won ${lost}` : ''}, with tribute each year.
      </>
    );
  }
}
