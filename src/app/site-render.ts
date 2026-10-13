// Site view drawing (M3.1): the pure parts (zoom steps, tile looks, hit testing, selection and
// role helpers) and the Canvas 2D renderer. The terrain is drawn once per zoom step and theme into
// an offscreen canvas and only blitted while panning; people are a separate pass on top.

import {
  DAYS_PER_YEAR,
  bandOfAge,
  siteCodes,
  sitePopulation,
  type Building,
  type Id,
  type LocalMap,
  type SiteCodes,
  type SiteRules,
  type WorldState,
} from '../engine';

// ---- zoom and view ----

/** Pixels per tile at the zoom steps after the first (the first fits the whole site). */
const FIXED_ZOOMS = [9, 14, 20, 28];
/** Tiles smaller or larger than this are never used for the whole-site step. */
const WHOLE_ZOOM_RANGE = [3, 8] as const;
/** Letters show on people from this many pixels per tile; two letters from the second. */
export const LETTERS_FROM = 14;
export const TWO_LETTERS_FROM = 20;
/** Building names show from this many pixels per tile. */
export const LABELS_FROM = 14;

/** Pixels per tile at each of the five zoom steps; the first is the whole site at the largest whole scale that fits. */
export function zoomSteps(mapWidthPx: number, mapSize: number): number[] {
  const whole = Math.max(
    WHOLE_ZOOM_RANGE[0],
    Math.min(WHOLE_ZOOM_RANGE[1], Math.floor(mapWidthPx / mapSize)),
  );
  return [whole, ...FIXED_ZOOMS];
}

export interface SiteViewport {
  /** Zoom step index and the tile at the centre of the view. */
  z: number;
  cx: number;
  cy: number;
}

/** Keeps the view over the map; a map smaller than the view is centred. */
export function clampViewport(
  view: SiteViewport,
  scale: number,
  vw: number,
  vh: number,
  size: number,
): SiteViewport {
  const hw = vw / scale / 2;
  const hh = vh / scale / 2;
  return {
    z: view.z,
    cx: hw * 2 >= size ? size / 2 : Math.max(hw, Math.min(size - hw, view.cx)),
    cy: hh * 2 >= size ? size / 2 : Math.max(hh, Math.min(size - hh, view.cy)),
  };
}

/** The tile under a point (pixels from the canvas's top-left), or null off the map. */
export function tileAtPoint(
  px: number,
  py: number,
  view: SiteViewport,
  scale: number,
  vw: number,
  vh: number,
  size: number,
): { x: number; y: number } | null {
  const x = Math.floor((px - vw / 2) / scale + view.cx);
  const y = Math.floor((py - vh / 2) / scale + view.cy);
  return x < 0 || y < 0 || x >= size || y >= size ? null : { x, y };
}

/** Screen position (pixels) of a tile's top-left corner. */
export function tileToScreen(
  x: number,
  y: number,
  view: SiteViewport,
  scale: number,
  vw: number,
  vh: number,
): [number, number] {
  return [(x - view.cx) * scale + vw / 2, (y - view.cy) * scale + vh / 2];
}

// ---- tile looks ----

/** What to draw on one tile: token names (without the `--`), the glyph and the elevation band (-1 = none). */
export interface TileLook {
  bg: string;
  glyph: string;
  ink: string;
  band: number;
  /** Colour token under a translucent background (counted walls). */
  under: string | null;
}

/** The map and the lookups a tile look needs. */
export interface LookCtx {
  map: LocalMap;
  rules: SiteRules;
  code: SiteCodes;
  buildings: ReadonlyMap<number, Building>;
  bridges: ReadonlySet<number>;
  doors: ReadonlySet<number>;
  /** Elevation band 0-3 per land tile (four equal steps between the lowest and highest land). */
  bands: Uint8Array;
}

/** Alpha of the shade drawn over each elevation band: 0 darkens (valleys), 2 and 3 lighten (hills). */
export const SHADE_ALPHA = [0.07, 0, 0.06, 0.12];

export function doorTile(b: Pick<Building, 'x' | 'y' | 'w' | 'h'>, size: number): number {
  return (b.y + b.h - 1) * size + b.x + (b.w >> 1);
}

export function elevationBands(map: LocalMap): Uint8Array {
  const total = map.width * map.height;
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < total; k += 1) {
    if (map.water[k] !== 0) continue;
    const e = map.elevation[k]!;
    if (e < lo) lo = e;
    if (e > hi) hi = e;
  }
  const bands = new Uint8Array(total);
  if (hi < lo) return bands;
  for (let k = 0; k < total; k += 1) {
    bands[k] = Math.max(0, Math.min(3, Math.floor(((map.elevation[k]! - lo) / (hi - lo + 1)) * 4)));
  }
  return bands;
}

export function makeLookCtx(
  map: LocalMap,
  rules: SiteRules,
  buildings: ReadonlyMap<number, Building>,
): LookCtx {
  const doors = new Set<number>();
  for (const b of buildings.values()) {
    if (b.defId === 'home' || b.defId === 'hall') doors.add(doorTile(b, map.width));
  }
  return {
    map,
    rules,
    code: siteCodes(rules),
    buildings,
    bridges: new Set(map.bridges),
    doors,
    bands: elevationBands(map),
  };
}

const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

