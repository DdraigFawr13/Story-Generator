import { useState, type FormEvent } from 'react';
import { FoundingController } from '../controller/founding';
import { MapCanvas } from './MapCanvas';

export function App() {
  const [controller] = useState(() => new FoundingController());
  const [view, setView] = useState(controller.view);
  const [seed, setSeed] = useState(view.seed);
  const [error, setError] = useState('');
  const [selectedTile, setSelectedTile] = useState(view.settlement.center);
  const [x, setX] = useState(String(selectedTile % view.width));
  const [y, setY] = useState(String(Math.floor(selectedTile / view.width)));

  function select(tile: number) {
    setSelectedTile(tile);
    setX(String(tile % view.width));
    setY(String(Math.floor(tile / view.width)));
  }
  function generate(event?: FormEvent<HTMLFormElement>, random = false) {
    event?.preventDefault();
    try {
      const next = random ? controller.generateRandom() : controller.generate(seed);
      setView(next);
      setSeed(next.seed);
      select(next.settlement.center);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'World generation failed.');
    }
  }
  const tile = view.tiles[selectedTile]!;
  const building = view.buildings.find((item) => item.tile === selectedTile);

  return (
    <main>
      <header>
        <p className="eyebrow">Story Generator · Phase 1 foundations</p>
        <h1>A place to begin.</h1>
        <p>Explore a seeded river valley and its founding settlement.</p>
      </header>
      <form className="seed-form" onSubmit={generate}>
        <label htmlFor="seed">World seed</label>
        <div className="seed-controls">
          <input
            id="seed"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            maxLength={64}
            aria-describedby="seed-hint"
            spellCheck={false}
            autoCapitalize="off"
          />
          <button type="submit">Generate world</button>
          <button type="button" className="secondary" onClick={() => generate(undefined, true)}>
            Random seed
          </button>
        </div>
        <small id="seed-hint">1–64 letters, numbers, underscores or hyphens.</small>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section className="world-layout" aria-label="Founding world">
        <div className="map-panel">
          <div className="map-heading">
            <h2>{view.settlement.name}</h2>
            <span>Founding — before spring</span>
          </div>
          <MapCanvas view={view} selectedTile={selectedTile} onSelect={select} />
          <ul className="legend" aria-label="Map legend">
            <li>Blue: river</li>
            <li>Dark green: woodland</li>
            <li>Gold: fields</li>
            <li>Orange: huts</li>
            <li>Brown: store</li>
          </ul>
        </div>
        <aside aria-label="Settlement facts">
          <h2>The founders</h2>
          <dl>
            <div>
              <dt>Residents</dt>
              <dd>{view.settlement.population}</dd>
            </div>
            <div>
              <dt>Households</dt>
              <dd>{view.settlement.households}</dd>
            </div>
            <div>
              <dt>Food</dt>
              <dd>
                {view.settlement.food} / {view.foodCapacity}
              </dd>
            </div>
            <div>
              <dt>Timber</dt>
              <dd>{view.settlement.timber}</dd>
            </div>
            <div>
              <dt>Shelter</dt>
              <dd>{view.housing}</dd>
            </div>
            <div>
              <dt>Buildings</dt>
              <dd>{view.buildings.length}</dd>
            </div>
          </dl>
          <p className="note">
            The site was cleared of {view.clearedTimber} timber. That material was discarded during
            preparation; starting stores contain 40 timber.
          </p>
          <p className="note">
            This is the founding preview. Weekly simulation, the chronicle and local saves come in
            the next slices. The map uses temporary drawings.
          </p>
        </aside>
      </section>
      <section className="inspector" aria-label="Tile inspector">
        <div>
          <h2>Inspect the ground</h2>
          <p>Select the map or enter a coordinate.</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const nx = Number(x),
              ny = Number(y);
            if (
              x !== '' &&
              y !== '' &&
              Number.isInteger(nx) &&
              Number.isInteger(ny) &&
              nx >= 0 &&
              nx < view.width &&
              ny >= 0 &&
              ny < view.height
            ) {
              select(ny * view.width + nx);
              setError('');
            } else setError('Choose X from 0–63 and Y from 0–39.');
          }}
        >
          <label>
            X
            <input
              aria-label="Tile X"
              type="number"
              min="0"
              max={view.width - 1}
              value={x}
              onChange={(event) => setX(event.target.value)}
            />
          </label>
          <label>
            Y
            <input
              aria-label="Tile Y"
              type="number"
              min="0"
              max={view.height - 1}
              value={y}
              onChange={(event) => setY(event.target.value)}
            />
          </label>
          <button type="submit" className="secondary">
            Inspect tile
          </button>
        </form>
        <p aria-live="polite" className="tile-facts">
          Tile {selectedTile}: {tile[2]}, elevation {tile[0]}, fertility {tile[1]}, timber {tile[3]}
          {building ? `, ${building.kind} #${building.id}` : ''}.
        </p>
      </section>
    </main>
  );
}
