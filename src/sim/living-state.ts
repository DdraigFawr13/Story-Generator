import type { Immutable } from './immutable';
import type { LIVING_CONFIG } from './living-config';
import type { ResidentWorldState, WorldResident } from './resident-world';
import type { TickLedger } from './state';

export type ActivityRole =
  'fieldwork' | 'foraging' | 'repairing' | 'building' | 'gathering' | 'caretaking' | 'resting';
export interface ResidentActivity {
  role: ActivityRole;
  targetId: number | null;
}
export interface LivingResident extends WorldResident {
  activity: ResidentActivity | null;
  lastBirthTick: number | null;
}
export interface PersonHealthLedger {
  id: number;
  before: number;
  after: number;
  homeId: number | null;
  ration: boolean;
  caregiverId: number | null;
}
export interface PersonDeathTrial {
  id: number;
  ageWeeks: number;
  health: number;
  threshold: number;
  draw: number;
}
export interface PersonBirthTrial {
  parentId: number;
  draw: number;
  childId: number | null;
}
export interface PersonLedger {
  openingIds: number[];
  caretakers: { id: number; childIds: number[] }[];
  workers: number[];
  health: PersonHealthLedger[];
  deathTrials: PersonDeathTrial[];
  birthTrials: PersonBirthTrial[];
}
export interface LivingSettlementState extends Omit<
  ResidentWorldState,
  'config' | 'world' | 'lastTick'
> {
  config: typeof LIVING_CONFIG;
  world: Omit<ResidentWorldState['world'], 'residents'> & { residents: LivingResident[] };
  lastTick: (TickLedger & { people: PersonLedger }) | null;
}
export type LivingSettlementSnapshot = Immutable<LivingSettlementState>;
