// Spellbooks and lineages (M5.2): every mage learns from a source (a teacher or parent, their
// people's college, a book or a village hedge-witch), knows named spells, writes them into books
// and hands the books to an apprentice. A legend takes an apprentice. Books burn with a razed
// town, and a spell is lost from the world when its last knower dies and no book or college holds
// it; it comes back if a book that holds it turns up. All draws come from the `magic` stream.

import type { AbilityDef } from '../core/content-types';
import type { Id, Item, MageLore, Person, Site } from '../core/types';
import { meetsRequirements } from '../people/aptitude';
import { TIERS } from '../people/tiers';
import { collegeOf } from './colleges';
import { fill, isSpell, newItem, primarySchool, spellPower, uniqueName } from './items';
import {
  addDeed,
  ageOf,
  eventById,
  createPerson,
  isAdult,
  livingList,
  livingPerson,
  placeOf,
  raceOf,
  siteOf,
} from './people';
import type { College, HistoryRun } from './state';

const LEGENDARY = TIERS.legendary.minPower;
/** The oldest an elder master may be at the start, as years past maturity (they must have time to teach). */
const MASTER_PAST_MATURITY = 5;
/** The tier a mage's fame is set by (as at birth). */
const EXCEPTIONAL = TIERS.exceptional.minPower;

const fillIn = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );

const siteName = (site: Site | undefined) => site?.name ?? 'the wilds';

function newLore(via: MageLore['via'], since: number): MageLore {
  return { via, teachers: [], apprentices: [], since, learned: [] };
}

/** The mage's lore record, made as 'old' (learned before the records began) when missing. */
function loreOf(run: HistoryRun, person: Person): MageLore {
  return (person.lore ??= newLore('old', run.year));
}

/** The magic abilities of a school, lowest power first. */
function schoolAbilities(run: HistoryRun, school: string): AbilityDef[] {
  return run.lore.magic.filter((a) => a.school === school);
}

/** The event of a notable's death, from their deeds. */
function deathEventOf(run: HistoryRun, person: Person): Id | undefined {
  for (let i = person.deeds.length - 1; i >= 0; i -= 1) {
    const event = eventById(run, person.deeds[i]!);
    if (event && event.type === 'notable_died' && event.actors[0] === person.id) return event.id;
  }
  return undefined;
}

function learnsAt(person: Person, ability: AbilityDef, lore: MageLore, year: number): void {
  if (person.knownAbilities.includes(ability.id)) return;
  person.knownAbilities.push(ability.id);
  lore.learned.push({ id: ability.id, year });
}

// --- survey of what exists ---------------------------------------------------------------------

interface Survey {
  /** "civ:spell" keys: spells above cantrips that a living member knows, a member's book keeps or the civ's open college teaches. */
  now: Set<string>;
  /** The highest-id living member who knows or keeps each. */
  keeper: Map<string, Id>;
  /** Held, unburned books that keep each, in id order. */
  books: Map<string, Item[]>;
}

const key = (civ: Id, spell: string) => `${civ}:${spell}`;

/** What each living people still has of its magic: lore is lost or found per people. */
function survey(run: HistoryRun): Survey {
  const now = new Set<string>();
  const keeper = new Map<string, Id>();
  const books = new Map<string, Item[]>();
  const keep = (k: string, who: Id) => {
    now.add(k);
    keeper.set(k, Math.max(keeper.get(k) ?? 0, who));
  };
  const civOk = (civ: Id | null | undefined): civ is Id =>
    civ != null && run.world.civs.get(civ)?.fell === undefined;
  for (const person of livingList(run)) {
    if (!civOk(person.civId)) continue;
    for (const id of person.knownAbilities)
      if (isSpell(run, id)) keep(key(person.civId, id), person.id);
  }
  for (const item of run.world.items.values()) {
    if (item.spells === undefined || item.burned !== undefined || item.holder === null) continue;
    const holder = livingPerson(run, item.holder);
    if (!holder || !civOk(holder.civId)) continue;
    for (const id of item.spells) {
      if (!isSpell(run, id)) continue;
      const k = key(holder.civId, id);
      keep(k, holder.id);
      const list = books.get(k);
      if (list) list.push(item);
      else books.set(k, [item]);
    }
  }
  for (const college of run.colleges) {
    if (college.closed !== undefined || !civOk(college.civId)) continue;
    for (const id of college.lore) if (isSpell(run, id)) now.add(key(college.civId, id));
  }
  return { now, keeper, books };
}

