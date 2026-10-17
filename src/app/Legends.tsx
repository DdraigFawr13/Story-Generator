// The Legends pane (M2.7): search and lists of civs, sites, races, figures, families, beasts,
// artifacts and events; a page per entity (LegendPages.tsx). Where the pane is lives in the app's
// URL state (`nav`), so the browser's back and forward buttons and shared links work.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  battleOf,
  eventTitle,
  eventYear,
  importanceStars,
  yearText,
  type ContentBundle,
  type Id,
  type LegendIndex,
  type Narrator,
  type SimEvent,
  type WorldState,
} from '../engine';
import { PageView } from './LegendPages';
import { allPlaces, placeKindLabel } from './places';
import {
  LegendsContext,
  Marked,
  cap,
  count,
  plainClick,
  plural,
  refName,
  spanText,
  useLegends,
  type CategoryId,
  type LegendNav,
  type LegendsCtx,
  type PageRef,
  type SiteActions,
  type SiteState,
} from './legends-ctx';

export type { PageRef } from './legends-ctx';

interface Props {
  world: WorldState;
  index: LegendIndex;
  narrator: Narrator;
  content: ContentBundle;
  /** The year slider's year, the final year, and whether lines after it fade. */
  year: number;
  finalYear: number;
  locked: boolean;
  sitesAt: ReadonlyMap<Id, SiteState>;
  nav: LegendNav;
  /** Change the pane's place; `mode` 'replace' edits the current history entry. */
  go: (
    patch: {
      open?: PageRef | null;
      trail?: PageRef[];
      cat?: CategoryId | null;
      q?: string;
      all?: boolean;
    },
    mode?: 'push' | 'replace',
  ) => void;
  /** Link target for a page, or for the list when null. */
  hrefOf: (ref: PageRef | null) => string;
  siteActions: SiteActions;
  onShow: (cell: number) => void;
  onOpenOnMap: (cell: number | null, year: number) => void;
  /** Switch to the map tab (narrow layout). */
  onGoMap: () => void;
  /** Open a realm's book in the Book room. */
  onBook?: (civId: Id) => void;
  /** A room drawn over the pane that needs the Legends context (the People room). */
  room?: React.ReactNode;
  /** A room covers the pane: it stays mounted but takes no focus and is not read aloud. */
  covered?: boolean;
}

const CATEGORIES: { id: CategoryId; label: string; blurb: string }[] = [
  { id: 'civ', label: 'Civs', blurb: 'Peoples who ruled, oldest first' },
  { id: 'site', label: 'Sites', blurb: 'Settlements and ruins' },
  { id: 'race', label: 'Races', blurb: 'The peoples of this world' },
  { id: 'person', label: 'Figures', blurb: 'Notable people' },
  { id: 'dynasty', label: 'Families', blurb: 'Founded lines' },
  { id: 'beast', label: 'Beasts', blurb: 'Lairs and monsters' },
  { id: 'place', label: 'Places', blurb: 'Ruins, barrows and lairs' },
  { id: 'item', label: 'Artifacts', blurb: 'Artifacts and books' },
  { id: 'event', label: 'Events', blurb: 'Everything the chroniclers noted, greatest first' },
];
const DEFAULT_CATEGORY: CategoryId = 'civ';
/** Rows rendered at a time in a list; a button reveals the next window. */
const WINDOW = 200;
/** Search hits shown per kind before "show all". */
const SEARCH_HITS = 12;
/** Search waits this long after the last keystroke. */
const SEARCH_DEBOUNCE_MS = 150;
/** Importance floor choices for the Events list, and the default. */
const IMPORTANCE_FLOORS = [0, 3, 6, 9];
const DEFAULT_IMPORTANCE_FLOOR = 6;

interface Row {
  ref: PageRef;
  name: string;
  years: string;
  meta: string;
  /** Muted tail that tells same-named rows apart. */
  dis?: string;
  stars?: string;
  importance?: number;
  /** Filter and sort fields. */
  civId?: Id | null | undefined;
  raceId?: string;
  from?: number;
  to?: number | undefined;
  fame?: number;
  peak?: number;
}

