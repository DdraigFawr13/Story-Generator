// Per-seed history numbers shared by drama (tables, baseline) and sweep.
// Trivial events may be pruned from world.events; each year_summary event carries data.n_<type>
// for the trivial ones, so a type's true count = kept important events + summed n_<type>.

/** Count events by type, adding back the trivial events that year_summary events stand for. */
export function countEvents(world, { rollupBelow, DAYS_PER_YEAR }) {
  const counts = {};
  for (const e of world.events) {
    if (e.type === 'year_summary') {
      for (const [key, value] of Object.entries(e.data ?? {})) {
        if (key.startsWith('n_') && typeof value === 'number') {
          const type = key.slice(2);
          counts[type] = (counts[type] ?? 0) + value;
        }
      }
      continue;
    }
    if (rollupBelow !== undefined && e.importance < rollupBelow) continue;
    // Settle's second sites are dated day 0; history founds from year 1 on.
    if (e.type === 'site_founded' && e.day < DAYS_PER_YEAR) continue;
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return counts;
}

const round1 = (v) => Math.round(v * 10) / 10;

/** Works raised per kind, read from the sites. */
function worksByKind(world) {
  const out = { wall: 0, bridge: 0, tower: 0, grove: 0 };
  for (const site of world.sites.values())
    for (const work of site.works ?? []) out[work.kind] = (out[work.kind] ?? 0) + 1;
  return out;
}

/** Feuds, exile and house splits, read from the events and their data. */
function feudMetrics(world, n) {
  const of = (type) => world.events.filter((e) => e.type === type);
  const ended = of('feud_ended');
  const returned = of('exile_returned');
  const struck = of('feud_struck');
  const kinds = (events, kind) => events.filter((e) => e.data.kind === kind).length;
  const generations = [...of('feud_inherited'), ...ended].map((e) =>
    Number(e.data.generation ?? 1),
  );
  return {
    begun: n.feud_began ?? 0,
    inherited: n.feud_inherited ?? 0,
    maxGeneration: Math.max(n.feud_began ? 1 : 0, ...generations),
    killings: (n.feud_began ?? 0) + struck.filter((e) => e.data.slain === 1).length,
    wed: kinds(ended, 'wed'),
    paid: kinds(ended, 'paid'),
    forgotten: kinds(ended, 'forgotten'),
    diedOut: kinds(ended, 'diedOut') + kinds(ended, 'beyond'),
    exiles: n.notable_exiled ?? 0,
    pardoned: kinds(returned, 'pardoned'),
    claim: kinds(returned, 'claim'),
    raid: kinds(returned, 'raid'),
    splits: n.house_split ?? 0,
    legendsSlain: struck.filter((e) => e.data.legend === 1 && e.data.slain === 1).length,
  };
}

/** Notables, families and items (M2.5): counts from the people, items and events. */
export function notableMetrics(world, n, DAYS_PER_YEAR) {
  let alive = 0;
  for (const person of world.people.values()) if (person.died === undefined) alive += 1;
  // Legends alive at once: each legend_risen event starts a span that ends when the person dies.
  const spans = [];
  for (const e of world.events) {
    if (e.type !== 'legend_risen') continue;
    const person = world.people.get(e.actors[0]);
    spans.push([Math.floor(e.day / DAYS_PER_YEAR), person?.died ?? Infinity]);
  }
  let legendsMax = 0;
  for (const [start] of spans) {
    legendsMax = Math.max(legendsMax, spans.filter(([s, end]) => s <= start && start < end).length);
  }
  const items = [...world.items.values()];
  const dragons = [...world.creatures.values()].filter((c) => c.dragon);
  return {
    notablesAlive: alive,
    notablesEver: world.people.size,
    dynasties: world.dynasties.size,
    successions: n.ruler_succeeded ?? 0,
    disputed: n.succession_disputed ?? 0,
    oaths: n.oath_sworn ?? 0,
    mages: n.mage_born ?? 0,
    legends: n.legend_risen ?? 0,
    legendsMax,
    artifacts: items.filter((i) => i.kind === 'artifact').length,
    books: items.filter((i) => i.kind === 'book').length,
    itemsLost: n.item_lost ?? 0,
    itemsStolen: n.item_stolen ?? 0,
    // Succession wars and dynasties.
    civilWars: n.civil_war_began ?? 0,
    thronesSeized: n.throne_seized ?? 0,
    revoltsCrushed: n.revolt_crushed ?? 0,
    realmSplits: n.realm_split ?? 0,
    dynastiesEnded: n.dynasty_ended ?? 0,
    citiesFreed: n.city_freed ?? 0,
    // Court intrigue: plots, seats seized, legends honoured, betraying, bribed and hunted.
    plotsStruck: n.plot_struck ?? 0,
    plotsFoiled: n.plot_foiled ?? 0,
    seatsSeized: n.seat_seized ?? 0,
    legendsHonoured: n.legend_honoured ?? 0,
    legendsBetrayed: n.legend_betrayed ?? 0,
    legendsBribed: n.legend_bribed ?? 0,
    bountiesSet: n.bounty_set ?? 0,
    legendsHunted: n.legend_hunted ?? 0,
    // Diplomacy: alliances sworn, calls answered or refused, betrayals, vassals and peace by marriage.
    alliancesSworn: n.alliance_sworn ?? 0,
    alliesAnswered: n.ally_answered ?? 0,
    callsRefused: n.call_refused ?? 0,
    alliancesBetrayed: n.alliance_betrayed ?? 0,
    vassalsSworn: n.vassal_sworn ?? 0,
    vassalRevolts: n.vassal_revolt ?? 0,
    vassalsFreed: n.vassal_freed ?? 0,
    peaceByMarriage: n.peace_by_marriage ?? 0,
    // Faiths: schisms, holy wars, prophets, conversions and wrongs done to holy places.
    faiths: world.faiths.size,
    schisms: n.faith_schism ?? 0,
    holyWars: n.holy_war_proclaimed ?? 0,
    prophets: n.prophet_rose ?? 0,
    conversions: n.site_converted ?? 0,
    rulersConverted: n.ruler_converted ?? 0,
    desecrations: (n.temple_desecrated ?? 0) + (n.holy_city_taken ?? 0),
    heresies: n.heresy_denounced ?? 0,
    faithsForgotten: n.faith_forgotten ?? 0,
    // Dragons as individuals (M5.6).
    dragons: dragons.length,
    dragonsSlain: dragons.filter((c) => c.slayerId !== undefined || c.slainBy).length,
    dragonTributes: n.dragon_tribute ?? 0,
    dragonQuests: n.dragon_quest ?? 0,
    dragonPacts: n.dragon_pact ?? 0,
    dragonBounties: n.dragon_bounty_set ?? 0,
    dragonCourted: n.dragon_courted ?? 0,
    dragonUnleashed: n.dragon_unleashed ?? 0,
    dragonBountyHunts: n.dragon_bounty_taken ?? 0,
    dragonBountyClaimed: n.dragon_bounty_claimed ?? 0,
    dragonBurned: n.dragon_burned ?? 0,
    // Perilous places, hoards and expeditions (M4.7).
    places: world.places.size,
    placesEmptied: [...world.places.values()].filter((p) => p.emptied !== undefined).length,
    barrows: n.barrow_raised ?? 0,
    expeditions: n.expedition_set_out ?? 0,
    expeditionTreasure: n.expedition_treasure ?? 0,
    expeditionLore: n.expedition_lore ?? 0,
    expeditionGlory: n.expedition_glory ?? 0,
    expeditionFailed: n.expedition_failed ?? 0,
    expeditionDeaths: [...world.people.values()].filter((p) => p.causeOfDeath === 'peril').length,
    // Heroes a commoner band made by bringing something home.
    commonersRose: world.events.filter(
      (e) =>
        (e.type === 'expedition_treasure' || e.type === 'expedition_lore') &&
        String(e.data.role ?? '') !== '',
    ).length,
    deadWoke: n.barrow_woke ?? 0,
    // Great works (tower, wall, bridge, warded grove) and enchanted items.
    worksRaised: n.great_work_raised ?? 0,
    worksFell: n.great_work_fell ?? 0,
    worksByKind: worksByKind(world),
    itemsEnchanted: n.item_enchanted ?? 0,
    greatItems: n.great_item_made ?? 0,
    partsCrafted: n.beast_parts_crafted ?? 0,
    carriedOff: n.item_carried_off ?? 0,
    feuds: feudMetrics(world, n),
  };
}

export function historyMetrics(
  world,
  { startPop, peakPop, historyMs, rollupBelow, DAYS_PER_YEAR, raceIds },
) {
  const n = countEvents(world, { rollupBelow, DAYS_PER_YEAR });
  const c = (type) => n[type] ?? 0;
  // Longest chain of causes: events are in id order and causes are older, so one pass works.
  const depth = new Map();
  let chain = 0;
  for (const e of world.events) {
    const d = 1 + Math.max(0, ...e.causes.map((id) => depth.get(id) ?? 0));
    depth.set(e.id, d);
    chain = Math.max(chain, d);
  }
  // Wars, famines and migrations should always have a cause; a kept one without is a gap.
  const uncaused = world.events.filter(
    (e) => ['war_declared', 'famine', 'migration'].includes(e.type) && e.causes.length === 0,
  ).length;
  let liveSites = 0;
  let ruinedSites = 0;
  let finalPop = 0;
  const raceTotals = {};
  for (const site of world.sites.values()) {
    if (site.ruinedYear === undefined) liveSites += 1;
    else ruinedSites += 1;
    for (const band of site.pop) {
      finalPop += band.count;
      raceTotals[band.raceId] = (raceTotals[band.raceId] ?? 0) + band.count;
    }
  }
  // The Phase 2 playtest oddity: a site that starved 3+ times in the last 25 years yet ends at its
  // peak (kept famine events only, matched by cell; a rolled-up famine has no place).
  const recentFamines = new Map();
  const since = (world.params.historyYears - 25) * DAYS_PER_YEAR;
  for (const e of world.events) {
    if (e.type !== 'famine' || e.day <= since) continue;
    recentFamines.set(e.place, (recentFamines.get(e.place) ?? 0) + 1);
  }
  let faminePeak = 0;
  for (const site of world.sites.values()) {
    if (site.ruinedYear !== undefined || (recentFamines.get(site.cell) ?? 0) < 3) continue;
    let pop = 0;
    for (const band of site.pop) pop += band.count;
    if (pop >= 0.97 * site.peakPop) faminePeak += 1;
  }
  const ids = raceIds ?? Object.keys(raceTotals).sort();
  const shares = ids.map((id) => (finalPop ? (100 * (raceTotals[id] ?? 0)) / finalPop : 0));
  const out = {
    civs: world.civs.size,
    civsFell: [...world.civs.values()].filter((civ) => civ.fell !== undefined).length,
    liveSites,
    ruinedSites,
    startPop,
    peakPop: Math.max(peakPop, finalPop),
    finalPop,
    famine: c('famine'),
    disease: c('plague') + c('fever') + c('pox'),
    plague: c('plague'),
    migration: c('migration'),
    faminePeak,
    siteFounded: c('site_founded'),
    wars: c('war_declared'),
    battles: c('battle'),
    conquered: c('site_conquered'),
    razed: c('site_razed'),
    epochs: c('dry_years_began') + c('cold_years_began'),
    ruinsAny: ruinedSites > 0 ? 1 : 0,
    chain,
    uncaused,
    events: world.events.length,
    ...notableMetrics(world, n, DAYS_PER_YEAR),
  };
  ids.forEach((id, i) => {
    out[`share_${id}`] = round1(shares[i]);
  });
  out.minShare = round1(shares.length ? Math.min(...shares) : 0);
  out.historyMs = historyMs;
  return out;
}

/** Round every metric to one decimal and drop timing, for the baseline file. */
export function baselineMetrics(metrics) {
  const out = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (key !== 'historyMs' && key !== 'feuds') out[key] = round1(value);
  }
  return out;
}
