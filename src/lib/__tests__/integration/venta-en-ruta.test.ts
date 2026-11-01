// @tests #535 — «Venta en ruta»: el ADMIN registra desde Pedidos, sin embarque, una venta que el
// repartidor hizo en la calle. Es una venta rápida a domicilio que nace ENTREGADA con el
// repartidor anotado (`entregadoPorId`) para que la comisión sin embarque (#472) la cuente.
// Postgres real, handler REAL (POST /api/pedidos); cada prueba mira la base de datos.

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
import { POST as crearPedido } from '@/app/api/pedidos/route'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from '@/lib/gestion-admin'
import { comisionRepartidoresDelDia } from '@/lib/comision-repartidor'
import { todayStringBogota } from '@/lib/dates'
import { verificarIntegridad } from '@/lib/integridad/verificar'

let adminId: string
let repartidorId: string
const unico = () => `vr-${randomUUID()}`

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

const base = () => ({
  origen: 'VENTA_RAPIDA',
  canal: 'DOMICILIO',
  clienteId: 'CONSUMIDOR_FINAL',
  direccionEntrega: 'Calle 1 # 2-3, Centro',
  items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
  offlineId: unico(),
})

async function crear(cuerpo: Record<string, unknown>) {
  const req = new NextRequest('http://localhost/api/pedidos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  })
  const res = await crearPedido(req)
  return { status: res.status, body: (await res.json()) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function totalDe(items: Array<{ producto: string; cantidad: number }>) {
  // Se cobra el total exacto: lo calcula el servidor; el cuerpo manda un pago grande y el servidor aplica solo el total.
  void items
  return 1_000_000
}

describe('#535 — venta en ruta desde Pedidos (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    repartidorId = (await testPrisma.trabajador.create({ data: { nombre: 'Germain Ruta', rol: 'REPARTIDOR', usaMoto: true } })).id
    await testPrisma.cliente.upsert({
      where: { id: 'CONSUMIDOR_FINAL' }, update: {},
      create: { id: 'CONSUMIDOR_FINAL', nombre: 'Consumidor Final', telefono: '', direccion: '', activo: false },
    })
  })
  afterAll(async () => { await disconnect() })
  beforeEach(async () => { sesion('ADMIN'); await interruptor('true') })

  it('anónimo que paga todo: nace ENTREGADO, con el repartidor y la hora, sin embarque, y le cuenta comisión', async () => {
    const r = await crear({ ...base(), vendidoPorId: repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] })
    expect(r.status).toBe(201)
    const id = (r.body.pedido?.id ?? r.body.id) as string
    const f = await testPrisma.pedido.findUniqueOrThrow({ where: { id } })
    expect(f.estadoEntrega).toBe('ENTREGADO')
    expect(f.canal).toBe('DOMICILIO')
    expect(f.origen).toBe('VENTA_RAPIDA')
    expect(f.entregadoPorId).toBe(repartidorId)
    expect(f.entregadoAt).not.toBeNull()
    expect(f.embarqueId).toBeNull()
    expect(Number(f.saldo)).toBe(0)
    // La comisión del día incluye estas 5 pacas.
    const filas = await comisionRepartidoresDelDia(testPrisma, todayStringBogota())
    const mia = filas.find((x) => x.trabajadorId === repartidorId)
    expect(mia?.porOrigen.sinEmbarque ?? 0).toBeGreaterThan(0)
    // El verificador de integridad no marca este pedido.
    const rep = await verificarIntegridad(testPrisma, { maxMuestras: 5000 })
    const hallazgos = rep.reglas.flatMap((x) => x.hallazgos.filter((h) => h.numero === f.numero))
    expect(hallazgos).toEqual([])
  })

  it('anónimo que deja saldo se rechaza (422) y no guarda nada', async () => {
    const antes = await testPrisma.pedido.count()
    const r = await crear({ ...base(), vendidoPorId: repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] })
    expect(r.status).toBe(422)
    expect(await testPrisma.pedido.count()).toBe(antes)
  })

  it('fiado a un cliente real sin fecha de promesa se rechaza; con promesa futura entra', async () => {
    const c = await testPrisma.cliente.create({ data: { nombre: 'Don Pedro', telefono: `35${Math.floor(Math.random() * 1e8)}`, direccion: 'x', barrio: 'y', limitePedidosFiados: 20, activo: true } })
    const sinPromesa = await crear({ ...base(), clienteId: c.id, vendidoPorId: repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] })
    expect(sinPromesa.status).toBe(422)
    expect(JSON.stringify(sinPromesa.body)).toContain('PROMESA_REQUERIDA')

    const manana = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const ok = await crear({ ...base(), clienteId: c.id, vendidoPorId: repartidorId, promesaPagoFecha: manana, pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] })
    expect(ok.status).toBe(201)
    const id = (ok.body.pedido?.id ?? ok.body.id) as string
    const f = await testPrisma.pedido.findUniqueOrThrow({ where: { id } })
    expect(Number(f.saldo)).toBeGreaterThan(0)
    expect(f.entregadoPorId).toBe(repartidorId)
    expect(f.promesaPagoFecha).not.toBeNull()
  })

  it('una promesa en el pasado se rechaza', async () => {
    const c = await testPrisma.cliente.create({ data: { nombre: 'Doña Rosa', telefono: `36${Math.floor(Math.random() * 1e8)}`, direccion: 'x', barrio: 'y', limitePedidosFiados: 20, activo: true } })
    const ayer = new Date(Date.now() - 2 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const r = await crear({ ...base(), clienteId: c.id, vendidoPorId: repartidorId, promesaPagoFecha: ayer, pagos: [{ metodo: 'EFECTIVO', monto: 1000 }] })
    expect(r.status).toBe(422)
    expect(JSON.stringify(r.body)).toContain('PROMESA_PASADA')
  })

  it('la ASISTENTE no puede usarla (403)', async () => {
    sesion('ASISTENTE')
    const r = await crear({ ...base(), vendidoPorId: repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] })
    expect(r.status).toBe(403)
  })

  it('con el interruptor apagado se rechaza (403)', async () => {
    await interruptor('false')
    const r = await crear({ ...base(), vendidoPorId: repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] })
    expect(r.status).toBe(403)
  })

  it('un trabajador que no es repartidor con moto se rechaza', async () => {
    const sin = await testPrisma.trabajador.create({ data: { nombre: 'Sin Moto', rol: 'SELLADOR', usaMoto: false } })
    const r = await crear({ ...base(), vendidoPorId: sin.id, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] })
    expect(r.status).toBe(422)
    expect(JSON.stringify(r.body)).toContain('REPARTIDOR_INVALIDO')
  })

  it('solo vale como venta rápida a domicilio entregada: un pedido normal con vendidoPorId se rechaza', async () => {
    const r = await crear({ ...base(), origen: 'PEDIDO', vendidoPorId: repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] })
    expect(r.status).toBe(422)
    expect(JSON.stringify(r.body)).toContain('VENTA_EN_RUTA_INVALIDA')
    const punto = await crear({ ...base(), canal: 'PUNTO', vendidoPorId: repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] })
    expect(punto.status).toBe(422)
  })

  it('si la nómina del repartidor para hoy ya está hecha, se rechaza (su comisión se perdería)', async () => {
    const conNomina = (await testPrisma.trabajador.create({ data: { nombre: 'Con Nomina', rol: 'REPARTIDOR', usaMoto: true } })).id
    await testPrisma.nomina.create({
      data: { trabajadorId: conNomina, fechaInicio: new Date(Date.now() - 2 * 86_400_000), fechaFin: new Date(Date.now() + 86_400_000), total: 0 },
    })
    const antes = await testPrisma.pedido.count()
    const r = await crear({ ...base(), vendidoPorId: conNomina, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] })
    expect(r.status).toBe(409)
    expect(JSON.stringify(r.body)).toContain('NOMINA_EXISTENTE')
    expect(await testPrisma.pedido.count()).toBe(antes)
  })

  it('dos ventas en ruta distintas (claves distintas) son dos ventas, cada una con su pago', async () => {
    const a = await crear({ ...base(), vendidoPorId: repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] })
    const b = await crear({ ...base(), vendidoPorId: repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] })
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
    const ida = (a.body.pedido?.id ?? a.body.id) as string
    const idb = (b.body.pedido?.id ?? b.body.id) as string
    expect(ida).not.toBe(idb)
    expect(await testPrisma.pago.count({ where: { pedidoId: { in: [ida, idb] } } })).toBe(2)
  })

  it('reintentar con la misma clave no duplica ni cobra dos veces', async () => {
    const cuerpo = { ...base(), vendidoPorId: repartidorId, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] }
    const a = await crear(cuerpo)
    const antes = await testPrisma.pedido.count()
    const b = await crear(cuerpo)
    expect(a.status).toBe(201)
    expect([200, 201]).toContain(b.status)
    expect(await testPrisma.pedido.count()).toBe(antes)
    const id = (a.body.pedido?.id ?? a.body.id) as string
    expect(await testPrisma.pago.count({ where: { pedidoId: id } })).toBe(1)
  })

  it('una venta rápida normal (sin vendidoPorId) sigue igual: no exige repartidor', async () => {
    const r = await crear({ ...base(), canal: 'PUNTO', direccionEntrega: undefined, pagos: [{ metodo: 'EFECTIVO', monto: await totalDe([]) }] })
    expect(r.status).toBe(201)
    const id = (r.body.pedido?.id ?? r.body.id) as string
    expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).entregadoPorId).toBeNull()
  })
})
