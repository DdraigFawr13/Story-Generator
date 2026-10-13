// Play-by-play (Legends): three to six calm lines for an epic battle or beast fight, built only
// from the numbers and names the event and its linked events carry. Older worlds that lack the
// numbers get none.

import type { ContentBundle } from '../core/content-types';
import { hashString } from '../core/rng';
import type { SimEvent, WorldState } from '../core/types';
import type { LegendIndex } from './biography';
import { fillTemplate, grouped } from './render';

type Vars = Record<string, string | number>;
type PlayContent = Pick<ContentBundle, 'playByPlay'>;

const num = (event: SimEvent, key: string): number | undefined => {
  const value = event.data[key];
  return typeof value === 'number' ? value : undefined;
};
const text = (event: SimEvent, key: string): string => {
  const value = event.data[key];
  return typeof value === 'string' ? value : '';
};

/** The beats of an epic battle or beast fight, or [] when it is below the bar or not a fight. */
export function playByPlay(
  world: WorldState,
  content: PlayContent,
  index: LegendIndex,
  event: SimEvent,
): string[] {
  const rules = content.playByPlay;
  if (!rules) return [];
  const effects = index.effects(event.id).flatMap((id) => index.event(id) ?? []);
  const say = (beat: string, vars: Vars): string => {
    const variants = rules.beats[beat];
    if (!variants || variants.length === 0) throw new Error(`Play-by-play beat "${beat}" missing`);
    const template = variants[hashString(`${event.id}${beat}`) % variants.length]!;
    return fillTemplate(template, vars);
  };
  if (event.type === 'battle') return battle(world, rules, index, event, effects, say);
  if (
    event.type === 'beast_slain' ||
    event.type === 'beast_fought' ||
    event.type === 'beast_hunt_failed'
  )
    return beastFight(rules, event, effects, say);
  return [];
}

type Say = (beat: string, vars: Vars) => string;
const nums = (vars: Record<string, number>): Vars =>
  Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, grouped(v)]));

