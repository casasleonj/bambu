// @tests #745 — BONO es crédito aplicado, no dinero recibido en el cierre.
// Usa lectura del endpoint real y PostgreSQL real con registros sintéticos.
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { startOfDayInBogota } from '@/lib/date-helpers'
import { getTodayString } from '@/lib/dates'
import { leerCobrosPeriodo } from '@/lib/cobros-periodo'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { GET as cierreGet } from '@/app/api/cierre/route'

const unico = () => randomUUID().slice(0, 8)
const hoy = getTodayString()
const inicio = startOfDayInBogota(hoy)
const fin = new Date(inicio.getTime() + 86_400_000)

async function cierre() {
  const request = { nextUrl: { searchParams: new URLSearchParams() } } as unknown as NextRequest
  const respuesta = await cierreGet(request)
  expect(respuesta.status).toBe(200)
  const body = await respuesta.json()
  return body.cierre ?? body
}

async function prepararPedido(
  pagos: { metodo: 'EFECTIVO' | 'NEQUI' | 'BONO'; monto: number }[],
  total = 10000,
) {
  const cliente = await testPrisma.cliente.create({
    data: { nombre: 'Cliente sintético BONO ' + unico(), telefono: '3' + Math.floor(Math.random() * 1e9).toString().padStart(9, '0'),
      direccion: 'Calle prueba', activo: true, saldoFavor: 20000 },
  })
  const pagado = pagos.reduce((acc, p) => acc + p.monto, 0)
  const pedido = await testPrisma.pedido.create({
    data: { clienteId: cliente.id, canal: 'PUNTO', total, totalPagado: pagado,
      saldo: total - pagado, estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO',
      estadoPago: pagado === total ? 'PAGADO' : 'PARCIAL' },
  })
  const factura = await testPrisma.factura.create({
    data: { numero: 'FAC-BONO-' + unico(), clienteId: cliente.id, pedidoId: pedido.id,
      subtotal: total, total, montoPagado: pagado, saldo: total - pagado,
      estado: pagado === total ? 'PAGADA' : 'PARCIAL' },
  })
  const escritos = []
  for (const p of pagos) {
    const registro = await testPrisma.pago.create({
      data: { pedidoId: pedido.id, metodo: p.metodo, monto: p.monto, confirmacion: 'CONFIRMADO' },
    })
    escritos.push(registro)
  }
  const creditoGastado = pagos.filter((p) => p.metodo === 'BONO').reduce((acc,p) => acc + p.monto,0)
  if (creditoGastado) {
    await testPrisma.cliente.update({ where: { id: cliente.id }, data: { saldoFavor: { decrement: creditoGastado } } })
  }
  return { cliente, pedido, factura, escritos }
}

describe('#745 — Cierre de caja no vuelve a cobrar crédito BONO', () => {
  let adminId: string
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
  })
  afterAll(disconnect)

  it('crédito ingresado ayer y BONO aplicado hoy: aumenta crédito aplicado, NO efectivo/digital/neto', async () => {
    const antes = await cierre()
    const clientePedido = await prepararPedido([{ metodo: 'BONO', monto: 8000 }])
    await testPrisma.ingresoSaldoFavor.create({
      data: { clienteId: clientePedido.cliente.id, metodo: 'EFECTIVO', monto: 20000,
        origen: 'PAGAR_FIADO', createdAt: new Date(inicio.getTime() - 3_600_000) },
    })
    const despues = await cierre()
    const antesLectura = await leerCobrosPeriodo(testPrisma, inicio, fin)
    expect(despues.bono - antes.bono).toBe(8000)
    expect(despues.cobroVentasHoy - antes.cobroVentasHoy).toBe(0)
    expect(despues.cobroCartera - antes.cobroCartera).toBe(0)
    expect(despues.cobroDigitalHoy - antes.cobroDigitalHoy).toBe(0)
    expect(despues.desgloseCobros.total - antes.desgloseCobros.total).toBe(0)
    expect(despues.desgloseCobros.cuadra).toBe(true)
    expect(antesLectura.creditoAplicado).toBeGreaterThanOrEqual(8000)
    expect((await testPrisma.cliente.findUniqueOrThrow({ where: { id: clientePedido.cliente.id } })).saldoFavor.toNumber()).toBe(12000)
  })

  it('pago mixto: $2000 BONO + $3000 Nequi + $1000 efectivo produce solo $4000 nuevos', async () => {
    const previo = await cierre()
    const p = await prepararPedido([
      { metodo: 'BONO', monto: 2000 }, { metodo: 'NEQUI', monto: 3000 }, { metodo: 'EFECTIVO', monto: 1000 },
    ])
    // El Abono espejo en BONO es una vista de ese mismo pago, NO otro cobro.
    await testPrisma.abono.create({
      data: { numero: 'ABO-BONO-' + unico(), facturaId: p.factura.id, clienteId: p.cliente.id,
        pedidoId: p.pedido.id, monto: 2000, metodoPago: 'BONO', origenCobro: 'ESPEJO_PAGO', pagoOrigenId: p.escritos[0].id },
    })
    const despues = await cierre()
    expect(despues.bono - previo.bono).toBe(2000)
    expect(despues.nequi - previo.nequi).toBe(3000)
    expect(despues.efectivo - previo.efectivo).toBe(1000)
    expect(despues.cobroVentasHoy - previo.cobroVentasHoy).toBe(4000)
    expect(despues.cobroDigitalHoy - previo.cobroDigitalHoy).toBe(3000)
    expect(despues.desgloseCobros.total - previo.desgloseCobros.total).toBe(4000)
    expect(despues.desgloseCobros.cuadra).toBe(true)
  })

  it('Abono independiente BONO y su corrección no crean entradas ni salidas de dinero', async () => {
    const antes = await cierre()
    const p = await prepararPedido([])
    const abono = await testPrisma.abono.create({
      data: { numero: 'ABO-BONO-' + unico(), facturaId: p.factura.id, clienteId: p.cliente.id,
        pedidoId: p.pedido.id, monto: 3000, metodoPago: 'BONO', origenCobro: 'INDEPENDIENTE' },
    })
    await testPrisma.correccionAbono.create({
      data: { numero: 'COR-BONO-' + unico(), abonoId: abono.id, tipo: 'MONTO',
        montoRevertido: 1000, motivo: 'Corrección sintética', autorizadoPorId: adminId },
    })
    const despues = await cierre()
    expect(despues.cobroCartera - antes.cobroCartera).toBe(0)
    expect(despues.cobroCarteraEfectivo - antes.cobroCarteraEfectivo).toBe(0)
    expect(despues.desgloseCobros.cuadra).toBe(true)
    const cobros = await leerCobrosPeriodo(testPrisma, inicio, fin)
    expect(cobros.creditoAplicado).toBeGreaterThanOrEqual(2000)
  })
})
