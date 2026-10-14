// War (M2.4): grievance times opportunity over a threshold starts a war; each year the
// attacker campaigns against one linked site, a battle settles it on strength and luck, and
// a win conquers or razes the site. Strength is in soldier equivalents (R-24).

import type { Civ, Id, Person, Site } from '../core/types';
import { timberShort } from './goods';
import { cultureOf } from './state';
import {
  battleChampions,
  battleOutcome,
  canSpend,
  deedSoldiers,
  legendBreaks,
  legendFeuds,
  mageStrength,
  pickChampions,
  rollDuel,
  siteLost,
  startCaptains,
  warCaptain,
  type LegendPlay,
} from './notables';
import { civLosesSite, ruinSite } from './abandon';
import { allyAid, pactStrength } from './city-states';
import { decideCivilWar, splitRealm } from './civil-war';
import { bandCount, removePeople } from './pop';
import { cellDistance } from './settle';
import {
  atWar,
  causesOf,
  clearGrievance,
  grievanceEventsOf,
  isLive,
  liveSites,
  pairKey,
  type HistoryRun,
  type War,
} from './state';

function liveCiv(run: HistoryRun, id: Id): Civ | undefined {
  const civ = run.world.civs.get(id);
  return civ && civ.fell === undefined ? civ : undefined;
}

function civSites(run: HistoryRun, civ: Civ): Site[] {
  return liveSites(run).filter((s) => s.civId === civ.id);
}

function adultsOf(sites: readonly Site[]): number {
  return sites.reduce((n, s) => n + bandCount(s, 'adult'), 0);
}

/** Soldiers one adult of a race stands for. */
function soldierFactor(run: HistoryRun, raceId: string): number {
  const means = run.races.get(raceId)?.attributeMeans;
  if (!means) return 0;
  return (
    ((means.strength + means.agility + means.endurance) / run.rules.soldierBase) *
    run.rules.levyShare
  );
}

/** A civ's strength in soldier equivalents: adults by race, with the ore bonus. */
export function civStrength(run: HistoryRun, civ: Civ): number {
  let strength = 0;
  let adults = 0;
  let ore = 0;
  for (const site of civSites(run, civ)) {
    ore += site.goods.ore;
    adults += bandCount(site, 'adult');
    for (const band of site.pop) {
      if (band.band === 'adult') strength += band.count * soldierFactor(run, band.raceId);
    }
  }
  const armed = adults > 0 ? Math.min(1, ore / adults) : 0;
  return strength * (1 + run.rules.oreStrength * armed) + mageStrength(run, civ);
}

/** Linked site pairs between two civs: sites of `b` that touch a site of `a`. */
function reachable(run: HistoryRun, a: Civ, b: Civ): Site[] {
  const out: Site[] = [];
  for (const site of civSites(run, b)) {
    const touches = (run.links.get(site.id) ?? []).some((id) => {
      const other = run.world.sites.get(id);
      return other !== undefined && isLive(other) && other.civId === a.id;
    });
    if (touches) out.push(site);
  }
  return out;
}

/** Grievance times opportunity of `a` against `b`; 0 with no contact. */
function warScore(
  run: HistoryRun,
  a: Civ,
  b: Civ,
  strengths: Map<Id, number>,
  backed: Map<Id, number>,
): number {
  const { rules } = run;
  const grievance = a.grievances.get(b.id) ?? 0;
  if (grievance < 1 || grievanceEventsOf(run, a.id, b.id).length === 0) return 0;
  const touched = reachable(run, a, b);
  if (touched.length === 0) return 0;
  const strengthB = backed.get(b.id) ?? 0;
  const ratio =
    strengthB > 0
      ? Math.min(rules.maxStrengthRatio, (strengths.get(a.id) ?? 0) / strengthB)
      : rules.maxStrengthRatio;
  const gated = touched.every((s) => s.features.includes('pass') || s.features.includes('ford'));
  const warlike = (cultureOf(run, a)?.values.war ?? 0) / 10;
  return grievance * ratio * (gated ? rules.crossingPenalty : 1) * warlike;
}

function inWar(run: HistoryRun, civ: Civ): boolean {
  return run.wars.some(
    (w) => w.ended === undefined && (w.attacker === civ.id || w.defender === civ.id),
  );
}

