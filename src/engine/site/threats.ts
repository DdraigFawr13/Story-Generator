// Threats at the watched site (M3.8). Wild prowlers take a lone worker far from the village; a
// beast out of its lair or a band of raiders from a civ with a grievance is first seen outside the
// town on its side and makes for the stores. A great or legendary beast and a raid are seen days
// ahead; the day before a beast comes, if the able adults are too weak, everyone walks to a camp
// toward the nearest other site and comes home when it has gone. Otherwise the militia (the
// strongest able adults, up to twice the attackers' strength) goes out to meet the attackers,
// everyone else shelters at home, and blows are traded each block. Beaten or done, the attackers
// stand one more block and are gone: nothing wanders off across the map.
//
// A day (block 0) `runThreatsDay` rolls prowlers and new threats, turns a warning into an arrival
// and settles a threat that has left. A block `planThreat` says who defends, shelters or flees
// (before the profiles are built), and `resolveThreat` (after everyone has walked) moves the
// attackers, trades blows and loots. Every number and phrase is content (content/threats.ts);
// randomness is the `site.threats` stream, people and civs in id order. This file opens and
// settles threats; prowlers.ts holds the prowlers, threat-fight.ts the block, threat-common.ts
// the ground, the fighters and the walls.

import { DAYS_PER_YEAR } from '../core/clock';
import type { CreatureDef, ThreatRules } from '../core/content-types';
import { clamp, sortedById } from '../core/math';
import { streamFor, type RngStream } from '../core/rng';
import type {
  ActiveSite,
  Civ,
  Creature,
  Id,
  SimEvent,
  Site,
  SiteThreat,
  SiteThreats,
  WorldState,
} from '../core/types';
import { bandCount } from '../history/pop';
import { cellDistance } from '../history/settle';
import { type SiteLabel } from './build';
import { type SiteContent } from './defs';
import { envOf } from './social';
import { refuge, relocate } from './society';
import { foodMeals } from './stock';

import {
  ableAdults,
  alive,
  approachToward,
  attackOf,
  compassWord,
  histYear,
  homesStanding,
  lairClause,
  lastOf,
  planWalls,
  remember,
  setLast,
  strengthOf,
  targetOf,
  wallsFacing,
  weaponsOf,
  type Emit,
} from './threat-common';
import { prowl } from './prowlers';

export { beginWall } from './threat-common';
export * from './threat-fight';

export function blankThreats(): SiteThreats {
  return {
    lastBeast: [],
    lastRaid: [],
    wallPlan: [],
    stats: {
      prowlers: 0,
      beasts: 0,
      raids: 0,
      flights: 0,
      slain: 0,
      repelled: 0,
      deaths: 0,
      wounds: 0,
      looted: 0,
      walls: 0,
    },
  };
}

// ---- Opening a threat ----

/** The latest history event behind `from`'s grievance against `to` (its civ), if any. */
function grievanceEvent(world: WorldState, from: Civ, to: Civ): Id | undefined {
  for (let i = world.events.length - 1; i >= 0; i -= 1) {
    const e = world.events[i]!;
    const d = e.data;
    if (
      ((e.type === 'civ_raid' ||
        e.type === 'plunder_raid' ||
        e.type === 'vengeance_raid' ||
        e.type === 'insult') &&
        d['civ'] === to.name &&
        d['victim'] === from.name) ||
      (e.type === 'border_clash' &&
        ((d['civ'] === to.name && d['other'] === from.name) ||
          (d['civ'] === from.name && d['other'] === to.name)))
    ) {
      return e.id;
    }
  }
  return undefined;
}

/**
 * The size of a band that rides from a home with `adults` grown people, `share` of whom are
 * followed, against a site with `targetAdults` able adults: never more than `targetShare` of them.
 */
export function raidBand(
  rules: ThreatRules,
  adults: number,
  share: number,
  targetAdults: number,
): number {
  const most = Math.max(rules.raids.band[0], Math.floor(targetAdults * rules.raids.targetShare));
  return Math.min(
    most,
    clamp(
      Math.round(adults * rules.raids.bandShare * share),
      rules.raids.band[0],
      rules.raids.band[1],
    ),
  );
}

/** Creatures whose nearest live site in range is this one, in id order (kept until the site changes). */
const nearby = new WeakMap<ActiveSite, Id[]>();
function lairsNear(world: WorldState, content: SiteContent, active: ActiveSite, site: Site): Id[] {
  let found = nearby.get(active);
  if (!found) {
    found = [];
    const width = world.params.width;
    const defs = new Map(content.creatures.map((d) => [d.id, d]));
    const live = sortedById(world.sites.values()).filter((s) => s.ruinedYear === undefined);
    for (const c of sortedById(world.creatures.values())) {
      const def = defs.get(c.defId);
      if (!def || cellDistance(width, c.lair, site.cell) > def.raidRange) continue;
      let best: Site | undefined;
      let bestDistance = Infinity;
      for (const s of live) {
        const d = cellDistance(width, c.lair, s.cell);
        if (d <= def.raidRange && d < bestDistance) {
          best = s;
          bestDistance = d;
        }
      }
      if (best?.id === site.id) found.push(c.id);
    }
    nearby.set(active, found);
  }
  return found;
}

