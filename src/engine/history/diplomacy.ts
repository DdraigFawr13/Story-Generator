// Diplomacy: civs swear alliances each decade (a shared enemy, one faith, a marriage tie, trade); a war
// calls the defender's allies, who come or break faith; allies drift apart and one may betray the
// other; a beaten realm may bend the knee, pay tribute and, in time, revolt; and a wedding between
// the children of two warring rulers may end the war. Numbers are content (`rules.diplomacy`);
// every roll uses the `diplomacy` stream; events carry the names they print.

import type { Civ, Id, Person, SimEvent } from '../core/types';
import { cultureValue, strangeness } from './values';
import { faithOf } from './faith';
import { linkedCivIds } from './city-states';
import { eligibleToMarry, rulerOf, sharesSpouseName } from './notables';
import { addDeed, closeKin, eventById, livingPerson, makeRivals, wed } from './people';
import { bandCount, siteNeed } from './pop';
import {
  addGrievance,
  atWar,
  causesOf,
  grievanceEventsOf,
  liveSites,
  pairKey,
  type HistoryRun,
  type Pact,
  type War,
} from './state';
import { civStrength, endWar, reachable, startWar } from './war';

const DECADE = 10;

function liveCiv(run: HistoryRun, id: Id): Civ | undefined {
  const civ = run.world.civs.get(id);
  return civ && civ.fell === undefined ? civ : undefined;
}

function capitalCell(run: HistoryRun, civ: Civ): number | null {
  return run.world.sites.get(civ.capital)?.cell ?? null;
}

function rulerIds(run: HistoryRun, ...civs: Civ[]): Id[] {
  return civs.flatMap((c) => {
    const ruler = rulerOf(run, c);
    return ruler ? [ruler.id] : [];
  });
}

function adultsOfCiv(run: HistoryRun, civ: Civ): number {
  let n = 0;
  for (const site of liveSites(run)) if (site.civId === civ.id) n += bandCount(site, 'adult');
  return n;
}

function alliances(run: HistoryRun, civ: Civ): Pact[] {
  return run.pacts.filter((p) => p.kind === 'alliance' && (p.a === civ.id || p.b === civ.id));
}

function pactBetween(run: HistoryRun, a: Id, b: Id): boolean {
  return run.pacts.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
}

function dropPact(run: HistoryRun, pact: Pact): void {
  run.pacts = run.pacts.filter((p) => p !== pact);
}

function sameFaith(run: HistoryRun, a: Civ, b: Civ): boolean {
  const [fa, fb] = [faithOf(run, a), faithOf(run, b)];
  return fa !== undefined && fb !== undefined && fa.id === fb.id;
}

function yearsPhrase(run: HistoryRun, years: number): string {
  const { phrases } = run.rules.diplomacy;
  return years <= 1 ? phrases.oneYear : phrases.years.replace('{n}', String(years));
}

// --- alliances ---------------------------------------------------------------------------------

/** A third civ both hold at fault or both fight, and the event that shows it. */
function sharedEnemy(
  run: HistoryRun,
  a: Civ,
  b: Civ,
): { civ: Civ; cause: Id | undefined } | undefined {
  const rules = run.rules.diplomacy.alliance;
  for (const civ of run.world.civs.values()) {
    if (civ.fell !== undefined || civ.id === a.id || civ.id === b.id) continue;
    const grudge =
      (a.grievances.get(civ.id) ?? 0) >= rules.sharedEnemy &&
      (b.grievances.get(civ.id) ?? 0) >= rules.sharedEnemy;
    if (grudge) {
      const events = [
        ...grievanceEventsOf(run, a.id, civ.id),
        ...grievanceEventsOf(run, b.id, civ.id),
      ];
      return { civ, cause: events.length > 0 ? Math.max(...events) : undefined };
    }
    if (atWar(run, a.id, civ.id) && atWar(run, b.id, civ.id)) {
      const war = run.wars.find(
        (w) =>
          w.ended === undefined &&
          (w.attacker === a.id || w.defender === a.id) &&
          (w.attacker === civ.id || w.defender === civ.id),
      );
      return { civ, cause: war?.cause };
    }
  }
  return undefined;
}

