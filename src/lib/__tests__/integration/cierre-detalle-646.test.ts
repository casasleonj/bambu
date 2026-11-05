// @tests #646 — el cierre lista cada gasto, cada abono independiente y cada corrección de cobros del día, y las listas
// suman exactamente las cifras que explican. Handlers y PostgreSQL reales; datos sintéticos.
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

const DIA = '2026-03-26'
const mediodia = (dia: string, h = 12) => new Date(`${dia}T${String(h).padStart(2, '0')}:00:00-05:00`)

describe('#646 — detalle de gastos, abonos y correcciones del día', () => {
  let adminId = ''
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    actor.id = adminId
    const cliente = await testPrisma.cliente.create({ data: { nombre: 'Tienda Detalle', telefono: randomUUID(), direccion: 'Prueba', activo: true } })
    const pedido = await testPrisma.pedido.create({ data: {
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: mediodia(DIA),
      estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PARCIAL', total: 100000, totalPagado: 40000, saldo: 60000,
    } })
    const factura = await testPrisma.factura.create({ data: {
      numero: 'F-646', clienteId: cliente.id, pedidoId: pedido.id, subtotal: 100000, total: 100000, montoPagado: 40000, saldo: 60000, estado: 'PARCIAL', fecha: mediodia(DIA),
    } })
    const abono = await testPrisma.abono.create({ data: {
      numero: 'AB-646-1', facturaId: factura.id, clienteId: cliente.id, pedidoId: pedido.id, monto: 40000, metodoPago: 'EFECTIVO',
      fecha: mediodia(DIA), origenCobro: 'INDEPENDIENTE', offlineId: randomUUID(),
    } })
    await testPrisma.correccionAbono.create({ data: {
      numero: 'COR-646-1', abonoId: abono.id, tipo: 'FACTURA', montoRevertido: 15000, motivo: 'Lo anotaron en la factura equivocada',
      autorizadoPorId: adminId, correccionOfflineId: randomUUID(),
    } })
    await testPrisma.gasto.createMany({ data: [
      { categoria: 'COMBUSTIBLE', descripcion: 'Gasolina camión', monto: 20000, fecha: mediodia(DIA, 8), responsable: 'Carlos' },
      { categoria: 'INSUMOS', descripcion: 'Bolsas para hielo', monto: 12000, fecha: mediodia(DIA, 10), createdById: adminId },
    ] })
  })
  afterAll(disconnect)

  const leer = async () => {
    const res = await preview(new NextRequest(`http://localhost/api/cierre?fecha=${DIA}`))
    expect(res.status).toBe(200)
    return (await res.json()).cierre
  }

  it('lista cada abono independiente y cada corrección, y suman «Cobros de abonos y correcciones»', async () => {
    const c = await leer()
    const { abonos, correcciones } = c.abonosDelDia as { abonos: Array<Record<string, unknown>>; correcciones: Array<Record<string, unknown>> }
    expect(abonos).toHaveLength(1)
    expect(abonos[0]).toMatchObject({ numero: 'AB-646-1', cliente: 'Tienda Detalle', factura: 'F-646', metodo: 'EFECTIVO', monto: 40000, corregido: 15000 })
    expect(correcciones).toHaveLength(1)
    expect(correcciones[0]).toMatchObject({ numero: 'COR-646-1', abonoNumero: 'AB-646-1', tipo: 'FACTURA', monto: 15000, motivo: 'Lo anotaron en la factura equivocada', cliente: 'Tienda Detalle' })
    // Las listas explican exactamente las cifras del cierre.
    const sumaAbonos = abonos.reduce((t, a) => t + Number(a.monto), 0)
    const sumaCorrecciones = correcciones.reduce((t, x) => t + Number(x.monto), 0)
    expect(sumaAbonos).toBe(c.abonosIndependientes)
    expect(sumaCorrecciones).toBe(c.ajustesDeCobros)
    expect(sumaAbonos - sumaCorrecciones).toBe(c.cobroCartera)
    // Y el desglose por origen sigue cuadrando con ese mismo dinero.
    expect(c.desgloseCobros.cuadra).toBe(true)
  })

  it('lista cada gasto con descripción, categoría, hora y quién lo registró, y suma el total de gastos', async () => {
    const c = await leer()
    const gastos = c.gastosDelDia as Array<{ descripcion: string; categoria: string; monto: number; fecha: string; registro: string | null }>
    expect(gastos.map(g => g.descripcion)).toEqual(['Gasolina camión', 'Bolsas para hielo'])
    expect(gastos[0]).toMatchObject({ categoria: 'COMBUSTIBLE', monto: 20000, registro: 'Carlos' })
    expect(gastos[1].registro).toBeTruthy() // sin «responsable», sale quien lo creó
    expect(new Date(gastos[0].fecha).getTime()).toBe(mediodia(DIA, 8).getTime())
    expect(gastos.reduce((t, g) => t + g.monto, 0)).toBe(c.totalGastos)
  })

  it('un día sin abonos, correcciones ni gastos devuelve listas vacías', async () => {
    const res = await preview(new NextRequest('http://localhost/api/cierre?fecha=2026-03-27'))
    const c = (await res.json()).cierre
    expect(c.abonosDelDia).toEqual({ abonos: [], correcciones: [] })
    expect(c.gastosDelDia).toEqual([])
  })
})