const look = (bg: string, glyph: string, ink: string, band = -1, under: string | null = null) => ({
  bg,
  glyph,
  ink,
  band,
  under,
});

/** The look of tile `k`: tint token, glyph, glyph ink token, elevation band. */
export function tileLook(ctx: LookCtx, k: number): TileLook {
  const { map, rules, code } = ctx;
  const size = map.width;
  const x = k % size;
  const y = (k - x) / size;
  const band = ctx.bands[k]!;
  const b = map.building[k] ? ctx.buildings.get(map.building[k]!) : undefined;
  if (ctx.bridges.has(k)) return look('t-path', rules.bridgeGlyph, 't-door');
  // Being raised: bare ground here; the renderer draws the faded plan on top.
  if (b?.progress !== undefined) return look('t-grass', '', 't-grass-ink', band);
  if (b?.defId === 'field') return look('t-field', (x + y) % 2 ? '"' : '', 't-field-ink', band);
  if (b && (b.defId === 'home' || b.defId === 'hall')) {
    const counted = !b.followed;
    if (ctx.doors.has(k)) {
      return look(counted ? 't-counted' : 't-floor', '∩', counted ? 't-counted-ink' : 't-door');
    }
    if (map.terrain[k] === code.wall) {
      return counted
        ? look('t-cwall', '#', 't-cwall-ink', -1, 't-counted')
        : look('t-wall', '#', 't-wall-ink');
    }
    return counted
      ? look('t-counted', '', 't-counted-ink')
      : look('t-floor', (x + y) % 3 === 0 ? '·' : '', 't-floor-ink');
  }
  if (b) {
    const centre = b.x + (b.w >> 1) === x && b.y + (b.h >> 1) === y;
    const glyph = rules.buildings.find((def) => def.id === b.defId)?.glyph ?? '';
    return look('t-floor', centre || b.defId === 'stockpile' ? glyph : '·', 't-feature');
  }
  const water = map.water[k]!;
  if (water === code.sea || water === code.lake) {
    return look('t-sea', hash(x, y) % 5 === 0 ? rules.waters[water]!.glyph : '', 't-water-ink');
  }
  if (water === code.river) {
    return look('t-river', (x + 2 * y) % 3 === 0 ? rules.waters[water]!.glyph : '', 't-water-ink');
  }
  const terrain = map.terrain[k]!;
  if (terrain === code.shore) {
    return look('t-sand', hash(x, y) % 3 === 0 ? '.' : '', 't-sand-ink');
  }
  if (terrain === code.marsh) return look('t-marsh', '"', 't-marsh-ink');
  if (terrain === code.rock) {
    const mineral = map.mineral[k]!;
    const glyph = rules.minerals[mineral]?.glyph ?? '^';
    return mineral === code.ore || mineral === code.clay
      ? look('t-rock', glyph, mineral === code.ore ? 't-ore' : 't-rock-ink')
      : look('t-rock', '^', 't-rock-ink');
  }
  if (terrain === code.path) return look('t-path', '·', 't-path-ink');
  if (terrain === code.field) return look('t-field', (x + y) % 2 ? '"' : '', 't-field-ink', band);
  const tree = map.tree[k]!;
  if (tree) {
    const pine = tree === code.conifer;
    return look('t-wood', rules.trees[tree]?.glyph ?? '♣', pine ? 't-pine' : 't-tree', band);
  }
  if (terrain === code.scrub) return look('t-scrub', ';', 't-scrub-ink', band);
  return look('t-grass', hash(x, y) % 6 === 0 ? ',' : '', 't-grass-ink', band);
}

/** What the tile is, in words, for tooltips and the Inspect tile page. */
export function tileName(ctx: LookCtx, k: number, riverName: string, seaName: string): string {
  const { map, rules, code } = ctx;
  const b = map.building[k] ? ctx.buildings.get(map.building[k]!) : undefined;
  if (b) {
    if (b.progress !== undefined)
      return `${buildingLabel(rules, b.defId, false)} (being built, ${buildPercent(rules, b)}%)`;
    if (b.defId === 'home') return b.followed ? 'Home' : 'Home of a counted household';
    return buildingLabel(rules, b.defId, false);
  }
  if (ctx.bridges.has(k)) return `Bridge over ${riverName}`;
  const water = map.water[k]!;
  if (water === code.river) return cap(riverName);
  if (water === code.sea || water === code.lake) return water === code.sea ? cap(seaName) : 'Lake';
  if (map.tree[k]) return cap(rules.trees[map.tree[k]!]?.name ?? 'trees');
  if (map.mineral[k] === code.ore) return 'Iron in the rock';
  if (map.mineral[k] === code.clay) return 'Clay';
  return cap(rules.terrains[map.terrain[k]!]?.name ?? 'ground');
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** How far an unfinished building is, 0-100, from its progress and the builder-blocks it takes. */
export function buildPercent(rules: SiteRules, b: Pick<Building, 'defId' | 'progress'>): number {
  const work = rules.buildings.find((def) => def.id === b.defId)?.work ?? 1;
  return Math.max(0, Math.min(100, Math.round(((b.progress ?? 0) / work) * 100)));
}

/** A building's name for labels and pages; the hall is "Jarl's hall" where the ruler is a jarl. */
export function buildingLabel(rules: SiteRules, defId: string, jarl: boolean): string {
  const name = rules.buildings.find((def) => def.id === defId)?.name ?? defId;
  return defId === 'hall' && jarl ? "Jarl's hall" : cap(name);
}

/** Where to write "Fields": one spot (tile units, above the cluster's largest field) per cluster of touching fields. */
export function fieldLabelSpots(buildings: readonly Building[]): { x: number; y: number }[] {
  const fields = buildings.filter((b) => b.defId === 'field');
  const group = fields.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i]!)));
  const touch = (a: Building, b: Building) =>
    a.x <= b.x + b.w &&
    b.x <= a.x + a.w &&
    a.y <= b.y + b.h &&
    b.y <= a.y + a.h &&
    // Corner-to-corner contact is not adjacency.
    !((a.x + a.w === b.x || b.x + b.w === a.x) && (a.y + a.h === b.y || b.y + b.h === a.y));
  for (let i = 0; i < fields.length; i += 1)
    for (let j = i + 1; j < fields.length; j += 1)
      if (touch(fields[i]!, fields[j]!)) group[root(j)] = root(i);
  const best = new Map<number, Building>();
  fields.forEach((f, i) => {
    const r = root(i);
    const cur = best.get(r);
    if (!cur || f.w * f.h > cur.w * cur.h) best.set(r, f);
  });
  return [...best.values()].map((f) => ({ x: f.x + f.w / 2, y: f.y }));
}

