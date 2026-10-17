// The marks of the Tales explore state: one small glyph a kind of event, drawn in the kind's colour
// with an ink outline, the town names and the town hit targets. Positions are percentages of the
// map; sizes are pixels, so a mark keeps its size however far the map is zoomed.

import { useMemo, type CSSProperties } from 'react';
import { groupTitle, type MarkCluster, type MarkEvent } from './explore';
import { useFading } from './markers';
import { PAUSE_KINDS, type PauseKind } from './pauses';
import { emptiedBy, placeLine, type PlaceInfo, type PlaceKind } from '../places';
import { workLine, type WorkKind, type WorkMark } from './works';

const INK = '#2d2a25';

type Part = { d: string; fill?: boolean };
/** Simple paths on a 24 by 24 box. Closed shapes are filled; lines are drawn twice (ink, colour). */
const GLYPHS: Record<PauseKind, Part[]> = {
  legend: [{ d: 'M12 2l3 7 7 .6-5.3 4.7L18.2 22 12 18.2 5.8 22l1.5-7.7L2 9.6 9 9z', fill: true }],
  war: [{ d: 'M5 4l14 15M19 4L5 19' }, { d: 'M12.5 17l5-5M11.5 17l-5-5' }],
  realm: [{ d: 'M6 3v18' }, { d: 'M6 4h13l-3.5 4.5L19 13H6z', fill: true }],
  battle: [{ d: 'M12 3v13M7.5 16h9M12 16v5' }],
  ruler: [{ d: 'M3.5 19l-1-11 5.5 4 4-7 4 7 5.5-4-1 11z', fill: true }],
  town: [
    {
      d: 'M12 2c.8 4.2 6.5 6.2 6.5 12.2a6.5 6.5 0 0 1-13 0c0-3 1.8-4.6 3-6.6.9 1.8 1.2 2.9 2.6 3.2C10.3 8.2 10.4 5 12 2z',
      fill: true,
    },
  ],
  hardship: [
    { d: 'M12 3c3.2 5.2 6.3 8 6.3 12a6.3 6.3 0 0 1-12.6 0c0-4 3.1-6.8 6.3-12z', fill: true },
  ],
  treasure: [{ d: 'M7 4h10l5 6-10 11L2 10z', fill: true }, { d: 'M2 10h20M9 10l3 11 3-11' }],
  faith: [
    {
      d: 'M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5M4.5 4.5L7 7M17 17l2.5 2.5M19.5 4.5L17 7M7 17l-2.5 2.5',
    },
    { d: 'M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6z', fill: true },
  ],
  settlers: [{ d: 'M3 16Q3 6 12 6t9 10z', fill: true }, { d: 'M2 16h20M7 20h.1M17 20h.1' }],
};

const colourOf = (kind: PauseKind) => PAUSE_KINDS.find((k) => k.id === kind)!.colour;

/** One glyph: 13 px, the kind's colour inside an ink outline. */
export function Glyph({ kind, size = 13 }: { kind: PauseKind; size?: number }) {
  const colour = colourOf(kind);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {GLYPHS[kind].map((p, i) =>
        p.fill ? (
          <path
            key={i}
            d={p.d}
            fill={colour}
            stroke={INK}
            strokeWidth="1.3"
            strokeLinejoin="round"
            paintOrder="stroke"
          />
        ) : (
          <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={p.d} stroke={INK} strokeWidth="3.8" />
            <path d={p.d} stroke={colour} strokeWidth="2.4" />
          </g>
        ),
      )}
    </svg>
  );
}

interface MarkProps {
  clusters: readonly MarkCluster<MarkEvent & { title: string }>[];
  width: number;
  height: number;
  /** Full glyphs and counts (zoomed in); otherwise a small dot for each mark. */
  detail: boolean;
  /** Cell of the open card, to mark its glyph. */
  open: number | null;
  onOpen: (cluster: MarkCluster) => void;
}

