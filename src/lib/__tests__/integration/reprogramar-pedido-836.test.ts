// @tests #836 F1 — ReprogramarPedidoUseCase contra Postgres real. Matriz A01–A05, A21, A22, A23.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, createTestCliente, getAdminUser } from './setup'
import {
  ReprogramarPedidoUseCase,
  PedidoNoReprogramableError,
  PedidoFechaCambioConcurrenteError,
  PedidoReprogramacionNotFoundError,
} from '@/modules/pedidos/application/use-cases/ReprogramarPedidoUseCase'
import { clasificarCompromiso } from '@/lib/pedidos-compromiso'
import { todayStringBogota } from '@/lib/dates'

let adminId: string
let clienteId: string
const DIA = 86_400_000
const uc = new ReprogramarPedidoUseCase()

async function crearPedido(o: { fechaEntrega?: Date | null; estadoEntrega?: 'PENDIENTE' | 'ENTREGADO' | 'CANCELADO' | 'ANULADO' } = {}) {
  return testPrisma.pedido.create({
    data: {
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      estadoEntrega: o.estadoEntrega ?? 'PENDIENTE', estado: o.estadoEntrega ?? 'PENDIENTE',
      // chk_pedido_estadopago_proyectado: cancelado/anulado ⇒ estadoPago ANULADO.
      estadoPago: o.estadoEntrega === 'CANCELADO' || o.estadoEntrega === 'ANULADO' ? 'ANULADO' : 'PENDIENTE',
      total: 10000, totalPagado: 0, saldo: 10000,
      fechaEntrega: o.fechaEntrega === undefined ? null : o.fechaEntrega,
    },
  })
}

