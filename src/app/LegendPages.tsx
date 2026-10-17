// Legends pages (M2.7): one page per entity, race and event, with the chronicle lines under it.
// Every name is a link; every line can unfold the causes behind it, a few levels deep.

import { Fragment, useMemo, useState } from 'react';
import {
  annals,
  battleOf,
  biography,
  eventTitle,
  eventYear,
  importanceStars,
  linkSegments,
  locate,
  playByPlay,
  typeLabel,
  yearText,
  type Id,
  type LegendRef,
  type SimEvent,
} from '../engine';
import { allOrders, memberWord, personOrder, type OrderInfo } from './orders';
import { allPlaces, dangerWord, emptiedBy, outcomeText, placeWhat } from './places';
import { WatchCard } from './EmbarkCards';
import { TiesSection } from './TiesSection';
import { standingAt } from './ties';
import {
  KIND_LABEL,
  Link,
  cap,
  count,
  plainClick,
  plural,
  spanFact,
  spanText,
  useLegends,
  type PageRef,
} from './legends-ctx';

/** Famous figures shown on a race page. */
const RACE_FIGURES = 6;
/** Names listed on a page before "and n more". */
const MEMBERS_SHOWN = 12;
const PLACES_SHOWN = 8;
/** Sibling events listed on an event page. */
const SIBLINGS_SHOWN = 8;
/** The inline "why?" tree stops this many levels below a page's own lines. */
const MAX_TREE_DEPTH = 3;
/** Chronicle items rendered at a time in "every event" mode. */
const CHRONICLE_WINDOW = 200;
/** Events under this importance may be folded into a run. */
const LOW_IMPORTANCE = 3;
/** A run of at least this many low events of one type and place folds into one line. */
const MIN_RUN = 3;

/** The relation word a cause carries, from the event it caused. */
function useCauseWord() {
  const { content } = useLegends();
  const words = useMemo(
    () => new Map(content.eventTypes.map((def) => [def.id, def.causeWord ?? 'after'])),
    [content],
  );
  return (event: SimEvent) => words.get(event.type) ?? 'after';
}

function Stars({ importance }: { importance: number }) {
  const stars = importanceStars(importance);
  if (!stars) return null;
  return (
    <span
      className="stars"
      role="img"
      title={`importance ${importance}`}
      aria-label={`importance ${importance}`}
    >
      {stars}
    </span>
  );
}

