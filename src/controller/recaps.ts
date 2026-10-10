import type { WorldSnapshot } from '../sim/world';
import { SEASONS, validateTick, WEEKS_PER_SEASON, WEEKS_PER_YEAR } from '../sim/clock';
import type { Immutable } from '../sim/immutable';
import type { SettlementEvent } from '../sim/state';

export type RecapKind = 'yearly' | 'seasonal';
export interface RecapPeriod {
  kind: RecapKind;
  endTick: number;
}
export interface RecapRequest extends RecapPeriod {
  revision: number;
}
export type RecapToken =
  { kind: 'text'; text: string } | { kind: 'record'; text: string; eventId: number };
export interface RecapParagraph {
  tokens: readonly RecapToken[];
  sourceIds: readonly number[];
}
export interface Recap {
  formatterVersion: 'historian-v1';
  period: RecapPeriod;
  title: string;
  startTick: number;
  endTick: number;
  paragraphs: readonly RecapParagraph[];
  sourceIds: readonly number[];
}
type Event = Immutable<SettlementEvent>;
type Sentence = RecapParagraph;
const words = (text: string): RecapToken => ({ kind: 'text', text });
const record = (text: string, event: Event): RecapToken => ({
  kind: 'record',
  text,
  eventId: event.id,
});
const unique = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b);

