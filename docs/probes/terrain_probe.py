"""Offline design probe, not the production TypeScript simulation.

Run: python3 docs/probes/terrain_probe.py
"""
import hashlib
import json
from collections import deque

MASK = 0xFFFFFFFF
WIDTH, HEIGHT = 64, 40


class Stream:
    def __init__(self, seed):
        self.state = 2166136261
        for byte in (seed + ':terrain').encode('ascii'):
            self.state = ((self.state ^ byte) * 16777619) & MASK
        self.state = self.state or 1

    def uniform(self, n):
        limit = (MASK // n) * n
        while True:
            x = self.state
            x ^= (x << 13) & MASK
            x ^= x >> 17
            x ^= (x << 5) & MASK
            self.state = x & MASK
            u = self.state - 1
            if u < limit:
                return u % n


def interpolate(grid, x, y):
    gx, dx = divmod(x, 8)
    gy, dy = divmod(y, 8)
    return (grid[gy * 9 + gx] * (8-dx) * (8-dy)
            + grid[gy * 9 + gx+1] * dx * (8-dy)
            + grid[(gy+1) * 9 + gx] * (8-dx) * dy
            + grid[(gy+1) * 9 + gx+1] * dx * dy) // 64


def generate(seed):
    rng = Stream(seed)
    # Each complete 9x6 lattice is drawn in row-major order.
    grids = [[rng.uniform(101) for _ in range(54)] for _ in range(3)]
    river = [8 + rng.uniform(48)]
    for _ in range(1, HEIGHT):
        river.append(max(3, min(60, river[-1] + rng.uniform(3) - 1)))
    tiles = []
    for y in range(HEIGHT):
        for x in range(WIDTH):
            elevation = 25 + 65 * interpolate(grids[0], x, y) // 100
            fertility = 40 + 60 * interpolate(grids[1], x, y) // 100
            kind = 'rock' if elevation >= 82 else 'grass'
            timber = 20 if kind == 'grass' and interpolate(grids[2], x, y) >= 55 else 0
            if abs(x - river[y]) <= 1:
                kind, elevation, fertility, timber = 'water', 0, 0, 0
            tiles.append([elevation, fertility, kind, timber])
    return tiles, river, rng.state


def patch(cx, cy):
    return [(cy+dy)*WIDTH+cx+dx for dy in (-1, 0, 1) for dx in (-1, 0, 1)]


def found(tiles):
    tiles = [t.copy() for t in tiles]
    water = [i for i,t in enumerate(tiles) if t[2] == 'water']
    candidates = []
    for cy in range(8, 32):
        for cx in range(8, 56):
            ids = patch(cx, cy)
            if any(tiles[i][2] == 'water' for i in ids):
                continue
            # Shortest Manhattan distance to any water; sentinel for forced fixtures.
            distance = min((abs(cx-i%WIDTH)+abs(cy-i//WIDTH) for i in water), default=104)
            key = (distance, abs(cx-32)+abs(cy-20), cy*WIDTH+cx)
            valid = all(tiles[i][2] == 'grass' for i in ids) and sum(tiles[i][1] >= 50 for i in ids) >= 2
            candidates.append((key, ids, valid))
    if not candidates:
        raise ValueError('invalid geography: no dry founding patch')
    valid = [c for c in candidates if c[2]]
    key, ids, _ = min(valid or candidates, key=lambda c: c[0])
    fallback = not valid
    originals = [[i, *tiles[i]] for i in ids]
    removed = sum(tiles[i][3] for i in ids)
    for i in ids:
        if fallback:
            tiles[i] = [50, 70, 'grass', 0]
        else:
            tiles[i][3] = 0
    fields = sorted(ids, key=lambda i: (-tiles[i][1], i))[:2]
    store = min(set(ids)-set(fields))
    buildings = [[i, 'field' if i in fields else 'store' if i == store else 'hut'] for i in ids]
    return {'tiles': tiles, 'center': key[2], 'fallback': fallback,
            'clearedTimber': removed, 'originalPatch': originals, 'buildings': buildings}


def connected_water(tiles):
    water = {i for i,t in enumerate(tiles) if t[2] == 'water'}
    seen = {min(water)}
    queue = deque(seen)
    while queue:
        i = queue.popleft()
        x,y = i%WIDTH,i//WIDTH
        for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            j=ny*WIDTH+nx
            if 0<=nx<WIDTH and 0<=ny<HEIGHT and j in water and j not in seen:
                seen.add(j)
                queue.append(j)
    return seen == water


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def run():
    seeds = ['RIVERSIDE'] + [f'TERRAIN_{i:03d}' for i in range(99)]
    hashes, centers, forests, fallbacks = set(), set(), [], 0
    riverside = None
    for seed in seeds:
        tiles, river, state = generate(seed)
        assert generate(seed) == (tiles, river, state)
        assert connected_water(tiles)
        assert sum(t[2]=='water' for t in tiles) == 120
        assert all(abs(a-b)<=1 for a,b in zip(river,river[1:]))
        result = found(tiles)
        assert result == found(tiles)
        for i, kind in result['buildings']:
            assert result['tiles'][i][2:] == ['grass',0]
            assert kind!='field' or result['tiles'][i][1]>=50
        assert len(result['buildings']) == 9
        assert sum(t[3] for t in tiles)-sum(t[3] for t in result['tiles']) == result['clearedTimber']
        assert [i for i,t in enumerate(tiles) if t[2]=='water'] == [i for i,t in enumerate(result['tiles']) if t[2]=='water']
        assert generate(seed)[2] == state  # founding consumes no terrain draws
        digest=hashlib.sha256(canonical({'seed':seed,'terrainRng':state,'river':river,**result})).hexdigest()
        # Diversity hashes exclude the seed and RNG so differences must be in geography.
        hashes.add(hashlib.sha256(canonical(result['tiles'])).hexdigest())
        centers.add(result['center'])
        forests.append(sum(t[3]>0 for t in result['tiles']))
        fallbacks += result['fallback']
        if seed=='RIVERSIDE':
            riverside={'digest':digest,'terrainRng':state,'center':result['center'],'forestTiles':forests[-1]}
    # Force rock everywhere except the valid connected channel: fallback must preserve river.
    raw,_,_=generate('RIVERSIDE')
    forced=[[90,0,'rock',0] if t[2]!='water' else t.copy() for t in raw]
    fallback=found(forced)
    assert fallback['fallback'] and len(fallback['buildings'])==9
    assert connected_water(fallback['tiles'])
    # Invalid injected input is rejected, never repaired by cutting through river water.
    try:
        found([[0,0,'water',0] for _ in range(WIDTH*HEIGHT)])
    except ValueError:
        pass
    else:
        raise AssertionError('all-water fixture accepted')
    assert len(hashes)==100
    assert riverside == {'digest':'07a68eb6bb14a59ac536def9ac133478774970d059b49e1da5406d48be7268eb',
                         'terrainRng':2847659418,'center':1327,'forestTiles':1056}
    print(json.dumps({'seeds':len(seeds),'uniqueMaps':len(hashes),'uniqueCenters':len(centers),
                      'fallbacks':fallbacks,'forestTileRange':[min(forests),max(forests)],
                      'riverside':riverside,'forcedFallback':'pass','invalidAllWater':'rejected'},indent=2))


if __name__ == '__main__':
    run()