/** What a culture's ruler is called in the site view: "jarl" for a jarldom, else "ruler". */
export function rulerWord(government: string | undefined): string {
  return government === 'jarldom' ? 'jarl' : 'ruler';
}

// ---- people ----

export type PersonRole = 'jarl' | 'notable' | 'elder' | 'child' | 'adult';

export interface PersonMark {
  id: Id;
  name: string;
  age: number;
  role: PersonRole;
  band: 'child' | 'adult' | 'elder';
  gifted: boolean;
  /** Tile index. */
  k: number;
}

/** First letters of a name: capitalised for adults, lower case for children. */
export function initials(name: string, count: number, child: boolean): string {
  const letters = (name.split(' ')[0] ?? '').slice(0, count);
  if (letters === '') return '?';
  return child
    ? letters.toLowerCase()
    : letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
}

export function roleOf(
  isRuler: boolean,
  notable: boolean,
  band: 'child' | 'adult' | 'elder',
): PersonRole {
  return isRuler
    ? 'jarl'
    : notable
      ? 'notable'
      : band === 'elder'
        ? 'elder'
        : band === 'child'
          ? 'child'
          : 'adult';
}

/** How a household member relates to the head ("spouse", "son", "grandchild"). */
export function relation(
  head: { id: Id; spouses: readonly Id[]; children: readonly Id[]; parents: readonly Id[] },
  member: { id: Id; sex: 'f' | 'm'; spouses: readonly Id[]; parents: readonly Id[] },
  parentsOf: (id: Id) => readonly Id[],
): string {
  if (member.id === head.id) return 'head of the household';
  const f = member.sex === 'f';
  if (head.spouses.includes(member.id) || member.spouses.includes(head.id)) return 'spouse';
  if (member.parents.includes(head.id)) return f ? 'daughter' : 'son';
  if (head.parents.includes(member.id)) return f ? 'mother' : 'father';
  if (member.parents.some((x) => head.children.includes(x))) return 'grandchild';
  if (head.parents.some((x) => parentsOf(x).includes(member.id))) {
    return f ? 'grandmother' : 'grandfather';
  }
  if (head.parents.some((x) => member.parents.includes(x))) return f ? 'sister' : 'brother';
  if (head.spouses.some((s) => parentsOf(s).includes(member.id))) {
    return f ? 'mother-in-law' : 'father-in-law';
  }
  if (member.spouses.some((s) => head.children.includes(s))) {
    return f ? 'daughter-in-law' : 'son-in-law';
  }
  return 'relative';
}

// ---- scene: everything the renderer and panels read about the watched site ----

export interface Scene {
  look: LookCtx;
  size: number;
  rules: SiteRules;
  marks: Map<Id, PersonMark>;
  /** People on each tile, in id order. */
  at: Map<number, Id[]>;
  buildings: Building[];
  counted: Building[];
  countedPeople: number;
  countedCentre: [number, number];
  jarl: boolean;
  /** Bounding box (x, y, w, h) of the followed homes and the hall: the "hall quarter". */
  quarter: [number, number, number, number];
}

