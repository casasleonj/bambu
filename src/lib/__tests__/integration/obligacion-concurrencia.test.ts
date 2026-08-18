// @tests FASE 3 — obligaciones: concurrencia real (contrato §7, tests 34A/34B/34C)
// Verifica que N operaciones concurrentes NUNCA sobre-consumen la obligación.
// Invariante: cantidadCumplida + cantidadAsignada <= cantidadOriginal.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'
import { AsignarActividadUseCase } from '@/modules/embarques/application/use-cases/AsignarActividadUseCase'

async function crearObligacion(producto: string, cantidadOriginal: number) {
  return testPrisma.obligacionPendiente.create({
    data: { producto, cantidadOriginal },
  })
}

describe('FASE 3 — obligaciones: concurrencia (34A/34B/34C)', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('34A: dos operaciones concurrentes → nunca sobreconsumir', async () => {
    const obligacion = await crearObligacion('PACA_AGUA', 10)
    const useCase = new AsignarActividadUseCase()

    // 2 asignaciones de 6 c/u → solo 1 gana (6 <= 10), la otra SOBRECONSUMO.
    const resultados = await Promise.allSettled([
      useCase.execute({ obligacionId: obligacion.id, producto: 'PACA_AGUA', cantidad: 6 }),
      useCase.execute({ obligacionId: obligacion.id, producto: 'PACA_AGUA', cantidad: 6 }),
    ])

    const ganadas = resultados.filter((r) => r.status === 'fulfilled')
    const fallidas = resultados.filter((r) => r.status === 'rejected')
    expect(ganadas).toHaveLength(1)
    expect(fallidas).toHaveLength(1)

    const persisted = await testPrisma.obligacionPendiente.findUnique({ where: { id: obligacion.id } })
    expect(persisted!.cantidadCumplida + persisted!.cantidadAsignada).toBeLessThanOrEqual(persisted!.cantidadOriginal)
    expect(persisted!.cantidadAsignada).toBe(6)
  })

  it('34B: múltiples operaciones concurrentes → nunca sobreconsumir', async () => {
    const obligacion = await crearObligacion('PACA_HIELO', 10)
    const useCase = new AsignarActividadUseCase()

    // 10 asignaciones de 2 → 5 ganan (asignada=10), 5 fallan.
    const resultados = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        useCase.execute({ obligacionId: obligacion.id, producto: 'PACA_HIELO', cantidad: 2 }),
      ),
    )

    const ganadas = resultados.filter((r) => r.status === 'fulfilled')
    const fallidas = resultados.filter((r) => r.status === 'rejected')
    expect(ganadas).toHaveLength(5)
    expect(fallidas).toHaveLength(5)

    const persisted = await testPrisma.obligacionPendiente.findUnique({ where: { id: obligacion.id } })
    expect(persisted!.cantidadCumplida + persisted!.cantidadAsignada).toBeLessThanOrEqual(persisted!.cantidadOriginal)
    expect(persisted!.cantidadAsignada).toBe(10)
  })

  it('34C: retry concurrente con el mismo offlineId → no duplica', async () => {
    const obligacion = await crearObligacion('BOLSA_AGUA', 10)
    const useCase = new AsignarActividadUseCase()
    const offlineId = uniqueId('asignacion')

    // 2 llamadas con el MISMO offlineId → 1 actividad, 1 deduped.
    const [r1, r2] = await Promise.all([
      useCase.execute({ obligacionId: obligacion.id, producto: 'BOLSA_AGUA', cantidad: 3, offlineId }),
      useCase.execute({ obligacionId: obligacion.id, producto: 'BOLSA_AGUA', cantidad: 3, offlineId }),
    ])

    const deduped = [r1, r2].filter((r) => r.deduped)
    expect(deduped).toHaveLength(1)

    // Solo una actividad creada, y asignada = 3 (no 6).
    const count = await testPrisma.actividad.count({ where: { offlineId } })
    expect(count).toBe(1)

    const persisted = await testPrisma.obligacionPendiente.findUnique({ where: { id: obligacion.id } })
    expect(persisted!.cantidadAsignada).toBe(3)
  })
})
