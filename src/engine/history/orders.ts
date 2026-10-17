// Orders and academies: a living legend may found a knightly order or, with a strong spell of their
// school, a magic academy; a hero or captain of renown may found an order. It recruits fit people of its realm, trains and teaches its members,
// rides against beasts (an order) or works the realm's spells (an academy), passes from head to
// head, follows its seat and keeps or loses the founder's lore. Each people reveres, regulates or
// persecutes magic by its values; a persecuting people hunts its mages and shuts colleges.
// Every roll comes from the `orders` stream and every number from `content/orders.ts`; each step
// is an event with its causes linked.

import type { CreatureDef, MagicStance } from '../core/content-types';
import { meetsRequirements } from '../people/aptitude';
import { TIERS } from '../people/tiers';
import { DAYS_PER_YEAR } from '../core/clock';
import type { Civ, Creature, Id, Order, Person, Site } from '../core/types';
import { fightHunt, livingCreatures, whereIs } from './beasts';
import { collegeOf } from './colleges';
import { deedSoldiers, isLegend, killNotable, rulerOf } from './notables';
import { isSpell, primarySchool, spellPower } from './items';
import {
  addDeed,
  eventById,
  FAME_MAX,
  isAdult,
  isElder,
  livingList,
  livingPerson,
  siteOf,
} from './people';
import { cellDistance } from './settle';
import { cultureOf, isLive, type HistoryRun } from './state';
import { rulerTilt } from './tempers';

const STRONG = TIERS.strong.minPower;
const LEGENDARY = TIERS.legendary.minPower;

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const fillIn = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );

/** Per-run memory: mages already hunted (once in a life). */
const memory = new WeakMap<HistoryRun, Set<Id>>();
function huntedSet(run: HistoryRun): Set<Id> {
  let set = memory.get(run);
  if (!set) memory.set(run, (set = new Set()));
  return set;
}

const liveCiv = (run: HistoryRun, id: Id | null | undefined): Civ | undefined => {
  const civ = id == null ? undefined : run.world.civs.get(id);
  return civ && civ.fell === undefined ? civ : undefined;
};

// --- how a people treats magic -----------------------------------------------------------------

/** Whether a people reveres, regulates or persecutes magic: its values weighed by `attitude.weights`. */
export function magicAttitude(run: HistoryRun, civ: Civ | undefined | null): MagicStance {
  const culture = civ ? cultureOf(run, civ) : undefined;
  if (!culture) return 'regulate';
  const rules = run.rules.orders.attitude;
  let score = 0;
  for (const [value, weight] of Object.entries(rules.weights))
    score += (weight ?? 0) * (culture.values[value as keyof typeof culture.values] ?? 0);
  if (score >= rules.revereAt) return 'revere';
  if (score <= rules.persecuteAt) return 'persecute';
  return 'regulate';
}

// --- hooks other systems read ------------------------------------------------------------------

/** Open orders and academies, in id order. */
export function openOrders(run: HistoryRun): Order[] {
  const out: Order[] = [];
  for (const order of run.world.orders.values()) if (order.ended === undefined) out.push(order);
  return out;
}

/** True while the person lives, is of the institution's people and joined it. */
function isMember(run: HistoryRun, order: Order, id: Id): boolean {
  const person = livingPerson(run, id);
  return person !== undefined && person.civId === order.civId && order.members.includes(id);
}

/** Living members of an institution, in the order they joined. */
function membersOf(run: HistoryRun, order: Order): Person[] {
  const out: Person[] = [];
  for (const id of order.members) {
    const person = livingPerson(run, id);
    if (person && person.civId === order.civId) out.push(person);
  }
  return out;
}

/** The open institution a person serves, if any. */
function institutionOf(run: HistoryRun, id: Id): Order | undefined {
  for (const order of openOrders(run)) if (isMember(run, order, id)) return order;
  return undefined;
}

/** True while the person is a member of an open academy (their spells serve their people, colleges.ts). */
export function inAcademy(run: HistoryRun, personId: Id): boolean {
  return institutionOf(run, personId)?.kind === 'academy';
}

/** The open knightly order seated at a site, if any (war.ts: it defends its seat). */
export function orderAt(run: HistoryRun, siteId: Id): Order | undefined {
  for (const order of openOrders(run))
    if (order.kind === 'order' && order.siteId === siteId) return order;
  return undefined;
}

