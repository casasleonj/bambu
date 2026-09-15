// @tests Reconexión I-11 (F4, decisiones del equipo sobre "cumplimiento
// acumulativo y fraccionable") — src/lib/obligacion-guard.ts contra Postgres
// real. Complementa gestionar-pendiente-integridad.test.ts (que ya cubre el
// camino feliz vía EntregarPedidoUseCase): acá se ejercen los bordes del
// guard directamente para no depender del clamp propio de cada caller.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, createTestCliente, getAdminUser, getRepartidorUser } from './setup'
import { prisma } from '@/lib/prisma'
import { aplicarEntregaConObligacion, EntregaExcedePendienteTotalError, EntregaSuperaLoAsignadoError, ObligacionActividadDesincronizadaError } from '@/lib/obligacion-guard'
import { AsignarActividadUseCase } from '@/modules/embarques/application/use-cases/AsignarActividadUseCase'
import { CambiarModoActividadUseCase } from '@/modules/embarques/application/use-cases/CambiarModoActividadUseCase'
import { LiberarActividadUseCase } from '@/modules/embarques/application/use-cases/LiberarActividadUseCase'
import { EntregarPedidoUseCase } from '@/modules/pedidos/application/use-cases/EntregarPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaTransactionManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

function buildEntregarUseCase() {
  return new EntregarPedidoUseCase(new PrismaPedidoRepository(), new PrismaFacturaRepository(), new PrismaPagoRepository(), new PrismaTransactionManager())
}

let adminId: string
let repartidorId: string
let clienteId: string

async function crearPedidoConObligacion(opts: {
  cantPedido: number
  cantEntrega: number
  cantidadOriginalObligacion: number
  cantidadCumplidaObligacion?: number
  cantidadAsignadaObligacion?: number
}) {
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId, canal: 'PUNTO', origen: 'PEDIDO',
      estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA', estadoPago: 'PENDIENTE',
      total: 10000, totalPagado: 0, saldo: 10000,
      cBotellonFabPed: opts.cantPedido, cBotellonFabEnt: opts.cantEntrega,
      items: {
        create: [{ producto: 'BOTELLON', cantPedido: opts.cantPedido, cantEntrega: opts.cantEntrega, precio: 1000, subtotal: opts.cantPedido * 1000 }],
      },
    },
  })
  const obligacion = await testPrisma.obligacionPendiente.create({
    data: {
      pedidoId: pedido.id, clienteId, producto: 'BOTELLON',
      cantidadOriginal: opts.cantidadOriginalObligacion,
      cantidadCumplida: opts.cantidadCumplidaObligacion ?? 0,
      cantidadAsignada: opts.cantidadAsignadaObligacion ?? opts.cantidadOriginalObligacion,
      estado: 'ABIERTA',
    },
  })
  const actividad = await testPrisma.actividad.create({
    data: {
      obligacionId: obligacion.id, tipo: 'ENTREGA',
      cantidad: opts.cantidadOriginalObligacion,
      cantidadCumplida: opts.cantidadCumplidaObligacion ?? 0,
      estado: 'ASIGNADA', modo: 'PUNTO',
    },
  })
  return { pedido, obligacion, actividad }
}

/**
 * Integridad Obligación↔Actividades (revisión del equipo, PR #258 ronda 3):
 * `ObligacionPendiente.cantidadCumplida` debe coincidir SIEMPRE con la suma
 * de `Actividad.cantidadCumplida` de todas sus Actividades — nunca puede la
 * Obligación acreditarse cumplimiento que no quedó reflejado en ninguna
 * Actividad concreta.
 */
async function sumaCantidadCumplidaActividades(obligacionId: string) {
  const actividades = await testPrisma.actividad.findMany({ where: { obligacionId } })
  return actividades.reduce((sum, a) => sum + a.cantidadCumplida, 0)
}

