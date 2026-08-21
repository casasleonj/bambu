// @tests FASE 6 — responsabilidad (contrato §13)
// La detección es automática, la transferencia económica NUNCA es automática:
// RESUELTA_CON_CARGO exige autorizadoPorId + resueltoPorId; el cargo económico
// solo se materializa tras resolución autorizada. Un caso sin embarque es
// investigable (embarqueId nullable).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { ResolverResponsibilityCaseUseCase } from '@/modules/embarques/application/use-cases/ResolverResponsibilityCaseUseCase'

async function crearCaso(tipo: 'DISCREPANCIA_INVENTARIO' | 'FALTANTE_CAJA') {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: `Trab ${Date.now()}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: { trabajadorId: trabajador.id, fecha: new Date() },
  })
  const caso = await testPrisma.responsibilityCase.create({
    data: {
      embarqueId: embarque.id,
      trabajadorId: trabajador.id,
      tipo,
      descripcion: 'test',
      montoEstimado: 10000,
    },
  })
  return { caso, trabajador, embarque }
}

describe('FASE 6 — responsabilidad (contrato §13)', () => {
  let adminId: string

  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('No admin — ¿corriste seed-test?')
    adminId = admin.id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('CON_CARGO sin autorizadoPorId se rechaza', async () => {
    const { caso } = await crearCaso('FALTANTE_CAJA')
    const useCase = new ResolverResponsibilityCaseUseCase()
    await expect(
      useCase.execute({ caseId: caso.id, resolucion: 'CON_CARGO', resueltoPorId: adminId }),
    ).rejects.toThrow(/RESUELTA_CON_CARGO_EXIGE_AUTORIZACION/)
  })

  it('CON_CARGO con autorizadoPorId + resueltoPorId materializa la DeudaTrabajador', async () => {
    const { caso } = await crearCaso('FALTANTE_CAJA')
    const useCase = new ResolverResponsibilityCaseUseCase()

    const result = await useCase.execute({
      caseId: caso.id,
      resolucion: 'CON_CARGO',
      resueltoPorId: adminId,
      autorizadoPorId: adminId,
    })

    expect(result.deduped).toBe(false)
    expect(result.hechoEconomicoId).toBeDefined()

    const persisted = await testPrisma.responsibilityCase.findUnique({ where: { id: caso.id } })
    expect(persisted?.estado).toBe('RESUELTA_CON_CARGO')
    expect(persisted?.hechoEconomicoTipo).toBe('DEUDA')
    expect(persisted?.autorizadoPorId).toBe(adminId)
    expect(persisted?.resueltoPorId).toBe(adminId)

    const deudas = await testPrisma.deudaTrabajador.findMany({ where: { embarqueId: caso.embarqueId! } })
    expect(deudas).toHaveLength(1)
  })

  it('dos resoluciones concurrentes CON_CARGO → solo 1 materializa el hecho económico', async () => {
    const { caso } = await crearCaso('FALTANTE_CAJA')
    const useCase = new ResolverResponsibilityCaseUseCase()
    const input = {
      caseId: caso.id,
      resolucion: 'CON_CARGO' as const,
      resueltoPorId: adminId,
      autorizadoPorId: adminId,
    }

    const resultados = await Promise.allSettled([useCase.execute(input), useCase.execute(input)])
    const ganadas = resultados.filter((r) => r.status === 'fulfilled')
    expect(ganadas).toHaveLength(2)

    const deduped = ganadas.filter(
      (r) => r.status === 'fulfilled' && r.value.deduped,
    )
    expect(deduped).toHaveLength(1)

    const deudas = await testPrisma.deudaTrabajador.findMany({ where: { embarqueId: caso.embarqueId! } })
    expect(deudas).toHaveLength(1)
  })

  it('SIN_CARGO no materializa hecho económico', async () => {
    const { caso } = await crearCaso('FALTANTE_CAJA')
    const useCase = new ResolverResponsibilityCaseUseCase()

    const result = await useCase.execute({ caseId: caso.id, resolucion: 'SIN_CARGO', resueltoPorId: adminId })

    expect(result.deduped).toBe(false)
    expect(result.hechoEconomicoId).toBeUndefined()

    const persisted = await testPrisma.responsibilityCase.findUnique({ where: { id: caso.id } })
    expect(persisted?.estado).toBe('RESUELTA_SIN_CARGO')
    expect(persisted?.hechoEconomicoId).toBeNull()
  })

  it('DISCREPANCIA_INVENTARIO CON_CARGO materializa un DescuentoRepartidor', async () => {
    const { caso } = await crearCaso('DISCREPANCIA_INVENTARIO')
    const useCase = new ResolverResponsibilityCaseUseCase()

    const result = await useCase.execute({
      caseId: caso.id,
      resolucion: 'CON_CARGO',
      resueltoPorId: adminId,
      autorizadoPorId: adminId,
    })

    const persisted = await testPrisma.responsibilityCase.findUnique({ where: { id: caso.id } })
    expect(persisted?.hechoEconomicoTipo).toBe('DESCUENTO')

    const descuentos = await testPrisma.descuentoRepartidor.findMany({ where: { embarqueId: caso.embarqueId! } })
    expect(descuentos).toHaveLength(1)
    expect(result.hechoEconomicoId).toBeDefined()
  })

  it('un caso sin embarque es investigable (embarqueId null) y resuelve con DeudaTrabajador', async () => {
    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: `Trab sin embarque ${Date.now()}`, rol: 'REPARTIDOR', usaMoto: true },
    })
    const caso = await testPrisma.responsibilityCase.create({
      data: {
        embarqueId: null,
        trabajadorId: trabajador.id,
        tipo: 'FIADO_NO_COBRADO',
        descripcion: 'investigación posterior',
        montoEstimado: 5000,
      },
    })

    const useCase = new ResolverResponsibilityCaseUseCase()
    const result = await useCase.execute({
      caseId: caso.id,
      resolucion: 'CON_CARGO',
      resueltoPorId: adminId,
      autorizadoPorId: adminId,
    })

    expect(result.hechoEconomicoId).toBeDefined()
    const persisted = await testPrisma.responsibilityCase.findUnique({ where: { id: caso.id } })
    expect(persisted?.estado).toBe('RESUELTA_CON_CARGO')
  })

  it('un caso de fiado vencido es investigable solo con clienteId (sin embarque ni trabajador)', async () => {
    const cliente = await testPrisma.cliente.findFirst()
    if (!cliente) throw new Error('No cliente — ¿corriste seed-test?')

    const caso = await testPrisma.responsibilityCase.create({
      data: {
        embarqueId: null,
        trabajadorId: null,
        clienteId: cliente.id,
        tipo: 'FIADO_NO_COBRADO',
        descripcion: 'fiado vencido detectado días después del cierre',
        montoEstimado: 12000,
      },
    })

    expect(caso.clienteId).toBe(cliente.id)
    expect(caso.embarqueId).toBeNull()

    const persisted = await testPrisma.responsibilityCase.findUnique({ where: { id: caso.id } })
    expect(persisted?.clienteId).toBe(cliente.id)
  })
})
