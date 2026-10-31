// Court intrigue: plots and killings, and legends in politics. A beaten claimant may plot against
// the ruler who beat them, an avenger against the foreign ruler or legend they swore on; a ruler
// may honour a legend of the realm, fear one who harmed their people, or be cast down by one. A
// legend may go over to a people that wronged their own, an enemy ruler may pay a legend to stand
// aside from a war, and peoples a legend harmed set a bounty and send a hunt. Every step is an
// event linked to the wrong that caused it. Draws come from the `intrigue` stream.

import type { Civ, Id, Person, SimEvent } from '../core/types';
import { clamp } from '../core/math';
import {
  canSpend,
  deedSoldiers,
  isLegend,
  killNotable,
  legendBreaks,
  markDeed,
  rulerOf,
  unruliness,
} from './notables';
import {
  FAME_MAX,
  addDeed,
  civOfPerson,
  eventById,
  isAdult,
  isElder,
  livingList,
  livingPerson,
  makeRivals,
  placeOf,
  siteOf,
} from './people';
import { bandCount } from './pop';
import {
  addGrievance,
  atWar,
  causesOf,
  grievanceEventsOf,
  liveSites,
  type HistoryRun,
} from './state';

type Motive = 'rival' | 'vengeance' | 'fear' | 'ownFear';

/** 1000 -> "1,000", as the chronicle writes numbers. */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "the A", "the A and the B", "the A, the B and the C". */
function listOf(names: readonly string[]): string {
  const named = names.map((n) => `the ${n}`);
  if (named.length <= 1) return named.join('');
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
}

/** The civ if it stands. */
function liveCiv(run: HistoryRun, id: Id | null | undefined): Civ | undefined {
  const civ = id === null || id === undefined ? undefined : run.world.civs.get(id);
  return civ && civ.fell === undefined ? civ : undefined;
}

/** The person's latest deed event that `accept`s, newest first. */
function latestDeed(
  run: HistoryRun,
  person: Person,
  accept: (event: SimEvent) => boolean = () => true,
): SimEvent | undefined {
  for (let i = person.deeds.length - 1; i >= 0; i -= 1) {
    const event = eventById(run, person.deeds[i]!);
    if (event && accept(event)) return event;
  }
  return undefined;
}

/** The legend's latest deed of renown they led (a rise, a slaying, a broken host, a duel, a hunt beaten off). */
function renownOf(run: HistoryRun, legend: Person): SimEvent | undefined {
  const { risePhrases } = run.content.notables.deeds;
  return latestDeed(
    run,
    legend,
    (e) =>
      e.actors[0] === legend.id &&
      (risePhrases[e.type] !== undefined ||
        e.type === 'legend_risen' ||
        e.type === 'legend_hunted'),
  );
}

const honouredBy = (run: HistoryRun, ruler: Person | undefined, legend: Person) =>
  ruler !== undefined && run.intrigue.honoured.has(`${ruler.id}:${legend.id}`);

/** A living adult who is not yet old and may plot: a free hand, of a standing people, off cooldown. */
function canPlot(run: HistoryRun, person: Person): boolean {
  if (person.died !== undefined || !isAdult(run, person) || isElder(run, person)) return false;
  if (!liveCiv(run, person.civId)) return false;
  const last = run.intrigue.lastPlot.get(person.id);
  return last === undefined || run.year - last >= run.rules.intrigue.plotCooldown;
}

/** The odds a plot strikes: the plotter's wits, against a guarded ruler or a hard-to-kill legend. */
function strikeOdds(run: HistoryRun, plotter: Person, target: Person, targetCiv?: Civ): number {
  const rules = run.rules.intrigue;
  const wits = (plotter.attributes.intellect - 10) * rules.strikeIntellect;
  const odds = isLegend(target)
    ? rules.legendStrike + wits
    : (rules.strikeBase + wits) * (targetCiv?.rulerId === target.id ? rules.rulerGuard : 1);
  return clamp(odds, rules.strikeRange[0], rules.strikeRange[1]);
}

