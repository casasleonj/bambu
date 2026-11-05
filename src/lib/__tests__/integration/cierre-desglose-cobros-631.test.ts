// @tests #631 — el cierre explica de dónde viene lo cobrado (origen × medio), lista a quién se fió y detalla los pagos
// por confirmar; la cola de confirmación se filtra por pedido. Handlers y PostgreSQL reales; datos sintéticos.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'

const actor = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: actor })),
  requireRole: vi.fn(async () => ({ user: actor })),
}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn(async () => {}) }))

import { GET as preview } from '@/app/api/cierre/route'
import { GET as colaPorConfirmar } from '@/app/api/pagos/por-confirmar/route'

const DIA = '2026-03-24'
const AYER = '2026-03-23'
const mediodia = (dia: string) => new Date(`${dia}T12:00:00-05:00`)

async function crearPedido(dia: string, nombre: string, total: number, pagado: number, extra: Record<string, unknown> = {}) {
  const cliente = await testPrisma.cliente.create({
    data: { nombre, telefono: randomUUID(), direccion: 'Prueba', activo: true },
  })
  const pedido = await testPrisma.pedido.create({ data: {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: mediodia(dia),
    estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO',
    estadoPago: pagado >= total ? 'PAGADO' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE',
    total, totalPagado: pagado, saldo: total - pagado, ...extra,
  } })
  return { cliente, pedido }
}
const pagar = (pedidoId: string, metodo: 'EFECTIVO' | 'NEQUI' | 'TRANSFERENCIA', monto: number, dia: string) =>
  testPrisma.pago.create({ data: { pedidoId, monto, metodo, createdAt: mediodia(dia) } })

