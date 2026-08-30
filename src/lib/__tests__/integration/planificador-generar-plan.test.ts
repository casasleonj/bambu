// @tests planificador — integración (DB real). Verifica el vertical completo:
//   cargar pedidos elegibles → construir propuesta → persistir PlanDia PROPOSED.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { GenerarPlanUseCase } from '@/modules/planificador/application/use-cases/GenerarPlanUseCase'

const FECHA = '2026-08-30'

// Codazzi ≈ 10.03, -73.24
function coords(i: number) {
  return { lat: 10.03 + i * 0.001, lng: -73.24 + i * 0.001 }
}

describe('GenerarPlanUseCase — integración', () => {
  beforeAll(async () => {
    await resetAndSeed()

    // 5 clientes con coords precisas + 1 sin ubicación.
    for (let i = 0; i < 5; i++) {
      const c = await testPrisma.cliente.create({
        data: {
          nombre: `Plan Cliente ${i}`,
          telefono: `39900000${i}0`,
          barrio: 'Centro',
          ...coords(i),
          geocodeOrigen: 'MANUAL',
        },
      })
      await testPrisma.pedido.create({
        data: {
          clienteId: c.id,
          canal: 'DOMICILIO',
          origen: 'PEDIDO',
          fecha: new Date('2026-08-29T12:00:00-05:00'),
          cPacaAguaPed: 3,
        },
      })
    }
    const sinGeo = await testPrisma.cliente.create({
      data: { nombre: 'Plan Cliente sin geo', telefono: '3990000099' },
    })
    await testPrisma.pedido.create({
      data: {
        clienteId: sinGeo.id,
        canal: 'DOMICILIO',
        origen: 'PEDIDO',
        fecha: new Date('2026-08-29T12:00:00-05:00'),
        cPacaAguaPed: 1,
      },
    })

    // Un pedido NO elegible (mostrador) — no debe entrar.
    const mostrador = await testPrisma.cliente.create({
      data: { nombre: 'Mostrador', telefono: '3990000100' },
    })
    await testPrisma.pedido.create({
      data: { clienteId: mostrador.id, canal: 'PUNTO', origen: 'VENTA_RAPIDA', cPacaAguaPed: 5 },
    })
  })

  afterAll(async () => {
    await testPrisma.planDia.deleteMany({})
    await disconnect()
  })

  it('genera y persiste un PlanDia PROPOSED con grupos y la excepción del cliente sin geo', async () => {
    const useCase = new GenerarPlanUseCase()
    const result = await useCase.execute({ fecha: FECHA, maxUnidades: 70 })

    expect(result.planId).toBeTruthy()
    expect(result.version).toBe(1)
    expect(result.grupos).toBeGreaterThanOrEqual(1)

    const plan = await testPrisma.planDia.findUnique({
      where: { id: result.planId },
      include: {
        grupos: { include: { paradas: { include: { actividades: true } } } },
        excepciones: true,
        versiones: true,
      },
    })
    expect(plan?.estado).toBe('PROPOSED')
    expect(plan?.versiones).toHaveLength(1)

    // 5 pedidos con geo entran a grupos. El de mostrador NO (canal PUNTO).
    const pedidosEnPlan = plan!.grupos.flatMap((g) =>
      g.paradas.flatMap((p) => p.actividades.flatMap((a) => a.pedidoIds)),
    )
    expect(pedidosEnPlan.length).toBe(5)

    // El 6º (cliente sin geo) NO se agrupa — genera excepción MISSING_DATA con su pedido.
    const missing = plan!.excepciones.find((e) => e.tipo === 'MISSING_DATA')
    expect(missing).toBeDefined()
    const entidad = missing!.entidad as { pedidoIds?: string[] }
    expect(entidad.pedidoIds?.length).toBe(1)
    expect(pedidosEnPlan).not.toContain(entidad.pedidoIds![0])

    // Todas las actividades son ENTREGA (MVP).
    const tipos = plan!.grupos.flatMap((g) => g.paradas.flatMap((p) => p.actividades.map((a) => a.tipo)))
    expect(new Set(tipos)).toEqual(new Set(['ENTREGA']))

    // Se propuso un repartidor (el seed tiene uno con usaMoto).
    expect(plan!.grupos.some((g) => g.trabajadorPropuestoId)).toBe(true)
  })

  it('re-generar la misma fecha → version 2, la v1 pasa a SUPERSEDED', async () => {
    const useCase = new GenerarPlanUseCase()
    const r2 = await useCase.execute({ fecha: FECHA, maxUnidades: 70 })
    expect(r2.version).toBe(2)

    const planes = await testPrisma.planDia.findMany({
      where: { fecha: new Date('2026-08-30T00:00:00-05:00') },
      orderBy: { version: 'asc' },
    })
    expect(planes).toHaveLength(2)
    expect(planes[0].estado).toBe('SUPERSEDED')
    expect(planes[1].estado).toBe('PROPOSED')
  })
})
