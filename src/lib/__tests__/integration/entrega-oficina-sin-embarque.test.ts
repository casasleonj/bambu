// @tests #472 — TEMPORAL-SIN-EMBARQUE: el ADMIN registra la entrega de un pedido
// SIN embarque (Postgres real, handler REAL). Cada prueba mira la BASE DE DATOS
// (no solo la respuesta HTTP) y termina corriendo el verificador de integridad
// (V1–V15) sobre el pedido: cero hallazgos nuevos. Lección del incidente P0:
// una prueba de venta que no mira la base pasa con el bug activo.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST } from '@/app/api/pedidos/[id]/gestion-admin/entrega/route'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { verificarIntegridad } from '@/lib/integridad/verificar'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from '@/lib/gestion-admin'

let adminId: string
let clienteId: string
let repartidorId: string
let otroRepartidorId: string

const unico = () => `of-${randomUUID()}`
const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const diaBogota = (dias: number) => new Date(Date.now() - dias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
/** Mediodía de Bogotá (17:00Z) de un día YYYY-MM-DD. */
const mediodia = (dia: string) => `${dia}T17:00:00.000Z`

async function interruptor(valor: string) {
  await testPrisma.config.upsert({
    where: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE },
    create: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE, valor },
    update: { valor },
  })
}

async function crearPedido(o: { clienteId?: string; canal?: 'DOMICILIO' | 'PUNTO'; cant?: number; pago?: number } = {}) {
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId: o.clienteId ?? clienteId,
    canal: o.canal ?? 'DOMICILIO',
    origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: o.cant ?? 10 }],
    pagos: o.pago ? [{ metodo: 'EFECTIVO', monto: o.pago }] : [],
    createdById: adminId,
    createdByRole: 'ADMIN',
    offlineId: unico(),
  })
  return pedido.id
}

