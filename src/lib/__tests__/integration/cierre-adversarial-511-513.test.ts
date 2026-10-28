// @tests #511 #513 — auditoría adversarial; handlers y PostgreSQL reales.
// Los importes y clientes son sintéticos. No conecta a producción.
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
import { POST as pagarFiado } from '@/app/api/pedidos/pagar-fiado/route'
import { POST as abonar } from '@/app/api/abonos/route'
import { verificarIntegridad } from '@/lib/integridad/verificar'
import { REGLAS } from '@/lib/integridad/reglas'

const mediodia = (dia: string) => new Date(`${dia}T12:00:00-05:00`)
const request = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
async function pedido(dia: string, total: number, opts: { anulado?: boolean; pagado?: number } = {}) {
  const cliente = await testPrisma.cliente.create({
    data: { nombre: `Sintético ${randomUUID()}`, telefono: randomUUID(), direccion: 'Prueba', activo: true },
  })
  const pagado = opts.pagado ?? 0
  const estado = opts.anulado ? 'ANULADO' : 'ENTREGADO'
  const p = await testPrisma.pedido.create({ data: {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: mediodia(dia),
    estado, estadoEntrega: estado,
    estadoPago: opts.anulado ? 'ANULADO' : pagado >= total ? 'PAGADO' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE',
    total, totalPagado: pagado, saldo: total - pagado,
  } })
  const factura = await testPrisma.factura.create({ data: {
    numero: `FAC-${randomUUID()}`, clienteId: cliente.id, pedidoId: p.id,
    subtotal: total, total, montoPagado: pagado, saldo: total - pagado,
    estado: opts.anulado ? 'ANULADA' : pagado >= total ? 'PAGADA' : 'EMITIDA', fecha: mediodia(dia),
  } })
  return { p, cliente, factura }
}
async function leer(dia: string) {
  const res = await preview(new NextRequest(`http://localhost/api/cierre?fecha=${dia}`))
  expect(res.status).toBe(200)
  return (await res.json()).cierre
}
const payload = (dia: string, reporte: Record<string, unknown> = {}) => ({
  fecha: dia, baseDia: 10000, salarios: 0, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0,
  stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0, reporte: JSON.stringify(reporte),
})