export function periodWeeks(kind: RecapKind): number {
  if (kind !== 'yearly' && kind !== 'seasonal') throw new Error('Unknown recap period.');
  return kind === 'yearly' ? WEEKS_PER_YEAR : WEEKS_PER_SEASON;
}
export function completedPeriods(tick: number, kind: RecapKind): number {
  validateTick(tick);
  return Math.floor(tick / periodWeeks(kind));
}
export function periodTitle(period: RecapPeriod): string {
  validateTick(period.endTick);
  const size = periodWeeks(period.kind);
  if (period.endTick === 0 || period.endTick % size !== 0)
    throw new Error('A recap requires a completed period.');
  const year = Math.floor((period.endTick - 1) / WEEKS_PER_YEAR) + 1;
  if (period.kind === 'yearly') return `Year ${year}`;
  const season = SEASONS[Math.floor((period.endTick - 1) / WEEKS_PER_SEASON) % 4]!;
  return `${season[0]!.toUpperCase()}${season.slice(1)} · Year ${year}`;
}
function firstAfter(events: readonly Event[], tick: number): number {
  let low = 0,
    high = events.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle]!.tick <= tick) low = middle + 1;
    else high = middle;
  }
  return low;
}
function numberFact(event: Event, key: string): number {
  const value = event.facts[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Record #${event.id} has no supported ${key} fact.`);
  return value;
}
function textFact(event: Event, key: string): string {
  const value = event.facts[key];
  if (typeof value !== 'string') throw new Error(`Record #${event.id} has no ${key} fact.`);
  return value;
}
function sum(events: readonly Event[], key: string): number {
  return events.reduce((total, event) => {
    const next = total + numberFact(event, key);
    if (!Number.isSafeInteger(next)) throw new Error('Recap total exceeds safe arithmetic.');
    return next;
  }, 0);
}
function sentence(tokens: RecapToken[], sources: readonly Event[]): Sentence {
  return { tokens, sourceIds: unique(sources.map((event) => event.id)) };
}
function paragraph(sentences: readonly Sentence[]): RecapParagraph {
  return {
    tokens: sentences.flatMap((entry, index) =>
      index ? [words(' '), ...entry.tokens] : [...entry.tokens],
    ),
    sourceIds: unique(sentences.flatMap((entry) => entry.sourceIds)),
  };
}
function buildingId(event: Event, world: WorldSnapshot): number {
  const id = event.entityIds.find((value) => value !== world.world.settlement.id);
  if (id === undefined) throw new Error('Historical building record has no building identity.');
  return id;
}
function buildingName(event: Event, world: WorldSnapshot): string {
  const kind = textFact(event, 'kind');
  if (!['hut', 'field', 'store'].includes(kind)) throw new Error('Unknown historical building.');
  return `${kind} #${buildingId(event, world)}`;
}

/** A presentation projection of admitted history; never advances or reconstructs the world. */
export function buildRecap(world: WorldSnapshot, period: RecapPeriod): Recap {
  const title = periodTitle(period);
  if (period.endTick > world.tick) throw new Error('That period has not finished yet.');
  const startTick = period.endTick - periodWeeks(period.kind) + 1;
  const events = world.events.slice(
    firstAfter(world.events, startTick - 1),
    firstAfter(world.events, period.endTick),
  );
  const ofType = (type: Event['type']) => events.filter((event) => event.type === type);
  const climate: Sentence[] = [],
    work: Sentence[] = [],
    reserves: Sentence[] = [],
    lives: Sentence[] = [];
  const harvests = ofType('harvest');
  for (const harvest of harvests) {
    const season = textFact(harvest, 'season');
    const weather = harvest.causes
      .map((id) => world.events[id - 1])
      .find((event) => event?.type === 'weather');
    const amount = numberFact(harvest, 'total');
    if (season === 'winter' && numberFact(harvest, 'seasonMultiplier') === 0) {
      climate.push(
        sentence(
          [
            words('Winter marked a change in the rhythm of the fields: '),
            record('the winter harvest record', harvest),
            words(' reports dormant crops and no crop food.'),
          ],
          [harvest],
        ),
      );
    } else {
      const tokens: RecapToken[] = [];
      if (weather) {
        const kind = textFact(weather, 'kind');
        const label = kind === 'normal' ? 'ordinary weather' : `${kind} weather`;
        tokens.push(words('Under '), record(label, weather), words(', '));
      } else tokens.push(words('In the fields, '));
      tokens.push(
        record(`the ${season} harvest`, harvest),
        words(` brought ${amount} food into the settlement’s accounts.`),
      );
      climate.push(sentence(tokens, weather ? [weather, harvest] : [harvest]));
    }
  }
  if (!harvests.length) {
    const weather = ofType('weather')[0];
    if (weather)
      climate.push(
        sentence(
          [
            words('The period opened with '),
            record(`${textFact(weather, 'kind')} weather`, weather),
            words('; no crop harvest was recorded within these weeks.'),
          ],
          [weather],
        ),
      );
  }

  const completed = ofType('construction_completed'),
    started = ofType('construction_started'),
    removed = ofType('building_removed');
  for (const event of completed.slice(0, 2)) {
    const contribution = harvests.find(
      (harvest) => harvest.causes.includes(event.id) && harvest.tick >= event.tick,
    );
    const fields = contribution?.facts.fields;
    const field = Array.isArray(fields)
      ? (fields.find((item: unknown) =>
          item && typeof item === 'object' && 'id' in item
            ? item.id === buildingId(event, world)
            : false,
        ) as { yield?: unknown } | undefined)
      : undefined;
    const tokens = [
      words('Work reached a milestone when '),
      record(buildingName(event, world), event),
      words(` was completed in week ${event.tick}.`),
    ];
    if (contribution && field && typeof field.yield === 'number' && field.yield > 0) {
      tokens.push(
        words(' At '),
        record('the following recorded harvest', contribution),
        words(`, that field contributed ${field.yield} food.`),
      );
    }
    work.push(sentence(tokens, contribution && field ? [event, contribution] : [event]));
  }
  if (completed.length > 2)
    work.push(
      sentence(
        [
          words(
            `Another ${completed.length - 2} construction ${completed.length === 3 ? 'project was' : 'projects were'} completed; `,
          ),
          record('their records', completed[2]!),
          words(' remain in the archive.'),
        ],
        completed.slice(2),
      ),
    );
  const unfinished = started.filter(
    (event) => !completed.some((done) => buildingId(done, world) === buildingId(event, world)),
  );
  if (unfinished.length)
    work.push(
      sentence(
        [
          words('New work also began on '),
          record(buildingName(unfinished[0]!, world), unfinished[0]!),
          words(
            unfinished.length > 1
              ? ` and ${unfinished.length - 1} other projects; their completion was not recorded during this period.`
              : '; its completion was not recorded during this period.',
          ),
        ],
        unfinished,
      ),
    );
  if (removed.length) {
    const event = removed.at(-1)!;
    const decay = event.causes
      .map((id) => world.events[id - 1])
      .find((cause) => cause?.type === 'building_decay');
    const tokens = [
      words(
        `The built landscape also lost ${removed.length} ${removed.length === 1 ? 'structure' : 'structures'}, including `,
      ),
      record(buildingName(event, world), event),
      words('.'),
    ];
    if (decay)
      tokens.push(
        words(' Its loss is linked in the archive to '),
        record('season-end decay', decay),
        words('.'),
      );
    work.push(sentence(tokens, decay ? [...removed, decay] : removed));
  }

  const transitions = events.filter((event) =>
    ['shortage_started', 'shortage_recovered', 'surplus_started', 'surplus_ended'].includes(
      event.type,
    ),
  );
  // Keep both the first turn and the final turns; intermediate records remain linked sources.
  const selected =
    transitions.length <= 3 ? transitions : [transitions[0]!, ...transitions.slice(-2)];
  for (const event of selected) {
    const phrases = {
      shortage_started: 'rations fell short of demand',
      shortage_recovered: 'full rations were restored',
      surplus_started: 'reserves reached twelve weeks of current demand',
      surplus_ended: 'reserves fell below twelve weeks of current demand',
    };
    reserves.push(
      sentence(
        [
          words(`In week ${event.tick}, `),
          record(phrases[event.type as keyof typeof phrases], event),
          words('.'),
        ],
        [event],
      ),
    );
  }
  if (transitions.length > selected.length)
    reserves.push(
      sentence(
        [words(`The archive records ${transitions.length} reserve and ration transitions in all.`)],
        transitions,
      ),
    );
  const overflow = ofType('food_overflow'),
    spoilage = ofType('food_spoilage');
  if (overflow.length)
    reserves.push(
      sentence(
        [
          words('Storage limits took their own toll: '),
          record(`${sum(overflow, 'amount')} food was lost beyond capacity`, overflow[0]!),
          words(' across this period.'),
        ],
        overflow,
      ),
    );
  if (spoilage.length)
    reserves.push(
      sentence(
        [
          words('The accounts also record '),
          record(`${sum(spoilage, 'amount')} stored food lost to spoilage`, spoilage[0]!),
          words('.'),
        ],
        spoilage,
      ),
    );

  const births = ofType('births'),
    deaths = ofType('deaths'),
    extinction = ofType('extinction')[0];
  if (births.length || deaths.length) {
    const tokens: RecapToken[] = [
      words('The population records give the period a human measure: '),
    ];
    if (births.length) {
      const count = sum(births, 'count');
      tokens.push(record(`${count} ${count === 1 ? 'birth' : 'births'}`, births[0]!));
    }
    if (births.length && deaths.length) tokens.push(words(' and '));
    if (deaths.length) {
      const count = sum(deaths, 'count');
      tokens.push(record(`${count} ${count === 1 ? 'death' : 'deaths'}`, deaths[0]!));
    }
    tokens.push(
      words(sum([...births, ...deaths], 'count') === 1 ? ' was recorded.' : ' were recorded.'),
    );
    lives.push(sentence(tokens, [...births, ...deaths]));
  }
  if (extinction)
    lives.push(
      sentence(
        [
          words('The settlement’s inhabited history reached its end in '),
          record(`week ${extinction.tick}`, extinction),
          words(', when no residents remained. Its earlier history is still here to be read.'),
        ],
        [extinction],
      ),
    );
  const groups =
    period.kind === 'yearly'
      ? [climate, work, reserves, lives]
      : [
          [...climate, ...work],
          [...reserves, ...lives],
        ];
  const paragraphs = groups.filter((group) => group.length).map(paragraph);
  if (!paragraphs.length)
    paragraphs.push({
      tokens: [
        words(
          events.length
            ? 'The archive records routine upkeep during this period, without a new harvest, building milestone, reserve transition, birth or death. The individual records remain available below.'
            : 'No new events were recorded during these weeks. The chronicle leaves this passage quiet; earlier periods remain available to explore.',
        ),
      ],
      sourceIds: events.map((event) => event.id),
    });
  return {
    formatterVersion: 'historian-v1',
    period: { ...period },
    title: `${world.world.settlement.name} · ${title}`,
    startTick,
    endTick: period.endTick,
    paragraphs,
    sourceIds: unique(paragraphs.flatMap((entry) => entry.sourceIds)),
  };
}
