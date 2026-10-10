"""Independent founding-identity vector; does not import or execute TypeScript."""

import json

GIVEN_NAMES = "Ader Alin Anwen Bera Bran Carys Dara Delyn Eira Elan Emrys Fara Galen Halen Idris Iona Jory Kira Lina Loren Mara Meri Neri Orin Rian Rona Sera Tarin Tegan Toma Vara Wren".split()
HOUSEHOLD_NAMES = "Alder Ash Brook Cedar Fern Flint Grove Hazel Hearth Hill Moss Reed Rowan Stone Vale Willow".split()
MASK = (1 << 32) - 1


def vector(seed):
    state = 2166136261
    for byte in f"{seed}:residents-v1".encode("ascii"):
        state = ((state ^ byte) * 16777619) & MASK
    state = state or 1
    initial = state

    def draw(size):
        nonlocal state
        limit = MASK // size * size
        while True:
            state ^= (state << 13) & MASK
            state ^= state >> 17
            state ^= (state << 5) & MASK
            state &= MASK
            if state - 1 < limit:
                return (state - 1) % size

    names = HOUSEHOLD_NAMES.copy()
    households = [names.pop(draw(len(names))) for _ in range(6)]
    residents = []
    for household in households:
        names = GIVEN_NAMES.copy()
        for _ in range(4):
            residents.append({
                "givenName": names.pop(draw(len(names))),
                "householdName": household,
                "ageWeeksAtFounding": 18 * 48 + draw(33 * 48),
                "traits": {
                    "sociability": draw(101),
                    "caution": draw(101),
                    "persistence": draw(101),
                },
            })
    return {"seed": seed, "initialRng": initial, "finalRng": state,
            "householdNames": households, "residents": residents}


if __name__ == "__main__":
    print(json.dumps([vector(seed) for seed in ["RIVERSIDE", "PEOPLE_0", "OTHER_SEED"]], indent=2))
