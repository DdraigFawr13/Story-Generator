import {
  admitTick,
  DEFAULT_HISTORY_LIMITS,
  historyLimitReason,
  type HistoryLimits,
} from './admission';
import { calendarAtTick, nextTick } from './clock';
import { capture } from './immutable';
import { uniform } from './rng';
import { SETTLEMENT_CONFIG, type SettlementConfig } from './settlement-config';
import { createSettlement } from './settlement-initial';
import {
  fieldYield,
  foodCapacity,
  inWorkRadius,
  rationHealth,
  settlementTotals,
  shelter,
  weatherKind,
  workforce,
  protectedForagers,
} from './settlement-math';
import { validateSettlementState } from './settlement-validation';
import type { BuildingKind } from './terrain';
import type {
  Building,
  EventType,
  JsonRecord,
  Repair,
  SettlementSnapshot,
  SettlementState,
  TickLedger,
} from './state';

export type WeekEmitter = (
  type: EventType,
  phase: number,
  facts: object,
  effects?: object,
  ids?: number[],
  tile?: number,
  causes?: number[],
  importance?: 'major' | 'ordinary' | 'minor',
) => number;
export type WeekDraw = (stream: 'weather' | 'demographics', range: number) => number;

// Trusted versioned mechanics only. The P1 public runner always uses its
// original rules; the P2 runner supplies individual accounting and validation.
export interface IndividualWeekPolicy {
  config: SettlementConfig;
  workforce: number;
  initialize(state: SettlementState, ledger: TickLedger): void;
  assignWork(
    state: SettlementState,
    ledger: TickLedger,
    repairs: Repair[],
    emit: WeekEmitter,
  ): void;
  health(state: SettlementState, ledger: TickLedger): void;
  demographics(state: SettlementState, ledger: TickLedger, emit: WeekEmitter, draw: WeekDraw): void;
  households(state: SettlementState, ledger: TickLedger, emit: WeekEmitter): void;
  validate(state: SettlementState): void;
}