interface Reasons {
  enemy?: { civ: Civ; cause: Id | undefined } | undefined;
  faith: boolean;
  marriage?: { year: number; event: Id } | undefined;
  /** The trade_opened event between them. */
  trade?: Id | undefined;
  count: number;
}

function reasonsFor(run: HistoryRun, a: Civ, b: Civ): Reasons {
  const rules = run.rules.diplomacy.alliance;
  const enemy = sharedEnemy(run, a, b);
  const faith = sameFaith(run, a, b);
  const tie = run.diplomacy.marriages.get(pairKey(a.id, b.id));
  const marriage = tie && run.year - tie.year <= rules.marriageYears ? tie : undefined;
  const trade = run.tradeOpened.get(pairKey(a.id, b.id));
  const count = (enemy ? 1 : 0) + (faith ? 1 : 0) + (marriage ? 1 : 0) + (trade ? 1 : 0);
  return { enemy, faith, marriage, trade, count };
}

/** The phrase for the strongest reason: a shared enemy, then the gods, then a marriage, then trade. */
function whyPhrase(run: HistoryRun, a: Civ, reasons: Reasons): string {
  const why = run.rules.diplomacy.phrases.why;
  if (reasons.enemy) return why.enemy.replace('{enemy}', reasons.enemy.civ.name);
  if (reasons.faith) {
    // "in the name of the Ancestor Stones": a faith named "The ..." reads lower-case mid-sentence.
    const name = (faithOf(run, a)?.name ?? 'their gods').replace(/^The /, 'the ');
    return why.faith.replace('{faith}', name);
  }
  if (!reasons.marriage) return why.trade;
  const spouses = reasons.marriage && eventById(run, reasons.marriage.event);
  return why.marriage
    .replace('{a}', String(spouses?.data.a ?? 'the bride'))
    .replace('{b}', String(spouses?.data.b ?? 'the groom'));
}

function swearAlliance(run: HistoryRun, a: Civ, b: Civ, why: string, causes: Id[]): void {
  const event = run.emit({
    type: 'alliance_sworn',
    place: capitalCell(run, a),
    actors: rulerIds(run, a, b),
    causes,
    data: { civ: a.name, other: b.name, why },
  });
  run.pacts.push({
    kind: 'alliance',
    a: a.id,
    b: b.id,
    since: run.year,
    event: event.id,
    aided: [],
    answered: [],
    refused: [],
    faiths: [faithOf(run, a)?.id, faithOf(run, b)?.id],
  });
}

/** Each decade: a civ with room for an ally looks for the neighbour it has most reason to trust. */
function swearAlliances(run: HistoryRun): void {
  const rules = run.rules.diplomacy.alliance;
  const rng = run.rng.diplomacy;
  for (const a of [...run.world.civs.values()]) {
    if (a.fell !== undefined || a.overlord !== undefined) continue;
    if (alliances(run, a).length >= rules.maxAllies) continue;
    let best: { civ: Civ; reasons: Reasons; adults: number } | undefined;
    for (const id of linkedCivIds(run, a)) {
      const b = liveCiv(run, id);
      if (!b || b.overlord !== undefined || atWar(run, a.id, b.id)) continue;
      if (pactBetween(run, a.id, b.id) || alliances(run, b).length >= rules.maxAllies) continue;
      if ((a.grievances.get(b.id) ?? 0) > rules.maxGrievance) continue;
      if ((b.grievances.get(a.id) ?? 0) > rules.maxGrievance) continue;
      if (strangeness(run, a, b) > rules.maxStrangeness) continue;
      const reasons = reasonsFor(run, a, b);
      if (reasons.count === 0) continue;
      const adults = adultsOfCiv(run, b);
      if (
        !best ||
        reasons.count > best.reasons.count ||
        (reasons.count === best.reasons.count && adults > best.adults)
      )
        best = { civ: b, reasons, adults };
    }
    if (!best || !rng.chance(Math.min(1, rules.chance * best.reasons.count))) continue;
    const { enemy, marriage, trade } = best.reasons;
    swearAlliance(
      run,
      a,
      best.civ,
      whyPhrase(run, a, best.reasons),
      causesOf(enemy?.cause, marriage?.event, trade),
    );
  }
}

