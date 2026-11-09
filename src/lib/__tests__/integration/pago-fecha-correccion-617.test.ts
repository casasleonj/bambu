// @tests #617 — corrección administrativa auditada de la fecha efectiva de un pago.
// Handlers y PostgreSQL reales; importes y clientes sintéticos. Mira la BASE, no solo la respuesta HTTP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { startOfDayInBogota } from '@/lib/date-helpers'

const actor = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: actor })),
  requireOwnership: vi.fn(async () => true),
  requireRole: vi.fn(async (roles: string[]) => (roles.includes(actor.role) ? { user: actor } : new Response(JSON.stringify({ success: false, error: { message: 'Forbidden' } }), { status: 403 }))),
}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))

import { POST as corregirRoute } from '@/app/api/pagos/[id]/corregir-fecha/route'
import { corregirFechaPago } from '@/lib/pago-fecha-correccion-server'
import { CorreccionFechaPagoError } from '@/lib/pago-fecha-correccion'
import { construirResumenCierre } from '@/lib/cierre-resumen'

// Registrado el 20 mar 2026 a las 09:00 en Bogotá. Todo es pasado respecto de hoy: los cierres sí cuentan.
const DIA_REGISTRO = '2026-03-20'
const REGISTRO = new Date(`${DIA_REGISTRO}T09:00:00-05:00`)

async function pagoRegistrado(extra: { ocurridoAt?: Date | null; regularizacionId?: string } = {}) {
  const cliente = await testPrisma.cliente.create({
    data: { nombre: `Sintético ${randomUUID()}`, telefono: randomUUID(), direccion: 'Prueba', activo: true },
  })
  const pedido = await testPrisma.pedido.create({ data: {
    clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO', fecha: REGISTRO,
    estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO', total: 50000, totalPagado: 50000, saldo: 0,
  } })
  const pago = await testPrisma.pago.create({ data: {
    pedidoId: pedido.id, monto: 50000, metodo: 'NEQUI', createdAt: REGISTRO,
    ocurridoAt: extra.ocurridoAt ?? null, regularizacionId: extra.regularizacionId ?? null,
  } })
  return { pedido, pago }
}

const llamar = (pagoId: string, body: unknown) =>
  corregirRoute(new NextRequest(`http://localhost/api/pagos/${pagoId}/corregir-fecha`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: pagoId }) })

const codigoDe = async (p: Promise<unknown>): Promise<string> => {
  try { await p; return 'NO_LANZO' } catch (e) { return e instanceof CorreccionFechaPagoError ? e.code : String(e) }
}
const cierreEn = (dia: string, creadoPor: string) =>
  testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(dia), cerradoPor: creadoPor } })

