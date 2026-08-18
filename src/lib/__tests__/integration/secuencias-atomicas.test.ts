// @tests FASE 8 — secuencias atómicas de Pedido.numero y NotaCredito.numero
// ADR-CONCURRENCIA-001, contrato §6 "Generación de secuencia": la numeración
// migra de MAX+1 (no atómico) a secuencia PG (nextval), segura sin lock global.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { getNextNumero } from '@/lib/sequence'

describe('FASE 8 — secuencias atómicas (Pedido.numero / NotaCredito.numero)', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('20 llamadas paralelas a getNextNumero(pedido) producen 20 números únicos', async () => {
    const numeros = await Promise.all(
      Array.from({ length: 20 }, () =>
        getNextNumero(testPrisma as never, { model: 'pedido', field: 'numero' }),
      ),
    )
    expect(new Set(numeros).size).toBe(20)
  })

  it('20 llamadas paralelas a getNextNumero(notaCredito) producen 20 números únicos', async () => {
    const numeros = await Promise.all(
      Array.from({ length: 20 }, () =>
        getNextNumero(testPrisma as never, { model: 'notaCredito' }),
      ),
    )
    expect(new Set(numeros).size).toBe(20)
  })
})
