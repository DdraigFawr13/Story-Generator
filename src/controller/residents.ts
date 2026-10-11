import { worldResidentAgeWeeks } from '../sim/resident-world';
import { isIndividualWorld, type WorldSnapshot } from '../sim/world';
import type { Immutable } from '../sim/immutable';
import type { LivingResident, ResidentActivity } from '../sim/living-state';
import type { SettlementEvent } from '../sim/state';
import { dateLabel } from './chronicle';
import type { RecapParagraph, RecapToken } from './recaps';

type Person = Immutable<LivingResident>;
type Event = Immutable<SettlementEvent>;
export const residentName = (person: Person) => `${person.givenName} ${person.householdName}`;
export function ageLabel(weeks: number): string {
  const years = Math.floor(weeks / 48),
    remainder = weeks % 48;
  return `${years} ${years === 1 ? 'year' : 'years'}${remainder ? ` and ${remainder} ${remainder === 1 ? 'week' : 'weeks'}` : ''}`;
}
export function residentAge(world: WorldSnapshot, person: Person) {
  const tick =
    person.deathEventId === null ? world.tick : world.events[person.deathEventId - 1]!.tick;
  return worldResidentAgeWeeks(person, tick);
}
export function activityLabel(value: Immutable<ResidentActivity> | null) {
  if (!value) return 'No weekly assignment yet';
  const labels: Record<ResidentActivity['role'], string> = {
    fieldwork: 'Fieldwork',
    foraging: 'Foraging',
    repairing: 'Repairs',
    building: 'Building',
    gathering: 'Timber gathering',
    caretaking: 'Care work',
    resting: 'Resting',
  };
  return labels[value.role];
}
function homeLabel(homeId: number | null) {
  return homeId === null ? 'no assigned hut' : `hut #${homeId}`;
}
const words = (text: string): RecapToken => ({ kind: 'text', text });
const record = (eventId: number, text: string): RecapToken => ({ kind: 'record', eventId, text });
const paragraph = (tokens: RecapToken[]): RecapParagraph => ({
  tokens,
  sourceIds: [
    ...new Set(tokens.flatMap((token) => (token.kind === 'record' ? [token.eventId] : []))),
  ],
});
export interface PersonalRecord {
  eventId: number;
  tick: number;
  text: string;
}