// --- calls to arms -----------------------------------------------------------------------------

/** A new war calls the defender's allies and vassal pacts, before its first battle. */
export function callToArms(run: HistoryRun): void {
  const rules = run.rules.diplomacy.call;
  const rng = run.rng.diplomacy;
  for (const war of run.wars) {
    // Once per war, the first year it is fought (a war a betrayal or a revolt opened is called the next year).
    if (war.called || war.civil || war.ended !== undefined) continue;
    war.called = true;
    const attacker = liveCiv(run, war.attacker);
    const defender = liveCiv(run, war.defender);
    if (!attacker || !defender) continue;
    for (const pact of [...run.pacts]) {
      if (pact.kind === undefined) continue;
      const otherId = pact.a === defender.id ? pact.b : pact.b === defender.id ? pact.a : undefined;
      const ally = otherId === undefined ? undefined : liveCiv(run, otherId);
      if (!ally || ally.id === attacker.id || atWar(run, ally.id, defender.id)) continue;
      // Overlord and vassal stand together without a word.
      if (pact.kind === 'vassal') {
        (pact.answered ??= []).push(war.id);
        continue;
      }
      // An ally bound to both sides stands aside.
      if (
        run.pacts.some(
          (p) =>
            p.kind === 'alliance' &&
            ((p.a === ally.id && p.b === attacker.id) || (p.b === ally.id && p.a === attacker.id)),
        )
      )
        continue;
      const odds = Math.min(
        0.95,
        Math.max(
          0.05,
          rules.answerBase +
            (cultureValue(run, ally, 'honour') - 5) * rules.answerHonour +
            (sameFaith(run, ally, defender) ? rules.sameFaith : 0),
        ),
      );
      const data = { civ: ally.name, friend: defender.name, enemy: attacker.name };
      if (rng.chance(odds)) {
        (pact.answered ??= []).push(war.id);
        const event = run.emit({
          type: 'ally_answered',
          place: capitalCell(run, ally),
          actors: rulerIds(run, ally),
          causes: [war.cause, pact.event],
          data,
        });
        addGrievance(run, attacker.id, ally.id, rules.grievanceJoined, event.id);
      } else {
        (pact.refused ??= []).push(war.id);
        const event = run.emit({
          type: 'call_refused',
          place: capitalCell(run, ally),
          actors: rulerIds(run, ally, defender),
          causes: [war.cause, pact.event],
          data,
        });
        dropPact(run, pact);
        addGrievance(run, defender.id, ally.id, rules.grievanceRefused, event.id);
        const [mine, theirs] = [rulerOf(run, ally), rulerOf(run, defender)];
        if (mine && theirs) makeRivals(mine, theirs);
      }
    }
  }
}

/** Allies who came to blows end their alliance with the old pact line. */
function breakWarring(run: HistoryRun): void {
  for (const pact of [...run.pacts]) {
    if (pact.kind !== 'alliance' || !atWar(run, pact.a, pact.b)) continue;
    const [a, b] = [liveCiv(run, pact.a), liveCiv(run, pact.b)];
    if (!a || !b) continue;
    run.emit({
      type: 'pact_broken',
      place: capitalCell(run, a),
      causes: [pact.event],
      data: { civ: a.name, other: b.name },
    });
    dropPact(run, pact);
  }
}

// --- betrayal ----------------------------------------------------------------------------------