// --- the start of the world --------------------------------------------------------------------

/** Year 0: each people that can bear a Strong mage starts with an elder master and their old book. */
export function initLineages(run: HistoryRun): void {
  const rules = run.rules.lineages;
  const notables = run.content.notables;
  const rng = run.rng.magic;
  for (const civ of run.world.civs.values()) {
    const capital = run.world.sites.get(civ.capital);
    const race = run.races.get(civ.raceId);
    if (!capital || !race) continue;
    if (race.magicTierWeights.strong + race.magicTierWeights.exceptional <= 0) continue;
    const age = Math.max(
      race.maturityYears + MASTER_PAST_MATURITY,
      Math.round(rules.elderMasterAge * race.lifespanYears),
    );
    const master = createPerson(run, {
      raceId: civ.raceId,
      cultureId: civ.cultureId,
      siteId: capital.id,
      civId: civ.id,
      cell: capital.cell,
      title: 'mage',
      age,
      fame: 0,
      minTier: 'strong',
    });
    const tier = master.magic.power >= EXCEPTIONAL ? 'exceptional' : 'strong';
    master.fame = notables.fame.mage[tier] ?? 0;
    const lore = newLore('old', master.born);
    master.lore = lore;
    const school = primarySchool(master);
    if (school === undefined) continue;
    for (const ability of schoolAbilities(run, school)) {
      if (meetsRequirements(master, ability)) learnsAt(master, ability, lore, run.year);
    }
    const forms = notables.bookForms[school] ?? notables.bookForms.mundane!;
    const form = rng.pick(forms);
    const picked = rng.pick(rules.oldLoreNames);
    const name = uniqueName(
      run,
      fill(rules.oldLoreNames, picked, { civ: civ.name, school, site: capital.name }),
    );
    const book = newItem(run, { kind: 'book', name, form, makerId: null, holder: master.id });
    // Every school the race takes to, so the master can teach a child of any of them from it.
    book.school = school;
    book.spells = Object.keys(race.affinityWeights)
      .sort()
      .flatMap((s) => schoolAbilities(run, s))
      .filter((a) => spellPower(a) >= 4)
      .map((a) => a.id);
  }
  const found = survey(run);
  run.lore.existing = found.now;
  run.lore.lastKnower = found.keeper;
}

// --- apprenticeship ----------------------------------------------------------------------------

/** Apprentices of a teacher who live and are still in training. */
function inTraining(run: HistoryRun, teacher: Person): number {
  const rules = run.rules.lineages;
  let count = 0;
  for (const id of teacher.lore?.apprentices ?? []) {
    const apprentice = livingPerson(run, id);
    if (
      apprentice &&
      ageOf(run, apprentice) < raceOf(run, apprentice).maturityYears + rules.trainingYears
    )
      count += 1;
  }
  return count;
}

const sameSchool = (a: Person, b: Person) =>
  primarySchool(a) !== undefined && primarySchool(a) === primarySchool(b);

/** Living holders' unburned spellbooks, by holder. */
function booksByHolder(run: HistoryRun): Map<Id, Item[]> {
  const books = new Map<Id, Item[]>();
  for (const item of run.world.items.values()) {
    if (item.spells === undefined || item.burned !== undefined || item.holder === null) continue;
    const list = books.get(item.holder);
    if (list) list.push(item);
    else books.set(item.holder, [item]);
  }
  return books;
}

/** Spells above a cantrip of the person's school that the teacher knows or keeps in a book. */
function teachable(
  run: HistoryRun,
  teacher: Person,
  person: Person,
  books: Map<Id, Item[]>,
): number {
  const school = primarySchool(person);
  if (school === undefined) return 0;
  let count = 0;
  for (const ability of schoolAbilities(run, school)) {
    if (spellPower(ability) < 4 || person.knownAbilities.includes(ability.id)) continue;
    if (
      teacher.knownAbilities.includes(ability.id) ||
      (books.get(teacher.id) ?? []).some((b) => b.spells!.includes(ability.id))
    )
      count += 1;
  }
  return count;
}

