/**
 * Compatibility shim: login HTTP client now lives in the Jiaorong private package.
 * Prefer `@jiaorong/api/auth` in new Jiaorong code.
 */
export * from '@jiaorong/api/auth'
export type { AuthResponseCallback } from '@jiaorong/api/auth'
