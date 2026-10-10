import { calendarAtTick } from './clock';
import {
  livingPeople,
  planPersonWeek,
  individualHealth,
  meanHealth,
  individualDeathThreshold,
  eligibleParent,
} from './living-people';
import type {
  ActivityRole,
  LivingResident,
  LivingSettlementSnapshot,
  LivingSettlementState,
  ResidentActivity,
} from './living-state';
import { RESIDENT_CONFIG } from './resident-config';
import { worldResidentAgeWeeks } from './resident-world';
import { uniform } from './rng';
import { shelter } from './settlement-math';
import type { IndividualWeekPolicy, WeekEmitter } from './settlement';
import type { SettlementState, TickLedger } from './state';

// Casts stay at this trusted bridge: the economic kernel owns common records,
// and this version owns the additional people records and their direct validator.
export function individualWeekPolicy(
  initial: LivingSettlementSnapshot,
  validate: (value: unknown) => void,
): IndividualWeekPolicy {
  const people = planPersonWeek(initial);
  function state(value: SettlementState) {
    return value as unknown as LivingSettlementState;
  }
  function ledger(value: TickLedger) {
    return value as LivingSettlementState['lastTick'] & {};
  }
  return {
    config: initial.config.settlement,
    workforce: people.workers.length,
    initialize(value, accounting) {
      const s = state(value);
      s.rng.residents = { ...initial.rng.residents };
      s.world.residents = initial.world.residents.map((resident) => ({
        ...resident,
        parentIds: [...resident.parentIds],
        traits: { ...resident.traits },
        activity: resident.activity ? { ...resident.activity } : null,
      }));
      s.world.households = initial.world.households.map((household) => ({ ...household }));
      ledger(accounting).people = people;
    },
    assignWork(value, accounting, repairs, emit) {
      const s = state(value),
        a = accounting.labor;
      const jobs: ResidentActivity[] = [];
      function add(role: ActivityRole, count: number, targetId: number | null = null) {
        for (let i = 0; i < count; i++) jobs.push({ role, targetId });
      }
      for (const id of a.fields) add('fieldwork', 1, id);
      add('foraging', a.foragers);
      for (const repair of repairs) add('repairing', 1, repair.id);
      add('building', a.builders, s.world.project?.id ?? null);
      add('gathering', a.gatherers);
      add('resting', a.unassigned);
      const assigned = new Map(people.workers.map((id, index) => [id, jobs[index]!]));
      for (const caretaker of people.caretakers)
        assigned.set(caretaker.id, { role: 'caretaking', targetId: caretaker.childIds[0]! });
      const changes = [];
      for (const resident of s.world.residents) {
        if (resident.deathEventId !== null) continue;
        const after = assigned.get(resident.id) ?? { role: 'resting' as const, targetId: null };
        if (
          resident.activity?.role !== after.role ||
          resident.activity?.targetId !== after.targetId
        )
          changes.push({ id: resident.id, before: resident.activity, after });
        resident.activity = { ...after };
      }
      if (changes.length)
        emit(
          'work_changed',
          2,
          { count: changes.length, assignments: changes },
          { activity: changes },
          changes.map((change) => change.id),
          s.world.settlement.center,
          [
            ...new Set(
              changes.flatMap((change) =>
                change.after.targetId === null
                  ? []
                  : [s.world.entities[change.after.targetId - 1]!.creationEventId],
              ),
            ),
          ],
        );
    },
    health(value, accounting) {
      const s = state(value),
        l = ledger(accounting);
      const rotation = people.openingIds.length ? (s.tick - 1) % people.openingIds.length : 0;
      const fed = new Set(
        Array.from(
          { length: l.food.consumed },
          (_, index) => people.openingIds[(rotation + index) % people.openingIds.length]!,
        ),
      );
      const care = new Map(
        people.caretakers.flatMap((caretaker) =>
          caretaker.childIds.map((id) => [id, caretaker.id] as const),
        ),
      );
      for (const resident of s.world.residents) {
        if (resident.deathEventId !== null) continue;
        const before = resident.health,
          ration = fed.has(resident.id),
          caregiverId = care.get(resident.id) ?? null;
        resident.health = individualHealth(
          before,
          ration,
          resident.homeId !== null,
          worldResidentAgeWeeks(resident, s.tick) < s.config.residents.life.dependentAgeWeeks &&
            caregiverId === null,
        );
        l.people.health.push({
          id: resident.id,
          before,
          after: resident.health,
          homeId: resident.homeId,
          ration,
          caregiverId,
        });
      }
      s.world.settlement.health = meanHealth(livingPeople(s));
    },
    demographics(value, accounting, emit, draw) {
      const s = state(value),
        l = ledger(accounting),
        d = l.demographics,
        v = s.world.settlement,
        E = s.config.settlement.economy;
      const date = calendarAtTick(s.tick);
      if (date.kind !== 'week' || !date.seasonBoundary) return;
      const opening = livingPeople(s);
      const dead: LivingResident[] = [];
      for (const person of opening) {
        const resident = s.world.residents.find((candidate) => candidate.id === person.id)!;
        const ageWeeks = worldResidentAgeWeeks(resident, s.tick),
          threshold = individualDeathThreshold(ageWeeks, resident.health),
          result = draw('demographics', E.demographicRange);
        l.people.deathTrials.push({
          id: resident.id,
          ageWeeks,
          health: resident.health,
          threshold,
          draw: result,
        });
        if (result < threshold) dead.push(resident);
      }
      d.deathTrials = opening.length;
      d.deathThreshold = Math.max(0, ...l.people.deathTrials.map((trial) => trial.threshold));
      d.deaths = dead.length;
      v.population -= d.deaths;
      let deathEventId: number | null = null;
      if (dead.length) {
        const records = l.people.deathTrials
          .filter((trial) => dead.some((resident) => resident.id === trial.id))
          .map((trial) => ({
            ...trial,
            ...l.people.health.find((entry) => entry.id === trial.id),
          }));
        deathEventId = emit(
          'deaths',
          7,
          {
            count: dead.length,
            openingPopulation: opening.length,
            health: v.health,
            shortfall: l.food.deficit,
            openingShelter: l.opening.shelter,
            threshold: d.deathThreshold,
            trials: d.deathTrials,
            residents: records,
          },
          { population: { before: opening.length, after: v.population } },
          dead.map((resident) => resident.id),
          v.center,
          dead.map((resident) => resident.creationEventId),
          'major',
        );
        for (const resident of dead) {
          resident.deathEventId = deathEventId;
          s.world.entities[resident.id - 1]!.retired = true;
        }
      }
      const survivors = livingPeople(s),
        parents = survivors.filter((resident) => eligibleParent(resident, s.tick));
      v.health = meanHealth(survivors);
      d.birthEligible =
        parents.length > 0 && l.food.deficit === 0 && v.food >= E.birthFoodWeeks * survivors.length;
      const children: LivingResident[] = [];
      const room = Math.max(0, shelter(s.world.buildings) - survivors.length);
      if (d.birthEligible) {
        d.birthTrials = parents.length;
        for (const person of parents) {
          const parent = s.world.residents.find((resident) => resident.id === person.id)!;
          const result = draw('demographics', E.demographicRange);
          let child: LivingResident | null = null;
          if (result < E.birthThreshold) {
            d.birthSuccesses++;
            if (children.length < room) {
              child = newborn(s, parent, children);
              children.push(child);
              parent.lastBirthTick = s.tick;
            }
          }
          l.people.birthTrials.push({
            parentId: parent.id,
            draw: result,
            childId: child?.id ?? null,
          });
        }
      }
      d.births = children.length;
      if (children.length) {
        const records = children.map((child) => ({
          id: child.id,
          givenName: child.givenName,
          householdName: child.householdName,
          householdId: child.householdId,
          parentIds: child.parentIds,
          tile: child.tile,
          traits: child.traits,
        }));
        const id = emit(
          'births',
          7,
          {
            count: children.length,
            survivors: survivors.length,
            health: v.health,
            food: v.food,
            shortfall: l.food.deficit,
            shelter: shelter(s.world.buildings),
            trials: d.birthTrials,
            successes: d.birthSuccesses,
            residents: records,
          },
          { population: { before: survivors.length, after: survivors.length + children.length } },
          children.flatMap((child) => [child.id, ...child.parentIds]),
          v.center,
          children.flatMap((child) =>
            child.parentIds.map(
              (parentId) =>
                s.world.residents.find((parent) => parent.id === parentId)!.creationEventId,
            ),
          ),
          'major',
        );
        for (const child of children) {
          child.creationEventId = id;
          child.birthEventId = id;
          s.world.residents.push(child);
          s.world.entities.push({
            id: child.id,
            kind: 'resident',
            tile: child.tile,
            creationEventId: id,
            retired: false,
          });
        }
        // Construction and births share one monotonically allocated registry.
        s.world.entities.sort((a, b) => a.id - b.id);
        v.population += children.length;
      }
      v.health = meanHealth(livingPeople(s));
      if (v.population === 0 && opening.length > 0)
        extinct(s, initial, emit, deathEventId!, l.healthAfterFood);
    },
    households(value, _accounting, emit) {
      const s = state(value),
        people = livingPeople(s),
        huts = s.world.buildings.filter((building) => building.kind === 'hut');
      const capacity = new Map<number, number>(
        huts.map((hut) => [hut.id, s.config.settlement.hutCapacity]),
      );
      const assignments = new Map<number, number | null>();
      for (const resident of people) {
        const home = resident.homeId;
        if (home !== null && (capacity.get(home) ?? 0) > 0) {
          assignments.set(resident.id, home);
          capacity.set(home, capacity.get(home)! - 1);
        }
      }
      const changes = [];
      for (const person of people) {
        const resident = s.world.residents.find((candidate) => candidate.id === person.id)!;
        let home = assignments.get(resident.id) ?? null;
        if (home === null) {
          const hut = huts.find((candidate) => capacity.get(candidate.id)! > 0);
          if (hut) {
            home = hut.id;
            capacity.set(home, capacity.get(home)! - 1);
          }
        }
        const tile =
          home === null ? s.world.settlement.center : huts.find((hut) => hut.id === home)!.tile;
        if (home !== resident.homeId || tile !== resident.tile)
          changes.push({
            id: resident.id,
            before: { homeId: resident.homeId, tile: resident.tile },
            after: { homeId: home, tile },
          });
        resident.homeId = home;
        resident.tile = tile;
      }
      if (changes.length)
        emit(
          'home_changed',
          7,
          { count: changes.length, assignments: changes },
          { home: changes },
          changes.map((change) => change.id),
          s.world.settlement.center,
          [
            ...s.events
              .filter(
                (event) =>
                  event.tick === s.tick &&
                  (event.type === 'building_removed' || event.type === 'births'),
              )
              .map((event) => event.id),
            ...changes.flatMap((change) =>
              change.after.homeId === null
                ? []
                : [huts.find((hut) => hut.id === change.after.homeId)!.creationEventId],
            ),
          ],
        );
      for (const household of s.world.households) {
        const members = livingPeople(s).filter((resident) => resident.householdId === household.id);
        const housed = members.find((resident) => resident.homeId !== null);
        household.homeId = housed?.homeId ?? null;
        household.tile = housed?.tile ?? s.world.settlement.center;
        s.world.entities[household.id - 1]!.retired = members.length === 0;
      }
      s.world.settlement.households = new Set(people.map((resident) => resident.householdId)).size;
      s.world.settlement.population = people.length;
      s.world.settlement.health = meanHealth(people);
    },
    validate,
  };
}