export function buildScene(
  world: WorldState,
  rules: SiteRules,
  names: ReadonlyMap<Id, string>,
  races: readonly { id: string; maturityYears: number; lifespanYears: number }[],
  jarl: boolean,
): Scene {
  const active = world.activeSite;
  if (!active) throw new Error('No site is being watched.');
  const site = world.sites.get(active.siteId);
  const year = Math.floor(world.day / DAYS_PER_YEAR);
  const civ = site?.civId == null ? undefined : world.civs.get(site.civId);
  const promoted = new Set(active.promoted);
  const size = active.map.width;
  const marks = new Map<Id, PersonMark>();
  const at = new Map<number, Id[]>();
  for (const id of active.residents) {
    const person = world.people.get(id);
    const pos = person?.detail?.pos;
    if (!person || !pos) continue;
    const race = races.find((r) => r.id === person.raceId);
    const age = year - person.born;
    const band = race ? bandOfAge(race, age) : age < 16 ? 'child' : age < 50 ? 'adult' : 'elder';
    const k = pos[1] * size + pos[0];
    marks.set(id, {
      id,
      name: names.get(id) ?? person.name,
      age,
      role: roleOf(civ?.rulerId === id, !promoted.has(id), band),
      band,
      gifted: person.magic.power >= 3,
      k,
    });
    const list = at.get(k);
    if (list) list.push(id);
    else at.set(k, [id]);
  }
  const buildings = [...active.buildings.values()];
  const counted = buildings.filter((b) => b.defId === 'home' && !b.followed);
  const total = site ? sitePopulation(site) : active.residents.length;
  const countedPeople = counted.length > 0 ? Math.max(0, total - active.residents.length) : 0;
  const centre: [number, number] = [0, 0];
  for (const b of counted) {
    centre[0] += (b.x + b.w / 2) / counted.length;
    centre[1] += (b.y + b.h / 2) / counted.length;
  }
  return {
    look: makeLookCtx(active.map, rules, active.buildings),
    size,
    rules,
    marks,
    at,
    buildings,
    counted,
    countedPeople,
    countedCentre: centre,
    jarl,
    quarter: quarterOf(buildings),
  };
}

/** Rebuilds what depends on the buildings and map layers, in place (after a snapshot with a new layout). */
export function refreshLayout(scene: Scene, world: WorldState, rules: SiteRules): void {
  const active = world.activeSite;
  if (!active) return;
  scene.look = makeLookCtx(active.map, rules, active.buildings);
  scene.buildings = [...active.buildings.values()];
  scene.counted = scene.buildings.filter((b) => b.defId === 'home' && !b.followed);
  scene.quarter = quarterOf(scene.buildings);
}

/** Moves every mark to where its person now is (after a snapshot) and rebuilds `at`, in place. */
export function movePeople(scene: Scene, world: WorldState): void {
  scene.at.clear();
  for (const mark of scene.marks.values()) {
    const pos = world.people.get(mark.id)?.detail?.pos;
    if (pos) mark.k = pos[1] * scene.size + pos[0];
    const list = scene.at.get(mark.k);
    if (list) list.push(mark.id);
    else scene.at.set(mark.k, [mark.id]);
  }
}

/** Bounding box (x, y, w, h) of the followed homes and the hall: the "hall quarter". */
export function quarterOf(buildings: readonly Building[]): Scene['quarter'] {
  const hubs = buildings.filter((b) => (b.defId === 'home' && b.followed) || b.defId === 'hall');
  if (hubs.length === 0) return [0, 0, 0, 0];
  const x0 = Math.min(...hubs.map((b) => b.x));
  const y0 = Math.min(...hubs.map((b) => b.y));
  return [
    x0,
    y0,
    Math.max(...hubs.map((b) => b.x + b.w)) - x0,
    Math.max(...hubs.map((b) => b.y + b.h)) - y0,
  ];
}

// ---- selection ----

export interface Selection {
  kind: 'person' | 'household' | 'building' | 'tile';
  /** Person, household or building id, or the tile index. */
  id: number;
}

/** "person:776", "household:3", "building:5" or "tile:65,47" for the link. */
export function formatSelection(sel: Selection, size: number): string {
  return sel.kind === 'tile'
    ? `tile:${sel.id % size},${Math.floor(sel.id / size)}`
    : `${sel.kind}:${sel.id}`;
}

export function parseSelection(text: string | null, size: number): Selection | null {
  const found = /^(person|household|building|tile):(\d{1,9})(?:,(\d{1,3}))?$/.exec(text ?? '');
  if (!found) return null;
  const kind = found[1] as Selection['kind'];
  if (kind === 'tile') {
    const x = Number(found[2]);
    const y = Number(found[3]);
    return found[3] === undefined || x >= size || y >= size ? null : { kind, id: y * size + x };
  }
  return found[3] === undefined ? { kind, id: Number(found[2]) } : null;
}

/** The tile rectangle a selection covers: x, y, width, height. */
export function selectionRect(
  scene: Scene,
  sel: Selection,
  homeOf: (householdId: number) => number | null,
): [number, number, number, number] | null {
  const size = scene.size;
  if (sel.kind === 'person') {
    const mark = scene.marks.get(sel.id);
    return mark ? [mark.k % size, Math.floor(mark.k / size), 1, 1] : null;
  }
  if (sel.kind === 'tile') return [sel.id % size, Math.floor(sel.id / size), 1, 1];
  const id = sel.kind === 'building' ? sel.id : homeOf(sel.id);
  const b = scene.buildings.find((x) => x.id === id);
  return b ? [b.x, b.y, b.w, b.h] : null;
}

// ---- colours ----