/** The open institution of a kind that a people keeps. */
function openOf(run: HistoryRun, civId: Id | null, kind: Order['kind']): Order | undefined {
  return openOrders(run).find((o) => o.kind === kind && o.civId === civId);
}

/** The current head of an institution while they live and serve its people. */
function headOf(run: HistoryRun, order: Order): Person | undefined {
  const head = livingPerson(run, order.heads[order.heads.length - 1]);
  return head && head.civId === order.civId ? head : undefined;
}

// --- founding ----------------------------------------------------------------------------------

/** The founder's strongest spell of their primary school at the academy grade, if they know one. */
function academySpell(run: HistoryRun, person: Person): string | undefined {
  const school = primarySchool(person);
  if (school === undefined) return undefined;
  const need = run.rules.orders.academyMinSpell;
  let best: { power: number; id: string } | undefined;
  for (const id of person.knownAbilities) {
    const ability = run.lore.byId.get(id);
    if (!ability || ability.school !== school || !isSpell(run, id)) continue;
    const power = spellPower(ability);
    if (power >= need && (!best || power > best.power)) best = { power, id };
  }
  return best?.id;
}

/** A name no other order, academy or college carries: the picked pair first, then the rest in order. */
function freshName(
  run: HistoryRun,
  templates: readonly string[],
  values: Record<string, string>,
): string {
  const rng = run.rng.orders;
  const emblems = run.rules.orders.emblems;
  const from = rng.int(templates.length);
  const emblem0 = rng.int(emblems.length);
  const taken = new Set<string>();
  for (const order of run.world.orders.values()) taken.add(order.name);
  for (const college of run.colleges) taken.add(college.name);
  for (let t = 0; t < templates.length; t += 1) {
    const template = templates[(from + t) % templates.length]!;
    // A template without an emblem has one candidate; the others try each emblem in turn.
    const tries = template.includes('{emblem}') ? emblems.length : 1;
    for (let e = 0; e < tries; e += 1) {
      const name = fillIn(template, {
        ...values,
        emblem: emblems[(emblem0 + e) % emblems.length]!,
      });
      if (!taken.has(name)) return name;
    }
  }
  // Every name is taken: tell it from the rest by its seat.
  return `${fillIn(templates[from]!, { ...values, emblem: emblems[emblem0]! })} of ${values.site}`;
}

/** Each year a living legend at a live site of their own people may found an order or an academy, once in a life. */
function foundOrders(run: HistoryRun): void {
  const rules = run.rules.orders;
  const rng = run.rng.orders;
  const founders = new Set<Id>();
  for (const order of run.world.orders.values()) founders.add(order.founderId);
  for (const person of livingList(run)) {
    // A legend, or a hero or captain of renown, who has never founded one.
    const renowned =
      person.title !== undefined &&
      rules.heroFounders.titles.includes(person.title) &&
      person.fame >= rules.heroFounders.minFame;
    if (!(isLegend(person) || renowned) || founders.has(person.id)) continue;
    if (!isAdult(run, person) || isElder(run, person) || run.students.has(person.id)) continue;
    const civ = liveCiv(run, person.civId);
    const site = siteOf(run, person);
    if (!civ || !site || !isLive(site) || site.civId !== civ.id) continue;
    const attitude = magicAttitude(run, civ);
    const kind: Order['kind'] =
      isLegend(person) && academySpell(run, person) !== undefined && attitude !== 'persecute'
        ? 'academy'
        : 'order';
    if (openOf(run, civ.id, kind)) continue;
    if (openOrders(run).filter((o) => o.kind === kind).length >= rules.maxOpen) continue;
    if (!rng.chance(isLegend(person) ? rules.foundChance : rules.heroFounders.chance)) continue;
    const school = primarySchool(person) ?? 'wild';
    const names =
      kind === 'order'
        ? rules.orderNames
        : attitude === 'regulate'
          ? [...rules.academyNames, ...rules.charteredNames]
          : rules.academyNames;
    const name = freshName(run, names, {
      site: site.name,
      founder: person.name,
      school: cap(school),
    });
    const event = run.emit({
      type: kind === 'order' ? 'order_founded' : 'academy_founded',
      actors: [person.id],
      place: site.cell,
      causes: person.deeds.slice(-1),
      data: {
        name: person.name,
        order: name,
        site: site.name,
        civ: civ.name,
        school,
        attitude: rules.attitudes[attitude].word,
      },
    });
    addDeed(person, event.id);
    person.fame = Math.min(FAME_MAX, person.fame + rules.founderFame);
    run.notables.lastDeed.set(person.id, run.year);
    const order: Order = {
      id: run.world.nextId.order,
      kind,
      name,
      founderId: person.id,
      civId: civ.id,
      siteId: site.id,
      founded: run.year,
      event: event.id,
      heads: [person.id],
      members: [person.id],
      ...(kind === 'academy' ? { school } : {}),
      lore: kind === 'academy' ? person.knownAbilities.filter((id) => isSpell(run, id)) : [],
      lost: [],
    };
    run.world.nextId.order += 1;
    run.world.orders.set(order.id, order);
  }
}

