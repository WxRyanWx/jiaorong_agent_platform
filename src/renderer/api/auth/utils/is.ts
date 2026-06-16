export function isEmptyObject<T extends object>(value: T | unknown): value is object {
  if (value && Object.keys(value).length === 0 && value.constructor === Object) return true
  return false
}
