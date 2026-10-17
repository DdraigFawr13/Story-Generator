// Faiths: every culture keeps a religion with gods, a high priest in a holy city and two values it
// holds sacred and one it abhors. Faiths clash where one abhors what the other holds sacred: priests
// denounce, grievances build, wars become holy wars, prophets rise to preach, split a faith or
// carry it to a neighbour, and sites, then rulers, change faith. Numbers are content
// (`content.faiths`); every roll uses the `faith` stream; events carry the names they print.

import { CULTURE_VALUES, type CultureValue, type FaithDef } from '../core/content-types';
import type { Civ, Faith, Id, Person, SimEvent, Site } from '../core/types';
import { addDeed, createAdult, eventById, livingList, livingPerson } from './people';
import { bandCount, totalPop } from './pop';
import { cellDistance } from './settle';
import { cultureValue } from './values';
import {
  addGrievance,
  causesOf,
  civOf,
  cultureOf,
  isLive,
  liveSites,
  type HistoryRun,
  type War,
} from './state';

const DECADE = 10;
/** What a site was before it took a faith, in "turned from {from}". */
const OLD_WAYS = 'the old ways';
/** Event types whose grievance makes a war holy even between faiths that do not clash. */
const HOLY_CAUSES = ['holy_war_preached', 'temple_desecrated', 'holy_city_taken'];

// --- reading faiths ------------------------------------------------------------------------------

/** The faith a realm keeps. */
export function faithOf(run: HistoryRun, civ: Civ): Faith | undefined {
  return civ.faithId === undefined ? undefined : run.world.faiths.get(civ.faithId);
}

/** The faith a site keeps: its own, else its realm's. */
export function siteFaith(run: HistoryRun, site: Site): Faith | undefined {
  const id = site.faithId ?? civOf(run, site)?.faithId;
  return id === undefined ? undefined : run.world.faiths.get(id);
}

/** How hard a realm holds to its faith: its culture's faith value (0-10). */
export function zeal(run: HistoryRun, civ: Civ): number {
  return cultureValue(run, civ, 'faith');
}

/** 0, 1 or 2: each faith that abhors what the other holds sacred adds one. Symmetric. */
export function enmity(a: Faith, b: Faith): number {
  return (b.sacred.includes(a.abhors) ? 1 : 0) + (a.sacred.includes(b.abhors) ? 1 : 0);
}

function defOf(run: HistoryRun, faith: Faith): FaithDef {
  return run.content.faiths.defs.find((d) => d.id === faith.defId)!;
}

/** A god of the faith, for a line that names one. */
function godOf(run: HistoryRun, faith: Faith): string {
  return run.rng.faith.pick(faith.gods);
}

const liveCiv = (run: HistoryRun, id: Id | null | undefined): Civ | undefined => {
  const civ = id === null || id === undefined ? undefined : run.world.civs.get(id);
  return civ && civ.fell === undefined ? civ : undefined;
};

/** The faith's high priest if alive. */
function priestOf(run: HistoryRun, faith: Faith): Person | undefined {
  return livingPerson(run, faith.highPriestId);
}

/** "the Title Name of Faith", or "the priests of Faith" when none lives; always printed mid-sentence. */
export function priestPhrase(run: HistoryRun, faith: Faith, priest: Person | undefined): string {
  return priest
    ? `the ${defOf(run, faith).priestTitle} ${priest.name} of ${faith.name}`
    : `the priests of ${faith.name}`;
}

/** Live sites of live realms, each keeping the faith. */
function keeps(run: HistoryRun, site: Site, faith: Faith): boolean {
  return (
    isLive(site) && liveCiv(run, site.civId) !== undefined && siteFaith(run, site)?.id === faith.id
  );
}