// --- the seat, the head and the end ------------------------------------------------------------

/** Ends an institution and says why. */
function endOrder(run: HistoryRun, order: Order, reason: string, causes: Id[]): void {
  order.ended = run.year;
  const site = order.siteId === null ? undefined : run.world.sites.get(order.siteId);
  const civ = order.civId === null ? undefined : run.world.civs.get(order.civId);
  const last = run.world.people.get(order.heads[order.heads.length - 1]!);
  const event = run.emit({
    type: 'order_ended',
    actors: last ? [last.id] : [],
    place: site?.cell ?? null,
    causes: [order.event, ...causes],
    data: {
      order: order.name,
      site: site?.name ?? 'the ruins',
      civ: civ?.name ?? '',
      reason,
      name: last?.name ?? '',
    },
  });
  order.endEvent = event.id;
  if (last) addDeed(last, event.id);
}

/** The strongest living member, by the order's own measure: knights by arms, scholars by magic. */
function bestMember(run: HistoryRun, order: Order): Person | undefined {
  const measure = (p: Person) => (order.kind === 'academy' ? p.magic.power : deedSoldiers(run, p));
  let best: Person | undefined;
  for (const person of membersOf(run, order)) {
    if (
      !best ||
      measure(person) > measure(best) ||
      (measure(person) === measure(best) && person.fame > best.fame)
    )
      best = person;
  }
  return best;
}

/** The notable_died event of a person, from their deeds. */
function deathEventOf(run: HistoryRun, person: Person): Id | undefined {
  for (let i = person.deeds.length - 1; i >= 0; i -= 1) {
    const event = eventById(run, person.deeds[i]!);
    if (event && event.type === 'notable_died' && event.actors[0] === person.id) return event.id;
  }
  return undefined;
}

/** An institution whose seat is lost: an academy passes to the new holder, an order moves to the capital. */
function followSeat(run: HistoryRun, order: Order, site: Site | undefined, civ: Civ | undefined) {
  const phrases = run.rules.orders.phrases;
  const holder = site && isLive(site) ? liveCiv(run, site.civId) : undefined;
  const civName = civ?.name ?? 'realm';
  if (order.kind === 'academy' && site && holder && holder.id !== order.civId) {
    if (magicAttitude(run, holder) === 'persecute') {
      endOrder(run, order, fillIn(phrases.closed, { civ: holder.name }), []);
      return;
    }
    run.emit({
      type: 'order_passed',
      place: site.cell,
      causes: [order.event],
      data: { order: order.name, site: site.name, civ: holder.name, from: civName },
    });
    for (const person of membersOf(run, order)) {
      if (person.siteId === site.id) person.civId = holder.id;
    }
    order.civId = holder.id;
    // Members at the seat switched with it; heads and members elsewhere are gone from the roll.
    return;
  }
  if (order.kind === 'order' && civ) {
    const capital = run.world.sites.get(civ.capital);
    if (capital && isLive(capital) && capital.civId === civ.id) {
      run.emit({
        type: 'order_moved',
        place: capital.cell,
        causes: [order.event],
        data: {
          order: order.name,
          from: site?.name ?? 'its seat',
          site: capital.name,
          civ: civ.name,
        },
      });
      order.siteId = capital.id;
      return;
    }
  }
  const reason =
    civ && civ.fell === undefined
      ? fillIn(phrases.lost, { site: site?.name ?? 'its seat' })
      : fillIn(phrases.fell, { civ: civName });
  endOrder(run, order, reason, []);
}

