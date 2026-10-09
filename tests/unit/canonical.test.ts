import { describe, expect, it } from 'vitest';
import { canonicalBytes, canonicalJson } from '../../src/sim/canonical';
import { capture } from '../../src/sim/immutable';

describe('canonical JSON and immutable captures', () => {
  it('sorts keys by code units, preserves array order and normalizes negative zero', () => {
    expect(canonicalJson({ z: 'é', a: [-0, true, null] })).toBe('{"a":[0,true,null],"z":"é"}');
    expect(Buffer.from(canonicalBytes({ z: 'é', a: [-0, true, null] })).toString('hex')).toBe(
      '7b2261223a5b302c747275652c6e756c6c5d2c227a223a22c3a9227d',
    );
    expect(canonicalJson({ '\uE000': 2, '😀': 1 })).toBe('{"😀":1,"\uE000":2}');
    expect(canonicalJson({ b: { z: 2, a: 1 }, a: [2, 1] })).toBe('{"a":[2,1],"b":{"a":1,"z":2}}');
  });
  it.each([undefined, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 1n, () => 1, Symbol('x')])(
    'rejects unsupported values: %s',
    (value) => {
      expect(() => canonicalBytes(value)).toThrow();
    },
  );
  it('rejects sparse arrays, decorated arrays, cycles and non-data records', () => {
    expect(() => canonicalJson(Array(2))).toThrow();
    expect(() => canonicalJson(Object.assign([1], { extra: 2 }))).toThrow();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow();
    expect(() => canonicalJson(new Date(0))).toThrow();
    expect(() => canonicalJson(new Uint8Array(1))).toThrow();
    expect(() => canonicalJson({ [Symbol('hidden')]: 1 })).toThrow();
    expect(() => canonicalJson(Object.defineProperty({}, 'hidden', { value: 1 }))).toThrow();
    let invoked = false;
    expect(() =>
      canonicalJson({
        get field() {
          invoked = true;
          return 1;
        },
      }),
    ).toThrow();
    expect(invoked).toBe(false);
  });
  it('clones and freezes nested state without freezing the caller', () => {
    const input = { value: [1], record: { a: 2 } };
    const saved = capture(input);
    input.value.push(3);
    input.record.a = 4;
    expect(saved).toEqual({ value: [1], record: { a: 2 } });
    expect(Object.isFrozen(saved.record)).toBe(true);
    expect(() => Reflect.set(saved.record, 'a', 4)).not.toThrow();
    expect(Reflect.set(saved.record, 'a', 4)).toBe(false);
  });
  it('never treats a shallow freeze as immutable data', () => {
    const child = { value: 1 },
      parent = Object.freeze({ child });
    expect(canonicalJson(parent)).toBe('{"child":{"value":1}}');
    const captured = capture(parent);
    child.value = 2;
    expect(canonicalJson(parent)).toBe('{"child":{"value":2}}');
    expect(canonicalJson(captured)).toBe('{"child":{"value":1}}');
    expect(Object.is(capture(Object.freeze({ value: -0 })).value, 0)).toBe(true);
    const prototypeKey = JSON.parse('{"__proto__":{"value":3}}') as Record<string, unknown>;
    expect(canonicalJson(capture(prototypeKey))).toBe('{"__proto__":{"value":3}}');
  });
});
