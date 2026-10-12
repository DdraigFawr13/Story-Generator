// Diseases (M2.4b): data the yearly history and, from Phase 3, the daily sim read.
// Per-year fields drive history (outbreak, infectivity per link, severity, immunity); the per-day
// fields (incubation, duration) wait for Phase 3.

import type { DiseaseDef } from '../engine';

export const diseases: DiseaseDef[] = [
  {
    id: 'plague',
    name: 'The plague',
    event: 'plague',
    infectivity: 0.35,
    incubation: 4,
    duration: 10,
    severity: [0.1, 0.3],
    ageRisk: { child: 1, adult: 1, elder: 1 },
    outbreak: 0.0005,
    minPop: 200,
    immunityYears: 20,
  },
  {
    id: 'fever',
    name: 'Summer fever',
    event: 'fever',
    infectivity: 0.2,
    incubation: 2,
    duration: 7,
    severity: [0.02, 0.06],
    ageRisk: { child: 2, adult: 0.5, elder: 2 },
    season: 'summer',
    outbreak: 0.003,
    minPop: 100,
    immunityYears: 10,
  },
  {
    id: 'pox',
    name: 'The pox',
    event: 'pox',
    infectivity: 0.5,
    incubation: 12,
    duration: 14,
    severity: [0.05, 0.15],
    ageRisk: { child: 3, adult: 0.6, elder: 1 },
    outbreak: 0.001,
    minPop: 300,
    immunityYears: 30,
  },
];
