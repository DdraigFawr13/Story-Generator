import { isIndividualWorld, type WorldSnapshot } from '../sim/world';
import { activityLabel, ageLabel, residentAge, residentName } from './residents';
import { dateLabel } from './chronicle';
import type { RecapParagraph, RecapToken } from './recaps';
import type { ResidentActivity } from '../sim/living-state';

type Record = { eventId: number; tick: number; text: string };
const text = (text: string): RecapToken => ({ kind: 'text', text });
const source = (eventId: number, text: string): RecapToken => ({ kind: 'record', eventId, text });
function paragraph(tokens: RecapToken[]): RecapParagraph {
  return {
    tokens,
    sourceIds: [
      ...new Set(tokens.flatMap((token) => (token.kind === 'record' ? [token.eventId] : []))),
    ],
  };
}
const home = (id: number | null) => (id === null ? 'no assigned hut' : `hut #${id}`);

/** Actual household membership and records; neither shared names nor homes establish kinship. */
export function householdDossier(world: WorldSnapshot, id: number) {
  if (!isIndividualWorld(world)) return null;
  const household = world.world.households.find((item) => item.id === id);
  if (!household) return null;
  const members = world.world.residents.filter((person) => person.householdId === id);
  const memberIds = new Set(members.map((person) => person.id));
  const people = new Map(world.world.residents.map((person) => [person.id, person]));
  const living = members.filter((person) => person.deathEventId === null);
  const deceased = members.filter((person) => person.deathEventId !== null);
  const founders = members.filter((person) => person.birthEventId === null);
  const born = members.filter((person) => person.birthEventId !== null);
  const entry = world.events[household.creationEventId - 1]!;
  const homes = [
    ...new Set(living.flatMap((person) => (person.homeId === null ? [] : [person.homeId]))),
  ]
    .sort((a, b) => a - b)
    .map((id) => ({
      entity: world.world.entities[id - 1]!,
      members: living.filter((person) => person.homeId === id),
    }));
  const relations = members.flatMap((child) =>
    child.parentIds.map((id) => ({ parent: people.get(id)!, child })),
  );
  const records: Record[] = [];
  for (const event of world.events) {
    let summary = '';
    if (event.id === entry.id)
      summary = `${founders.length} founding members recorded; earlier kinship is unknown.`;
    else if (event.type === 'births') {
      const children = born.filter((person) => person.birthEventId === event.id);
      if (children.length)
        summary = `Birth recorded for ${children.map((person) => `${residentName(person)} (#${person.id})`).join(', ')}.`;
    } else if (event.type === 'deaths') {
      const lost = deceased.filter((person) => person.deathEventId === event.id);
      if (lost.length)
        summary = lost
          .map(
            (person) =>
              `${residentName(person)} (#${person.id}) died aged ${ageLabel(residentAge(world, person))}.`,
          )
          .join(' ');
    } else if (event.type === 'work_changed') {
      const rows = (event.facts.assignments as { id: number; after: ResidentActivity }[]).filter(
        (row) => memberIds.has(row.id),
      );
      if (rows.length)
        summary = rows
          .map(
            (row) =>
              `${residentName(people.get(row.id)!)} (#${row.id}): ${activityLabel(row.after)}${row.after.targetId === null ? '' : `; target #${row.after.targetId}`}.`,
          )
          .join(' ');
    } else if (event.type === 'home_changed') {
      const rows = (
        event.facts.assignments as {
          id: number;
          before: { homeId: number | null };
          after: { homeId: number | null };
        }[]
      ).filter((row) => memberIds.has(row.id));
      if (rows.length)
        summary = rows
          .map(
            (row) =>
              `${residentName(people.get(row.id)!)} (#${row.id}): home changed from ${home(row.before.homeId)} to ${home(row.after.homeId)}.`,
          )
          .join(' ');
    }
    if (summary) records.push({ eventId: event.id, tick: event.tick, text: summary });
  }
  const paragraphs = [
    paragraph([
      text(`The ${household.name} household enters these annals in `),
      source(entry.id, 'the founding record'),
      text(
        `, with ${founders.length} recorded members. Shared household names do not establish earlier kinship.`,
      ),
    ]),
  ];
  if (born.length) {
    const latest = born.at(-1)!;
    paragraphs.push(
      paragraph([
        text(
          `${born.length} ${born.length === 1 ? 'birth is' : 'births are'} recorded among these members. The latest is ${residentName(latest)}, entered in `,
        ),
        source(latest.birthEventId!, `the birth record at ${dateLabel(latest.entryTick)}`),
        text('.'),
      ]),
    );
  }
  if (deceased.length) {
    const latest = deceased.reduce((a, b) => (a.deathEventId! > b.deathEventId! ? a : b));
    const event = world.events[latest.deathEventId! - 1]!;
    paragraphs.push(
      paragraph([
        text(
          `${deceased.length} ${deceased.length === 1 ? 'member’s death is' : 'members’ deaths are'} retained in this history. The latest is ${residentName(latest)}, entered in `,
        ),
        source(event.id, `the death record at ${dateLabel(event.tick)}`),
        text('.'),
      ]),
    );
  }
  return {
    formatterVersion: 'household-historian-v1' as const,
    household,
    members,
    living,
    deceased,
    founders,
    born,
    entry,
    homes,
    relations,
    records,
    paragraphs,
  };
}
