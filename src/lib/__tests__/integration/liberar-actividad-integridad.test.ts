// @tests N2 — LiberarActividadUseCase (docs/pedidos/AGUA_BAMBU_N2_ALS_v2.0.md §3.5, Caso J)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, createTestCliente, getAdminUser } from './setup'
import { GestionarPendienteUseCase } from '@/modules/embarques/application/use-cases/GestionarPendienteUseCase'
import { CambiarModoActividadUseCase } from '@/modules/embarques/application/use-cases/CambiarModoActividadUseCase'
import { LiberarActividadUseCase } from '@/modules/embarques/application/use-cases/LiberarActividadUseCase'

let adminId: string
let clienteId: string

/** Pedido con 4 BOTELLON pendientes (6 de 10 ya entregados), canal PUNTO, precio histórico $6.500/u. */
async function crearPedidoConBotellonesPendientes() {
  const total = 65_000
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId, canal: 'PUNTO', origen: 'PEDIDO', tipo: 'PUNTO',
      total, totalPagado: total, saldo: 0,
      estadoEntrega: 'PENDIENTE', estado: 'PENDIENTE', estadoPago: 'PAGADO',
      cBotellonFabPed: 10, cBotellonFabEnt: 6, precioBotellonFab: 6_500,
      items: { create: [{ producto: 'BOTELLON', cantPedido: 10, cantEntrega: 6, precio: 6_500, subtotal: total }] },
    },
  })
  const facturaNum = `FAC-T${Math.floor(Math.random() * 1e7)}`
  await testPrisma.factura.create({
    data: { numero: facturaNum, clienteId, pedidoId: pedido.id, subtotal: total, total, saldo: 0, montoPagado: total, estado: 'PAGADA' },
  })
  return pedido
}

describe('N2 — LiberarActividadUseCase (Caso J)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await createTestCliente('LiberarActividad')
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  it('libera sin diferencial: Actividad CANCELADA, ObligacionPendiente ANULADA, remanente vuelve al Pedido', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { obligacionId, actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId,
    })

    const result = await new LiberarActividadUseCase().execute({
      actividadId, motivo: 'El cliente ya no quiere gestionar el pendiente', actorId: adminId,
    })
    expect(result.deduped).toBe(false)
    expect(result.obligacionAnulada).toBe(true)
    expect(result.montoRevertido).toBe(0)

    const actividad = await testPrisma.actividad.findUniqueOrThrow({ where: { id: actividadId } })
    expect(actividad.estado).toBe('CANCELADA')
    expect(actividad.embarqueId).toBeNull()

    const obligacion = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacionId } })
    expect(obligacion.estado).toBe('ANULADA')
    expect(obligacion.cantidadAsignada).toBe(0)

    // El remanente (4 unidades) sigue intacto en el Pedido — nada se perdió.
    const item = await testPrisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: pedido.id, producto: 'BOTELLON' } })
    expect(item.cantPedido - item.cantEntrega).toBe(4)
  })

  it('libera con diferencial ya aplicado: revierte Pedido.total/Factura', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'DOMICILIO', usuarioId: adminId,
    })
    const pMid = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(pMid.total)).toBe(Number(pedido.total) + 10_000) // diferencial aplicado

    const result = await new LiberarActividadUseCase().execute({
      actividadId, motivo: 'Cancelado antes de ejecutar', actorId: adminId,
    })
    expect(result.montoRevertido).toBe(10_000)

    const pFinal = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(pFinal.total)).toBe(Number(pedido.total)) // revertido
    expect(Number(pFinal.saldo)).toBe(0)

    const factura = await testPrisma.factura.findUniqueOrThrow({ where: { pedidoId: pedido.id } })
    expect(Number(factura.total)).toBe(Number(pedido.total))
    expect(factura.estado).toBe('PAGADA')
  })

  it('no anula la ObligacionPendiente si ya tiene cantidadCumplida > 0', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { obligacionId, actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId,
    })
    // Simula que ya se cumplió parte de la obligación (fuera de alcance de
    // este PR el caso de uso de "cumplir" — se ejerce directo contra la DB).
    await testPrisma.obligacionPendiente.update({ where: { id: obligacionId }, data: { cantidadCumplida: 2, cantidadAsignada: 2 } })
    await testPrisma.actividad.update({ where: { id: actividadId }, data: { cantidadCumplida: 2 } })

    await new LiberarActividadUseCase().execute({ actividadId, motivo: 'Cancelar el resto', actorId: adminId })

    const obligacion = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacionId } })
    expect(obligacion.estado).toBe('ABIERTA') // NO se anula — ya hay cumplimiento parcial real
  })

  it('rechaza liberar una Actividad ya CUMPLIDA', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId,
    })
    await testPrisma.actividad.update({ where: { id: actividadId }, data: { estado: 'CUMPLIDA' } })

    await expect(
      new LiberarActividadUseCase().execute({ actividadId, motivo: 'x', actorId: adminId }),
    ).rejects.toThrow('ACTIVIDAD_NO_MODIFICABLE')
  })

  it('dedup por estado: liberar dos veces sin offlineId no falla ni duplica la reversión', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'DOMICILIO', usuarioId: adminId,
    })

    const r1 = await new LiberarActividadUseCase().execute({ actividadId, motivo: 'x', actorId: adminId })
    const r2 = await new LiberarActividadUseCase().execute({ actividadId, motivo: 'x', actorId: adminId })

    expect(r1.deduped).toBe(false)
    expect(r2.deduped).toBe(true)

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.total)).toBe(Number(pedido.total)) // revertido UNA sola vez
  })

  it('idempotencia por offlineId', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId,
    })
    const offlineId = `lib-${actividadId}`
    const input = { actividadId, motivo: 'x', actorId: adminId, offlineId }

    const r1 = await new LiberarActividadUseCase().execute(input)
    const r2 = await new LiberarActividadUseCase().execute(input)

    expect(r1.deduped).toBe(false)
    expect(r2.deduped).toBe(true)
  })

  it('funciona correctamente incluso tras un CambiarModoActividadUseCase previo (conservación total)', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId,
    })
    await new CambiarModoActividadUseCase().execute({ actividadId, modoDestino: 'DOMICILIO', actorId: adminId })
    const pMid = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(pMid.total)).toBe(Number(pedido.total) + 10_000)

    await new LiberarActividadUseCase().execute({ actividadId, motivo: 'x', actorId: adminId })

    const pFinal = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(pFinal.total)).toBe(Number(pedido.total)) // vuelve a cero neto
  })
})