/** A factual read-only projection. Shared names never establish unrecorded kinship. */
export function residentDossier(world: WorldSnapshot, id: number) {
  if (!isIndividualWorld(world)) return null;
  const person = world.world.residents.find((resident) => resident.id === id);
  if (!person) return null;
  const people = new Map(world.world.residents.map((resident) => [resident.id, resident]));
  const parents = person.parentIds.map((parentId) => people.get(parentId)!);
  const children = world.world.residents.filter((resident) => resident.parentIds.includes(id));
  const household = world.world.households.find(
    (household) => household.id === person.householdId,
  )!;
  const members = world.world.residents.filter((resident) => resident.householdId === household.id);
  const entry = world.events[person.creationEventId - 1]!;
  const death = person.deathEventId === null ? null : world.events[person.deathEventId - 1]!;
  const ageWeeks = residentAge(world, person);
  const life = world.config.residents.life;
  const stage =
    ageWeeks < life.adultAgeWeeks ? 'Child' : ageWeeks < life.seniorAgeWeeks ? 'Adult' : 'Senior';
  const relatedDeaths = new Map<number, { person: Person; relation: string }[]>();
  for (const [relations, relation] of [
    [parents, 'parent'],
    [children, 'child'],
  ] as const) {
    for (const related of relations) {
      if (related.deathEventId === null) continue;
      const entries = relatedDeaths.get(related.deathEventId) ?? [];
      entries.push({ person: related, relation });
      relatedDeaths.set(related.deathEventId, entries);
    }
  }
  const records: PersonalRecord[] = [];
  let latestWork: Event | null = null,
    latestHome: Event | null = null,
    latestRelationDeath: Event | null = null;
  for (const event of world.events) {
    if (!event.entityIds.includes(id) && !relatedDeaths.has(event.id)) continue;
    if (relatedDeaths.has(event.id)) latestRelationDeath = event;
    let text = '';
    if (event.id === person.creationEventId) {
      text =
        person.birthEventId === null
          ? `Recorded at founding, aged ${ageLabel(person.ageWeeksAtEntry)}.`
          : `Birth recorded; known parent: ${residentName(parents[0]!)} (#${parents[0]!.id}).`;
    } else if (event.type === 'births') {
      const born = children.filter((child) => child.birthEventId === event.id);
      if (born.length)
        text = `Birth recorded for ${born.map((child) => `${residentName(child)} (#${child.id})`).join(', ')}.`;
    } else if (event.type === 'deaths') {
      text = [
        ...(event.id === person.deathEventId
          ? [`Died aged ${ageLabel(ageWeeks)}, with recorded health ${person.health}/100.`]
          : []),
        ...(relatedDeaths.get(event.id) ?? []).map(
          (related) =>
            `Death recorded for known ${related.relation} ${residentName(related.person)} (#${related.person.id}).`,
        ),
      ].join(' ');
    } else if (event.type === 'work_changed') {
      const row = (event.facts.assignments as { id: number; after: ResidentActivity }[]).find(
        (row) => row.id === id,
      );
      if (row) {
        latestWork = event;
        text = `Weekly assignment: ${activityLabel(row.after)}${row.after.targetId === null ? '' : `; target #${row.after.targetId}`}.`;
      }
    } else if (event.type === 'home_changed') {
      const row = (
        event.facts.assignments as {
          id: number;
          before: { homeId: number | null };
          after: { homeId: number | null };
        }[]
      ).find((row) => row.id === id);
      if (row) {
        latestHome = event;
        text = `Home changed from ${homeLabel(row.before.homeId)} to ${homeLabel(row.after.homeId)}.`;
      }
    }
    if (text) records.push({ eventId: event.id, tick: event.tick, text });
  }
  const paragraphs: RecapParagraph[] = [];
  paragraphs.push(
    person.birthEventId === null
      ? paragraph([
          words(
            `${residentName(person)} enters these annals among the founding residents, aged ${ageLabel(person.ageWeeksAtEntry)}. `,
          ),
          record(entry.id, 'The founding record'),
          words(' begins this known history; birth, parentage and earlier life are unrecorded.'),
        ])
      : paragraph([
          words(`The annals first record ${residentName(person)} in `),
          record(entry.id, `the birth record at ${dateLabel(entry.tick)}`),
          words(
            `. ${residentName(parents[0]!)} is the one recorded parent; further parentage is unknown.`,
          ),
        ]),
  );
  if (children.length) {
    const child = children.at(-1)!;
    paragraphs.push(
      paragraph([
        words(
          `${children.length} ${children.length === 1 ? 'known child appears' : 'known children appear'} in this history. The latest is ${residentName(child)}, entered in `,
        ),
        record(child.birthEventId!, `the birth record at ${dateLabel(child.entryTick)}`),
        words('.'),
      ]),
    );
  }
  if (latestWork || latestHome) {
    const tokens: RecapToken[] = [];
    if (latestWork)
      tokens.push(
        words('The latest assignment change is in '),
        record(latestWork.id, `the work record at ${dateLabel(latestWork.tick)}`),
        words(
          `: ${activityLabel(person.activity).toLowerCase()}. Weekly assignments do not establish a permanent profession.`,
        ),
      );
    if (latestHome)
      tokens.push(
        words(`${tokens.length ? ' ' : ''}The last recorded move is in `),
        record(latestHome.id, `the home record at ${dateLabel(latestHome.tick)}`),
        words(`, assigning ${homeLabel(person.homeId)}.`),
      );
    paragraphs.push(paragraph(tokens));
  }
  const relationAfterLife =
    !!death && !!latestRelationDeath && latestRelationDeath.tick > death.tick;
  const sameDeathRecord = !!latestRelationDeath && latestRelationDeath.id === death?.id;
  const relationParagraph = latestRelationDeath
    ? paragraph([
        words(
          relationAfterLife
            ? `After ${residentName(person)}'s death, `
            : sameDeathRecord
              ? 'The same '
              : 'The latest death among recorded parents and children appears in ',
        ),
        record(
          latestRelationDeath.id,
          `${sameDeathRecord ? '' : 'the '}death record at ${dateLabel(latestRelationDeath.tick)}`,
        ),
        words(
          `${sameDeathRecord ? ' also records ' : relationAfterLife ? ' records ' : ': '}${relatedDeaths
            .get(latestRelationDeath.id)!
            .map(
              (related) =>
                `known ${related.relation} ${residentName(related.person)} (#${related.person.id})`,
            )
            .join(', ')}.`,
        ),
      ])
    : null;
  if (relationParagraph && (!death || latestRelationDeath!.tick < death.tick))
    paragraphs.push(relationParagraph);
  if (death)
    paragraphs.push(
      paragraph([
        words('This recorded life ends in '),
        record(death.id, `the death record at ${dateLabel(death.tick)}`),
        words(
          `, aged ${ageLabel(ageWeeks)}. The entry preserves health and the modeled risk inputs.`,
        ),
      ]),
    );
  if (relationParagraph && death && latestRelationDeath!.tick >= death.tick)
    paragraphs.push(relationParagraph);
  const deathHealth = death
    ? (
        death.facts.residents as {
          id: number;
          before: number;
          after: number;
          homeId: number | null;
          ration: boolean;
          caregiverId: number | null;
          threshold: number;
          draw: number;
        }[]
      ).find((row) => row.id === id)!
    : null;
  const lastHealth =
    deathHealth ?? world.lastTick?.people.health.find((row) => row.id === id) ?? null;
  return {
    formatterVersion: 'resident-historian-v2' as const,
    person,
    ageWeeks,
    stage,
    entry,
    death,
    parents,
    children,
    household,
    members,
    paragraphs,
    records,
    home: person.homeId === null ? null : world.world.entities[person.homeId - 1]!,
    target: person.activity?.targetId ? world.world.entities[person.activity.targetId - 1]! : null,
    lastHealth,
    deathHealth,
    healthTick: lastHealth ? (death?.tick ?? world.tick) : null,
  };
}

export { isIndividualWorld } from '../sim/world';
export type { LivingSettlementSnapshot } from '../sim/living-state';
