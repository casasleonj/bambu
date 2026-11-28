import { afterEach, expect, it, vi } from 'vitest'
import { purgeSWCache } from '@/lib/purge-sw-cache'
import { unsubscribePushOnLogout } from '@/lib/push-cleanup'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('abandoning a stalled cache listing never starts a deletion after it resolves', async () => {
  let resolveKeys!: (keys: string[]) => void
  const remove = vi.fn(async () => true)
  vi.stubGlobal('caches', {
    keys: () => new Promise<string[]>(resolve => { resolveKeys = resolve }),
    delete: remove,
  })
  const controller = new AbortController()
  const attempt = purgeSWCache(controller.signal)
  const assertion = expect(attempt).rejects.toThrow('deadline')
  controller.abort(new Error('deadline'))
  await assertion
  resolveKeys(['old-cache'])
  await Promise.resolve()
  expect(remove).not.toHaveBeenCalled()
})

it('an in-flight cache deletion settles before the cleanup rejects; subsequent deletions never start', async () => {
  let resolveDelete!: (value: boolean) => void
  const remove = vi.fn(() => new Promise<boolean>(resolve => { resolveDelete = resolve }))
  vi.stubGlobal('caches', { keys: async () => ['old-cache', 'another-cache'], delete: remove })
  const controller = new AbortController()
  const attempt = purgeSWCache(controller.signal)
  const assertion = expect(attempt).rejects.toThrow('deadline')
  await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  let settled = false
  void attempt.catch(() => { settled = true })
  controller.abort(new Error('deadline'))
  await Promise.resolve()
  expect(settled).toBe(false)
  resolveDelete(true)
  await assertion
  expect(remove).toHaveBeenCalledOnce()
})

it('abandoning a pending push subscription lookup prevents any late unsubscribe', async () => {
  let resolveSubscription!: (value: { unsubscribe: () => Promise<boolean> }) => void
  const unsubscribe = vi.fn(async () => true)
  const getSubscription = vi.fn(() => new Promise<{ unsubscribe: () => Promise<boolean> }>(resolve => { resolveSubscription = resolve }))
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription } }) } })
  const controller = new AbortController()
  const attempt = unsubscribePushOnLogout(controller.signal)
  const assertion = expect(attempt).rejects.toThrow('deadline')
  await vi.waitFor(() => expect(getSubscription).toHaveBeenCalledOnce())
  controller.abort(new Error('deadline'))
  await assertion
  resolveSubscription({ unsubscribe })
  await Promise.resolve()
  expect(unsubscribe).not.toHaveBeenCalled()
})