/** An event's rendered sentence with every known name a link. */
function EventText({ event }: { event: SimEvent }) {
  const { index, textOf, nameOf } = useLegends();
  const segments = linkSegments(
    textOf(event),
    index.refs(event.id).map((ref) => ({ ref, name: nameOf(ref) })),
  );
  return (
    <>
      {segments.map((segment, k) =>
        segment.ref ? (
          <Link key={k} to={segment.ref}>
            {segment.text}
          </Link>
        ) : (
          <Fragment key={k}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

export function EventLink({ id, children }: { id: Id; children: React.ReactNode }) {
  return (
    <Link to={{ kind: 'event', id }} className="lg-evlink" title="Open this event">
      {children}
    </Link>
  );
}

interface ChronProps {
  ids: readonly Id[];
  empty: string;
  /** Levels below the page's own lines (0 for the page list itself). */
  depth?: number;
  /** The event these are the causes of (their relation word comes from its type). */
  parent?: SimEvent | undefined;
  /** Unfold every "why?" down to the cap. */
  autoOpen?: boolean | undefined;
}

/** A list of chronicle lines, with a note when the year lock dims some of them. */
export function Chronicle({ ids, empty, depth = 0, parent, autoOpen }: ChronProps) {
  const { index, year, locked } = useLegends();
  if (ids.length === 0) return empty ? <p className="lg-empty flush">{empty}</p> : null;
  const dimmed =
    depth === 0 &&
    locked &&
    ids.some((id) => {
      const event = index.event(id);
      return event !== undefined && eventYear(event) > year;
    });
  return (
    <>
      {dimmed && <DimNote />}
      <ul className={depth > 0 ? 'lg-tree' : 'lg-chron'}>
        {ids.map((id) => (
          <EventLine key={id} id={id} depth={depth} parent={parent} autoOpen={autoOpen} />
        ))}
      </ul>
    </>
  );
}

function DimNote() {
  const { year } = useLegends();
  return <p className="lg-dim">Dimmed: after Year {yearText(year)} (year locked).</p>;
}

/** The play-by-play beats of an epic fight (none for other events). */
function useBeats(event: SimEvent | undefined): string[] {
  const { world, content, index } = useLegends();
  return useMemo(
    () => (event ? playByPlay(world, content, index, event) : []),
    [world, content, index, event],
  );
}

/** One chronicle line: year link, linked names, and a "why?" that unfolds its causes. */
function EventLine({
  id,
  depth,
  parent,
  autoOpen,
  dot,
}: {
  id: Id;
  depth: number;
  parent?: SimEvent | undefined;
  autoOpen?: boolean | undefined;
  /** The type group's id, for the colour dot in "every event" mode. */
  dot?: string;
}) {
  const { index, year, locked, open, hrefOf } = useLegends();
  const causeWord = useCauseWord();
  const [unfolded, setUnfolded] = useState(Boolean(autoOpen) && depth < MAX_TREE_DEPTH);
  const [fightOpen, setFightOpen] = useState(false);
  const event = index.event(id);
  const beats = useBeats(event);
  if (!event) return null;
  const when = eventYear(event);
  const causes = event.causes.filter((cause) => index.event(cause) !== undefined);
  return (
    <li className={locked && when > year ? 'lg-ev future' : 'lg-ev'}>
      <span className="y">
        {dot !== undefined && <i className={`gd g-${dot}`} aria-hidden="true" />}
        <EventLink id={id}>{yearText(when)}</EventLink>
      </span>
      <span className="txt">
        {parent && <span className="rel">{causeWord(parent)}</span>}
        <EventText event={event} />
        {causes.length > 0 &&
          (depth < MAX_TREE_DEPTH ? (
            <button
              type="button"
              className="lg-why"
              aria-expanded={unfolded}
              onClick={() => setUnfolded(!unfolded)}
            >
              why?{causes.length > 1 ? ` (${causes.length})` : ''}
            </button>
          ) : (
            <a
              className="lg-why"
              href={hrefOf({ kind: 'event', id })}
              onClick={(click) => plainClick(click, () => open({ kind: 'event', id }))}
            >
              open this event →
            </a>
          ))}
        {beats.length > 0 && (
          <button
            type="button"
            className="lg-why"
            aria-expanded={fightOpen}
            onClick={() => setFightOpen(!fightOpen)}
          >
            the fight {fightOpen ? '▾' : '▸'}
          </button>
        )}
        {fightOpen && <Beats beats={beats} />}
        {unfolded && (
          <Chronicle ids={causes} empty="" depth={depth + 1} parent={event} autoOpen={autoOpen} />
        )}
      </span>
    </li>
  );
}

/** Every event of an entity, by decade, with type dots and folded runs of minor repeats. */
export function AllEvents({ ids }: { ids: readonly Id[] }) {
  const { index, content, titleOf, year, locked } = useLegends();
  const [group, setGroup] = useState('');
  const [limit, setLimit] = useState(CHRONICLE_WINDOW);
  const [openRuns, setOpenRuns] = useState<ReadonlySet<Id>>(new Set());
  const groups = content.typeGroups ?? [];
  const groupOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) for (const type of g.types) map.set(type, g.id);
    return map;
  }, [groups]);

  type Item = { head: SimEvent; ids: Id[] };
  const items = useMemo(() => {
    const out: Item[] = [];
    let last: SimEvent | undefined;
    for (const id of ids) {
      const event = index.event(id);
      if (!event || (group !== '' && groupOf.get(event.type) !== group)) continue;
      const tail = out[out.length - 1];
      const foldable =
        last !== undefined &&
        tail !== undefined &&
        event.importance < LOW_IMPORTANCE &&
        last.importance < LOW_IMPORTANCE &&
        event.type === last.type &&
        event.place === last.place;
      if (foldable) tail.ids.push(id);
      else out.push({ head: event, ids: [id] });
      last = event;
    }
    return out;
  }, [ids, index, group, groupOf]);

  const shown = items.slice(0, limit);
  const decades: { decade: number; items: Item[] }[] = [];
  for (const item of shown) {
    const decade = Math.floor(eventYear(item.head) / 10) * 10;
    const tail = decades[decades.length - 1];
    if (tail && tail.decade === decade) tail.items.push(item);
    else decades.push({ decade, items: [item] });
  }
  const dimmed = locked && shown.some((item) => eventYear(item.head) > year);
  return (
    <>
      <div className="lg-filters">
        <label>
          Type{' '}
          <select
            value={group}
            onChange={(event) => {
              setGroup(event.target.value);
              setLimit(CHRONICLE_WINDOW);
            }}
          >
            <option value="">All types</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <span className="lg-key" aria-label="Year gutter dots">
          {groups.map((g) => (
            <span key={g.id}>
              <i className={`gd g-${g.id}`} aria-hidden="true" />
              {g.label}
            </span>
          ))}
        </span>
      </div>
      {dimmed && <DimNote />}
      {items.length === 0 && <p className="lg-empty flush">No events of that type.</p>}
      {decades.map(({ decade, items: rows }) => (
        <section key={decade} className="lg-decade">
          <h4>{yearText(decade)}s</h4>
          <ul className="lg-chron">
            {rows.map(({ head, ids: run }) => {
              const dot = groupOf.get(head.type) ?? 'none';
              if (run.length < MIN_RUN) {
                return run.map((id) => <EventLine key={id} id={id} depth={0} dot={dot} />);
              }
              const last = index.event(run[run.length - 1]!)!;
              const unfolded = openRuns.has(head.id);
              return (
                <Fragment key={head.id}>
                  <li className="lg-ev run">
                    <span className="y">
                      <i className={`gd g-${dot}`} aria-hidden="true" />
                      <EventLink id={head.id}>{yearText(eventYear(head))}</EventLink>
                    </span>
                    <span className="txt">
                      {titleOf(head)} ×{run.length}, {yearText(eventYear(head))}
                      {'–'}
                      {yearText(eventYear(last))}
                      <button
                        type="button"
                        className="lg-why"
                        aria-expanded={unfolded}
                        onClick={() => {
                          const next = new Set(openRuns);
                          if (unfolded) next.delete(head.id);
                          else next.add(head.id);
                          setOpenRuns(next);
                        }}
                      >
                        {unfolded ? 'fold' : 'show'}
                      </button>
                    </span>
                  </li>
                  {unfolded && run.map((id) => <EventLine key={id} id={id} depth={0} dot={dot} />)}
                </Fragment>
              );
            })}
          </ul>
        </section>
      ))}
      {items.length > limit && (
        <button
          type="button"
          className="lg-more"
          onClick={() => setLimit(limit + CHRONICLE_WINDOW)}
        >
          Show {CHRONICLE_WINDOW} more ({count(limit)} of {count(items.length)})
        </button>
      )}
    </>
  );
}

export function PageView({
  page,
  all,
  onAll,
  bare,
}: {
  page: PageRef;
  all: boolean;
  onAll: (all: boolean) => void;
  /** Only the chronicle: the page above it (a house's tree) already shows the name and facts. */
  bare?: boolean;
}) {
  if (page.kind === 'event') return <EventPage id={page.id} />;
  if (page.kind === 'race') return <RacePage id={page.id} />;
  if (page.kind === 'place') return <PlacePage id={page.id} />;
  if (page.kind === 'order') return <OrderPage id={page.id} />;
  return <EntityPage page={page} all={all} onAll={onAll} bare={bare ?? false} />;
}

type Fact = [string, React.ReactNode];

const orderRefs = (orders: readonly OrderInfo[]) =>
  orders.map((o) => ({ to: { kind: 'order', id: o.id } as PageRef, label: cap(o.name) }));

function Facts({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="lg-facts">
      {facts.map(([term, value]) => (
        <Fragment key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Links separated by commas, at most `limit` of them, then "and n more". */
function LinkList({ refs, limit }: { refs: { to: PageRef; label: string }[]; limit: number }) {
  return (
    <>
      {refs.slice(0, limit).map((r, k) => (
        <Fragment key={`${r.to.kind}:${r.to.id}`}>
          {k > 0 && ', '}
          <Link to={r.to}>{r.label}</Link>
        </Fragment>
      ))}
      {refs.length > limit && ` and ${refs.length - limit} more`}
    </>
  );
}

function EntityPage({
  page,
  all: showAll,
  onAll,
  bare,
}: {
  page: LegendRef;
  all: boolean;
  onAll: (all: boolean) => void;
  bare: boolean;
}) {
  const { world, index, content, narrator, year, finalYear, sitesAt, onShow, siteActions } =
    useLegends();
  const bio = biography(world, content, narrator, index, page);
  const cell = locate(world, page);
  const every = index.events(page);
  const facts: Fact[] = [];
  const at = `Year ${yearText(year)}`;
  if (page.kind === 'civ') {
    const civ = world.civs.get(page.id)!;
    if (civ.fell !== undefined) facts.push(['Fell', `Year ${yearText(civ.fell)}`]);
    const held = [...sitesAt]
      .filter(([, s]) => s.civId === civ.id && !s.ruined)
      .map(([id, s]) => ({ id, pop: s.pop, name: world.sites.get(id)?.name ?? '?' }))
      .sort((a, b) => b.pop - a.pop || a.id - b.id);
    if (held.length > 0) {
      facts.push([
        year === finalYear ? 'Holds now' : `Held at ${at}`,
        <>
          {held.length} {plural(held.length, 'place', 'places')}:{' '}
          <LinkList
            refs={held.map((h) => ({ to: { kind: 'site', id: h.id }, label: h.name }))}
            limit={PLACES_SHOWN}
          />
        </>,
      ]);
    }
    const ruler = rulerAt(civ.id, year);
    if (ruler) {
      facts.push(['Ruler', <Link to={{ kind: 'person', id: ruler.id }}>{ruler.name}</Link>]);
    }
    const standing = standingAt(world, civ.id, year);
    if (standing.overlord !== undefined) {
      const lord = world.civs.get(standing.overlord)!;
      facts.push([
        'Vassal of',
        <>
          <Link to={{ kind: 'civ', id: lord.id }}>{lord.name}</Link>
          {standing.since !== undefined && ` since Year ${yearText(standing.since)}`}
        </>,
      ]);
    }
    const civRefs = (ids: Id[]) =>
      ids.flatMap((id) => {
        const c = world.civs.get(id);
        return c ? [{ to: { kind: 'civ', id } as PageRef, label: c.name }] : [];
      });
    if (standing.vassals.length > 0) {
      facts.push(['Vassals', <LinkList refs={civRefs(standing.vassals)} limit={PLACES_SHOWN} />]);
    }
    if (standing.allies.length > 0) {
      facts.push(['Allies', <LinkList refs={civRefs(standing.allies)} limit={PLACES_SHOWN} />]);
    }
    const enemies = warsAt(civ.id, year);
    if (enemies.length > 0) {
      facts.push([
        'At war with',
        <LinkList
          refs={enemies.map((e) => ({ to: { kind: 'civ', id: e.id }, label: e.name }))}
          limit={PLACES_SHOWN}
        />,
      ]);
    }
    const orders = allOrders(world, content).filter((o) => o.civId === civ.id && o.founded <= year);
    const standingOrders = orders.filter((o) => o.ended === undefined || o.ended > year);
    const formerOrders = orders.filter((o) => o.ended !== undefined && o.ended <= year);
    if (standingOrders.length > 0)
      facts.push(['Orders', <LinkList refs={orderRefs(standingOrders)} limit={PLACES_SHOWN} />]);
    if (formerOrders.length > 0)
      facts.push([
        'Former orders',
        <LinkList refs={orderRefs(formerOrders)} limit={PLACES_SHOWN} />,
      ]);
  } else if (page.kind === 'site') {
    const site = world.sites.get(page.id)!;
    const state = sitesAt.get(site.id);
    const owner = state?.civId == null ? undefined : world.civs.get(state.civId);
    facts.push([
      'Status',
      state === undefined
        ? `not yet founded at ${at}`
        : state.ruined
          ? `ruined at ${at}`
          : `standing at ${at}`,
    ]);
    if (state && !state.ruined) {
      facts.push(
        [
          'Held by',
          owner ? <Link to={{ kind: 'civ', id: owner.id }}>{owner.name}</Link> : 'no people',
        ],
        ['Population', `${count(state.pop)} at ${at}; peak population ${count(site.peakPop)}`],
      );
    } else {
      facts.push(['Peak', `peak population ${count(site.peakPop)}`]);
    }
    const seats = allOrders(world, content).filter(
      (o) => o.siteId === site.id && o.founded <= year && (o.ended === undefined || o.ended > year),
    );
    if (seats.length > 0)
      facts.push(['Seat of', <LinkList refs={orderRefs(seats)} limit={PLACES_SHOWN} />]);
  } else if (page.kind === 'person') {
    const person = world.people.get(page.id)!;
    facts.push([
      'Life',
      year < person.born
        ? `not yet born at ${at}`
        : person.died !== undefined && person.died <= year
          ? `dead at ${at} (${spanFact(person.born, person.died)})`
          : `alive at ${at} (born ${yearText(person.born)}${
              person.died === undefined ? '' : `, died ${yearText(person.died)}`
            })`,
    ]);
    const civ = person.civId == null ? undefined : world.civs.get(person.civId);
    if (civ) facts.push(['Serves', <Link to={{ kind: 'civ', id: civ.id }}>{civ.name}</Link>]);
    const sworn = personOrder(allOrders(world, content), person.id);
    if (sworn) {
      facts.push([
        sworn.title.replace(/ of$/, ''),
        <Link to={{ kind: 'order', id: sworn.order.id }}>{cap(sworn.order.name)}</Link>,
      ]);
    }
    const house =
      person.dynastyId === undefined ? undefined : world.dynasties.get(person.dynastyId);
    if (house)
      facts.push(['Family', <Link to={{ kind: 'dynasty', id: house.id }}>{house.name}</Link>]);
    const home = person.siteId == null ? undefined : world.sites.get(person.siteId);
    if (home) facts.push(['Home', <Link to={{ kind: 'site', id: home.id }}>{home.name}</Link>]);
    facts.push(['Renown', `fame ${person.fame}`]);
  } else if (page.kind === 'dynasty') {
    const dynasty = world.dynasties.get(page.id)!;
    const members = [...world.people.values()].filter((p) => p.dynastyId === dynasty.id);
    facts.push(
      [
        'Founder',
        <Link to={{ kind: 'person', id: dynasty.founderId }}>
          {world.people.get(dynasty.founderId)?.name ?? '?'}
        </Link>,
      ],
      ['Founded', `Year ${yearText(dynasty.founded)}`],
      [
        'Members',
        <LinkList
          refs={members.map((p) => ({ to: { kind: 'person', id: p.id }, label: p.name }))}
          limit={MEMBERS_SHOWN}
        />,
      ],
    );
  } else if (page.kind === 'beast') {
    const beast = world.creatures.get(page.id)!;
    facts.push(
      ['Kind', content.creatures.find((def) => def.id === beast.defId)?.name ?? beast.defId],
      ['Lived', spanFact(beast.born, beast.died)],
    );
  } else {
    const item = world.items.get(page.id)!;
    facts.push(['Kind', `${item.kind} · ${item.form}`], ['Made', `Year ${yearText(item.made)}`]);
    const holder = item.holder === null ? undefined : world.people.get(item.holder);
    if (holder) {
      facts.push(['Held by', <Link to={{ kind: 'person', id: holder.id }}>{holder.name}</Link>]);
    }
  }

  const lines = showAll ? every : bio.lines.map((line) => line.eventId);

  /** The newest ruler named by a succession up to `y`, or the sitting one in the final year. */
  function rulerAt(civId: Id, y: number) {
    const civ = world.civs.get(civId)!;
    if (civ.fell !== undefined && civ.fell <= y) return undefined;
    if (y === finalYear && civ.rulerId !== undefined) return world.people.get(civ.rulerId);
    for (let k = every.length - 1; k >= 0; k -= 1) {
      const event = index.event(every[k]!);
      if (event?.type !== 'ruler_succeeded' || eventYear(event) > y) continue;
      const found = event.actors.find((a) => world.people.get(a)?.name === event.data.ruler);
      if (found !== undefined) return world.people.get(found);
    }
    return undefined;
  }
  /** Enemies of a civ in year `y`: wars declared by or against it and not yet made peace. */
  function warsAt(civId: Id, y: number) {
    const civ = world.civs.get(civId)!;
    const open = new Map<string, Id>();
    for (const id of every) {
      const event = index.event(id);
      if (!event || eventYear(event) > y) continue;
      if (event.type !== 'war_declared' && event.type !== 'peace_made') continue;
      const other = event.data.civ === civ.name ? event.data.enemy : event.data.civ;
      const otherId = typeof other === 'string' ? index.byName('civ', other) : undefined;
      if (otherId === undefined) continue;
      if (event.type === 'war_declared') open.set(String(other), otherId);
      else open.delete(String(other));
    }
    return [...open.values()]
      .map((id) => world.civs.get(id))
      .filter(
        (c): c is NonNullable<typeof c> => c !== undefined && (c.fell === undefined || c.fell > y),
      );
  }

  return (
    <>
      {!bare && (
        <>
          <div>
            <div className="lg-kind">{KIND_LABEL[page.kind]}</div>
            <h3>{bio.name}</h3>
          </div>
          {bio.summary.length > 0 && <p className="lg-summary">{cap(bio.summary.join(' '))}</p>}
          <Facts facts={facts} />
        </>
      )}
      {page.kind === 'civ' && <TiesSection civId={page.id} />}
      {page.kind === 'civ' && <AnnalsSection civId={page.id} />}
      {cell !== null && !bare && (
        <div className="lg-actions">
          <button type="button" onClick={() => onShow(cell)}>
            Show on map
          </button>
          {page.kind === 'site' && sitesAt.get(page.id)?.ruined === false && (
            <WatchCard siteId={page.id} actions={siteActions} />
          )}
        </div>
      )}
      {every.length === 0 ? (
        <>
          <div className="lg-sect">
            <span>Chronicle</span>
          </div>
          <p className="lg-empty flush">No recorded deeds.</p>
        </>
      ) : (
        <>
          <div className="lg-sect">
            <span>
              {showAll ? 'Every event' : 'Highlights'} · {count(lines.length)} of{' '}
              {count(every.length)}
            </span>
            <label>
              <input
                type="checkbox"
                checked={showAll}
                onChange={(event) => onAll(event.target.checked)}
              />{' '}
              every event
            </label>
          </div>
          {showAll ? (
            <AllEvents ids={every} />
          ) : (
            <Chronicle ids={lines} empty="No chronicle lines of note." />
          )}
        </>
      )}
    </>
  );
}

const RULERS_SHOWN = 12;

/** The eras, rulers, wars and summary of a people (M4.9), all read from the record. */
function AnnalsSection({ civId }: { civId: Id }) {
  const { world, index, content, titleOf, onBook } = useLegends();
  const book = useMemo(
    () => annals(world, index, content, civId),
    [world, index, content, civId, world.events.length],
  );
  if (!book) return null;
  return (
    <>
      <div className="lg-sect">
        <span>
          Annals · Year {yearText(book.from)} to {yearText(book.to)}
        </span>
        {onBook && (
          <button type="button" className="lg-booklink" onClick={() => onBook(civId)}>
            Read the book
          </button>
        )}
      </div>
      <ol className="lg-annals">
        {book.eras.map((era) => (
          <li key={era.from}>
            <div className="era">
              <strong>{cap(era.name)}</strong>{' '}
              <span className="yrs">
                {yearText(era.from)}–{yearText(era.to)}
              </span>
            </div>
            <ul>
              {era.keyEvents.map((id) => {
                const event = index.event(id);
                return event ? (
                  <li key={id}>
                    <EventLink id={id}>{yearText(eventYear(event))}</EventLink> {titleOf(event)}
                  </li>
                ) : null;
              })}
            </ul>
          </li>
        ))}
      </ol>
      {book.rulers.length > 0 && (
        <>
          <div className="lg-sect">
            <span>Rulers · {book.rulers.length}</span>
          </div>
          <ol className="lg-annals plain">
            {book.rulers.slice(0, RULERS_SHOWN).map((ruler, k) => (
              <li key={k}>
                {ruler.personId === undefined ? (
                  ruler.name
                ) : (
                  <Link to={{ kind: 'person', id: ruler.personId }}>{ruler.name}</Link>
                )}{' '}
                <span className="yrs">
                  {yearText(ruler.from)}–{yearText(ruler.to)}
                </span>
              </li>
            ))}
            {book.rulers.length > RULERS_SHOWN && (
              <li className="lg-empty flush">and {book.rulers.length - RULERS_SHOWN} more</li>
            )}
          </ol>
        </>
      )}
      {book.wars.length > 0 && (
        <>
          <div className="lg-sect">
            <span>Wars · {book.wars.length}</span>
          </div>
          <ul className="lg-annals plain">
            {book.wars.map((war) => (
              <li key={war.eventId}>
                {war.enemyId === undefined ? (
                  war.enemy
                ) : (
                  <Link to={{ kind: 'civ', id: war.enemyId }}>{war.enemy}</Link>
                )}{' '}
                <span className="yrs">
                  {yearText(war.from)}–{yearText(war.to)}
                </span>{' '}
                · {war.result}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="lg-sect">
        <span>In brief</span>
      </div>
      <ul className="lg-annals plain">
        {book.summary.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

function Beats({ beats }: { beats: string[] }) {
  return (
    <ol className="lg-beats">
      {beats.map((beat, k) => (
        <li key={k}>{beat}</li>
      ))}
    </ol>
  );
}

function EventPage({ id }: { id: Id }) {
  const { world, index, content, titleOf, onOpenOnMap, nameOf } = useLegends();
  const [expanded, setExpanded] = useState(false);
  const event = index.event(id);
  const beats = useBeats(event);
  const when = event ? eventYear(event) : 0;
  const siblings = useMemo(() => {
    if (!event) return [];
    const mine = new Set(index.refs(event.id).map((r) => `${r.kind}:${r.id}`));
    const shared = (e: SimEvent) =>
      index.refs(e.id).some((r) => mine.has(`${r.kind}:${r.id}`)) ? 1 : 0;
    return world.events
      .filter((e) => e.id !== event.id && eventYear(e) === when)
      .map((e) => ({ e, shared: shared(e) }))
      .sort((a, b) => b.shared - a.shared || b.e.importance - a.e.importance || a.e.id - b.e.id)
      .slice(0, SIBLINGS_SHOWN)
      .map((s) => s.e);
  }, [world, index, event, when]);
  if (!event) return <p className="lg-empty">That event is not in the record.</p>;
  const site = [...world.sites.values()].find(
    (s) => event.place !== null && s.cell === event.place,
  );
  const led = index.effects(event.id);
  const causes = event.causes.filter((c) => index.event(c) !== undefined);
  const deepCauses = causes.some((c) => (index.event(c)?.causes.length ?? 0) > 0);
  const def = content.eventTypes.find((d) => d.id === event.type);
  const refs = index.refs(event.id);
  const battle = event.type === 'battle' ? battleOf(world, content, event.id) : undefined;
  return (
    <>
      <div>
        <div className="lg-kind">
          Year {yearText(when)} · {typeLabel(event.type)}
        </div>
        <h3>{battle ? cap(battle.name) : eventTitle(event, def)}</h3>
      </div>
      <p className="lg-summary">
        <EventText event={event} />
      </p>
      {beats.length > 0 && (
        <>
          <div className="lg-sect">
            <span>How it went</span>
          </div>
          <Beats beats={beats} />
        </>
      )}
      <dl className="lg-facts">
        {importanceStars(event.importance) && (
          <>
            <dt>Importance</dt>
            <dd>
              <Stars importance={event.importance} />
            </dd>
          </>
        )}
        {battle && battle.lost > 0 && (
          <>
            <dt>Fallen</dt>
            <dd>{count(battle.lost)} soldiers</dd>
          </>
        )}
        {battle && battle.fallen.length > 0 && (
          <>
            <dt>Champions who fell</dt>
            <dd>
              <LinkList
                refs={battle.fallen.map((id) => ({
                  to: { kind: 'person' as const, id },
                  label: world.people.get(id)?.name ?? '?',
                }))}
                limit={MEMBERS_SHOWN}
              />
            </dd>
          </>
        )}
        {site && (
          <>
            <dt>Place</dt>
            <dd>
              <Link to={{ kind: 'site', id: site.id }}>{site.name}</Link>
            </dd>
          </>
        )}
      </dl>
      {refs.length > 0 && (
        <div className="lg-chips" aria-label="Involved">
          {refs.map((ref) => (
            <Link key={`${ref.kind}:${ref.id}`} chip to={ref}>
              {nameOf(ref)}
            </Link>
          ))}
        </div>
      )}
      <div className="lg-actions">
        <button type="button" onClick={() => onOpenOnMap(event.place, when)}>
          Open on the map at Year {yearText(when)}
        </button>
      </div>
      <div className="lg-sect">
        <span>
          Why it happened · {causes.length} {plural(causes.length, 'cause', 'causes')}
        </span>
        {deepCauses && (
          <button type="button" className="lg-small" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>
      <Chronicle
        key={expanded ? 'open' : 'closed'}
        ids={causes}
        empty="Nothing earlier caused this; it began here."
        parent={event}
        autoOpen={expanded}
      />
      <div className="lg-sect">
        <span>What it led to · {led.length}</span>
      </div>
      <Chronicle ids={led} empty="Nothing recorded followed from it." />
      {siblings.length > 0 && (
        <>
          <div className="lg-sect">
            <span>Also in Year {yearText(when)}</span>
          </div>
          <ul className="lg-also">
            {siblings.map((e) => (
              <li key={e.id}>
                <Link to={{ kind: 'event', id: e.id }}>{titleOf(e)}</Link>
                <Stars importance={e.importance} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function PlacePage({ id }: { id: Id }) {
  const { world, onShow } = useLegends();
  const place = useMemo(() => allPlaces(world).find((p) => p.id === id), [world, id]);
  if (!place) return <p className="lg-empty">Unknown place.</p>;
  const { expeditions, deaths, woke } = place;
  const parts = [`${placeWhat(place)}, ${dangerWord(place.danger)} to enter.`];
  if (expeditions.length > 0) {
    const n = expeditions.length;
    parts.push(
      `${n} ${plural(n, 'company has', 'companies have')} gone in${
        deaths > 0 ? `; ${deaths} never came back` : ''
      }.`,
    );
  }
  if (emptiedBy(place, world.params.historyYears)) {
    parts.push(`Nothing is left to find there since Year ${yearText(place.emptied!)}.`);
  }
  if (woke) parts.push(`Robbed, its dead woke in Year ${yearText(woke.year)}.`);
  const facts: Fact[] = [];
  const site = place.siteId === undefined ? undefined : world.sites.get(place.siteId);
  if (site)
    facts.push(['Once the town of', <Link to={{ kind: 'site', id: site.id }}>{site.name}</Link>]);
  const beast = place.creatureId === undefined ? undefined : world.creatures.get(place.creatureId);
  if (beast)
    facts.push(['Lair of', <Link to={{ kind: 'beast', id: beast.id }}>{beast.name}</Link>]);
  const buried = place.buriedId === undefined ? undefined : world.people.get(place.buriedId);
  if (buried) {
    facts.push(['Buried here', <Link to={{ kind: 'person', id: buried.id }}>{buried.name}</Link>]);
  }
  const raisedBy = place.civId === undefined ? undefined : world.civs.get(place.civId);
  if (raisedBy && place.kind === 'barrow') {
    facts.push(['Raised by', <Link to={{ kind: 'civ', id: raisedBy.id }}>{raisedBy.name}</Link>]);
  }
  if (woke) {
    facts.push([
      'Woke',
      <>
        {woke.creatureId === undefined ? (
          woke.name
        ) : (
          <Link to={{ kind: 'beast', id: woke.creatureId }}>{woke.name}</Link>
        )}{' '}
        in Year {yearText(woke.year)}
      </>,
    ]);
  }
  facts.push(['Danger', dangerWord(place.danger)]);
  facts.push([
    'Lies here',
    place.lying.length > 0 ? (
      <LinkList
        refs={place.lying.map((item) => ({
          to: { kind: 'item', id: item },
          label: world.items.get(item)?.name ?? '?',
        }))}
        limit={MEMBERS_SHOWN}
      />
    ) : place.finds > 0 ? (
      'Something still lies hidden there'
    ) : (
      'Nothing is left to find'
    ),
  ]);
  if (deaths > 0) {
    facts.push([
      'Its dead',
      <>
        {deaths}
        {place.fallen.length > 0 && (
          <>
            {': '}
            <LinkList
              refs={place.fallen.map((person) => ({
                to: { kind: 'person', id: person },
                label: world.people.get(person)?.name ?? '?',
              }))}
              limit={MEMBERS_SHOWN}
            />
          </>
        )}
      </>,
    ]);
  }
  return (
    <>
      <div>
        <div className="lg-kind">Perilous place</div>
        <h3>{cap(place.name)}</h3>
      </div>
      <p className="lg-summary">{cap(parts.join(' '))}</p>
      <Facts facts={facts} />
      <div className="lg-actions">
        <button type="button" onClick={() => onShow(place.cell)}>
          Show on map
        </button>
      </div>
      <div className="lg-sect">
        <span>Expeditions · {expeditions.length}</span>
      </div>
      {expeditions.length === 0 ? (
        <p className="lg-empty flush">No one has gone in yet.</p>
      ) : (
        <ol className="lg-annals plain lg-expeditions">
          {expeditions.map((x) => (
            <li key={x.id}>
              <EventLink id={x.id}>Year {yearText(x.year)}</EventLink>{' '}
              {x.leaderId === null ? (
                cap(x.who)
              ) : (
                <Link to={{ kind: 'person', id: x.leaderId }}>{x.who}</Link>
              )}{' '}
              of {x.from}, {x.party} strong,{' '}
              {x.endId === null ? (
                outcomeText(x)
              ) : (
                <EventLink id={x.endId}>{outcomeText(x)}</EventLink>
              )}
              {x.dead > 0 && `, ${x.dead} did not come back`}
            </li>
          ))}
        </ol>
      )}
      <div className="lg-sect">
        <span>Chronicle</span>
      </div>
      <Chronicle ids={place.deeds} empty="No one has gone in yet." />
    </>
  );
}

const ORDINAL_WORDS =
  'first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth'.split(' ');
/** "ninth", then "13th", "21st", "22nd". */
function ordinalWord(n: number): string {
  const word = ORDINAL_WORDS[n - 1];
  if (word) return word;
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}

/** "its founder's spell", "both of its founder's spells", "all 3 of its founder's spells". */
const spellsOf = (n: number) =>
  n === 1
    ? "its founder's spell"
    : n === 2
      ? "both of its founder's spells"
      : `all ${n} of its founder's spells`;

const SMALL_NUMBERS =
  'no one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(
    ' ',
  );
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** "six", "forty-five"; 100 and up as digits. */
function numberWord(n: number): string {
  if (n < 20) return SMALL_NUMBERS[n]!;
  if (n >= 100) return String(n);
  const tens = TENS[Math.floor(n / 10)]!;
  return n % 10 === 0 ? tens : `${tens}-${SMALL_NUMBERS[n % 10]}`;
}
/** Hunts listed on an order page before "Show all". */
const HUNTS_SHOWN = 8;

function OrderPage({ id }: { id: Id }) {
  const { world, content, onShow, titleOf, index } = useLegends();
  const order = useMemo(
    () => allOrders(world, content).find((o) => o.id === id),
    [world, content, id],
  );
  const [allMembers, setAllMembers] = useState(false);
  const [allHunts, setAllHunts] = useState(false);
  if (!order) {
    return (
      <>
        <div>
          <div className="lg-kind">{KIND_LABEL.order}</div>
          <h3>No such order</h3>
        </div>
        <p className="lg-empty flush">
          This world has no knightly order or academy by that number.
        </p>
      </>
    );
  }
  const academy = order.kind === 'academy';
  const founder = world.people.get(order.founderId);
  const seat = order.siteId === null ? undefined : world.sites.get(order.siteId);
  const civ = order.civId === null ? undefined : world.civs.get(order.civId);
  const foundedAt = index.event(order.event)?.data.site;
  const head = order.heads[order.heads.length - 1];
  const headPerson = head ? world.people.get(head.personId) : undefined;
  const endEvent = order.endEvent === undefined ? undefined : index.event(order.endEvent);
  const school = order.school ?? 'magic';
  // Two people of one name on the page are told apart by their birth year.
  const ids = new Set([
    ...order.heads.map((h) => h.personId),
    ...order.members.map((m) => m.personId),
  ]);
  const nameCount = new Map<string, number>();
  for (const pid of ids) {
    const name = world.people.get(pid)?.name;
    if (name) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }
  const person = (pid: Id) => {
    const p = world.people.get(pid);
    if (!p) return '?';
    return (
      <>
        <Link to={{ kind: 'person', id: pid }}>{p.name}</Link>
        {(nameCount.get(p.name) ?? 0) > 1 && ` (born Year ${yearText(p.born)})`}
      </>
    );
  };
  const word = (n: number) => memberWord(order.kind, n);

  const begun = (
    <>
      {academy ? `An academy of ${school}` : 'A knightly order'}
      {civ && !academy && <> of the {civ.name}</>}, {academy ? 'opened' : 'founded'}
      {typeof foundedAt === 'string' && ` at ${foundedAt}`} in Year {yearText(order.founded)}
      {founder && <> by {person(founder.id)}</>}.
    </>
  );
  const moves = order.moves.map((m, k) => (
    <Fragment key={m.event}>
      {k > 0 && ', then '}
      {m.passed ? (
        <>
          passed with {m.site} to the {m.civ} in{' '}
        </>
      ) : (
        <>moved to {m.site} in </>
      )}
      <EventLink id={m.event}>Year {yearText(m.year)}</EventLink>
    </Fragment>
  ));
  const moved = order.moves.length > 0 && <> It {moves}.</>;
  const served = order.members.length;
  let now: React.ReactNode;
  if (order.ended !== undefined) {
    const reason = endEvent ? String(endEvent.data.reason ?? '') : '';
    now = (
      <>
        It ended in Year {yearText(order.ended)} after {order.heads.length}{' '}
        {plural(order.heads.length, 'master', 'masters')} and {numberWord(served)} {word(served)}
        {reason && `; ${reason}`}.
      </>
    );
  } else {
    now = (
      <>
        It stands{seat && ` at ${seat.name}`}
        {civ && academy && <> under the {civ.name}</>}
        {headPerson && (
          <>
            , led by its {ordinalWord(order.heads.length)} master, {person(headPerson.id)}
          </>
        )}
        , with {numberWord(order.serving)} {word(order.serving)} today and {numberWord(served)} in
        all.
      </>
    );
  }
  const keptSpells = order.lore.filter((sp) => sp.lost === undefined);
  const lostSpells = order.lore.filter((sp) => sp.lost !== undefined);
  const loreLine =
    academy && order.lore.length > 0
      ? lostSpells.length === 0
        ? ` It keeps ${spellsOf(order.lore.length)}.`
        : keptSpells.length === 0
          ? ` It has lost ${spellsOf(order.lore.length)}.`
          : ` It keeps ${keptSpells.length} of its founder's ${order.lore.length} spells.`
      : '';

  const facts: Fact[] = [];
  if (founder) facts.push(['Founder', person(founder.id)]);
  if (academy) facts.push(['School', cap(school)]);
  if (seat) {
    facts.push([
      order.ended === undefined ? 'Seat' : 'Last seat',
      <>
        <Link to={{ kind: 'site', id: seat.id }}>{seat.name}</Link>
        {' ('}
        <button type="button" className="lg-ln" onClick={() => onShow(seat.cell)}>
          show on map
        </button>
        )
      </>,
    ]);
  }
  if (civ) {
    facts.push([
      order.ended === undefined ? 'Serves' : 'Served',
      <Link to={{ kind: 'civ', id: civ.id }}>{civ.name}</Link>,
    ]);
  }
  if (order.ended === undefined && headPerson) facts.push(['Master now', person(headPerson.id)]);
  facts.push([
    order.ended === undefined ? 'Founded' : 'Years',
    order.ended === undefined
      ? `Year ${yearText(order.founded)}`
      : `Year ${yearText(order.founded)} to ${yearText(order.ended)}`,
  ]);

  // Those serving now come first, then the rest, each in the order they joined.
  const roll = [
    ...order.members.filter((m) => m.serving),
    ...order.members.filter((m) => !m.serving),
  ];
  const shown = allMembers ? roll : roll.slice(0, MEMBERS_SHOWN);
  const masters = new Set(order.heads.map((h) => h.personId));
  const died = content.notables.deeds.huntPhrases.died;
  const hunts = allHunts ? order.hunts : order.hunts.slice(0, HUNTS_SHOWN);
  return (
    <>
      <div>
        <div className="lg-kind">{academy ? 'Academy' : 'Knightly order'}</div>
        <h3>{cap(order.name)}</h3>
      </div>
      <p className="lg-summary">
        {begun}
        {moved} {now}
        {loreLine}
      </p>
      <Facts facts={facts} />
      <div className="lg-sect">
        <span>Masters · {order.heads.length}</span>
      </div>
      <ol className="lg-annals plain">
        {order.heads.map((h, k) => (
          <li key={h.personId}>
            <EventLink id={h.event}>Year {yearText(h.from)}</EventLink> {person(h.personId)}
            {k === 0 ? ', the founder' : ''}
            {h.to !== undefined &&
              (h.diedInOffice
                ? `, died in office Year ${yearText(h.to)}`
                : `, until Year ${yearText(h.to)}`)}
          </li>
        ))}
      </ol>
      <div className="lg-sect">
        <span>
          {cap(word(2))} · {order.members.length}
        </span>
      </div>
      <ul className="lg-annals plain lg-members">
        {shown.map((m) => {
          const p = world.people.get(m.personId);
          const best = m.best === undefined ? undefined : index.event(m.best);
          const notes = [
            m.serving ? 'serving' : '',
            masters.has(m.personId) && m.personId !== order.founderId ? 'master' : '',
            p?.died !== undefined ? `died Year ${yearText(p.died)}` : '',
          ].filter((t) => t);
          return (
            <li key={m.personId}>
              {m.event !== undefined && m.joined !== undefined ? (
                <EventLink id={m.event}>Year {yearText(m.joined)}</EventLink>
              ) : (
                <span className="lg-when" title="The year they joined is not on record">
                  {m.joinedBy !== undefined ? `by ${yearText(m.joinedBy)}` : 'early'}
                </span>
              )}{' '}
              {person(m.personId)}
              {m.personId === order.founderId ? ', the founder' : ''}
              {notes.length > 0 && `, ${notes.join(', ')}`}
              {best && (
                <>
                  {' · '}
                  <Link to={{ kind: 'event', id: best.id }}>{titleOf(best)}</Link>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {order.members.length > MEMBERS_SHOWN && (
        <button type="button" className="lg-more" onClick={() => setAllMembers((v) => !v)}>
          {allMembers ? 'Fewer' : `Show all ${order.members.length}`}
        </button>
      )}
      {academy && order.lore.length > 0 && (
        <>
          <div className="lg-sect">
            <span>Spells · {order.lore.length}</span>
          </div>
          <ul className="lg-annals plain">
            {order.lore.map((sp) => (
              <li key={sp.id}>
                {sp.name}
                {sp.lostEvent !== undefined ? (
                  <>
                    {', '}
                    <EventLink id={sp.lostEvent}>lost in Year {yearText(sp.lost!)}</EventLink>
                  </>
                ) : sp.lost !== undefined ? (
                  `, lost in Year ${yearText(sp.lost)}`
                ) : (
                  ', still taught'
                )}
                {sp.learnedBy > 0 &&
                  `; learned here by ${numberWord(sp.learnedBy)} ${plural(sp.learnedBy, 'scholar', 'scholars')}`}
              </li>
            ))}
          </ul>
        </>
      )}
      {order.hunts.length > 0 && (
        <>
          <div className="lg-sect">
            <span>Hunts · {order.hunts.length}</span>
          </div>
          <ol className="lg-annals plain">
            {hunts.map((hid) => {
              const e = index.event(hid);
              if (!e) return null;
              const beast = index.refs(hid).find((r) => r.kind === 'beast');
              const prey = String(e.data.beast ?? 'a beast');
              const how =
                e.type === 'beast_slain'
                  ? 'slew it'
                  : e.data.outcome === died
                    ? 'never came home'
                    : 'came home scarred';
              return (
                <li key={hid}>
                  <EventLink id={hid}>Year {yearText(eventYear(e))}</EventLink>{' '}
                  {e.actors[0] !== undefined && person(e.actors[0])} against{' '}
                  {beast ? <Link to={beast}>{prey}</Link> : prey}, {how}
                </li>
              );
            })}
          </ol>
          {order.hunts.length > HUNTS_SHOWN && (
            <button type="button" className="lg-more" onClick={() => setAllHunts((v) => !v)}>
              {allHunts ? 'Fewer' : `Show all ${order.hunts.length}`}
            </button>
          )}
        </>
      )}
      <div className="lg-sect">
        <span>Chronicle</span>
      </div>
      <Chronicle ids={order.deeds} empty="Nothing on record." />
    </>
  );
}

function RacePage({ id }: { id: string }) {
  const { world, content } = useLegends();
  const race = content.races.find((r) => r.id === id);
  if (!race) return <p className="lg-empty">Unknown race.</p>;
  const biomes = race.preferredBiomes
    .map((b) => content.biomes.find((biome) => biome.id === b)?.name ?? b)
    .join(', ');
  const civs = [...world.civs.values()].filter((civ) => civ.raceId === race.id);
  const famous = [...world.people.values()]
    .filter((p) => p.raceId === race.id)
    .sort((a, b) => b.fame - a.fame || a.id - b.id)
    .slice(0, RACE_FIGURES);
  return (
    <>
      <div>
        <div className="lg-kind">{KIND_LABEL.race}</div>
        <h3>{race.name}</h3>
      </div>
      <dl className="lg-facts">
        <dt>Lifespan</dt>
        <dd>about {race.lifespanYears} years</dd>
        <dt>Fertility</dt>
        <dd>{race.fertility}</dd>
        <dt>Favours</dt>
        <dd>{biomes || 'no biome in particular'}</dd>
      </dl>
      <div className="lg-sect">
        <span>Civs · {civs.length}</span>
      </div>
      <div className="lg-chips">
        {civs.length > 0 ? (
          civs.map((civ) => (
            <Link key={civ.id} chip to={{ kind: 'civ', id: civ.id }}>
              {civ.name}
            </Link>
          ))
        ) : (
          <span className="lg-empty flush">None in this world.</span>
        )}
      </div>
      <div className="lg-sect">
        <span>Most famous</span>
      </div>
      <ul className="lg-list">
        {famous.map((person) => (
          <li key={person.id}>
            <Link to={{ kind: 'person', id: person.id }} className="lg-row">
              <span className="nm">{person.name}</span>
              <span className="yrs">{spanText(person.born, person.died)}</span>
              <span className="meta">
                {person.title ?? 'notable'} · fame {person.fame}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