function battle(
  world: WorldState,
  rules: PlayContent['playByPlay'],
  index: LegendIndex,
  event: SimEvent,
  effects: SimEvent[],
  say: Say,
): string[] {
  const army = num(event, 'army');
  const defenders = num(event, 'defenders');
  const walls = num(event, 'walls');
  const attackForce = num(event, 'attackForce');
  const defendForce = num(event, 'defendForce');
  const attackerLost = num(event, 'attackerLost');
  const defenderLost = num(event, 'defenderLost');
  const lost = num(event, 'lost');
  if (
    army === undefined ||
    defenders === undefined ||
    walls === undefined ||
    attackForce === undefined ||
    defendForce === undefined ||
    attackerLost === undefined ||
    defenderLost === undefined ||
    lost === undefined
  )
    return [];
  const champions = effects.filter((e) => e.type === 'champion_fought');
  // Deaths caused by the battle or by one of its champions' fights.
  const reached = new Set([event.id, ...champions.map((c) => c.id)]);
  const deaths = [
    ...effects,
    ...champions.flatMap((c) => index.effects(c.id).flatMap((id) => index.event(id) ?? [])),
  ].filter((e) => e.type === 'notable_died' && e.causes.some((c) => reached.has(c)));
  if (lost < rules.battleLostAtLeast && champions.length === 0 && deaths.length === 0) return [];

  const civ = text(event, 'civ');
  const enemy = text(event, 'enemy');
  const site = text(event, 'site');
  const winner = text(event, 'winner');
  const base: Vars = { civ, enemy, site, winner };
  const beats: Record<string, string | undefined> = {};
  const muster = say('muster', { ...base, ...nums({ army, defenders }) });
  const ground = walls >= rules.wallsAtLeast ? say('ground', base) : undefined;

  // Which captain led which side, by the civ each belongs to.
  const civByName = new Map([...world.civs.values()].map((c) => [c.name, c.id]));
  const leadOf = (civName: string): string | undefined => {
    const civId = civByName.get(civName);
    for (const actor of event.actors) {
      const person = world.people.get(actor);
      if (person && civId !== undefined && person.civId === civId) return person.name;
    }
    return undefined;
  };
  const attackerLead = leadOf(civ);
  const defenderLead = leadOf(enemy);
  let leaders: string | undefined;
  if (attackerLead && defenderLead)
    leaders = say('leadersBoth', { ...base, attackerLead, defenderLead });
  else if (attackerLead) leaders = say('leadersOne', { lead: attackerLead, side: civ });
  else if (defenderLead) leaders = say('leadersOne', { lead: defenderLead, side: enemy });

  const championLines = champions.map((c) =>
    say('champion', {
      name: text(c, 'name'),
      stand: text(c, 'stand'),
      outcome: text(c, 'outcome'),
    }),
  );

  const attackerWon = winner === civ;
  const effectiveDefence = (defenders * walls) / 100;
  const fewer = attackerWon ? army < effectiveDefence : effectiveDefence < army;
  const gap = Math.abs(attackForce - defendForce);
  const biggest = Math.max(attackForce, defendForce);
  const even = gap * 100 <= biggest * rules.evenWithinPercent;
  beats.turn = say(fewer ? 'turnUpset' : even ? 'turnEven' : 'turnWeight', base);

  const championNames = new Set(champions.map((c) => text(c, 'name')));
  const names = [...new Set(deaths.map((d) => text(d, 'name')))].filter(
    (n) => n !== '' && !championNames.has(n),
  );
  const ending = [
    say('ending', {
      ...base,
      ...nums({ attackerLost, defenderLost }),
    }),
  ];
  if (names.length > 0) ending.push(say('endingNamed', { names: joinNames(names) }));
  const taken = effects.find((e) => e.type === 'site_conquered');
  const razed = effects.find((e) => e.type === 'site_razed');
  if (razed) ending.push(say('endingRazed', { site, civ: text(razed, 'civ') }));
  else if (taken) ending.push(say('endingTaken', { site, civ: text(taken, 'civ') }));

  // Drop Ground, then Leaders, to fit the cap; then trim champions.
  let lines = [muster, ground, leaders, ...championLines, beats.turn, ending.join(' ')].flatMap(
    (l) => (l ? [l] : []),
  );
  const drop = (line: string | undefined) => {
    if (lines.length > rules.maxBeats && line) lines = lines.filter((l) => l !== line);
  };
  drop(ground);
  drop(leaders);
  while (lines.length > rules.maxBeats) lines.splice(lines.indexOf(beats.turn!) - 1, 1);
  return lines;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function beastFight(
  rules: PlayContent['playByPlay'],
  event: SimEvent,
  effects: SimEvent[],
  say: Say,
): string[] {
  const fighters = num(event, 'fighters');
  const danger = num(event, 'danger');
  const odds = num(event, 'odds');
  if (fighters === undefined || danger === undefined || odds === undefined) return [];
  const slain = event.type === 'beast_slain';
  // Only a death the beast dealt: other deaths may hang off the same event.
  const died = effects.some((e) => e.type === 'notable_died' && e.data.beast === event.data.beast);
  if (danger < rules.beastDangerAtLeast && !died) return [];

  const name = slain ? text(event, 'hero') : text(event, 'name');
  const beast = text(event, 'beast');
  const kind = text(event, 'kind');
  // "the wyvern of Blaenurn" needs no ", a wyvern" after it.
  const named = beast.toLowerCase().includes(kind.toLowerCase());
  const vars: Vars = {
    name,
    beastKindMid: named ? beast : `${beast}, a ${kind},`,
    beastKindEnd: named ? beast : `${beast}, a ${kind}`,
    beast: text(event, 'beast'),
    kind: text(event, 'kind'),
    site: text(event, 'site'),
    civ: text(event, 'civ'),
    outcome: text(event, 'outcome'),
    fighters: grouped(fighters),
    odds,
  };
  // A lone legend hunts; a raided town's fight is led by the figure who rode out.
  const hunt = event.type === 'beast_hunt_failed' || event.data.hunt === 1;
  const oddsBeat =
    odds < rules.longOdds ? 'oddsLong' : odds > rules.favouredOdds ? 'oddsFavoured' : 'oddsEven';
  return [
    say(hunt ? 'approachHunt' : 'approachTown', vars),
    say(oddsBeat, vars),
    say(slain ? 'clashSlain' : 'clashLost', vars),
    say(slain ? 'afterSlain' : died ? 'afterDied' : 'afterLived', vars),
  ];
}
