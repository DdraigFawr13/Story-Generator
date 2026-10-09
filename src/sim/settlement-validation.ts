import { validateArchive } from './admission';
import { canonicalJson, isImmutableCanonical } from './canonical';
import { calendarAtTick } from './clock';
import { RNG_ALGORITHM, validateRngState } from './rng';
import { validateSeed } from './seed';
import { SETTLEMENT_CONFIG, SETTLEMENT_VERSION } from './settlement-config';
import { fieldYield, foodCapacity, inWorkRadius, rationHealth, shelter } from './settlement-math';
import { EVENT_FIELDS, EVENT_PHASES, type SettlementState } from './state';
import { validateTiles } from './terrain';

const CONFIG = canonicalJson(SETTLEMENT_CONFIG);
const E = SETTLEMENT_CONFIG.economy;
const validatedMaps = new WeakSet<object>();
const validatedEvents = new WeakSet<object>();
function requireState(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid settlement state: ${message}`);
}
function integer(value: number, min = 0, max = Number.MAX_SAFE_INTEGER): void {
  requireState(Number.isSafeInteger(value) && value >= min && value <= max, 'integer bounds');
}
function keys(value: object, names: string[]): void {
  requireState(Object.keys(value).sort().join(',') === names.sort().join(','), 'record shape');
}

// Validate saved state directly. Do not regenerate a running world from its seed.
export function validateSettlementState(value: unknown): asserts value is SettlementState {
  canonicalJson(value);
  const s = value as SettlementState;
  keys(s, [
    'schemaVersion',
    'simulationVersion',
    'rulesVersion',
    'config',
    'seed',
    'tick',
    'rng',
    'allocators',
    'world',
    'events',
    'lastTick',
  ]);
  requireState(
    s.schemaVersion === 2 &&
      s.simulationVersion === SETTLEMENT_VERSION &&
      s.rulesVersion === SETTLEMENT_VERSION,
    'unsupported version',
  );
  requireState(canonicalJson(s.config) === CONFIG, 'unsupported configuration');
  validateSeed(s.seed);
  validateArchive(s);
  keys(s.rng, ['terrain', 'weather', 'demographics']);
  for (const stream of Object.values(s.rng)) {
    keys(stream, ['algorithm', 'state']);
    requireState(stream.algorithm === RNG_ALGORITHM, 'RNG algorithm');
    validateRngState(stream.state);
  }
  keys(s.allocators, ['entity', 'event']);
  integer(s.allocators.entity, 2);
  integer(s.allocators.event, 2);
  requireState(s.allocators.event === s.events.length + 1, 'event allocator');
  const w = s.world,
    m = w.map,
    v = w.settlement;
  keys(w, [
    'map',
    'settlement',
    'buildings',
    'project',
    'currentWeather',
    'currentWeatherEventId',
    'entities',
  ]);
  if (!validatedMaps.has(m)) {
    keys(m, ['width', 'height', 'river', 'tiles']);
    requireState(m.width === 64 && m.height === 40 && m.river.length === 40, 'map dimensions');
    validateTiles(m.tiles);
    for (let y = 0; y < m.height; y++) {
      integer(m.river[y]!, 3, 60);
      if (y > 0) requireState(Math.abs(m.river[y]! - m.river[y - 1]!) <= 1, 'disconnected river');
      for (let x = 0; x < m.width; x++) {
        const expectedWater = Math.abs(x - m.river[y]!) <= 1;
        requireState(
          (m.tiles[y * m.width + x]![2] === 'water') === expectedWater,
          'river metadata',
        );
      }
    }
    if (isImmutableCanonical(m)) validatedMaps.add(m);
  }
  keys(v, [
    'id',
    'center',
    'name',
    'population',
    'households',
    'health',
    'food',
    'timber',
    'shortage',
    'surplus',
  ]);
  requireState(v.id === 1, 'settlement identity');
  integer(v.center, 0, m.tiles.length - 1);
  const cx = v.center % m.width,
    cy = Math.floor(v.center / m.width);
  requireState(
    cx >= 8 && cx <= 55 && cy >= 8 && cy <= 31 && m.tiles[v.center]![2] === 'grass',
    'settlement center',
  );
  requireState(v.name === `Settlement ${cx}-${cy}`, 'settlement name');
  integer(v.population, 0, m.tiles.length * SETTLEMENT_CONFIG.hutCapacity);
  integer(v.households);
  integer(v.health, 0, 100);
  integer(v.food);
  integer(v.timber);
  requireState(
    v.households === Math.ceil(v.population / SETTLEMENT_CONFIG.peoplePerHousehold),
    'household count',
  );
  requireState(
    typeof v.shortage === 'boolean' && typeof v.surplus === 'boolean',
    'transition flags',
  );
  requireState(v.food <= foodCapacity(w.buildings), 'food capacity');
  requireState(w.entities.length === s.allocators.entity - 1, 'entity allocator');
  const identities = new Map(w.entities.map((e) => [e.id, e]));
  for (const [index, entity] of w.entities.entries()) {
    keys(entity, ['id', 'kind', 'tile', 'creationEventId', 'retired']);
    requireState(entity.id === index + 1 && typeof entity.retired === 'boolean', 'entity ordering');
    integer(entity.tile, 0, m.tiles.length - 1);
    integer(entity.creationEventId, 1, s.events.length);
    requireState(
      index === 0
        ? entity.kind === 'settlement' && entity.tile === v.center && !entity.retired
        : ['hut', 'field', 'store'].includes(entity.kind),
      'entity type',
    );
    const created = s.events[entity.creationEventId - 1]!;
    requireState(
      (created.type === 'founding' || created.type === 'construction_started') &&
        created.entityIds.includes(entity.id),
      'entity creation reference',
    );
    if (created.type === 'construction_started')
      requireState(created.location.tile === entity.tile, 'creation location');
  }
  requireState(s.events[0]?.type === 'founding' && s.events[0].tick === 0, 'founding record');
  let phase = 0,
    tick = 0;
  for (const event of s.events) {
    requireState(event.tick !== tick || event.phase >= phase, 'event phase order');
    tick = event.tick;
    phase = event.phase;
    if (validatedEvents.has(event)) {
      requireState(
        event.entityIds.every((id) => identities.has(id)),
        'event entity reference',
      );
      continue;
    }
    keys(event, [
      'id',
      'tick',
      'phase',
      'type',
      'settlementId',
      'entityIds',
      'location',
      'causes',
      'facts',
      'effects',
      'importance',
    ]);
    requireState(
      Object.hasOwn(EVENT_PHASES, event.type) &&
        (EVENT_PHASES[event.type] as readonly number[]).includes(event.phase),
      'event type/phase',
    );
    requireState(
      event.type === 'founding' ? event.id === 1 && event.tick === 0 : event.tick > 0,
      'founding uniqueness',
    );
    requireState(event.settlementId === 1 && event.entityIds.length > 0, 'event settlement');
    requireState(['major', 'ordinary', 'minor'].includes(event.importance), 'importance');
    requireState(
      event.facts !== null &&
        typeof event.facts === 'object' &&
        !Array.isArray(event.facts) &&
        event.effects !== null &&
        typeof event.effects === 'object' &&
        !Array.isArray(event.effects),
      'event data',
    );
    keys(event.facts, [...EVENT_FIELDS[event.type].facts]);
    keys(event.effects, [...EVENT_FIELDS[event.type].effects]);
    let previous = 0;
    for (const id of event.entityIds) {
      integer(id, 1);
      requireState(id > previous && identities.has(id), 'event entity reference');
      previous = id;
    }
    keys(event.location, ['tile', 'x', 'y']);
    integer(event.location.tile, 0, m.tiles.length - 1);
    requireState(
      event.location.x === event.location.tile % m.width &&
        event.location.y === Math.floor(event.location.tile / m.width),
      'event location',
    );
    if (isImmutableCanonical(event)) validatedEvents.add(event);
  }
  const occupied = new Set<number>(),
    active = new Set<number>();
  function occupancy(id: number, kind: string, tile: number) {
    const entity = identities.get(id);
    requireState(
      entity && !entity.retired && entity.kind === kind && entity.tile === tile,
      'active identity',
    );
    requireState(
      !active.has(id) && !occupied.has(tile) && inWorkRadius(tile, v.center),
      'occupancy',
    );
    const ground = m.tiles[tile]!;
    requireState(
      ground[2] === 'grass' && ground[3] === 0 && (kind !== 'field' || ground[1] >= 50),
      'occupied terrain',
    );
    occupied.add(tile);
    active.add(id);
  }
  let lastId = 1;
  for (const b of w.buildings) {
    keys(b, ['id', 'kind', 'tile', 'status', 'creationEventId', 'durability', 'tendedWeeks']);
    requireState(b.id > lastId && b.status === 'completed', 'building order/status');
    lastId = b.id;
    occupancy(b.id, b.kind, b.tile);
    integer(b.creationEventId, 1, s.events.length);
    const created = s.events[b.creationEventId - 1]!;
    requireState(
      (created.type === 'founding' || created.type === 'construction_completed') &&
        created.entityIds.includes(b.id),
      'building creation',
    );
    if (b.kind === 'field') {
      requireState(b.durability === null, 'field durability');
      integer(b.tendedWeeks, 0, s.tick % 12);
    } else {
      integer(b.durability!, 1, 100);
      requireState(b.tendedWeeks === 0, 'nonfield work');
    }
  }
  if (w.project !== null) {
    const p = w.project;
    keys(p, ['id', 'kind', 'tile', 'progress', 'requiredLabor', 'escrow', 'startEventId']);
    occupancy(p.id, p.kind, p.tile);
    const cost = E.construction[p.kind];
    requireState(
      cost && p.escrow === cost.timber && p.requiredLabor === cost.labor,
      'project cost',
    );
    integer(p.progress, 0, p.requiredLabor - 1);
    requireState(
      p.startEventId === identities.get(p.id)!.creationEventId &&
        s.events[p.startEventId - 1]!.type === 'construction_started',
      'project reference',
    );
  }
  for (const entity of w.entities.slice(1)) {
    requireState(entity.retired === !active.has(entity.id), 'registry lifecycle');
    if (entity.retired)
      requireState(
        s.events.some((e) => e.type === 'building_removed' && e.entityIds.includes(entity.id)),
        'removal record',
      );
  }
  if (s.tick === 0) {
    requireState(
      w.currentWeather === null &&
        w.currentWeatherEventId === null &&
        s.lastTick === null &&
        s.events.length === 1,
      'founding clock',
    );
    requireState(
      v.population === 24 &&
        v.food === 360 &&
        v.timber === 40 &&
        v.health === 100 &&
        !v.shortage &&
        !v.surplus &&
        w.buildings.length === 9 &&
        w.project === null &&
        s.allocators.entity === 11,
      'founding endowment',
    );
  } else {
    const weather = w.currentWeather;
    requireState(weather !== null, 'missing weather');
    keys(weather, ['kind', 'multiplier', 'startTick']);
    requireState(
      Object.hasOwn(E.weatherMultipliers, weather.kind) &&
        weather.multiplier === E.weatherMultipliers[weather.kind],
      'weather multiplier',
    );
    requireState(weather.startTick === Math.floor((s.tick - 1) / 12) * 12 + 1, 'weather season');
    integer(w.currentWeatherEventId!, 1, s.events.length);
    const evidence = s.events[w.currentWeatherEventId! - 1]!;
    requireState(
      evidence.type === 'weather' &&
        evidence.tick === weather.startTick &&
        evidence.facts.kind === weather.kind &&
        evidence.facts.multiplier === weather.multiplier,
      'weather reference',
    );
    validateLedger(s);
    requireState(
      v.shortage === (v.population > 0 && s.lastTick!.food.deficit > 0) &&
        v.surplus === (v.population > 0 && v.food >= E.surplusFoodWeeks * v.population),
      'transition criteria',
    );
  }
  const extinctions = s.events.filter((e) => e.type === 'extinction');
  requireState(extinctions.length === (v.population === 0 ? 1 : 0), 'extinction uniqueness');
  if (v.population === 0)
    requireState(
      v.health === 0 && w.buildings.every((b) => b.tendedWeeks === 0),
      'extinct health/crops',
    );
}

function validateLedger(s: SettlementState): void {
  const l = s.lastTick!;
  requireState(l !== null && l.tick === s.tick, 'missing tick ledger');
  keys(l, [
    'tick',
    'opening',
    'labor',
    'production',
    'food',
    'timber',
    'healthAfterFood',
    'repairs',
    'construction',
    'demographics',
    'closing',
  ]);
  for (const totals of [l.opening, l.closing]) {
    keys(totals, ['population', 'food', 'timber', 'health', 'shelter', 'capacity', 'escrow']);
    for (const value of Object.values(totals)) integer(value);
    integer(totals.health, 0, 100);
    requireState(totals.food <= totals.capacity, 'ledger capacity');
  }
  const a = l.labor,
    p = l.production,
    f = l.food,
    t = l.timber,
    d = l.demographics;
  keys(a, [
    'workforce',
    'fields',
    'foragers',
    'repairs',
    'builders',
    'gatherers',
    'unassigned',
    'unusedConstruction',
  ]);
  for (const [name, value] of Object.entries(a)) if (name !== 'fields') integer(value as number);
  requireState(a.workforce === Math.floor(l.opening.population / E.workerDivisor), 'workforce');
  requireState(
    a.fields.length + a.foragers + a.repairs + a.builders + a.gatherers + a.unassigned ===
      a.workforce,
    'exclusive labor',
  );
  requireState(
    a.repairs <= 2 &&
      a.builders <= 2 &&
      a.gatherers <= 2 &&
      a.foragers <= Math.ceil(l.opening.population / 4),
    'labor caps',
  );
  requireState(
    new Set(a.fields).size === a.fields.length &&
      a.fields.every(
        (id, index) =>
          id > (a.fields[index - 1] ?? 0) && s.world.entities[id - 1]?.kind === 'field',
      ),
    'field labor IDs',
  );
  keys(p, ['foraging', 'harvest', 'fields', 'gathered', 'gathering']);
  integer(p.foraging);
  integer(p.harvest);
  integer(p.gathered);
  const calendar = calendarAtTick(s.tick);
  requireState(calendar.kind === 'week', 'ledger calendar');
  const season = Math.floor((s.tick - 1) / 12) % 4;
  requireState(
    p.foraging === a.foragers * E.foodPerForager[season]! &&
      p.gathered <= a.gatherers * E.timberPerGatherer,
    'production allowance',
  );
  requireState(
    p.fields.reduce((sum, b) => sum + b.yield, 0) === p.harvest &&
      (calendar.seasonBoundary || p.fields.length === 0),
    'harvest total',
  );
  for (const b of p.fields) {
    keys(b, ['id', 'fertility', 'tendedWeeks', 'yield']);
    integer(b.tendedWeeks, 0, 12);
    integer(b.fertility, 0, 100);
    integer(b.yield);
    requireState(
      s.world.entities[b.id - 1]?.kind === 'field' &&
        b.fertility === s.world.map.tiles[s.world.entities[b.id - 1]!.tile]![1] &&
        b.yield === fieldYield(b, s.world.currentWeather!.multiplier, season),
      'harvest inputs',
    );
  }
  let previousTile = -1,
    gathered = 0;
  for (const g of p.gathering) {
    keys(g, ['tile', 'before', 'after']);
    integer(g.tile, 0, 2559);
    integer(g.before, 1, 20);
    integer(g.after, 0, g.before - 1);
    requireState(
      g.tile > previousTile &&
        inWorkRadius(g.tile, s.world.settlement.center) &&
        s.world.map.tiles[g.tile]![3] === g.after,
      'gathering evidence',
    );
    previousTile = g.tile;
    gathered += g.before - g.after;
  }
  requireState(gathered === p.gathered, 'timber conservation');
  keys(f, ['overflow', 'consumed', 'deficit', 'spoilage', 'demolitionOverflow']);
  for (const value of Object.values(f)) integer(value);
  const pool = l.opening.food + p.foraging + p.harvest;
  requireState(
    f.overflow === Math.max(0, pool - l.opening.capacity) &&
      f.consumed === Math.min(pool - f.overflow, l.opening.population) &&
      f.deficit === l.opening.population - f.consumed,
    'ration ledger',
  );
  requireState(
    f.spoilage ===
      (calendar.seasonBoundary
        ? Math.floor((pool - f.overflow - f.consumed) / E.spoilageDivisor)
        : 0),
    'spoilage ledger',
  );
  requireState(
    l.closing.food === pool - f.overflow - f.consumed - f.spoilage - f.demolitionOverflow,
    'food conservation',
  );
  keys(t, ['maintenance', 'newEscrow', 'completedEscrow']);
  for (const value of Object.values(t)) integer(value);
  requireState(
    t.maintenance === l.repairs.length &&
      t.maintenance === a.repairs &&
      t.maintenance + t.newEscrow <= l.opening.timber,
    'opening material reservation',
  );
  for (const r of l.repairs) {
    keys(r, ['id', 'before', 'after']);
    integer(r.before, 1, 75);
    requireState(
      r.after === Math.min(100, r.before + 10) &&
        ['hut', 'store'].includes(s.world.entities[r.id - 1]!.kind),
      'repair facts',
    );
  }
  requireState(
    l.closing.timber === l.opening.timber + p.gathered - t.maintenance - t.newEscrow &&
      l.closing.escrow === l.opening.escrow + t.newEscrow - t.completedEscrow,
    'timber/escrow ledger',
  );
  requireState(
    l.healthAfterFood ===
      rationHealth(l.opening.population, l.opening.health, f.deficit, l.opening.shelter),
    'health ledger',
  );
  keys(d, [
    'deathTrials',
    'deathThreshold',
    'deaths',
    'birthEligible',
    'birthTrials',
    'birthSuccesses',
    'births',
  ]);
  for (const [name, value] of Object.entries(d))
    if (name !== 'birthEligible') integer(value as number);
  requireState(
    typeof d.birthEligible === 'boolean' &&
      d.deathTrials === (calendar.seasonBoundary ? l.opening.population : 0) &&
      d.deaths <= d.deathTrials,
    'death trials',
  );
  requireState(
    d.deathThreshold ===
      E.baseDeathThreshold + Math.floor((100 - l.healthAfterFood) / E.deathHealthDivisor),
    'death threshold',
  );
  const survivors = l.opening.population - d.deaths;
  const eligible =
    calendar.seasonBoundary &&
    survivors > 0 &&
    l.healthAfterFood >= E.birthHealth &&
    f.deficit === 0 &&
    l.closing.food >= E.birthFoodWeeks * survivors;
  requireState(
    d.birthEligible === eligible &&
      d.birthTrials === (eligible ? survivors : 0) &&
      d.birthSuccesses <= d.birthTrials &&
      d.births === Math.min(d.birthSuccesses, Math.max(0, l.closing.shelter - survivors)),
    'birth accounting',
  );
  requireState(
    l.closing.population === survivors + d.births &&
      l.closing.health === (l.closing.population === 0 ? 0 : l.healthAfterFood),
    'closing population/health',
  );
  const v = s.world.settlement;
  requireState(
    l.closing.population === v.population &&
      l.closing.food === v.food &&
      l.closing.timber === v.timber &&
      l.closing.health === v.health &&
      l.closing.capacity === foodCapacity(s.world.buildings) &&
      l.closing.shelter === shelter(s.world.buildings) &&
      l.closing.escrow === (s.world.project?.escrow ?? 0),
    'closing state',
  );
  if (l.construction !== null) {
    const c = l.construction;
    keys(c, ['id', 'before', 'after', 'worked', 'completed']);
    integer(c.before);
    integer(c.after);
    integer(c.worked);
    requireState(
      c.after - c.before === c.worked &&
        c.worked <= a.builders &&
        a.unusedConstruction === a.builders - c.worked &&
        typeof c.completed === 'boolean',
      'construction labor',
    );
    requireState(
      s.world.entities[c.id - 1] &&
        c.after <=
          E.construction[s.world.entities[c.id - 1]!.kind as 'hut' | 'field' | 'store'].labor,
      'construction identity',
    );
    const cost = E.construction[s.world.entities[c.id - 1]!.kind as 'hut' | 'field' | 'store'];
    requireState(
      c.completed === (c.after === cost.labor) &&
        t.completedEscrow === (c.completed ? cost.timber : 0),
      'construction completion',
    );
    requireState(
      t.newEscrow === 0 ||
        (t.newEscrow === cost.timber && l.opening.escrow === 0 && c.before === 0),
      'project start escrow',
    );
    requireState(
      c.completed
        ? s.world.project === null && s.world.buildings.some((b) => b.id === c.id)
        : s.world.project?.id === c.id && s.world.project.progress === c.after,
      'construction state',
    );
  } else
    requireState(
      a.builders === 0 &&
        a.unusedConstruction === 0 &&
        t.completedEscrow === 0 &&
        t.newEscrow === 0,
      'construction budget',
    );
}