describe('#836 F1 — reprogramar la fecha prometida (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await createTestCliente('Reprogramar836')).id
  })
  afterAll(async () => { await disconnect() })

  it('A01/A02: creado antes pero previsto para hoy o futuro NO es atraso; conserva creación y no toca dinero', async () => {
    const hoy = todayStringBogota()
    const creadoHace3 = new Date(Date.now() - 3 * DIA)
    const p = await testPrisma.pedido.create({
      data: { clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estadoEntrega: 'PENDIENTE', estado: 'PENDIENTE', estadoPago: 'PENDIENTE',
        total: 10000, totalPagado: 0, saldo: 10000, createdAt: creadoHace3, fecha: creadoHace3, fechaEntrega: new Date(Date.now() + 2 * DIA) },
    })
    expect(clasificarCompromiso(p, hoy)).toBe('programado')
    const r = await uc.execute({ pedidoId: p.id, fechaNueva: new Date(), actorId: adminId })
    const despues = await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })
    expect(clasificarCompromiso(despues, hoy)).toBe('hoy')
    expect(despues.createdAt.getTime()).toBe(creadoHace3.getTime())
    expect(despues.fecha.getTime()).toBe(creadoHace3.getTime())
    expect(despues.entregadoAt).toBeNull()
    expect(Number(despues.total)).toBe(10000)
    expect(Number(despues.saldo)).toBe(10000)
    expect(r.vencidaAlReprogramar).toBe(false)
  })

  it('A03: previsto ayer y sin entregar → «arrastrado», una sola vez', async () => {
    const p = await crearPedido({ fechaEntrega: new Date(Date.now() - DIA) })
    expect(clasificarCompromiso(p, todayStringBogota())).toBe('arrastrado')
  })

  it('A04: reprogramar ANTES de vencer no marca incumplimiento y conserva historial', async () => {
    const p = await crearPedido({ fechaEntrega: new Date(Date.now() + DIA) })
    const r = await uc.execute({ pedidoId: p.id, fechaNueva: new Date(Date.now() + 3 * DIA), actorId: adminId, motivo: 'Cliente pidió esperar' })
    expect(r.vencidaAlReprogramar).toBe(false)
    expect(r.fechaAnterior?.getTime()).toBe(p.fechaEntrega!.getTime())
    const h = await testPrisma.pedidoReprogramacion.findMany({ where: { pedidoId: p.id } })
    expect(h).toHaveLength(1)
    expect(h[0].motivo).toBe('Cliente pidió esperar')
    expect(h[0].reprogramadoPorId).toBe(adminId)
  })

  it('A05: reprogramar DESPUÉS de vencer congela el incumplimiento y una 2.ª reprogramación no lo borra', async () => {
    const p = await crearPedido({ fechaEntrega: new Date(Date.now() - 2 * DIA) })
    const r1 = await uc.execute({ pedidoId: p.id, fechaNueva: new Date(Date.now() + DIA), actorId: adminId })
    expect(r1.vencidaAlReprogramar).toBe(true)
    const r2 = await uc.execute({ pedidoId: p.id, fechaNueva: new Date(Date.now() + 4 * DIA), actorId: adminId })
    expect(r2.vencidaAlReprogramar).toBe(false)
    expect(r2.vecesReprogramado).toBe(2)
    const h = await testPrisma.pedidoReprogramacion.findMany({ where: { pedidoId: p.id }, orderBy: { reprogramadoAt: 'asc' } })
    expect(h.map((x) => x.vencidaAlReprogramar)).toEqual([true, false])
  })

  it('A21: dos personas con la misma fecha esperada → gana la primera, la segunda recibe conflicto', async () => {
    const p = await crearPedido({ fechaEntrega: new Date(Date.now() + DIA) })
    const esperada = p.fechaEntrega
    const resultados = await Promise.allSettled([
      uc.execute({ pedidoId: p.id, fechaNueva: new Date(Date.now() + 5 * DIA), actorId: adminId, fechaAnteriorEsperada: esperada }),
      uc.execute({ pedidoId: p.id, fechaNueva: new Date(Date.now() + 6 * DIA), actorId: adminId, fechaAnteriorEsperada: esperada }),
    ])
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rechazo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rechazo.reason).toBeInstanceOf(PedidoFechaCambioConcurrenteError)
    expect(await testPrisma.pedidoReprogramacion.count({ where: { pedidoId: p.id } })).toBe(1)
  })

  it('A22: reintento offline con el mismo offlineId no duplica ni cambia el resultado', async () => {
    const p = await crearPedido({ fechaEntrega: new Date(Date.now() + DIA) })
    const fechaNueva = new Date(Date.now() + 3 * DIA)
    const a = await uc.execute({ pedidoId: p.id, fechaNueva, actorId: adminId, offlineId: 'off-836-a' })
    const b = await uc.execute({ pedidoId: p.id, fechaNueva, actorId: adminId, offlineId: 'off-836-a' })
    expect(a.deduped).toBe(false)
    expect(b.deduped).toBe(true)
    expect(await testPrisma.pedidoReprogramacion.count({ where: { pedidoId: p.id } })).toBe(1)
  })

  it('A23: entregado, cancelado o anulado no se reprograma ni cuenta como demanda pendiente', async () => {
    for (const estado of ['ENTREGADO', 'CANCELADO', 'ANULADO'] as const) {
      const p = await crearPedido({ estadoEntrega: estado, fechaEntrega: new Date(Date.now() - DIA) })
      expect(clasificarCompromiso(p, todayStringBogota())).toBe('cerrado')
      await expect(uc.execute({ pedidoId: p.id, fechaNueva: new Date(Date.now() + DIA), actorId: adminId })).rejects.toBeInstanceOf(PedidoNoReprogramableError)
      expect(await testPrisma.pedidoReprogramacion.count({ where: { pedidoId: p.id } })).toBe(0)
    }
  })

  it('pedido inexistente → no encontrado; sin fecha previa se puede fijar la primera', async () => {
    await expect(uc.execute({ pedidoId: 'no-existe', fechaNueva: new Date(), actorId: adminId })).rejects.toBeInstanceOf(PedidoReprogramacionNotFoundError)
    const p = await crearPedido({ fechaEntrega: null })
    expect(clasificarCompromiso(p, todayStringBogota())).toBe('sin_fecha')
    const r = await uc.execute({ pedidoId: p.id, fechaNueva: new Date(Date.now() + DIA), actorId: adminId, fechaAnteriorEsperada: null })
    expect(r.fechaAnterior).toBeNull()
    expect(r.vencidaAlReprogramar).toBe(false)
  })
})