interface BeastSource {
  creature: Creature;
  def: CreatureDef;
}
interface RaidSource {
  civ: Civ;
  home: Site;
}

/** The day's roll for a beast: any living creature near enough whose nearest site this is. */
function rollBeast(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  site: Site,
  rng: RngStream,
): BeastSource | null {
  const rules = content.threats.beasts;
  const defs = new Map(content.creatures.map((d) => [d.id, d]));
  for (const id of lairsNear(world, content, active, site)) {
    const creature = world.creatures.get(id);
    const def = creature && defs.get(creature.defId);
    if (!creature || !def || creature.died !== undefined) continue;
    if (world.day - lastOf(active.threats.lastBeast, id) < rules.cooldownDays) continue;
    if (rng.chance((def.raidChance * rules.chanceMul) / DAYS_PER_YEAR)) return { creature, def };
  }
  return null;
}

/** The day's roll for a raid: each civ with a grievance (or at war, once wars are on the world). */
function rollRaid(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  site: Site,
  rng: RngStream,
): RaidSource | null {
  const rules = content.threats.raids;
  const mine = site.civId === null ? undefined : world.civs.get(site.civId);
  if (!mine) return null;
  const width = world.params.width;
  for (const civ of sortedById(world.civs.values())) {
    if (civ.id === mine.id || civ.fell !== undefined) continue;
    const grievance = civ.grievances.get(mine.id) ?? 0;
    if (grievance < rules.minGrievance) continue;
    if (world.day - lastOf(active.threats.lastRaid, civ.id) < rules.cooldownDays) continue;
    let home: Site | undefined;
    let best = Infinity;
    for (const s of sortedById(world.sites.values())) {
      if (s.civId !== civ.id || s.ruinedYear !== undefined || bandCount(s, 'adult') === 0) continue;
      const d = cellDistance(width, s.cell, site.cell);
      if (d <= rules.reach && d < best) {
        home = s;
        best = d;
      }
    }
    if (!home) continue;
    const war = content.cultures.find((c) => c.id === civ.cultureId)?.values['war'] ?? 0;
    const chance = (rules.perYear * (war / 10) * Math.min(1, grievance)) / DAYS_PER_YEAR;
    if (rng.chance(chance)) return { civ, home };
  }
  return null;
}

/**
 * Everyone on their feet walks to the camp when the able adults cannot stand against a great or
 * legendary beast. Judged once, the day before it comes (or as it comes, unannounced).
 */
function judgeFlight(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  site: Site,
  t: SiteThreat,
  emit: Emit,
  label: SiteLabel,
): void {
  t.judged = true;
  if (t.kind !== 'beast' || t.tier === 'beast') return;
  const danger = content.creatures.find((d) => d.id === t.defId)?.danger ?? 0;
  const walls = wallsFacing(content, active, t.edge);
  const weapons = weaponsOf(world, content, active);
  let strength = 0;
  for (const p of ableAdults(world, content, active)) {
    strength += strengthOf(content, p, weapons.get(p.id) ?? 0, walls);
  }
  if (strength >= content.threats.flight.fleeBelow * danger) return;
  const dest = refuge(world, active);
  if (!dest) return;
  const width = world.params.width;
  t.fled = true;
  t.refugeId = dest.id;
  t.camp = approachToward(
    content,
    active,
    (dest.cell % width) - (site.cell % width),
    Math.floor(dest.cell / width) - Math.floor(site.cell / width),
  );
  const event = emit({
    type: content.threats.events.flight,
    place: label.cell,
    causes: t.signEvent === undefined ? [] : [t.signEvent],
    data: { site: label.name, refuge: dest.name, threat: t.name },
  });
  t.fleeEvent = event.id;
  active.threats.stats.flights += 1;
}

