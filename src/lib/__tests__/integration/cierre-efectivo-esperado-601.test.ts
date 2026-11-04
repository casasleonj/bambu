// @tests #601 — el conteo del efectivo se compara contra el efectivo que debe haber, no contra el neto con
// pagos digitales. Handlers y PostgreSQL reales; importes y clientes sintéticos.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { startOfDayInBogota } from '@/lib/date-helpers'

const actor = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: actor })),
  requireRole: vi.fn(async () => ({ user: actor })),
}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn(async () => {}) }))

import { GET as preview, POST as cerrar } from '@/app/api/cierre/route'

const mediodia = (dia: string) => new Date(`${dia}T12:00:00-05:00`)
const request = (body: unknown) => new NextRequest('http://localhost/api/cierre', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
async function pedidoPagado(dia: string, total: number, pagos: Array<{ metodo: 'EFECTIVO' | 'NEQUI' | 'TRANSFERENCIA'; monto: number }>) {
  const cliente = await testPrisma.cliente.create({
    data: { nombre: `Sintético ${randomUUID()}`, telefono: randomUUID(), direccion: 'Prueba', activo: true },
  })
  const pagado = pagos.reduce((s, p) => s + p.monto, 0)
  const p = await testPrisma.pedido.create({ data: {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: mediodia(dia),
    // La base exige que estadoPago sea el que corresponde a lo pagado (chk_pedido_estadopago_proyectado).
    estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: pagado >= total ? 'PAGADO' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE',
    total, totalPagado: pagado, saldo: total - pagado,
  } })
  for (const pg of pagos) {
    await testPrisma.pago.create({ data: { pedidoId: p.id, monto: pg.monto, metodo: pg.metodo, createdAt: mediodia(dia) } })
  }
  return { p, cliente }
}
const leer = async (dia: string) => {
  const res = await preview(new NextRequest(`http://localhost/api/cierre?fecha=${dia}`))
  expect(res.status).toBe(200)
  return (await res.json()).cierre
}
const conteo = (arqueo: Record<number, number>) => JSON.stringify({ arqueo })
const payload = (dia: string, reporte: string, extra: Record<string, unknown> = {}) => ({
  fecha: dia, baseDia: 50000, salarios: 0, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0,
  stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0, reporte, ...extra,
})

describe('#601 — efectivo esperado en el cierre de caja', () => {
  beforeAll(async () => { await resetAndSeed(); actor.id = (await getAdminUser()).id })
  beforeEach(async () => { await testPrisma.cierreDia.deleteMany({}) })
  afterAll(disconnect)

  it('el resumen separa el efectivo de lo que llegó por Nequi y transferencia', async () => {
    const dia = '2026-03-20'
    await pedidoPagado(dia, 200000, [{ metodo: 'EFECTIVO', monto: 150000 }, { metodo: 'NEQUI', monto: 50000 }])
    await pedidoPagado(dia, 30000, [{ metodo: 'TRANSFERENCIA', monto: 30000 }])
    const c = await leer(dia)
    expect(c.efectivo).toBe(150000)
    expect(c.cobroVentasHoy).toBe(230000)
    expect(c.cobroEfectivoHoy).toBe(150000)
    expect(c.cobroDigitalHoy).toBe(80000)
    expect(c.netoCaja).toBeNull() // el neto total no cambia: el cierre lo calcula al guardar
  })

  it('contar solo el efectivo cuadra aunque haya pagos digitales; antes figuraba como faltante', async () => {
    const dia = '2026-03-21'
    await pedidoPagado(dia, 200000, [{ metodo: 'EFECTIVO', monto: 150000 }, { metodo: 'NEQUI', monto: 50000 }])
    await testPrisma.gasto.create({ data: { categoria: 'OTRO', descripcion: 'Prueba', monto: 20000, fecha: mediodia(dia) } })
    // Debe haber: 50.000 (base) + 150.000 (efectivo) − 20.000 (gasto) = 180.000. Contado: 180.000.
    const res = await cerrar(request(payload(dia, conteo({ 100000: 1, 50000: 1, 20000: 1, 10000: 1 }))))
    expect(res.status).toBe(201)
    const guardado = await testPrisma.cierreDia.findUniqueOrThrow({ where: { fecha: startOfDayInBogota(dia) } })
    const reporte = guardado.reporte as Record<string, unknown>
    expect(reporte.efectivoEsperado).toBe(180000)
    expect(reporte.totalContado).toBe(180000)
    expect(reporte.diferenciaArqueo).toBe(0)
    // El neto total sigue incluyendo los 50.000 digitales (dato informativo, distinto del efectivo).
    expect(Number(guardado.netoCaja)).toBe(230000)
  })

  it('un faltante real de efectivo se sigue detectando', async () => {
    const dia = '2026-03-22'
    await pedidoPagado(dia, 100000, [{ metodo: 'EFECTIVO', monto: 100000 }, ])
    await pedidoPagado(dia, 40000, [{ metodo: 'NEQUI', monto: 40000 }])
    // Debe haber 150.000 (50.000 de base + 100.000). Contado 145.000 → faltan 5.000.
    const res = await cerrar(request(payload(dia, conteo({ 100000: 1, 20000: 2, 5000: 1 }))))
    expect(res.status).toBe(201)
    const reporte = (await testPrisma.cierreDia.findUniqueOrThrow({ where: { fecha: startOfDayInBogota(dia) } })).reporte as Record<string, unknown>
    expect(reporte.efectivoEsperado).toBe(150000)
    expect(reporte.diferenciaArqueo).toBe(-5000)
  })

  it('un abono independiente en Nequi no entra al efectivo; uno en efectivo sí', async () => {
    const dia = '2026-03-23'
    const { p, cliente } = await pedidoPagado(dia, 100000, [])
    const factura = await testPrisma.factura.create({ data: {
      numero: `FAC-${randomUUID()}`, clienteId: cliente.id, pedidoId: p.id,
      subtotal: 100000, total: 100000, montoPagado: 0, saldo: 100000, estado: 'EMITIDA', fecha: mediodia(dia),
    } })
    for (const [metodoPago, monto] of [['EFECTIVO', 30000], ['NEQUI', 20000]] as const) {
      await testPrisma.abono.create({ data: {
        numero: `AB-${randomUUID()}`, facturaId: factura.id, clienteId: cliente.id, pedidoId: p.id,
        monto, metodoPago, fecha: mediodia(dia), origenCobro: 'INDEPENDIENTE', offlineId: randomUUID(),
      } })
    }
    const c = await leer(dia)
    expect(c.cobroCartera).toBe(50000)
    expect(c.cobroCarteraEfectivo).toBe(30000)
    expect(c.cobroEfectivoHoy).toBe(30000)
    expect(c.cobroDigitalHoy).toBe(20000)
  })
})
