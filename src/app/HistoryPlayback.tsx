// The history playback (a new world's 250 years replayed on the map): the stage the player draws
// into, and its controls. The player (playback/player.ts) owns the canvas and the clock; this
// component renders the markup and passes the elements to it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { PLAYBACK_EFFECTS, PLAYBACK_TICKS } from '../content';
import type { SimEvent, WorldState } from '../engine';
import { buildPlayback, beatYears, census, type PlaybackData } from './playback/data';
import {
  DEFAULT_SPEED,
  HistoryPlayer,
  SPEEDS,
  estimate,
  type PlayerOptions,
  type PlayerState,
} from './playback/player';
import './playback.css';

interface Props {
  world: WorldState;
  titleOf: (event: SimEvent) => string;
  /** The year to play from. */
  startYear: number;
  /** Back to the normal map at a year. */
  onClose: (year: number) => void;
  onLegends: () => void;
}

const rgb = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

export function HistoryPlayback({ world, titleOf, startYear, onClose, onLegends }: Props) {
  // The log is read once per world; a new title function each render does not rebuild it.
  const data = useMemo(
    () => buildPlayback(world, titleOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world],
  );
  useEffect(() => {
    if (!data) onClose(startYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  if (!data) return null;
  return <Playback data={data} startYear={startYear} onClose={onClose} onLegends={onLegends} />;
}

function Playback({
  data,
  startYear,
  onClose,
  onLegends,
}: {
  data: PlaybackData;
  startYear: number;
  onClose: (year: number) => void;
  onLegends: () => void;
}) {
  const player = useRef<HistoryPlayer | null>(null);
  const [state, setState] = useState<PlayerState>({
    playing: false,
    speed: DEFAULT_SPEED,
    canSkip: false,
    ended: false,
  });
  const [opts, setOpts] = useState<PlayerOptions>({ trade: false, follow: true, hold: false });
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strip = useRef<HTMLCanvasElement>(null);
  const bigYear = useRef<HTMLDivElement>(null);
  const censusEl = useRef<HTMLDivElement>(null);
  const yearLabel = useRef<HTMLDivElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const banner = useRef<HTMLDivElement>(null);
  const bannerKind = useRef<HTMLDivElement>(null);
  const bannerTitle = useRef<HTMLDivElement>(null);
  const bannerStory = useRef<HTMLDivElement>(null);
  const bannerMore = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const closeAt = useRef(onClose);
  closeAt.current = onClose;

  useEffect(() => {
    const made = new HistoryPlayer(
      data,
      {
        stage: stage.current!,
        canvas: canvas.current!,
        strip: strip.current!,
        bigYear: bigYear.current!,
        census: censusEl.current!,
        yearLabel: yearLabel.current!,
        range: range.current!,
        banner: banner.current!,
        bannerKind: bannerKind.current!,
        bannerTitle: bannerTitle.current!,
        bannerStory: bannerStory.current!,
        bannerMore: bannerMore.current!,
        feed: feed.current!,
        tip: tip.current!,
      },
      setState,
    );
    player.current = made;
    made.start(startYear);
    return () => {
      made.destroy();
      player.current = null;
    };
    // The player is made once per playback; the start year only matters when it begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => {
    player.current?.setOptions(opts);
  }, [opts, data]);

  const beats = useMemo(() => beatYears(data), [data]);
  const ticks = useMemo(() => {
    const out: { key: string; year: number; title: string; colour: readonly number[] }[] = [];
    for (const e of data.events) {
      const tick = PLAYBACK_TICKS.find((t) => t.type === e.type || t.also?.includes(e.type));
      if (!tick || e.importance < (tick.minImportance ?? 0)) continue;
      out.push({ key: `${e.id}`, year: e.y, title: e.title, colour: tick.colour });
    }
    return out;
  }, [data]);
  const end = useMemo(() => {
    const now = census(data, data.last);
    // Only the events the map showed: plague and famine count from the same importance as their effect.
    const count = (type: string) =>
      data.events.filter(
        (e) => e.type === type && e.importance >= (PLAYBACK_EFFECTS[type]?.minImportance ?? 0),
      ).length;
    const rows: [string, number][] = [
      ['realms founded', data.civs.length],
      ['wars', count('war_declared')],
      ['razed', count('site_razed')],
      ['great plagues', count('plague')],
      ['great famines', count('famine')],
      ['legends', count('legend_risen')],
    ];
    return { now, rows };
  }, [data]);

  const set = (key: keyof PlayerOptions, value: boolean) =>
    setOpts((o) => ({ ...o, [key]: value }));
  const finish = () => onClose(data.last);

  return (
    <div className="hp-root" data-testid="playback">
      <div className="hp-stage" ref={stage} data-testid="playback-stage">
        <canvas
          ref={canvas}
          width={1024}
          height={1024}
          aria-label="The world's history playing on the map"
        />
        <div className="hp-plate">
          <div className="yr" ref={bigYear}>
            Year 0
          </div>
          <div className="sub" ref={censusEl} />
        </div>
        <button
          type="button"
          className="hp-close"
          onClick={() => onClose(player.current?.year() ?? startYear)}
        >
          Close
        </button>
        <div className="hp-banner" ref={banner}>
          <div className="k" ref={bannerKind} />
          <div className="t" ref={bannerTitle} />
          <div className="s" ref={bannerStory} />
          <div className="more" ref={bannerMore} />
        </div>
        <div className="hp-feed" ref={feed} aria-live="polite" />
        <div className="hp-tip" ref={tip} hidden />
        {state.ended && (
          <div className="hp-end" role="dialog" aria-label="The present day">
            <div className="k">Year {data.last} · the present day</div>
            <div className="t">
              {end.now.realms} realms, {end.now.settlements} settlements and{' '}
              {end.now.people.toLocaleString('en-GB')} people stand at the present day.
            </div>
            <dl>
              {end.rows.map(([label, n]) => (
                <div key={label}>
                  <dd>{n}</dd>
                  <dt>{label}</dt>
                </div>
              ))}
            </dl>
            <div className="acts">
              <button type="button" className="primary" onClick={finish}>
                Explore the map
              </button>
              <button
                type="button"
                title="Closes this card; click a site on the map to watch it"
                onClick={finish}
              >
                Watch a site
              </button>
              <button type="button" onClick={onLegends}>
                Open legends
              </button>
              <button type="button" onClick={() => player.current?.replay()}>
                Replay
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="hp-years" aria-label="History playback controls">
        <div className="row">
          <button
            type="button"
            className="play"
            aria-label={state.playing ? 'Pause history' : 'Play history'}
            onClick={() => player.current?.toggle()}
          >
            {state.playing ? '❚❚' : '▶'}
          </button>
          <div className="yr" ref={yearLabel} data-testid="playback-year">
            Year 0
          </div>
          <div className="speeds" role="group" aria-label="Years per second">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                aria-pressed={state.speed === speed}
                onClick={() => player.current?.setSpeed(speed)}
              >
                {speed === 0.5 ? '½' : speed}
              </button>
            ))}
          </div>
          <span className="unit">
            years a second · {estimate(state.speed, data.last, beats)} for {data.last} years
          </span>
          <button
            type="button"
            className="skip"
            aria-label="Skip to the present"
            hidden={!state.canSkip}
            onClick={() => player.current?.skip()}
          >
            <span className="long">Skip to the present </span>⏭
          </button>
        </div>
        <div className="opts">
          <label>
            <input
              type="checkbox"
              checked={opts.trade}
              onChange={(e) => set('trade', e.target.checked)}
            />{' '}
            Trade
          </label>
          <label>
            <input
              type="checkbox"
              checked={opts.follow}
              onChange={(e) => set('follow', e.target.checked)}
            />{' '}
            Follow<span className="long"> big events</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={opts.hold}
              onChange={(e) => set('hold', e.target.checked)}
            />{' '}
            Pause<span className="long"> on big events</span>
          </label>
        </div>
        <div className="track">
          <canvas
            ref={strip}
            className="strip"
            width={1600}
            height={28}
            aria-label="Each realm's share of all people, year by year"
          />
          <input
            ref={range}
            type="range"
            min={0}
            max={data.last}
            defaultValue={startYear}
            aria-label="Year"
            onChange={(e) => player.current?.scrub(Number(e.target.value))}
          />
          <div className="ticks">
            {ticks.map((tick) => (
              <i
                key={tick.key}
                style={{ left: `${(tick.year / data.last) * 100}%`, background: rgb(tick.colour) }}
                title={`Year ${tick.year} · ${tick.title}`}
              />
            ))}
          </div>
        </div>
        <div className="key">
          {PLAYBACK_TICKS.map((tick) => (
            <span key={tick.type}>
              <i style={{ background: rgb(tick.colour) }} />
              {PLAYBACK_EFFECTS[tick.type]?.label ?? tick.type}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