export const TOKENS = [
  't-void',
  't-grass',
  't-grass-ink',
  't-scrub',
  't-scrub-ink',
  't-wood',
  't-tree',
  't-pine',
  't-marsh',
  't-marsh-ink',
  't-river',
  't-sea',
  't-water-ink',
  't-sand',
  't-sand-ink',
  't-rock',
  't-rock-ink',
  't-ore',
  't-field',
  't-field-ink',
  't-path',
  't-path-ink',
  't-floor',
  't-floor-ink',
  't-door',
  't-wall',
  't-wall-ink',
  't-counted',
  't-counted-ink',
  't-cwall',
  't-cwall-ink',
  't-feature',
  't-lite',
  't-shade',
  't-person',
  't-person-ink',
  't-person-line',
  't-child-ink',
  't-mark',
  'ring-jarl',
  'ring-elder',
  'ring-child',
  't-sel',
  'legend',
  'ink',
  'panel',
  'line',
] as const;
export type Colors = Record<(typeof TOKENS)[number], string>;

export function readColors(): Colors {
  const style = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const token of TOKENS) out[token] = style.getPropertyValue(`--${token}`).trim();
  return out as Colors;
}

type Rgb = [number, number, number];
let probe: CanvasRenderingContext2D | null = null;
const rgbCache = new Map<string, Rgb>();
/** A CSS colour as rgb, by painting it on a one-pixel canvas. */
function toRgb(color: string): Rgb {
  let found = rgbCache.get(color);
  if (!found) {
    if (!probe) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      probe = canvas.getContext('2d', { willReadFrequently: true })!;
    }
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const data = probe.getImageData(0, 0, 1, 1).data;
    found = [data[0]!, data[1]!, data[2]!];
    rgbCache.set(color, found);
  }
  return found;
}
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] * (1 - t) + b[0] * t),
  Math.round(a[1] * (1 - t) + b[1] * t),
  Math.round(a[2] * (1 - t) + b[2] * t),
];

/** The whole map at one pixel a tile (people as marks), for the overview and the confirm thumbnail. */
export function drawMapBase(
  look: LookCtx,
  colors: Colors,
  marks: Iterable<number>,
  into: HTMLCanvasElement,
): void {
  const size = look.map.width;
  into.width = into.height = size;
  const context = into.getContext('2d')!;
  const img = context.createImageData(size, size);
  for (let k = 0; k < size * size; k += 1) {
    const l = tileLook(look, k);
    let c = toRgb(colors[l.bg as keyof Colors]);
    if (l.under) c = mixRgb(toRgb(colors[l.under as keyof Colors]), c, 0.6);
    const alpha = l.band >= 0 ? SHADE_ALPHA[l.band]! : 0;
    if (alpha) c = mixRgb(c, toRgb(l.band === 0 ? colors['t-shade'] : colors['t-lite']), alpha);
    if (look.map.tree[k] && !look.map.building[k] && !look.map.water[k]) {
      c = toRgb(colors[l.ink as keyof Colors]);
    }
    img.data.set([c[0], c[1], c[2], 255], k * 4);
  }
  const mark = toRgb(colors['t-mark']);
  for (const k of marks) img.data.set([mark[0], mark[1], mark[2], 255], k * 4);
  context.putImageData(img, 0, 0);
}

// ---- the renderer ----

const RING: Record<string, [keyof Colors, number]> = {
  jarl: ['ring-jarl', 0.2],
  notable: ['legend', 0.15],
  elder: ['ring-elder', 0.12],
  child: ['ring-child', 0.1],
};
/** Cap on the offscreen terrain layer, in pixels a side. */
const TERRAIN_CACHE_PX = 3000;

export interface RenderState {
  view: SiteViewport;
  selected: { rect: [number, number, number, number] | null; personId: Id | null };
  hoverId: Id | null;
  cursor: { x: number; y: number } | null;
}

export class SiteRenderer {
  readonly canvas: HTMLCanvasElement;
  colors: Colors;
  zooms: number[];
  vw = 0;
  vh = 0;
  dpr = 1;
  state: RenderState;
  /** The pixel-a-tile base, redrawn when the theme changes; the overview blits it. */
  readonly base = document.createElement('canvas');
  private readonly terrain = document.createElement('canvas');
  private terrainKey = '';
  private terrainScale = 1;
  private themeVersion = 0;
  private frame = 0;
  /** Discs walking from where they were to where the last snapshot put them. */
  private tween: { from: Map<Id, number>; start: number; ms: number } | null = null;
  private readonly onPaint: (info: { zoomLabel: string; whole: boolean }) => void;

  constructor(
    canvas: HTMLCanvasElement,
    private scene: Scene,
    state: RenderState,
    onPaint: (info: { zoomLabel: string; whole: boolean }) => void,
  ) {
    this.canvas = canvas;
    this.colors = readColors();
    this.zooms = zoomSteps(0, scene.size);
    this.state = state;
    this.onPaint = onPaint;
    this.rebuildBase();
  }

  get scale(): number {
    return this.zooms[this.state.view.z]!;
  }

  /** Re-reads the theme tokens (after a theme change) and drops the cached layers. */
  retheme(): void {
    this.colors = readColors();
    this.themeVersion += 1;
    this.rebuildBase();
    this.draw();
  }

  private rebuildBase(): void {
    drawMapBase(
      this.scene.look,
      this.colors,
      [...this.scene.marks.values()].map((m) => m.k),
      this.base,
    );
  }

  /** Drops the cached terrain after the buildings or map changed, and redraws. */
  refreshLayout(): void {
    this.terrainKey = '';
    this.rebuildBase();
    this.draw();
  }