/** Civs (live, in id order) that touch each other by a link between their live sites. */
function linkedCivs(run: HistoryRun): [Civ, Civ[]][] {
  const adjacent = new Map<Id, Set<Id>>();
  for (const site of liveSites(run)) {
    const civ = liveCiv(run, site.civId);
    if (!civ) continue;
    for (const id of run.links.get(site.id) ?? []) {
      const other = run.world.sites.get(id);
      if (!other || !isLive(other) || other.civId === civ.id || !liveCiv(run, other.civId))
        continue;
      const set = adjacent.get(civ.id) ?? new Set<Id>();
      set.add(other.civId!);
      adjacent.set(civ.id, set);
    }
  }
  return [...adjacent.keys()]
    .sort((a, b) => a - b)
    .map((id) => [
      run.world.civs.get(id)!,
      [...adjacent.get(id)!].sort((a, b) => a - b).map((o) => run.world.civs.get(o)!),
    ]);
}

// --- making faiths -------------------------------------------------------------------------------

function newFaith(run: HistoryRun, def: FaithDef, name: string, fields: Partial<Faith>): Faith {
  const { world } = run;
  const faith: Faith = {
    id: world.nextId.faith,
    defId: def.id,
    name,
    gods: [...def.gods],
    sacred: [...def.sacred],
    abhors: def.abhors,
    founded: 0,
    ...fields,
  };
  world.nextId.faith += 1;
  world.faiths.set(faith.id, faith);
  return faith;
}

/** The old faith of a culture's religion, made when none exists (a forgotten one is kept alive again). */
function rootFaith(run: HistoryRun, civ: Civ): Faith | undefined {
  const religion = cultureOf(run, civ)?.religion;
  const def = run.content.faiths.defs.find((d) => d.id === religion?.id);
  if (!religion || !def) return undefined;
  for (const faith of run.world.faiths.values()) {
    if (faith.defId !== def.id || faith.parentId !== undefined) continue;
    delete faith.forgotten;
    return faith;
  }
  return newFaith(run, def, religion.name, {});
}

/** The site that is the faith's holy city: the current seat while it holds, else the best site of its largest realm. */
function pickSeat(run: HistoryRun, faith: Faith): Site | undefined {
  const current =
    faith.seatSiteId === undefined ? undefined : run.world.sites.get(faith.seatSiteId);
  // A holy city held by a realm of another faith is lost to it, even while its people still pray.
  if (current && keeps(run, current, faith) && civOf(run, current)?.faithId === faith.id)
    return current;
  const byCiv = new Map<Id, Site[]>();
  const pop = new Map<Id, number>();
  for (const site of liveSites(run)) {
    if (!keeps(run, site, faith)) continue;
    const id = site.civId!;
    byCiv.set(id, [...(byCiv.get(id) ?? []), site]);
    pop.set(id, (pop.get(id) ?? 0) + totalPop(site));
  }
  let best: Id | undefined;
  for (const [id, total] of pop) if (best === undefined || total > pop.get(best)!) best = id;
  if (best === undefined) return undefined;
  const sites = byCiv.get(best)!;
  const biggest = (list: Site[]) =>
    list.reduce((a, b) => (totalPop(b) > totalPop(a) ? b : a), list[0]!);
  const temples = sites.filter((s) => s.kind === 'temple');
  if (temples.length > 0) return biggest(temples);
  const capital = sites.find((s) => s.id === run.world.civs.get(best)!.capital);
  return capital ?? biggest(sites);
}

/** Each live faith keeps its seat and one living high priest there; a new one is named when it dies. */
function keepPriests(run: HistoryRun): void {
  for (const faith of run.world.faiths.values()) {
    if (faith.forgotten !== undefined) continue;
    const seat = pickSeat(run, faith);
    const civ = seat ? liveCiv(run, seat.civId) : undefined;
    if (!seat || !civ) continue;
    faith.seatSiteId = seat.id;
    const priest = priestOf(run, faith);
    if (priest) {
      priest.siteId = seat.id;
      priest.civId = civ.id;
      continue;
    }
    const old =
      faith.highPriestId === undefined ? undefined : run.world.people.get(faith.highPriestId);
    const named = createAdult(run, civ, seat, 'priest', run.content.faiths.fame.priest);
    faith.highPriestId = named.id;
    // The first priests of year 0 need no line.
    if (run.year === 0) continue;
    const def = defOf(run, faith);
    const event = run.emit({
      type: 'high_priest_named',
      place: seat.cell,
      actors: [named.id],
      causes: causesOf(old?.deeds[old.deeds.length - 1], run.faithEvents.get(`faith:${faith.id}`)),
      data: {
        name: named.name,
        rank: def.priestTitle,
        faith: faith.name,
        god: godOf(run, faith),
        site: seat.name,
        civ: civ.name,
      },
    });
    addDeed(named, event.id);
    run.faithEvents.set(`faith:${faith.id}`, event.id);
  }
}