/** Yearly: each open institution follows its seat, then names a new head or ends. */
function keepOrders(run: HistoryRun): Map<Id, Person | undefined> {
  const phrases = run.rules.orders.phrases;
  // Institutions that named a new head this year, with the head they replaced.
  const headChanged = new Map<Id, Person | undefined>();
  for (const order of openOrders(run)) {
    const civ = order.civId === null ? undefined : run.world.civs.get(order.civId);
    const site = order.siteId === null ? undefined : run.world.sites.get(order.siteId);
    const seatLost = !site || !isLive(site) || site.civId !== order.civId;
    if (civ && civ.fell !== undefined && !(order.kind === 'academy' && seatLost)) {
      endOrder(run, order, fillIn(phrases.fell, { civ: civ.name }), []);
      continue;
    }
    if (seatLost) {
      followSeat(run, order, site, civ);
      if (order.ended !== undefined) continue;
    }
    if (headOf(run, order)) continue;
    const previous = run.world.people.get(order.heads[order.heads.length - 1]!);
    const next = bestMember(run, order);
    const member = phrases.member[order.kind];
    if (!next) {
      endOrder(run, order, fillIn(phrases.lastDied, { member }), []);
      continue;
    }
    const seat = order.siteId === null ? undefined : run.world.sites.get(order.siteId);
    const crown =
      order.kind === 'academy' &&
      magicAttitude(run, run.world.civs.get(order.civId!)) === 'regulate';
    const how = fillIn(crown ? phrases.crown : phrases.chosen, {
      name: next.name,
      members: phrases.members[order.kind],
    });
    const death = previous ? deathEventOf(run, previous) : undefined;
    const event = run.emit({
      type: 'order_head',
      actors: [next.id],
      place: seat?.cell ?? null,
      causes: death === undefined ? [order.event] : [death, order.event],
      data: {
        name: next.name,
        order: order.name,
        previous: previous?.name ?? 'its founder',
        how,
        site: seat?.name ?? 'its seat',
        civ: run.world.civs.get(order.civId!)?.name ?? '',
      },
    });
    addDeed(next, event.id);
    order.heads.push(next.id);
    headChanged.set(order.id, previous);
  }
  return headChanged;
}

// --- lore --------------------------------------------------------------------------------------

/** Spells of an academy's lore that no living member knows any more are lost, once each. */
function loseLore(run: HistoryRun, changed: Map<Id, Person | undefined>): void {
  const phrases = run.rules.orders.phrases;
  for (const order of run.world.orders.values()) {
    if (order.kind !== 'academy' || order.lore.length === 0) continue;
    if (order.ended !== undefined && order.ended !== run.year) continue;
    const members = membersOf(run, order);
    const gone = order.lore.filter(
      (id) => !order.lost.includes(id) && !members.some((m) => m.knownAbilities.includes(id)),
    );
    if (gone.length === 0) continue;
    order.lost.push(...gone);
    const names = gone.map((id) => run.lore.byId.get(id)?.name ?? id);
    const list =
      names.length <= 1
        ? (names[0] ?? '')
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    const head = run.world.people.get(order.heads[order.heads.length - 1]!);
    // A new head this year means the old one died or left: that is the blame, with their death as the cause.
    const replaced = changed.get(order.id);
    const death = replaced && replaced.died !== undefined ? deathEventOf(run, replaced) : undefined;
    const cause =
      order.ended !== undefined
        ? fillIn(phrases.ended, { order: order.name })
        : replaced
          ? fillIn(phrases.headDied, { head: replaced.name })
          : phrases.scholarsPassed;
    const site = order.siteId === null ? undefined : run.world.sites.get(order.siteId);
    run.emit({
      type: 'academy_lore_lost',
      actors: head ? [head.id] : [],
      place: site?.cell ?? null,
      causes: [order.endEvent ?? death ?? order.event],
      data: {
        order: order.name,
        spells: list,
        cause,
        site: site?.name ?? 'the ruins',
        civ: run.world.civs.get(order.civId ?? -1)?.name ?? '',
      },
    });
  }
}

// --- recruiting --------------------------------------------------------------------------------

