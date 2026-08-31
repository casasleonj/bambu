// @tests planificador — integración (DB real). Verifica el vertical completo:
//   cargar pedidos elegibles → construir propuesta → persistir PlanDia PROPOSED.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { GenerarPlanUseCase } from '@/modules/planificador/application/use-cases/GenerarPlanUseCase'
import { ConfirmarPlanUseCase } from '@/modules/planificador/application/use-cases/ConfirmarPlanUseCase'
import { ReplanUseCase } from '@/modules/planificador/application/use-cases/ReplanUseCase'
import { OverridePlanUseCase } from '@/modules/planificador/application/use-cases/OverridePlanUseCase'
import { PrismaPlanificadorRepository } from '@/modules/planificador/infrastructure/PrismaPlanificadorRepository'

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

  it('estaDesactualizado: false recién generado; true tras agregar un pedido elegible', async () => {
    const repo = new PrismaPlanificadorRepository()
    const plan = await testPrisma.planDia.findFirst({
      where: { fecha: new Date('2026-08-30T00:00:00-05:00'), estado: 'PROPOSED' },
      orderBy: { version: 'desc' },
    })

    const antes = await repo.estaDesactualizado(plan!.id)
    expect(antes.desactualizado).toBe(false)

    const c = await testPrisma.cliente.create({
      data: { nombre: 'Desactualiza', telefono: '3990001234', barrio: 'Centro', lat: 10.031, lng: -73.241, geocodeOrigen: 'MANUAL' },
    })
    await testPrisma.pedido.create({
      data: { clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: new Date('2026-08-29T12:00:00-05:00'), cPacaAguaPed: 1 },
    })

    const despues = await repo.estaDesactualizado(plan!.id)
    expect(despues.desactualizado).toBe(true)
    expect(despues.nuevos).toBe(1)
  })

  it('confirmar → materializa embarques, pedidos EN_RUTA, plan CONFIRMED', async () => {
    // Estado tras el test anterior: v2 PROPOSED es la vigente.
    const vigente = await testPrisma.planDia.findFirst({
      where: { fecha: new Date('2026-08-30T00:00:00-05:00'), estado: 'PROPOSED' },
      orderBy: { version: 'desc' },
      include: { grupos: { include: { paradas: { include: { actividades: true } } } } },
    })
    expect(vigente).toBeTruthy()

    const confirmar = new ConfirmarPlanUseCase()
    const res = await confirmar.execute({
      planId: vigente!.id,
      expectedVersion: vigente!.version,
      maxUnidades: 70,
    })

    expect(res.materializacion.fallidos).toEqual([])
    expect(res.estado).toBe('CONFIRMED')
    expect(res.materializacion.creados.length).toBeGreaterThanOrEqual(1)

    const plan = await testPrisma.planDia.findUnique({
      where: { id: vigente!.id },
      include: { grupos: true },
    })
    expect(plan!.estado).toBe('CONFIRMED')
    expect(plan!.grupos.every((g) => g.embarqueId)).toBe(true)

    // Los pedidos del plan quedaron EN_RUTA con embarqueId.
    const pedidoIds = vigente!.grupos.flatMap((g) =>
      g.paradas.flatMap((p) => p.actividades.flatMap((a) => a.pedidoIds)),
    )
    const pedidos = await testPrisma.pedido.findMany({ where: { id: { in: pedidoIds } } })
    expect(pedidos.every((p) => p.embarqueId && p.estadoEntrega === 'EN_RUTA')).toBe(true)

    // Se creó un embarque real por grupo materializado.
    const embarques = await testPrisma.embarque.findMany({
      where: { id: { in: res.materializacion.creados.map((c) => c.embarqueId) } },
    })
    expect(embarques.length).toBe(res.materializacion.creados.length)
  })

  it('re-confirmar con expectedVersion vieja → VERSION_CONFLICT', async () => {
    const plan = await testPrisma.planDia.findFirst({
      where: { fecha: new Date('2026-08-30T00:00:00-05:00'), estado: 'CONFIRMED' },
      orderBy: { version: 'desc' },
    })
    const confirmar = new ConfirmarPlanUseCase()
    await expect(
      confirmar.execute({ planId: plan!.id, expectedVersion: 1, maxUnidades: 70 }),
    ).rejects.toThrow('VERSION_CONFLICT')
  })
})

