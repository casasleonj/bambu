// @tests #472 — TEMPORAL-SIN-EMBARQUE: el ADMIN registra el cobro posterior de un
// fiado diciendo QUIÉN recibió el dinero y CUÁNDO (Postgres real, handlers REALES).
// Cada prueba mira la base de datos: el pago guardado, el saldo del pedido, la
// factura y el verificador de integridad (V1–V15) sobre el pedido.

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
import { POST as entregaOficina } from '@/app/api/pedidos/[id]/gestion-admin/entrega/route'
import { POST as pagarFiado } from '@/app/api/pedidos/pagar-fiado/route'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { verificarIntegridad } from '@/lib/integridad/verificar'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from '@/lib/gestion-admin'

let adminId: string
let repartidorId: string
let contador = 0

const unico = () => `pf-${randomUUID()}`
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

function sesion(role: 'ADMIN' | 'ASISTENTE') {
  mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
}

/** Un cliente nuevo con UN pedido de 10 pacas entregado y debido por completo (fiado). */
async function clienteConFiado() {
  contador += 1
  const cliente = await testPrisma.cliente.create({
    data: {
      nombre: `Cliente Fiado ${contador}`,
      telefono: `31000${String(contador).padStart(5, '0')}`,
      direccion: 'Calle 1 # 2-3',
      barrio: 'Centro',
      limitePedidosFiados: 20,
      activo: true,
    },
  })
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId: cliente.id,
    canal: 'DOMICILIO',
    origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
    pagos: [],
    createdById: adminId,
    createdByRole: 'ADMIN',
    offlineId: unico(),
  })
  sesion('ADMIN')
  const req = new NextRequest(`http://localhost/api/pedidos/${pedido.id}/gestion-admin/entrega`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offlineId: unico(),
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      repartidorId,
      promesaPagoFecha: diaBogota(-3),
    }),
  })
  const res = await entregaOficina(req, { params: Promise.resolve({ id: pedido.id }) })
  expect(res.status).toBe(200)
  const fila = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
  expect(fila.estadoEntrega).toBe('ENTREGADO')
  expect(Number(fila.saldo)).toBe(Number(fila.total))
  return { clienteId: cliente.id, pedidoId: pedido.id, total: Number(fila.total) }
}

async function cobrar(body: Record<string, unknown>) {
  const req = new NextRequest('http://localhost/api/pedidos/pagar-fiado', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metodo: 'EFECTIVO', offlineId: unico(), ...body }),
  })
  const res = await pagarFiado(req)
  return { status: res.status, body: (await res.json()) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
}

const pagos = (pedidoId: string) => testPrisma.pago.findMany({ where: { pedidoId }, orderBy: { createdAt: 'asc' } })

/** Reglas del verificador (V1–V15) que señalan ESTE pedido. Debe ser []. */
async function violaciones(pedidoId: string): Promise<string[]> {
  const { numero } = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { numero: true } })
  const reporte = await verificarIntegridad(testPrisma, { maxMuestras: 5000 })
  return reporte.reglas
    .filter((r) => r.id !== 'V11')
    .flatMap((r) => r.hallazgos.filter((h) => h.numero === numero).map(() => r.id))
}

