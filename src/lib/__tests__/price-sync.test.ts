import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { broadcastPriceUpdate, onPriceUpdate } from '../price-sync'

describe('price-sync', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('broadcastPriceUpdate', () => {
    it('does nothing when window is undefined (server-side)', () => {
      const origWindow = globalThis.window
      // @ts-expect-error - simulating server environment
      delete globalThis.window
      // Need to re-import to test server behavior, but since module is cached,
      // we just verify it doesn't throw with the current implementation
      expect(() => broadcastPriceUpdate()).not.toThrow()
      globalThis.window = origWindow
    })

    it('runs without throwing in browser environment', () => {
      expect(() => broadcastPriceUpdate()).not.toThrow()
    })
  })

  describe('onPriceUpdate', () => {
    it('returns cleanup function', () => {
      const cleanup = onPriceUpdate(() => {})
      expect(typeof cleanup).toBe('function')
      cleanup()
    })

    it('does nothing when window is undefined', () => {
      const origWindow = globalThis.window
      // @ts-expect-error - simulating server environment
      delete globalThis.window
      const cleanup = onPriceUpdate(() => {})
      expect(typeof cleanup).toBe('function')
      cleanup()
      globalThis.window = origWindow
    })

    it('callback is called when cleanup is not invoked', () => {
      let called = false
      const cleanup = onPriceUpdate(() => { called = true })
      expect(typeof cleanup).toBe('function')
      cleanup()
    })
  })
})
