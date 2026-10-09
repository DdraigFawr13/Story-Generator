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
        for (let index = 0; index < item.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
            throw new Error('Array entries must be enumerable data properties.');
          }
          entries.push(encode(descriptor.value));
        }
        return `[${entries.join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error('Canonical records must be plain objects.');
      }
      const keys = Object.getOwnPropertyNames(item).sort();
      return `{${keys
        .map((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
          if (!('value' in descriptor) || !descriptor.enumerable) {
            throw new Error('Record fields must be enumerable data properties.');
          }
          return `${JSON.stringify(key)}:${encode(descriptor.value)}`;
        })
        .join(',')}}`;
    } finally {
      ancestors.delete(item);
    }
  }
  return encode(value);
}

export function canonicalBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(canonicalJson(value));
}