/** Each year, fit people of an open institution's people may join it, up to its size. */
function recruit(run: HistoryRun): void {
  const rules = run.rules.orders;
  const rng = run.rng.orders;
  for (const order of openOrders(run)) {
    const civ = liveCiv(run, order.civId);
    const seat = order.siteId === null ? undefined : run.world.sites.get(order.siteId);
    if (!civ || !seat) continue;
    const limit = order.kind === 'order' ? rules.maxKnights : rules.maxScholars;
    let count = membersOf(run, order).length;
    if (count >= limit) continue;
    const ruler = rulerOf(run, civ);
    for (const person of livingList(run)) {
      if (count >= limit) break;
      if (person.civId !== civ.id || person.id === ruler?.id || !isAdult(run, person)) continue;
      if (run.students.has(person.id) || institutionOf(run, person.id)) continue;
      const fit =
        order.kind === 'academy'
          ? person.magic.power >= rules.academyMinPower &&
            // Scholars share the founder's school, so they can learn its lore.
            (person.magic.affinities[order.school ?? ''] ?? 0) > 0
          : (person.title !== undefined && rules.knightTitles.includes(person.title)) ||
            (isLegend(person) && academySpell(run, person) === undefined);
      if (!fit || !rng.chance(rules.recruitChance)) continue;
      const legend = isLegend(person);
      const event = run.emit({
        type: 'order_joined',
        ...(legend ? { importanceBonus: rules.legendJoinBonus } : {}),
        actors: [person.id],
        place: seat.cell,
        causes: [order.event],
        data: {
          name: person.name,
          order: order.name,
          site: seat.name,
          civ: civ.name,
          member: run.rules.orders.phrases.member[order.kind],
        },
      });
      addDeed(person, event.id);
      order.members.push(person.id);
      // Scholars gather at their academy.
      if (order.kind === 'academy') person.siteId = seat.id;
      count += 1;
    }
  }
}

// --- acting ------------------------------------------------------------------------------------

/** Scholars of an academy may gain a power a year (not those of a people with a college), and learn the academy's lore. */
function teach(run: HistoryRun): void {
  const rules = run.rules.orders;
  const rng = run.rng.orders;
  const top = LEGENDARY - 1;
  for (const order of openOrders(run)) {
    if (order.kind !== 'academy') continue;
    for (const person of membersOf(run, order)) {
      if (
        person.magic.power < top &&
        !collegeOf(run, person.civId) &&
        rng.chance(rules.trainChance)
      ) {
        person.magic.power += 1;
        const school = primarySchool(person);
        if (school !== undefined) {
          person.magic.affinities[school] = Math.max(
            person.magic.affinities[school] ?? 0,
            person.magic.power - 1,
          );
        }
      }
      const lesson = order.lore.find((id) => {
        const ability = run.lore.byId.get(id);
        return (
          ability !== undefined &&
          !person.knownAbilities.includes(id) &&
          meetsRequirements(person, ability)
        );
      });
      if (lesson === undefined || !rng.chance(rules.learnChance)) continue;
      person.knownAbilities.push(lesson);
      person.lore?.learned.push({ id: lesson, year: run.year, college: order.name });
    }
  }
}

/** The beast's latest raid on a town of the people within `years`, if any. */
function recentRaidOn(run: HistoryRun, beast: Creature, civ: Civ, years: number): Id | undefined {
  const since = (run.year - years) * DAYS_PER_YEAR;
  for (let i = beast.deeds.length - 1; i >= 0; i -= 1) {
    const event = eventById(run, beast.deeds[i]!);
    if (!event || event.day < since) return undefined;
    if (event.type === 'beast_raid' && event.data.civ === civ.name) return event.id;
  }
  return undefined;
}

/** Knights ride out against the nearest beast near their seat that raided their people lately: the strongest knight, the rest lending their strength. */
function knightHunts(run: HistoryRun): void {
  const rules = run.rules.orders;
  const range = run.content.notables.deeds.huntRange;
  const defs = new Map(run.content.creatures.map((d) => [d.id, d]));
  for (const order of openOrders(run)) {
    if (order.kind !== 'order') continue;
    const seat = order.siteId === null ? undefined : run.world.sites.get(order.siteId);
    const civ = liveCiv(run, order.civId);
    if (!seat || !civ) continue;
    const knights = membersOf(run, order).filter((p) => !isLegend(p));
    if (knights.length === 0 || !run.rng.orders.chance(rules.knightHuntChance)) continue;
    let hunter = knights[0]!;
    for (const knight of knights) {
      const a = deedSoldiers(run, knight);
      const b = deedSoldiers(run, hunter);
      if (a > b || (a === b && knight.fame > hunter.fame)) hunter = knight;
    }
    let prey: Creature | undefined;
    let raid: Id | undefined;
    let best = Infinity;
    for (const creature of livingCreatures(run)) {
      const distance = cellDistance(run.cells.width, seat.cell, whereIs(creature));
      if (distance > range || distance >= best) continue;
      const wrong = recentRaidOn(run, creature, civ, rules.knightRaidYears);
      if (wrong === undefined) continue;
      prey = creature;
      raid = wrong;
      best = distance;
    }
    const def: CreatureDef | undefined = prey ? defs.get(prey.defId) : undefined;
    if (!prey || !def) continue;
    let aid = 0;
    for (const other of membersOf(run, order))
      if (other.id !== hunter.id) aid += deedSoldiers(run, other);
    fightHunt(run, hunter, prey, def, seat, civ, raid, aid * rules.knightAid);
  }
}

