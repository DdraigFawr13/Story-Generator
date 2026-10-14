// Shared pieces of the Legends pane (M2.7): the page reference type, what the pane may read and
// call, link anchors, and small formatters. Pure helpers here have no state of their own.

import { createContext, useContext } from 'react';
import {
  yearText,
  type ContentBundle,
  type Id,
  type OutpostCheck,
  type LegendIndex,
  type LegendRef,
  type Narrator,
  type SimEvent,
  type WorldState,
} from '../engine';
import { cap } from './format';
import { parseOpen, type LegendCategory } from './map-view';

/** A page in the pane: any legend entity, a race (content only) or a single event. */
export type PageRef = LegendRef | { kind: 'race'; id: string } | { kind: 'event'; id: Id };
export type CategoryId = LegendCategory;

/** Where the Legends pane is: the list or page it shows, and how it got there. */
export interface LegendNav {
  open: PageRef | null;
  /** Pages visited since the last list, oldest first; the last is `open`. */
  trail: PageRef[];
  /** List category; null means the default (or, while searching, every kind). */
  cat: CategoryId | null;
  q: string;
  /** "Every event" on the open entity page. */
  all: boolean;
  /** Counts up on every page or list change, so the body scrolls back to the top. */
  rev: number;
  /** Scroll offset to restore (browser back), else the body starts at the top. */
  scroll: number;
}

/** What the world view may do about a live site (M3.1); handed to Legends and the map inspector. */
export interface SiteActions {
  world: WorldState;
  content: ContentBundle;
  /** False while another site is starting or when the slider is on a past year. */
  enabled: boolean;
  watch: (siteId: Id) => void;
  /** Watch in the Town room, following `who` when they live there. */
  watchTown: (siteId: Id, who?: Id) => void;
  outpostCheck: (cell: number) => OutpostCheck;
  found: (cell: number, name: string) => void;
}

export interface SiteState {
  civId: Id | null;
  pop: number;
  ruined: boolean;
}

/** What the Legends pane reads and calls; built once per render by the app. */
export interface LegendsCtx {
  world: WorldState;
  index: LegendIndex;
  content: ContentBundle;
  narrator: Narrator;
  /** The year slider's year, the final year, and whether lines after it fade. */
  year: number;
  finalYear: number;
  locked: boolean;
  /** Owner, population and ruin state of each site that existed in the slider year. */
  sitesAt: ReadonlyMap<Id, SiteState>;
  open: (ref: PageRef) => void;
  hrefOf: (ref: PageRef | null) => string;
  /** "Show on map": centre the map on a cell and switch to it. */
  onShow: (cell: number) => void;
  /** "Open on the map at Year N": set the slider, centre, switch to the map. */
  onOpenOnMap: (cell: number | null, year: number) => void;
  siteActions: SiteActions;
  /** Open a realm's book in the Book room (absent where there is no Book room). */
  onBook?: ((civId: Id) => void) | undefined;
  nameOf: (ref: PageRef) => string;
  titleOf: (event: SimEvent) => string;
  textOf: (event: SimEvent) => string;
  raceName: (id: string) => string;
}

export const LegendsContext = createContext<LegendsCtx | null>(null);
export function useLegends(): LegendsCtx {
  const ctx = useContext(LegendsContext);
  if (!ctx) throw new Error('Legends context missing');
  return ctx;
}

/** Singular kind label for a page's eyebrow. */
export const KIND_LABEL: Record<CategoryId, string> = {
  civ: 'Civ',
  site: 'Site',
  race: 'Race',
  person: 'Figure',
  dynasty: 'Family',
  beast: 'Beast',
  item: 'Artifact',
  event: 'Event',
};

/** The name of a legend entity (not a race or an event page). */
export function refName(world: WorldState, ref: LegendRef): string {
  switch (ref.kind) {
    case 'civ':
      return world.civs.get(ref.id)?.name ?? '?';
    case 'site':
      return world.sites.get(ref.id)?.name ?? '?';
    case 'person':
      return world.people.get(ref.id)?.name ?? '?';
    case 'beast':
      return world.creatures.get(ref.id)?.name ?? '?';
    case 'item':
      return world.items.get(ref.id)?.name ?? '?';
    case 'dynasty':
      return world.dynasties.get(ref.id)?.name ?? '?';
  }
}

export const sameRef = (a: PageRef, b: PageRef) => a.kind === b.kind && a.id === b.id;
export const openOf = (ref: PageRef) => `${ref.kind}:${ref.id}`;
/** The page named by `open=` in a link, or null. */
export function pageFromOpen(text: string | null): PageRef | null {
  const found = parseOpen(text);
  if (!found) return null;
  if (found.kind === 'race') return { kind: 'race', id: found.id };
  const id = Number(found.id);
  return Number.isInteger(id) ? ({ kind: found.kind, id } as PageRef) : null;
}

export { cap };
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export const count = (n: number) => n.toLocaleString('en-US');

/** List-column span: "−30–28", or "213–" while it lasts. */
export const spanText = (from: number, to?: number) =>
  `${yearText(from)}–${to === undefined ? '' : yearText(to)}`;
/** Fact-row span: "−30 to 28", or "from 213" while it lasts. */
export const spanFact = (from: number, to?: number) =>
  to === undefined ? `from ${yearText(from)}` : `${yearText(from)} to ${yearText(to)}`;

/** Runs `go` for a plain left click; modified clicks are left to the browser (new tab, copy link). */
export function plainClick(event: React.MouseEvent, go: () => void) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  go();
}

/** A real anchor to a Legends page, so middle-click and copy-link work. */
export function Link({
  to,
  children,
  chip,
  className,
  title,
}: {
  to: PageRef;
  children: React.ReactNode;
  chip?: boolean;
  className?: string;
  title?: string;
}) {
  const { open, hrefOf } = useLegends();
  return (
    <a
      href={hrefOf(to)}
      title={title}
      className={className ?? (chip ? 'lg-ln lg-chip' : 'lg-ln')}
      onClick={(event) => plainClick(event, () => open(to))}
    >
      {children}
    </a>
  );
}

/** Wraps the first matches of `needle` in <mark>. */
export function Marked({ text, needle }: { text: string; needle?: string | undefined }) {
  if (!needle) return <>{text}</>;
  const lower = text.toLowerCase();
  const at = lower.indexOf(needle);
  if (at < 0) return <>{text}</>;
  const end = at + needle.length;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, end)}</mark>
      {text.slice(end)}
    </>
  );
}