/** A living adult parent who is a mage: the same school first, then the stronger. */
function parentTeacher(run: HistoryRun, person: Person): Person | undefined {
  const rules = run.rules.lineages;
  let best: Person | undefined;
  for (const id of person.family.parents) {
    const parent = livingPerson(run, id);
    if (!parent || !isAdult(run, parent) || parent.magic.power < rules.minPower) continue;
    // A parent weaker than the child and short of a master's power sends them to a master instead.
    if (parent.magic.power < Math.min(person.magic.power, rules.teacherPower)) continue;
    if (
      !best ||
      (sameSchool(parent, person) ? 1 : 0) > (sameSchool(best, person) ? 1 : 0) ||
      ((sameSchool(parent, person) ? 1 : 0) === (sameSchool(best, person) ? 1 : 0) &&
        parent.magic.power > best.magic.power)
    )
      best = parent;
  }
  return best;
}

/** The best living adult teacher of the person's people with room for an apprentice. */
function masterFor(
  run: HistoryRun,
  person: Person,
  pool: Person[],
  books: Map<Id, Item[]>,
  needed = false,
): Person | undefined {
  const rules = run.rules.lineages;
  let best: Person | undefined;
  // Someone who can teach the person more than a cantrip first, then their own school.
  const rank = (p: Person) => [
    teachable(run, p, person, books) > 0 ? 1 : 0,
    sameSchool(p, person) ? 1 : 0,
    p.magic.power >= LEGENDARY ? 1 : 0,
    p.magic.power,
  ];
  for (const teacher of pool) {
    if (teacher.id === person.id || teacher.died !== undefined) continue;
    if (teacher.civId !== person.civId || teacher.civId == null) continue;
    if (inTraining(run, teacher) >= rules.maxApprentices) continue;
    if (person.lore?.teachers.includes(teacher.id)) continue;
    if (needed && teachable(run, teacher, person, books) === 0) continue;
    if (!best) {
      best = teacher;
      continue;
    }
    const a = rank(teacher);
    const b = rank(best);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        if (a[i]! > b[i]!) best = teacher;
        break;
      }
    }
  }
  return best;
}

/** A book of the person's school kept by a living notable of their people at their site. */
function bookAt(run: HistoryRun, person: Person, school: string | undefined): Item | undefined {
  if (school === undefined) return undefined;
  for (const item of run.world.items.values()) {
    if (item.spells === undefined || item.burned !== undefined || item.school !== school) continue;
    const holder = livingPerson(run, item.holder);
    if (
      holder &&
      holder.id !== person.id &&
      holder.civId === person.civId &&
      holder.siteId === person.siteId
    )
      return item;
  }
  return undefined;
}

function apprentice(run: HistoryRun, person: Person, pool: Person[], books: Map<Id, Item[]>): void {
  const rules = run.rules.lineages;
  const phrases = rules.phrases;
  const school = primarySchool(person);
  const lore = newLore('teacher', run.year);
  const home = siteOf(run, person);
  const parent = parentTeacher(run, person);
  const master = parent ? undefined : masterFor(run, person, pool, books);
  const teacher = parent ?? master;
  const college = teacher ? undefined : collegeOf(run, person.civId);
  const book = teacher || college ? undefined : bookAt(run, person, school);
  let how: string;
  let causes: Id[] = [];
  if (teacher) {
    lore.teachers.push(teacher.id);
    causes = teacher.deeds.slice(-1);
    how = parent
      ? fillIn(parent.sex === 'f' ? phrases.mother : phrases.father, { teacher: parent.name })
      : fillIn(phrases.teacher, { teacher: teacher.name, site: siteName(siteOf(run, teacher)) });
  } else if (college) {
    lore.via = 'college';
    lore.college = college.name;
    how = fillIn(phrases.college, { college: college.name });
    causes = [college.event];
  } else if (book) {
    lore.via = 'book';
    lore.bookId = book.id;
    how = fillIn(phrases.book, { book: book.name });
    causes = book.deeds.slice(-1);
  } else {
    lore.via = 'hedge';
    if (person.siteId != null) lore.siteId = person.siteId;
    how = fillIn(phrases.hedge, { site: siteName(home) });
    // A hedge-witch teaches only a cantrip of the person's school.
    if (school !== undefined) {
      const cantrip = schoolAbilities(run, school).find(
        (a) => spellPower(a) <= 1 && meetsRequirements(person, a),
      );
      if (cantrip) learnsAt(person, cantrip, lore, run.year);
    }
  }
  const event = run.emit({
    type: 'apprenticed',
    actors: teacher ? [person.id, teacher.id] : [person.id],
    place: placeOf(run, person),
    causes,
    data: {
      name: person.name,
      school: school ?? 'wild',
      how,
      site: siteName(home),
      civ: run.world.civs.get(person.civId ?? -1)?.name ?? '',
    },
  });
  lore.event = event.id;
  person.lore = lore;
  addDeed(person, event.id);
  if (teacher) {
    loreOf(run, teacher).apprentices.push(person.id);
    addDeed(teacher, event.id);
  }
}