  /** Redraws after people moved: the pixel-a-tile base (and so the overview) shows them as marks. */
  refreshPeople(): void {
    this.rebuildBase();
    this.draw();
  }

  /**
   * Walks each disc that moved from its tile in `from` (tile index by person) to its tile now, in a
   * straight line over `ms`. Call after `movePeople`. Does nothing for `ms <= 0` or when the reader
   * prefers reduced motion.
   */
  beginTween(from: Map<Id, number>, ms: number): void {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (ms <= 0 || reduced) {
      this.tween = null;
      return;
    }
    const moved = new Map<Id, number>();
    for (const [id, k] of from) if (this.scene.marks.get(id)?.k !== k) moved.set(id, k);
    this.tween = moved.size > 0 ? { from: moved, start: performance.now(), ms } : null;
  }

  /** Tile coordinates (fractional while walking) where a person's disc is drawn. */
  private placeOf(mark: PersonMark, progress: number): [number, number] {
    const size = this.scene.size;
    const x = mark.k % size;
    const y = (mark.k - x) / size;
    const prev = progress < 1 ? this.tween?.from.get(mark.id) : undefined;
    if (prev === undefined) return [x, y];
    const px = prev % size;
    const py = (prev - px) / size;
    return [px + (x - px) * progress, py + (y - py) * progress];
  }

  /** Sizes the canvas to its box; returns false while the box has no size. */
  resize(): boolean {
    const box = this.canvas.getBoundingClientRect();
    this.vw = box.width;
    this.vh = box.height;
    this.dpr = window.devicePixelRatio || 1;
    if (!this.vw) return false;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.zooms = zoomSteps(this.vw, this.scene.size);
    return true;
  }

  clamp(): void {
    this.state.view = clampViewport(this.state.view, this.scale, this.vw, this.vh, this.scene.size);
  }

