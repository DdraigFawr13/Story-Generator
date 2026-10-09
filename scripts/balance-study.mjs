import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

// Diagnostic only: an isolated SSR module graph loads each candidate config.
// Browser code, production config and local saves are never changed.
const seeds = [
  'RIVERSIDE',
  ...Array.from({ length: 9 }, (_, i) => `TERRAIN_${String(i).padStart(3, '0')}`),
];
const profiles = [
  { id: 'baseline', harvestBase: 240, winterFactor: 400 },
  { id: 'dormant-winter', harvestBase: 240, winterFactor: 0 },
  { id: 'moderate-harvest', harvestBase: 160, winterFactor: 0 },
  { id: 'lower-harvest', harvestBase: 120, winterFactor: 0 },
  { id: 'scarcity-boundary', harvestBase: 100, winterFactor: 0 },
  { id: 'low-yield-stress', harvestBase: 80, winterFactor: 0 },
];
const reference = JSON.parse(await readFile('docs/evidence/phase1-ten-trajectories.json', 'utf8'));
const results = [];
let baselineConfig;
for (const profile of profiles) {
  const started = performance.now();
  const server = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true },
    plugins:
      profile.id === 'baseline'
        ? []
        : [
            {
              name: 'isolated-balance-study',
              enforce: 'pre',
              transform(_source, id) {
                if (!id.endsWith('/src/sim/settlement-config.ts')) return;
                const config = structuredClone(baselineConfig);
                config.economy.harvestBase = profile.harvestBase;
                config.economy.seasonMultipliers[3] = profile.winterFactor;
                return `import { capture } from './immutable';\nexport const SETTLEMENT_VERSION = 'p1-balance-study-${profile.id}';\nexport const SETTLEMENT_CONFIG = capture(${JSON.stringify(config)});\n`;
              },
            },
          ],
  });
  try {
    const { SETTLEMENT_CONFIG } = await server.ssrLoadModule('/src/sim/settlement-config.ts');
    assert.equal(SETTLEMENT_CONFIG.economy.harvestBase, profile.harvestBase);
    assert.equal(SETTLEMENT_CONFIG.economy.seasonMultipliers[3], profile.winterFactor);
    if (profile.id === 'baseline') baselineConfig = structuredClone(SETTLEMENT_CONFIG);
    const { createSettlement } = await server.ssrLoadModule('/src/sim/settlement-initial.ts');
    const { advanceSettlement, reduceSettlementWeek } =
      await server.ssrLoadModule('/src/sim/settlement.ts');
    const { validateSettlementState } = await server.ssrLoadModule(
      '/src/sim/settlement-validation.ts',
    );
    const { capture } = await server.ssrLoadModule('/src/sim/immutable.ts');
    const { canonicalJson } = await server.ssrLoadModule('/src/sim/canonical.ts');
    const { digestCanonical } = await server.ssrLoadModule('/src/adapters/crypto.ts');
    const trajectories = [];
    for (const seed of seeds) {
      let state = createSettlement(seed),
        resumePoint;
      const seasons = [];
      let minHealth = 100,
        shortageWeeks = 0;
      for (let tick = 1; tick <= 240; tick++) {
        const next = advanceSettlement(state, 1);
        assert.equal(next.halted, null);
        assert.equal(next.advanced, 1);
        state = next.state;
        if (tick === 57) resumePoint = JSON.parse(canonicalJson(state));
        const v = state.world.settlement,
          ledger = state.lastTick;
        minHealth = Math.min(minHealth, v.health);
        if (ledger.food.deficit > 0) shortageWeeks++;
        if ((tick - 1) % 12 === 0)
          seasons.push({
            year: Math.floor((tick - 1) / 48) + 1,
            season: ['spring', 'summer', 'autumn', 'winter'][Math.floor((tick - 1) / 12) % 4],
            openingFood: ledger.opening.food,
            openingPopulation: ledger.opening.population,
            weather: state.world.currentWeather.kind,
            foraging: 0,
            harvest: 0,
            consumed: 0,
            deficit: 0,
            shortageWeeks: 0,
            losses: 0,
            closingFood: 0,
            closingPopulation: 0,
            closingHealth: 0,
          });
        const season = seasons.at(-1);
        season.foraging += ledger.production.foraging;
        season.harvest += ledger.production.harvest;
        season.consumed += ledger.food.consumed;
        season.deficit += ledger.food.deficit;
        season.shortageWeeks += Number(ledger.food.deficit > 0);
        season.losses +=
          ledger.food.overflow + ledger.food.spoilage + ledger.food.demolitionOverflow;
        Object.assign(season, {
          closingFood: v.food,
          closingPopulation: v.population,
          closingHealth: v.health,
        });
        if (profile.id === 'baseline' && [48, 96, 240].includes(tick)) {
          const expected = reference
            .find((r) => r.seed === seed)
            .observations.find((r) => r.tick === tick);
          for (const key of ['population', 'health', 'food', 'timber'])
            assert.equal(v[key], expected[key], `${seed} week ${tick}: ${key}`);
        }
      }
      validateSettlementState(state);
      if (seed === 'RIVERSIDE') {
        validateSettlementState(resumePoint);
        assert.equal(
          canonicalJson(advanceSettlement(capture(resumePoint), 183).state),
          canonicalJson(state),
        );
      }
      trajectories.push({
        seed,
        minHealth,
        shortageWeeks,
        extinctionTick: state.events.find((e) => e.type === 'extinction')?.tick ?? null,
        closing: state.world.settlement,
        digest: await digestCanonical(state),
        seasons,
      });
    }
    // Forced one-week phase inputs, not autonomous histories or save fixtures.
    // Keep existing three fields, weather and materials; isolate opening population/reserves.
    const recovery = [];
    let inputBase = createSettlement('RIVERSIDE');
    inputBase = advanceSettlement(inputBase, 37).state;
    for (const population of [1, 2, 4, 8, 24]) {
      const input = JSON.parse(canonicalJson(inputBase));
      Object.assign(input.world.settlement, {
        population,
        households: Math.ceil(population / 4),
        food: 0,
        health: 100,
        shortage: false,
        surplus: false,
      });
      const output = reduceSettlementWeek(capture(input));
      validateSettlementState(output);
      recovery.push({
        population,
        fields: input.world.buildings.filter((b) => b.kind === 'field').length,
        workforce: output.lastTick.labor.workforce,
        labor: output.lastTick.labor,
        producedFood: output.lastTick.production.foraging + output.lastTick.production.harvest,
        deficit: output.lastTick.food.deficit,
        closingHealth: output.world.settlement.health,
      });
    }
    const summary = {
      worlds: seeds.length,
      worldsWithShortages: trajectories.filter((r) => r.shortageWeeks > 0).length,
      totalShortageWeeks: trajectories.reduce((sum, r) => sum + r.shortageWeeks, 0),
      minimumHealth: Math.min(...trajectories.map((r) => r.minHealth)),
      populationRange: [
        Math.min(...trajectories.map((r) => r.closing.population)),
        Math.max(...trajectories.map((r) => r.closing.population)),
      ],
      extinctions: trajectories.filter((r) => r.extinctionTick !== null).length,
    };
    results.push({
      profile,
      simulationVersion: inputBase.simulationVersion,
      summary,
      trajectories,
      recovery,
      elapsedMs: Math.round(performance.now() - started),
    });
    process.stdout.write(JSON.stringify({ profile: profile.id, ...summary }) + '\n');
  } finally {
    await server.close();
  }
}
const output =
  process.env.STORY_GENERATOR_BALANCE_REPORT ?? '/tmp/story-generator-balance-report.json';
await writeFile(
  output,
  JSON.stringify(
    {
      sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      nodeVersion: process.version,
      weeks: 240,
      seeds,
      candidateOnly: true,
      baselineConfig,
      results,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(`Report written to ${output}\n`);