/** Opens a beast or raid threat: a sign now and the arrival in a few days, or the arrival today. */
function openThreat(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  site: Site,
  rng: RngStream,
  emit: Emit,
  label: SiteLabel,
  source: BeastSource | RaidSource,
): void {
  const rules = content.threats;
  const width = world.params.width;
  const to = 'creature' in source ? source.creature.lair : source.home.cell;
  const dx = (to % width) - (site.cell % width);
  const dy = Math.floor(to / width) - Math.floor(site.cell / width);
  const edge = approachToward(content, active, dx, dy);
  const dir = compassWord(rules, dx, dy);
  active.threats.lastThreatDay = world.day;
  const base = {
    stage: 'warned' as const,
    count: 1,
    came: 1,
    vigour: 1,
    tile: -1,
    edge,
    target: targetOf(active),
    arriveDay: world.day,
    dir,
    whence: '',
    rounds: 0,
    ravaged: 0,
    fled: false,
    wounded: 0,
    killed: 0,
    attackersDown: 0,
    loot: 0,
    militia: [],
    residentsAtArrival: active.residents.length,
  };
  let warn: boolean;
  let sign = '';
  let t: SiteThreat;
  const causes: Id[] = [];
  if ('creature' in source) {
    const { creature, def } = source;
    setLast(active.threats.lastBeast, creature.id, world.day);
    t = {
      ...base,
      kind: 'beast',
      name: creature.name,
      glyph: rules.beasts.glyphs[def.id] ?? 'B',
      creatureId: creature.id,
      defId: def.id,
      tier: def.tier,
      whence: lairClause(world, rules, creature.lair, dir),
    };
    warn = def.tier !== 'beast';
    const signs = rules.beasts.signs[def.id] ?? [];
    if (warn && signs.length > 0) {
      sign = rng.pick(signs).replace('{dir}', dir).replace('{site}', label.name);
    } else warn = false;
    if (warn)
      t.arriveDay = world.day + rng.between(rules.beasts.warnDays[0], rules.beasts.warnDays[1]);
  } else {
    const { civ, home } = source;
    setLast(active.threats.lastRaid, civ.id, world.day);
    const able = ableAdults(world, content, active).length;
    const count = raidBand(rules, bandCount(home, 'adult'), active.share, able);
    t = {
      ...base,
      kind: 'raid',
      name: `raiders from ${home.name}`,
      glyph: rules.raids.glyph,
      civId: civ.id,
      fromSiteId: home.id,
      count,
      came: count,
    };
    warn = rng.chance(rules.raids.warnChance);
    if (warn) {
      sign = rules.raids.warning.replace('{from}', home.name);
      t.arriveDay = world.day + 1;
    }
    const mine = site.civId === null ? undefined : world.civs.get(site.civId);
    const why = mine ? grievanceEvent(world, civ, mine) : undefined;
    if (why !== undefined) causes.push(why);
  }
  active.threat = t;
  if (!warn) {
    judgeFlight(world, content, active, site, t, emit, label);
    arrive(world, content, active, emit, label, t);
    return;
  }
  const event = emit({
    type: rules.events.sign,
    place: label.cell,
    causes,
    data: { site: label.name, sign, threat: t.name, whence: t.whence },
  });
  t.signEvent = event.id;
  if (t.arriveDay - world.day <= rules.flight.judgeDaysAhead)
    judgeFlight(world, content, active, site, t, emit, label);
}

/** The attackers come onto the map: the arrival line, the militia, and the fear of everyone. */
function arrive(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
  t: SiteThreat,
): void {
  const rules = content.threats;
  const causes: Id[] = t.signEvent === undefined ? [] : [t.signEvent];
  let event: SimEvent;
  if (t.kind === 'beast') {
    event = emit({
      type: t.fled ? rules.events.beastCameEmpty : rules.events.beastArrived,
      place: label.cell,
      causes: t.fled && t.fleeEvent !== undefined ? [t.fleeEvent] : causes,
      data: { site: label.name, beast: t.name, dir: t.dir, whence: t.whence },
    });
    active.threats.stats.beasts += 1;
  } else {
    const site = world.sites.get(active.siteId);
    const mine = site?.civId == null ? undefined : world.civs.get(site.civId);
    const civ = t.civId === undefined ? undefined : world.civs.get(t.civId);
    const why = mine && civ ? grievanceEvent(world, civ, mine) : undefined;
    if (why !== undefined) causes.push(why);
    event = emit({
      type: rules.events.raidArrived,
      place: label.cell,
      causes,
      data: {
        site: label.name,
        from: world.sites.get(t.fromSiteId ?? -1)?.name ?? '',
        civ: civ?.name ?? '',
        count: t.came,
      },
    });
    active.threats.stats.raids += 1;
  }
  t.stage = 'coming';
  // Into an empty town a beast goes straight to the stores and stays there till it has eaten.
  t.tile = t.fled ? t.target : t.edge;
  t.held = true;
  t.arriveEvent = event.id;
  t.residentsAtArrival = active.residents.length;
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (p) remember(content, world, p, rules.memoryOf.fearRaid, event.id);
  }
  if (t.fled) {
    t.militia = [];
    return;
  }
  // The strongest able adults stand to arms until they are worth `militiaOdds` times the attackers.
  const weapons = weaponsOf(world, content, active);
  const walls = wallsFacing(content, active, t.edge);
  const able = ableAdults(world, content, active)
    .map((p) => ({ p, s: strengthOf(content, p, weapons.get(p.id) ?? 0, walls) }))
    .sort((a, b) => b.s - a.s || a.p.id - b.p.id);
  const want = rules.combat.militiaOdds * attackOf(content, t);
  let sum = 0;
  t.militia = [];
  for (const { p, s } of able) {
    if (t.militia.length >= rules.combat.militiaMin && sum >= want) break;
    t.militia.push(p.id);
    sum += s;
  }
}

