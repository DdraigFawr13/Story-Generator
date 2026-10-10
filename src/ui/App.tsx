import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { dateLabel } from '../controller/chronicle';
import { SAVE_POLICY } from '../controller/save-queue';
import { WorldController } from '../controller/world';
import { MapCanvas } from './MapCanvas';
import { Chronicle } from './Chronicle';

export function App() {
  const [controller, setController] = useState<WorldController | null>(null);
  useEffect(() => {
    const next = new WorldController();
    let active = true;
    setController(next);
    void Promise.resolve().then(() => {
      if (active) return next.initialize();
    });
    const visibility = () => next.visibilityChanged();
    const pageHide = () => next.pause();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pageHide);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pageHide);
      void next.dispose();
    };
  }, []);
  return controller ? (
    <Viewer controller={controller} />
  ) : (
    <main>
      <p role="status">Opening the observation desk…</p>
    </main>
  );
}

function Viewer({ controller }: { controller: WorldController }) {
  const view = useSyncExternalStore(controller.subscribe, controller.getView);
  const [seed, setSeed] = useState('RIVERSIDE');
  const [selectedTile, setSelectedTile] = useState(1327);
  const [mapFocus, setMapFocus] = useState({ tile: 1327, revision: 0 });
  const [x, setX] = useState('47');
  const [y, setY] = useState('20');
  const [error, setError] = useState('');
  const [eventId, setEventId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const mapPanel = useRef<HTMLDivElement>(null);
  const world = view.world;
  const previousSession = useRef(-1);
  useEffect(() => {
    if (previousSession.current === view.worldSession) return;
    previousSession.current = view.worldSession;
    if (world) {
      setSeed(world.seed);
      select(world.world.settlement.center);
      setEventId(null);
      setError('');
      setExpanded(false);
    }
  }, [world, view.worldSession]);
  function select(tile: number, focus = true) {
    setSelectedTile(tile);
    if (focus) setMapFocus((previous) => ({ tile, revision: previous.revision + 1 }));
    setX(String(tile % 64));
    setY(String(Math.floor(tile / 64)));
  }
  async function generate(event?: FormEvent<HTMLFormElement>, random = false) {
    event?.preventDefault();
    setError('');
    if (random) await controller.randomWorld();
    else await controller.newWorld(seed);
  }
  function openChronicle() {
    setExpanded(true);
    scrollToMap();
  }
  function closeChronicle() {
    setExpanded(false);
    opener.current?.focus({ preventScroll: true });
    scrollToMap();
  }
  function scrollToMap() {
    mapPanel.current?.querySelector('canvas')?.scrollIntoView({ block: 'start' });
  }
  const canControl = !view.busy && (view.mode === 'owner' || view.mode === 'unavailable');
  const settlement = world?.world.settlement;
  const tile = world?.world.map.tiles[selectedTile];
  const building = world?.world.buildings.find((item) => item.tile === selectedTile);
  const project = world?.world.project?.tile === selectedTile ? world.world.project : null;
  const saveLabel =
    view.save.savedTick === null
      ? 'This world has not been saved.'
      : `Saved through week ${view.save.savedTick}.`;
  return (
    <main
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          event.preventDefault();
          closeChronicle();
        }
      }}
    >
      <header>
        <p className="eyebrow">Story Generator · Observation desk</p>
        <h1>A place with a history.</h1>
        <p>Watch a river settlement live through the seasons.</p>
      </header>
      <section className="time-controls" aria-label="Time controls">
        <p className="date" data-testid="date">
          {world ? dateLabel(world.tick) : 'No world open'}
          {world && (
            <span>
              {' '}
              · committed week <strong data-testid="tick">{world.tick}</strong>
            </span>
          )}
        </p>
        <div className="control-row">
          <button
            type="button"
            disabled={!canControl || !world || !!view.halted}
            onClick={() => (view.playing ? controller.pause() : controller.play())}
          >
            {view.playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!canControl || !world || view.playing || !!view.halted}
            onClick={() => controller.step()}
          >
            Step one week
          </button>
          <div className="speeds" role="group" aria-label="Playback speed">
            {([1, 4, 16] as const).map((speed) => (
              <button
                key={speed}
                type="button"
                className="secondary"
                aria-pressed={view.speed === speed}
                onClick={() => controller.speed(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
          <span className="play-state" role="status">
            {view.playing ? 'Playing' : 'Paused'}
          </span>
        </div>
        <small>
          At 1x, a week takes 15 seconds and a year takes 12 minutes. Returning to this page stays
          paused.
        </small>
      </section>
      <details className="world-menu" open={!world}>
        <summary>World</summary>
        <form
          className="seed-form"
          onSubmit={(event) => {
            void generate(event);
          }}
        >
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
            <button type="submit" disabled={!canControl}>
              New world
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!canControl}
              onClick={() => {
                void generate(undefined, true);
              }}
            >
              Random seed
            </button>
          </div>
          <small id="seed-hint">
            1–64 letters, numbers, underscores or hyphens. A new world begins paused.
          </small>
        </form>
        <div className="control-row">
          <button
            type="button"
            disabled={!world || view.mode !== 'owner' || view.busy || view.save.manualPending}
            onClick={() => controller.save(view.replaceRequired)}
          >
            {view.replaceRequired
              ? 'Replace local save with this world'
              : view.save.manualPending
                ? 'Save pending…'
                : 'Save world'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!view.saved || view.mode !== 'owner' || view.busy}
            onClick={() => {
              void controller.resume();
            }}
          >
            Resume local save
          </button>
        </div>
        {view.saved && (
          <p className="note">
            Local slot: {view.saved.payload.seed}, week {view.saved.payload.tick}, saved{' '}
            {new Date(view.saved.savedAt).toLocaleString()}.
          </p>
        )}
        {view.replaceRequired && (
          <p className="note">
            This browser holds one saved world. The previous save stays intact until you choose
            Replace local save and that write succeeds. Autosave is off for this candidate.
          </p>
        )}
      </details>
      <div className="save-status" aria-live="polite">
        {view.mode === 'loading' ? (
          'Checking local storage…'
        ) : view.mode === 'read-only' ? (
          'Read-only: another tab owns this world. Close that tab, then take ownership to continue.'
        ) : view.mode === 'unavailable' ? (
          'Unsaved play. Local persistence is unavailable.'
        ) : (
          <>
            {saveLabel}
            {world && view.save.savedTick !== world.tick
              ? ` Current week ${world.tick} is unsaved.`
              : ''}
            {view.save.saving
              ? ' Writing a complete snapshot…'
              : view.save.automaticPending
                ? ' Autosave is pending.'
                : ''}
          </>
        )}
        <p>
          Saves stay in this browser on this device. Autosave requests every {SAVE_POLICY.interval}{' '}
          weeks (two active minutes at 1x); use Save world to keep recent progress. Closing a page
          does not guarantee a save.
        </p>
        {view.mode === 'read-only' && (
          <button
            type="button"
            className="secondary"
            disabled={view.busy}
            onClick={() => {
              void controller.takeOwnership();
            }}
          >
            Take ownership
          </button>
        )}
      </div>
      {[error, view.error, view.loadError, view.save.error, view.halted]
        .filter(Boolean)
        .map((message, index) => (
          <p role="alert" className="error" key={index}>
            {message}
          </p>
        ))}
      {world && settlement && tile && (
        <>
          <section className="world-layout" aria-label="Settlement world">
            <div className="map-panel" ref={mapPanel}>
              <div className="map-heading">
                <h2>{settlement.name}</h2>
                <span>{dateLabel(world.tick)}</span>
              </div>
              <MapCanvas
                view={{
                  ...world.world.map,
                  buildings: world.world.buildings,
                  settlement,
                  project: world.world.project,
                  entities: world.world.entities,
                }}
                selectedTile={selectedTile}
                onSelect={(tile) => select(tile, false)}
                focusRequest={mapFocus}
                dormantFields={view.seasonalCropPercent === 0}
              />
              <ul className="legend" aria-label="Map legend">
                <li>Blue: river</li>
                <li>Dark green: woodland</li>
                <li>
                  {view.seasonalCropPercent === 0
                    ? 'Dashed plots: fields resting in winter'
                    : 'Gold: fields'}
                </li>
                <li>Orange: huts</li>
                <li>Brown: store</li>
                <li>Outline: work in progress</li>
                <li>Dots: residents (illustrative placement)</li>
              </ul>
              <button
                type="button"
                ref={opener}
                className="secondary chronicle-opener"
                aria-expanded={expanded}
                aria-controls="chronicle"
                onClick={openChronicle}
              >
                Open chronicle
              </button>
            </div>
            <aside aria-label="Settlement facts">
              <h2>The settlement</h2>
              <dl>
                <div>
                  <dt>Residents</dt>
                  <dd>{settlement.population}</dd>
                </div>
                <div>
                  <dt>Households</dt>
                  <dd>{settlement.households}</dd>
                </div>
                <div>
                  <dt>Health</dt>
                  <dd>{settlement.health} / 100</dd>
                </div>
                <div>
                  <dt>Food</dt>
                  <dd>
                    {settlement.food} / {view.foodCapacity}
                  </dd>
                </div>
                <div>
                  <dt>Food reserve</dt>
                  <dd>
                    {settlement.population
                      ? `${Math.floor(settlement.food / settlement.population)} whole weeks at current demand`
                      : 'No residents to feed'}
                  </dd>
                </div>
                <div>
                  <dt>Timber</dt>
                  <dd>{settlement.timber}</dd>
                </div>
                <div>
                  <dt>Shelter</dt>
                  <dd>{view.housing}</dd>
                </div>
                <div>
                  <dt>Buildings</dt>
                  <dd>{world.world.buildings.length}</dd>
                </div>
                <div>
                  <dt>Weather</dt>
                  <dd>{world.world.currentWeather?.kind ?? 'Not yet drawn'}</dd>
                </div>
              </dl>
              <p className="note">
                {world.world.project
                  ? `${world.world.project.kind} #${world.world.project.id}: ${world.world.project.progress}/${world.world.project.requiredLabor} labor, ${world.world.project.escrow} timber reserved.`
                  : 'No construction in progress.'}
              </p>
              {world.lastTick && (
                <p className="note">
                  Last week:{' '}
                  {world.lastTick.production.foraging + world.lastTick.production.harvest} food
                  produced, {world.lastTick.food.consumed} consumed,{' '}
                  {world.lastTick.production.gathered} timber gathered.
                </p>
              )}
              <p className="note">
                Seasonal crop factor: {view.seasonalCropPercent}% of spring. Harvests also depend on
                weather, fertility and crop care. Food reserve assumes current demand, before future
                production or spoilage.
              </p>
              <p className="note">
                {world.config.economy.seasonMultipliers[3] === 0
                  ? 'Fields rest in winter. Stored food and limited foraging must cover rations.'
                  : 'This world retains reduced winter crop production.'}
              </p>
              {world.lastTick && (
                <details className="labor-summary">
                  <summary>Last week’s work</summary>
                  <p className="note">Assignments use residents at the start of the week.</p>
                  <dl>
                    <div>
                      <dt>Available workers</dt>
                      <dd>{world.lastTick.labor.workforce}</dd>
                    </div>
                    <div>
                      <dt>Fields</dt>
                      <dd>{world.lastTick.labor.fields.length}</dd>
                    </div>
                    <div>
                      <dt>Foraging</dt>
                      <dd>{world.lastTick.labor.foragers}</dd>
                    </div>
                    <div>
                      <dt>Repairs</dt>
                      <dd>{world.lastTick.labor.repairs}</dd>
                    </div>
                    <div>
                      <dt>Building</dt>
                      <dd>{world.lastTick.labor.builders}</dd>
                    </div>
                    <div>
                      <dt>Timber gathering</dt>
                      <dd>{world.lastTick.labor.gatherers}</dd>
                    </div>
                    <div>
                      <dt>Unassigned</dt>
                      <dd>{world.lastTick.labor.unassigned}</dd>
                    </div>
                    <div>
                      <dt>Unused building labor</dt>
                      <dd>{world.lastTick.labor.unusedConstruction}</dd>
                    </div>
                  </dl>
                </details>
              )}
              <p className="note">
                Map drawings are temporary. Residents are an aggregate population in this phase.
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
                  nx < 64 &&
                  ny >= 0 &&
                  ny < 40
                ) {
                  select(ny * 64 + nx);
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
                  max="63"
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
                  max="39"
                  value={y}
                  onChange={(event) => setY(event.target.value)}
                />
              </label>
              <button type="submit" className="secondary">
                Inspect tile
              </button>
            </form>
            <p aria-live="polite" className="tile-facts">
              Tile {selectedTile}: {tile[2]}, elevation {tile[0]}, fertility {tile[1]}, timber{' '}
              {tile[3]}
              {building
                ? `, ${building.kind} #${building.id}${building.durability === null ? '' : `, durability ${building.durability}`}`
                : ''}
              {project ? `, unfinished ${project.kind} #${project.id}` : ''}.
            </p>
          </section>
          <Chronicle
            key={view.worldSession}
            world={world}
            selectedId={eventId}
            expanded={expanded}
            onClose={closeChronicle}
            onSelect={(id) => {
              const event = world.events[id - 1]!;
              setEventId(id);
              select(event.location.tile);
            }}
          />
        </>
      )}
    </main>
  );
}