function runApprenticeships(run: HistoryRun): void {
  const rules = run.rules.lineages;
  const people = livingList(run);
  // A teacher must be grown; the pool is by id, so ties go to the lowest id.
  const pool = people.filter((p) => p.magic.power >= rules.teacherPower && isAdult(run, p));
  const books = booksByHolder(run);
  for (const person of people) {
    if (person.magic.power < rules.minPower || person.died !== undefined) continue;
    const age = ageOf(run, person);
    if (!person.lore) {
      if (age < Math.round(rules.apprenticeShare * raceOf(run, person).maturityYears)) continue;
      apprentice(run, person, pool, books);
      continue;
    }
    // Still in training with no one left who can teach them more: they go to a master who can.
    if (person.lore.via === 'old') continue;
    if (age >= raceOf(run, person).maturityYears + rules.trainingYears) continue;
    const taught = person.lore.teachers.some((id) => {
      const teacher = livingPerson(run, id);
      return teacher !== undefined && teachable(run, teacher, person, books) > 0;
    });
    if (taught) continue;
    const master = masterFor(run, person, pool, books, true);
    if (master) moveOn(run, person, master);
  }
}

/** An apprentice whose teachers have nothing more for them goes on to a new master. */
function moveOn(run: HistoryRun, person: Person, master: Person): void {
  const lore = person.lore!;
  const school = primarySchool(person);
  lore.teachers.push(master.id);
  const event = run.emit({
    type: 'apprenticed',
    actors: [person.id, master.id],
    place: placeOf(run, person),
    causes: master.deeds.slice(-1),
    data: {
      name: person.name,
      school: school ?? 'wild',
      how: fillIn(run.rules.lineages.phrases.teacher, {
        teacher: master.name,
        site: siteName(siteOf(run, master)),
      }),
      site: siteName(siteOf(run, person)),
      civ: run.world.civs.get(person.civId ?? -1)?.name ?? '',
    },
  });
  addDeed(person, event.id);
  loreOf(run, master).apprentices.push(person.id);
  addDeed(master, event.id);
}

// --- legends take apprentices ------------------------------------------------------------------

function apprenticeOfLegend(run: HistoryRun, person: Person): boolean {
  return (person.lore?.teachers ?? []).some(
    (id) => (run.world.people.get(id)?.magic.power ?? 0) >= LEGENDARY,
  );
}

function runLegendApprentices(run: HistoryRun): void {
  const rules = run.rules.lineages;
  const rng = run.rng.magic;
  for (const legend of livingList(run)) {
    if (legend.magic.power < LEGENDARY || legend.died !== undefined) continue;
    if (inTraining(run, legend) > 0) continue;
    let pick: Person | undefined;
    for (const p of livingList(run)) {
      if (p.civId !== legend.civId || legend.civId == null || p.id === legend.id) continue;
      if (p.magic.power < rules.teacherPower || p.magic.power >= LEGENDARY) continue;
      if (!isAdult(run, p) || apprenticeOfLegend(run, p)) continue;
      if (!pick || p.magic.power > pick.magic.power) pick = p;
    }
    if (!pick || !rng.chance(rules.legendApprenticeChance)) continue;
    const lore = loreOf(run, pick);
    lore.teachers.push(legend.id);
    loreOf(run, legend).apprentices.push(pick.id);
    const event = run.emit({
      type: 'apprentice_taken',
      actors: [legend.id, pick.id],
      place: placeOf(run, legend),
      causes: legend.deeds.slice(-1),
      data: {
        teacher: legend.name,
        name: pick.name,
        school: primarySchool(pick) ?? 'wild',
        site: siteName(siteOf(run, pick)),
        civ: run.world.civs.get(pick.civId ?? -1)?.name ?? '',
      },
    });
    addDeed(legend, event.id);
    addDeed(pick, event.id);
  }
}

