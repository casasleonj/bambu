import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateUUID } from '../uuid'

// UUID v4 format: 8-4-4-4-12 hex chars, version 4 (digit 13 = '4')
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('generateUUID', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('happy path (crypto.randomUUID available)', () => {
    it('returns a valid UUID v4 string', () => {
      const id = generateUUID()
      expect(id).toMatch(UUID_V4_REGEX)
      expect(id).toHaveLength(36)
    })

    it('returns different UUIDs on consecutive calls', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateUUID()))
      expect(ids.size).toBe(100) // 100 UUIDs únicos
    })
  })

  describe('fallback path (crypto.randomUUID NOT available)', () => {
    it('uses Math.random fallback when crypto is undefined', () => {
      const originalCrypto = globalThis.crypto
      delete (globalThis as { crypto?: unknown }).crypto

      const id = generateUUID()

      expect(id).toMatch(UUID_V4_REGEX)
      expect(id).toHaveLength(36)

      // Restore
      ;(globalThis as { crypto: unknown }).crypto = originalCrypto
    })

    it('uses Math.random fallback when crypto.randomUUID is missing', () => {
      const originalCrypto = globalThis.crypto
      Object.defineProperty(globalThis, 'crypto', {
        value: { randomUUID: undefined }, // existe crypto pero randomUUID no
        configurable: true,
        writable: true,
      })

      const id = generateUUID()

      expect(id).toMatch(UUID_V4_REGEX)
      expect(id).toHaveLength(36)

      // Restore
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
        writable: true,
      })
    })

    it('uses Math.random fallback when crypto.randomUUID is not a function', () => {
      const originalCrypto = globalThis.crypto
      Object.defineProperty(globalThis, 'crypto', {
        value: { randomUUID: 'not a function' },
        configurable: true,
        writable: true,
      })

      const id = generateUUID()

      expect(id).toMatch(UUID_V4_REGEX)

      // Restore
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
        writable: true,
      })
    })

    it('fallback produces different values on consecutive calls', () => {
      const originalCrypto = globalThis.crypto
      Object.defineProperty(globalThis, 'crypto', {
        value: {},
        configurable: true,
        writable: true,
      })

      const ids = new Set(Array.from({ length: 100 }, () => generateUUID()))
      expect(ids.size).toBeGreaterThan(95) // al menos 95% únicos (colisiones aceptables en Math.random)

      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
        writable: true,
      })
    })
  })

  describe('integración con casos reales', () => {
    it('genera offlineId compatible con dedup server-side (formato consistente)', () => {
      // Este test verifica que TODOS los UUIDs generados (con o sin crypto) cumplan
      // el mismo formato. Crítico porque el server hace lookup por offlineId exacto.
      const samples: string[] = []
      for (let i = 0; i < 50; i++) samples.push(generateUUID())

      // Todos válidos
      samples.forEach((s) => expect(s).toMatch(UUID_V4_REGEX))
      // Todos únicos
      expect(new Set(samples).size).toBe(50)
    })
  })
})