/** Each decade: allies who have drifted apart may break the oath; the stronger side turns on the other. */
function betrayals(run: HistoryRun): void {
  const rules = run.rules.diplomacy.betrayal;
  const phrases = run.rules.diplomacy.phrases;
  const rng = run.rng.diplomacy;
  const typical = run.rules.cultureValues.typicalStrangeness;
  const pacts = run.pacts
    .filter((p) => p.kind === 'alliance')
    .sort((p, q) => p.a - q.a || p.b - q.b);
  for (const pact of pacts) {
    const [a, b] = [liveCiv(run, pact.a), liveCiv(run, pact.b)];
    if (!a || !b || !run.pacts.includes(pact)) continue;
    // Fresh oaths and comrades in a recent war hold.
    const lastCall = run.wars
      .filter((w) => pact.answered?.includes(w.id))
      .reduce((year, w) => Math.max(year, w.ended ?? run.year), pact.since);
    if (run.year - lastCall < rules.graceYears) continue;
    const [sa, sb] = [civStrength(run, a), civStrength(run, b)];
    const [betrayer, victim] = sa >= sb ? [a, b] : [b, a];
    const [strong, weak] = sa >= sb ? [sa, sb] : [sb, sa];
    const [fa, fb] = [faithOf(run, a)?.id, faithOf(run, b)?.id];
    const [ra, rb] = [rulerOf(run, a), rulerOf(run, b)];
    // The terms in the order a tie is settled: the gods, the rulers, the weak, the ways.
    const terms: [string, number][] = [
      [
        phrases.betrayed.faith,
        pact.faiths && (pact.faiths[0] !== fa || pact.faiths[1] !== fb) ? rules.faithSplit : 0,
      ],
      [phrases.betrayed.rivals, ra && rb && ra.rivals?.includes(rb.id) ? rules.rivals : 0],
      [phrases.betrayed.weak, weak < rules.weakRatio * strong ? rules.weak : 0],
      [phrases.betrayed.strange, strangeness(run, a, b) / typical],
    ];
    const drift = terms.reduce((sum, [, v]) => sum + v, 0);
    if (!rng.chance(Math.min(1, rules.chance * drift))) continue;
    let why = terms[0]!;
    for (const term of terms) if (term[1] > why[1]) why = term;
    const marches =
      strong >= rules.attackRatio * weak && reachable(run, betrayer, victim).length > 0;
    const outcome = marches ? phrases.outcome.war : phrases.outcome.renounced;
    const event = run.emit({
      type: 'alliance_betrayed',
      place: capitalCell(run, betrayer),
      actors: rulerIds(run, betrayer, victim),
      causes: [pact.event],
      data: {
        civ: betrayer.name,
        victim: victim.name,
        why: why[0].replace('{victim}', victim.name),
        outcome,
        outcomeShort: marches ? phrases.outcomeShort.war : phrases.outcomeShort.renounced,
      },
    });
    dropPact(run, pact);
    addGrievance(run, victim.id, betrayer.id, rules.grievance, event.id);
    if (marches) startWar(run, betrayer, victim, [event.id]);
  }
}

// --- vassals -----------------------------------------------------------------------------------

/**
 * A war's end: a winner who took towns and is far stronger may make the loser its vassal.
 * Called by `endWar` after `peace_made`.
 */