/** Each civ not at war weighs its grievances; the best target at or over the threshold gets a war. */
function declareWars(run: HistoryRun): void {
  const { rules } = run;
  const civs = [...run.world.civs.values()].filter((c) => c.fell === undefined);
  const strengths = new Map<Id, number>();
  for (const civ of civs) strengths.set(civ.id, civStrength(run, civ));
  // A civ's allies count when others weigh a war against it.
  const backed = new Map<Id, number>();
  for (const civ of civs) {
    backed.set(
      civ.id,
      strengths.get(civ.id)! + pactStrength(run, civ, (c) => strengths.get(c.id) ?? 0),
    );
  }
  for (const a of civs) {
    if (inWar(run, a)) continue;
    let target: Civ | undefined;
    let best = rules.warThreshold;
    for (const b of civs) {
      if (b.id === a.id || atWar(run, a.id, b.id)) continue;
      if (run.year < (run.truce.get(pairKey(a.id, b.id)) ?? 0)) continue;
      const score = warScore(run, a, b, strengths, backed);
      if (score >= best) {
        best = score;
        target = b;
      }
    }
    if (!target) continue;
    const causes = grievanceEventsOf(run, a.id, target.id).slice(-3);
    const capital = run.world.sites.get(a.capital);
    const [attackerCaptain, defenderCaptain] = startCaptains(run, a, target);
    const event = run.emit({
      type: 'war_declared',
      place: capital?.cell ?? null,
      actors: [attackerCaptain, defenderCaptain].flatMap((p) => (p ? [p.id] : [])),
      causes,
      data: { civ: a.name, enemy: target.name, war: run.wars.length + 1 },
    });
    run.wars.push({
      id: run.wars.length + 1,
      attacker: a.id,
      defender: target.id,
      started: run.year,
      cause: event.id,
      lastEvent: event.id,
      dead: 0,
      attackerDead: 0,
      defenderDead: 0,
      attackerAdults: adultsOf(civSites(run, a)),
      defenderAdults: adultsOf(civSites(run, target)),
      attackerCaptain: attackerCaptain?.id,
      defenderCaptain: defenderCaptain?.id,
    });
  }
}

/** Defence multiplier of a site: its features, fortress kind, capital and a free city's walls. */
function siteDefence(run: HistoryRun, site: Site, defender: Civ): number {
  const table = run.rules.defence;
  let bonus = 1;
  // Without timber the walls and palisades are neglected: the fortress and heights bonus is halved.
  const worn = (multiplier: number) =>
    timberShort(run, site) ? 1 + (multiplier - 1) / 2 : multiplier;
  for (const feature of site.features) {
    bonus *= feature === 'heights' ? worn(table[feature] ?? 1) : (table[feature] ?? 1);
  }
  bonus *= worn(table[site.kind] ?? 1);
  if (defender.capital === site.id) bonus *= table.capital ?? 1;
  if (defender.free) bonus *= worn(table.freeCity ?? 1);
  return bonus;
}

/** Removes `n` adults from sites in proportion to their adults; returns how many died. */
function killAdults(sites: readonly Site[], n: number): number {
  const total = adultsOf(sites);
  const goal = Math.min(n, total);
  if (goal <= 0) return 0;
  let removed = 0;
  for (const site of sites) {
    const take = Math.min(
      bandCount(site, 'adult'),
      Math.floor((bandCount(site, 'adult') * goal) / total),
    );
    removed += removePeople(site, take, ['adult']);
  }
  // The remainder comes off the largest garrisons first.
  while (removed < goal) {
    const biggest = [...sites].sort(
      (p, q) => bandCount(q, 'adult') - bandCount(p, 'adult') || p.id - q.id,
    )[0];
    if (!biggest || bandCount(biggest, 'adult') === 0) break;
    removed += removePeople(biggest, 1, ['adult']);
  }
  return removed;
}

/** Soldier losses become dead adults: only `levyShare` of adults fight, and each stands for a few soldiers. */
function adultsLost(run: HistoryRun, soldiers: number, strength: number, adults: number): number {
  return strength > 0 ? Math.round((soldiers / strength) * adults * run.rules.levyShare) : 0;
}

function conquer(
  run: HistoryRun,
  war: War,
  site: Site,
  attacker: Civ,
  defender: Civ,
  battle: Id,
  lead: Person | undefined,
) {
  site.civId = attacker.id;
  run.territoryDirty = true;
  const event = run.emit({
    type: 'site_conquered',
    place: site.cell,
    causes: [battle],
    data: { site: site.name, civ: attacker.name, loser: defender.name },
  });
  war.lastEvent = event.id;
  const fell = civLosesSite(run, defender, site, event.id);
  siteLost(run, { site, attacker, defender, event: event.id, razed: false, lead });
  return fell;
}

function raze(
  run: HistoryRun,
  war: War,
  site: Site,
  attacker: Civ,
  defender: Civ,
  battle: Id,
  lead: Person | undefined,
) {
  const killed = ruinSite(run, site, run.rng.war);
  const event = run.emit({
    type: 'site_razed',
    place: site.cell,
    causes: [battle],
    data: { site: site.name, civ: attacker.name, loser: defender.name, dead: killed },
  });
  war.lastEvent = event.id;
  const fell = civLosesSite(run, defender, site, event.id);
  siteLost(run, { site, attacker, defender, event: event.id, razed: true, lead });
  return fell;
}

