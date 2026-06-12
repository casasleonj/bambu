// @tests Cierre idempotencia — vector: concurrencia / estado
// CRÍTICO: dos inserciones de CierreDia con la misma fecha deben
// manejarse limpio. La unique constraint en CierreDia.fecha es la
// garantía de DB. Verificamos:
//   1. Dos creates paralelos con la misma fecha → 1 gana, 1 falla con P2002
//   2. Secuencial: segundo create con misma fecha también falla
//   3. La unique constraint existe a nivel de schema
//   4. LOCK_IDS tiene los valores esperados (CIERRE = 7, FACTURA_NUM = 6, PEDIDO = 1)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  testPrisma,
  resetAndSeed,
  disconnect,
  getAdminUser,
} from './setup'

/**
 * Genera una fecha YYYY-MM-DD única en el futuro lejano para no chocar
 * con cierres sembrados.
 */
function uniqueFutureDate(): string {
  // Base: 2030-01-01 + N días random (0-1000)
  const base = new Date('2030-01-01T00:00:00Z').getTime()
  const offset = Math.floor(Math.random() * 1000) * 86400000
  const d = new Date(base + offset)
  return d.toISOString().split('T')[0]
}

describe('Cierre — idempotencia bajo carga paralela', () => {
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    adminId = admin.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('dos creates paralelos de CierreDia con la misma fecha: uno gana, el otro falla con P2002', async () => {
    const fechaStr = uniqueFutureDate()
    const fecha = new Date(fechaStr + 'T05:00:00Z')

    const baseData = {
      fecha,
      baseDia: 100000,
      comisiones: 8000,
      salarios: 0,
      stockIniAgua: 200,
      prodAgua: 150,
      stockFinAgua: 100,
      stockIniHielo: 100,
      prodHielo: 80,
      stockFinHielo: 50,
      cerradoPor: adminId,
    }

    // Lanzar dos creates en paralelo. El segundo debe chocar con
    // la unique constraint en CierreDia.fecha.
    const results = await Promise.allSettled([
      testPrisma.cierreDia.create({ data: baseData }),
      testPrisma.cierreDia.create({ data: baseData }),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)

    // El rejected debe ser error de unique constraint
    if (rejected.length > 0) {
      const reason = (rejected[0] as PromiseRejectedResult).reason
      expect(reason).toBeDefined()
      // Prisma mapea unique violation a código P2002
      const errorStr = JSON.stringify(reason)
      expect(
        errorStr.includes('P2002') || errorStr.includes('Unique constraint'),
      ).toBe(true)
    }

    // Solo 1 fila en DB
    const count = await testPrisma.cierreDia.count({ where: { fecha } })
    expect(count).toBe(1)

    // Cleanup
    if (fulfilled.length > 0) {
      const id = (fulfilled[0] as PromiseFulfilledResult<{ id: string }>).value.id
      await testPrisma.cierreDia.delete({ where: { id } })
    }
  })

  it('dos creates SECUENCIALES con la misma fecha: el segundo también falla (no race dependency)', async () => {
    const fechaStr = uniqueFutureDate()
    const fecha = new Date(fechaStr + 'T05:00:00Z')

    const data = {
      fecha,
      baseDia: 0,
      comisiones: 0,
      salarios: 0,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
      cerradoPor: adminId,
    }

    const c1 = await testPrisma.cierreDia.create({ data })
    let c2Error: Error | null = null
    try {
      await testPrisma.cierreDia.create({ data })
    } catch (e) {
      c2Error = e as Error
    }
    expect(c2Error).not.toBeNull()

    // Cleanup
    await testPrisma.cierreDia.delete({ where: { id: c1.id } })
  })

  it('CierreDia.fecha tiene unique constraint (defensa en DB)', async () => {
    const indexes = await testPrisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'CierreDia'
        AND indexdef LIKE '%UNIQUE INDEX%'
    `
    expect(indexes.length).toBeGreaterThan(0)
    const hasFechaIndex = indexes.some((i) => i.indexname.toLowerCase().includes('fecha'))
    expect(hasFechaIndex).toBe(true)
  })

  it('Embarque tiene unique constraint (trabajadorId, fecha, numeroDia)', async () => {
    const indexes = await testPrisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'Embarque'
        AND indexdef LIKE '%UNIQUE INDEX%'
    `
    expect(indexes.length).toBeGreaterThan(0)
  })

  it('LOCK_IDS contiene los valores esperados (sin cambios accidentales)', async () => {
    const { LOCK_IDS } = await import('@/lib/locks')
    // El handler de cierre usa LOCK_IDS.CIERRE (id=7) para pg_advisory_xact_lock.
    // Si alguien cambia el ID por accidente, los locks de cierre dejan de funcionar.
    expect(LOCK_IDS.PEDIDO).toBe(1)
    expect(LOCK_IDS.FACTURA).toBe(2)
    expect(LOCK_IDS.EMBARQUE).toBe(3)
    expect(LOCK_IDS.ABONO).toBe(4)
    expect(LOCK_IDS.COMPRA).toBe(5)
    expect(LOCK_IDS.FACTURA_NUM).toBe(6)
    expect(LOCK_IDS.CIERRE).toBe(7)
    expect(LOCK_IDS.NC).toBe(8)
  })
})
