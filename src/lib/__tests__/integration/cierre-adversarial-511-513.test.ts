// @tests #511 #513 — auditoría adversarial; handlers y PostgreSQL reales.
// Los importes y clientes son sintéticos. No conecta a producción.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, registrarBaseDia } from './setup'
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
async function evidenciaEntrega(pedidoId: string, entregas: { dia: string; cantidad: number }[], precio: number) {
  const cantidad = entregas.reduce((s, e) => s + e.cantidad, 0)
  await testPrisma.pedido.update({ where: { id: pedidoId }, data: {
    entregadoAt: mediodia(entregas[entregas.length - 1].dia),
    cPacaAguaPed: cantidad, cPacaAguaEnt: cantidad,
    items: { create: { producto: 'PACA_AGUA', cantPedido: cantidad, cantEntrega: cantidad, precio, subtotal: cantidad * precio } },
  } })
  for (const e of entregas) {
    const fecha = mediodia(e.dia)
    await testPrisma.historial.create({ data: { entidad: 'Pedido', registroId: pedidoId, accion: 'UPDATE', fecha, usuarioId: 'sistema',
      datos: JSON.stringify({ accion: 'ENTREGA', consultaEntrega: {
        version: 1, fecha: fecha.toISOString(), eventoEntregaId: randomUUID(), precisionFecha: 'INSTANTE',
        cantidades: [{ producto: 'PACA_AGUA', cantidad: e.cantidad }], repartidorId: null,
      } }),
    } })
  }
}
async function evidenciaAnulacion(pedidoId: string, dia: string, conNota: boolean) {
  await testPrisma.historial.create({ data: { entidad: 'Pedido', registroId: pedidoId, accion: 'UPDATE',
    fecha: new Date(`${dia}T14:00:00-05:00`), usuarioId: 'sistema',
    datos: JSON.stringify({ modo: 'ANULAR', notaCredito: conNota, reversion: 0 }),
  } })
}
async function snapshotVenta(dia: string, pedidoId: string, centavos: number) {
  await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(dia), horaCierre: new Date(`${dia}T22:00:00-05:00`), totalVentas: centavos / 100,
    reporte: { ventasCriterio: 'ENTREGA_V1', ventasEntregaPorPedido: [{ pedidoId, centavos, origen: 'PEDIDO', valorDeterminado: true, fechaAproximada: false }] },
  } })
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
    const vigente = await pedido(dia, 10000)
    await evidenciaEntrega(vigente.p.id, [{ dia, cantidad: 4 }], 2500)
    const anulado = await pedido('2026-03-09', 0, { anulado: true })
    await evidenciaEntrega(anulado.p.id, [{ dia, cantidad: 2 }], 2500)
    await evidenciaAnulacion(anulado.p.id, dia, true)
    await testPrisma.notaCredito.create({ data: {
      numero: `NC-${randomUUID()}`, pedidoId: anulado.p.id, monto: 3000, motivo: 'Prueba', fecha: mediodia(dia),
    } })
    expect(await leer(dia)).toMatchObject({ totalVentas: 10000, ventasEntregadasDelDia: 10000,
      totalNotasCredito: 3000, ajustesVentasAnteriores: 0, ventasPorConciliar: [], aguaVendida: 4 })
  })

  it('#511: una nota de crédito de un pedido anterior conserva su ajuste', async () => {
    const dia = '2026-03-11'
    const vigente = await pedido(dia, 10000)
    await evidenciaEntrega(vigente.p.id, [{ dia, cantidad: 4 }], 2500)
    const anulado = await pedido('2026-03-09', 0, { anulado: true })
    await evidenciaEntrega(anulado.p.id, [{ dia: '2026-03-09', cantidad: 2 }], 2500)
    await snapshotVenta('2026-03-09', anulado.p.id, 500000)
    await evidenciaAnulacion(anulado.p.id, dia, true)
    await testPrisma.notaCredito.create({ data: {
      numero: `NC-${randomUUID()}`, pedidoId: anulado.p.id, monto: 3000, motivo: 'Prueba', fecha: mediodia(dia),
    } })
    expect(await leer(dia)).toMatchObject({ totalVentas: 5000, ventasEntregadasDelDia: 10000,
      totalNotasCredito: 3000, ajustesVentasAnteriores: 5000, ventasPorConciliar: [] })
    expect((await leer('2026-03-09')).totalVentas).toBe(5000)
  })

  it('#885: una venta fiada repartida entre dos días se revierte por lo reconocido antes, incluso sin nota', async () => {
    const dia = '2026-03-21', anterior = '2026-03-20'
    const vigente = await pedido(dia, 12000)
    await evidenciaEntrega(vigente.p.id, [{ dia, cantidad: 4 }], 3000)
    const anulado = await pedido(anterior, 0, { anulado: true })
    await evidenciaEntrega(anulado.p.id, [{ dia: anterior, cantidad: 3 }, { dia, cantidad: 2 }], 3000)
    await snapshotVenta(anterior, anulado.p.id, 900000)
    await evidenciaAnulacion(anulado.p.id, dia, false)
    expect(await leer(dia)).toMatchObject({ totalVentas: 3000, ventasEntregadasDelDia: 12000,
      totalNotasCredito: 0, ajustesVentasAnteriores: 9000, ventasPorConciliar: [], aguaVendida: 4 })
    expect((await leer(anterior)).totalVentas).toBe(9000)
  })

  it('#885: legado sin atribución previa queda por conciliar, no se descuenta la nota por similitud', async () => {
    const dia = '2026-03-23', anterior = '2026-03-22'
    const anulado = await pedido(anterior, 0, { anulado: true })
    await evidenciaEntrega(anulado.p.id, [{ dia: anterior, cantidad: 5 }], 2500)
    await evidenciaAnulacion(anulado.p.id, dia, true)
    await testPrisma.notaCredito.create({ data: { numero: `NC-${randomUUID()}`, pedidoId: anulado.p.id,
      monto: 3000, motivo: 'Prueba', fecha: mediodia(dia) } })
    expect(await leer(dia)).toMatchObject({ ajustesVentasAnteriores: 0, totalNotasCredito: 3000,
      ventasPorConciliar: [{ pedidoId: anulado.p.id, motivo: 'VENTA_PREVIA_SIN_DETALLE_DE_CIERRE' }] })
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
    await registrarBaseDia(dia, 10000) // #688
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
    await registrarBaseDia(dia, 10000) // #688
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
    await registrarBaseDia(dia, 10000) // #688
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