/** Year 0: a faith per culture religion, every realm and site in one, and a high priest for each. */
export function initFaiths(run: HistoryRun): void {
  for (const civ of run.world.civs.values()) {
    const faith = rootFaith(run, civ);
    if (faith) civ.faithId = faith.id;
  }
  for (const site of run.world.sites.values()) {
    const civ = site.civId === null ? undefined : run.world.civs.get(site.civId);
    if (civ?.faithId !== undefined) site.faithId = civ.faithId;
  }
  keepPriests(run);
}

// --- the year ------------------------------------------------------------------------------------

/** Realms born since the last year take their capital's faith, else their culture's; new sites take their realm's. */
function fill(run: HistoryRun): void {
  for (const civ of run.world.civs.values()) {
    if (civ.fell !== undefined || civ.faithId !== undefined) continue;
    const capital = run.world.sites.get(civ.capital);
    const id = capital ? siteFaith(run, capital)?.id : undefined;
    const found = id ?? rootFaith(run, civ)?.id;
    if (found !== undefined) civ.faithId = found;
  }
  for (const site of liveSites(run)) {
    if (site.faithId !== undefined) continue;
    const civ = civOf(run, site);
    if (civ?.faithId !== undefined) site.faithId = civ.faithId;
  }
}

const capitalCell = (run: HistoryRun, civ: Civ): number | null =>
  run.world.sites.get(civ.capital)?.cell ?? null;

/** Each pair of linked realms whose faiths clash: a zealous side may denounce the other, and holds it against them. */
function heresies(run: HistoryRun): void {
  const rules = run.content.faiths;
  for (const [a, others] of linkedCivs(run)) {
    for (const b of others) {
      if (b.id < a.id) continue;
      const [fa, fb] = [faithOf(run, a), faithOf(run, b)];
      if (!fa || !fb || fa.id === fb.id) continue;
      const clash = enmity(fa, fb);
      if (clash === 0) continue;
      for (const [civ, other, mine, theirs] of [
        [a, b, fa, fb],
        [b, a, fb, fa],
      ] as const) {
        const heat = zeal(run, civ);
        if (heat < rules.minZeal || !run.rng.faith.chance((rules.heresyChance * heat) / 10))
          continue;
        const priest = priestOf(run, mine);
        const event = run.emit({
          type: 'heresy_denounced',
          place: capitalCell(run, civ),
          actors: priest ? [priest.id] : [],
          causes: causesOf(run.faithEvents.get(`faith:${mine.id}`)),
          data: {
            civ: civ.name,
            other: other.name,
            faith: mine.name,
            otherFaith: theirs.name,
            god: godOf(run, mine),
            priest: priestPhrase(run, mine, priest),
          },
        });
        addGrievance(run, civ.id, other.id, rules.heresyGrievance * clash, event.id);
      }
    }
  }
}

/** A site takes a faith and the line says so. */
function convertSite(run: HistoryRun, site: Site, civ: Civ, to: Faith, causes: Id[]): void {
  const from = siteFaith(run, site);
  site.faithId = to.id;
  const event = run.emit({
    type: 'site_converted',
    place: site.cell,
    causes,
    data: { site: site.name, civ: civ.name, faith: to.name, from: from?.name ?? OLD_WAYS },
  });
  run.faithEvents.set(`site:${site.id}`, event.id);
}

