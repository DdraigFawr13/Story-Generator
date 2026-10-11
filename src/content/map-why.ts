// "Why is it like this?" rules for the world-map inspector (Phase 1, M1.4).
// Pure data: src/app/why.ts evaluates the table against a cell. Adding a rule
// is a row here. In `text`, `{n}` is the rule's number, `{s}` an "s" unless it is 1, and `{dir}` the compass
// side the wind comes from.

export type WhyCondition =
  | { kind: 'below'; field: WhyField; value: number }
  | { kind: 'atLeast'; field: WhyField; value: number }
  | { kind: 'flag'; field: WhyField }
  /** Dry, with land `rise` m higher than the cell within `reach` cells upwind. n = distance. */
  | { kind: 'rainShadow'; rainBelow: number; rise: number; reach: number }
  /** Wet, with the upwind neighbour 1 to `reach` cells away lower. */
  | { kind: 'windward'; rainAbove: number; reach: number };

export type WhyField =
  'rainfall' | 'elevation' | 'seaDistance' | 'floodplain' | 'wildness' | 'tempSummer' | 'roads';

export interface WhyRule {
  id: string;
  /** Layer the "show" button switches to. */
  layer: string;
  /** Bold lead-in, then the sentence. */
  lead: string;
  text: string;
  when: WhyCondition;
  /** What `{n}` means: a distance, or the elevation rounded to 100 m. */
  number?: 'distance' | 'seaDistance' | 'elevation';
}

export const WHY_MAX_LINES = 4;
export const WHY_FALLBACK = { lead: 'Temperate:', text: 'nothing extreme here' };

export const WHY_RULES: WhyRule[] = [
  {
    id: 'rain-shadow',
    layer: 'rainfall',
    lead: 'Dry:',
    text: 'rain shadow of the range {n} cell{s} to the {dir}',
    when: { kind: 'rainShadow', rainBelow: 400, rise: 1500, reach: 25 },
    number: 'distance',
  },
  {
    id: 'windward',
    layer: 'rainfall',
    lead: 'Wet:',
    text: 'winds drop their rain on this slope',
    when: { kind: 'windward', rainAbove: 1500, reach: 3 },
  },
  {
    id: 'maritime',
    layer: 'seaDistance',
    lead: 'Mild:',
    text: 'the sea is {n} cell{s} away, so winters are soft',
    when: { kind: 'below', field: 'seaDistance', value: 6 },
    number: 'seaDistance',
  },
  {
    id: 'continental',
    layer: 'tempSummer',
    lead: 'Harsh swings:',
    text: '{n} cells from the sea',
    when: { kind: 'atLeast', field: 'seaDistance', value: 40 },
    number: 'seaDistance',
  },
  {
    id: 'altitude',
    layer: 'elevation',
    lead: 'Cold:',
    text: 'high ground at {n} m',
    when: { kind: 'atLeast', field: 'elevation', value: 1500 },
    number: 'elevation',
  },
  {
    id: 'floodplain',
    layer: 'fertility',
    lead: 'Rich soil:',
    text: 'river floodplain',
    when: { kind: 'flag', field: 'floodplain' },
  },
  {
    id: 'wild',
    layer: 'wildness',
    lead: 'Wild:',
    text: 'far from farmland',
    when: { kind: 'atLeast', field: 'wildness', value: 70 },
  },
  {
    id: 'road',
    layer: 'travelCost',
    lead: 'Road:',
    text: 'many routes pass here',
    when: { kind: 'atLeast', field: 'roads', value: 3 },
  },
];
