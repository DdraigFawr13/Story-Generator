import { canonicalJson } from './canonical';
import { calendarAtTick } from './clock';
import { LIVING_CONFIG, LIVING_SETTLEMENT_VERSION } from './living-config';
import {
  eligibleParent,
  individualDeathThreshold,
  individualHealth,
  livingPeople,
  meanHealth,
  planPersonWeek,
} from './living-people';
import type { LivingSettlementState, ResidentActivity } from './living-state';
import { RESIDENT_CONFIG } from './resident-config';
import { worldResidentAgeWeeks } from './resident-world';
import { validateEconomicState, type EconomicValidation } from './settlement-validation';
import { EVENT_FIELDS } from './state';

function requireLife(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid individual world: ${message}`);
}
function record(value: unknown, names: string[]): void {
  requireLife(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join(',') === names.sort().join(','),
    'record shape',
  );
}
function integer(value: number, min = 0, max = Number.MAX_SAFE_INTEGER): void {
  requireLife(Number.isSafeInteger(value) && value >= min && value <= max, 'integer bounds');
}
function same(left: unknown, right: unknown, message: string): void {
  requireLife(canonicalJson(left) === canonicalJson(right), message);
}
function activity(value: ResidentActivity | null, s: LivingSettlementState): void {
  if (value === null) return;
  record(value, ['role', 'targetId']);
  const kinds: Record<string, string | null> = {
    fieldwork: 'field',
    foraging: null,
    repairing: 'repair',
    building: 'build',
    gathering: null,
    caretaking: 'resident',
    resting: null,
  };
  requireLife(Object.hasOwn(kinds, value.role), 'activity role');
  const kind = kinds[value.role];
  if (kind === null) requireLife(value.targetId === null, 'untargeted activity');
  else {
    integer(value.targetId!, 1, s.world.entities.length);
    const target = s.world.entities[value.targetId! - 1]!;
    requireLife(
      kind === 'repair'
        ? ['hut', 'store'].includes(target.kind)
        : kind === 'build'
          ? ['hut', 'field', 'store'].includes(target.kind)
          : target.kind === kind,
      'activity target',
    );
  }
}

// Direct saved-state validation. Immutable founding identity facts and explicit
// activity/home changes are checked against their archive, without seed replay.
export function validateLivingSettlement(value: unknown): asserts value is LivingSettlementState {
  canonicalJson(value);
  const s = value as LivingSettlementState;
  requireLife(
    s?.schemaVersion === 3 &&
      s.simulationVersion === LIVING_SETTLEMENT_VERSION &&
      s.rulesVersion === LIVING_SETTLEMENT_VERSION,
    'unsupported version',
  );
  same(s.config, LIVING_CONFIG, 'unsupported configuration');
  requireLife(
    Array.isArray(s.world?.residents) &&
      Array.isArray(s.world.households) &&
      Array.isArray(s.world.entities) &&
      Array.isArray(s.events),
    'identity collections',
  );
  const byId = new Map(s.world.residents.map((resident) => [resident.id, resident]));
  requireLife(byId.size === s.world.residents.length, 'duplicate resident IDs');
  const households = new Map(s.world.households.map((household) => [household.id, household]));
  requireLife(households.size === 6 && s.world.households.length === 6, 'household identities');
  const founding = s.events[0]!;
  requireLife(
    founding?.type === 'founding' &&
      Array.isArray(founding.facts.residents) &&
      Array.isArray(founding.facts.householdRecords),
    'founding identities',
  );
  const founders = founding.facts.residents as Record<string, unknown>[];
  const originalHouseholds = founding.facts.householdRecords as Record<string, unknown>[];
  requireLife(founders.length === 24 && originalHouseholds.length === 6, 'founding census');
  same(
    founding.entityIds,
    Array.from({ length: 40 }, (_, index) => index + 1),
    'founding registry',
  );
  for (const [index, household] of originalHouseholds.entries()) {
    record(household, ['id', 'name', 'homeId', 'tile', 'creationEventId']);
    requireLife(
      household.id === 11 + index && household.creationEventId === 1,
      'founding household ordering',
    );
    const home = s.world.entities[(household.homeId as number) - 1];
    requireLife(
      home?.kind === 'hut' && home.creationEventId === 1 && home.tile === household.tile,
      'founding household home',
    );
    const members = founders.filter((resident) => resident.householdId === household.id);
    requireLife(
      members.length === 4 &&
        members.every(
          (resident) => resident.homeId === household.homeId && resident.tile === household.tile,
        ),
      'founding household membership',
    );
  }
  const lastBirth = new Map<number, number>();
  let previousId = 0;
  for (const resident of s.world.residents) {
    record(resident, [
      'id',
      'givenName',
      'householdName',
      'householdId',
      'homeId',
      'tile',
      'entryTick',
      'ageWeeksAtEntry',
      'creationEventId',
      'birthEventId',
      'deathEventId',
      'health',
      'profession',
      'parentIds',
      'traits',
      'activity',
      'lastBirthTick',
    ]);
    integer(resident.id, previousId + 1, s.world.entities.length);
    previousId = resident.id;
    integer(resident.entryTick, 0, s.tick);
    integer(resident.creationEventId, 1, s.events.length);
    integer(resident.health, 0, 100);
    integer(resident.ageWeeksAtEntry);
    integer(resident.tile, 0, 2559);
    requireLife(
      resident.profession === 'unassigned' && Array.isArray(resident.parentIds),
      'resident attributes',
    );
    record(resident.traits, ['sociability', 'caution', 'persistence']);
    for (const trait of Object.values(resident.traits)) integer(trait, 0, 100);
    requireLife(
      RESIDENT_CONFIG.givenNames.some((name) => name === resident.givenName),
      'resident name',
    );
    const household = households.get(resident.householdId);
    requireLife(household && household.name === resident.householdName, 'household membership');
    const origin = s.events[resident.creationEventId - 1]!;
    requireLife(
      origin.tick === resident.entryTick && origin.entityIds.includes(resident.id),
      'resident origin',
    );
    if (resident.birthEventId === null) {
      requireLife(
        resident.entryTick === 0 &&
          resident.creationEventId === 1 &&
          resident.parentIds.length === 0 &&
          resident.id >= 17 &&
          resident.id <= 40,
        'founder provenance',
      );
      integer(
        resident.ageWeeksAtEntry,
        RESIDENT_CONFIG.founderMinAgeWeeks,
        RESIDENT_CONFIG.founderMaxAgeWeeks,
      );
    } else {
      requireLife(
        resident.birthEventId === resident.creationEventId &&
          origin.type === 'births' &&
          resident.entryTick > 0 &&
          resident.ageWeeksAtEntry === 0 &&
          resident.parentIds.length === 1,
        'birth provenance',
      );
      const parent = byId.get(resident.parentIds[0]!);
      requireLife(
        parent &&
          parent.id < resident.id &&
          parent.creationEventId < resident.birthEventId &&
          (parent.deathEventId === null || parent.deathEventId > resident.birthEventId) &&
          parent.householdId === resident.householdId,
        'known parent',
      );
      const age = worldResidentAgeWeeks(parent, resident.entryTick);
      requireLife(
        age >= LIVING_CONFIG.residents.life.adultAgeWeeks &&
          age < LIVING_CONFIG.residents.life.birthMaxAgeWeeks,
        'parent age',
      );
      const prior = lastBirth.get(parent.id);
      requireLife(
        prior === undefined ||
          resident.entryTick - prior >= LIVING_CONFIG.residents.life.birthIntervalWeeks,
        'birth interval',
      );
      lastBirth.set(parent.id, resident.entryTick);
    }
    worldResidentAgeWeeks(resident, s.tick);
    const registered = s.world.entities[resident.id - 1]!;
    requireLife(
      registered.kind === 'resident' &&
        registered.creationEventId === resident.creationEventId &&
        registered.retired === (resident.deathEventId !== null),
      'resident registry',
    );
    if (resident.deathEventId !== null) {
      integer(resident.deathEventId, resident.creationEventId + 1, s.events.length);
      const death = s.events[resident.deathEventId - 1]!;
      requireLife(
        death.type === 'deaths' &&
          death.entityIds.includes(resident.id) &&
          Array.isArray(death.facts.residents),
        'death provenance',
      );
      const evidence = (death.facts.residents as Record<string, unknown>[]).find(
        (entry) => entry.id === resident.id,
      );
      requireLife(
        evidence &&
          evidence.health === resident.health &&
          evidence.ageWeeks === worldResidentAgeWeeks(resident, death.tick),
        'death identity facts',
      );
    }
    activity(resident.activity, s);
  }
  for (const resident of s.world.residents)
    requireLife(
      resident.lastBirthTick === (lastBirth.get(resident.id) ?? null),
      'last birth evidence',
    );

  const alive = livingPeople(s),
    occupancy = new Map<number, number>();
  requireLife(
    s.world.settlement.population === alive.length &&
      s.world.settlement.health === meanHealth(alive),
    'living census/health',
  );
  for (const resident of alive) {
    if (resident.homeId !== null) {
      const hut = s.world.buildings.find((building) => building.id === resident.homeId);
      requireLife(hut?.kind === 'hut' && resident.tile === hut.tile, 'living home');
      const count = (occupancy.get(hut.id) ?? 0) + 1;
      requireLife(count <= s.config.settlement.hutCapacity, 'home capacity');
      occupancy.set(hut.id, count);
    } else requireLife(resident.tile === s.world.settlement.center, 'unhoused location');
  }
  for (const [index, household] of s.world.households.entries()) {
    record(household, ['id', 'name', 'homeId', 'tile', 'creationEventId']);
    requireLife(
      household.id === 11 + index &&
        household.creationEventId === 1 &&
        RESIDENT_CONFIG.householdNames.some((name) => name === household.name),
      'household origin',
    );
    const original = originalHouseholds.find((entry) => entry.id === household.id);
    requireLife(
      original?.name === household.name && original.creationEventId === 1,
      'household name provenance',
    );
    const members = alive.filter((resident) => resident.householdId === household.id),
      housed = members.find((resident) => resident.homeId !== null);
    requireLife(
      household.homeId === (housed?.homeId ?? null) &&
        household.tile === (housed?.tile ?? s.world.settlement.center),
      'primary household home',
    );
    const registry = s.world.entities[household.id - 1]!;
    requireLife(
      registry.kind === 'household' &&
        registry.creationEventId === 1 &&
        registry.tile === original.tile &&
        registry.retired === (members.length === 0),
      'household lifecycle',
    );
  }
  requireLife(
    new Set(s.world.households.map((household) => household.name)).size === 6,
    'household names',
  );
  validatePersonHistory(s);
  const accounting = s.tick > 0 ? validatePeopleLedger(s) : null;
  const contract: EconomicValidation = {
    version: LIVING_SETTLEMENT_VERSION,
    schemaVersion: 3,
    config: LIVING_CONFIG,
    economicConfig: LIVING_CONFIG.settlement,
    rngNames: ['residents'],
    worldFields: ['residents', 'households'],
    householdCount: new Set(alive.map((resident) => resident.householdId)).size,
    foundingAllocator: 41,
    identity(entity, created) {
      const kind = entity.kind as string;
      return kind === 'resident'
        ? byId.get(entity.id)?.creationEventId === created.id &&
            (created.type === 'founding' || created.type === 'births')
        : kind === 'household' && households.has(entity.id) && created.type === 'founding';
    },
    eventFields(event) {
      const original = EVENT_FIELDS[event.type];
      requireLife(original, 'event type');
      return {
        facts: [
          ...original.facts,
          ...(event.type === 'founding'
            ? ['residents', 'householdRecords']
            : event.type === 'births' || event.type === 'deaths'
              ? ['residents']
              : []),
        ],
        effects: original.effects,
      };
    },
    ledger: accounting,
  };
  validateEconomicState(s, contract);
}

function validatePersonHistory(s: LivingSettlementState): void {
  const people = new Map(s.world.residents.map((resident) => [resident.id, resident]));
  const activities = new Map<number, ResidentActivity | null>();
  const homes = new Map<number, { homeId: number | null; tile: number }>();
  const availableHomes = new Set(
    s.world.entities
      .filter((entity) => entity.kind === 'hut' && entity.creationEventId === 1)
      .map((entity) => entity.id),
  );
  let population = 0;
  for (const event of s.events) {
    if (event.type === 'construction_completed' && event.facts.kind === 'hut')
      for (const id of event.entityIds)
        if (s.world.entities[id - 1]?.kind === 'hut') availableHomes.add(id);
    if (event.type === 'building_removed')
      for (const id of event.entityIds) availableHomes.delete(id);
    const f = event.facts;
    if (event.type === 'founding' || event.type === 'births') {
      requireLife(Array.isArray(f.residents), 'identity record');
      const rows = f.residents as Record<string, unknown>[];
      requireLife(
        rows.length === (event.type === 'founding' ? 24 : f.count),
        'identity record count',
      );
      const seen = new Set<number>();
      for (const row of rows) {
        record(
          row,
          event.type === 'founding'
            ? [
                'id',
                'givenName',
                'householdName',
                'householdId',
                'homeId',
                'tile',
                'ageWeeksAtEntry',
                'traits',
              ]
            : ['id', 'givenName', 'householdName', 'householdId', 'parentIds', 'tile', 'traits'],
        );
        const resident = people.get(row.id as number);
        requireLife(
          resident &&
            !seen.has(resident.id) &&
            !activities.has(resident.id) &&
            resident.creationEventId === event.id,
          'historic creation identity',
        );
        seen.add(resident.id);
        for (const field of ['givenName', 'householdName', 'householdId', 'traits'] as const)
          same(row[field], resident[field], 'immutable identity facts');
        requireLife(s.world.entities[resident.id - 1]!.tile === row.tile, 'creation place');
        if (event.type === 'founding')
          requireLife(row.ageWeeksAtEntry === resident.ageWeeksAtEntry, 'founder age');
        else same(row.parentIds, resident.parentIds, 'birth parent record');
        activities.set(resident.id, null);
        homes.set(resident.id, {
          homeId: event.type === 'founding' ? (row.homeId as number) : null,
          tile: row.tile as number,
        });
      }
      if (event.type === 'founding') population = 24;
      else {
        same(
          event.entityIds,
          [
            ...new Set([
              1,
              ...rows.flatMap((row) => [row.id as number, ...(row.parentIds as number[])]),
            ]),
          ].sort((a, b) => a - b),
          'birth participants',
        );
        requireLife(f.survivors === population, 'birth opening census');
        population += rows.length;
        same(
          event.effects.population,
          { before: population - rows.length, after: population },
          'birth census effect',
        );
      }
    } else if (event.type === 'deaths') {
      requireLife(Array.isArray(f.residents), 'death records');
      const rows = f.residents as Record<string, unknown>[];
      requireLife(rows.length === f.count && f.openingPopulation === population, 'death census');
      const seen = new Set<number>();
      for (const row of rows) {
        record(row, [
          'id',
          'ageWeeks',
          'health',
          'threshold',
          'draw',
          'before',
          'after',
          'homeId',
          'ration',
          'caregiverId',
        ]);
        const resident = people.get(row.id as number);
        requireLife(
          resident &&
            !seen.has(resident.id) &&
            resident.deathEventId === event.id &&
            row.health === row.after,
          'historic death identity',
        );
        seen.add(resident.id);
        integer(row.draw as number, 0, 999);
        integer(row.health as number, 0, 100);
        integer(row.before as number, 0, 100);
        requireLife(
          typeof row.ration === 'boolean' && row.homeId === homes.get(resident.id)?.homeId,
          'historic ration/home evidence',
        );
        const dependent =
          worldResidentAgeWeeks(resident, event.tick) <
          LIVING_CONFIG.residents.life.dependentAgeWeeks;
        if (row.caregiverId !== null) {
          integer(row.caregiverId as number, 1, s.world.entities.length);
          const caregiver = people.get(row.caregiverId as number);
          requireLife(
            dependent &&
              caregiver &&
              caregiver.householdId === resident.householdId &&
              caregiver.creationEventId < event.id &&
              (caregiver.deathEventId === null || caregiver.deathEventId >= event.id) &&
              activities.get(caregiver.id)?.role === 'caretaking',
            'historic caregiver evidence',
          );
        }
        requireLife(
          row.after ===
            individualHealth(
              row.before as number,
              row.ration,
              row.homeId !== null,
              dependent && row.caregiverId === null,
            ),
          'historic health accounting',
        );
        requireLife(
          row.threshold ===
            individualDeathThreshold(row.ageWeeks as number, row.health as number) &&
            (row.draw as number) < (row.threshold as number),
          'death risk facts',
        );
      }
      population -= rows.length;
      same(
        event.entityIds,
        [1, ...rows.map((row) => row.id as number)].sort((a, b) => a - b),
        'death participants',
      );
      same(
        event.effects.population,
        { before: population + rows.length, after: population },
        'death census effect',
      );
    } else if (event.type === 'work_changed' || event.type === 'home_changed') {
      requireLife(Array.isArray(f.assignments), 'assignment records');
      const rows = f.assignments as { id: number; before: unknown; after: unknown }[];
      requireLife(rows.length > 0 && rows.length === f.count, 'assignment count');
      same(
        event.entityIds,
        [1, ...rows.map((row) => row.id)].sort((a, b) => a - b),
        'assignment participants',
      );
      let previous = 0;
      for (const row of rows) {
        record(row, ['id', 'before', 'after']);
        const resident = people.get(row.id);
        requireLife(
          resident &&
            row.id > previous &&
            resident.creationEventId < event.id &&
            (resident.deathEventId === null || resident.deathEventId > event.id),
          'active assignment identity',
        );
        previous = row.id;
        if (event.type === 'work_changed') {
          same(row.before, activities.get(row.id), 'prior activity');
          activity(row.after as ResidentActivity, s);
          activities.set(row.id, row.after as ResidentActivity);
        } else {
          record(row.after, ['homeId', 'tile']);
          const after = row.after as { homeId: number | null; tile: number };
          integer(after.tile, 0, s.world.map.tiles.length - 1);
          if (after.homeId === null)
            requireLife(after.tile === s.world.settlement.center, 'historic unhoused place');
          else {
            integer(after.homeId, 1, s.world.entities.length);
            requireLife(
              availableHomes.has(after.homeId) &&
                s.world.entities[after.homeId - 1]!.tile === after.tile,
              'historic occupied home',
            );
          }
          same(row.before, homes.get(row.id), 'prior home');
          homes.set(row.id, after);
        }
      }
      same(
        event.effects[event.type === 'work_changed' ? 'activity' : 'home'],
        rows,
        'assignment effects',
      );
    }
  }
  requireLife(
    population === s.world.settlement.population && activities.size === people.size,
    'historic census',
  );
  for (const resident of s.world.residents) {
    same(resident.activity, activities.get(resident.id), 'current activity evidence');
    same(
      { homeId: resident.homeId, tile: resident.tile },
      homes.get(resident.id),
      'current home evidence',
    );
  }
}

function validatePeopleLedger(s: LivingSettlementState): NonNullable<EconomicValidation['ledger']> {
  const l = s.lastTick!;
  requireLife(l !== null && l.tick === s.tick, 'missing person ledger');
  const p = l.people;
  record(p, ['openingIds', 'caretakers', 'workers', 'health', 'deathTrials', 'birthTrials']);
  for (const collection of Object.values(p))
    requireLife(Array.isArray(collection), 'person ledger collections');
  const opening = s.world.residents.filter(
    (resident) =>
      resident.entryTick < s.tick &&
      (resident.deathEventId === null || s.events[resident.deathEventId - 1]!.tick >= s.tick),
  );
  same(
    p.openingIds,
    opening.map((resident) => resident.id),
    'opening identities',
  );
  same(
    p.health.map((entry) => entry.id),
    p.openingIds,
    'health identities',
  );
  const start = opening.map((resident, index) => ({
    ...resident,
    health: p.health[index]!.before,
    deathEventId: null,
  }));
  const previous = { ...s, tick: s.tick - 1, world: { ...s.world, residents: start } };
  const planned = planPersonWeek(previous);
  same(p.workers, planned.workers, 'eligible economic workers');
  same(p.caretakers, planned.caretakers, 'caregiver allocation');
  requireLife(
    l.opening.population === opening.length && l.opening.health === meanHealth(start),
    'opening population/health',
  );
  const care = new Map(
    planned.caretakers.flatMap((caretaker) =>
      caretaker.childIds.map((id) => [id, caretaker.id] as const),
    ),
  );
  const rotation = opening.length ? (s.tick - 1) % opening.length : 0;
  const rations = new Set(
    Array.from(
      { length: l.food.consumed },
      (_, index) => p.openingIds[(rotation + index) % opening.length],
    ),
  );
  const openingHuts = new Map<number, number>();
  for (const [index, health] of p.health.entries()) {
    record(health, ['id', 'before', 'after', 'homeId', 'ration', 'caregiverId']);
    integer(health.before, 0, 100);
    integer(health.after, 0, 100);
    const resident = opening[index]!;
    requireLife(
      health.ration === rations.has(resident.id) &&
        health.caregiverId === (care.get(resident.id) ?? null),
      'individual food/care',
    );
    if (health.homeId !== null) {
      const home = s.world.entities[health.homeId - 1];
      requireLife(
        home?.kind === 'hut' &&
          !s.events.some(
            (event) =>
              event.type === 'building_removed' &&
              event.tick < s.tick &&
              event.entityIds.includes(health.homeId!),
          ) &&
          (s.events[home.creationEventId - 1]!.type === 'founding' ||
            s.events.some(
              (event) =>
                event.type === 'construction_completed' &&
                event.tick < s.tick &&
                event.entityIds.includes(health.homeId!),
            )),
        'opening shelter',
      );
      const count = (openingHuts.get(home.id) ?? 0) + 1;
      requireLife(count <= 4, 'opening home capacity');
      openingHuts.set(home.id, count);
    }
    requireLife(
      health.after ===
        individualHealth(
          health.before,
          health.ration,
          health.homeId !== null,
          worldResidentAgeWeeks(resident, s.tick) <
            LIVING_CONFIG.residents.life.dependentAgeWeeks && health.caregiverId === null,
        ),
      'individual health accounting',
    );
    requireLife(resident.health === health.after, 'resident closing health');
  }
  const jobs: ResidentActivity[] = [];
  function add(role: ResidentActivity['role'], count: number, targetId: number | null = null) {
    for (let index = 0; index < count; index++) jobs.push({ role, targetId });
  }
  for (const id of l.labor.fields) add('fieldwork', 1, id);
  add('foraging', l.labor.foragers);
  for (const repair of l.repairs) add('repairing', 1, repair.id);
  add('building', l.labor.builders, l.construction?.id ?? null);
  add('gathering', l.labor.gatherers);
  add('resting', l.labor.unassigned);
  requireLife(jobs.length === p.workers.length, 'exclusive individual work');
  const assignments = new Map(p.workers.map((id, index) => [id, jobs[index]!]));
  for (const caretaker of p.caretakers)
    assignments.set(caretaker.id, { role: 'caretaking', targetId: caretaker.childIds[0]! });
  for (const resident of opening)
    same(
      resident.activity,
      assignments.get(resident.id) ?? { role: 'resting', targetId: null },
      'assigned work',
    );
  const afterFood = opening.length
    ? Math.floor(p.health.reduce((sum, entry) => sum + entry.after, 0) / opening.length)
    : 0;
  return {
    workforce: p.workers.length,
    healthAfterFood: afterFood,
    closingHealth: meanHealth(livingPeople(s)),
    demographics: () => validateDemographicLedger(s),
  };
}

function validateDemographicLedger(s: LivingSettlementState): void {
  const l = s.lastTick!,
    p = l.people,
    d = l.demographics,
    date = calendarAtTick(s.tick),
    E = LIVING_CONFIG.settlement.economy;
  const boundary = date.kind === 'week' && date.seasonBoundary;
  same(
    p.deathTrials.map((trial) => trial.id),
    boundary ? p.openingIds : [],
    'death trial ordering',
  );
  const dead = new Set<number>();
  for (const trial of p.deathTrials) {
    record(trial, ['id', 'ageWeeks', 'health', 'threshold', 'draw']);
    integer(trial.draw, 0, 999);
    const resident = s.world.residents.find((person) => person.id === trial.id)!;
    requireLife(
      trial.ageWeeks === worldResidentAgeWeeks(resident, s.tick) &&
        trial.health === p.health.find((entry) => entry.id === trial.id)!.after &&
        trial.threshold === individualDeathThreshold(trial.ageWeeks, trial.health),
      'individual death trial',
    );
    if (trial.draw < trial.threshold) dead.add(trial.id);
    requireLife(
      dead.has(trial.id) ===
        (resident.deathEventId !== null && s.events[resident.deathEventId - 1]!.tick === s.tick),
      'death trial outcome',
    );
  }
  const survivors = s.world.residents.filter(
    (resident) => p.openingIds.includes(resident.id) && !dead.has(resident.id),
  );
  const parents = survivors.filter((resident) =>
    eligibleParent(
      {
        ...resident,
        lastBirthTick: s.world.residents
          .filter((child) => child.entryTick < s.tick && child.parentIds.includes(resident.id))
          .reduce<number | null>(
            (latest, child) =>
              latest === null ? child.entryTick : Math.max(latest, child.entryTick),
            null,
          ),
      },
      s.tick,
    ),
  );
  const eligible =
    boundary &&
    parents.length > 0 &&
    l.food.deficit === 0 &&
    l.closing.food >= E.birthFoodWeeks * survivors.length;
  same(
    p.birthTrials.map((trial) => trial.parentId),
    eligible ? parents.map((parent) => parent.id) : [],
    'birth trial ordering',
  );
  let successes = 0,
    births = 0;
  const room = Math.max(0, l.closing.shelter - survivors.length);
  const born = new Set<number>();
  for (const trial of p.birthTrials) {
    record(trial, ['parentId', 'draw', 'childId']);
    integer(trial.draw, 0, 999);
    const success = trial.draw < E.birthThreshold;
    if (success) successes++;
    if (success && births < room) {
      const child = s.world.residents.find((resident) => resident.id === trial.childId);
      requireLife(
        child &&
          !born.has(child.id) &&
          child.entryTick === s.tick &&
          child.parentIds[0] === trial.parentId &&
          child.health === 100 &&
          child.activity === null,
        'birth trial outcome',
      );
      born.add(child.id);
      births++;
    } else requireLife(trial.childId === null, 'unrealized birth');
  }
  same(
    s.world.residents
      .filter((resident) => resident.entryTick === s.tick)
      .map((resident) => resident.id),
    [...born],
    'newborn identities',
  );
  requireLife(
    typeof d.birthEligible === 'boolean' &&
      d.birthEligible === eligible &&
      d.deathTrials === p.deathTrials.length &&
      d.deathThreshold === Math.max(0, ...p.deathTrials.map((trial) => trial.threshold)) &&
      d.deaths === dead.size &&
      d.birthTrials === p.birthTrials.length &&
      d.birthSuccesses === successes &&
      d.births === births,
    'individual demographic totals',
  );
}
