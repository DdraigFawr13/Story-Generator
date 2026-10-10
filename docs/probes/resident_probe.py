"""Independent founding-identity vector; does not import or execute TypeScript."""

import argparse
import json
from pathlib import Path

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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", type=Path, help="Check a committed JSON fixture instead of printing vectors")
    args = parser.parse_args()
    vectors = [vector(seed) for seed in ["RIVERSIDE", "PEOPLE_0", "OTHER_SEED"]]
    if args.check:
        if json.loads(args.check.read_text()) != vectors:
            raise SystemExit("Resident founding fixture does not match the independent probe.")
        print("Three independent resident founding vectors match the fixture.")
    else:
        print(json.dumps(vectors, indent=2))
