import { canonicalJson, isImmutableCanonical } from './canonical';

export type Immutable<T> = T extends object ? { readonly [Key in keyof T]: Immutable<T[Key]> } : T;

export function capture<T>(value: T): Immutable<T> {
  // Encoding validates data before cloning; no getters or hidden state are admitted.
  canonicalJson(value);
  function isolate(item: unknown): unknown {
    if (typeof item === 'number' && Object.is(item, -0)) return 0;
    if (item === null || typeof item !== 'object') return item;
    if (isImmutableCanonical(item)) return item;
    const copy = Array.isArray(item)
      ? item.map(isolate)
      : Object.fromEntries(Object.entries(item).map(([key, child]) => [key, isolate(child)]));
    return Object.freeze(copy);
  }
  return isolate(value) as Immutable<T>;
}
