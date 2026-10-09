// Derived encoding cache only: deeply frozen, already validated data cannot
// change. Weak keys keep this independent of world history and GC timing.
const frozenEncodings = new WeakMap<object, string>();
export function isImmutableCanonical(value: object): boolean {
  return frozenEncodings.has(value);
}
function immutableChild(value: unknown): boolean {
  if (typeof value === 'number' && Object.is(value, -0)) return false;
  return value === null || typeof value !== 'object' || frozenEncodings.has(value);
}

// Shared Node/browser encoding; hashing and storage belong to adapters.
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(item: unknown): string {
    if (item === null) return 'null';
    if (typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) throw new Error('Canonical numbers must be safe integers.');
      return Object.is(item, -0) ? '0' : String(item);
    }
    if (typeof item !== 'object') throw new Error('Unsupported canonical value.');
    const cached = frozenEncodings.get(item);
    if (cached !== undefined) return cached;
    if (ancestors.has(item)) throw new Error('Canonical payload must not contain cycles.');
    ancestors.add(item);
    try {
      if (Object.getOwnPropertySymbols(item).length)
        throw new Error('Symbol keys are unsupported.');
      if (Array.isArray(item)) {
        if (Object.getOwnPropertyNames(item).length !== item.length + 1) {
          throw new Error('Arrays must be dense and have no extra properties.');
        }
        const entries: string[] = [];
        let reusable = Object.isFrozen(item) && Object.getPrototypeOf(item) === Array.prototype;
        for (let index = 0; index < item.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
            throw new Error('Array entries must be enumerable data properties.');
          }
          entries.push(encode(descriptor.value));
          reusable = reusable && immutableChild(descriptor.value);
        }
        const encoded = `[${entries.join(',')}]`;
        if (reusable) frozenEncodings.set(item, encoded);
        return encoded;
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error('Canonical records must be plain objects.');
      }
      const keys = Object.getOwnPropertyNames(item).sort();
      let reusable = Object.isFrozen(item);
      const encoded = `{${keys
        .map((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
          if (!('value' in descriptor) || !descriptor.enumerable) {
            throw new Error('Record fields must be enumerable data properties.');
          }
          const field = `${JSON.stringify(key)}:${encode(descriptor.value)}`;
          reusable = reusable && immutableChild(descriptor.value);
          return field;
        })
        .join(',')}}`;
      if (reusable) frozenEncodings.set(item, encoded);
      return encoded;
    } finally {
      ancestors.delete(item);
    }
  }
  return encode(value);
}

export function canonicalBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(canonicalJson(value));
}
