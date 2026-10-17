// A house's page head and family tree. The tree is a panning frame of cards joined by elbow lines;
// nothing is drawn that the history did not log (see tree.ts).

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { yearText, type Id } from '../../engine';
import { Link, plural, useLegends } from '../legends-ctx';
import { CARD_H, CARD_W, houseTree, layoutTree, type LaidCard, type TreeRow } from './tree';

/** The house header and its tree. `focus` is the person the reader came from, if a member. */
export function HousePage({
  id,
  focus,
  shade,
}: {
  id: Id;
  focus?: Id | undefined;
  shade: (civId: Id | null) => string;
}) {
  const { world, content } = useLegends();
  const tree = useMemo(() => houseTree(world, id, content, focus), [world, id, content, focus]);
  if (!tree) return null;
  const { header, rows } = tree;
  return (
    <section className="pp-tree-page" aria-label={`House ${header.name}`}>
      <h1>{header.name}</h1>
      <p className="pp-tree-role">{header.role}</p>
      <ul className="pp-tree-chips">
        <li>Founded Year {yearText(header.founded)}</li>
        <li>
          Founder{' '}
          <Link to={{ kind: 'person', id: header.founderId }} className="pp-ln">
            {header.founderName}
          </Link>
        </li>
        <li>
          {header.members} {plural(header.members, 'person', 'people')} on record
        </li>
        {header.seats > 0 && (
          <li>
            {header.seats} held a seat
            {header.realms.length > 0 && <> ({header.realms.join(', ')})</>}
          </li>
        )}
        {header.end && (
          <li>
            Lost the seat of the {header.end.civ} in Year {yearText(header.end.year)} to{' '}
            <Link to={{ kind: 'person', id: header.end.byId }} className="pp-ln">
              {header.end.byName}
            </Link>
            {header.end.houseId !== undefined && (
              <>
                {' of '}
                <Link to={{ kind: 'dynasty', id: header.end.houseId }} className="pp-ln">
                  {header.end.house}
                </Link>
              </>
            )}
          </li>
        )}
      </ul>
      <TreeFrame key={`${id}:${focus ?? ''}`} name={header.name} rows={rows} shade={shade} />
    </section>
  );
}

/** Narrower than this, the tree becomes the register. */
const REGISTER_BELOW = 600;