describe('#617 — corregir la fecha efectiva de un pago', () => {
  let adminId = ''
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id; actor.id = adminId })
  beforeEach(async () => {
    actor.role = 'ADMIN'
    await testPrisma.cierreDia.deleteMany({})
  })
  afterAll(disconnect)

  it('día abierto: el ADMIN corrige; queda ocurridoAt, el rastro completo y la auditoría; createdAt NO cambia', async () => {
    const { pago, pedido } = await pagoRegistrado()
    const res = await llamar(pago.id, { fecha: '2026-03-18', motivo: 'Error de digitación' })
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)

    const despues = await testPrisma.pago.findUniqueOrThrow({ where: { id: pago.id } })
    expect(despues.createdAt.toISOString()).toBe(REGISTRO.toISOString()) // el registro es inmutable
    expect(despues.ocurridoAt?.toISOString()).toBe('2026-03-18T17:00:00.000Z') // mediodía de Bogotá

    const filas = await testPrisma.pagoFechaCorreccion.findMany({ where: { pagoId: pago.id } })
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ motivo: 'Error de digitación', corregidoPorId: adminId })
    expect(filas[0].fechaAnterior.toISOString()).toBe(REGISTRO.toISOString()) // antes figuraba el registro
    expect(filas[0].fechaNueva.toISOString()).toBe('2026-03-18T17:00:00.000Z')
    expect(filas[0].corregidoAt).toBeInstanceOf(Date)

    const audit = await testPrisma.historial.findFirst({ where: { entidad: 'Pago', registroId: pago.id }, orderBy: { fecha: 'desc' } })
    expect(audit?.usuarioId).toBe(adminId)
    const datos = JSON.parse(String(audit?.datos)).correccionFechaPago
    expect(datos).toMatchObject({ pedidoId: pedido.id, diaAnterior: DIA_REGISTRO, diaNuevo: '2026-03-18', motivo: 'Error de digitación' })
  })

  it('volver al día del registro deja ocurridoAt en null (= el registro) y conserva el rastro de las dos correcciones', async () => {
    const { pago } = await pagoRegistrado()
    expect((await llamar(pago.id, { fecha: '2026-03-18', motivo: 'primero' })).status).toBe(201)
    expect((await llamar(pago.id, { fecha: DIA_REGISTRO, motivo: 'era de hoy, me equivoqué' })).status).toBe(201)
    const p = await testPrisma.pago.findUniqueOrThrow({ where: { id: pago.id } })
    expect(p.ocurridoAt).toBeNull()
    const filas = await testPrisma.pagoFechaCorreccion.findMany({ where: { pagoId: pago.id }, orderBy: { corregidoAt: 'asc' } })
    expect(filas.map((f) => f.motivo)).toEqual(['primero', 'era de hoy, me equivoqué']) // append-only: no se pisa la anterior
    expect(filas[1].fechaAnterior.toISOString()).toBe('2026-03-18T17:00:00.000Z')
    expect(filas[1].fechaNueva.toISOString()).toBe(REGISTRO.toISOString())
  })

  it('no mueve dinero entre cierres: el resumen del día de registro es el mismo antes y después', async () => {
    const { pago } = await pagoRegistrado()
    const antes = await testPrisma.$transaction((tx) => construirResumenCierre(tx, DIA_REGISTRO))
    expect((await llamar(pago.id, { fecha: '2026-03-18', motivo: 'ajuste de fecha' })).status).toBe(201)
    const despues = await testPrisma.$transaction((tx) => construirResumenCierre(tx, DIA_REGISTRO))
    expect(despues.cierre.cobroVentasHoy).toBe(antes.cierre.cobroVentasHoy)
    expect(despues.cierre.efectivo).toBe(antes.cierre.efectivo)
    expect(despues.cierre.cobroVentasHoy).toBeGreaterThanOrEqual(50000) // incluye este cobro de la fecha de registro
  })

  it('sin permiso: el ASISTENTE recibe 403 y no cambia nada', async () => {
    const { pago } = await pagoRegistrado()
    actor.role = 'ASISTENTE'
    expect((await llamar(pago.id, { fecha: '2026-03-18', motivo: 'quiero cambiarla' })).status).toBe(403)
    // y la regla también vive en el servidor, no solo en la ruta
    expect(await codigoDe(corregirFechaPago({ pagoId: pago.id, fecha: '2026-03-18', motivo: 'quiero cambiarla', actorId: adminId, actorRol: 'ASISTENTE' }))).toBe('FORBIDDEN')
    expect((await testPrisma.pago.findUniqueOrThrow({ where: { id: pago.id } })).ocurridoAt).toBeNull()
    expect(await testPrisma.pagoFechaCorreccion.count({ where: { pagoId: pago.id } })).toBe(0)
  })

  it('validaciones: sin motivo, fecha mal escrita, posterior al registro, sin cambio y pago inexistente', async () => {
    const { pago } = await pagoRegistrado()
    expect((await llamar(pago.id, { fecha: '2026-03-18', motivo: '  ' })).status).toBe(400)
    expect((await llamar(pago.id, { fecha: '18/03/2026', motivo: 'motivo' })).status).toBe(400)
    expect((await llamar(pago.id, { fecha: '2026-02-30', motivo: 'motivo' })).status).toBe(400)
    const futura = await llamar(pago.id, { fecha: '2026-03-21', motivo: 'motivo' })
    expect(futura.status).toBe(422)
    expect((await futura.json()).error.code).toBe('FECHA_POSTERIOR_AL_REGISTRO')
    expect((await llamar(pago.id, { fecha: DIA_REGISTRO, motivo: 'motivo' })).status).toBe(400) // ya es esa fecha
    expect((await llamar('no-existe', { fecha: '2026-03-18', motivo: 'motivo' })).status).toBe(404)
    expect(await testPrisma.pagoFechaCorreccion.count({ where: { pagoId: pago.id } })).toBe(0)
    expect((await testPrisma.pago.findUniqueOrThrow({ where: { id: pago.id } })).ocurridoAt).toBeNull()
  })

  it('día cerrado (opción A): si la fecha NUEVA cae en un día cerrado no se edita; se remite a la regularización formal', async () => {
    const { pago } = await pagoRegistrado()
    await cierreEn('2026-03-18', adminId)
    const res = await llamar(pago.id, { fecha: '2026-03-18', motivo: 'error de digitación' })
    expect(res.status).toBe(409)
    const j = await res.json()
    expect(j.error.code).toBe('DIA_CERRADO')
    expect(j.error.message).toMatch(/regularización formal/)
    expect((await testPrisma.pago.findUniqueOrThrow({ where: { id: pago.id } })).ocurridoAt).toBeNull()
    expect(await testPrisma.pagoFechaCorreccion.count({ where: { pagoId: pago.id } })).toBe(0)
  })

  it('día cerrado (opción A): si la fecha ACTUAL cae en un día cerrado tampoco se edita', async () => {
    const { pago } = await pagoRegistrado({ ocurridoAt: new Date('2026-03-17T17:00:00Z') })
    await cierreEn('2026-03-17', adminId) // el día que figura hoy ya cerró
    expect(await codigoDe(corregirFechaPago({ pagoId: pago.id, fecha: '2026-03-18', motivo: 'error de digitación', actorId: adminId, actorRol: 'ADMIN' }))).toBe('DIA_CERRADO')
    expect((await testPrisma.pago.findUniqueOrThrow({ where: { id: pago.id } })).ocurridoAt?.toISOString()).toBe('2026-03-17T17:00:00.000Z')
  })

  it('un pago que viene de una regularización formal (#402) no se edita', async () => {
    const reg = await testPrisma.regularizacion.create({ data: { lote: `lote-${randomUUID()}`, motivo: 'prueba', autorizadoPorId: adminId, ejecutadoPorId: adminId } })
    const { pago } = await pagoRegistrado({ ocurridoAt: new Date('2026-03-10T17:00:00Z'), regularizacionId: reg.id })
    const res = await llamar(pago.id, { fecha: '2026-03-12', motivo: 'quiero cambiarla' })
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('PAGO_REGULARIZADO')
    expect((await testPrisma.pago.findUniqueOrThrow({ where: { id: pago.id } })).ocurridoAt?.toISOString()).toBe('2026-03-10T17:00:00.000Z')
  })

  it('idempotente: el mismo offlineId no duplica la corrección, ni siquiera en paralelo', async () => {
    const { pago } = await pagoRegistrado()
    const offlineId = randomUUID()
    const cuerpo = { fecha: '2026-03-18', motivo: 'reintento por mala señal', offlineId }
    const [a, b] = await Promise.all([llamar(pago.id, cuerpo), llamar(pago.id, cuerpo)])
    expect([a.status, b.status].sort()).toEqual([200, 201]) // una crea, la otra responde «ya estaba»
    const c = await llamar(pago.id, cuerpo)
    expect(c.status).toBe(200)
    expect((await c.json()).deduped).toBe(true)
    expect(await testPrisma.pagoFechaCorreccion.count({ where: { pagoId: pago.id } })).toBe(1)
  })

  it('el detalle del pedido expone la fecha efectiva, la marca de regularización y el historial para que se vea', async () => {
    const { pago, pedido } = await pagoRegistrado()
    await llamar(pago.id, { fecha: '2026-03-18', motivo: 'visible en el detalle' })
    const { GET } = await import('@/app/api/pedidos/[id]/route')
    const res = await GET(new NextRequest(`http://localhost/api/pedidos/${pedido.id}`), { params: Promise.resolve({ id: pedido.id }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    const pg = (body.pedido ?? body.data?.pedido).pagosDetalle.find((p: { id: string }) => p.id === pago.id)
    expect(pg.fecha).toBe(REGISTRO.toISOString())
    expect(pg.ocurridoAt).toBe('2026-03-18T17:00:00.000Z')
    expect(pg.regularizado).toBe(false)
    expect(pg.correccionesFecha).toHaveLength(1)
    expect(pg.correccionesFecha[0]).toMatchObject({ motivo: 'visible en el detalle' })
    expect(typeof pg.correccionesFecha[0].corregidoPor).toBe('string')
  })

  it('la base exige que una corrección cambie la fecha y traiga motivo (CHECK)', async () => {
    const { pago } = await pagoRegistrado()
    const f = new Date('2026-03-18T17:00:00Z')
    await expect(testPrisma.pagoFechaCorreccion.create({ data: { pagoId: pago.id, fechaAnterior: f, fechaNueva: f, motivo: 'mismo instante', corregidoPorId: adminId } })).rejects.toThrow()
    await expect(testPrisma.pagoFechaCorreccion.create({ data: { pagoId: pago.id, fechaAnterior: REGISTRO, fechaNueva: f, motivo: ' ', corregidoPorId: adminId } })).rejects.toThrow()
  })
})