/**
 * The defender's live site linked to an attacker site and nearest to the attacker's capital; a
 * claimant marches on the throne city whenever a road reaches it.
 */
function pickTarget(run: HistoryRun, attacker: Civ, defender: Civ): Site | undefined {
  const capital = run.world.sites.get(attacker.capital);
  if (!capital) return undefined;
  const sites = reachable(run, attacker, defender);
  if (attacker.rebelOf === defender.id) {
    const throne = sites.find((s) => s.id === defender.capital);
    if (throne) return throne;
  }
  let best: Site | undefined;
  let bestDistance = Infinity;
  for (const site of sites) {
    const distance = cellDistance(run.cells.width, capital.cell, site.cell);
    if (distance < bestDistance) {
      best = site;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One year's campaign: a battle, then conquest or razing if the attacker won. `flipped` is set
 * when the war's defender marches this year (a civil war's stronger side).
 */
function campaign(run: HistoryRun, war: War, attacker: Civ, defender: Civ, flipped = false): void {
  const { rules, rng } = run;
  const target = pickTarget(run, attacker, defender);
  if (!target) return;
  const attackStrength = civStrength(run, attacker);
  const defendStrength =
    civStrength(run, defender) + allyAid(run, war, attacker, defender, (c) => civStrength(run, c));
  // Between kin, soldiers change sides on the field: luck swings a civil war's battles further.
  const swing = war.civil ? rules.battleLuck * run.rules.civilWar.luck : rules.battleLuck;
  const luck = () => 1 - swing + (2 * swing * rng.war.between(0, 1000)) / 1000;
  // A legend who has not spent their day of power this year fights in the open: their share of
  // the civ's strength leaves the ranks and they break soldiers instead (M5.5).
  const champions = pickChampions(run, attacker, defender, target);
  const acting = champions.map((c) => (c && canSpend(run, c) ? c : undefined));
  const share = (p: Person | undefined) => (p ? deedSoldiers(run, p) : 0);
  const army = Math.max(0, attackStrength - share(acting[0])) * rules.campaignShare;
  const defenders = Math.max(0, defendStrength - share(acting[1])) * rules.campaignShare;
  const walls = siteDefence(run, target, defender);
  let attackForce = army * luck();
  let defendForce = defenders * walls * luck();
  const unaided = attackForce > defendForce;
  const legends: LegendPlay = { broke: [0, 0], overmatched: [false, false], turned: false };
  // Two legends meet each other; one alone breaks what they can of the enemy host.
  if (acting[0] && acting[1]) legends.duel = rollDuel(run, acting[0], acting[1]);
  else if (acting[0] || acting[1]) {
    // What a legend breaks is force (walls and luck included); `broke` is counted in the
    // enemy's own soldiers, so it never passes the host they brought.
    const side = acting[0] ? 0 : 1;
    const breaks = legendBreaks(run, (acting[0] ?? acting[1])!);
    const force = side === 0 ? defendForce : attackForce;
    const soldiers = side === 0 ? defenders : army;
    const broken = Math.min(breaks, force);
    legends.overmatched[side] = force > breaks;
    legends.broke[side] = force > 0 ? Math.round((broken * soldiers) / force) : 0;
    if (side === 0) defendForce -= broken;
    else attackForce -= broken;
  }
  const attackerWins = attackForce > defendForce;
  legends.turned = attackerWins !== unaided;
  // Of the soldiers a legend breaks, `brokenDie` die and the rest run.
  const brokenDie = run.content.notables.deeds.brokenDie;
  const attackerLost = Math.min(
    army,
    army * (attackerWins ? rules.winnerLoss : rules.loserLoss) + legends.broke[1] * brokenDie,
  );
  const defenderLost = Math.min(
    defenders,
    defenders * (attackerWins ? rules.loserLoss : rules.winnerLoss) + legends.broke[0] * brokenDie,
  );
  const mine = civSites(run, attacker);
  const theirs = civSites(run, defender);
  const attackerKilled = killAdults(
    mine,
    adultsLost(run, attackerLost, attackStrength, adultsOf(mine)),
  );
  const wanted = adultsLost(run, defenderLost, defendStrength, adultsOf(theirs));
  let defenderKilled = removePeople(target, Math.min(wanted, bandCount(target, 'adult')), [
    'adult',
  ]);
  defenderKilled += killAdults(
    theirs.filter((s) => s.id !== target.id),
    wanted - defenderKilled,
  );
  war.attackerDead += flipped ? defenderKilled : attackerKilled;
  war.defenderDead += flipped ? attackerKilled : defenderKilled;
  war.dead += attackerKilled + defenderKilled;
  const attackerLead = warCaptain(run, war, flipped ? 'defender' : 'attacker', attacker);
  const defenderLead = warCaptain(run, war, flipped ? 'attacker' : 'defender', defender);
  const battle = run.emit({
    type: 'battle',
    place: target.cell,
    actors: [attackerLead, defenderLead].flatMap((p) => (p ? [p.id] : [])),
    causes: causesOf(war.lastEvent),
    data: {
      war: war.id,
      civ: attacker.name,
      enemy: defender.name,
      site: target.name,
      winner: attackerWins ? attacker.name : defender.name,
      attackerLost: Math.round(attackerLost),
      defenderLost: Math.round(defenderLost),
      lost: Math.round(attackerLost + defenderLost),
      // What the battle was settled on, for its play-by-play: soldiers each side brought (allies'
      // included), the defence factor of the ground and walls (x100), and the forces after luck.
      army: Math.round(army),
      defenders: Math.round(defenders),
      walls: Math.round(walls * 100),
      attackForce: Math.round(attackForce),
      defendForce: Math.round(defendForce),
      attackerBroke: legends.broke[0],
      defenderBroke: legends.broke[1],
      // The captains by name: in a civil war a claimant can change realms after the battle.
      attackerLead: attackerLead?.name ?? '',
      defenderLead: defenderLead?.name ?? '',
      ...(war.civil ? { civil: 1 } : {}),
    },
  });
  war.lastEvent = battle.id;
  const lead = battleOutcome(run, attackerLead, defenderLead, attackerWins, battle.id, target);
  battleChampions(run, {
    attacker,
    defender,
    attackerWins,
    site: target,
    battle: battle.id,
    war,
    leads: [attackerLead, defenderLead],
    champions,
    legends,
  });
  if (!attackerWins) return;
  // Kin do not burn their own towns. A civil war ends when the claimant takes the throne city or
  // the claimant's last town falls; a lost seat short of that moves to the next town.
  if (war.civil) {
    const decisive =
      target.id === defender.capital &&
      (defender.rebelOf === undefined || civSites(run, defender).length === 1);
    if (decisive) decideCivilWar(run, war, attacker, defender, battle.id);
    else conquer(run, war, target, attacker, defender, battle.id, lead);
    return;
  }
  const differ = run.races.get(attacker.raceId) !== run.races.get(defender.raceId);
  const razeChance = Math.min(1, rules.razeChance * (differ ? 2 : 1));
  if (rng.war.chance(razeChance)) raze(run, war, target, attacker, defender, battle.id, lead);
  else conquer(run, war, target, attacker, defender, battle.id, lead);
}

function endWar(run: HistoryRun, war: War, attacker: Civ | undefined, defender: Civ | undefined) {
  war.ended = run.year;
  const fell = attacker === undefined || defender === undefined;
  if (!fell && war.civil) splitRealm(run, war, attacker, defender);
  else if (!fell) {
    run.emit({
      type: 'peace_made',
      place: run.world.sites.get(attacker.capital)?.cell ?? null,
      causes: [war.lastEvent],
      data: {
        war: war.id,
        civ: attacker.name,
        enemy: defender.name,
        dead: war.dead,
        years: run.year - war.started,
      },
    });
    run.truce.set(pairKey(war.attacker, war.defender), run.year + run.rules.peaceYears);
  }
  clearGrievance(run, war.attacker, war.defender);
}

/** Wars run a campaign, and end when a side has fallen, grown weary or the war is old. */
function fightWars(run: HistoryRun): void {
  const { rules } = run;
  for (const war of run.wars) {
    if (war.ended !== undefined) continue;
    const attacker = liveCiv(run, war.attacker);
    const defender = liveCiv(run, war.defender);
    // A claimant marches first; after that the stronger half of a civil war marches each year.
    if (attacker && defender) {
      const first = war.civil && run.year === war.started + 1;
      if (war.civil && !first && civStrength(run, defender) > civStrength(run, attacker)) {
        campaign(run, war, defender, attacker, true);
      } else campaign(run, war, attacker, defender);
    }
    const a = liveCiv(run, war.attacker);
    const d = liveCiv(run, war.defender);
    const weary =
      war.attackerDead > rules.wearyShare * war.attackerAdults ||
      war.defenderDead > rules.wearyShare * war.defenderAdults;
    // A ruler who cannot end a civil war in a few years has to live with a split realm.
    const most = war.civil ? run.rules.civilWar.maxYears : rules.maxWarYears;
    if (!a || !d || weary || run.year - war.started >= most) endWar(run, war, a, d);
  }
}

/** Yearly: declare wars, fight the ones under way, then legends of quarrelling peoples may duel. */
export function runWar(run: HistoryRun): void {
  declareWars(run);
  fightWars(run);
  legendFeuds(run);
}