function TreeFrame({
  name,
  rows,
  shade,
}: {
  name: string;
  rows: TreeRow[];
  shade: (civId: Id | null) => string;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<Id>>(new Set());
  const frame = useRef<HTMLDivElement>(null);
  // Narrow screens get the register (one card a row) instead of the panning tree.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const register = width > 0 && width < REGISTER_BELOW ? { width } : undefined;
  const layout = useMemo(
    () => layoutTree(rows, expanded, register),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, expanded, register?.width],
  );
  // The card that was tapped, so the frame can follow it when the tree reflows.
  const anchor = useRef<{ id: Id; x: number; y: number } | null>(null);
  const alone = rows.length <= 1;

  // First layout: the focus person, else the founder, in view (and centred across in the tree).
  const placed = useRef(false);
  useLayoutEffect(() => {
    const el = frame.current;
    const card = layout.cards.find((c) => c.row.focus) ?? layout.cards[0];
    if (placed.current || width === 0 || !el || !card) return;
    placed.current = true;
    if (register) {
      if (!card.row.focus) return;
      const page = el.closest('.pp-scroll');
      if (page) page.scrollTop += el.getBoundingClientRect().top + card.y - page.clientHeight / 3;
      return;
    }
    el.scrollLeft = card.x + CARD_W / 2 - el.clientWidth / 2;
    el.scrollTop = card.row.focus ? card.y + CARD_H / 2 - el.clientHeight / 2 : 0;
  }, [layout, width, register]);

  // After a branch opens or closes, the tapped card stays where it was on screen.
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = frame.current;
    if (!a || !el) return;
    anchor.current = null;
    const card = layout.cards.find((c) => c.row.id === a.id);
    if (!card) return;
    const scroller = register ? el.closest('.pp-scroll') : el;
    if (!scroller) return;
    if (!register) scroller.scrollLeft += card.x - a.x;
    scroller.scrollTop += card.y - a.y;
  }, [layout, register]);

  // A mouse drags the tree around; touch already pans the frame.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (register || e.pointerType !== 'mouse' || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a, button')) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    e.currentTarget.scrollLeft -= e.clientX - d.x;
    e.currentTarget.scrollTop -= e.clientY - d.y;
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    drag.current = null;
  };

  const toggle = (card: LaidCard) => {
    anchor.current = { id: card.row.id, x: card.x, y: card.y };
    setExpanded((was) => {
      const next = new Set(was);
      if (!next.delete(card.row.id)) next.add(card.row.id);
      return next;
    });
  };

  return (
    <>
      <div
        ref={frame}
        className={`pp-tree-frame${register ? ' register' : ''}`}
        data-testid="house-tree"
        role="group"
        aria-label={`Family tree of ${name}`}
        style={register ? undefined : { height: `min(70vh, ${layout.height}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="pp-tree-canvas" style={{ width: layout.width, height: layout.height }}>
          <svg width={layout.width} height={layout.height} aria-hidden="true">
            {layout.edges.map((e) => {
              if (register) {
                // A rail down from the parent's left edge, then a short arm into the child.
                const x = e.x1 + 8;
                return (
                  <path
                    key={e.to}
                    className={e.line ? 'line' : undefined}
                    d={`M${x} ${e.y1 + CARD_H}V${e.y2 + CARD_H / 2}H${e.x2}`}
                  />
                );
              }
              const pill = layout.cards.find((c) => c.row.id === e.from)?.pill;
              const x1 = e.x1 + CARD_W / 2;
              const y1 = e.y1 + CARD_H + (pill ? 24 : 0);
              const x2 = e.x2 + CARD_W / 2;
              const bus = e.y2 - 12;
              return (
                <path
                  key={e.to}
                  className={e.line ? 'line' : undefined}
                  d={`M${x1} ${y1}V${bus}H${x2}V${e.y2}`}
                />
              );
            })}
          </svg>
          {layout.cards.map((card) => (
            <div key={card.row.id}>
              <Card card={card} shade={shade} />
              {card.pill && (
                <button
                  type="button"
                  className={`pp-tree-pill${register ? ' in' : ''}`}
                  aria-expanded={card.expanded}
                  style={
                    register
                      ? { left: card.x + card.w - 6, top: card.y + 6 }
                      : { left: card.x + CARD_W / 2, top: card.y + CARD_H + 4 }
                  }
                  onClick={() => toggle(card)}
                >
                  {card.expanded
                    ? 'Hide children'
                    : `+${card.hidden} ${plural(card.hidden, 'child', 'children')}`}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      {alone ? (
        <p className="pp-tree-note">No children of this house are on record.</p>
      ) : (
        <p className="pp-tree-note">
          Heavier line: the line of the seat. {'\u265b'} held a seat.
          {register ? '' : ' Drag the tree to see more of it.'}
        </p>
      )}
    </>
  );
}

function Card({ card, shade }: { card: LaidCard; shade: (civId: Id | null) => string }) {
  const { row } = card;
  const spouse = row.spouses[0];
  const more = row.spouses.length - 1;
  const what = row.ruled
    ? row.ruled.realm
      ? `\u265b Ruler of the ${row.ruled.realm}`
      : '\u265b Held a seat'
    : row.legend
      ? 'Legend'
      : row.role;
  return (
    <div
      className={`pp-tree-card${row.focus ? ' focus' : ''}${row.ruled ? ' ruler' : ''}${
        card.pill ? ' kids' : ''
      }`}
      style={{
        left: card.x,
        top: card.y,
        width: card.w,
        height: CARD_H,
        borderLeftColor: shade(row.civId),
      }}
    >
      <Link
        to={{ kind: 'person', id: row.id }}
        className="pp-tree-name"
        title={
          row.ruled?.year === undefined
            ? row.name
            : `${row.name}: took the seat in Year ${yearText(row.ruled.year)}`
        }
      >
        {row.name}
        {row.legend && <i className="gold" aria-label="legend" />}
      </Link>
      {spouse && (
        <span className="pp-tree-spouse">
          m.{' '}
          <Link to={{ kind: 'person', id: spouse.id }} className="pp-ln plain">
            {spouse.name}
          </Link>
          {spouse.house && <small> of {spouse.house}</small>}
          {spouse.peace !== undefined && (
            <em title={spouse.peace ? `Ended the war with ${spouse.peace}` : undefined}>
              {' '}
              wed for peace
            </em>
          )}
          {more > 0 && <small> +{more}</small>}
        </span>
      )}
      <span className="pp-tree-years">
        {row.years}
        {row.death && (
          <em>
            {' '}
            {'·'} {row.death}
          </em>
        )}
      </span>
      {what && <span className="pp-tree-what">{what}</span>}
    </div>
  );
}
