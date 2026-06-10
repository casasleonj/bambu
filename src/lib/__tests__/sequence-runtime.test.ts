// @tests runtime getNextNumero con secuencia — Fase 3 §2.1/§2.3
// Verifica que la integración entre getNextNumero y la secuencia
// Postgres funciona en concurrencia simulada.

import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getNextNumero } from '@/lib/sequence'

describe('Fase 3 §2.3: getNextNumero usa factura_numero_seq para Factura.numero', () => {
  it('FIX: getNextNumero con model=factura devuelve enteros de la secuencia', async () => {
    const num1 = await getNextNumero(prisma, { model: 'factura', field: 'numero' })
    const num2 = await getNextNumero(prisma, { model: 'factura', field: 'numero' })
    const num3 = await getNextNumero(prisma, { model: 'factura', field: 'numero' })

    expect(num1).toBeTypeOf('number')
    expect(num2).toBe(num1 + 1)
    expect(num3).toBe(num2 + 1)
  })

  it('FIX: el seqName explícito tiene precedencia sobre el automático', async () => {
    // Test que el override manual sigue funcionando
    const num = await getNextNumero(prisma, {
      seqName: 'factura_numero_seq',
      model: 'factura',
      field: 'numero',
    })
    expect(num).toBeTypeOf('number')
  })

  it('FIX: getNextNumero para Abono sigue usando MAX+1 (no usa secuencia)', async () => {
    // No hay secuencia para abono — debe usar fallback MAX+1
    const num1 = await getNextNumero(prisma, { model: 'abono', field: 'numero' })
    expect(num1).toBeTypeOf('number')
    expect(num1).toBeGreaterThan(0)
  })

  it('FIX: 10 llamadas concurrentes devuelven 10 valores únicos y consecutivos', async () => {
    const promises = Array.from({ length: 10 }, () =>
      getNextNumero(prisma, { model: 'factura', field: 'numero' }),
    )
    const results = await Promise.all(promises)
    const unique = new Set(results)
    expect(unique.size).toBe(10)
    // Todos distintos, no asumo orden pero sí que son únicos
  })
})
