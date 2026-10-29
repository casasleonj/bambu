// @tests #472 — TEMPORAL-SIN-EMBARQUE: la nómina cuenta como comisión las entregas
// a domicilio que la oficina registró sin embarque (Postgres real, handlers REALES:
// la entrega de oficina y la nómina AUTO). Cada prueba mira la fila de Nomina en la
// base: cuánto se pagó, no solo que la ruta respondió 200.

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
import { POST as crearNomina } from '@/app/api/nomina/route'
import { comisionRepartidoresDelDia } from '@/lib/comision-repartidor'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from '@/lib/gestion-admin'

const TARIFA_AGUA = 400

let adminId: string
let clienteId: string

const unico = () => `nc-${randomUUID()}`
const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const diaBogota = (dias: number) => new Date(Date.now() - dias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

async function nuevoRepartidor(nombre: string, tipoPago: 'COMISION' | 'MIXTO' | 'FIJO' = 'COMISION') {
  return (await testPrisma.trabajador.create({
    data: { nombre, rol: 'REPARTIDOR', usaMoto: true, tipoPago, comRepartAgua: TARIFA_AGUA },
  })).id
}

async function crearPedido(o: { canal?: 'DOMICILIO' | 'PUNTO'; cant?: number } = {}) {
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId,
    canal: o.canal ?? 'DOMICILIO',
    origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: o.cant ?? 10 }],
    pagos: [],
    createdById: adminId,
    createdByRole: 'ADMIN',
    offlineId: unico(),
  })
  return pedido.id
}

/** Entrega por la ruta REAL de oficina (completa, queda fiado con promesa). */
async function entregarDesdeOficina(pedidoId: string, repartidorId: string, cant = 10) {
  const req = new NextRequest(`http://localhost/api/pedidos/${pedidoId}/gestion-admin/entrega`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offlineId: unico(),
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: cant }],
      repartidorId,
      promesaPagoFecha: diaBogota(-3),
    }),
  })
  const res = await entregaOficina(req, { params: Promise.resolve({ id: pedidoId }) })
  expect(res.status).toBe(200)
}

async function nominaAuto(trabajadorId: string) {
  const req = new NextRequest('http://localhost/api/nomina', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trabajadorId, fechaInicio: diaBogota(3), fechaFin: hoyBogota(), tipoCalculo: 'AUTO' }),
  })
  const res = await crearNomina(req)
  expect(res.status).toBe(200)
  return testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId, estado: { not: 'ANULADA' } } })
}

