import { canonicalJson } from './canonical';

export type Immutable<T> = T extends object ? { readonly [Key in keyof T]: Immutable<T[Key]> } : T;

export function capture<T>(value: T): Immutable<T> {
  // Encoding validates data before cloning; no getters or hidden state are admitted.
  const copy: unknown = JSON.parse(canonicalJson(value));
  function freeze(item: unknown): void {
    if (item !== null && typeof item === 'object') {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  }
  freeze(copy);
  return copy as Immutable<T>;
}