/**
 * `plotter` tries to kill `target`. The plot is the plotter's deed and cites the grudge; if it
 * strikes the target dies, and a beaten claimant who kills their realm's ruler may take the seat.
 * A plot that fails is told too; the plotter may be taken and put to death, or live as the
 * target's rival. A killing or a failed plot abroad adds to the target's people's grievance.
 */
function plot(
  run: HistoryRun,
  plotter: Person,
  target: Person,
  motive: Motive,
  grudge: Id | undefined,
): void {
  const rules = run.rules.intrigue;
  const phrases = rules.phrases;
  const rng = run.rng.intrigue;
  const plotterCiv = civOfPerson(run, plotter);
  const targetCiv = civOfPerson(run, target);
  run.intrigue.lastPlot.set(plotter.id, run.year);
  const struck = rng.chance(strikeOdds(run, plotter, target, targetCiv));
  const dead = String(eventById(run, grudge ?? -1)?.data.dead ?? 'their dead');
  const why = phrases.why[motive]
    .replace('{dead}', dead)
    .replace('{target}', target.name)
    .replace('{civ}', plotterCiv?.name ?? 'realm');
  const abroad =
    plotterCiv !== undefined && targetCiv !== undefined && plotterCiv.id !== targetCiv.id;
  const data = {
    name: plotter.name,
    target: target.name,
    civ: plotterCiv?.name ?? 'no people',
    targetCiv: targetCiv?.name ?? 'no people',
    site: siteOf(run, target)?.name ?? 'the wilds',
    why,
  };
  const base = {
    actors: [plotter.id, target.id],
    place: placeOf(run, target),
    causes: causesOf(grudge),
  };

  if (struck) {
    const event = run.emit({
      type: 'plot_struck',
      ...base,
      data: { ...data, outcome: phrases.struck.replace('{target}', target.name) },
    });
    addDeed(plotter, event.id);
    markDeed(run, plotter);
    // A claimant who kills their realm's ruler may sit the seat (succeed in notables.ts).
    if (motive === 'rival' && plotterCiv && rng.chance(rules.usurpChance)) {
      run.intrigue.usurper = {
        civ: plotterCiv.id,
        person: plotter.id,
        cause: event.id,
        phrase: phrases.usurp.replace('{prior}', target.name),
      };
    }
    killNotable(run, target, { cause: 'assassination', killer: plotter, causes: [event.id] });
    run.intrigue.usurper = undefined;
    if (abroad) addGrievance(run, targetCiv.id, plotterCiv.id, rules.grievanceMurder, event.id);
    return;
  }

  const caught = rng.chance(rules.caughtChance);
  // A ruler caught plotting is exposed, not put to death by anyone.
  const executed = caught && plotter.id !== plotterCiv?.rulerId;
  const outcome = (
    executed ? phrases.foiledCaught : caught ? phrases.foiledExposed : phrases.foiledEscaped
  ).replace('{name}', plotter.name);
  const event = run.emit({ type: 'plot_foiled', ...base, data: { ...data, outcome } });
  addDeed(plotter, event.id);
  addDeed(target, event.id);
  markDeed(run, plotter);
  makeRivals(plotter, target);
  if (abroad) addGrievance(run, targetCiv.id, plotterCiv.id, rules.grievanceFoiled, event.id);
  if (executed) killNotable(run, plotter, { cause: 'execution', causes: [event.id] });
}

