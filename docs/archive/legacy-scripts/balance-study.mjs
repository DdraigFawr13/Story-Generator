import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';

// Report real trajectories for the same ten fixed seeds on both retained rule versions.
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { createSettlement } = await server.ssrLoadModule('/src/sim/settlement-initial.ts');
  const { advanceSettlement } = await server.ssrLoadModule('/src/sim/settlement.ts');
  const { LEGACY_SETTLEMENT_VERSION, SETTLEMENT_VERSION } = await server.ssrLoadModule(
    '/src/sim/settlement-config.ts',
  );
  const seeds = [
    'RIVERSIDE',
    ...Array.from({ length: 9 }, (_, i) => `TERRAIN_${String(i).padStart(3, '0')}`),
  ];
  const trajectories = [];
  for (const version of [LEGACY_SETTLEMENT_VERSION, SETTLEMENT_VERSION]) {
    for (const seed of seeds) {
      let state = createSettlement(seed, version);
      const milestones = [];
      for (const tick of [0, 12, 24, 36, 48, 96, 240, 480, 1000]) {
        const result = advanceSettlement(state, tick - state.tick);
        if (result.halted || result.state.tick !== tick) throw new Error(`${seed}: incomplete run`);
        state = result.state;
        const settlement = state.world.settlement;
        milestones.push({
          tick,
          population: settlement.population,
          health: settlement.health,
          food: settlement.food,
          timber: settlement.timber,
          fields: state.world.buildings.filter((b) => b.kind === 'field').length,
          huts: state.world.buildings.filter((b) => b.kind === 'hut').length,
          stores: state.world.buildings.filter((b) => b.kind === 'store').length,
          events: state.events.length,
          shortageStarts: state.events.filter((e) => e.type === 'shortage_started').length,
          extinctionTick: state.events.find((e) => e.type === 'extinction')?.tick ?? null,
          lastWeek: state.lastTick
            ? {
                labor: state.lastTick.labor,
                harvest: state.lastTick.production.harvest,
                foraging: state.lastTick.production.foraging,
                consumed: state.lastTick.food.consumed,
                deficit: state.lastTick.food.deficit,
              }
            : null,
        });
      }
      trajectories.push({ version, seed, milestones });
      process.stdout.write(`${version} ${seed}: ${state.tick} weeks measured\n`);
    }
  }
  const destination = process.argv[2] ?? 'docs/evidence/phase1-balance-trajectories.json';
  await writeFile(destination, JSON.stringify({ trajectories }, null, 2) + '\n');
  process.stdout.write(`Wrote ${destination}\n`);
} finally {
  await server.close();
}