// A pure candidate reducer. Callers supply a validated immutable snapshot and
// must admit the entire result before publishing it. Developer fixtures can
// inject valid phase inputs; production cannot inject weather or outcomes.
export function reduceSettlementWeek(
  committed: SettlementSnapshot,
  individual?: IndividualWeekPolicy,
): SettlementState {
  const E = (individual?.config ?? committed.config).economy;
  // Own every record we mutate. Frozen map/history records can be shared;
  // admission still isolates all newly produced mutable data.
  const s = {
    ...committed,
    rng: {
      ...committed.rng,
      terrain: { ...committed.rng.terrain },
      weather: { ...committed.rng.weather },
      demographics: { ...committed.rng.demographics },
    },
    allocators: { ...committed.allocators },
    world: {
      ...committed.world,
      settlement: { ...committed.world.settlement },
      buildings: committed.world.buildings.map((b) => ({ ...b })),
      entities: committed.world.entities.map((e) => ({ ...e })),
      project: committed.world.project ? { ...committed.world.project } : null,
    },
    events: [...committed.events],
  } as SettlementState;
  s.tick = nextTick(committed.tick);
  const calendar = calendarAtTick(s.tick);
  if (calendar.kind !== 'week') throw new Error('A candidate must be a completed week.');
  const seasonIndex = Math.floor((s.tick - 1) / SETTLEMENT_CONFIG.weeksPerSeason) % 4;
  const w = s.world,
    v = w.settlement;
  const opening = settlementTotals(committed);
  const ledger: TickLedger = {
    tick: s.tick,
    opening,
    labor: {
      workforce: individual?.workforce ?? workforce(opening.population, E),
      fields: [],
      foragers: 0,
      repairs: 0,
      builders: 0,
      gatherers: 0,
      unassigned: 0,
      unusedConstruction: 0,
    },
    production: { foraging: 0, harvest: 0, fields: [], gathered: 0, gathering: [] },
    food: { overflow: 0, consumed: 0, deficit: 0, spoilage: 0, demolitionOverflow: 0 },
    timber: { maintenance: 0, newEscrow: 0, completedEscrow: 0 },
    healthAfterFood: opening.health,
    repairs: [],
    construction: null,
    demographics: {
      deathTrials: 0,
      deathThreshold: 0,
      deaths: 0,
      birthEligible: false,
      birthTrials: 0,
      birthSuccesses: 0,
      births: 0,
    },
    closing: opening,
  };
  function emit(
    type: EventType,
    phase: number,
    facts: object,
    effects: object = {},
    ids: number[] = [],
    tile = v.center,
    causes: number[] = [],
    importance: 'major' | 'ordinary' | 'minor' = 'ordinary',
  ) {
    const id = s.allocators.event++;
    if (!Number.isSafeInteger(s.allocators.event)) throw new Error('Event IDs exhausted.');
    s.events.push({
      id,
      tick: s.tick,
      phase,
      type,
      settlementId: v.id,
      entityIds: [...new Set([v.id, ...ids])].sort((a, b) => a - b),
      location: { tile, x: tile % w.map.width, y: Math.floor(tile / w.map.width) },
      causes: [...new Set(causes)].sort((a, b) => a - b),
      facts: facts as JsonRecord,
      effects: effects as JsonRecord,
      importance,
    });
    return id;
  }
  function draw(stream: 'weather' | 'demographics', range: number) {
    const result = uniform(s.rng[stream].state, range);
    s.rng[stream].state = result.state;
    return result.value;
  }
  function loss(phase: 4 | 6, reason: string, amount: number, causes: number[] = []) {
    if (amount <= 0) return;
    const before = v.food;
    v.food -= amount;
    emit(
      'food_overflow',
      phase,
      { reason, amount, capacity: phase === 4 ? opening.capacity : foodCapacity(w.buildings) },
      { food: { before, after: v.food } },
      [],
      v.center,
      causes,
    );
  }

  individual?.initialize(s, ledger);

  // 1. Environment. Extinct settlements retain seasonal weather and history.
  if (calendar.week === 1) {
    const kind = weatherKind(draw('weather', E.weatherRange), E);
    const weather = { kind, multiplier: E.weatherMultipliers[kind], startTick: s.tick };
    w.currentWeather = weather;
    w.currentWeatherEventId = emit('weather', 1, {
      ...weather,
      year: calendar.year,
      season: calendar.season,
    });
  }
  const weather = w.currentWeather!;

  // 2. Reserve exclusive labor and opening materials; no mid-tick reassignment.
  let remaining = ledger.labor.workforce;
  const fields = w.buildings.filter((b) => b.kind === 'field');
  const protectedCount = Math.min(
    ledger.labor.workforce,
    protectedForagers(opening.population, opening.food, E),
  );
  ledger.labor.fields =
    E.seasonMultipliers[seasonIndex] === 0
      ? []
      : fields.slice(0, Math.max(0, remaining - protectedCount)).map((b) => b.id);
  remaining -= ledger.labor.fields.length;
  ledger.labor.foragers = Math.min(remaining, Math.ceil(opening.population / E.foragerDivisor));
  remaining -= ledger.labor.foragers;
  let availableTimber = opening.timber;
  const planned = w.buildings
    .filter((b) => b.kind !== 'field')
    .map((b) => ({ id: b.id, durability: b.durability! }));
  const repairs: Repair[] = [];
  while (repairs.length < E.maxRepairWorkers && remaining > 0 && availableTimber > 0) {
    const target = planned
      .filter((b) => b.durability <= E.repairThreshold)
      .sort((a, b) => a.durability - b.durability || a.id - b.id)[0];
    if (!target) break;
    const before = target.durability;
    target.durability = Math.min(100, before + E.repairAmount);
    repairs.push({ id: target.id, before, after: target.durability });
    remaining--;
    availableTimber--;
  }
  ledger.labor.repairs = repairs.length;
  const occupied = new Set([
    ...w.buildings.map((b) => b.tile),
    ...(w.project ? [w.project.tile] : []),
  ]);
  function projectSite(kind: BuildingKind): number | null {
    for (let tile = 0; tile < w.map.tiles.length; tile++) {
      const ground = w.map.tiles[tile]!;
      if (
        !occupied.has(tile) &&
        inWorkRadius(tile, v.center) &&
        ground[2] === 'grass' &&
        ground[3] === 0 &&
        (kind !== 'field' || ground[1] >= SETTLEMENT_CONFIG.terrain.fieldMinFertility)
      )
        return tile;
    }
    return null;
  }
  if (opening.population > 0 && remaining > 0) {
    if (w.project === null) {
      const needs: readonly [BuildingKind, boolean][] = [
        ['hut', opening.shelter < opening.population + E.hutReserve],
        ['field', fields.length < Math.ceil(opening.population / E.fieldPopulationDivisor)],
        [
          'store',
          opening.food >=
            Math.floor(
              (E.storeThresholdNumerator * opening.capacity) / E.storeThresholdDenominator,
            ),
        ],
      ];
      for (const [kind, needed] of needs) {
        const cost = E.construction[kind];
        if (!needed || availableTimber < cost.timber) continue;
        const tile = projectSite(kind);
        if (tile === null) continue;
        const id = s.allocators.entity++;
        if (!Number.isSafeInteger(s.allocators.entity)) throw new Error('Entity IDs exhausted.');
        const before = v.timber;
        v.timber -= cost.timber;
        ledger.timber.newEscrow = cost.timber;
        availableTimber -= cost.timber;
        const startEventId = emit(
          'construction_started',
          2,
          {
            kind,
            cost: cost.timber,
            requiredLabor: cost.labor,
            population: opening.population,
            shelter: opening.shelter,
            fields: fields.length,
            food: opening.food,
            capacity: opening.capacity,
          },
          { timber: { before, after: v.timber }, escrow: { before: 0, after: cost.timber } },
          [id],
          tile,
        );
        w.project = {
          id,
          kind,
          tile,
          progress: 0,
          requiredLabor: cost.labor,
          escrow: cost.timber,
          startEventId,
        };
        w.entities.push({ id, kind, tile, creationEventId: startEventId, retired: false });
        occupied.add(tile);
        break;
      }
    }
    if (w.project) {
      ledger.labor.builders = Math.min(remaining, E.maxBuilders);
      remaining -= ledger.labor.builders;
    }
  }
  const forest = w.map.tiles.flatMap((ground, tile) =>
    ground[3] > 0 && !occupied.has(tile) && inWorkRadius(tile, v.center) ? [tile] : [],
  );
  if (forest.length > 0) {
    ledger.labor.gatherers = Math.min(remaining, E.maxGatherers);
    remaining -= ledger.labor.gatherers;
  }
  ledger.labor.unassigned = remaining;
  individual?.assignWork(s, ledger, repairs, emit);

  // 3. Work and production. Later completions cannot participate this week.
  for (const field of fields)
    if (ledger.labor.fields.includes(field.id))
      field.tendedWeeks = Math.min(12, field.tendedWeeks + 1);
  ledger.production.foraging = ledger.labor.foragers * E.foodPerForager[seasonIndex]!;
  let allowance = ledger.labor.gatherers * E.timberPerGatherer;
  if (allowance > 0) w.map = { ...w.map, tiles: [...w.map.tiles] };
  for (const tile of forest) {
    if (allowance === 0) break;
    const ground = w.map.tiles[tile]!;
    const amount = Math.min(ground[3], allowance);
    w.map.tiles[tile] = [ground[0], ground[1], ground[2], ground[3] - amount];
    allowance -= amount;
    ledger.production.gathered += amount;
    ledger.production.gathering.push({ tile, before: ground[3], after: ground[3] - amount });
  }
  v.timber += ledger.production.gathered;
  if (calendar.seasonBoundary) {
    ledger.production.fields = fields.map((b) => {
      const input = { id: b.id, fertility: w.map.tiles[b.tile]![1], tendedWeeks: b.tendedWeeks };
      return { ...input, yield: fieldYield(input, weather.multiplier, seasonIndex, E) };
    });
    ledger.production.harvest = ledger.production.fields.reduce((sum, b) => sum + b.yield, 0);
    const before = v.food + ledger.production.foraging;
    emit(
      'harvest',
      3,
      {
        season: calendar.season,
        weather: weather.kind,
        weatherMultiplier: weather.multiplier,
        seasonMultiplier: E.seasonMultipliers[seasonIndex],
        fields: ledger.production.fields,
        total: ledger.production.harvest,
      },
      { food: { before, after: before + ledger.production.harvest } },
      fields.map((b) => b.id),
      v.center,
      [w.currentWeatherEventId!, ...fields.map((b) => b.creationEventId)],
    );
    for (const field of fields) field.tendedWeeks = 0;
  }
  v.food += ledger.production.foraging + ledger.production.harvest;

  // 4–5. Capacity, rations and health use opening population/shelter.
  ledger.food.overflow = Math.max(0, v.food - opening.capacity);
  loss(4, 'production', ledger.food.overflow);
  ledger.food.consumed = Math.min(v.food, opening.population);
  v.food -= ledger.food.consumed;
  ledger.food.deficit = opening.population - ledger.food.consumed;
  if (calendar.seasonBoundary) {
    ledger.food.spoilage = Math.floor(v.food / E.spoilageDivisor);
    if (ledger.food.spoilage > 0) {
      const before = v.food;
      v.food -= ledger.food.spoilage;
      emit(
        'food_spoilage',
        4,
        { amount: ledger.food.spoilage },
        { food: { before, after: v.food } },
      );
    }
  }
  if (individual) individual.health(s, ledger);
  else
    v.health = rationHealth(
      opening.population,
      opening.health,
      ledger.food.deficit,
      opening.shelter,
    );
  ledger.healthAfterFood = v.health;

  // 6. Reserved repairs, construction and seasonal decay/removal.
  if (repairs.length > 0) {
    const before = v.timber;
    v.timber -= repairs.length;
    ledger.repairs = repairs;
    ledger.timber.maintenance = repairs.length;
    for (const repair of repairs)
      w.buildings.find((b) => b.id === repair.id)!.durability = repair.after;
    emit(
      'maintenance',
      6,
      { workers: repairs.length, timberSpent: repairs.length, repairs },
      { timber: { before, after: v.timber }, durability: repairs },
      repairs.map((r) => r.id),
    );
  }
  if (w.project && ledger.labor.builders > 0) {
    const p = w.project,
      before = p.progress;
    const worked = Math.min(ledger.labor.builders, p.requiredLabor - p.progress);
    p.progress += worked;
    const completed = p.progress === p.requiredLabor;
    ledger.construction = { id: p.id, before, after: p.progress, worked, completed };
    ledger.labor.unusedConstruction = ledger.labor.builders - worked;
    if (completed) {
      const building: Building = {
        id: p.id,
        kind: p.kind,
        tile: p.tile,
        status: 'completed',
        creationEventId: 0,
        durability: p.kind === 'field' ? null : 100,
        tendedWeeks: 0,
      };
      const beforeShelter = shelter(w.buildings),
        beforeCapacity = foodCapacity(w.buildings);
      w.buildings.push(building);
      w.buildings.sort((a, b) => a.id - b.id);
      building.creationEventId = emit(
        'construction_completed',
        6,
        { kind: p.kind, worked, requiredLabor: p.requiredLabor, escrowBurned: p.escrow },
        {
          escrow: { before: p.escrow, after: 0 },
          shelter: { before: beforeShelter, after: shelter(w.buildings) },
          capacity: { before: beforeCapacity, after: foodCapacity(w.buildings) },
        },
        [p.id],
        p.tile,
        [p.startEventId],
      );
      ledger.timber.completedEscrow = p.escrow;
      w.project = null;
    }
  }
  if (calendar.seasonBoundary) {
    const decayed = w.buildings
      .filter((b) => b.kind !== 'field')
      .map((b) => {
        const before = b.durability!;
        b.durability = before - E.seasonalDecay;
        return { id: b.id, before, after: b.durability };
      });
    const decayId =
      decayed.length > 0
        ? emit(
            'building_decay',
            6,
            { buildings: decayed },
            { durability: decayed },
            decayed.map((b) => b.id),
            v.center,
            [],
            'minor',
          )
        : null;
    for (const b of [...w.buildings])
      if (b.durability === 0) {
        const beforeShelter = shelter(w.buildings),
          beforeCapacity = foodCapacity(w.buildings);
        w.buildings = w.buildings.filter((item) => item.id !== b.id);
        w.entities[b.id - 1]!.retired = true;
        const removedId = emit(
          'building_removed',
          6,
          { kind: b.kind, durability: 0 },
          {
            shelter: { before: beforeShelter, after: shelter(w.buildings) },
            capacity: { before: beforeCapacity, after: foodCapacity(w.buildings) },
          },
          [b.id],
          b.tile,
          [b.creationEventId, decayId!],
        );
        const overflow = Math.max(0, v.food - foodCapacity(w.buildings));
        ledger.food.demolitionOverflow += overflow;
        loss(6, 'demolition', overflow, [removedId]);
      }
  }

  // 7. All death draws precede conditionally consumed birth draws.
  if (individual) {
    individual.demographics(s, ledger, emit, draw);
    individual.households(s, ledger, emit);
  } else {
    const d = ledger.demographics;
    d.deathThreshold = E.baseDeathThreshold + Math.floor((100 - v.health) / E.deathHealthDivisor);
    if (calendar.seasonBoundary && opening.population > 0) {
      d.deathTrials = opening.population;
      for (let i = 0; i < opening.population; i++)
        if (draw('demographics', E.demographicRange) < d.deathThreshold) d.deaths++;
      v.population = opening.population - d.deaths;
      const deathEventId =
        d.deaths > 0
          ? emit(
              'deaths',
              7,
              {
                count: d.deaths,
                openingPopulation: opening.population,
                health: v.health,
                shortfall: ledger.food.deficit,
                openingShelter: opening.shelter,
                threshold: d.deathThreshold,
                trials: d.deathTrials,
              },
              { population: { before: opening.population, after: v.population } },
              [],
              v.center,
              [],
              'major',
            )
          : null;
      const survivors = v.population;
      d.birthEligible =
        survivors > 0 &&
        v.health >= E.birthHealth &&
        ledger.food.deficit === 0 &&
        v.food >= E.birthFoodWeeks * survivors;
      if (d.birthEligible) {
        d.birthTrials = survivors;
        for (let i = 0; i < survivors; i++)
          if (draw('demographics', E.demographicRange) < E.birthThreshold) d.birthSuccesses++;
        d.births = Math.min(d.birthSuccesses, Math.max(0, shelter(w.buildings) - survivors));
        v.population += d.births;
        if (d.births > 0)
          emit(
            'births',
            7,
            {
              count: d.births,
              survivors,
              health: v.health,
              food: v.food,
              shortfall: ledger.food.deficit,
              shelter: shelter(w.buildings),
              trials: d.birthTrials,
              successes: d.birthSuccesses,
            },
            { population: { before: survivors, after: v.population } },
            [],
            v.center,
            [],
            'major',
          );
      }
      if (v.population === 0) {
        const abandoned = w.buildings
          .filter((b) => b.kind === 'field' && b.tendedWeeks > 0)
          .map((b) => ({ id: b.id, tendedWeeks: b.tendedWeeks }));
        for (const field of w.buildings.filter((b) => b.kind === 'field')) field.tendedWeeks = 0;
        const before = v.health;
        v.health = 0;
        v.shortage = false;
        v.surplus = false;
        emit(
          'extinction',
          7,
          { population: 0, abandonedCropWork: abandoned, unfinishedProject: w.project },
          {
            health: { before, after: 0 },
            shortage: { before: committed.world.settlement.shortage, after: false },
            surplus: { before: committed.world.settlement.surplus, after: false },
          },
          abandoned.map((b) => b.id),
          v.center,
          [deathEventId!],
          'major',
        );
      }
    }
    v.households = Math.ceil(v.population / SETTLEMENT_CONFIG.peoplePerHousehold);
  }

  // 8. Transition evidence follows demographics and never becomes a forward cause.
  if (v.population > 0) {
    const shortage = ledger.food.deficit > 0;
    if (shortage !== v.shortage)
      emit(
        shortage ? 'shortage_started' : 'shortage_recovered',
        8,
        {
          openingDemand: opening.population,
          consumed: ledger.food.consumed,
          shortfall: ledger.food.deficit,
        },
        { shortage: { before: v.shortage, after: shortage } },
        [],
        v.center,
        [],
        'major',
      );
    v.shortage = shortage;
    const threshold = E.surplusFoodWeeks * v.population,
      surplus = v.food >= threshold;
    if (surplus !== v.surplus)
      emit(
        surplus ? 'surplus_started' : 'surplus_ended',
        8,
        { food: v.food, population: v.population, threshold },
        { surplus: { before: v.surplus, after: surplus } },
        [],
        v.center,
        [],
        'ordinary',
      );
    v.surplus = surplus;
  }
  ledger.closing = settlementTotals(s);
  s.lastTick = ledger;
  if (individual) individual.validate(s);
  else validateSettlementState(s);
  return s;
}

export function advanceSettlement(
  initial: SettlementSnapshot,
  count: number,
  limits: HistoryLimits = DEFAULT_HISTORY_LIMITS,
) {
  validateSettlementState(initial);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid tick count.');
  const reason = historyLimitReason(initial, limits);
  if (reason) throw new Error(`Initial state exceeds ${reason}.`);
  let state = capture<SettlementState>(initial as SettlementState),
    advanced = 0;
  for (; advanced < count; advanced++) {
    const result = admitTick<SettlementState>(state, reduceSettlementWeek(state), limits);
    if (result.rejected) return { state, advanced, halted: result.rejected };
    state = result.state;
  }
  return { state, advanced, halted: null };
}
export function simulateSettlement(
  seed: string,
  count: number,
  limits: HistoryLimits = DEFAULT_HISTORY_LIMITS,
) {
  return advanceSettlement(createSettlement(seed), count, limits);
}