/** Yearly: beaten claimants plot against the ruler, and avengers against the foreign ruler or legend they swore on. */
function runPlots(run: HistoryRun): void {
  const rules = run.rules.intrigue;
  const rng = run.rng.intrigue;
  for (const plotter of livingList(run)) {
    if (!canPlot(run, plotter)) continue;
    const civ = liveCiv(run, plotter.civId)!;
    const ruler = rulerOf(run, civ);
    if (ruler && ruler.id !== plotter.id && plotter.rivals?.includes(ruler.id)) {
      const chance = clamp(rules.rivalPlotChance * unruliness(run, civ), 0, 1);
      if (rng.chance(chance)) {
        // The wrong between them: the lost claim, the seat taken, or an earlier plot.
        const grudge = latestDeed(
          run,
          plotter,
          (e) =>
            (e.type === 'succession_disputed' ||
              e.type === 'seat_seized' ||
              e.type === 'plot_foiled') &&
            e.actors.includes(ruler.id),
        );
        if (grudge) {
          plot(run, plotter, ruler, 'rival', grudge.id);
          continue;
        }
      }
    }
    // An avenger's sworn enemy: a foreign ruler or legend still living.
    const foe = (plotter.enemies ?? [])
      .map((id) => livingPerson(run, id))
      .find(
        (t) =>
          t !== undefined &&
          t.civId != null &&
          t.civId !== plotter.civId &&
          (isLegend(t) || liveCiv(run, t.civId)?.rulerId === t.id),
      );
    if (foe && rng.chance(rules.vengeancePlotChance)) {
      const oath = latestDeed(
        run,
        plotter,
        (e) => e.type === 'oath_sworn' && e.actors.includes(foe.id),
      );
      if (oath) plot(run, plotter, foe, 'vengeance', oath.id);
    }
  }
}

/** The strongest living adult legend of the civ that `accept`s (power, then fame, then lowest id). */
function strongestLegend(
  run: HistoryRun,
  civ: Civ,
  accept: (person: Person) => boolean,
): Person | undefined {
  let best: Person | undefined;
  for (const person of livingList(run)) {
    if (person.civId !== civ.id || !isLegend(person) || !isAdult(run, person)) continue;
    if (isElder(run, person) || !accept(person)) continue;
    if (
      !best ||
      person.magic.power > best.magic.power ||
      (person.magic.power === best.magic.power && person.fame > best.fame)
    )
      best = person;
  }
  return best;
}

/** Yearly, before the wars march: an enemy ruler may pay a legend to stand aside, and a paid legend stays out. */
export function runBribes(run: HistoryRun): void {
  const rules = run.rules.intrigue;
  for (const war of run.wars) {
    if (war.ended !== undefined || war.civil) continue;
    const known = run.intrigue.bribed.get(war.id);
    if (known !== undefined) {
      // The day of power is bought for the whole war: no host broken, no duel.
      const paid = livingPerson(run, known);
      if (paid) run.notables.spent.set(paid.id, run.year);
      continue;
    }
    for (const [mine, theirs] of [
      [war.attacker, war.defender],
      [war.defender, war.attacker],
    ] as const) {
      const civ = liveCiv(run, mine);
      const enemy = liveCiv(run, theirs);
      const payer = enemy && rulerOf(run, enemy);
      if (!civ || !enemy || !payer) continue;
      const own = rulerOf(run, civ);
      const legend = strongestLegend(
        run,
        civ,
        (p) => p.id !== own?.id && !honouredBy(run, own, p) && canSpend(run, p),
      );
      if (!legend || !run.rng.intrigue.chance(rules.bribeChance)) continue;
      const gift = run.rng.intrigue.pick(rules.phrases.bribes);
      const event = run.emit({
        type: 'legend_bribed',
        actors: [payer.id, legend.id],
        place: placeOf(run, legend),
        causes: causesOf(war.lastEvent),
        data: {
          name: legend.name,
          ruler: payer.name,
          civ: civ.name,
          enemyCiv: enemy.name,
          gift,
          war: war.id,
        },
      });
      addDeed(legend, event.id);
      addDeed(payer, event.id);
      run.intrigue.bribed.set(war.id, legend.id);
      run.notables.spent.set(legend.id, run.year);
      break;
    }
  }
}

/** A ruler honours a legend of the realm: a gift, fame, and the legend's loyalty. */
function honour(run: HistoryRun, legend: Person, civ: Civ, ruler: Person): void {
  const rules = run.rules.intrigue;
  const site = siteOf(run, legend);
  const gift = run.rng.intrigue.pick(rules.phrases.gifts).replace('{site}', site?.name ?? civ.name);
  const deed = renownOf(run, legend);
  const event = run.emit({
    type: 'legend_honoured',
    actors: [ruler.id, legend.id],
    place: placeOf(run, legend),
    causes: causesOf(deed?.id),
    data: {
      ruler: ruler.name,
      name: legend.name,
      civ: civ.name,
      site: site?.name ?? civ.name,
      gift,
    },
  });
  run.intrigue.honoured.add(`${ruler.id}:${legend.id}`);
  addDeed(legend, event.id);
  legend.fame = Math.min(FAME_MAX, legend.fame + rules.honourFame);
}