/** A ruler may follow the faith of most of the realm; then sites keeping another faith than their realm's may take it up. */
function conversions(run: HistoryRun): void {
  const rules = run.content.faiths;
  for (const civ of [...run.world.civs.values()]) {
    if (civ.fell !== undefined || civ.faithId === undefined) continue;
    const adults = new Map<Id, number>();
    let total = 0;
    for (const site of liveSites(run)) {
      if (site.civId !== civ.id || site.faithId === undefined) continue;
      const n = bandCount(site, 'adult');
      total += n;
      if (site.faithId !== civ.faithId)
        adults.set(site.faithId, (adults.get(site.faithId) ?? 0) + n);
    }
    let top: Id | undefined;
    for (const [id, n] of adults) if (top === undefined || n > adults.get(top)!) top = id;
    const ruler = livingPerson(run, civ.rulerId);
    const to = top === undefined ? undefined : run.world.faiths.get(top);
    const from = faithOf(run, civ);
    if (!to || !from || !ruler || total === 0) continue;
    if (adults.get(top!)! < rules.rulerConvertShare * total) continue;
    if (!run.rng.faith.chance(rules.rulerConvertChance)) continue;
    civ.faithId = to.id;
    const capital = run.world.sites.get(civ.capital);
    if (capital) capital.faithId = to.id;
    const event = run.emit({
      type: 'ruler_converted',
      place: capital?.cell ?? null,
      actors: [ruler.id],
      causes: causesOf(run.faithEvents.get(`faith:${to.id}`)),
      data: {
        name: ruler.name,
        civ: civ.name,
        faith: to.name,
        from: from.name,
        god: godOf(run, to),
      },
    });
    addDeed(ruler, event.id);
  }
  // Rulers first, so a town never turns back to a faith its ruler leaves the same year.
  for (const site of liveSites(run)) {
    const civ = liveCiv(run, site.civId);
    const own = civ ? faithOf(run, civ) : undefined;
    if (!civ || !own || site.faithId === undefined || site.faithId === own.id) continue;
    if (!run.rng.faith.chance((rules.convertChance * zeal(run, civ)) / 10)) continue;
    convertSite(run, site, civ, own, causesOf(run.faithEvents.get(`site:${site.id}`)));
  }
}

/** The first schism name no faith has taken. */
function freeSchismName(run: HistoryRun, def: FaithDef): string | undefined {
  const taken = new Set([...run.world.faiths.values()].map((f) => f.name));
  return def.schismNames.find((n) => !taken.has(n));
}

/** The culture's highest value that the parent holds neither sacred nor abhorred (ties in value order). */
function schismValue(run: HistoryRun, civ: Civ, parent: Faith): CultureValue | undefined {
  const values = cultureOf(run, civ)?.values;
  let best: CultureValue | undefined;
  for (const v of CULTURE_VALUES) {
    if (v === 'faith' || parent.sacred.includes(v) || v === parent.abhors || !values) continue;
    if (best === undefined || values[v] > values[best]) best = v;
  }
  return best;
}

/** The realms linked to this one that keep a faith, in id order. */
function neighbours(run: HistoryRun, civ: Civ): Civ[] {
  return (linkedCivs(run).find(([c]) => c.id === civ.id)?.[1] ?? []).filter(
    (c) => !!faithOf(run, c),
  );
}