// --- witch hunts -------------------------------------------------------------------------------

/** The nearest live people that does not persecute magic, by capital, where a hunted mage may flee. */
function refugeFor(run: HistoryRun, from: Civ): { civ: Civ; capital: Site } | undefined {
  const home = run.world.sites.get(from.capital);
  let best: { civ: Civ; capital: Site } | undefined;
  let nearest = Infinity;
  for (const civ of run.world.civs.values()) {
    if (civ.id === from.id || civ.fell !== undefined || magicAttitude(run, civ) === 'persecute')
      continue;
    const capital = run.world.sites.get(civ.capital);
    if (!capital || !isLive(capital) || capital.civId !== civ.id) continue;
    const distance = home ? cellDistance(run.cells.width, home.cell, capital.cell) : 0;
    if (distance < nearest) {
      nearest = distance;
      best = { civ, capital };
    }
  }
  return best;
}

/** Each year a persecuting people hunts its mages: Strong+ adults who are not the ruler or a knight of its order. */
function witchHunts(run: HistoryRun): void {
  const rules = run.rules.orders;
  const rng = run.rng.orders;
  const hunted = huntedSet(run);
  for (const person of livingList(run)) {
    if (person.died !== undefined || person.magic.power < STRONG || hunted.has(person.id)) continue;
    const civ = liveCiv(run, person.civId);
    if (!civ || magicAttitude(run, civ) !== 'persecute' || person.id === civ.rulerId) continue;
    if (!isAdult(run, person) || run.students.has(person.id)) continue;
    const order = openOf(run, civ.id, 'order');
    // The knights of the order hunt for the realm and are not hunted themselves.
    if (order && isMember(run, order, person.id)) continue;
    const legend = isLegend(person);
    // A pious or cruel ruler hunts harder, a learned one hardly at all (H2).
    const temper = rulerTilt(run, civ, 'hunt');
    const chance =
      rules.hunt.chance *
      (legend ? rules.hunt.legendFactor : 1) *
      (order ? rules.hunt.orderFactor : 1) *
      temper.mul;
    if (!rng.chance(chance)) continue;
    hunted.add(person.id);
    const head = order ? headOf(run, order) : undefined;
    const burned = rng.chance(legend ? rules.hunt.legendBurnChance : rules.hunt.burnChance);
    const flees = !burned && rng.chance(rules.hunt.fleeChance);
    const refuge = flees ? refugeFor(run, civ) : undefined;
    const where = siteOf(run, person);
    const outcome = burned
      ? rules.phrases.burned
      : refuge
        ? fillIn(rules.phrases.fled, { refuge: `the ${refuge.civ.name}` })
        : rules.phrases.hid;
    const hunt = run.emit({
      type: 'mage_hunted',
      actors: head ? [person.id, head.id] : [person.id],
      place: where?.cell ?? person.birthplaceCell,
      causes: person.deeds.slice(-1),
      data: {
        name: person.name,
        site: where?.name ?? 'the wilds',
        civ: civ.name,
        knights:
          order && head
            ? fillIn(rules.phrases.knights, { order: order.name, head: head.name })
            : '',
        outcome,
        ...temper.data,
      },
    });
    addDeed(person, hunt.id);
    if (head) addDeed(head, hunt.id);
    if (burned) {
      killNotable(run, person, {
        cause: 'execution',
        causes: [hunt.id],
        killer: head,
        importanceBonus: rules.hunt.burnImportance,
      });
    } else if (refuge) {
      person.civId = refuge.civ.id;
      person.siteId = refuge.capital.id;
    }
  }
}

/** Yearly, after the colleges: institutions keep their seats and heads, found, recruit, teach and ride; persecuting peoples hunt mages. */
export function runOrders(run: HistoryRun): void {
  const changed = keepOrders(run);
  loseLore(run, changed);
  foundOrders(run);
  recruit(run);
  teach(run);
  knightHunts(run);
  witchHunts(run);
}