async function post(pedidoId: string, body: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost/api/pedidos/${pedidoId}/gestion-admin/entrega`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offlineId: unico(), itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10 }], ...body }),
  })
  const res = await POST(req, { params: Promise.resolve({ id: pedidoId }) })
  return { status: res.status, body: (await res.json()) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function fila(pedidoId: string) {
  return testPrisma.pedido.findUniqueOrThrow({
    where: { id: pedidoId },
    include: { items: true, factura: true },
  })
}
const pagos = (pedidoId: string) => testPrisma.pago.findMany({ where: { pedidoId }, orderBy: { createdAt: 'asc' } })

/** Reglas del verificador (V1–V15) que señalan ESTE pedido. Debe ser []. */
async function violaciones(pedidoId: string): Promise<string[]> {
  const { numero } = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { numero: true } })
  const reporte = await verificarIntegridad(testPrisma, { maxMuestras: 5000 })
  // V11 («posible duplicado en 60 s») es una heurística: la prueba crea pedidos idénticos
  // seguidos a propósito, así que se excluye. Todas las demás reglas deben quedar limpias.
  return reporte.reglas
    .filter((r) => r.id !== 'V11')
    .flatMap((r) => r.hallazgos.filter((h) => h.numero === numero).map(() => r.id))
}

describe('#472 — entrega de oficina sin embarque (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Oficina', telefono: '3001230001', direccion: 'Calle 1 # 2-3', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
    })).id
    repartidorId = (await testPrisma.trabajador.create({ data: { nombre: 'Andrés Oficina', rol: 'REPARTIDOR', usaMoto: true } })).id
    otroRepartidorId = (await testPrisma.trabajador.create({ data: { nombre: 'Camilo Oficina', rol: 'REPARTIDOR', usaMoto: true } })).id
    await interruptor('true')
  })
  afterAll(async () => { await disconnect() })
  beforeEach(async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
    await interruptor('true')
  })

  it('domicilio completo, cobro total recibido por el repartidor: queda entregado, pagado y sin violaciones', async () => {
    const id = await crearPedido()
    const antes = await fila(id)
    const total = Number(antes.total)
    const r = await post(id, { repartidorId, recibioDinero: 'REPARTIDOR', pagos: [{ metodo: 'EFECTIVO', monto: total }], nota: 'Volvió y lo contó' })
    expect(r.status).toBe(200)

    const p = await fila(id)
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.estado).toBe('ENTREGADO') // espejo legacy que lee la nómina
    expect(p.estadoPago).toBe('PAGADO')
    expect(Number(p.saldo)).toBe(0)
    expect(p.entregadoPorId).toBe(repartidorId)
    expect(p.adminOverrideBy).toBe(adminId)
    expect(p.adminOverrideNota).toBe('Volvió y lo contó')
    expect(p.embarqueId).toBeNull()
    expect(p.items[0].cantEntrega).toBe(10)
    expect(p.cPacaAguaEnt).toBe(10) // columna legacy que usa la nómina
    expect(p.factura?.estado).toBe('PAGADA')
    expect(Number(p.factura?.saldo)).toBe(0)

    const ps = await pagos(id)
    expect(ps).toHaveLength(1)
    expect(ps[0].recibidoPorId).toBe(repartidorId)
    expect(ps[0].embarqueId).toBeNull()
    expect(ps[0].ocurridoAt).toBeNull() // hoy: la fecha del hecho es la del registro
    expect(await testPrisma.receivableEntry.count({ where: { pedidoId: id, tipo: 'PAGO' } })).toBe(1)
    expect(await violaciones(id)).toEqual([])
  })

  it('#498 cobro mixto (efectivo + transferencia): un Pago por medio, mismo receptor y fecha, pagado completo y sin violaciones', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    const efectivo = Math.round(total * 0.6)
    const transferencia = total - efectivo
    const r = await post(id, {
      repartidorId, recibioDinero: 'OFICINA', fechaEntrega: mediodia(diaBogota(1)), precisionFecha: 'DIA',
      pagos: [{ metodo: 'EFECTIVO', monto: efectivo }, { metodo: 'TRANSFERENCIA', monto: transferencia }],
    })
    expect(r.status).toBe(200)

    const p = await fila(id)
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.estadoPago).toBe('PAGADO')
    expect(Number(p.saldo)).toBe(0)
    expect(Number(p.totalPagado)).toBe(total)

    const ps = await pagos(id)
    expect(ps).toHaveLength(2)
    expect(ps.map((x) => x.metodo).sort()).toEqual(['EFECTIVO', 'TRANSFERENCIA'])
    expect(Number(ps.find((x) => x.metodo === 'EFECTIVO')!.monto)).toBe(efectivo)
    expect(Number(ps.find((x) => x.metodo === 'TRANSFERENCIA')!.monto)).toBe(transferencia)
    // una sola persona recibió TODO y la fecha del hecho es la misma
    expect(new Set(ps.map((x) => x.recibidoPorId)).size).toBe(1)
    expect(ps[0].recibidoPorId).toBeNull() // OFICINA: no queda a nombre del repartidor
    expect(new Set(ps.map((x) => x.ocurridoAt?.toISOString() ?? null)).size).toBe(1)
    expect(ps[0].ocurridoAt).not.toBeNull()
    // el libro registra UN cobro por entrega, con la suma de los medios
    const libro = await testPrisma.receivableEntry.findMany({ where: { pedidoId: id, tipo: 'PAGO' } })
    expect(libro).toHaveLength(1)
    expect(Number(libro[0].monto)).toBe(total)
    expect(await violaciones(id)).toEqual([])
  })

  it('#498 cobro mixto parcial: la suma de los medios queda como pagado y el resto como deuda', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    const manana = diaBogota(-3)
    const r = await post(id, {
      repartidorId, recibioDinero: 'REPARTIDOR', promesaPagoFecha: manana,
      pagos: [{ metodo: 'EFECTIVO', monto: 10000 }, { metodo: 'NEQUI', monto: 5000 }],
    })
    expect(r.status).toBe(200)
    const p = await fila(id)
    expect(Number(p.totalPagado)).toBe(15000)
    expect(Number(p.saldo)).toBe(total - 15000)
    expect(p.estadoPago).toBe('PARCIAL')
    const ps = await pagos(id)
    expect(ps).toHaveLength(2)
    expect(ps.every((x) => x.recibidoPorId === repartidorId)).toBe(true)
    expect(await violaciones(id)).toEqual([])
  })

  it('#498 un cobro mixto que en suma pasa lo debido se rechaza y no deja pagos a medias', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    const r = await post(id, {
      repartidorId, recibioDinero: 'REPARTIDOR',
      pagos: [{ metodo: 'EFECTIVO', monto: total }, { metodo: 'NEQUI', monto: 1000 }],
    })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(await pagos(id)).toHaveLength(0)
    expect((await fila(id)).estadoEntrega).not.toBe('ENTREGADO')
  })

  it('#498 reintentar un cobro mixto con la misma clave no duplica ningún pago', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    const cuerpo = { offlineId: unico(), repartidorId, recibioDinero: 'OFICINA', pagos: [{ metodo: 'EFECTIVO', monto: total - 5000 }, { metodo: 'DAVIPLATA', monto: 5000 }] }
    expect((await post(id, cuerpo)).status).toBe(200)
    const otra = await post(id, cuerpo)
    expect(otra.status).toBe(200)
    expect(otra.body.deduped).toBe(true)
    expect(await pagos(id)).toHaveLength(2)
  })

  it('el dinero que se pagó en la oficina NO queda a nombre del repartidor', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    const r = await post(id, { repartidorId, recibioDinero: 'OFICINA', pagos: [{ metodo: 'EFECTIVO', monto: total }] })
    expect(r.status).toBe(200)
    expect((await pagos(id))[0].recibidoPorId).toBeNull()
    expect((await fila(id)).entregadoPorId).toBe(repartidorId)
    expect(await violaciones(id)).toEqual([])
  })

  it('entrega parcial: sigue pendiente, total y deuda intactos, el repartidor queda fijo y se completa con él', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    const unitario = total / 10

    const r1 = await post(id, {
      repartidorId, recibioDinero: 'REPARTIDOR',
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 8 }],
      pagos: [{ metodo: 'EFECTIVO', monto: unitario * 8 }],
    })
    expect(r1.status).toBe(200)
    let p = await fila(id)
    expect(p.estadoEntrega).toBe('PENDIENTE')
    expect(p.items[0].cantEntrega).toBe(8)
    expect(Number(p.total)).toBe(total) // la entrega física no cambia lo debido
    expect(Number(p.totalPagado)).toBe(unitario * 8)
    expect(Number(p.factura?.saldo)).toBe(Number(p.saldo)) // V3: la factura sigue al pedido aunque sea parcial
    expect(await violaciones(id)).toEqual([])

    // Otro repartidor NO puede tomar el resto: un pedido, un repartidor.
    const r2 = await post(id, { repartidorId: otroRepartidorId, itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 2 }] })
    expect(r2.status).toBe(409)
    expect(r2.body.error.code).toBe('REPARTIDOR_DISTINTO')
    expect((await fila(id)).items[0].cantEntrega).toBe(8)

    // El mismo repartidor completa (sin repetirlo en el cuerpo) y cobra lo que falta.
    const r3 = await post(id, {
      recibioDinero: 'REPARTIDOR',
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: unitario * 2 }],
    })
    expect(r3.status).toBe(200)
    p = await fila(id)
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.estadoPago).toBe('PAGADO')
    expect(p.entregadoPorId).toBe(repartidorId)
    expect(await violaciones(id)).toEqual([])
  })

  it('fiado a un cliente real: exige promesa de pago futura y la deja guardada', async () => {
    const id = await crearPedido()
    const sin = await post(id, { repartidorId })
    expect(sin.status).toBe(422)
    expect(sin.body.error.code).toBe('PROMESA_REQUERIDA')
    expect((await fila(id)).estadoEntrega).toBe('PENDIENTE') // nada se persistió
    expect(await pagos(id)).toHaveLength(0)

    const pasada = await post(id, { repartidorId, promesaPagoFecha: diaBogota(2) })
    expect(pasada.status).toBe(422)
    expect(pasada.body.error.code).toBe('PROMESA_PASADA')

    const promesa = diaBogota(-6)
    const ok = await post(id, { repartidorId, promesaPagoFecha: promesa })
    expect(ok.status).toBe(200)
    const p = await fila(id)
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.estadoPago).toBe('PENDIENTE')
    expect(Number(p.saldo)).toBe(Number(p.total))
    expect(p.promesaPagoFecha?.toISOString().slice(0, 10)).toBe(promesa)
    expect(p.factura?.estado).toBe('EMITIDA')
    expect(await violaciones(id)).toEqual([])
  })

  it('cliente anónimo: nunca se deja saldo (V4) y no se persiste nada', async () => {
    // Un anónimo con deuda ya no se puede crear por la vía normal: se simula el dato legado.
    const anonimo = await crearPedido({ clienteId: 'CONSUMIDOR_FINAL', canal: 'PUNTO', pago: 1_000_000 })
    const t = Number((await fila(anonimo)).total)
    await testPrisma.pago.deleteMany({ where: { pedidoId: anonimo } })
    await testPrisma.$executeRaw`UPDATE "Pedido" SET "totalPagado" = 0, saldo = ${t}, "estadoPago" = 'PENDIENTE' WHERE id = ${anonimo}`
    await testPrisma.$executeRaw`UPDATE "Factura" SET "montoPagado" = 0, saldo = ${t}, estado = 'EMITIDA' WHERE "pedidoId" = ${anonimo}`

    const r = await post(anonimo, { promesaPagoFecha: diaBogota(-3) })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('DEUDOR_REQUERIDO')
    const p = await fila(anonimo)
    expect(p.estadoEntrega).toBe('PENDIENTE')
    expect(p.entregadoPorId).toBeNull()
    expect(await pagos(anonimo)).toHaveLength(0)
  })

  it('domicilio sin repartidor, repartidor sin moto o inactivo, y cobro sin decir quién recibió: se rechazan', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    expect((await post(id, {})).body.error.code).toBe('REPARTIDOR_REQUERIDO')

    const sinMoto = (await testPrisma.trabajador.create({ data: { nombre: 'A pie', rol: 'REPARTIDOR', usaMoto: false } })).id
    const inactivo = (await testPrisma.trabajador.create({ data: { nombre: 'Inactivo', rol: 'REPARTIDOR', usaMoto: true, activo: false } })).id
    expect((await post(id, { repartidorId: sinMoto })).body.error.code).toBe('REPARTIDOR_INVALIDO')
    expect((await post(id, { repartidorId: inactivo })).body.error.code).toBe('REPARTIDOR_INVALIDO')
    expect((await post(id, { repartidorId: 'no-existe' })).body.error.code).toBe('REPARTIDOR_INVALIDO')

    const sinQuien = await post(id, { repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: total }] })
    expect(sinQuien.status).toBe(422)
    expect(sinQuien.body.error.code).toBe('QUIEN_RECIBIO_REQUERIDO')

    const p = await fila(id)
    expect(p.estadoEntrega).toBe('PENDIENTE')
    expect(p.entregadoPorId).toBeNull()
    expect(await pagos(id)).toHaveLength(0)
  })

  it('cobro mayor que lo que se debe: se rechaza y no queda nada a medias', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    const r = await post(id, { repartidorId, recibioDinero: 'REPARTIDOR', pagos: [{ metodo: 'EFECTIVO', monto: total + 1000 }] })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('PAGO_EXCEDE_SALDO')
    const p = await fila(id)
    expect(p.estadoEntrega).toBe('PENDIENTE')
    expect(p.items[0].cantEntrega).toBe(0)
    expect(await pagos(id)).toHaveLength(0)
  })

  it('pedido de punto: no pide repartidor', async () => {
    const id = await crearPedido({ canal: 'PUNTO' })
    const total = Number((await fila(id)).total)
    const r = await post(id, { recibioDinero: 'OFICINA', pagos: [{ metodo: 'EFECTIVO', monto: total }] })
    expect(r.status).toBe(200)
    const p = await fila(id)
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.entregadoPorId).toBeNull()
    expect(await violaciones(id)).toEqual([])
  })

  it('con el interruptor apagado, o sin ser ADMIN, se rechaza y no cambia nada', async () => {
    const id = await crearPedido()
    await interruptor('false')
    const apagado = await post(id, { repartidorId, promesaPagoFecha: diaBogota(-3) })
    expect(apagado.status).toBe(403)
    expect(apagado.body.error.code).toBe('FUNCION_DESACTIVADA')

    await interruptor('true')
    for (const rol of ['ASISTENTE', 'REPARTIDOR', 'CONTADOR']) {
      mockAuth.mockResolvedValue({ user: { id: adminId, role: rol }, expires: '2099-01-01T00:00:00.000Z' })
      expect((await post(id, { repartidorId, promesaPagoFecha: diaBogota(-3) })).status).toBe(403)
    }
    expect((await fila(id)).estadoEntrega).toBe('PENDIENTE')
  })

  it('reintento con el mismo offlineId: una sola vez (sin pago duplicado)', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    const cuerpo = { offlineId: unico(), repartidorId, recibioDinero: 'REPARTIDOR', pagos: [{ metodo: 'EFECTIVO', monto: total }] }
    const a = await post(id, cuerpo)
    const b = await post(id, cuerpo)
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(b.body.deduped).toBe(true)
    expect(await pagos(id)).toHaveLength(1)
    expect(await violaciones(id)).toEqual([])
  })

  it('dos administradores a la vez: un solo cobro, un solo resultado, sin violaciones', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    const cuerpo = () => ({ repartidorId, recibioDinero: 'REPARTIDOR', pagos: [{ metodo: 'EFECTIVO', monto: total }] })
    const [a, b] = await Promise.all([post(id, cuerpo()), post(id, cuerpo())])
    expect([a.status, b.status]).toEqual([200, 200])
    expect([a.body.deduped === true, b.body.deduped === true].filter(Boolean)).toHaveLength(1)
    const ps = await pagos(id)
    expect(ps).toHaveLength(1)
    expect(ps.reduce((s, x) => s + Number(x.monto), 0)).toBe(total)
    expect(await violaciones(id)).toEqual([])
  })

  it('fecha: no futura, hasta 7 días atrás, y un día anterior ya cerrado no se reabre', async () => {
    const id = await crearPedido()
    const manana = new Date(Date.now() + 2 * 86_400_000).toISOString()
    expect((await post(id, { repartidorId, fechaEntrega: manana, promesaPagoFecha: diaBogota(-3) })).body.error.code).toBe('FECHA_FUTURA')
    const vieja = new Date(Date.now() - 9 * 86_400_000).toISOString()
    expect((await post(id, { repartidorId, fechaEntrega: vieja, promesaPagoFecha: diaBogota(-3) })).body.error.code).toBe('FECHA_MUY_ANTIGUA')

    const diaCerrado = diaBogota(3)
    await testPrisma.cierreDia.create({ data: { fecha: new Date(mediodia(diaCerrado)) } })
    const r = await post(id, { repartidorId, fechaEntrega: mediodia(diaCerrado), promesaPagoFecha: diaBogota(-3) })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('DIA_CERRADO')
    expect((await fila(id)).estadoEntrega).toBe('PENDIENTE')

    // Un día pasado y abierto sí: la fecha del hecho del cobro se guarda aparte (#402).
    const abierto = diaBogota(2)
    const total = Number((await fila(id)).total)
    const ok = await post(id, { repartidorId, recibioDinero: 'REPARTIDOR', fechaEntrega: mediodia(abierto), pagos: [{ metodo: 'EFECTIVO', monto: total }] })
    expect(ok.status).toBe(200)
    const p = await fila(id)
    expect(p.entregadoAt?.toISOString()).toBe(mediodia(abierto))
    const ps = await pagos(id)
    expect(ps[0].ocurridoAt?.toISOString()).toBe(mediodia(abierto))
    expect(ps[0].createdAt.getTime()).toBeGreaterThan(Date.now() - 60_000) // el registro es de ahora
    expect(await violaciones(id)).toEqual([])
  })

  it('hoy se admite aunque el día ya tenga cierre (queda registrado, no se bloquea)', async () => {
    const hoy = hoyBogota()
    await testPrisma.cierreDia.upsert({
      where: { fecha: new Date(mediodia(hoy)) },
      create: { fecha: new Date(mediodia(hoy)) },
      update: {},
    })
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    const r = await post(id, { repartidorId, recibioDinero: 'OFICINA', pagos: [{ metodo: 'EFECTIVO', monto: total }] })
    expect(r.status).toBe(200)
    expect((await fila(id)).estadoEntrega).toBe('ENTREGADO')
  })

  it('si la nómina del repartidor ya cubre la fecha, se rechaza para no perder su comisión', async () => {
    const conNomina = (await testPrisma.trabajador.create({ data: { nombre: 'Con nómina', rol: 'REPARTIDOR', usaMoto: true } })).id
    await testPrisma.nomina.create({
      data: {
        trabajadorId: conNomina,
        fechaInicio: new Date(Date.now() - 2 * 86_400_000),
        fechaFin: new Date(Date.now() + 86_400_000),
        total: 0,
      },
    })
    const id = await crearPedido()
    const r = await post(id, { repartidorId: conNomina, promesaPagoFecha: diaBogota(-3) })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('NOMINA_EXISTENTE')
    const p = await fila(id)
    expect(p.estadoEntrega).toBe('PENDIENTE')
    expect(p.entregadoPorId).toBeNull()

    // Una nómina ANULADA no bloquea.
    await testPrisma.nomina.updateMany({ where: { trabajadorId: conNomina }, data: { estado: 'ANULADA' } })
    expect((await post(id, { repartidorId: conNomina, promesaPagoFecha: diaBogota(-3) })).status).toBe(200)
  })

  it('un pedido que está en un embarque sale de él al registrarse desde la oficina, y queda auditado', async () => {
    const id = await crearPedido()
    const emb = await testPrisma.embarque.create({ data: { trabajadorId: otroRepartidorId, fecha: new Date(), estado: 'EN_RUTA' } })
    await testPrisma.pedido.update({ where: { id }, data: { embarqueId: emb.id, estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA' } })

    const r = await post(id, { repartidorId, promesaPagoFecha: diaBogota(-3) })
    expect(r.status).toBe(200)
    expect(r.body.embarqueLiberadoId).toBe(emb.id)
    const p = await fila(id)
    expect(p.embarqueId).toBeNull()
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.entregadoPorId).toBe(repartidorId) // la comisión es de quien eligió el admin, no del conductor del embarque

    const auditorias = await testPrisma.historial.findMany({ where: { entidad: 'Pedido', registroId: id } })
    expect(auditorias.some((h) => JSON.stringify(h.datos).includes('ENTREGA_OFICINA') && JSON.stringify(h.datos).includes(emb.id))).toBe(true)
    expect(await violaciones(id)).toEqual([])
  })

  it('un pedido ya entregado, cancelado o anulado no se vuelve a entregar', async () => {
    const id = await crearPedido()
    const total = Number((await fila(id)).total)
    await post(id, { repartidorId, recibioDinero: 'OFICINA', pagos: [{ metodo: 'EFECTIVO', monto: total }] })
    const otra = await post(id, { repartidorId, itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10 }] })
    expect(otra.status).toBe(200)
    expect(otra.body.deduped).toBe(true)

    const cancelado = await crearPedido()
    await testPrisma.pedido.update({ where: { id: cancelado }, data: { estadoEntrega: 'CANCELADO', estado: 'CANCELADO', estadoPago: 'ANULADO' } })
    expect((await post(cancelado, { repartidorId })).status).toBe(409)
  })
})

describe('#472 — el interruptor se lee siempre de la base (sin caché)', () => {
  it('apagarlo surte efecto en la lectura inmediata siguiente', async () => {
    const { gestionAdminSinEmbarqueActiva } = await import('@/lib/gestion-admin')
    await interruptor('true')
    expect(await gestionAdminSinEmbarqueActiva()).toBe(true)
    await interruptor('false')
    expect(await gestionAdminSinEmbarqueActiva()).toBe(false)
    await interruptor('TRUE ')
    expect(await gestionAdminSinEmbarqueActiva()).toBe(true)
    await testPrisma.config.deleteMany({ where: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE } })
    expect(await gestionAdminSinEmbarqueActiva()).toBe(false) // sin fila = apagado
  })
})