/** The prophet's one act on rising: preach a holy war, split the faith or carry it to a neighbour. */
function prophetActs(
  run: HistoryRun,
  prophet: Person,
  civ: Civ,
  site: Site,
  faith: Faith,
  rose: SimEvent,
): void {
  const rules = run.content.faiths;
  const rng = run.rng.faith;
  const near = neighbours(run, civ).filter((c) => faithOf(run, c)!.id !== faith.id);
  const enemies = near.filter((c) => enmity(faith, faithOf(run, c)!) > 0);
  const weaker = near.filter((c) => zeal(run, c) < zeal(run, civ));
  const def = defOf(run, faith);
  const name = freeSchismName(run, def);
  const value = schismValue(run, civ, faith);
  const options: [string, number][] = [];
  if (enemies.length > 0) options.push(['preach', rules.prophetActs.preach]);
  if (name !== undefined && value !== undefined) options.push(['schism', rules.prophetActs.schism]);
  if (weaker.length > 0) options.push(['mission', rules.prophetActs.mission]);
  const open = options.filter(([, w]) => w > 0);
  if (open.length === 0) return;
  const act = rng.weighted(open);
  if (act === 'preach') {
    const target = rng.pick(enemies);
    const other = faithOf(run, target)!;
    const event = run.emit({
      type: 'holy_war_preached',
      place: site.cell,
      actors: [prophet.id],
      causes: [rose.id],
      data: {
        name: prophet.name,
        civ: civ.name,
        other: target.name,
        faith: faith.name,
        otherFaith: other.name,
        god: godOf(run, faith),
      },
    });
    addDeed(prophet, event.id);
    addGrievance(run, civ.id, target.id, rules.preachGrievance, event.id);
  } else if (act === 'schism') {
    const child = newFaith(run, def, name!, {
      gods: faith.gods.length > 1 ? [rng.pick(faith.gods)] : [...faith.gods],
      sacred: [faith.sacred[0]!, value!],
      abhors: faith.sacred[1]!,
      founded: run.year,
      parentId: faith.id,
      founderId: prophet.id,
      seatSiteId: site.id,
    });
    const event = run.emit({
      type: 'faith_schism',
      place: site.cell,
      actors: [prophet.id],
      causes: [rose.id],
      data: {
        name: prophet.name,
        faith: child.name,
        parent: faith.name,
        site: site.name,
        civ: civ.name,
        god: godOf(run, child),
      },
    });
    addDeed(prophet, event.id);
    run.faithEvents.set(`faith:${child.id}`, event.id);
    // The prophet's town and the realm's towns linked to it follow; the realm follows if the seat did.
    const linked = new Set(run.links.get(site.id) ?? []);
    for (const s of liveSites(run)) {
      if (s.civId !== civ.id || (s.id !== site.id && !linked.has(s.id))) continue;
      if (siteFaith(run, s)?.id === faith.id) s.faithId = child.id;
    }
    if (site.id === civ.capital) civ.faithId = child.id;
  } else {
    const target = rng.pick(weaker);
    const from = faithOf(run, target)!;
    let pick: Site | undefined;
    let nearest = Infinity;
    for (const s of liveSites(run)) {
      if (s.civId !== target.id) continue;
      const touches = (run.links.get(s.id) ?? []).some(
        (id) => run.world.sites.get(id)?.civId === civ.id,
      );
      const d = cellDistance(run.cells.width, site.cell, s.cell);
      if (touches && d < nearest) {
        nearest = d;
        pick = s;
      }
    }
    if (!pick) return;
    const event = run.emit({
      type: 'faith_spread',
      place: pick.cell,
      actors: [prophet.id],
      causes: [rose.id],
      data: {
        name: prophet.name,
        site: pick.name,
        civ: target.name,
        faith: faith.name,
        from: from.name,
      },
    });
    addDeed(prophet, event.id);
    pick.faithId = faith.id;
    run.faithEvents.set(`site:${pick.id}`, event.id);
  }
}

/** A prophet may rise in a zealous, living realm, up to `maxProphets` alive; each acts once, at once. */
function prophets(run: HistoryRun): void {
  const rules = run.content.faiths;
  const rng = run.rng.faith;
  for (const civ of [...run.world.civs.values()]) {
    if (civ.fell !== undefined || civ.free) continue;
    const faith = faithOf(run, civ);
    const heat = zeal(run, civ);
    if (!faith || heat < rules.minZeal) continue;
    if (livingList(run).filter((p) => p.title === 'prophet').length >= rules.maxProphets) return;
    if (!rng.chance((rules.prophetChance * heat) / 10)) continue;
    const homes = liveSites(run).filter(
      (s) => s.civId === civ.id && siteFaith(run, s)?.id === faith.id,
    );
    if (homes.length === 0) continue;
    const site = rng.pick(homes);
    const prophet = createAdult(run, civ, site, 'prophet', rules.fame.prophet);
    const rose = run.emit({
      type: 'prophet_rose',
      place: site.cell,
      actors: [prophet.id],
      causes: causesOf(run.faithEvents.get(`faith:${faith.id}`)),
      data: {
        name: prophet.name,
        civ: civ.name,
        site: site.name,
        faith: faith.name,
        god: godOf(run, faith),
      },
    });
    addDeed(prophet, rose.id);
    prophetActs(run, prophet, civ, site, faith, rose);
  }
}