function newborn(
  s: LivingSettlementState,
  parent: LivingResident,
  pending: LivingResident[],
): LivingResident {
  let available = RESIDENT_CONFIG.givenNames.filter(
    (name) =>
      ![...s.world.residents, ...pending].some(
        (resident) =>
          resident.deathEventId === null &&
          resident.householdId === parent.householdId &&
          resident.givenName === name,
      ),
  );
  if (!available.length) available = [...RESIDENT_CONFIG.givenNames];
  function draw(range: number) {
    const result = uniform(s.rng.residents.state, range);
    s.rng.residents.state = result.state;
    return result.value;
  }
  const id = s.allocators.entity++;
  if (!Number.isSafeInteger(s.allocators.entity)) throw new Error('Entity IDs exhausted.');
  return {
    id,
    givenName: available[draw(available.length)]!,
    householdName: parent.householdName,
    householdId: parent.householdId,
    homeId: null,
    tile: parent.tile,
    entryTick: s.tick,
    ageWeeksAtEntry: 0,
    creationEventId: 0,
    birthEventId: null,
    deathEventId: null,
    health: 100,
    profession: 'unassigned',
    parentIds: [parent.id],
    traits: { sociability: draw(101), caution: draw(101), persistence: draw(101) },
    activity: null,
    lastBirthTick: null,
  };
}

function extinct(
  s: LivingSettlementState,
  initial: LivingSettlementSnapshot,
  emit: WeekEmitter,
  deathId: number,
  healthBefore: number,
) {
  const abandoned = s.world.buildings
    .filter((building) => building.kind === 'field' && building.tendedWeeks > 0)
    .map((building) => ({ id: building.id, tendedWeeks: building.tendedWeeks }));
  for (const field of s.world.buildings.filter((building) => building.kind === 'field'))
    field.tendedWeeks = 0;
  const v = s.world.settlement;
  v.health = 0;
  v.shortage = false;
  v.surplus = false;
  emit(
    'extinction',
    7,
    { population: 0, abandonedCropWork: abandoned, unfinishedProject: s.world.project },
    {
      health: { before: healthBefore, after: 0 },
      shortage: { before: initial.world.settlement.shortage, after: false },
      surplus: { before: initial.world.settlement.surplus, after: false },
    },
    abandoned.map((field) => field.id),
    v.center,
    [deathId],
    'major',
  );
}
