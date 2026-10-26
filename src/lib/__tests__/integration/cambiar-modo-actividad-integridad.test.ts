// @tests N2 — CambiarModoActividadUseCase (docs/pedidos/AGUA_BAMBU_N2_ALS_v2.0.md §3.2, Caso E)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, createTestCliente, getAdminUser } from './setup'
import { GestionarPendienteUseCase } from '@/modules/embarques/application/use-cases/GestionarPendienteUseCase'
import { CambiarModoActividadUseCase } from '@/modules/embarques/application/use-cases/CambiarModoActividadUseCase'

let adminId: string
let clienteId: string

/** Pedido con 4 BOTELLON pendientes (6 de 10 ya entregados), canal PUNTO, precio histórico $4.000/u (actual $6.500/u). */
async function crearPedidoConBotellonesPendientes() {
  const total = 40_000
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId, canal: 'PUNTO', origen: 'PEDIDO', tipo: 'PUNTO',
      total, totalPagado: total, saldo: 0,
      // chk_pedido_estadopago_proyectado: pagado completo + PENDIENTE (aún
      // no entregado) → ANTICIPADO, no PAGADO.
      estadoEntrega: 'PENDIENTE', estado: 'PENDIENTE', estadoPago: 'ANTICIPADO',
      cBotellonFabPed: 10, cBotellonFabEnt: 6, precioBotellonFab: 4_000,
      items: { create: [{ producto: 'BOTELLON', cantPedido: 10, cantEntrega: 6, precio: 4_000, subtotal: total }] },
    },
  })
  const facturaNum = `FAC-T${Math.floor(Math.random() * 1e7)}`
  await testPrisma.factura.create({
    data: { numero: facturaNum, clienteId, pedidoId: pedido.id, subtotal: total, total, saldo: 0, montoPagado: total, estado: 'PAGADA' },
  })
  return pedido
}

describe('N2 — CambiarModoActividadUseCase', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await createTestCliente('CambiarModoActividad')
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  it('cambia de PUNTO a DOMICILIO y aplica el diferencial fresco', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId,
    })

    const result = await new CambiarModoActividadUseCase().execute({
      actividadId, modoDestino: 'DOMICILIO', actorId: adminId,
    })
    expect(result.deduped).toBe(false)
    expect(result.modoAnterior).toBe('PUNTO')
    expect(result.modoNuevo).toBe('DOMICILIO')
    // histórico 4*4000=16000, actual DOMICILIO 4*6500=26000 → +10000
    expect(result.diferencial?.diferencial).toBe(10_000)

    const actividad = await testPrisma.actividad.findUniqueOrThrow({ where: { id: actividadId } })
    expect(actividad.modo).toBe('DOMICILIO')

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.total)).toBe(Number(pedido.total) + 10_000)
    expect(Number(p.saldo)).toBe(10_000)
  })

  it('no-op idempotente si el modo destino es el mismo que el actual', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId,
    })
    const result = await new CambiarModoActividadUseCase().execute({
      actividadId, modoDestino: 'PUNTO', actorId: adminId,
    })
    expect(result.deduped).toBe(true)
    expect(result.diferencial).toBeUndefined()

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.total)).toBe(Number(pedido.total)) // sin cambios
  })

  it('cambiar de vuelta al canal original revierte el diferencial (Pedido.total vuelve a su valor)', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const totalOriginal = Number(pedido.total)
    const { actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'DOMICILIO', usuarioId: adminId,
    })
    const pMid = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(pMid.total)).toBe(totalOriginal + 10_000) // diferencial inicial aplicado

    // Vuelve a PUNTO con el precio vigente igual al histórico ($4.000) → diferencial 0.
    // #493: el precio ya no depende del canal, así que se baja el tramo y se restaura después.
    const tramos = await testPrisma.precioVolumen.findMany({ where: { producto: { codigo: 'BOTELLON' } } })
    await testPrisma.precioVolumen.updateMany({ where: { producto: { codigo: 'BOTELLON' } }, data: { precio: 4_000 } })
    let result: Awaited<ReturnType<CambiarModoActividadUseCase['execute']>>
    try {
      result = await new CambiarModoActividadUseCase().execute({
        actividadId, modoDestino: 'PUNTO', actorId: adminId,
      })
    } finally {
      for (const t of tramos) await testPrisma.precioVolumen.update({ where: { id: t.id }, data: { precio: t.precio } })
    }
    expect(result.diferencial?.diferencial).toBe(0)

    const pFinal = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(pFinal.total)).toBe(totalOriginal) // el +10000 se revirtió
    expect(Number(pFinal.saldo)).toBe(0)

    const factura = await testPrisma.factura.findUniqueOrThrow({ where: { pedidoId: pedido.id } })
    expect(Number(factura.total)).toBe(totalOriginal)
    expect(factura.estado).toBe('PAGADA')

    // Conservación: la suma de TODOS los ajustes de esta obligación es 0
    // (aplicado +10000, revertido -10000, nuevo diferencial 0).
    const obligacion = await testPrisma.obligacionPendiente.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    const ajustes = await testPrisma.pedidoCantidadAjuste.findMany({ where: { obligacionId: obligacion.id } })
    const sumaTotal = ajustes.reduce((s, a) => s + Number(a.montoDiferencial ?? 0), 0)
    expect(sumaTotal).toBe(0)
  })

  it('rechaza cambiar el modo de una Actividad ya CANCELADA', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId,
    })
    await testPrisma.actividad.update({ where: { id: actividadId }, data: { estado: 'CANCELADA' } })

    await expect(
      new CambiarModoActividadUseCase().execute({ actividadId, modoDestino: 'DOMICILIO', actorId: adminId }),
    ).rejects.toThrow('ACTIVIDAD_NO_MODIFICABLE')
  })

  it('idempotencia: replay con el mismo offlineId no re-aplica el diferencial', async () => {
    const pedido = await crearPedidoConBotellonesPendientes()
    const { actividadId } = await new GestionarPendienteUseCase().execute({
      pedidoId: pedido.id, producto: 'BOTELLON', cantidad: 4, modoInicial: 'PUNTO', usuarioId: adminId,
    })
    const offlineId = `cm-${actividadId}`
    const input = { actividadId, modoDestino: 'DOMICILIO' as const, actorId: adminId, offlineId }

    const r1 = await new CambiarModoActividadUseCase().execute(input)
    const r2 = await new CambiarModoActividadUseCase().execute(input)

    expect(r1.deduped).toBe(false)
    expect(r2.deduped).toBe(true)

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.total)).toBe(Number(pedido.total) + 10_000) // aplicado UNA sola vez
  })
})