describe('#472 — cobro de fiado: quién recibió y cuándo (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    repartidorId = (await testPrisma.trabajador.create({ data: { nombre: 'Andrés Cobro', rol: 'REPARTIDOR', usaMoto: true } })).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(async () => {
    sesion('ADMIN')
    await interruptor('true')
  })

  it('recibido por el repartidor, hoy: el pago guarda quién lo recibió y la deuda queda saldada', async () => {
    const f = await clienteConFiado()
    const r = await cobrar({ clienteId: f.clienteId, monto: f.total, recibioDinero: 'REPARTIDOR', repartidorId })
    expect(r.status).toBe(200)

    const ps = await pagos(f.pedidoId)
    expect(ps).toHaveLength(1)
    expect(ps[0].recibidoPorId).toBe(repartidorId)
    expect(ps[0].ocurridoAt).toBeNull() // hoy: la fecha del hecho es la del registro
    expect(Number(ps[0].monto)).toBe(f.total)
    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedidoId }, include: { factura: true } })
    expect(p.estadoPago).toBe('PAGADO')
    expect(Number(p.saldo)).toBe(0)
    expect(p.factura?.estado).toBe('PAGADA')
    expect(await violaciones(f.pedidoId)).toEqual([])
  })

  it('recibido por la oficina: sin repartidor en el pago', async () => {
    const f = await clienteConFiado()
    const r = await cobrar({ clienteId: f.clienteId, monto: f.total / 2, recibioDinero: 'OFICINA' })
    expect(r.status).toBe(200)
    const ps = await pagos(f.pedidoId)
    expect(ps).toHaveLength(1)
    expect(ps[0].recibidoPorId).toBeNull()
    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedidoId } })
    expect(p.estadoPago).toBe('PARCIAL')
    expect(Number(p.saldo)).toBe(f.total / 2)
    expect(await violaciones(f.pedidoId)).toEqual([])
  })

  it('con una fecha pasada abierta: la fecha del hecho se guarda aparte del registro', async () => {
    const f = await clienteConFiado()
    const dia = diaBogota(2)
    const r = await cobrar({ clienteId: f.clienteId, monto: f.total, recibioDinero: 'REPARTIDOR', repartidorId, fechaRecepcion: mediodia(dia) })
    expect(r.status).toBe(200)
    const [pago] = await pagos(f.pedidoId)
    expect(pago.ocurridoAt?.toISOString()).toBe(mediodia(dia))
    expect(pago.createdAt.getTime()).toBeGreaterThan(Date.now() - 60_000) // el registro es ahora
    expect(await violaciones(f.pedidoId)).toEqual([])
  })

  it('rechaza fecha futura, de más de 7 días y de un día cerrado, sin tocar el pedido', async () => {
    const f = await clienteConFiado()
    const base = { clienteId: f.clienteId, monto: f.total, recibioDinero: 'OFICINA' }

    const futura = await cobrar({ ...base, fechaRecepcion: mediodia(diaBogota(-2)) })
    expect(futura.status).toBe(422)
    expect(futura.body.error.code).toBe('FECHA_FUTURA')

    const antigua = await cobrar({ ...base, fechaRecepcion: mediodia(diaBogota(10)) })
    expect(antigua.status).toBe(422)
    expect(antigua.body.error.code).toBe('FECHA_MUY_ANTIGUA')

    const cerrado = diaBogota(3)
    await testPrisma.cierreDia.create({ data: { fecha: new Date(mediodia(cerrado)) } })
    const enCierre = await cobrar({ ...base, fechaRecepcion: mediodia(cerrado) })
    expect(enCierre.status).toBe(409)
    expect(enCierre.body.error.code).toBe('DIA_CERRADO')

    expect(await pagos(f.pedidoId)).toHaveLength(0)
    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedidoId } })
    expect(Number(p.saldo)).toBe(f.total)
  })

  it('exige decir quién recibió; y si fue el repartidor, que sea uno válido y sin nómina que cubra la fecha', async () => {
    const f = await clienteConFiado()
    const base = { clienteId: f.clienteId, monto: f.total }

    const sinQuien = await cobrar({ ...base, fechaRecepcion: new Date().toISOString() })
    expect(sinQuien.status).toBe(422)
    expect(sinQuien.body.error.code).toBe('QUIEN_RECIBIO_REQUERIDO')

    const sinRepartidor = await cobrar({ ...base, recibioDinero: 'REPARTIDOR' })
    expect(sinRepartidor.status).toBe(422)
    expect(sinRepartidor.body.error.code).toBe('QUIEN_RECIBIO_REQUERIDO')

    const inactivo = (await testPrisma.trabajador.create({ data: { nombre: 'Inactivo', rol: 'REPARTIDOR', usaMoto: true, activo: false } })).id
    const invalido = await cobrar({ ...base, recibioDinero: 'REPARTIDOR', repartidorId: inactivo })
    expect(invalido.status).toBe(422)
    expect(invalido.body.error.code).toBe('REPARTIDOR_INVALIDO')

    const conNomina = (await testPrisma.trabajador.create({ data: { nombre: 'Con nómina', rol: 'REPARTIDOR', usaMoto: true } })).id
    await testPrisma.nomina.create({
      data: { trabajadorId: conNomina, fechaInicio: new Date(Date.now() - 2 * 86_400_000), fechaFin: new Date(Date.now() + 86_400_000), total: 0 },
    })
    const enNomina = await cobrar({ ...base, recibioDinero: 'REPARTIDOR', repartidorId: conNomina })
    expect(enNomina.status).toBe(409)
    expect(enNomina.body.error.code).toBe('NOMINA_EXISTENTE')

    expect(await pagos(f.pedidoId)).toHaveLength(0)
  })

  it('con el interruptor apagado, o sin ser ADMIN, los campos nuevos se rechazan y nada cambia', async () => {
    const f = await clienteConFiado()
    const body = { clienteId: f.clienteId, monto: f.total, recibioDinero: 'OFICINA' }

    await interruptor('false')
    const apagado = await cobrar(body)
    expect(apagado.status).toBe(403)
    expect(apagado.body.error.code).toBe('FUNCION_DESACTIVADA')

    await interruptor('true')
    sesion('ASISTENTE')
    const asistente = await cobrar(body)
    expect(asistente.status).toBe(403)
    expect(asistente.body.error.code).toBe('SOLO_ADMIN')

    expect(await pagos(f.pedidoId)).toHaveLength(0)
  })

  it('sin los campos nuevos el cobro es el de siempre, también con el interruptor encendido y para la ASISTENTE', async () => {
    const f = await clienteConFiado()
    sesion('ASISTENTE')
    const r = await cobrar({ clienteId: f.clienteId, monto: f.total })
    expect(r.status).toBe(200)
    const [pago] = await pagos(f.pedidoId)
    expect(pago.recibidoPorId).toBeNull()
    expect(pago.ocurridoAt).toBeNull()
    expect(await violaciones(f.pedidoId)).toEqual([])
  })

  it('un reintento con la misma clave no cobra dos veces', async () => {
    const f = await clienteConFiado()
    const clave = unico()
    const cuerpo = { clienteId: f.clienteId, monto: f.total / 2, recibioDinero: 'REPARTIDOR', repartidorId, offlineId: clave }
    expect((await cobrar(cuerpo)).status).toBe(200)
    const otra = await cobrar(cuerpo)
    expect(otra.status).toBe(200)
    expect(otra.body.deduped).toBe(true)
    expect(await pagos(f.pedidoId)).toHaveLength(1)
    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: f.pedidoId } })
    expect(Number(p.saldo)).toBe(f.total / 2)
  })
})