interface Filters {
  personSort: 'fame' | 'born' | 'name';
  personRace: string;
  personCiv: string;
  personAlive: boolean;
  siteSort: 'peak' | 'founded' | 'name';
  siteCiv: string;
  siteStanding: boolean;
  eventGroup: string;
  eventDecade: string;
  eventCiv: string;
  eventFloor: number;
}
const NO_FILTERS: Filters = {
  personSort: 'fame',
  personRace: '',
  personCiv: '',
  personAlive: false,
  siteSort: 'peak',
  siteCiv: '',
  siteStanding: false,
  eventGroup: '',
  eventDecade: '',
  eventCiv: '',
  eventFloor: DEFAULT_IMPORTANCE_FLOOR,
};

const byName = (a: Row, b: Row) => a.name.localeCompare(b.name) || 0;

export function Legends(props: Props) {
  const { world, index, narrator, content, year, nav, go, hrefOf } = props;
  const [qText, setQText] = useState(nav.q);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [opened, setOpened] = useState<{ q: string; kinds: ReadonlySet<CategoryId> }>({
    q: '',
    kinds: new Set(),
  });
  const bodyRef = useRef<HTMLDivElement>(null);
  const page = nav.open;
  const needle = nav.q.trim().toLowerCase();

  // The input shows what is typed; the committed search (and history entry) follows 150 ms later.
  useEffect(() => {
    if (qText.trim() === nav.q.trim()) return;
    // A new search starts across every kind; chips then narrow it.
    const fresh = nav.q.trim() === '' ? { cat: null } : {};
    const timer = window.setTimeout(
      () => go({ q: qText, open: null, ...fresh }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);
  useEffect(() => setQText((text) => (text.trim() === nav.q.trim() ? text : nav.q)), [nav.q]);

  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = nav.scroll;
  }, [nav.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // Everything below depends on the world only through `index`, which is rebuilt per revision.
  const caches = useMemo(
    () => ({
      text: new Map<Id, string>(),
      title: new Map<Id, string>(),
      hay: new Map<Id, string>(),
    }),
    [index, narrator],
  );
  const typeDefs = useMemo(() => new Map(content.eventTypes.map((d) => [d.id, d])), [content]);
  const textOf = (event: SimEvent) => {
    let text = caches.text.get(event.id);
    if (text === undefined) {
      text = narrator.renderEvent(event);
      caches.text.set(event.id, text);
    }
    return text;
  };
  const titleOf = (event: SimEvent) => {
    let title = caches.title.get(event.id);
    if (title === undefined) {
      const battle = event.type === 'battle' ? battleOf(world, content, event.id) : undefined;
      title = battle ? cap(battle.name) : eventTitle(event, typeDefs.get(event.type));
      caches.title.set(event.id, title);
    }
    return title;
  };
  const raceName = (id: string) => content.races.find((race) => race.id === id)?.name ?? id;
  const nameOf = (ref: PageRef): string => {
    if (ref.kind === 'race') return raceName(ref.id);
    if (ref.kind === 'event') {
      const event = index.event(ref.id);
      return event ? titleOf(event) : '?';
    }
    if (ref.kind === 'place') return world.places.get(ref.id)?.name ?? '?';
    return refName(world, ref);
  };

  const ctx: LegendsCtx = {
    world,
    index,
    content,
    narrator,
    year,
    finalYear: props.finalYear,
    locked: props.locked,
    sitesAt: props.sitesAt,
    open: (ref) => go({ open: ref }),
    hrefOf,
    siteActions: props.siteActions,
    onShow: props.onShow,
    onOpenOnMap: props.onOpenOnMap,
    onBook: props.onBook,
    nameOf,
    titleOf,
    textOf,
    raceName,
  };

  const lists = useMemo(() => {
    const civName = (id: Id | null | undefined) =>
      id == null ? undefined : world.civs.get(id)?.name;
    const live = new Map<Id, number>();
    for (const site of world.sites.values()) {
      if (site.civId !== null && site.ruinedYear === undefined)
        live.set(site.civId, (live.get(site.civId) ?? 0) + 1);
    }
    const civs: Row[] = [...world.civs.values()].map((civ) => ({
      ref: { kind: 'civ', id: civ.id },
      name: civ.name,
      years: spanText(civ.founded, civ.fell),
      meta: `${raceName(civ.raceId)} · ${live.get(civ.id) ?? 0} settlements`,
    }));
    const sites: Row[] = [...world.sites.values()]
      .sort((a, b) => b.peakPop - a.peakPop || a.id - b.id)
      .map((site) => ({
        ref: { kind: 'site', id: site.id },
        name: site.name,
        years: spanText(site.founded, site.ruinedYear),
        meta: `${site.kind} · ${civName(site.civId) ?? 'no people'}${
          site.ruinedYear === undefined ? '' : ' · ruin'
        } · peak population ${count(site.peakPop)}`,
        civId: site.civId,
        from: site.founded,
        to: site.ruinedYear,
        peak: site.peakPop,
      }));
    const races: Row[] = content.races.map((race) => ({
      ref: { kind: 'race', id: race.id },
      name: race.name,
      years: '',
      meta: `${[...world.civs.values()].filter((c) => c.raceId === race.id).length} civs · ${
        [...world.people.values()].filter((p) => p.raceId === race.id).length
      } figures`,
    }));
    const people: Row[] = [...world.people.values()]
      .sort((a, b) => b.fame - a.fame || a.id - b.id)
      .map((person) => {
        const civ = civName(person.civId);
        return {
          ref: { kind: 'person', id: person.id },
          name: person.name,
          years: spanText(person.born, person.died),
          meta: `${person.title ?? 'notable'} · ${raceName(person.raceId)}${
            civ ? ` · ${civ}` : ''
          } · fame ${person.fame}`,
          civId: person.civId,
          raceId: person.raceId,
          from: person.born,
          to: person.died,
          fame: person.fame,
        };
      });
    const dynasties: Row[] = [...world.dynasties.values()].map((dynasty) => ({
      ref: { kind: 'dynasty', id: dynasty.id },
      name: dynasty.name,
      years: spanText(dynasty.founded),
      meta: `founded by ${world.people.get(dynasty.founderId)?.name ?? 'an unknown founder'}${
        civName(dynasty.civId) ? ` · ${civName(dynasty.civId)}` : ''
      }`,
      civId: dynasty.civId,
    }));
    const beasts: Row[] = [...world.creatures.values()].map((beast) => ({
      ref: { kind: 'beast', id: beast.id },
      name: beast.name,
      years: spanText(beast.born, beast.died),
      meta: content.creatures.find((def) => def.id === beast.defId)?.name ?? beast.defId,
    }));
    const places: Row[] = allPlaces(world).map((place) => {
      const n = place.expeditions.length;
      return {
        ref: { kind: 'place', id: place.id },
        name: place.name,
        years: spanText(place.since, place.emptied),
        meta: `${placeKindLabel(place.kind)}${
          n > 0 ? ` · ${n} ${plural(n, 'expedition', 'expeditions')}` : ''
        }`,
      };
    });
    const items: Row[] = [...world.items.values()].map((item) => ({
      ref: { kind: 'item', id: item.id },
      name: item.name,
      years: yearText(item.made),
      meta: item.kind === 'book' ? `book · ${item.form}` : `artifact · ${item.form}`,
    }));
    // Same-named rows of one kind get their years and civ appended, so they can be told apart.
    const named = {
      civ: civs,
      site: sites,
      person: people,
      dynasty: dynasties,
      beast: beasts,
      place: places,
      item: items,
    };
    for (const rows of Object.values(named)) {
      const seen = new Map<string, number>();
      for (const row of rows) seen.set(row.name, (seen.get(row.name) ?? 0) + 1);
      for (const row of rows) {
        if ((seen.get(row.name) ?? 0) < 2) continue;
        const owner = civName(row.civId);
        row.dis = [row.years, owner].filter((part) => part).join(' · ');
      }
    }
    return {
      civ: civs,
      site: sites,
      race: races,
      person: people,
      dynasty: dynasties,
      beast: beasts,
      place: places,
      item: items,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, content]);

  const ranked = useMemo(
    () => [...world.events].sort((a, b) => b.importance - a.importance || a.id - b.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index],
  );
  const eventRow = (event: SimEvent): Row => ({
    ref: { kind: 'event', id: event.id },
    name: titleOf(event),
    years: yearText(eventYear(event)),
    meta: textOf(event),
    stars: importanceStars(event.importance),
    importance: event.importance,
  });
  const groupTypes = useMemo(() => {
    const group = (content.typeGroups ?? []).find((g) => g.id === filters.eventGroup);
    return group ? new Set(group.types) : null;
  }, [content, filters.eventGroup]);
  const listedEvents = useMemo(() => {
    const decade = filters.eventDecade === '' ? null : Number(filters.eventDecade);
    const civ = filters.eventCiv === '' ? null : Number(filters.eventCiv);
    return ranked.filter((event) => {
      if (event.importance < filters.eventFloor) return false;
      if (groupTypes && !groupTypes.has(event.type)) return false;
      if (decade !== null && Math.floor(eventYear(event) / 10) * 10 !== decade) return false;
      return (
        civ === null || index.refs(event.id).some((ref) => ref.kind === 'civ' && ref.id === civ)
      );
    });
  }, [ranked, index, groupTypes, filters.eventDecade, filters.eventCiv, filters.eventFloor]);

  const people = useMemo(() => {
    const civ = filters.personCiv === '' ? null : Number(filters.personCiv);
    const alive = filters.personAlive ? year : 0;
    const rows = lists.person.filter(
      (row) =>
        (filters.personRace === '' || row.raceId === filters.personRace) &&
        (civ === null || row.civId === civ) &&
        (!filters.personAlive || (row.from! <= alive && (row.to === undefined || row.to > alive))),
    );
    return rows.sort(
      filters.personSort === 'name'
        ? byName
        : filters.personSort === 'born'
          ? (a, b) => a.from! - b.from! || byName(a, b)
          : (a, b) => b.fame! - a.fame! || byName(a, b),
    );
  }, [lists, filters, filters.personAlive ? year : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const sites = useMemo(() => {
    const civ = filters.siteCiv === '' ? null : Number(filters.siteCiv);
    const rows = lists.site.filter(
      (row) =>
        (civ === null || row.civId === civ) &&
        (!filters.siteStanding ||
          (props.sitesAt.has((row.ref as { id: Id }).id) &&
            !props.sitesAt.get((row.ref as { id: Id }).id)!.ruined)),
    );
    return rows.sort(
      filters.siteSort === 'name'
        ? byName
        : filters.siteSort === 'founded'
          ? (a, b) => a.from! - b.from! || byName(a, b)
          : (a, b) => b.peak! - a.peak! || byName(a, b),
    );
  }, [lists, filters, filters.siteStanding ? props.sitesAt : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const total: Record<CategoryId, number> = {
    civ: lists.civ.length,
    site: lists.site.length,
    race: lists.race.length,
    person: lists.person.length,
    dynasty: lists.dynasty.length,
    beast: lists.beast.length,
    place: lists.place.length,
    item: lists.item.length,
    event: world.events.length,
  };

  const hayOf = (event: SimEvent) => {
    let hay = caches.hay.get(event.id);
    if (hay === undefined) {
      hay = `${titleOf(event)} ${textOf(event)}`.toLowerCase();
      caches.hay.set(event.id, hay);
    }
    return hay;
  };

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const category = nav.cat ?? DEFAULT_CATEGORY;
  const catLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!.label;

  let crumbs: React.ReactNode;
  let controls: React.ReactNode = null;
  let body: React.ReactNode;
  if (page) {
    const trail = nav.trail.length > 0 ? nav.trail : [page];
    const step = (to: PageRef, k: number) => (
      <a
        key={k}
        href={hrefOf(to)}
        onClick={(event) => plainClick(event, () => go({ open: to, trail: trail.slice(0, k + 1) }))}
      >
        {nameOf(to)}
      </a>
    );
    const kind: CategoryId = page.kind;
    crumbs = (
      <nav className="lg-trail" aria-label="Breadcrumb">
        <button
          type="button"
          onClick={() =>
            trail.length > 1
              ? go({ open: trail[trail.length - 2]!, trail: trail.slice(0, -1) })
              : go({ open: null })
          }
        >
          ← Back
        </button>
        {trail.length > 2 && <span aria-hidden="true">…</span>}
        {trail.length > 1 ? (
          step(trail[trail.length - 2]!, trail.length - 2)
        ) : (
          <a
            href={hrefOf(null)}
            onClick={(event) => plainClick(event, () => go({ open: null, cat: kind }))}
          >
            {catLabel(kind)}
          </a>
        )}
        <span aria-hidden="true">›</span>
        <span className="here" aria-current="page">
          {nameOf(page)}
        </span>
      </nav>
    );
    body = (
      <div className="lg-page">
        <PageView page={page} all={nav.all} onAll={(all) => go({ all }, 'replace')} />
      </div>
    );
  } else if (needle) {
    const kinds = CATEGORIES.filter((c) => nav.cat === null || c.id === nav.cat);
    const groups = kinds
      .map(({ id, label }) => {
        const hits: { rowAt: (i: number) => Row; total: number } =
          id === 'event'
            ? (() => {
                const found = ranked.filter((event) => hayOf(event).includes(needle));
                return { total: found.length, rowAt: (i) => eventRow(found[i]!) };
              })()
            : (() => {
                const found = lists[id].filter((row) => row.name.toLowerCase().includes(needle));
                return { total: found.length, rowAt: (i) => found[i]! };
              })();
        return { id, label, ...hits };
      })
      .filter((group) => group.total > 0);
    const matches = groups.reduce((sum, group) => sum + group.total, 0);
    crumbs = `Search: ${count(matches)} ${matches === 1 ? 'match' : 'matches'}`;
    const expandedHere = opened.q === nav.q ? opened.kinds : new Set<CategoryId>();
    body =
      groups.length > 0 ? (
        <>
          {groups.map((group) => {
            const expanded = nav.cat !== null || expandedHere.has(group.id);
            const shown = expanded ? group.total : Math.min(SEARCH_HITS, group.total);
            return (
              <section key={group.id}>
                <div className="lg-sect lg-group">
                  <span>
                    {group.label} · {count(shown)} of {count(group.total)}{' '}
                    {group.total === 1 ? 'match' : 'matches'}
                  </span>
                  {!expanded && group.total > SEARCH_HITS && (
                    <button
                      type="button"
                      className="lg-small"
                      onClick={() =>
                        setOpened({ q: nav.q, kinds: new Set([...expandedHere, group.id]) })
                      }
                    >
                      show all
                    </button>
                  )}
                </div>
                <Rows
                  key={`${group.id}:${nav.q}:${expanded}`}
                  total={shown}
                  rowAt={group.rowAt}
                  needle={needle}
                />
              </section>
            );
          })}
        </>
      ) : (
        <p className="lg-empty">
          Nothing by that name. Try part of a name, a place or a word like “famine”.
        </p>
      );
  } else {
    let listed: { total: number; rowAt: (i: number) => Row };
    if (category === 'event') {
      listed = { total: listedEvents.length, rowAt: (i) => eventRow(listedEvents[i]!) };
      controls = (
        <div className="lg-filters">
          <Select
            label="Importance"
            value={String(filters.eventFloor)}
            onChange={(v) => set({ eventFloor: Number(v) })}
            options={IMPORTANCE_FLOORS.map((n) => [String(n), n === 0 ? 'All' : `${n}+`])}
          />
          <Select
            label="Type"
            value={filters.eventGroup}
            onChange={(v) => set({ eventGroup: v })}
            options={[
              ['', 'All'],
              ...(content.typeGroups ?? []).map((g): [string, string] => [g.id, g.label]),
            ]}
          />
          <Select
            label="Decade"
            value={filters.eventDecade}
            onChange={(v) => set({ eventDecade: v })}
            options={[
              ['', 'Any'],
              ...Array.from(
                { length: Math.floor(props.finalYear / 10) + 1 },
                (_, k): [string, string] => [String(k * 10), `${k * 10}s`],
              ),
            ]}
          />
          <Select
            label="Civ"
            value={filters.eventCiv}
            onChange={(v) => set({ eventCiv: v })}
            options={civOptions(world)}
          />
        </div>
      );
    } else if (category === 'person') {
      listed = { total: people.length, rowAt: (i) => people[i]! };
      controls = (
        <div className="lg-filters">
          <Select
            label="Sort"
            value={filters.personSort}
            onChange={(v) => set({ personSort: v as Filters['personSort'] })}
            options={[
              ['fame', 'Fame'],
              ['born', 'Birth year'],
              ['name', 'Name'],
            ]}
          />
          <Select
            label="Race"
            value={filters.personRace}
            onChange={(v) => set({ personRace: v })}
            options={[['', 'All'], ...content.races.map((r): [string, string] => [r.id, r.name])]}
          />
          <Select
            label="Civ"
            value={filters.personCiv}
            onChange={(v) => set({ personCiv: v })}
            options={civOptions(world)}
          />
          <label className="chk">
            <input
              type="checkbox"
              checked={filters.personAlive}
              onChange={(e) => set({ personAlive: e.target.checked })}
            />{' '}
            alive in Year {yearText(year)}
          </label>
        </div>
      );
    } else if (category === 'site') {
      listed = { total: sites.length, rowAt: (i) => sites[i]! };
      controls = (
        <div className="lg-filters">
          <Select
            label="Sort"
            value={filters.siteSort}
            onChange={(v) => set({ siteSort: v as Filters['siteSort'] })}
            options={[
              ['peak', 'Peak population'],
              ['founded', 'Founded'],
              ['name', 'Name'],
            ]}
          />
          <Select
            label="Civ"
            value={filters.siteCiv}
            onChange={(v) => set({ siteCiv: v })}
            options={civOptions(world)}
          />
          <label className="chk">
            <input
              type="checkbox"
              checked={filters.siteStanding}
              onChange={(e) => set({ siteStanding: e.target.checked })}
            />{' '}
            standing in Year {yearText(year)}
          </label>
        </div>
      );
    } else {
      listed = { total: lists[category].length, rowAt: (i) => lists[category][i]! };
    }
    crumbs = `${CATEGORIES.find((c) => c.id === category)!.blurb} · ${count(listed.total)}${
      listed.total === total[category] ? '' : ` of ${count(total[category])}`
    }`;
    body =
      listed.total > 0 ? (
        <Rows
          key={`${category}:${JSON.stringify(filters)}:${
            (category === 'person' && filters.personAlive) ||
            (category === 'site' && filters.siteStanding)
              ? year
              : 0
          }`}
          total={listed.total}
          rowAt={listed.rowAt}
        />
      ) : (
        <p className="lg-empty">Nothing matches those filters.</p>
      );
  }

  return (
    <LegendsContext.Provider value={ctx}>
      <section
        className="lg-pane"
        aria-label="Legends"
        {...(props.covered ? { inert: true, 'aria-hidden': true } : {})}
      >
        <header>
          <div className="lg-top">
            <h2>Legends</h2>
            <button type="button" className="lg-yearbtn" onClick={props.onGoMap}>
              Year {yearText(year)} ▸ map
            </button>
          </div>
          <input
            className="lg-search"
            type="search"
            placeholder="Search names and events"
            aria-label="Search legends"
            autoComplete="off"
            value={qText}
            onChange={(event) => setQText(event.target.value)}
          />
          <div className="lg-cats">
            {needle && (
              <button
                type="button"
                aria-pressed={!page && nav.cat === null}
                onClick={() => go({ cat: null, open: null })}
              >
                All
              </button>
            )}
            {CATEGORIES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={!page && (needle ? nav.cat === id : category === id)}
                onClick={() => go({ cat: needle && nav.cat === id ? null : id, open: null })}
              >
                {label}
                <span className="n">{count(total[id])}</span>
              </button>
            ))}
          </div>
        </header>
        <div className="lg-crumbs">{crumbs}</div>
        {controls}
        <div className="lg-body" ref={bodyRef}>
          {body}
        </div>
      </section>
      {props.room}
    </LegendsContext.Provider>
  );
}

function civOptions(world: WorldState): [string, string][] {
  return [
    ['', 'All'],
    ...[...world.civs.values()].map((c): [string, string] => [String(c.id), c.name]),
  ];
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label>
      {label}{' '}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Rows in windows of WINDOW, with a button for the next window. */
function Rows({
  total,
  rowAt,
  needle,
}: {
  total: number;
  rowAt: (i: number) => Row;
  needle?: string | undefined;
}) {
  const [limit, setLimit] = useState(WINDOW);
  const shown = Math.min(limit, total);
  const rows: Row[] = [];
  for (let i = 0; i < shown; i += 1) rows.push(rowAt(i));
  return (
    <>
      <ul className="lg-list">
        {rows.map((row) => (
          <RowItem key={`${row.ref.kind}:${row.ref.id}`} row={row} needle={needle} />
        ))}
      </ul>
      {total > shown && (
        <button type="button" className="lg-more" onClick={() => setLimit(limit + WINDOW)}>
          Show {WINDOW} more ({count(shown)} of {count(total)})
        </button>
      )}
    </>
  );
}

function RowItem({ row, needle }: { row: Row; needle?: string | undefined }) {
  const { open, hrefOf } = useLegends();
  return (
    <li>
      <a
        className="lg-row"
        href={hrefOf(row.ref)}
        onClick={(event) => plainClick(event, () => open(row.ref))}
      >
        <span className="nm">
          <Marked text={row.name} needle={needle} />
          {row.dis && <span className="dis"> · {row.dis}</span>}
        </span>
        <span className="yrs">
          {row.years}
          {row.stars && (
            <span
              className="stars"
              role="img"
              title={`importance ${row.importance}`}
              aria-label={`importance ${row.importance}`}
            >
              {' '}
              {row.stars}
            </span>
          )}
        </span>
        <span className="meta">
          <Marked text={cap(row.meta)} needle={needle} />
        </span>
      </a>
    </li>
  );
}