describe('#631 — desglose de cobros, fiados del día y pagos por confirmar', () => {
  let a: Awaited<ReturnType<typeof crearPedido>>
  let b: Awaited<ReturnType<typeof crearPedido>>
  let c: Awaited<ReturnType<typeof crearPedido>>

  beforeAll(async () => {
    await resetAndSeed()
    actor.id = (await getAdminUser()).id
    // A: venta de hoy, pagada con efectivo y Nequi, con factura.
    a = await crearPedido(DIA, 'Cliente A', 200000, 200000)
    await pagar(a.pedido.id, 'EFECTIVO', 150000, DIA)
    await pagar(a.pedido.id, 'NEQUI', 50000, DIA)
    await testPrisma.factura.create({ data: {
      numero: 'F-631-A', clienteId: a.cliente.id, pedidoId: a.pedido.id,
      subtotal: 200000, total: 200000, montoPagado: 200000, saldo: 0, estado: 'PAGADA', fecha: mediodia(DIA),
    } })
    // B: pedido de ayer; abonó 10.000 ayer y hoy pagó 30.000 por transferencia (fiado anterior cobrado hoy).
    b = await crearPedido(AYER, 'Cliente B', 80000, 40000)
    await pagar(b.pedido.id, 'EFECTIVO', 10000, AYER)
    await pagar(b.pedido.id, 'TRANSFERENCIA', 30000, DIA)
    // C: fiado total de hoy con promesa de pago.
    c = await crearPedido(DIA, 'Cliente C', 60000, 0, { promesaPagoFecha: mediodia('2026-03-30') })
    // D: fiado parcial de hoy (pagó 40.000 en efectivo de 100.000).
    const d = await crearPedido(DIA, 'Cliente D', 100000, 40000)
    await pagar(d.pedido.id, 'EFECTIVO', 40000, DIA)
  })
  afterAll(disconnect)

  const leer = async () => {
    const res = await preview(new NextRequest(`http://localhost/api/cierre?fecha=${DIA}`))
    expect(res.status).toBe(200)
    return (await res.json()).cierre
  }

  it('separa ventas de hoy y fiados anteriores, por efectivo y digital, y cuadra con «Cobros de la fecha»', async () => {
    const cierre = await leer()
    const d = cierre.desgloseCobros
    expect(d.ventasHoy).toMatchObject({ efectivo: 190000, digital: 50000, total: 240000, porMetodo: { NEQUI: 50000 } })
    expect(d.fiadosAnteriores).toMatchObject({ efectivo: 0, digital: 30000, total: 30000, porMetodo: { TRANSFERENCIA: 30000 } })
    expect(d.efectivo).toBe(190000)
    expect(d.digital).toBe(80000)
    expect(d.total).toBe(270000)
    expect(d.esperado).toBe(cierre.cobroVentasHoy + cierre.cobroCartera)
    expect(d.cuadra).toBe(true)
    // El efectivo del desglose es el mismo que alimenta el efectivo esperado del cierre.
    expect(d.efectivo).toBe(cierre.cobroEfectivoHoy)
    expect(d.digital).toBe(cierre.cobroDigitalHoy)
  })

  it('lista a quién se fió hoy (incluye pagos parciales) y suma lo mismo que «Fiado»', async () => {
    const cierre = await leer()
    const fiados = cierre.fiadosDelDia as Array<{ cliente: string; saldo: number; pagado: number; promesaPago: string | null; numero: number }>
    expect(fiados.map(f => f.cliente).sort()).toEqual(['Cliente C', 'Cliente D'])
    expect(fiados.reduce((t, f) => t + f.saldo, 0)).toBe(cierre.fiado)
    expect(fiados.find(f => f.cliente === 'Cliente C')).toMatchObject({ saldo: 60000, pagado: 0, promesaPago: '2026-03-30' })
    expect(fiados.find(f => f.cliente === 'Cliente D')).toMatchObject({ saldo: 60000, pagado: 40000, promesaPago: null })
    expect(fiados.every(f => f.numero > 0)).toBe(true)
  })

  it('detalla los pagos por confirmar con pedido, cliente, factura y fecha (hoy y días anteriores)', async () => {
    const cierre = await leer()
    const hoy = cierre.porConfirmar.detalleHoy as Array<{ pedidoId: string; cliente: string; factura: string | null; metodo: string; monto: number; fecha: string }>
    const nequiA = hoy.find(p => p.pedidoId === a.pedido.id && p.metodo === 'NEQUI')
    expect(nequiA).toMatchObject({ cliente: 'Cliente A', factura: 'F-631-A', monto: 50000 })
    expect(new Date(nequiA!.fecha).getTime()).toBe(mediodia(DIA).getTime())
    const transfB = hoy.find(p => p.pedidoId === b.pedido.id)
    expect(transfB).toMatchObject({ cliente: 'Cliente B', factura: null, metodo: 'TRANSFERENCIA' })
    const previos = cierre.porConfirmar.detalleDiasPrevios as Array<{ pedidoId: string; monto: number }>
    expect(previos.some(p => p.pedidoId === b.pedido.id && p.monto === 10000)).toBe(true)
    // El agregado de días anteriores sigue siendo el de siempre.
    expect(cierre.porConfirmar.diasPreviosCount).toBeGreaterThanOrEqual(1)
  })

  it('la cola de confirmación se puede filtrar a un solo pedido', async () => {
    await testPrisma.config.upsert({
      where: { clave: 'USUARIO_CONFIRMA_PAGOS' }, update: { valor: actor.id },
      create: { clave: 'USUARIO_CONFIRMA_PAGOS', valor: actor.id },
    })
    const todos = await (await colaPorConfirmar(new NextRequest('http://localhost/api/pagos/por-confirmar'))).json()
    const filtrado = await (await colaPorConfirmar(new NextRequest(`http://localhost/api/pagos/por-confirmar?pedidoId=${a.pedido.id}`))).json()
    const filas = filtrado.data as Array<{ pedido: { id: string } }>
    expect(filas.length).toBeGreaterThan(0)
    expect(filas.every(f => f.pedido.id === a.pedido.id)).toBe(true)
    expect(todos.data.length).toBeGreaterThan(filas.length)
    // Un pedido sin pagos por confirmar devuelve la cola vacía, no un error.
    const vacio = await (await colaPorConfirmar(new NextRequest(`http://localhost/api/pagos/por-confirmar?pedidoId=${c.pedido.id}`))).json()
    expect(vacio.data).toEqual([])
  })

  it('el cierre informa si quien consulta puede confirmar pagos', async () => {
    const cierre = await leer()
    expect(cierre.confirmaPagos).toEqual({ puede: true, nombre: null })
  })
})