// --- learning ----------------------------------------------------------------------------------

type Source =
  | { kind: 'teacher'; teacher: Person }
  | { kind: 'book'; book: Item }
  | { kind: 'college'; college: College };

/** The college a mage may learn from: their people's, or the one they study at. */
function collegeFor(run: HistoryRun, person: Person): College | undefined {
  const student = run.students.get(person.id);
  const studying =
    student && run.colleges.find((c) => c.siteId === student.siteId && c.closed === undefined);
  return studying ?? collegeOf(run, person.civId);
}

function sourcePhrase(run: HistoryRun, source: Source): string {
  const phrases = run.rules.lineages.phrases;
  switch (source.kind) {
    case 'teacher':
      return fillIn(phrases.taughtBy, { teacher: source.teacher.name });
    case 'book':
      return fillIn(phrases.book, { book: source.book.name });
    default:
      return fillIn(phrases.college, { college: source.college.name });
  }
}

function runLearning(run: HistoryRun): void {
  const rules = run.rules.lineages;
  const rng = run.rng.magic;
  const books = booksByHolder(run);
  for (const person of livingList(run)) {
    const lore = person.lore;
    if (!lore) continue;
    const teachers = lore.teachers
      .map((id) => livingPerson(run, id))
      .filter((p): p is Person => p !== undefined);
    const college = collegeFor(run, person);
    const held = [...(books.get(person.id) ?? [])];
    // A book they first learned from goes on teaching them while someone of their people keeps it.
    const first = lore.bookId === undefined ? undefined : run.world.items.get(lore.bookId);
    const keeper = livingPerson(run, first?.holder);
    if (
      first &&
      first.burned === undefined &&
      keeper?.civId === person.civId &&
      !held.includes(first)
    )
      held.push(first);
    if (teachers.length === 0 && !college && held.length === 0) continue;
    let learn: { ability: AbilityDef; source: Source } | undefined;
    for (const ability of run.lore.magic) {
      if (person.knownAbilities.includes(ability.id) || !meetsRequirements(person, ability))
        continue;
      let source: Source | undefined;
      if (ability.learnFrom.includes('teacher')) {
        // A teacher teaches what they know and what their own books hold.
        const teacher = teachers.find(
          (t) =>
            t.knownAbilities.includes(ability.id) ||
            (books.get(t.id) ?? []).some((b) => b.spells!.includes(ability.id)),
        );
        if (teacher) source = { kind: 'teacher', teacher };
      }
      if (!source && ability.learnFrom.includes('book')) {
        const book = held.find((b) => b.spells!.includes(ability.id));
        if (book) source = { kind: 'book', book };
      }
      if (!source && college && ability.learnFrom.includes('institution')) {
        if (college.lore.includes(ability.id)) source = { kind: 'college', college };
      }
      if (source) {
        learn = { ability, source };
        break;
      }
    }
    if (!learn || !rng.chance(rules.learnChance)) continue;
    const { ability, source } = learn;
    person.knownAbilities.push(ability.id);
    const record: MageLore['learned'][number] = { id: ability.id, year: run.year };
    if (source.kind === 'teacher') record.teacher = source.teacher.id;
    else if (source.kind === 'book') record.book = source.book.id;
    else record.college = source.college.name;
    lore.learned.push(record);
    if (spellPower(ability) < EXCEPTIONAL) continue;
    const causes =
      source.kind === 'teacher'
        ? source.teacher.deeds.slice(-1)
        : source.kind === 'book'
          ? source.book.deeds.slice(-1)
          : [source.college.event];
    const event = run.emit({
      type: 'spell_mastered',
      actors: source.kind === 'teacher' ? [person.id, source.teacher.id] : [person.id],
      place: placeOf(run, person),
      causes,
      data: {
        name: person.name,
        spell: ability.name,
        source: sourcePhrase(run, source),
        site: siteName(siteOf(run, person)),
      },
    });
    addDeed(person, event.id);
    if (source.kind === 'teacher') addDeed(source.teacher, event.id);
  }
}

// --- colleges' lore, lost and regained lore ----------------------------------------------------

