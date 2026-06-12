// @tests getNextNumero — vector: concurrencia
// CRÍTICO: 20 requests paralelos al nextval de factura_numero_seq deben
// producir 20 números ÚNICOS (cero duplicados). Si Postgres nextval()
// no es atómico, la numeración de facturas DIAN se rompe (la DIAN exige
// consecutividad). Esta es la garantía principal de la migración
// 20260610_add_factura_numero_seq.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { getNextNumero } from '@/lib/sequence'

describe('getNextNumero — concurrencia de numeración de factura', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('20 llamadas paralelas a getNextNumero producen 20 números únicos', async () => {
    const N = 20

    // Lanzar 20 promises en paralelo. Cada una abre su propia tx para
    // invocar nextval(). Postgres serializa el acceso a la secuencia.
    const promises = Array.from({ length: N }, async () => {
      // Usamos prisma directamente (no la app) para que cada llamada
      // tenga su propia tx y la promesa no se acople al event loop.
      const tx = await testPrisma.$transaction(async (t) => {
        return getNextNumero(t as any, { model: 'factura', field: 'numero' })
      })
      return tx
    })

    const numeros = await Promise.all(promises)

    // 1. Todos son números
    expect(numeros.every((n) => typeof n === 'number')).toBe(true)

    // 2. Todos son positivos
    expect(numeros.every((n) => n > 0)).toBe(true)

    // 3. No hay duplicados
    const set = new Set(numeros)
    expect(set.size).toBe(N)

    // 4. La diferencia entre el mayor y el menor es >= N-1
    //    (puede haber huecos si otros tests/usos pasaron antes)
    const min = Math.min(...numeros)
    const max = Math.max(...numeros)
    expect(max - min).toBeGreaterThanOrEqual(N - 1)
  })

  it('100 llamadas en paralelo aún no producen duplicados', async () => {
    const N = 100
    const promises = Array.from({ length: N }, async () => {
      return testPrisma.$transaction(async (t) => {
        return getNextNumero(t as any, { model: 'factura', field: 'numero' })
      })
    })
    const numeros = await Promise.all(promises)
    const set = new Set(numeros)
    expect(set.size).toBe(N)
  })

  it('secuencia monotónica dentro del rango del test', async () => {
    // Después de 100 llamadas anteriores, las siguientes siguen
    // incrementando monotónicamente
    const seq: number[] = []
    for (let i = 0; i < 5; i++) {
      const n = await testPrisma.$transaction(async (t) =>
        getNextNumero(t as any, { model: 'factura', field: 'numero' }),
      )
      seq.push(n)
    }
    // Cada elemento es >= el anterior
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).toBeGreaterThan(seq[i - 1])
    }
  })

  it('formatWithPadding genera el formato FAC-XXXXX correctamente', async () => {
    const { formatWithPadding } = await import('@/lib/sequence')
    expect(formatWithPadding('FAC-00001', 42)).toBe('FAC-00042')
    expect(formatWithPadding('FAC-00001', 12345)).toBe('FAC-12345')
  })
})
