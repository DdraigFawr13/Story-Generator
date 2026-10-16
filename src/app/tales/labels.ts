// One collision pass over every text label on the Tales map. Labels carry `data-lbl` (their kind);
// the pass measures them in the DOM and hides the lower-priority one wherever two overlap, or
// where a label meets a control, the key, the pause card or the stage edge. Realm names try
// alternatives first (the short name, then a nudge up or down) so a realm is named wherever it can be.

export type LabelKind = 'tag' | 'realm' | 'cap' | 'faith' | 'town' | 'region';

/** Highest priority first: tags, realm, capital, faith and town names, then region names. */
export const LABEL_ORDER: readonly LabelKind[] = ['tag', 'realm', 'cap', 'faith', 'town', 'region'];

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Things a label must stay clear of: controls, the key, the pause card and the faiths note. */
const BLOCKERS =
  '.tr-chip, .tr-modes, .tr-year, .tr-note, .tr-help, .tr-key, .tr-ask, .tr-zoom, .tr-mk > svg';
/** Pixels of air kept between two labels. */
const GAP = 2;
/** Vertical nudges a realm name may take, after the full and the short name fit nowhere. */
const NUDGES = [14, -14, 28, -28, 42, -42];
/** Sideways shifts tried last for a realm name. */
const SIDEWAYS = [-24, 24, -48, 48];

const boxOf = (el: Element): Box | null => {
  if (el.getClientRects().length === 0) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom } : null;
};
const hits = (a: Box, b: Box) =>
  a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.y0 < b.y1 + GAP && b.y0 < a.y1 + GAP;

export interface LabelReport {
  /** Realm-name labels on the map, and how many of them are showing. */
  realms: number;
  named: number;
}

/** Settles every `[data-lbl]` label inside the stage; safe to call as often as needed. */
export function settleLabels(stage: HTMLElement): LabelReport {
  const frame = stage.getBoundingClientRect();
  const inner: Box = {
    x0: frame.left + 3,
    y0: frame.top + 3,
    x1: frame.right - 3,
    y1: frame.bottom - 3,
  };
  const placed: Box[] = [];
  for (const el of stage.querySelectorAll(BLOCKERS)) {
    if ((el as HTMLElement).dataset.hidden === 'true') continue;
    const box = boxOf(el);
    if (box) placed.push(box);
  }

  const groups = new Map<LabelKind, HTMLElement[]>(LABEL_ORDER.map((k) => [k, []]));
  for (const el of stage.querySelectorAll<HTMLElement>('[data-lbl]')) {
    // A label that is faded out is not on show, so it blocks nothing.
    if (el.classList.contains('off') || el.closest('.leaving')) continue;
    groups.get(el.dataset.lbl as LabelKind)?.push(el);
  }
  // Newest event tags first, so a fresh tag keeps its place and the older one gives way.
  groups.get('tag')!.reverse();
  groups
    .get('tag')!
    .sort(
      (a, b) => Number(b.classList.contains('tr-tag')) - Number(a.classList.contains('tr-tag')),
    );

  let realms = 0;
  let named = 0;
  const set = (el: HTMLElement, form: string, dx: number, dy: number) => {
    if (form && el.dataset.form !== form) el.dataset.form = form;
    el.style.setProperty('--dx', `${dx}px`);
    el.style.setProperty('--dy', `${dy}px`);
  };
  const show = (el: HTMLElement, on: boolean) => {
    if (on) el.removeAttribute('data-hide');
    else if (el.dataset.hide !== '1') el.dataset.hide = '1';
  };

  for (const kind of LABEL_ORDER) {
    for (const el of groups.get(kind)!) {
      const isRealm = kind === 'realm';
      const forms = isRealm && el.querySelector('.short') ? ['full', 'short'] : ['full'];
      const height = el.getBoundingClientRect().height;
      const dys = kind === 'tag' ? [0, height + 2, -(height + 2)] : isRealm ? [0, ...NUDGES] : [0];
      // (dx, dy) in the order tried: straight, then up and down; for a realm, last of all, sideways.
      const tries: [number, number][] = dys.map((dy) => [0, dy]);
      if (isRealm)
        for (const dx of SIDEWAYS) for (const dy of [0, 14, -14, 28, -28]) tries.push([dx, dy]);
      let done: Box | null = null;
      // Per nudge the full name is tried before the short one, so a name only shortens when it must.
      search: for (const [dx0, dy] of tries) {
        for (const form of forms) {
          set(el, isRealm ? form : '', dx0, dy);
          let box = boxOf(el);
          if (!box) continue;
          let dx = dx0;
          if (isRealm) {
            // A realm name may slide in from the edge of the screen.
            let slide = 0;
            if (box.x0 < inner.x0) slide = inner.x0 - box.x0;
            else if (box.x1 > inner.x1) slide = inner.x1 - box.x1;
            if (slide) {
              box = { ...box, x0: box.x0 + slide, x1: box.x1 + slide };
              dx += slide;
            }
          }
          if (box.x0 < inner.x0 || box.x1 > inner.x1 || box.y0 < inner.y0 || box.y1 > inner.y1) {
            continue;
          }
          if (placed.some((p) => hits(box, p))) continue;
          if (dx !== dx0) set(el, isRealm ? form : '', dx, dy);
          done = box;
          break search;
        }
      }
      if (isRealm) realms += 1;
      if (done) {
        placed.push(done);
        show(el, true);
        if (isRealm) named += 1;
      } else {
        set(el, isRealm ? 'full' : '', 0, 0);
        show(el, false);
      }
    }
  }
  return { realms, named };
}