// ---- The day ----

/** Everyone gone from the site: it falls (and any survivors who fled settle at the refuge). */
function fall(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
  causes: Id[],
): void {
  const site = world.sites.get(active.siteId);
  const survivors = active.residents.map((id) => world.people.get(id)).filter(alive);
  emit({
    type: content.threats.events.fell,
    place: label.cell,
    causes,
    data: { site: label.name },
  });
  active.threats.fellDay = world.day;
  if (site) site.ruinedYear = histYear(world, active);
  const dest = survivors.length > 0 ? refuge(world, active) : null;
  if (dest) relocate(envOf(world, content, active), survivors, dest);
  active.threat = null;
}

/** The attackers have gone and the people are home (or the place is lost): the threat is settled. */
function finish(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
  t: SiteThreat,
): void {
  const refugeSite = world.sites.get(t.refugeId ?? -1);
  if (t.fled && foodMeals(active, content) === 0 && homesStanding(content, active) === 0) {
    fall(world, content, active, emit, label, t.arriveEvent === undefined ? [] : [t.arriveEvent]);
    return;
  }
  if (t.fled) {
    emit({
      type: content.threats.events.flightReturned,
      place: label.cell,
      causes: t.fleeEvent === undefined ? [] : [t.fleeEvent],
      data: { site: label.name, refuge: refugeSite?.name ?? '' },
    });
  }
  if (t.arriveEvent !== undefined) {
    planWalls(content, active, t.edge);
    if (active.threats.wallPlan.length > 0) active.threats.wallsAfter = t.arriveEvent;
    // A raid sours both civs: the site's against the raiders, and theirs too if they lost men.
    const site = world.sites.get(active.siteId);
    const mine = site?.civId == null ? undefined : world.civs.get(site.civId);
    const theirs = t.civId === undefined ? undefined : world.civs.get(t.civId);
    if (t.kind === 'raid' && mine && theirs) {
      mine.grievances.set(theirs.id, (mine.grievances.get(theirs.id) ?? 0) + 1);
      if (t.attackersDown > 0) {
        theirs.grievances.set(mine.id, (theirs.grievances.get(mine.id) ?? 0) + 0.5);
      }
    }
  }
  active.threat = null;
}

/**
 * Block 0: rolls a wild prowler and, when nothing is open, a beast or a raid; turns a warning into
 * an arrival; and settles a threat that has left. A site with no one left falls.
 */
export function runThreatsDay(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  if (active.threats.fellDay !== undefined) return;
  if (active.residents.length === 0) {
    fall(
      world,
      content,
      active,
      emit,
      label,
      active.threat?.arriveEvent === undefined ? [] : [active.threat.arriveEvent],
    );
    return;
  }
  const site = world.sites.get(active.siteId);
  if (!site) return;
  const t = active.threat;
  if (t) {
    if (
      t.stage === 'warned' &&
      !t.judged &&
      world.day >= t.arriveDay - content.threats.flight.judgeDaysAhead
    )
      judgeFlight(world, content, active, site, t, emit, label);
    if (t.stage === 'warned' && world.day >= t.arriveDay) {
      arrive(world, content, active, emit, label, t);
    } else if (
      t.stage === 'leaving' &&
      t.tile < 0 &&
      world.day >= (t.leftDay ?? world.day) + (t.fled ? content.threats.flight.returnAfterDays : 0)
    ) {
      finish(world, content, active, emit, label, t);
    }
    return;
  }
  const rng = streamFor(world, 'site.threats');
  prowl(world, content, active, rng, emit, label);
  // A year's quiet after a beast or a raid before the next may come.
  const last = active.threats.lastThreatDay;
  if (last !== undefined && world.day - last < content.threats.quietDays) return;
  const beast = rollBeast(world, content, active, site, rng);
  if (beast) return openThreat(world, content, active, site, rng, emit, label, beast);
  const raid = rollRaid(world, content, active, site, rng);
  if (raid) openThreat(world, content, active, site, rng, emit, label, raid);
}