/** A rival legend casts the ruler down and takes the seat. */
function coup(run: HistoryRun, legend: Person, civ: Civ, ruler: Person): void {
  const rules = run.rules.intrigue;
  const wrong =
    latestDeed(
      run,
      legend,
      (e) => (e.type === 'plot_foiled' || e.type === 'seat_seized') && e.actors.includes(ruler.id),
    ) ?? renownOf(run, legend);
  const how = rules.phrases.coup.replace('{prior}', ruler.name);
  const event = run.emit({
    type: 'seat_seized',
    actors: [legend.id, ruler.id],
    place: run.world.sites.get(civ.capital)?.cell ?? null,
    causes: causesOf(wrong?.id),
    data: { name: legend.name, heir: '', prior: ruler.name, civ: civ.name, how },
  });
  addDeed(legend, event.id);
  addDeed(ruler, event.id);
  markDeed(run, legend);
  run.intrigue.usurper = {
    civ: civ.id,
    person: legend.id,
    cause: event.id,
    phrase: rules.phrases.seizedRule,
  };
  killNotable(run, ruler, { cause: 'overthrow', killer: legend, causes: [event.id] });
  run.intrigue.usurper = undefined;
}

/**
 * Once in a life, a legend not honoured by their ruler goes over to a people at war with theirs
 * or holding a grievance of it: the ruler's rival to any such people, a stranger to the realm's
 * ways only to a people of their own ways.
 */
function betray(run: HistoryRun, legend: Person, civ: Civ, ruler: Person): boolean {
  const rules = run.rules.intrigue;
  if (run.intrigue.turncoats.has(legend.id)) return false;
  const rival = ruler.rivals?.includes(legend.id) === true;
  if (!rival && legend.cultureId === civ.cultureId) return false;
  for (const other of run.world.civs.values()) {
    if (other.id === civ.id || other.fell !== undefined) continue;
    if (!rival && other.cultureId !== legend.cultureId) continue;
    if (!atWar(run, other.id, civ.id) && (other.grievances.get(civ.id) ?? 0) < rules.fearGrievance)
      continue;
    const capital = run.world.sites.get(other.capital);
    const lord = rulerOf(run, other);
    if (!capital || capital.ruinedYear !== undefined || !lord) continue;
    if (!run.rng.intrigue.chance(rules.betrayChance)) return false;
    // The rival's wrong is the quarrel with the ruler; the stranger's, the newest wrong between the peoples.
    const wrong = rival
      ? latestDeed(
          run,
          legend,
          (e) =>
            (e.type === 'plot_foiled' ||
              e.type === 'succession_disputed' ||
              e.type === 'seat_seized') &&
            e.actors.includes(ruler.id),
        )
      : undefined;
    const between = grievanceEventsOf(run, other.id, civ.id);
    const cause = wrong?.id ?? between[between.length - 1] ?? renownOf(run, legend)?.id;
    const why = (rival ? rules.phrases.betrayRival : rules.phrases.betrayStranger)
      .replace('{ruler}', ruler.name)
      .replace('{civ}', civ.name);
    const event = run.emit({
      type: 'legend_betrayed',
      actors: [legend.id, ruler.id, lord.id],
      place: capital.cell,
      causes: causesOf(cause),
      data: {
        name: legend.name,
        ruler: ruler.name,
        civ: civ.name,
        newCiv: other.name,
        newRuler: lord.name,
        why,
      },
    });
    legend.civId = other.id;
    legend.siteId = capital.id;
    run.intrigue.turncoats.add(legend.id);
    addDeed(legend, event.id);
    markDeed(run, legend);
    addGrievance(run, civ.id, other.id, rules.grievanceBetrayal, event.id);
    // A people that put a price on their head has no price to pay once the legend is its own.
    run.intrigue.bounties.get(legend.id)?.delete(other.id);
    return true;
  }
  return false;
}