describe('Reconexión I-11 — aplicarEntregaConObligacion (integración, Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    repartidorId = (await getRepartidorUser()).id
    const c = await createTestCliente('ReconexionI11')
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  it('sin ObligacionPendiente ABIERTA → no-op, no consulta nada más', async () => {
    const pedido = await testPrisma.pedido.create({
      data: { clienteId, canal: 'PUNTO', origen: 'PEDIDO', estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA', estadoPago: 'PENDIENTE', total: 1000, totalPagado: 0, saldo: 1000 },
    })
    const resultados = await prisma.$transaction(tx =>
      aplicarEntregaConObligacion(tx, pedido.id, [{ producto: 'BOTELLON', cantPedido: 10, cantEntregaActual: 0, cantidadAEntregar: 5 }]),
    )
    expect(resultados).toEqual([])
  })

  it('entrega que excede TODO lo disponible (ordinario + pendiente real de la obligación) → rechaza sin aplicar nada', async () => {
    // cantPedido=10, cantEntrega=6 → limiteOrdinario = 10 - 3(original) = 7,
    // disponibleOrdinario = 1. Obligación ya tiene 2/3 cumplidos → pendiente
    // real = 1. Disponible TOTAL = 1 (ordinario) + 1 (obligación) = 2.
    // Pedir 3 debe rechazar — no hay de dónde sacar la tercera unidad.
    const { obligacion, actividad } = await crearPedidoConObligacion({
      cantPedido: 10, cantEntrega: 6, cantidadOriginalObligacion: 3, cantidadCumplidaObligacion: 2, cantidadAsignadaObligacion: 1,
    })

    await expect(
      prisma.$transaction(tx =>
        aplicarEntregaConObligacion(tx, obligacion.pedidoId!, [{ producto: 'BOTELLON', cantPedido: 10, cantEntregaActual: 6, cantidadAEntregar: 3 }]),
      ),
    ).rejects.toThrow(EntregaExcedePendienteTotalError)

    // Nada CAMBIÓ respecto al estado inicial del fixture (2/3 ya cumplidos
    // de antes) — el rechazo es atómico, no aplica ni parcialmente el intento.
    const obligacionSinCambios = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    expect(obligacionSinCambios.cantidadCumplida).toBe(2)
    const actividadSinCambios = await testPrisma.actividad.findUniqueOrThrow({ where: { id: actividad.id } })
    expect(actividadSinCambios.cantidadCumplida).toBe(2)
    expect(actividadSinCambios.estado).toBe('ASIGNADA')
  })

  it('respeta el invariante cumplida + asignada <= original tras aplicar', async () => {
    const { pedido, obligacion } = await crearPedidoConObligacion({
      cantPedido: 10, cantEntrega: 6, cantidadOriginalObligacion: 4,
    })

    await prisma.$transaction(tx =>
      aplicarEntregaConObligacion(tx, pedido.id, [{ producto: 'BOTELLON', cantPedido: 10, cantEntregaActual: 6, cantidadAEntregar: 4 }]),
    )

    const obligacionFinal = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    expect(obligacionFinal.cantidadCumplida + obligacionFinal.cantidadAsignada).toBeLessThanOrEqual(obligacionFinal.cantidadOriginal)
    expect(obligacionFinal.cantidadCumplida).toBe(4)
    expect(obligacionFinal.cantidadAsignada).toBe(0)
    expect(obligacionFinal.estado).toBe('CUMPLIDA')
    // Integridad Obligación↔Actividades: nunca descuadradas.
    expect(await sumaCantidadCumplidaActividades(obligacion.id)).toBe(obligacionFinal.cantidadCumplida)
  })

  it('concurrencia: dos aplicaciones simultáneas sobre la misma Obligación se serializan (lock OBLIGACION), sin sobreconsumo', async () => {
    const { pedido, obligacion } = await crearPedidoConObligacion({
      cantPedido: 20, cantEntrega: 10, cantidadOriginalObligacion: 10,
    })
    // limiteOrdinario = 20 - 10 = 10, disponibleOrdinario tras 10 entregadas = 0.
    // Cada llamada de 5 cae ENTERA en zona de obligación.

    const [r1, r2] = await Promise.all([
      prisma.$transaction(tx =>
        aplicarEntregaConObligacion(tx, pedido.id, [{ producto: 'BOTELLON', cantPedido: 20, cantEntregaActual: 10, cantidadAEntregar: 5 }], adminId),
      ),
      prisma.$transaction(tx =>
        aplicarEntregaConObligacion(tx, pedido.id, [{ producto: 'BOTELLON', cantPedido: 20, cantEntregaActual: 10, cantidadAEntregar: 5 }], repartidorId),
      ),
    ])

    // Ambas se aplicaron (5+5=10, exactamente lo pendiente) — el lock las
    // serializa, no las rechaza ni las corrompe.
    expect(r1[0]?.aplicado).toBe(5)
    expect(r2[0]?.aplicado).toBe(5)

    const obligacionFinal = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    expect(obligacionFinal.cantidadCumplida).toBe(10)
    expect(obligacionFinal.cantidadAsignada).toBe(0)
    expect(obligacionFinal.estado).toBe('CUMPLIDA')
    // Invariante nunca violado, ni siquiera transitoriamente de forma persistida.
    expect(obligacionFinal.cantidadCumplida + obligacionFinal.cantidadAsignada).toBeLessThanOrEqual(obligacionFinal.cantidadOriginal)
    // Integridad Obligación↔Actividades: nunca descuadradas, ni bajo concurrencia.
    expect(await sumaCantidadCumplidaActividades(obligacion.id)).toBe(obligacionFinal.cantidadCumplida)
  })

  it('escenario exacto de revisión: original=10, cumplida=4, asignada=2 → una entrega de 4 NO puede convertir cantidad no asignada en cumplimiento', async () => {
    // pendiente real = 10-4 = 6, pero solo 2 de esas 6 están efectivamente
    // comprometidas con una Actividad concreta — las otras 4 son "reservadas
    // por la Obligación" pero sin ningún camino de cumplimiento legítimo hoy.
    const { pedido, obligacion, actividad } = await crearPedidoConObligacion({
      cantPedido: 20, cantEntrega: 10, cantidadOriginalObligacion: 10, cantidadCumplidaObligacion: 4, cantidadAsignadaObligacion: 2,
    })
    // limiteOrdinario = 20-10=10, disponibleOrdinario tras 10 entregadas = 0
    // → una entrega de 4 cae ENTERA en zona reservada (haciaObligacion=4),
    // que supera lo asignado (2) aunque NO supere el pendiente total (6).

    await expect(
      prisma.$transaction(tx =>
        aplicarEntregaConObligacion(tx, pedido.id, [{ producto: 'BOTELLON', cantPedido: 20, cantEntregaActual: 10, cantidadAEntregar: 4 }]),
      ),
    ).rejects.toThrow(EntregaSuperaLoAsignadoError)

    // Nada se modificó — el rechazo es atómico y no aplicó ni siquiera la
    // porción de 2 que SÍ estaba asignada (evita relatos distintos entre
    // "cuánto dice el Pedido que entregó" y "cuánto dice N2 que cumplió").
    const obligacionSinCambios = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    expect(obligacionSinCambios.cantidadCumplida).toBe(4)
    expect(obligacionSinCambios.cantidadAsignada).toBe(2)
    const actividadSinCambios = await testPrisma.actividad.findUniqueOrThrow({ where: { id: actividad.id } })
    expect(actividadSinCambios.cantidadCumplida).toBe(4)
  })

  it('tras asignar explícitamente la cantidad faltante (AsignarActividadUseCase), la misma entrega ya se aplica correctamente', async () => {
    const { pedido, obligacion, actividad } = await crearPedidoConObligacion({
      cantPedido: 20, cantEntrega: 10, cantidadOriginalObligacion: 10, cantidadCumplidaObligacion: 4, cantidadAsignadaObligacion: 2,
    })
    // Se asignan las 4 unidades restantes (10-4-2=4 "disponibles" en la
    // obligación) a una segunda Actividad concreta — acción explícita, no inferida.
    const { actividadId: segundaActividadId } = await new AsignarActividadUseCase().execute({
      obligacionId: obligacion.id, producto: 'BOTELLON', cantidad: 4,
    })

    const resultados = await prisma.$transaction(tx =>
      aplicarEntregaConObligacion(tx, pedido.id, [{ producto: 'BOTELLON', cantPedido: 20, cantEntregaActual: 10, cantidadAEntregar: 4 }]),
    )
    // 4 (ya cumplidas antes) + 4 (esta entrega) = 8 de 10 — todavía no cierra
    // la Obligación (la Actividad original todavía tiene 2 de margen sin
    // asignar respecto al original de la obligación).
    expect(resultados[0]?.aplicado).toBe(4)
    expect(resultados[0]?.obligacionCumplida).toBe(false)

    const obligacionFinal = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    expect(obligacionFinal.cantidadCumplida).toBe(8)
    expect(obligacionFinal.estado).toBe('ABIERTA')
    // La distribución es FIFO por createdAt entre las Actividades ABIERTAS
    // de la obligación (sin caso especial para "la última asignada") — la
    // Actividad original (cantidad=10, cumplida=4) todavía tenía margen
    // (10-4=6) suficiente para absorber toda esta entrega de 4 antes de
    // llegar a la segunda. La segunda Actividad queda intacta, disponible
    // para una futura entrega.
    const actividadOriginalFinal = await testPrisma.actividad.findUniqueOrThrow({ where: { id: actividad.id } })
    expect(actividadOriginalFinal.cantidadCumplida).toBe(8)
    expect(actividadOriginalFinal.estado).toBe('ASIGNADA')
    const segundaActividad = await testPrisma.actividad.findUniqueOrThrow({ where: { id: segundaActividadId } })
    expect(segundaActividad.cantidadCumplida).toBe(0)
    expect(segundaActividad.estado).toBe('ASIGNADA')
    // Integridad Obligación↔Actividades: 8 (original) + 0 (segunda) === 8.
    expect(await sumaCantidadCumplidaActividades(obligacion.id)).toBe(obligacionFinal.cantidadCumplida)
  })

  it('desincronización defensiva: cantidadAsignada de la Obligación excede la capacidad real de sus Actividades → rechaza sin acreditar nada', async () => {
    // Bajo los casos de uso normales (GestionarPendienteUseCase,
    // AsignarActividadUseCase, LiberarActividadUseCase), `cantidadAsignada`
    // de la Obligación SIEMPRE coincide con la capacidad real disponible en
    // sus Actividades ASIGNADA/EN_PROGRESO — nunca deberían poder
    // desincronizarse. Este test simula directamente (bypass de esos casos
    // de uso) ese escenario para probar que `aplicarEntregaConObligacion`
    // NUNCA confía ciegamente en el contador agregado: valida la capacidad
    // real antes de acreditar cumplimiento.
    const { pedido, obligacion, actividad } = await crearPedidoConObligacion({
      cantPedido: 20, cantEntrega: 10, cantidadOriginalObligacion: 10, cantidadAsignadaObligacion: 5,
    })
    // La Obligación "dice" tener 5 unidades asignadas, pero su única
    // Actividad real solo tiene capacidad para 3 — desincronización directa.
    await testPrisma.actividad.update({ where: { id: actividad.id }, data: { cantidad: 3 } })

    await expect(
      prisma.$transaction(tx =>
        aplicarEntregaConObligacion(tx, pedido.id, [{ producto: 'BOTELLON', cantPedido: 20, cantEntregaActual: 10, cantidadAEntregar: 5 }]),
      ),
    ).rejects.toThrow(ObligacionActividadDesincronizadaError)

    // Nada se escribió — ni la Obligación ni la Actividad cambiaron. No se
    // acredita silenciosamente una cantidad que no quedó aplicada a ninguna
    // Actividad real.
    const obligacionSinCambios = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    expect(obligacionSinCambios.cantidadCumplida).toBe(0)
    expect(obligacionSinCambios.cantidadAsignada).toBe(5)
    const actividadSinCambios = await testPrisma.actividad.findUniqueOrThrow({ where: { id: actividad.id } })
    expect(actividadSinCambios.cantidadCumplida).toBe(0)
    expect(await sumaCantidadCumplidaActividades(obligacion.id)).toBe(obligacionSinCambios.cantidadCumplida)
  })

  it('sin deadlock: EntregarPedidoUseCase (lock PEDIDO→OBLIGACION) concurrente con CambiarModoActividadUseCase (lock OBLIGACION solo) sobre la misma Obligación', async () => {
    const { pedido, obligacion, actividad } = await crearPedidoConObligacion({
      cantPedido: 20, cantEntrega: 10, cantidadOriginalObligacion: 10,
    })
    // limiteOrdinario=10, disponibleOrdinario tras 10 entregadas=0 → toda
    // entrega cae en zona reservada.
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA' } })

    // Dos operaciones que adquieren OBLIGACION:{id} en órdenes de lock
    // distintos (PEDIDO→OBLIGACION vs. OBLIGACION solo) — si hubiera un
    // ciclo de espera posible, esto colgaría (el test tiene su propio
    // timeout de vitest, así que un deadlock real haría FALLAR el test por
    // timeout, no pasar silenciosamente).
    const [entregaRes] = await Promise.all([
      buildEntregarUseCase().execute({ pedidoId: pedido.id, itemsEntregados: [{ producto: 'BOTELLON', cantidad: 4 }], pagos: [] }),
      new CambiarModoActividadUseCase().execute({ actividadId: actividad.id, modoDestino: 'DOMICILIO', actorId: adminId }),
    ])

    expect(entregaRes.deduped).toBeFalsy()
    const obligacionFinal = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    // Ambas operaciones se aplicaron — el lock serializa, no corrompe.
    expect(obligacionFinal.cantidadCumplida).toBe(4)
    const actividadFinal = await testPrisma.actividad.findUniqueOrThrow({ where: { id: actividad.id } })
    expect(actividadFinal.modo).toBe('DOMICILIO')
    expect(actividadFinal.cantidadCumplida).toBe(4)
    expect(await sumaCantidadCumplidaActividades(obligacion.id)).toBe(obligacionFinal.cantidadCumplida)
  })

  it('revalida el estado DESPUÉS del lock: entrega concurrente con liberar-actividad nunca acredita cumplimiento a una Obligación que ya no está ABIERTA', async () => {
    // Ambas operaciones adquieren OBLIGACION:{id} de forma independiente
    // (EntregarPedidoUseCase vía aplicarEntregaConObligacion,
    // LiberarActividadUseCase vía withAdvisoryLock) — el lock serializa,
    // pero cuál gana la carrera es no determinístico. El punto del fix es
    // que AMBOS desenlaces posibles queden seguros: si liberar corre
    // primero y anula la Obligación (única Actividad, sin cumplimiento
    // previo), la re-lectura DENTRO del lock de aplicarEntregaConObligacion
    // debe ver 'ANULADA' y saltarse el crédito — nunca debe aplicar
    // cumplimiento a una Obligación que ya no está ABIERTA, sin importar
    // que la lectura ANTERIOR al lock (el findMany inicial) la haya visto
    // ABIERTA. Si entrega corre primero, la Actividad queda CUMPLIDA y
    // liberar debe rechazar (ACTIVIDAD_NO_MODIFICABLE) — no hay tercer
    // desenlace posible.
    const { pedido, obligacion, actividad } = await crearPedidoConObligacion({
      cantPedido: 20, cantEntrega: 10, cantidadOriginalObligacion: 10,
    })
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA' } })

    const entregaPromise = buildEntregarUseCase().execute({
      pedidoId: pedido.id, itemsEntregados: [{ producto: 'BOTELLON', cantidad: 10 }], pagos: [], actorId: adminId,
    })
    const liberarPromise = new LiberarActividadUseCase()
      .execute({ actividadId: actividad.id, motivo: 'carrera de prueba', actorId: adminId })
      .catch((err: Error) => ({ error: err }))

    const [entregaRes, liberarRes] = await Promise.all([entregaPromise, liberarPromise])

    // La entrega SIEMPRE tiene éxito — el guard nunca debe hacer fallar la
    // entrega completa por esta carrera (Pedido es autoridad separada).
    expect(entregaRes.deduped).toBeFalsy()

    const obligacionFinal = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    // Invariante universal, sin importar quién ganó la carrera del lock.
    expect(obligacionFinal.cantidadCumplida + obligacionFinal.cantidadAsignada).toBeLessThanOrEqual(obligacionFinal.cantidadOriginal)
    expect(await sumaCantidadCumplidaActividades(obligacion.id)).toBe(obligacionFinal.cantidadCumplida)
    if (obligacionFinal.estado === 'ANULADA') {
      // liberar ganó y corrió primero, o su commit quedó visible para la
      // re-lectura de entrega bajo el lock — en ambos casos, cero crédito.
      expect(obligacionFinal.cantidadCumplida).toBe(0)
      expect('error' in liberarRes ? undefined : liberarRes.obligacionAnulada).toBe(true)
    } else {
      // entrega ganó (o su commit quedó visible para la re-lectura de
      // liberar) — la Actividad quedó CUMPLIDA, liberar debe rechazar.
      expect(obligacionFinal.estado).toBe('CUMPLIDA')
      expect(obligacionFinal.cantidadCumplida).toBe(10)
      expect('error' in liberarRes).toBe(true)
      if ('error' in liberarRes) {
        expect(liberarRes.error.message).toContain('ACTIVIDAD_NO_MODIFICABLE')
      }
    }
  })
})