/** The event marks. One that leaves fades out; one that arrives fades in. */
export function ExploreMarks({ clusters, width, height, detail, open, onOpen }: MarkProps) {
  const items = useMemo(
    () =>
      clusters.map((c) => ({
        key: `ev:${c.cell}`,
        cell: c.cell,
        kind: c.kind,
        count: c.events.length,
        title: groupTitle(c.events),
      })),
    [clusters],
  );
  const byCell = useMemo(() => new Map(clusters.map((c) => [c.cell, c])), [clusters]);
  const shown = useFading(items, 450);
  return (
    <>
      {shown.map((m) => (
        <button
          key={m.key}
          type="button"
          className={`tr-ev${detail ? '' : ' dot'}${m.leaving ? ' leaving' : ''}${
            open === m.cell ? ' open' : ''
          }`}
          data-testid="event-mark"
          data-kind={m.kind}
          style={{
            left: `${(((m.cell % width) + 0.5) / width) * 100}%`,
            top: `${((Math.floor(m.cell / width) + 0.5) / height) * 100}%`,
          }}
          title={m.title}
          aria-label={m.title.replace(/\n/g, '. ')}
          tabIndex={m.leaving ? -1 : 0}
          onClick={() => {
            const c = byCell.get(m.cell);
            if (c) onOpen(c);
          }}
        >
          {detail ? <Glyph kind={m.kind} /> : <i style={{ background: colourOf(m.kind) }} />}
          {detail && m.count > 1 && <b>{m.count}</b>}
        </button>
      ))}
    </>
  );
}

export interface TownMark {
  id: number;
  name: string;
  cell: number;
}

interface TownsProps {
  towns: readonly TownMark[];
  width: number;
  height: number;
  /** Names show (zoomed in far enough). */
  named: boolean;
  /** Towns whose names the capital layer already writes. */
  skip: ReadonlySet<number>;
  /** Cell of the open card. */
  open: number | null;
  onOpen: (id: number) => void;
}

/** Town names at close zoom and an invisible hit target over every town. */
export function Towns({ towns, width, height, named, skip, open, onOpen }: TownsProps) {
  return (
    <>
      {towns.map((t) => {
        const pos = {
          left: `${(((t.cell % width) + 0.5) / width) * 100}%`,
          top: `${((Math.floor(t.cell / width) + 0.5) / height) * 100}%`,
        };
        return (
          <div key={t.id}>
            {!skip.has(t.id) && (
              <div className={`tr-tn${named ? '' : ' off'}`} style={pos}>
                <span data-lbl="town" className={named ? '' : 'off'}>
                  {t.name}
                </span>
              </div>
            )}
            <button
              type="button"
              className={`tr-hit${open === t.cell ? ' open' : ''}`}
              style={pos}
              aria-label={`Town: ${t.name}`}
              data-testid="town-hit"
              onClick={() => onOpen(t.id)}
            />
          </div>
        );
      })}
    </>
  );
}

/** Great works as engraved ink shapes on a pale fill, on the same 24 by 24 box. */
const WORK_GLYPHS: Record<WorkKind, string> = {
  tower: 'M12 1.5l4.5 6.5H15v14H9V8H7.5z',
  wall: 'M2 20v-9h2.4V8h3.2v3h2.8V8h3.2v3h2.8V8h3.2v3H22v9z',
  bridge: 'M1.5 8h21v9H20a4 4 0 0 0-8 0 4 4 0 0 0-8 0H1.5z',
  grove:
    'M7 3a4.5 4.5 0 0 1 1 8.9V21H6v-9.1A4.5 4.5 0 0 1 7 3zM17 3a4.5 4.5 0 0 1 1 8.9V21h-2v-9.1A4.5 4.5 0 0 1 17 3z',
  item: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z',
};