describe('Replan / Override / Cancelar — integración', () => {
  const FECHA2 = '2026-09-15'
  const dia = new Date('2026-09-15T00:00:00-05:00')

  beforeAll(async () => {
    await resetAndSeed()
    // 2 racimos separados → 2 grupos.
    for (const [pre, base] of [['a', { lat: 10.03, lng: -73.24 }], ['b', { lat: 10.07, lng: -73.19 }]] as const) {
      for (let i = 0; i < 4; i++) {
        const c = await testPrisma.cliente.create({
          data: {
            nombre: `R ${pre}${i}`, telefono: `380${pre === 'a' ? 1 : 2}0000${i}`,
            barrio: pre === 'a' ? 'Norte' : 'Sur',
            lat: base.lat + i * 0.0005, lng: base.lng + i * 0.0005, geocodeOrigen: 'MANUAL',
          },
        })
        await testPrisma.pedido.create({
          data: { clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: new Date('2026-09-14T12:00:00-05:00'), cPacaAguaPed: 2 },
        })
      }
    }
    await new GenerarPlanUseCase().execute({ fecha: FECHA2, maxUnidades: 70 })
  })

  afterAll(async () => {
    await testPrisma.planDia.deleteMany({})
    await disconnect()
  })

  it('replan → nueva versión REVIEW; sin cambios en la demanda → diff.sinCambios', async () => {
    const r = await new ReplanUseCase().execute({ fecha: FECHA2, maxUnidades: 70 })
    expect(r.version).toBe(2)
    expect(r.estado).toBe('REVIEW')
    expect(r.diff.sinCambios).toBe(true)

    const planes = await testPrisma.planDia.findMany({ where: { fecha: dia }, orderBy: { version: 'asc' } })
    expect(planes[0].estado).toBe('SUPERSEDED')
    expect(planes[1].estado).toBe('REVIEW')

    const versiones = await testPrisma.planDiaVersion.findMany({ where: { planDiaId: planes[1].id } })
    expect(versiones[0].diff).toBeTruthy()
  })

  it('replan tras cancelar un pedido → diff.pedidosQuitados no vacío', async () => {
    const ped = await testPrisma.pedido.findFirst({
      where: { canal: 'DOMICILIO', fecha: new Date('2026-09-14T12:00:00-05:00') },
    })
    await testPrisma.pedido.update({ where: { id: ped!.id }, data: { estadoEntrega: 'CANCELADO', estado: 'CANCELADO' } })

    const r = await new ReplanUseCase().execute({ fecha: FECHA2, maxUnidades: 70, trigger: 'CANCELACION' })
    expect(r.diff.pedidosQuitados).toContain(ped!.id)
    expect(r.diff.sinCambios).toBe(false)
  })

  it('override moverPedido: mueve un pedido de un grupo a otro', async () => {
    const plan = await testPrisma.planDia.findFirst({
      where: { fecha: dia, estado: 'REVIEW' },
      orderBy: { version: 'desc' },
      include: { grupos: { include: { paradas: { include: { actividades: true } } } } },
    })
    expect(plan!.grupos.length).toBeGreaterThanOrEqual(2)
    const origen = plan!.grupos[0]
    const destino = plan!.grupos[1]
    const pedidoId = origen.paradas.flatMap((p) => p.actividades.flatMap((a) => a.pedidoIds))[0]

    const planFresh = await testPrisma.planDia.findUnique({ where: { id: plan!.id }, select: { updatedAt: true } })
    await new OverridePlanUseCase().execute({
      planId: plan!.id,
      expectedUpdatedAt: planFresh!.updatedAt.toISOString(),
      op: { tipo: 'moverPedido', pedidoId, grupoDestinoId: destino.id },
    })

    const after = await testPrisma.planActividad.findMany({
      where: { pedidoIds: { has: pedidoId }, planParada: { planGrupo: { planDiaId: plan!.id } } },
      include: { planParada: true },
    })
    expect(after).toHaveLength(1)
    expect(after[0].planParada.planGrupoId).toBe(destino.id)
  })

  it('override moverParada: mueve todas las actividades de una parada', async () => {
    const plan = await testPrisma.planDia.findFirst({
      where: { fecha: dia, estado: 'REVIEW' },
      orderBy: { version: 'desc' },
      include: { grupos: { include: { paradas: { include: { actividades: true } } } } },
    })
    const origen = plan!.grupos.find((g) => g.paradas.length > 0)!
    const destino = plan!.grupos.find((g) => g.id !== origen.id)!
    const parada = origen.paradas[0]
    const pedidoIds = parada.actividades.flatMap((a) => a.pedidoIds)

    const fresh = await testPrisma.planDia.findUnique({ where: { id: plan!.id }, select: { updatedAt: true } })
    await new OverridePlanUseCase().execute({
      planId: plan!.id,
      expectedUpdatedAt: fresh!.updatedAt.toISOString(),
      op: { tipo: 'moverParada', paradaId: parada.id, grupoDestinoId: destino.id },
    })

    for (const pid of pedidoIds) {
      const acts = await testPrisma.planActividad.findMany({
        where: { pedidoIds: { has: pid }, planParada: { planGrupo: { planDiaId: plan!.id } } },
        include: { planParada: true },
      })
      expect(acts[0]?.planParada.planGrupoId).toBe(destino.id)
    }
  })

  it('override con expectedUpdatedAt viejo → VERSION_CONFLICT', async () => {
    const plan = await testPrisma.planDia.findFirst({ where: { fecha: dia, estado: 'REVIEW' }, orderBy: { version: 'desc' } })
    await expect(
      new OverridePlanUseCase().execute({
        planId: plan!.id,
        expectedUpdatedAt: new Date('2020-01-01').toISOString(),
        op: { tipo: 'asignarRepartidor', grupoId: 'x', trabajadorId: null },
      }),
    ).rejects.toThrow('VERSION_CONFLICT')
  })

  it('cancelar plan no confirmado → CANCELLED', async () => {
    const plan = await testPrisma.planDia.findFirst({ where: { fecha: dia, estado: 'REVIEW' }, orderBy: { version: 'desc' } })
    await testPrisma.planDia.update({ where: { id: plan!.id }, data: { estado: 'CANCELLED' } })
    const check = await testPrisma.planDia.findUnique({ where: { id: plan!.id } })
    expect(check!.estado).toBe('CANCELLED')
  })
})
