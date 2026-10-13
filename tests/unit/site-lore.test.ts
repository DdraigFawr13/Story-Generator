import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  embark,
  generateWorld,
  loreProblems,
  refreshWork,
  sitePopulation,
  stepSite,
  type ActiveSite,
  type ContentBundle,
  type Id,
  type Item,
  type Site,
  type WorldState,
} from '../../src/engine';

const C = DEFAULT_CONTENT;
const SMALL = { ...C, site: { ...C.site, followCap: 30 } };

let shared: WorldState | undefined;
const base = () => (shared ??= generateWorld('SITE-A', { width: 64, height: 64 }, C));
const biggest = (world: WorldState): Site =>
  [...world.sites.values()]
    .filter((s) => s.ruinedYear === undefined && sitePopulation(s) > 0)
    .sort((a, b) => sitePopulation(b) - sitePopulation(a) || a.id - b.id)[0]!;

/** A site where no one has a spark or knows a cantrip, with one grown adult and one sparked child. */
function fresh(content: ContentBundle = SMALL) {
  const world = structuredClone(base());
  const active = embark(world, content, biggest(world).id);
  for (const id of active.residents) {
    const p = world.people.get(id)!;
    p.magic = { power: 0, affinities: {} };
    p.knownAbilities = [];
    delete p.awakening;
  }
  active.lore.hedgeWitch = null;
  const adults = active.residents
    .map((id) => world.people.get(id)!)
    .filter((p) => world.params.historyYears - p.born >= 20);
  const parent = adults[0]!;
  const child = adults[1]!;
  child.family.parents = [];
  // Ten years old: young enough for a teacher (apprentices only), old enough for lessons.
  child.born = world.params.historyYears - 10;
  child.attributes = { ...child.attributes, willpower: 14, intellect: 15 };
  child.magic = { power: 1, affinities: { fire: 2 } };
  return { world, active, content, parent, child };
}

const run = (world: WorldState, content: ContentBundle, days: number) => {
  for (let i = 0; i < days; i += 1) stepSite(world, content);
};

/** A school-of-fire book held by `holder`. */
function addBook(world: WorldState, active: ActiveSite, holder: Id): Item {
  const id = world.nextId.item;
  world.nextId.item += 1;
  const item: Item = {
    id,
    kind: 'book',
    name: 'the book of flame of Test',
    form: 'book of flame',
    made: 0,
    makerId: null,
    holder,
    deeds: [],
  };
  world.items.set(id, item);
  refreshWork(C, active);
  return item;
}

describe('lore', () => {
  it('validates the content', () => {
    expect(loreProblems(C)).toEqual([]);
    expect(loreProblems({ ...C, lore: { ...C.lore, cantrips: ['nope'] } })).toHaveLength(1);
  });

  it('teaches a cantrip only from a parent, the hedge-witch or a book', () => {
    const lonely = fresh();
    run(lonely.world, lonely.content, 40);
    expect(lonely.child.knownAbilities).toEqual([]);
    expect(lonely.child.detail!.lore?.learning).toBeUndefined();

    const taught = fresh();
    taught.parent.knownAbilities = ['kindle'];
    taught.parent.magic = { power: 1, affinities: { fire: 1 } };
    taught.child.family.parents = [taught.parent.id];
    run(taught.world, taught.content, 40);
    expect(taught.child.knownAbilities).toContain('kindle');
    const record = taught.child.detail!.lore!.learned.kindle!;
    expect(record.teacher).toBe(taught.parent.id);
    const event = taught.world.events.find((e) => e.id === record.eventId)!;
    expect(event.type).toBe(C.lore.events.learned);
    expect(event.actors).toEqual([taught.child.id, taught.parent.id]);
  });

  it('ends the lessons when the book is lost', () => {
    const kept = fresh();
    addBook(kept.world, kept.active, kept.child.id);
    run(kept.world, kept.content, 40);
    expect(kept.child.knownAbilities).toContain('kindle');

    const lost = fresh();
    const book = addBook(lost.world, lost.active, lost.child.id);
    run(lost.world, lost.content, 5);
    expect(lost.child.detail!.lore!.learning?.book).toBe(book.id);
    book.holder = null;
    refreshWork(lost.content, lost.active);
    run(lost.world, lost.content, 40);
    expect(lost.child.knownAbilities).toEqual([]);
    expect(lost.child.detail!.lore!.learning).toBeUndefined();
  });

  it('mends the mender\'s own worn home, one use a day', () => {
    const t = fresh();
    t.child.knownAbilities = ['mend'];
    t.child.magic = { power: 1, affinities: { earth: 1 } };
    const homeId = t.active.households.get(t.child.family.householdId!)!.home!;
    const home = t.active.buildings.get(homeId)!;
    home.condition = 50;
    run(t.world, t.content, 1);
    const lore = t.child.detail!.lore!;
    expect(lore.castTotal.mend).toBe(1);
    expect(t.active.lore.stats.mended).toBeCloseTo(C.lore.effects.mendPerUse);
    // The day's wear and the mending: half a day's wear made good.
    expect(home.condition).toBeGreaterThan(50 - 1 / C.steward.conditionLossDays);
  });

  it('wakes a person once, one tier at most', () => {
    const awake = {
      ...SMALL,
      awakenings: [
        { ...C.awakenings[0]!, afterDays: 0, monthlyChance: 1, maxFromTier: 'strong' as const },
      ],
    };
    const t = fresh(awake);
    t.child.magic = { power: 0, affinities: {} };
    addBook(t.world, t.active, t.child.id);
    run(t.world, awake, 40);
    expect(t.child.magic.power).toBe(1);
    expect(t.child.awakening?.id).toBe(awake.awakenings[0]!.id);
    expect(t.world.events.filter((e) => e.type === C.lore.events.awakened)).toHaveLength(1);
    expect(t.active.lore.stats.awakenings).toBe(1);
  });
});
