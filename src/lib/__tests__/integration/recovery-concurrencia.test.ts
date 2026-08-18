// @tests FASE 4 — recovery: concurrencia real (contrato §3/§4)
// Verifica:
//   - SOBRANTE: dos decisiones concurrentes sobre el MISMO source no duplican
//     consumo (sum(cantidadAplicada) <= disponible en el origen).
//   - Retry con el mismo offlineId no duplica.
//   - FALTANTE sin sourceEventId es válido (no inventa evento físico).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'
import { CrearRecoveryDecisionUseCase } from '@/modules/embarques/application/use-cases/CrearRecoveryDecisionUseCase'

async function crearEmbarque() {
  const trabajador = await testPrisma.trabajador.findFirst()
  if (!trabajador) throw new Error('No trabajador — ¿corriste seed-test?')
  const embarque = await testPrisma.embarque.create({
    data: { trabajadorId: trabajador.id, fecha: new Date() },
  })
  return embarque.id
}

async function crearContexto(cantidadOrigen: number) {
  const embarqueId = await crearEmbarque()
  const movimiento = await testPrisma.embarqueMovimiento.create({
    data: {
      embarqueId,
      tipo: 'RETORNO',
      producto: 'PACA_AGUA',
      cantidad: cantidadOrigen,
      origen: 'VEHICULO',
      destino: 'INSPECCION',
    },
  })
  return { embarqueId, sourceEventId: movimiento.id }
}

describe('FASE 4 — recovery: concurrencia (contrato §3/§4)', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('SOBRANTE: dos decisiones concurrentes sobre el mismo source no duplican consumo', async () => {
    const { embarqueId, sourceEventId } = await crearContexto(5)
    const useCase = new CrearRecoveryDecisionUseCase()

    const base = {
      embarqueId,
      tipo: 'SOBRANTE' as const,
      sourceEventId,
      producto: 'PACA_AGUA',
      cantidad: 4,
      cantidadAplicada: 4,
      actorId: 'actor-1',
      reason: 'redistribucion',
    }

    // 2 decisiones de 4 c/u sobre un origen con 5 → solo 1 gana.
    const resultados = await Promise.allSettled([
      useCase.execute(base),
      useCase.execute(base),
    ])

    const ganadas = resultados.filter((r) => r.status === 'fulfilled')
    const fallidas = resultados.filter((r) => r.status === 'rejected')
    expect(ganadas).toHaveLength(1)
    expect(fallidas).toHaveLength(1)

    // sum(cantidadAplicada) de decisiones del mismo source <= disponible (5).
    const sum = await testPrisma.recoveryDecision.aggregate({
      where: { sourceEventId },
      _sum: { cantidadAplicada: true },
    })
    expect(sum._sum.cantidadAplicada).toBeLessThanOrEqual(5)
    expect(sum._sum.cantidadAplicada).toBe(4)
  })

  it('retry con el mismo offlineId no duplica la decisión', async () => {
    const { embarqueId, sourceEventId } = await crearContexto(10)
    const useCase = new CrearRecoveryDecisionUseCase()
    const offlineId = uniqueId('recovery')

    const input = {
      embarqueId,
      tipo: 'SOBRANTE' as const,
      sourceEventId,
      producto: 'PACA_AGUA',
      cantidad: 3,
      cantidadAplicada: 3,
      actorId: 'actor-1',
      reason: 'retry',
      offlineId,
    }

    const [r1, r2] = await Promise.all([
      useCase.execute(input),
      useCase.execute(input),
    ])

    const deduped = [r1, r2].filter((r) => r.deduped)
    expect(deduped).toHaveLength(1)

    const count = await testPrisma.recoveryDecision.count({ where: { offlineId } })
    expect(count).toBe(1)
  })

  it('FALTANTE sin sourceEventId es válido (no inventa evento físico)', async () => {
    const embarqueId = await crearEmbarque()
    const useCase = new CrearRecoveryDecisionUseCase()

    const result = await useCase.execute({
      embarqueId,
      tipo: 'FALTANTE',
      producto: 'PACA_AGUA',
      cantidad: 2,
      cantidadAplicada: 2,
      actorId: 'actor-1',
      reason: 'faltante detectado',
    })

    expect(result.deduped).toBe(false)
    const decision = await testPrisma.recoveryDecision.findUnique({
      where: { id: result.decisionId },
    })
    expect(decision?.sourceEventId).toBeNull()
    expect(decision?.cantidadDisponibleEnOrigen).toBeNull()
  })
})