/** One work's shape: warm stone inside an ink outline; a fallen one is outlined in dashes. */
export function WorkGlyph({
  kind,
  size = 13,
  fallen = false,
}: {
  kind: WorkKind;
  size?: number;
  fallen?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={WORK_GLYPHS[kind]}
        fill={fallen ? 'none' : '#c19a5b'}
        stroke={INK}
        strokeWidth={fallen ? 1.6 : 2}
        strokeDasharray={fallen ? '2.4 1.8' : undefined}
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}

interface WorkMarksProps {
  works: readonly WorkMark[];
  width: number;
  height: number;
  year: number;
  /** Zoomed in: larger shapes. */
  detail: boolean;
  onOpen: (work: WorkMark) => void;
}

/** The great works standing at the year shown, up and to the left of their town; fallen ones fade. */
export function WorkMarks({ works, width, height, year, detail, onOpen }: WorkMarksProps) {
  return (
    <>
      {works.map((w) => {
        const fallen = w.fell !== undefined && w.fell <= year;
        const line = workLine(w, year);
        return (
          <button
            key={w.key}
            type="button"
            className={`tr-wk${detail ? '' : ' small'}${fallen ? ' fallen' : ''}`}
            data-testid="work-mark"
            data-kind={w.kind}
            style={
              {
                left: `${(((w.cell % width) + 0.5) / width) * 100}%`,
                top: `${((Math.floor(w.cell / width) + 0.5) / height) * 100}%`,
                '--slot': w.slot,
              } as CSSProperties
            }
            title={line}
            aria-label={line}
            onClick={() => onOpen(w)}
          >
            <WorkGlyph kind={w.kind} size={detail ? 17 : 12} fallen={fallen} />
          </button>
        );
      })}
    </>
  );
}

/** Perilous places as cool grey stone with an ink outline; an opening is cut out (even-odd). */
const PLACE_GLYPHS: Record<PlaceKind, string> = {
  // Two broken columns under a fallen lintel.
  ruin: 'M4 21V8.5h4.2V21zM15.8 21v-9l2.1-1.6 2.1 1.1V21zM3 6.8l7.6-2.6.8 2.2-7.6 2.6z',
  // A timbered mouth in the hillside.
  'old-mine': 'M1.5 21l4.2-13h12.6l4.2 13zM8.6 21v-8.2h6.8V21z',
  // A long mound with its standing stone.
  barrow: 'M1.5 20.5a10.5 7.5 0 0 1 21 0zM10.8 3.5h2.6l.7 7h-4z',
  // A cave mouth under a rounded rock.
  lair: 'M1.5 21c1.2-7.8 5.4-13 10.5-13s9.3 5.2 10.5 13zM7.8 21a4.2 5.2 0 0 1 8.4 0z',
  // Three standing stones.
  aura: 'M3.2 21V11.2l2.4-2.2 2.4 2V21zM9.6 21V5.6l2.4-2.4 2.4 2.4V21zM16 21V11l2.4-2.2 2.4 2.2v10z',
};

/** One place's shape; an emptied place is outlined in dashes. */
export function PlaceGlyph({
  kind,
  size = 13,
  emptied = false,
}: {
  kind: PlaceKind;
  size?: number;
  emptied?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={PLACE_GLYPHS[kind]}
        fill={emptied ? 'none' : '#a3a69c'}
        fillRule="evenodd"
        stroke={INK}
        strokeWidth={emptied ? 1.6 : 1.8}
        strokeDasharray={emptied ? '2.4 1.8' : undefined}
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}

interface PlaceMarksProps {
  places: readonly PlaceInfo[];
  width: number;
  height: number;
  year: number;
  /** Zoomed in: larger shapes. */
  detail: boolean;
  /** Id of the open place's card. */
  open: number | null;
  onOpen: (place: PlaceInfo) => void;
}

/** The perilous places there were by the year shown, each at its own cell. */
export function PlaceMarks({ places, width, height, year, detail, open, onOpen }: PlaceMarksProps) {
  return (
    <>
      {places.map((p) => {
        const emptied = emptiedBy(p, year);
        const line = placeLine(p, year);
        return (
          <button
            key={p.id}
            type="button"
            className={`tr-pl${detail ? '' : ' small'}${emptied ? ' emptied' : ''}${
              open === p.id ? ' open' : ''
            }`}
            data-testid="place-mark"
            data-kind={p.kind}
            style={{
              left: `${(((p.cell % width) + 0.5) / width) * 100}%`,
              top: `${((Math.floor(p.cell / width) + 0.5) / height) * 100}%`,
            }}
            title={line}
            aria-label={line}
            onClick={() => onOpen(p)}
          >
            <PlaceGlyph kind={p.kind} size={detail ? 16 : 11} emptied={emptied} />
          </button>
        );
      })}
    </>
  );
}