/** Peoples a legend harmed twice or more set a bounty on them. */
function setBounties(run: HistoryRun, legend: Person, civ: Civ): void {
  const rules = run.rules.intrigue;
  const harmed = run.intrigue.harm.get(legend.id);
  if (!harmed) return;
  for (const other of run.world.civs.values()) {
    if (other.id === civ.id || other.fell !== undefined) continue;
    const harms = harmed.get(other.id) ?? [];
    if (harms.length < rules.bountyHarms || run.intrigue.bounties.get(legend.id)?.has(other.id))
      continue;
    const lord = rulerOf(run, other);
    if (!lord) continue;
    const event = run.emit({
      type: 'bounty_set',
      actors: [lord.id, legend.id],
      place: run.world.sites.get(other.capital)?.cell ?? null,
      causes: causesOf(harms[harms.length - 1]),
      data: {
        ruler: lord.name,
        civ: other.name,
        name: legend.name,
        legendCiv: civ.name,
        price: run.rng.intrigue.pick(rules.phrases.prices),
      },
    });
    addDeed(lord, event.id);
    addDeed(legend, event.id);
    let bounties = run.intrigue.bounties.get(legend.id);
    if (!bounties) {
      bounties = new Map();
      run.intrigue.bounties.set(legend.id, bounties);
    }
    bounties.set(other.id, event.id);
    addGrievance(run, other.id, civ.id, rules.grievanceShelter, event.id);
  }
}

/** Foreign rulers the legend harmed (and who hold a grudge or war on their people) may plot against them; so may their own. */
function fearedBy(run: HistoryRun, legend: Person, civ: Civ): void {
  const rules = run.rules.intrigue;
  const rng = run.rng.intrigue;
  for (const other of run.world.civs.values()) {
    if (legend.died !== undefined) return;
    if (other.id === civ.id || other.fell !== undefined) continue;
    const harms = run.intrigue.harm.get(legend.id)?.get(other.id) ?? [];
    if (harms.length === 0) continue;
    if (!atWar(run, other.id, civ.id) && (other.grievances.get(civ.id) ?? 0) < rules.fearGrievance)
      continue;
    const lord = rulerOf(run, other);
    if (!lord || !canPlot(run, lord) || !rng.chance(rules.fearPlotChance)) continue;
    plot(run, lord, legend, 'fear', harms[harms.length - 1]);
  }
  const ruler = rulerOf(run, civ);
  if (legend.died !== undefined || !ruler || ruler.id === legend.id) return;
  if (honouredBy(run, ruler, legend) || legend.fame <= ruler.fame || !canPlot(run, ruler)) return;
  if (rng.chance(rules.ownFearChance))
    plot(run, ruler, legend, 'ownFear', renownOf(run, legend)?.id);
}

/** Yearly, for each legend of a standing people: honours, fears, a seat seized, betrayal and bounties. */
function legendsAtCourt(run: HistoryRun): void {
  const rules = run.rules.intrigue;
  for (const legend of livingList(run)) {
    if (legend.died !== undefined || !isLegend(legend)) continue;
    if (!isAdult(run, legend) || isElder(run, legend)) continue;
    const civ = liveCiv(run, legend.civId);
    if (!civ) continue;
    let ruler = rulerOf(run, civ);
    if (
      ruler &&
      ruler.id !== legend.id &&
      !honouredBy(run, ruler, legend) &&
      ruler.rivals?.includes(legend.id) !== true &&
      run.rng.intrigue.chance(rules.honourChance)
    )
      honour(run, legend, civ, ruler);
    fearedBy(run, legend, civ);
    if (legend.died !== undefined) continue;
    ruler = rulerOf(run, civ);
    if (ruler && ruler.id !== legend.id && !honouredBy(run, ruler, legend)) {
      if (ruler.rivals?.includes(legend.id) && run.rng.intrigue.chance(rules.coupChance)) {
        coup(run, legend, civ, ruler);
        continue;
      }
      if (betray(run, legend, civ, ruler)) continue;
    }
    setBounties(run, legend, civ);
  }
}

/** A people's adults, for the host it sends. */
function adultsOf(run: HistoryRun, civ: Civ): number {
  return liveSites(run)
    .filter((s) => s.civId === civ.id)
    .reduce((n, s) => n + bandCount(s, 'adult'), 0);
}

