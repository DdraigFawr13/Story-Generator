import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  embark,
  generateWorld,
  loreProblems,
  refreshWork,
  sitePopulation,
  stepSite,
  voiceOf,
  type ActiveSite,
  type ContentBundle,
  type Id,
  type Item,
  type Site,
  type WorldState,
} from '../../src/engine';
import { cached, findWorld } from './helpers/find-world';

const C = DEFAULT_CONTENT;
const SMALL = { ...C, site: { ...C.site, followCap: 30 } };

// Most cases share the first world; the waking case searches the list for a site where one person wakes.
const SEEDS = ['SITE-C', 'SITE-A', 'SITE-B', 'SITE-D', 'SITE-E', 'SITE-F', 'SITE-G', 'SITE-H'];
const make = (seed: string) => generateWorld(seed, { width: 64, height: 64 }, C);
const base = () => cached('lore', SEEDS[0]!, make);
const biggest = (world: WorldState): Site =>
  [...world.sites.values()]
    .filter((s) => s.ruinedYear === undefined && sitePopulation(s) > 0)
    .sort((a, b) => sitePopulation(b) - sitePopulation(a) || a.id - b.id)[0]!;

/** A site where no one has a spark or knows a cantrip, with one grown adult and one sparked child. */
function fresh(content: ContentBundle = SMALL, source: WorldState = base()) {
  const world = structuredClone(source);
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

  it('lends a book for its story, not because of its last return', () => {
    // A book lent and returned week after week made the drama report's longest cause chain.
    const { world, active, content, parent, child } = fresh();
    // The only book in town is the parent's: a book another resident brought from history would
    // be lent to the child first.
    for (const item of world.items.values())
      if (item.kind === 'book' && active.residents.includes(item.holder ?? -1)) item.holder = null;
    const book = addBook(world, active, parent.id);
    const { emit, label } = voiceOf(world, content, active);
    const before = emit({ type: C.lore.events.lost, place: label.cell, data: {} });
    const back = emit({ type: C.lore.events.returned, place: label.cell, data: {} });
    book.deeds.push(before.id, back.id);
    run(world, content, 14);
    // This book's loan: another resident may hold a book of their own from history.
    const lent = world.events.find(
      (e) => e.type === C.lore.events.lent && e.data.item === book.name,
    );
    expect(lent?.actors).toEqual([parent.id, child.id]);
    expect(lent!.causes).toEqual([before.id]);
  });

  it("mends the mender's own worn home, one use a day", () => {
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
    const wake = (source: WorldState) => {
      const t = fresh(awake, source);
      t.child.magic = { power: 0, affinities: {} };
      addBook(t.world, t.active, t.child.id);
      run(t.world, awake, 40);
      return t;
    };
    // Other readers of the book would wake too, so search for a site where only the holder does.
    const { world } = findWorld(
      'a site where the book wakes one reader',
      'lore',
      SEEDS,
      make,
      (w) => wake(w).active.lore.stats.awakenings === 1,
    );
    const t = wake(world);
    expect(t.child.magic.power).toBe(1);
    expect(t.child.awakening?.id).toBe(awake.awakenings[0]!.id);
    expect(t.world.events.filter((e) => e.type === C.lore.events.awakened)).toHaveLength(1);
    expect(t.active.lore.stats.awakenings).toBe(1);
  });

  it('wakes a keeper of an item of power', () => {
    const awake = {
      ...SMALL,
      awakenings: [
        { ...C.awakenings.find((d) => d.source === 'item')!, afterDays: 0, monthlyChance: 1 },
      ],
    };
    const t = fresh(awake);
    t.child.magic = { power: 0, affinities: {} };
    const id = t.world.nextId.item;
    t.world.nextId.item += 1;
    t.world.items.set(id, {
      id,
      kind: 'artifact',
      name: 'the ring of Test',
      form: 'ring',
      made: 0,
      makerId: null,
      holder: t.child.id,
      deeds: [],
    });
    refreshWork(awake, t.active);
    run(t.world, awake, 40);
    expect(t.child.awakening?.id).toBe('bound-item');
    expect(t.child.magic.power).toBeGreaterThanOrEqual(1);
  });

  it('calms the most stressed member of the household, once a day', () => {
    const t = fresh();
    // Any household of two or more: the caster calms the other.
    const members = [...t.active.households.values()].find((h) => h.members.length >= 2)!.members;
    const caster = t.world.people.get(members[0]!)!;
    caster.knownAbilities = ['calm'];
    caster.magic = { power: 1, affinities: { mind: 1 } };
    const other = t.world.people.get(members[1]!)!;
    other.detail!.stress = 100;
    run(t.world, t.content, 1);
    expect(caster.detail!.lore!.castTotal.calm).toBe(1);
    expect(t.active.lore.stats.calmed).toBeCloseTo(C.lore.effects.calmStress);
  });

  it('says when a lost book was the last source of a cantrip', () => {
    // A town whose people hold no book of their own, so the test's book is the only one to lose.
    const { world: bookless } = findWorld('a town with no book', 'lore', SEEDS, make, (w) => {
      const town = biggest(w).id;
      return ![...w.items.values()].some(
        (i) => i.kind === 'book' && i.holder !== null && w.people.get(i.holder)?.siteId === town,
      );
    });
    const t = fresh(
      {
        ...SMALL,
        lore: { ...C.lore, books: { ...C.lore.books, lossPerDay: 1, lendEveryDays: 1 } },
      },
      bookless,
    );
    const owner = t.parent;
    owner.attributes = { ...owner.attributes, intellect: 15 };
    addBook(t.world, t.active, owner.id);
    run(t.world, t.content, 3);
    const lost = t.world.events.filter((e) => e.type === C.lore.events.lost);
    const last = t.world.events.filter((e) => e.type === C.lore.events.lastSource);
    expect(lost).toHaveLength(1);
    expect(last).toHaveLength(1);
    expect(last[0]!.causes).toEqual([lost[0]!.id]);
    expect(last[0]!.data.cantrips).toBe('Kindle');
    expect(C.site.autoPause.magic).toContain(C.lore.events.lastSource);
    expect(C.site.autoPause.magic).not.toContain(C.lore.events.lost);
  });
});
