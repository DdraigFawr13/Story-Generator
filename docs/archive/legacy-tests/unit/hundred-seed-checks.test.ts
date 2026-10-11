// Archived 100-seed checks removed from the legacy unit suite in Phase 0 (REBOOT_PLAN §4/§11).
// They read the legacy src/sim modules; see git history before the move for their original files.

// From tests/unit/living.test.ts
  it('keeps 100 seeded first years and real known-parent birth intervals coherent', () => {
    for (let index = 0; index < 100; index++) {
      const state = simulateLivingSettlement(`LIFE_${index}`, 48).state;
      expect(state.tick).toBe(48);
      expect(state.allocators.entity).toBe(state.world.entities.length + 1);
      expect(state.world.settlement.population).toBeGreaterThan(0);
      expect(state.world.residents.length).toBeGreaterThanOrEqual(24);
      expect(
        state.world.residents
          .filter((person) => person.birthEventId !== null)
          .every((person) => person.parentIds.length === 1 && person.parentIds[0]! < person.id),
      ).toBe(true);
    }
  }, 120000);


// From tests/unit/residents.test.ts
  it('keeps IDs, names, census and home references coherent across 100 seeds', () => {
    const results = new Set<string>();
    for (let index = 0; index < 100; index++) {
      const founding = createSettlement(`PEOPLE_${index}`);
      const roster = createFounderRoster(founding);
      results.add(
        canonicalJson({
          households: roster.households.map((household) => household.name),
          residents: roster.residents.map((resident) => [
            resident.givenName,
            resident.ageWeeksAtFounding,
            resident.traits,
          ]),
        }),
      );
      expect(createFounderRoster(founding)).toEqual(roster);
      expect(roster.residents).toHaveLength(founding.world.settlement.population);
      expect(roster.households).toHaveLength(founding.world.settlement.households);
      const identities = [...roster.households, ...roster.residents];
      expect(new Set(identities.map((identity) => identity.id)).size).toBe(identities.length);
      expect(identities.every((identity) => identity.id >= founding.allocators.entity)).toBe(true);
      expect(
        new Set(
          roster.residents.map((resident) => `${resident.givenName} ${resident.householdName}`),
        ).size,
      ).toBe(24);
      for (const household of roster.households) {
        const home = founding.world.buildings.find((building) => building.id === household.homeId)!;
        expect(home.kind).toBe('hut');
        expect(household.tile).toBe(home.tile);
        const members = roster.residents.filter(
          (resident) => resident.householdId === household.id,
        );
        expect(members).toHaveLength(founding.config.peoplePerHousehold);
        for (const resident of members) {
          expect(resident.householdName).toBe(household.name);
          expect(resident.homeId).toBe(home.id);
          expect(resident.tile).toBe(home.tile);
          expect(residentLifeStage(resident, 0)).toBe('adult');
          expect(resident.ageWeeksAtFounding).toBeLessThanOrEqual(
            RESIDENT_CONFIG.founderMaxAgeWeeks,
          );
          expect(resident.health).toBe(founding.world.settlement.health);
          expect(resident.profession).toBe('unassigned');
          expect(resident.parentIds).toEqual([]);
          expect(
            Object.values(resident.traits).every(
              (trait) => Number.isInteger(trait) && trait >= 0 && trait <= 100,
            ),
          ).toBe(true);
        }
      }
    }
    expect(results.size).toBe(100);
  }, 60_000);