/** The people's strongest living adult figure of hunter power (power, then fame, then lowest id). */
function hunterOf(run: HistoryRun, civ: Civ, legend: Person): Person | undefined {
  let best: Person | undefined;
  for (const person of livingList(run)) {
    if (person.civId !== civ.id || person.id === legend.id) continue;
    if (person.magic.power < run.rules.intrigue.hunterPower || !isAdult(run, person)) continue;
    if (isElder(run, person)) continue;
    if (
      !best ||
      person.magic.power > best.magic.power ||
      (person.magic.power === best.magic.power && person.fame > best.fame)
    )
      best = person;
  }
  return best;
}

/** Yearly: the peoples with a bounty on a legend may send a hunt, joint when two or more hold one. */
function huntLegends(run: HistoryRun): void {
  const rules = run.rules.intrigue;
  const rng = run.rng.intrigue;
  for (const id of [...run.intrigue.bounties.keys()].sort((a, b) => a - b)) {
    const legend = livingPerson(run, id);
    if (!legend || !canSpend(run, legend)) continue;
    const bounties = run.intrigue.bounties.get(id)!;
    const civs: Civ[] = [];
    for (const civId of [...bounties.keys()].sort((a, b) => a - b)) {
      const civ = liveCiv(run, civId);
      if (civ && civ.id !== legend.civId) civs.push(civ);
    }
    if (civs.length === 0) continue;
    const chance = civs.length >= rules.coalitionMin ? rules.coalitionChance : rules.soloHuntChance;
    if (!rng.chance(chance)) continue;
    const hunters: Person[] = [];
    let host = 0;
    for (const civ of civs) {
      host += Math.min(rules.huntCap, Math.floor(adultsOf(run, civ) * rules.huntShare));
      const hunter = hunterOf(run, civ, legend);
      if (hunter) hunters.push(hunter);
    }
    // A people too small to field a host worth the name sends none.
    if (host < rules.huntMin) continue;
    const strength = host + hunters.reduce((n, h) => n + deedSoldiers(run, h), 0);
    const outgunned = strength > legendBreaks(run, legend);
    // A host the legend can break still lands a killing blow now and then.
    const lucky = !outgunned && rng.chance(rules.huntLuckyKill);
    const slain = lucky || (outgunned && rng.chance(rules.huntKill));
    const outcome = (
      lucky
        ? rules.phrases.huntLucky
        : slain
          ? rules.phrases.huntKilled
          : outgunned
            ? rules.phrases.huntEscaped
            : rules.phrases.huntFailed
    ).replace('{name}', legend.name);
    const event = run.emit({
      type: 'legend_hunted',
      actors: [legend.id, ...hunters.map((h) => h.id)],
      place: placeOf(run, legend),
      causes: causesOf(...civs.map((c) => bounties.get(c.id))),
      data: {
        name: legend.name,
        civ: civOfPerson(run, legend)?.name ?? 'no people',
        hunters: listOf(civs.map((c) => c.name)),
        host: thousands(host),
        outcome,
      },
    });
    addDeed(legend, event.id);
    markDeed(run, legend);
    run.notables.spent.set(legend.id, run.year);
    if (slain) {
      // The hunter with the most power struck the blow.
      const killer = hunters.reduce<Person | undefined>(
        (best, h) => (!best || deedSoldiers(run, h) > deedSoldiers(run, best) ? h : best),
        undefined,
      );
      killNotable(run, legend, { cause: 'battle', killer, causes: [event.id] });
      run.intrigue.bounties.delete(id);
    } else if (!outgunned && !lucky) {
      for (const hunter of hunters) {
        if (rng.chance(rules.hunterDeath))
          killNotable(run, hunter, { cause: 'battle', killer: legend, causes: [event.id] });
      }
    }
  }
}

/** Yearly, after the civil wars: plots, then legends at court, then the hunts for outlaw legends. */
export function runIntrigue(run: HistoryRun): void {
  runPlots(run);
  legendsAtCourt(run);
  huntLegends(run);
}
