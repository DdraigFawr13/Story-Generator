// Diplomacy: sworn alliances, calls to arms, betrayal, vassalage and peace by marriage. Tune the
// numbers here; the engine reads only this table (engine/history/diplomacy.ts). Grievance sits on
// the scale of the history rules: a raid 1, an insult 0.6, and a war needs at least 1.

import type { DiplomacyRules } from '../engine';

export const DIPLOMACY: DiplomacyRules = {
  alliance: {
    // Each decade, times the reasons (shared enemy, one faith, a marriage, trade): a civ with two reasons swears 3 times in 5.
    chance: 0.3,
    maxAllies: 2,
    // Under the 1 a war needs: a wound deep enough for war keeps two peoples apart.
    maxGrievance: 1,
    // Strangeness is 0 for twins and about 1.5 typical; past 3 the ways are too far apart.
    maxStrangeness: 3,
    // At or over the 1 a war needs: both hold the third people at fault.
    sharedEnemy: 1,
    // A match between two ruling houses is remembered four decades.
    marriageYears: 40,
    // As a free city's pact (0.5): half the ally's strength stands behind its friend.
    aidShare: 0.5,
  },
  call: {
    // At honour 5 an ally comes half the time; each honour point moves it 5 in 100.
    answerBase: 0.5,
    answerHonour: 0.05,
    // The same gods add a tenth.
    sameFaith: 0.1,
    // A broken oath is a wrong worth two raids; an ally who came is resented a little less than a raid.
    grievanceRefused: 2,
    grievanceJoined: 0.8,
  },
  betrayal: {
    // Each decade, times the drift (about 1 for ordinary strangers): one pair in thirty-five (Morgan asked for twice the betrayal, 2026-10-17).
    chance: 0.03,
    // Each term is worth one ordinary stranger's drift.
    faithSplit: 1,
    rivals: 1,
    weak: 1,
    // A side under half the other's strength is weak.
    weakRatio: 0.5,
    // A betrayer one and a half times as strong marches at once.
    attackRatio: 1.5,
    // Allies who swore or fought side by side within a decade keep faith that long.
    graceYears: 10,
    // A betrayal is remembered like a murder, a little less (intrigue murder 3).
    grievance: 3,
    // A blood feud between the rulers' houses is one more reason to part.
    feud: 1,
  },
  vassal: {
    // Two towns lost and a rival twice as strong: the loser may bend the knee.
    minTaken: 2,
    strengthRatio: 2,
    chance: 0.6,
    // A twentieth of the stores a year.
    tributeShare: 0.05,
    // A decade of fealty before a revolt.
    minYears: 10,
    revoltChance: 0.1,
    // Double while the overlord fights elsewhere.
    overlordAtWar: 2,
    // A vassal half as strong as its overlord is no longer afraid (it was under half when it knelt).
    revoltRatio: 0.5,
    // A revolt is a war and a wrong at once: between a raid and a murder.
    grievanceRevolt: 1.5,
  },
  marriagePeace: {
    // Each year of a war, times the two kin values over 10 (about 1 for kin 5 each).
    chance: 0.2,
    minYears: 1,
    // Half the weddings that end a war also bind the peoples as allies.
    allianceChance: 0.5,
  },
  phrases: {
    why: {
      enemy: 'against the {enemy}',
      faith: 'in the name of {faith}',
      marriage: 'sealed by the marriage of {a} and {b}',
      trade: 'for the trade that ran between them',
    },
    betrayed: {
      faith: 'their gods had parted',
      rivals: 'their rulers were rivals',
      feud: 'the blood feud between their houses',
      weak: 'the {victim} had grown weak',
      strange: 'their ways had grown apart',
    },
    outcome: { war: 'and marched on them', renounced: 'and went their own way' },
    outcomeShort: { war: 'marched on them', renounced: 'went their own way' },
    years: '{n} years',
    oneYear: 'a year',
  },
};