  /** One paint a frame, however many requests arrive. */
  draw(): void {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.paint());
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private terrainLayer(): number {
    const { scene } = this;
    const s = this.scale;
    const key = `${s}|${this.themeVersion}|${this.dpr}`;
    if (this.terrainKey === key) return this.terrainScale;
    const f = Math.min(this.dpr, TERRAIN_CACHE_PX / (scene.size * s));
    const side = Math.ceil(scene.size * s * f);
    this.terrain.width = this.terrain.height = side;
    const t = this.terrain.getContext('2d')!;
    t.setTransform(f, 0, 0, f, 0, 0);
    const C = this.colors;
    const total = scene.size * scene.size;
    const looks: TileLook[] = new Array(total);
    for (let k = 0; k < total; k += 1) {
      const x = k % scene.size;
      const y = (k - x) / scene.size;
      const l = (looks[k] = tileLook(scene.look, k));
      if (l.under) {
        t.fillStyle = C[l.under as keyof Colors];
        t.fillRect(x * s, y * s, s + 0.5, s + 0.5);
        t.globalAlpha = 0.6;
      }
      t.fillStyle = C[l.bg as keyof Colors];
      t.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      t.globalAlpha = 1;
      const alpha = l.band >= 0 ? SHADE_ALPHA[l.band]! : 0;
      if (alpha) {
        t.globalAlpha = alpha;
        t.fillStyle = l.band === 0 ? C['t-shade'] : C['t-lite'];
        t.fillRect(x * s, y * s, s + 0.5, s + 0.5);
        t.globalAlpha = 1;
      }
    }
    // Buildings being raised: the plan drawn faded, dashed round, with its glyph.
    for (const b of scene.buildings) {
      if (b.progress === undefined) continue;
      t.fillStyle = C['t-floor'];
      t.globalAlpha = 0.35;
      t.fillRect(b.x * s, b.y * s, b.w * s, b.h * s);
      t.globalAlpha = 1;
      t.save();
      t.strokeStyle = C['t-feature'];
      t.lineWidth = Math.max(1, s * 0.09);
      t.setLineDash([Math.max(2, s * 0.25), Math.max(2, s * 0.2)]);
      t.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s);
      t.restore();
    }
    // Counted homes: hatching inside and a dotted outline around the whole home.
    for (const b of scene.counted) {
      t.save();
      t.beginPath();
      t.rect((b.x + 1) * s, (b.y + 1) * s, (b.w - 2) * s, (b.h - 2) * s);
      t.clip();
      t.strokeStyle = C['t-counted-ink'];
      t.lineWidth = 1;
      t.beginPath();
      const step = Math.max(3, s * 0.4);
      const W = b.w * s;
      const H = b.h * s;
      for (let i = -H; i < W; i += step) {
        t.moveTo(b.x * s + i, b.y * s + H);
        t.lineTo(b.x * s + i + H, b.y * s);
      }
      t.stroke();
      t.restore();
      t.save();
      t.strokeStyle = C['t-counted-ink'];
      t.lineWidth = Math.max(1, s * 0.09);
      t.setLineDash([Math.max(1.5, s * 0.14), Math.max(2, s * 0.2)]);
      const o = Math.max(1, s * 0.12);
      t.strokeRect(b.x * s - o, b.y * s - o, b.w * s + 2 * o, b.h * s + 2 * o);
      t.restore();
    }
    if (s >= LETTERS_FROM) {
      t.textAlign = 'center';
      t.textBaseline = 'middle';
      t.font = `600 ${Math.round(s * 0.78)}px ui-monospace, Menlo, Consolas, monospace`;
      for (let k = 0; k < total; k += 1) {
        const l = looks[k]!;
        if (!l.glyph) continue;
        t.fillStyle = C[l.ink as keyof Colors];
        t.fillText(
          l.glyph,
          (k % scene.size) * s + s / 2,
          Math.floor(k / scene.size) * s + s / 2 + 1,
        );
      }
      t.globalAlpha = 0.55;
      for (const b of scene.buildings) {
        if (b.progress === undefined) continue;
        const glyph = scene.rules.buildings.find((def) => def.id === b.defId)?.glyph;
        if (!glyph) continue;
        t.fillStyle = C['t-feature'];
        t.fillText(glyph, (b.x + (b.w >> 1)) * s + s / 2, (b.y + (b.h >> 1)) * s + s / 2 + 1);
      }
      t.globalAlpha = 1;
      t.font = `600 ${Math.max(11, Math.round(s * 0.55))}px system-ui, sans-serif`;
      for (const b of scene.buildings) {
        if (b.defId === 'home' || b.defId === 'field') continue;
        const label = buildingLabel(scene.rules, b.defId, scene.jarl);
        const sx = (b.x + b.w / 2) * s;
        const sy = (b.y - 0.15) * s;
        t.lineWidth = 3;
        t.strokeStyle = C.panel;
        t.strokeText(label, sx, sy);
        t.fillStyle = C.ink;
        t.fillText(label, sx, sy);
      }
      for (const spot of fieldLabelSpots(scene.buildings)) {
        const sx = spot.x * s;
        const sy = (spot.y - 0.15) * s;
        t.lineWidth = 3;
        t.strokeStyle = C.panel;
        t.strokeText('Fields', sx, sy);
        t.fillStyle = C.ink;
        t.fillText('Fields', sx, sy);
      }
    }
    this.terrainKey = key;
    this.terrainScale = f;
    return f;
  }

  private label(ctx: CanvasRenderingContext2D, text: string, sx: number, sy: number): void {
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.colors.panel;
    ctx.strokeText(text, sx, sy);
    ctx.fillStyle = this.colors.ink;
    ctx.fillText(text, sx, sy);
  }

  private paint(): void {
    this.frame = 0;
    if (!this.vw) return;
    const ctx = this.canvas.getContext('2d')!;
    const { scene, state, colors: C } = this;
    const size = scene.size;
    const s = this.scale;
    const { view } = state;
    const whole = view.z === 0;
    const { vw, vh } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = C['t-void'];
    ctx.fillRect(0, 0, vw, vh);
    const f = this.terrainLayer();
    const tx0 = Math.max(0, view.cx - vw / s / 2);
    const tx1 = Math.min(size, view.cx + vw / s / 2);
    const ty0 = Math.max(0, view.cy - vh / s / 2);
    const ty1 = Math.min(size, view.cy + vh / s / 2);
    const [dx, dy] = tileToScreen(tx0, ty0, view, s, vw, vh);
    ctx.drawImage(
      this.terrain,
      tx0 * s * f,
      ty0 * s * f,
      (tx1 - tx0) * s * f,
      (ty1 - ty0) * s * f,
      dx,
      dy,
      (tx1 - tx0) * s,
      (ty1 - ty0) * s,
    );
    const first = tileAtPoint(0, 0, view, s, vw, vh, 1e6) ?? { x: 0, y: 0 };
    const last = tileAtPoint(vw, vh, view, s, vw, vh, 1e6) ?? { x: size, y: size };
    // The counted quarter, summed up in one marker.
    if (view.z >= 1 && scene.countedPeople > 0) {
      const [px, py] = tileToScreen(
        scene.countedCentre[0],
        scene.countedCentre[1],
        view,
        s,
        vw,
        vh,
      );
      const text = `${scene.countedPeople} counted`;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(text).width + 16;
      if (px > -w && px < vw + w && py > -20 && py < vh + 20) {
        ctx.beginPath();
        ctx.roundRect(px - w / 2, py - 10, w, 20, 10);
        ctx.fillStyle = C.panel;
        ctx.fill();
        ctx.setLineDash([3, 2]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = C['t-counted-ink'];
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.ink;
        ctx.fillText(text, px, py + 0.5);
      }
    }
    // People, a separate pass over the terrain.
    const letters = s >= LETTERS_FROM;
    const two = s >= TWO_LETTERS_FROM;
    const selectedId = state.selected.personId;
    const tween = whole ? null : this.tween;
    const progress = tween ? Math.min(1, (performance.now() - tween.start) / tween.ms) : 1;
    const walking = tween && progress < 1 ? tween.from : null;
    const disc = (mark: PersonMark, ids: Id[], x: number, y: number) => {
      const [sx, sy] = tileToScreen(x, y, view, s, vw, vh);
      const cx = sx + s / 2;
      const cy = sy + s / 2;
      const rad = Math.max(2, s * 0.44);
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = C['t-person'];
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = C['t-person-line'];
      ctx.stroke();
      const ring = RING[mark.role];
      if (ring) {
        const lw = Math.max(1.5, s * ring[1] * 0.6);
        ctx.beginPath();
        ctx.arc(cx, cy, rad + lw / 2, 0, Math.PI * 2);
        ctx.lineWidth = lw;
        ctx.strokeStyle = C[ring[0]];
        ctx.stroke();
      }
      if (letters) {
        const child = mark.band === 'child';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.round(s * (two ? 0.42 : 0.6))}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.fillStyle = child ? C['t-child-ink'] : C['t-person-ink'];
        ctx.fillText(initials(mark.name, two ? 2 : 1, child), cx, cy + 1);
        if (ids.length > 1 && s >= TWO_LETTERS_FROM) {
          ctx.font = `700 ${Math.round(s * 0.36)}px system-ui`;
          ctx.fillStyle = C.ink;
          ctx.fillText(`+${ids.length - 1}`, sx + s * 0.92, sy + s * 0.1);
        }
        if (ids.some((id) => scene.marks.get(id)?.gifted)) {
          ctx.font = `700 ${Math.round(s * 0.36)}px system-ui`;
          ctx.fillStyle = C.legend;
          ctx.fillText('✦', sx + s * 0.1, sy + s * 0.1);
        }
      }
    };
    for (const [k, all] of scene.at) {
      const x = k % size;
      const y = (k - x) / size;
      if (x < first.x - 1 || x > last.x + 1 || y < first.y - 1 || y > last.y + 1) continue;
      if (whole) {
        const [sx, sy] = tileToScreen(x, y, view, s, vw, vh);
        const m = Math.max(2, Math.round(s * 0.7));
        ctx.fillStyle = C['t-mark'];
        ctx.fillRect(Math.round(sx + s / 2 - m / 2), Math.round(sy + s / 2 - m / 2), m, m);
        continue;
      }
      // Walkers are drawn on their way below, not stacked on the tile they are heading for.
      const ids = walking ? all.filter((id) => !walking.has(id)) : all;
      if (ids.length === 0) continue;
      const shown = selectedId !== null && ids.includes(selectedId) ? selectedId : ids[0]!;
      disc(scene.marks.get(shown)!, ids, x, y);
    }
    if (walking) {
      for (const id of walking.keys()) {
        const mark = scene.marks.get(id);
        if (!mark) continue;
        const [x, y] = this.placeOf(mark, progress);
        if (x < first.x - 2 || x > last.x + 2 || y < first.y - 2 || y > last.y + 2) continue;
        disc(mark, [id], x, y);
      }
      this.draw();
    } else this.tween = null;
    // Names for the selected and the hovered person.
    if (!whole) {
      const named = new Set<Id>();
      if (selectedId !== null) named.add(selectedId);
      if (state.hoverId !== null) named.add(state.hoverId);
      for (const id of named) {
        const mark = scene.marks.get(id);
        if (!mark) continue;
        const [tx, ty] = this.placeOf(mark, progress);
        const [sx, sy] = tileToScreen(tx, ty, view, s, vw, vh);
        this.label(
          ctx,
          mark.name,
          sx + s / 2,
          sy - Math.max(3, s * 0.1) - (s >= 14 ? s * 0.05 : 0),
        );
      }
    }
    // Selection and the keyboard cursor.
    const rect = state.selected.rect;
    if (rect) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = C['t-sel'];
      const [sx, sy] = tileToScreen(rect[0], rect[1], view, s, vw, vh);
      ctx.strokeRect(sx - 1, sy - 1, rect[2] * s + 2, rect[3] * s + 2);
    }
    if (state.cursor) {
      const [sx, sy] = tileToScreen(state.cursor.x, state.cursor.y, view, s, vw, vh);
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeStyle = C.panel;
      ctx.strokeRect(sx, sy, s, s);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = C.ink;
      ctx.strokeRect(sx, sy, s, s);
      ctx.setLineDash([]);
    }
    this.onPaint({ zoomLabel: `Zoom ${view.z + 1} of ${this.zooms.length}`, whole });
  }

  /** Draws the cached base and the view box onto the overview canvas. */
  drawOverview(target: HTMLCanvasElement): void {
    const { view } = this.state;
    if (view.z === 0 || !target.offsetParent) return;
    const context = target.getContext('2d')!;
    const px = target.width;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, px, px);
    context.drawImage(this.base, 0, 0, px, px);
    const s = this.scale;
    const w = this.vw / s;
    const h = this.vh / s;
    const f = px / this.scene.size;
    context.lineWidth = 2;
    context.strokeStyle = this.colors['t-sel'];
    context.strokeRect(
      (view.cx - w / 2) * f,
      (view.cy - h / 2) * f,
      Math.min(this.scene.size, w) * f,
      Math.min(this.scene.size, h) * f,
    );
  }
}

/** Draws the confirm thumbnail: the map at one pixel a tile with the followed quarter outlined. */
export function drawThumbnail(
  target: HTMLCanvasElement,
  look: LookCtx,
  quarter: Scene['quarter'] | null,
): void {
  const colors = readColors();
  const base = document.createElement('canvas');
  drawMapBase(look, colors, [], base);
  target.width = target.height = look.map.width;
  const context = target.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.drawImage(base, 0, 0);
  if (quarter && quarter[2] > 0) {
    context.lineWidth = 1;
    context.strokeStyle = colors['t-sel'];
    context.strokeRect(quarter[0] - 0.5, quarter[1] - 0.5, quarter[2] + 1, quarter[3] + 1);
  }
}