export function swearVassal(
  run: HistoryRun,
  war: War,
  attacker: Civ,
  defender: Civ,
  peace: SimEvent,
): void {
  const rules = run.rules.diplomacy.vassal;
  if (war.civil || (war.taken ?? 0) < rules.minTaken) return;
  if (defender.overlord !== undefined || attacker.overlord !== undefined) return;
  if (civStrength(run, attacker) < rules.strengthRatio * civStrength(run, defender)) return;
  if (!run.rng.diplomacy.chance(rules.chance)) return;
  const event = run.emit({
    type: 'vassal_sworn',
    place: capitalCell(run, attacker),
    actors: rulerIds(run, defender, attacker),
    causes: [peace.id],
    data: { civ: defender.name, overlord: attacker.name, sites: war.taken ?? 0 },
  });
  defender.overlord = attacker.id;
  // A vassal's friends are its overlord's: its alliances lapse.
  run.pacts = run.pacts.filter(
    (p) => !(p.kind === 'alliance' && (p.a === defender.id || p.b === defender.id)),
  );
  run.pacts.push({
    kind: 'vassal',
    a: attacker.id,
    b: defender.id,
    since: run.year,
    event: event.id,
    aided: [],
    answered: [],
    refused: [],
    faiths: [faithOf(run, attacker)?.id, faithOf(run, defender)?.id],
  });
}

/** The overlord fell: its vassal is free. */
export function freeVassal(run: HistoryRun, pact: Pact, overlord: Civ, vassal: Civ): void {
  delete vassal.overlord;
  let fall: Id | undefined;
  const events = run.world.events;
  for (let i = events.length - 1; i >= 0 && fall === undefined; i -= 1) {
    const event = events[i]!;
    if (event.type === 'civ_fell' && event.data.civ === overlord.name) fall = event.id;
  }
  run.emit({
    type: 'vassal_freed',
    place: capitalCell(run, vassal),
    actors: rulerIds(run, vassal),
    causes: [fall ?? pact.event],
    data: { civ: vassal.name, overlord: overlord.name },
  });
}

/** Yearly: each vassal's towns send a share of their food to the overlord's capital, up to its stores limit. */
function tribute(run: HistoryRun): void {
  const share = run.rules.diplomacy.vassal.tributeShare;
  for (const pact of run.pacts) {
    if (pact.kind !== 'vassal') continue;
    const overlord = liveCiv(run, pact.a);
    const capital = overlord && run.world.sites.get(overlord.capital);
    if (!capital) continue;
    const cap = run.rules.storesCapYears * siteNeed(capital, run.races);
    for (const site of liveSites(run)) {
      if (site.civId !== pact.b) continue;
      const room = Math.max(0, cap - capital.goods.food);
      const sent = Math.min(Math.floor(site.goods.food * share), Math.floor(room));
      if (sent <= 0) continue;
      site.goods.food -= sent;
      capital.goods.food += sent;
    }
  }
}

/** Yearly: after enough years of fealty a vassal as strong as it needs to be may rise. */
function revolts(run: HistoryRun): void {
  const rules = run.rules.diplomacy.vassal;
  for (const pact of [...run.pacts]) {
    if (pact.kind !== 'vassal' || run.year - pact.since < rules.minYears) continue;
    const [overlord, vassal] = [liveCiv(run, pact.a), liveCiv(run, pact.b)];
    if (!overlord || !vassal) continue;
    if (civStrength(run, vassal) < rules.revoltRatio * civStrength(run, overlord)) continue;
    const busy = run.wars.some(
      (w) =>
        w.ended === undefined &&
        !w.civil &&
        (w.attacker === overlord.id || w.defender === overlord.id) &&
        w.attacker !== vassal.id &&
        w.defender !== vassal.id,
    );
    const odds = Math.min(1, rules.revoltChance * (busy ? rules.overlordAtWar : 1));
    if (!run.rng.diplomacy.chance(odds)) continue;
    const event = run.emit({
      type: 'vassal_revolt',
      place: capitalCell(run, vassal),
      actors: rulerIds(run, vassal, overlord),
      causes: [pact.event],
      data: { civ: vassal.name, overlord: overlord.name, years: run.year - pact.since },
    });
    delete vassal.overlord;
    dropPact(run, pact);
    addGrievance(run, vassal.id, overlord.id, rules.grievanceRevolt, event.id);
    startWar(run, vassal, overlord, [event.id]);
  }
}

// --- peace by marriage -------------------------------------------------------------------------

/**
 * Who a ruler can offer in marriage: their own unwed children first, then any unwed member of
 * their house in the realm (siblings, nephews, cousins), each in id order.
 */
