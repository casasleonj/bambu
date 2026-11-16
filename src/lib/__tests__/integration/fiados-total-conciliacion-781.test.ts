// #781 / #613: el total de Fiados coincide con los demás consumidores de la misma deuda.
// Datos sintéticos. Misma fuente por pedido (`exigible`), mismo corte (un día), mismas exclusiones.
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))
import { testPrisma as db, resetAndSeed, getAdminUser, disconnect } from './setup'
import { registrarEntregaExigible } from '@/lib/entregas-exigibles-db'
import { construirResumenCierre } from '@/lib/cierre-resumen'
import { consultarPedidos } from '@/lib/pedidos-consulta.repository'
import { leerFiltrosConsulta } from '@/lib/pedidos-consulta'
import { GET as listarPedidos } from '@/app/api/pedidos/route'
import { PrismaPedidoRepository as DashboardPedidos } from '@/modules/dashboard/infrastructure/pedido.repository'
import { calcularFiados } from '@/modules/dashboard/domain/ventas.service'
import { filasFiados, resumenFiados } from '@/app/(app)/pedidos/pedidos-client/fiados-table'
import type { Pedido } from '@/app/(app)/pedidos/pedidos-client/types'

const dia = '2026-11-05', fecha = new Date(`${dia}T12:00:00-05:00`)
const ESPERADO = 23000 // 10.000 + 5.000 + 8.000 (ver siembra)
const item = (producto: string, ped: number, ent: number, precio: number) =>
  ({ producto, cantPedido: ped, cantEntrega: ent, precio, subtotal: ped * precio })

async function cliente(nombre: string) {
  return (await db.cliente.create({ data: { nombre, telefono: randomUUID() } })).id
}
async function entregado(clienteId: string, total: number, pagado: number, extra: Record<string, unknown> = {}) {
  const p = await db.pedido.create({ data: {
    clienteId, fecha, total, saldo: total - pagado, totalPagado: pagado, estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO',
    estadoPago: pagado >= total ? 'PAGADO' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE',
    items: { create: item('PACA_AGUA', total / 2000, total / 2000, 2000) }, ...extra } })
  await registrarEntregaExigible(db as never, { pedidoId: p.id, entregadoAt: fecha, eventoId: randomUUID(), huella: 'sintetica-781',
    lineas: [{ producto: 'PACA_AGUA', cantidad: total / 2000, precioCents: 200000 }], pedido: { total, totalPagado: pagado, saldo: total - pagado } })
  return p
}

describe('Total de Fiados = deuda exigible vista por Pedidos, Cierre y Dashboard (#781)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    const admin = await getAdminUser()
    mockAuth.mockResolvedValue({ user: { id: admin.id, role: 'ADMIN' }, expires: '2099-01-01' })
    const a = await cliente('Cliente A'), b = await cliente('Cliente B'), c = await cliente('Cliente C'), d = await cliente('Cliente D')
    await entregado(a, 10000, 0)                       // entregado y sin pagar: 10.000
    await entregado(a, 8000, 3000)                     // entregado con abono: 5.000
    await entregado(c, 6000, 6000)                     // entregado y pagado: 0
    // parcial: 6 pedidas, 4 entregadas a 2.000 = 8.000 exigibles (las 2 restantes no cuentan)
    const parcial = await db.pedido.create({ data: { clienteId: b, fecha, total: 12000, saldo: 12000, totalPagado: 0,
      estadoEntrega: 'PENDIENTE', items: { create: item('PACA_AGUA', 6, 4, 2000) } } })
    await registrarEntregaExigible(db as never, { pedidoId: parcial.id, entregadoAt: fecha, eventoId: randomUUID(), huella: 'sintetica-781-p',
      lineas: [{ producto: 'PACA_AGUA', cantidad: 4, precioCents: 200000 }], pedido: { total: 12000, totalPagado: 0, saldo: 12000 } })
    // no cuentan: anulado con saldo y pendiente sin entregar
    await db.pedido.create({ data: { clienteId: b, fecha, total: 7000, saldo: 7000, estado: 'ANULADO', estadoEntrega: 'ANULADO', estadoPago: 'ANULADO',
      items: { create: item('PACA_AGUA', 1, 1, 7000) } } })
    await db.pedido.create({ data: { clienteId: d, fecha, total: 4000, saldo: 4000, estadoEntrega: 'PENDIENTE',
      items: { create: item('PACA_AGUA', 2, 0, 2000) } } })
  })
  afterAll(disconnect)

  async function totalFiadosPantalla() {
    const res = await listarPedidos(new NextRequest('http://localhost/api/pedidos?scope=fiados&all=true'))
    expect(res.status).toBe(200)
    const body = await res.json()
    const filas = filasFiados((body.pedidos ?? body.data?.pedidos) as Pedido[], 'todos')
    return { ...resumenFiados(filas), filas }
  }

  it('la pantalla de Fiados suma solo lo entregado y pendiente, por cliente', async () => {
    const r = await totalFiadosPantalla()
    expect(r.total).toBe(ESPERADO)
    expect(r.clientes).toBe(2) // A y B; C pagó y D no ha recibido nada
    expect(r.pedidos).toBe(3)
    expect(Object.fromEntries(r.filas.map(f => [f.nombreCli, f.deuda]))).toEqual({ 'Cliente A': 15000, 'Cliente B': 8000 })
  })
  it('coincide con el «Fiado» del resumen de Pedidos para el mismo día', async () => {
    const r = await consultarPedidos(leerFiltrosConsulta(new URLSearchParams(`desde=${dia}&hasta=${dia}&resumen=1`)), 'ADMIN', db)
    expect(r.resumen?.fiado).toBe(ESPERADO)
    expect((await totalFiadosPantalla()).total).toBe(r.resumen?.fiado)
  })
  it('coincide con el «fiado» del Cierre de caja del día', async () => {
    const { cierre } = await construirResumenCierre(db, dia)
    expect(cierre.fiado).toBe(ESPERADO)
    expect(cierre.fiadosDelDia.reduce((s, p) => s + p.saldo, 0)).toBe(ESPERADO)
  })
  it('coincide con los fiados del Dashboard del día', async () => {
    const rango = { gte: new Date(`${dia}T05:00Z`), lt: new Date('2026-11-06T05:00Z') }
    const pedidos = await new DashboardPedidos(db).findByDateRange(rango.gte, rango.lt)
    expect(calcularFiados(pedidos)).toBe(ESPERADO)
  })
  it('filtrar en pantalla por un cliente baja el total solo en esa deuda', async () => {
    const { filas } = await totalFiadosPantalla()
    expect(resumenFiados(filas.filter(f => f.nombreCli === 'Cliente B')).total).toBe(8000)
  })
})