/** A faith no live realm and no live site keeps is forgotten. */
function forget(run: HistoryRun): void {
  const kept = new Set<Id>();
  for (const site of liveSites(run)) {
    const faith = siteFaith(run, site);
    if (faith && liveCiv(run, site.civId)) kept.add(faith.id);
  }
  // A ruler still keeps it even when a schism took every town.
  for (const civ of run.world.civs.values()) {
    if (civ.fell === undefined && civ.faithId !== undefined) kept.add(civ.faithId);
  }
  for (const faith of run.world.faiths.values()) {
    if (faith.forgotten !== undefined || kept.has(faith.id)) continue;
    faith.forgotten = run.year;
    delete faith.seatSiteId;
    run.emit({
      type: 'faith_forgotten',
      place: null,
      causes: causesOf(run.faithEvents.get(`faith:${faith.id}`)),
      data: { faith: faith.name, god: godOf(run, faith) },
    });
  }
}

/** Yearly (after the city-states): fill in new realms and sites, keep priests; each decade quarrel, convert, prophesy. */
export function runFaith(run: HistoryRun): void {
  fill(run);
  keepPriests(run);
  if (run.year % DECADE !== 0) return;
  heresies(run);
  conversions(run);
  prophets(run);
  forget(run);
}

// --- hooks from war and city-states ---------------------------------------------------------------

/**
 * A war just declared turns holy when the two realms keep different faiths and either the faiths clash
 * and the attacker is zealous, or a preached war or holy wrong stands among its causes; the priest of the attacker's faith proclaims it.
 */
export function proclaimHolyWar(
  run: HistoryRun,
  war: War,
  attacker: Civ,
  defender: Civ,
  declared: SimEvent,
): void {
  const [mine, theirs] = [faithOf(run, attacker), faithOf(run, defender)];
  if (!mine || !theirs || mine.id === theirs.id) return;
  const holyCause = declared.causes.some((id) =>
    HOLY_CAUSES.includes(eventById(run, id)?.type ?? ''),
  );
  const clash = enmity(mine, theirs) > 0 && zeal(run, attacker) >= run.content.faiths.holyZeal;
  if (!clash && !holyCause) return;
  war.holy = true;
  const priest = priestOf(run, mine);
  run.emit({
    type: 'holy_war_proclaimed',
    place: capitalCell(run, attacker),
    actors: priest ? [priest.id] : [],
    causes: [declared.id],
    data: {
      civ: attacker.name,
      enemy: defender.name,
      faith: mine.name,
      god: godOf(run, mine),
      priest: priestPhrase(run, mine, priest),
    },
  });
}

/**
 * A site just taken or razed: a conqueror of another faith who lays hands on a temple or holy city
 * defiles it, and every other realm of that faith holds it against them; a holy war may convert
 * a conquered town at once.
 */
export function faithAfterTaken(
  run: HistoryRun,
  taken: {
    site: Site;
    attacker: Civ;
    defender: Civ;
    event: SimEvent;
    razed: boolean;
    war?: War | undefined;
    lead?: Person | undefined;
  },
): void {
  const { site, attacker, defender, event, razed, war, lead } = taken;
  const rules = run.content.faiths;
  const held = siteFaith(run, site);
  const mine = faithOf(run, attacker);
  run.faithEvents.set(`site:${site.id}`, event.id);
  if (!mine || held?.id === mine.id) return;
  const seat = [...run.world.faiths.values()].find(
    (f) => f.forgotten === undefined && f.seatSiteId === site.id,
  );
  let cause = event.id;
  if (held && (site.kind === 'temple' || seat)) {
    const wrong = run.emit({
      type: !razed && seat ? 'holy_city_taken' : 'temple_desecrated',
      place: site.cell,
      actors: lead ? [lead.id] : [],
      causes: [event.id],
      data: {
        site: site.name,
        civ: attacker.name,
        loser: defender.name,
        faith: held.name,
        god: godOf(run, held),
      },
    });
    cause = wrong.id;
    for (const civ of run.world.civs.values()) {
      if (civ.fell !== undefined || civ.id === attacker.id || civ.faithId !== held.id) continue;
      addGrievance(run, civ.id, attacker.id, rules.desecrationGrievance, wrong.id);
    }
  }
  if (!razed && war?.holy && run.rng.faith.chance(rules.holyConvert)) {
    convertSite(run, site, attacker, mine, [cause]);
  }
}
