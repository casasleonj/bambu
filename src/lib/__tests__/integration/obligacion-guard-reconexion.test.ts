// @tests Reconexión I-11 (F4, decisiones del equipo sobre "cumplimiento
// acumulativo y fraccionable") — src/lib/obligacion-guard.ts contra Postgres
// real. Complementa gestionar-pendiente-integridad.test.ts (que ya cubre el
// camino feliz vía EntregarPedidoUseCase): acá se ejercen los bordes del
// guard directamente para no depender del clamp propio de cada caller.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, createTestCliente, getAdminUser, getRepartidorUser } from './setup'
import { prisma } from '@/lib/prisma'
import { aplicarEntregaConObligacion, EntregaExcedePendienteTotalError } from '@/lib/obligacion-guard'

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
  })
})
