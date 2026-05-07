import { AsyncLocalStorage } from 'node:async_hooks'

const ctx = new AsyncLocalStorage<{ requestId: string }>()

export function getRequestId(): string {
  return ctx.getStore()?.requestId || 'unknown'
}

export function runWithRequestContext<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  return ctx.run({ requestId }, fn)
}