describe('#472 — comisión de nómina por entregas sin embarque (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Nómina', telefono: '3001230002', direccion: 'Calle 1 # 2-3', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
    })).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
    await testPrisma.config.upsert({
      where: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE },
      create: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE, valor: 'true' },
      update: { valor: 'true' },
    })
  })

  it('una entrega a domicilio registrada por la oficina paga comisión a su repartidor', async () => {
    const repartidorId = await nuevoRepartidor('Andrés Nómina')
    const id = await crearPedido({ cant: 10 })
    await entregarDesdeOficina(id, repartidorId, 10)

    const n = await nominaAuto(repartidorId)
    expect(n.entregasAgua).toBe(10)
    expect(Number(n.comEntregasAgua)).toBe(10 * TARIFA_AGUA)
    expect(Number(n.totalComisiones)).toBe(10 * TARIFA_AGUA)
  })

  it('no suma dos veces: un pedido de un embarque cerrado cuenta por el embarque, y el de la oficina aparte', async () => {
    const repartidorId = await nuevoRepartidor('Camilo Nómina')

    // Pedido entregado dentro de un embarque CERRADO del mismo repartidor.
    const dentro = await crearPedido({ cant: 5 })
    const emb = await testPrisma.embarque.create({ data: { trabajadorId: repartidorId, fecha: new Date(), estado: 'CERRADO' } })
    await testPrisma.pedido.update({
      where: { id: dentro },
      data: { embarqueId: emb.id, estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', cPacaAguaEnt: 5, entregadoAt: new Date(), entregadoPorId: repartidorId },
    })
    // Pedido entregado desde la oficina (sin embarque).
    const fuera = await crearPedido({ cant: 3 })
    await entregarDesdeOficina(fuera, repartidorId, 3)

    const n = await nominaAuto(repartidorId)
    expect(n.entregasAgua).toBe(5 + 3) // 5 por el embarque (una sola vez), 3 por la oficina
    expect(Number(n.totalComisiones)).toBe(8 * TARIFA_AGUA)
  })

  it('no cuenta: punto, entrega parcial, otro repartidor, fuera del período ni anulados', async () => {
    const repartidorId = await nuevoRepartidor('Diego Nómina')
    const otroId = await nuevoRepartidor('Esteban Nómina')

    const punto = await crearPedido({ canal: 'PUNTO', cant: 2 })
    await testPrisma.pedido.update({
      where: { id: punto },
      data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', cPacaAguaEnt: 2, entregadoAt: new Date(), entregadoPorId: repartidorId },
    })

    const parcial = await crearPedido({ cant: 10 })
    await entregarDesdeOficina(parcial, repartidorId, 4) // queda PENDIENTE: aún no es una entrega completa
    expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: parcial } })).estadoEntrega).not.toBe('ENTREGADO')

    const deOtro = await crearPedido({ cant: 6 })
    await entregarDesdeOficina(deOtro, otroId, 6)

    const viejo = await crearPedido({ cant: 7 })
    await entregarDesdeOficina(viejo, repartidorId, 7)
    await testPrisma.pedido.update({ where: { id: viejo }, data: { entregadoAt: new Date(Date.now() - 20 * 86_400_000) } })

    const anulado = await crearPedido({ cant: 8 })
    await entregarDesdeOficina(anulado, repartidorId, 8)
    await testPrisma.pedido.update({ where: { id: anulado }, data: { estadoEntrega: 'ANULADO', estado: 'ANULADO', estadoPago: 'ANULADO' } })

    const n = await nominaAuto(repartidorId)
    expect(n.entregasAgua).toBe(0)
    expect(Number(n.totalComisiones)).toBe(0)
  })

  it('un trabajador sin comisión (pago fijo) no cobra por entregas, también sin embarque', async () => {
    const repartidorId = await nuevoRepartidor('Fabián Nómina', 'FIJO')
    const id = await crearPedido({ cant: 10 })
    await entregarDesdeOficina(id, repartidorId, 10)

    const n = await nominaAuto(repartidorId)
    expect(n.entregasAgua).toBe(0)
    expect(Number(n.totalComisiones)).toBe(0)
  })
  it('la oficina ya fija al responsable: rechaza cambiarlo durante un parcial y no atribuye comisión al segundo', async () => {
    const a = await nuevoRepartidor('Oficina parcial A')
    const b = await nuevoRepartidor('Oficina parcial B')
    const id = await crearPedido({ cant: 5 })
    await entregarDesdeOficina(id, a, 3)
    const rechazada = await entregaOficina(new NextRequest(`http://localhost/api/pedidos/${id}/gestion-admin/entrega`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offlineId: unico(), itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 2 }], repartidorId: b, promesaPagoFecha: diaBogota(-3) }),
    }), { params: Promise.resolve({ id }) })
    expect(rechazada.status).toBe(409)
    const parcial = await testPrisma.pedido.findUniqueOrThrow({ where: { id } })
    expect(parcial.cPacaAguaEnt).toBe(3)
    expect(parcial.entregadoPorId).toBe(a)
    await entregarDesdeOficina(id, a, 2)
    const filas = await comisionRepartidoresDelDia(testPrisma, hoyBogota())
    expect(filas.find(r => r.trabajadorId === a)?.total).toBe(5 * TARIFA_AGUA)
    expect(filas.find(r => r.trabajadorId === b)?.total).toBe(0)
    const eventos = await testPrisma.historial.findMany({ where: { entidad: 'Pedido', registroId: id, accion: 'UPDATE' } })
    expect(eventos.map(e => JSON.parse(e.datos)).filter(e => e.accion === 'ENTREGA_OFICINA').map(e => e.repartidorId)).toEqual([a, a])
  })
})
