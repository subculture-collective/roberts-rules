import { describe, expect, it } from 'vitest'

import { canonicalStringify } from '../src/index.js'

describe('canonical JSON', () => {
  it('sorts object keys recursively without mutating objects or array order', () => {
    const value = { z: 1, a: { y: 2, x: 3 }, list: [{ b: 1, a: 2 }, 'first'] }
    const before = structuredClone(value)

    expect(canonicalStringify(value)).toBe('{"a":{"x":3,"y":2},"list":[{"a":2,"b":1},"first"],"z":1}')
    expect(value).toEqual(before)
  })

  it('matches JSON value handling at every supported boundary', () => {
    expect(() => canonicalStringify(undefined)).toThrow(TypeError)
    expect(canonicalStringify({ kept: 1, omitted: undefined })).toBe('{"kept":1}')
    expect(canonicalStringify([undefined, Number.NaN, Number.POSITIVE_INFINITY])).toBe('[null,null,null]')
  })

  it('documents JSON ordering for integer-like keys and sorts other object keys', () => {
    expect(canonicalStringify({ z: 0, 10: 'ten', 2: 'two', a: 1 })).toBe('{"2":"two","10":"ten","a":1,"z":0}')
  })

  it('rejects BigInt and cyclic input without mutating either input', () => {
    const big = { value: 1n }
    expect(() => canonicalStringify(big)).toThrow(TypeError)
    expect(big.value).toBe(1n)

    const cyclic: { label: string; self?: unknown } = { label: 'cycle' }
    cyclic.self = cyclic
    expect(() => canonicalStringify(cyclic)).toThrow()
    expect(cyclic.self).toBe(cyclic)
  })
})
