import { calendarAtTick } from '../sim/clock';
import type { Immutable } from '../sim/immutable';
import type { SettlementEvent } from '../sim/state';

export function dateLabel(tick: number): string {
  const date = calendarAtTick(tick);
  return date.kind === 'founding'
    ? 'Founding — before spring'
    : `Year ${date.year} · ${date.season} · week ${date.week}`;
}
export function headline(event: Immutable<SettlementEvent>): string {
  const f = event.facts;
  switch (event.type) {
    case 'founding':
      return `${f.population} residents found a settlement`;
    case 'weather':
      return `${f.kind === 'normal' ? 'Ordinary' : f.kind === 'wet' ? 'Wet' : 'Drought'} weather begins in ${f.season}`;
    case 'construction_started':
      return `Work begins on a ${f.kind} with ${f.cost} timber reserved`;
    case 'construction_completed':
      return `A ${f.kind} is completed`;
    case 'harvest':
      if (f.season === 'winter' && f.seasonMultiplier === 0 && f.total === 0)
        return 'Winter fields rest; no crop harvest';
      return `${f.season} harvest brings ${f.total} food`;
    case 'food_overflow':
      return `${f.amount} food is lost beyond storage capacity`;
    case 'food_spoilage':
      return `${f.amount} stored food spoils`;
    case 'maintenance':
      return `Buildings are repaired with ${f.timberSpent} timber`;
    case 'building_decay':
      return 'Buildings weather at the season’s end';
    case 'building_removed':
      return `A worn ${f.kind} is lost`;
    case 'deaths':
      return `${f.count} ${f.count === 1 ? 'resident dies' : 'residents die'}`;
    case 'births':
      return `${f.count} ${f.count === 1 ? 'child is' : 'children are'} born`;
    case 'extinction':
      return 'The settlement has no remaining residents';
    case 'shortage_started':
      return `Food falls short of demand by ${f.shortfall}`;
    case 'shortage_recovered':
      return 'Residents receive full rations again';
    case 'surplus_started':
      return 'Food reserves reach twelve weeks of current demand';
    case 'surplus_ended':
      return 'Food reserves fall below twelve weeks of current demand';
  }
}
export function eventDetails(event: Immutable<SettlementEvent>) {
  const facts = Object.entries(event.facts).map(([label, value]) => ({
    label: readable(label),
    value:
      (label === 'weatherMultiplier' || label === 'seasonMultiplier') && typeof value === 'number'
        ? `${value / 10}%`
        : display(value),
  }));
  const effects = Object.entries(event.effects).map(([label, value]) => {
    if (value && typeof value === 'object' && 'before' in value && 'after' in value)
      return {
        label: readable(label),
        value: `${display(value.before)} → ${display(value.after)}`,
      };
    return { label: readable(label), value: display(value) };
  });
  return { facts, effects };
}
function readable(label: string): string {
  return label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
function display(value: unknown): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(display).join('\n') : 'None';
  if (typeof value === 'object')
    return Object.entries(value)
      .map(([key, entry]) => `${readable(key)}: ${display(entry)}`)
      .join('; ');
  return String(value);
}
export type { SettlementEvent };