describe('auditoría adversarial del cierre #511 / #513', () => {
  beforeAll(async () => { await resetAndSeed(); actor.id = (await getAdminUser()).id })
  beforeEach(async () => { await testPrisma.cierreDia.deleteMany({}) })
  afterAll(disconnect)

  it('#511: anular un pedido del mismo día no resta de nuevo su nota de crédito', async () => {
    const dia = '2026-03-10'
    await pedido(dia, 10000)
    const anulado = await pedido(dia, 5000, { anulado: true })
    await testPrisma.notaCredito.create({ data: {
      numero: `NC-${randomUUID()}`, pedidoId: anulado.p.id, monto: 5000, motivo: 'Prueba', fecha: mediodia(dia),
    } })
    expect((await leer(dia)).totalVentas).toBe(10000)
  })

  it('#511: una nota de crédito de un pedido anterior conserva su ajuste', async () => {
    const dia = '2026-03-11'
    await pedido(dia, 10000)
    const anulado = await pedido('2026-03-09', 5000, { anulado: true })
    await testPrisma.notaCredito.create({ data: {
      numero: `NC-${randomUUID()}`, pedidoId: anulado.p.id, monto: 5000, motivo: 'Prueba', fecha: mediodia(dia),
    } })
    expect((await leer(dia)).totalVentas).toBe(5000)
  })

  it('#513: un abono independiente de igual importe a un Pago reciente también cuenta', async () => {
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
    const { p, cliente, factura } = await pedido(dia, 20000)
    const r1 = await pagarFiado(request('/api/pedidos/pagar-fiado', {
      clienteId: cliente.id, monto: 5000, metodo: 'EFECTIVO', offlineId: randomUUID(),
    }))
    expect(r1.status).toBe(200)
    const r2 = await abonar(request('/api/abonos', {
      clienteId: cliente.id, facturaId: factura.id, pedidoId: p.id,
      monto: 5000, metodoPago: 'EFECTIVO', offlineId: randomUUID(),
    }))
    expect(r2.status).toBe(201)
    const independiente = (await r2.json()).abono
    const pago = await testPrisma.pago.findFirstOrThrow({ where: { pedidoId: p.id } })
    // Fijamos el tiempo adversarial; no dependemos de la velocidad de la máquina.
    await testPrisma.abono.update({ where: { id: independiente.id }, data: {
      createdAt: new Date(pago.createdAt.getTime() + 1000),
    } })
    const c = await leer(dia)
    expect(c.cobroVentasHoy).toBe(5000)
    expect(c.cobroCartera).toBe(5000)
  })

  it('#513: el snapshot leído después del cierre no acepta cifras financieras del cliente', async () => {
    const dia = '2026-03-12'
    const { p } = await pedido(dia, 10000, { pagado: 10000 })
    await testPrisma.pago.create({ data: { pedidoId: p.id, monto: 10000, metodo: 'EFECTIVO', createdAt: mediodia(dia) } })
    const res = await cerrar(request('/api/cierre', payload(dia, {
      cobrado: 999999, efectivo: 999999, totalGastos: 999999, numPedidos: 999999,
    })))
    expect(res.status).toBe(201)
    const guardado = await testPrisma.cierreDia.findUniqueOrThrow({ where: { fecha: startOfDayInBogota(dia) } })
    const c = await leer(dia)
    expect(c.cobrado).toBe(Number(guardado.cobrado))
    expect(c.efectivo).toBe(Number(guardado.efectivo))
    expect(c.totalGastos).toBe(Number(guardado.gastos))
    expect(c.numPedidos).toBe(guardado.numPedidos)
  })

  it('#513: un cobro a las 23:59:59.999 de Bogotá pertenece al día', async () => {
    const dia = '2026-03-13'
    const { p } = await pedido(dia, 7000, { pagado: 7000 })
    await testPrisma.pago.create({ data: {
      pedidoId: p.id, monto: 7000, metodo: 'EFECTIVO', createdAt: new Date(`${dia}T23:59:59.999-05:00`),
    } })
    expect((await leer(dia)).cobroVentasHoy).toBe(7000)
  })

  it('#513: legado sin evidencia bloquea solo la fecha afectada y V17 lo identifica', async () => {
    const dia = '2026-03-15'
    const { p, cliente, factura } = await pedido(dia, 10000)
    const abono = await testPrisma.abono.create({ data: {
      numero: `ABO-${randomUUID()}`, facturaId: factura.id, pedidoId: p.id,
      clienteId: cliente.id, monto: 5000, metodoPago: 'EFECTIVO', fecha: mediodia(dia),
    } })
    const res = await preview(new NextRequest(`http://localhost/api/cierre?fecha=${dia}`))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('COBROS_PENDIENTES_CONCILIACION')
    expect((await cerrar(request('/api/cierre', payload(dia)))).status).toBe(409)
    expect(await testPrisma.cierreDia.count()).toBe(0)
    const r = await verificarIntegridad(testPrisma, { reglas: REGLAS.filter(r => r.id === 'V17') })
    expect(r.reglas[0].hallazgos.map(h => h.ref)).toContain(abono.id)
    expect((await preview(new NextRequest('http://localhost/api/cierre?fecha=2026-03-16'))).status).toBe(200)
    expect((await testPrisma.abono.findUniqueOrThrow({ where: { id: abono.id } })).origenCobro).toBeNull()
  })

  it('#513: el espejo de un Pago de otro día no reaparece como ingreso de hoy', async () => {
    const dia = '2026-03-17'
    const { p, cliente, factura } = await pedido('2026-03-16', 10000, { pagado: 5000 })
    const pago = await testPrisma.pago.create({ data: { pedidoId: p.id, metodo: 'EFECTIVO', monto: 5000, createdAt: mediodia('2026-03-16') } })
    await testPrisma.abono.create({ data: {
      numero: `ABO-${randomUUID()}`, facturaId: factura.id, pedidoId: p.id,
      clienteId: cliente.id, monto: 5000, metodoPago: 'EFECTIVO', fecha: mediodia(dia),
      origenCobro: 'ESPEJO_PAGO', pagoOrigenId: pago.id,
    } })
    expect(await leer(dia)).toMatchObject({ cobroVentasHoy: 0, cobroCartera: 0 })
  })

  it('#513: V18 detecta alteración de un snapshot nuevo sin cambiar las columnas', async () => {
    const dia = '2026-03-18'
    await pedido(dia, 10000)
    expect((await cerrar(request('/api/cierre', payload(dia)))).status).toBe(201)
    const cierre = await testPrisma.cierreDia.findUniqueOrThrow({ where: { fecha: startOfDayInBogota(dia) } })
    const reglas = REGLAS.filter(r => r.id === 'V18')
    expect((await verificarIntegridad(testPrisma, { reglas })).reglas[0].cantidad).toBe(0)
    const reporte = cierre.reporte as Record<string, unknown>
    await testPrisma.cierreDia.update({ where: { id: cierre.id }, data: { reporte: { ...reporte, cobrado: 999999 } } })
    expect((await verificarIntegridad(testPrisma, { reglas })).reglas[0].hallazgos).toEqual([
      expect.objectContaining({ ref: cierre.id, detalle: expect.objectContaining({ campo: 'cobrado' }) }),
    ])
    expect((await leer(dia)).cobrado).toBe(Number(cierre.cobrado))
  })
})