/** Each open college adds the spells its mages know. */
function runCollegeLore(run: HistoryRun): void {
  for (const college of run.colleges) {
    if (college.closed !== undefined) continue;
    for (const person of livingList(run)) {
      if (person.siteId !== college.siteId || person.civId !== college.civId) continue;
      for (const id of person.knownAbilities) {
        if (isSpell(run, id) && !college.lore.includes(id)) college.lore.push(id);
      }
    }
  }
}

/** "A", "A and B", "A, B and C". */
function listOf(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Each people that lost spells of strong power or more this year, or found them again, says so once. */
function runLostLore(run: HistoryRun): void {
  const rules = run.rules.lineages;
  const found = survey(run);
  const lore = run.lore;
  for (const civ of run.world.civs.values()) {
    // A fallen people loses everything at once; its fall is the story, not each spell.
    if (civ.fell !== undefined) continue;
    const lost: AbilityDef[] = [];
    const regained = new Map<Item, AbilityDef[]>();
    for (const ability of lore.magic) {
      if (spellPower(ability) <= 1) continue;
      const k = key(civ.id, ability.id);
      if (lore.existing.has(k) && !found.now.has(k)) {
        lore.lost.add(k);
        if (spellPower(ability) >= rules.lostPower) lost.push(ability);
      } else if (lore.lost.has(k) && found.now.has(k)) {
        lore.lost.delete(k);
        const book = found.books.get(k)?.[0];
        if (book && spellPower(ability) >= rules.lostPower) {
          const list = regained.get(book);
          if (list) list.push(ability);
          else regained.set(book, [ability]);
        }
      }
    }
    if (lost.length > 0) {
      const first = lost[0]!;
      const last = lore.lastKnower.get(key(civ.id, first.id));
      const dead = last === undefined ? undefined : run.world.people.get(last);
      const burn = [...lore.burns].find(([itemId]) =>
        lost.some((a) => run.world.items.get(itemId)?.spells?.includes(a.id)),
      );
      const closed = run.colleges.find(
        (c) =>
          c.closed === run.year && c.civId === civ.id && lost.some((a) => c.lore.includes(a.id)),
      );
      const deathEvent = dead?.died === undefined ? undefined : deathEventOf(run, dead);
      let how = rules.phrases.forgotten;
      let name = dead?.name ?? '';
      const causes: Id[] = [];
      if (burn) {
        const item = run.world.items.get(burn[0])!;
        how = fillIn(rules.phrases.burned, { item: item.name, site: burn[1].site });
        name = item.name;
        causes.push(burn[1].event);
      } else if (dead && deathEvent !== undefined) {
        how = fillIn(rules.phrases.diedLast, { name: dead.name });
      } else if (closed) {
        how = fillIn(rules.phrases.collegeFell, { college: closed.name });
        name = closed.name;
        if (closed.closedEvent !== undefined) causes.push(closed.closedEvent);
      } else if (dead && dead.civId !== civ.id) {
        how = fillIn(rules.phrases.wentAway, { name: dead.name });
      }
      if (deathEvent !== undefined) causes.push(deathEvent);
      run.emit({
        type: 'lore_lost',
        actors: dead ? [dead.id] : [],
        place: dead ? placeOf(run, dead) : (run.world.sites.get(civ.capital)?.cell ?? null),
        causes,
        data: { spell: listOf(lost.map((a) => a.name)), name, how, civ: civ.name },
      });
    }
    for (const [book, spells] of regained) {
      const holder = livingPerson(run, book.holder);
      if (!holder) continue;
      const event = run.emit({
        type: 'lore_regained',
        actors: [holder.id],
        place: placeOf(run, holder),
        causes: book.deeds.slice(-1),
        data: {
          spell: listOf(spells.map((a) => a.name)),
          item: book.name,
          name: holder.name,
          site: siteName(siteOf(run, holder)),
          civ: civ.name,
        },
      });
      book.deeds.push(event.id);
      addDeed(holder, event.id);
    }
  }
  lore.existing = found.now;
  for (const [k, who] of found.keeper) lore.lastKnower.set(k, who);
  lore.burns.clear();
}

/** Yearly, right after the colleges: apprenticeships, legends' pupils, learning and the world's lore. */
export function runLineages(run: HistoryRun): void {
  runApprenticeships(run);
  runLegendApprentices(run);
  runLearning(run);
  runCollegeLore(run);
  runLostLore(run);
}
