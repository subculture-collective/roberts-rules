export function canonicalStringify(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, current: unknown) => {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return current
    return Object.fromEntries(Object.entries(current).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
  })
  if (serialized === undefined) throw new TypeError('Value is not JSON-serializable')
  return serialized
}