function marriageable(run: HistoryRun, ruler: Person): Person[] {
  const open = (p: Person | undefined): p is Person =>
    p !== undefined && p.title !== 'ruler' && eligibleToMarry(run, p);
  const children = [...ruler.family.children]
    .sort((p, q) => p - q)
    .map((id) => livingPerson(run, id))
    .filter(open);
  if (ruler.dynastyId === undefined) return children;
  const house: Person[] = [];
  for (const id of run.notables.living) {
    const p = livingPerson(run, id);
    if (!open(p) || p.dynastyId !== ruler.dynastyId || p.civId !== ruler.civId) continue;
    if (!children.includes(p)) house.push(p);
  }
  return [...children, ...house.sort((p, q) => p.id - q.id)];
}

/** Yearly: the kin of two warring rulers may wed and end the war. */
function marriagePeace(run: HistoryRun): void {
  const rules = run.rules.diplomacy.marriagePeace;
  const alliance = run.rules.diplomacy.alliance;
  for (const war of run.wars) {
    if (war.ended !== undefined || war.civil || run.year - war.started < rules.minYears) continue;
    const [attacker, defender] = [liveCiv(run, war.attacker), liveCiv(run, war.defender)];
    if (!attacker || !defender) continue;
    const [rulerA, rulerB] = [rulerOf(run, attacker), rulerOf(run, defender)];
    if (!rulerA || !rulerB) continue;
    const theirs = marriageable(run, rulerB);
    let pair: [Person, Person] | undefined;
    for (const mine of marriageable(run, rulerA)) {
      const match = theirs.find(
        (q) => q.sex !== mine.sex && !closeKin(mine, q) && !sharesSpouseName(run, mine, q),
      );
      if (match) {
        pair = [mine, match];
        break;
      }
    }
    if (!pair) continue;
    const kin = cultureValue(run, attacker, 'kin') + cultureValue(run, defender, 'kin');
    if (!run.rng.diplomacy.chance(Math.min(1, (rules.chance * kin) / 10))) continue;
    const [bride, groom] = pair;
    wed(bride, groom);
    // The defender's child joins the attacker's household.
    groom.civId = attacker.id;
    groom.siteId = bride.siteId ?? null;
    const years = run.year - war.started;
    const event = run.emit({
      type: 'peace_by_marriage',
      place: capitalCell(run, attacker),
      actors: [bride.id, groom.id, rulerA.id, rulerB.id],
      causes: [war.lastEvent],
      data: {
        a: bride.name,
        b: groom.name,
        civ: attacker.name,
        enemy: defender.name,
        span: yearsPhrase(run, years),
        years,
        dead: war.dead,
      },
    });
    addDeed(bride, event.id);
    addDeed(groom, event.id);
    run.diplomacy.marriages.set(pairKey(attacker.id, defender.id), {
      year: run.year,
      event: event.id,
    });
    endWar(run, war, attacker, defender, event);
    const room =
      alliances(run, attacker).length < alliance.maxAllies &&
      alliances(run, defender).length < alliance.maxAllies &&
      !pactBetween(run, attacker.id, defender.id) &&
      attacker.overlord === undefined &&
      defender.overlord === undefined;
    if (room && run.rng.diplomacy.chance(rules.allianceChance)) {
      const why = run.rules.diplomacy.phrases.why.marriage
        .replace('{a}', bride.name)
        .replace('{b}', groom.name);
      swearAlliance(run, attacker, defender, why, [event.id]);
    }
  }
}

/** Yearly, after the wars (calls to arms run inside `runWar`): weddings that end wars, tribute and revolts; each decade betrayals, then new alliances. */
export function runAlliances(run: HistoryRun): void {
  breakWarring(run);
  marriagePeace(run);
  tribute(run);
  revolts(run);
  if (run.year % DECADE !== 0) return;
  betrayals(run);
  swearAlliances(run);
}
