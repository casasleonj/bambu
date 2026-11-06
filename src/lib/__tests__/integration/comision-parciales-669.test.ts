// @tests #669 — unidades realmente entregadas, también parciales; mismo dinero en día, cierre y nómina.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { POST as entregar } from '@/app/api/pedidos/[id]/gestion-admin/entrega/route'
import { POST as pagar } from '@/app/api/nomina/dia/pagar/route'
import { POST as nomina } from '@/app/api/nomina/route'
import { comisionDiaConEstado, comisionesDelCierre } from '@/lib/comision-pagada'
import { startOfDayBogota, endOfDayBogota } from '@/lib/dates'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from '@/lib/gestion-admin'

const TARIFA = 400
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const AYER = new Date(+startOfDayBogota(HOY) - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const PROMESA = new Date(+startOfDayBogota(HOY) + 3 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const key = () => `cp669-${randomUUID()}`
let adminId: string

const req = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
async function repartidor() {
  return testPrisma.trabajador.create({ data: {
    nombre: `Repartidor sintético ${key()}`, rol: 'REPARTIDOR', usaMoto: true, tipoPago: 'COMISION', comRepartAgua: TARIFA,
  } })
}
type LineasPedido = Parameters<typeof crearPedidoUseCase.execute>[0]['items']
async function pedido(cantidad: number | LineasPedido, canal: 'DOMICILIO' | 'PUNTO' = 'DOMICILIO') {
  const cliente = await testPrisma.cliente.create({ data: {
    nombre: `Cliente sintético ${key()}`, telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'Dirección de prueba', barrio: 'Centro', activo: true, limitePedidosFiados: 20,
  } })
  const items: LineasPedido = typeof cantidad === 'number' ? [{ producto: 'PACA_AGUA', cantidad }] : cantidad
  return (await crearPedidoUseCase.execute({ clienteId: cliente.id, canal, origen: 'PEDIDO',
    items, pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: key(),
  })).pedido
}
async function entrega(id: string, trabajadorId: string, cantidad: number | { producto: string; cantidad: number }[], dia = HOY, offlineId = key()) {
  const itemsEntregados = typeof cantidad === 'number' ? [{ producto: 'PACA_AGUA', cantidad }] : cantidad
  const body = { repartidorId: trabajadorId, itemsEntregados,
    fechaEntrega: startOfDayBogota(dia).toISOString(), precisionFecha: 'DIA', promesaPagoFecha: PROMESA, offlineId }
  const res = await entregar(req(`/api/pedidos/${id}/gestion-admin/entrega`, body), { params: Promise.resolve({ id }) })
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(200)
  return { res, body }
}
async function legado(trabajadorId: string, cantidad: number) {
  const p = await pedido(cantidad)
  await testPrisma.pedido.update({ where: { id: p.id }, data: {
    estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', cPacaAguaEnt: cantidad,
    entregadoAt: startOfDayBogota(HOY), entregadoPorId: trabajadorId,
  } })
  await testPrisma.pedidoItem.updateMany({ where: { pedidoId: p.id }, data: { cantEntrega: cantidad } })
  return p
}
const fila = async (id: string, dia = HOY) => (await comisionDiaConEstado(testPrisma, dia)).find(r => r.trabajadorId === id)!

describe('#669 — comisión de parciales sin embarque (Postgres y handlers reales)', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  afterAll(async () => { await disconnect() })
  beforeEach(async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
    await testPrisma.config.upsert({ where: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE },
      create: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE, valor: 'true' }, update: { valor: 'true' } })
  })

  it('183 completas con auditoría + 20 completas anteriores + 3 de 5 = 206 en día, cierre y nómina', async () => {
    const r = await repartidor()
    const completo = await pedido(183)
    await entrega(completo.id, r.id, 183)
    await legado(r.id, 20)
    const parcial = await pedido(5)
    await entrega(parcial.id, r.id, 3)
    expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: parcial.id } })).estadoEntrega).toBe('PENDIENTE')

    const dia = await fila(r.id)
    expect(dia.entregasAgua).toBe(206)
    expect(dia.total).toBe(206 * TARIFA)
    expect(dia.revisiones).toEqual([])
    expect(dia.fuentes.find(f => f.id === parcial.id)).toMatchObject({ unidades: { agua: 3 }, href: `/pedidos/${parcial.id}` })
    const cierre = await comisionesDelCierre(testPrisma, HOY, startOfDayBogota(HOY), endOfDayBogota(HOY))
    expect(cierre.repartidores.find(f => f.trabajadorId === r.id)?.entregasAgua).toBe(206)
    expect(cierre.total).toBe(0) // Calcular una deuda no hace salir efectivo.
    const res = await nomina(req('/api/nomina', { trabajadorId: r.id, fechaInicio: HOY, fechaFin: HOY, tipoCalculo: 'AUTO' }))
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200)
    const n = await testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId: r.id } })
    expect(n.entregasAgua).toBe(206)
    expect(Number(n.totalComisiones)).toBe(206 * TARIFA)
  })

  it('al completar otro día conserva 3 ayer y solo 2 hoy; el acumulado de 5 no se vuelve a pagar', async () => {
    const r = await repartidor(), p = await pedido(5)
    await entrega(p.id, r.id, 3, AYER)
    expect((await fila(r.id, AYER)).entregasAgua).toBe(3)
    await entrega(p.id, r.id, 2)
    expect((await fila(r.id, AYER)).entregasAgua).toBe(3)
    expect((await fila(r.id)).entregasAgua).toBe(2)
  })

  it('si ya se pagaron 203, paga solo las 3 nuevas y un replay no crea un segundo egreso', async () => {
    const r = await repartidor()
    await legado(r.id, 203)
    const primero = await pagar(req('/api/nomina/dia/pagar', { trabajadorId: r.id, fecha: HOY, offlineId: key(), montoEsperado: 203 * TARIFA }))
    expect(primero.status, JSON.stringify(await primero.clone().json())).toBe(201)
    const p = await pedido(5)
    await entrega(p.id, r.id, 3)
    expect((await fila(r.id)).pendiente).toBe(3 * TARIFA)
    const viejo = await pagar(req('/api/nomina/dia/pagar', { trabajadorId: r.id, fecha: HOY, offlineId: key(), montoEsperado: 0 }))
    expect(viejo.status).toBe(409)
    expect((await viejo.json()).error.code).toBe('MONTO_CAMBIO')
    const body = { trabajadorId: r.id, fecha: HOY, offlineId: key(), montoEsperado: 3 * TARIFA }
    expect((await pagar(req('/api/nomina/dia/pagar', body))).status).toBe(201)
    const replay = await pagar(req('/api/nomina/dia/pagar', body))
    expect(replay.status).toBe(200)
    expect((await replay.json()).deduped).toBe(true)
    const pagos = await testPrisma.pagoComisionRepartidor.findMany({ where: { trabajadorId: r.id } })
    expect(pagos).toHaveLength(2)
    expect(pagos.reduce((s, p) => s + Number(p.monto), 0)).toBe(206 * TARIFA)
  })

  it('dos parciales del mismo día se suman una vez y reintentar la primera no duplica unidades', async () => {
    const r = await repartidor(), p = await pedido(7)
    const primera = await entrega(p.id, r.id, 3)
    await entrega(p.id, r.id, 2)
    const replay = await entregar(req(`/api/pedidos/${p.id}/gestion-admin/entrega`, primera.body), { params: Promise.resolve({ id: p.id }) })
    expect(replay.status).toBe(200)
    expect((await fila(r.id)).entregasAgua).toBe(5)
    expect((await fila(r.id)).fuentes.filter(f => f.id === p.id)).toHaveLength(1)
    expect((await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).cPacaAguaEnt).toBe(5)
  })

  it('la atribución del hecho prevalece sobre un responsable final distinto, sin trasladar todo el acumulado', async () => {
    const a = await repartidor(), b = await repartidor(), p = await pedido(5)
    await entrega(p.id, a.id, 3, AYER)
    // Simula una reasignación histórica: no habilita cambiar el responsable en la oficina.
    await testPrisma.pedido.update({ where: { id: p.id }, data: { entregadoPorId: b.id } })
    expect((await fila(a.id, AYER)).entregasAgua).toBe(3)
    expect((await fila(b.id, AYER)).entregasAgua).toBe(0)
  })

  it('punto, otro repartidor, anulados y cancelados no acreditan comisión al trabajador', async () => {
    const a = await repartidor(), b = await repartidor()
    const punto = await legado(a.id, 4)
    await testPrisma.pedido.update({ where: { id: punto.id }, data: { canal: 'PUNTO' } })
    const otro = await pedido(6)
    await entrega(otro.id, b.id, 6)
    for (const estado of ['ANULADO', 'CANCELADO'] as const) {
      const p = await pedido(5)
      await entrega(p.id, a.id, 3)
      await testPrisma.pedido.update({ where: { id: p.id }, data: { estado, estadoEntrega: estado, estadoPago: 'ANULADO' } })
    }
    expect((await fila(a.id)).entregasAgua).toBe(0)
    expect((await fila(b.id)).entregasAgua).toBe(6)
  })

  it('una entrega ya atribuida a embarque no se vuelve a acreditar al quedar sin embarque', async () => {
    const a = await repartidor(), b = await repartidor(), p = await pedido(5)
    await entrega(p.id, a.id, 3)
    const embarque = await testPrisma.embarque.create({ data: { trabajadorId: b.id, fecha: startOfDayBogota(HOY), estado: 'CERRADO' } })
    await testPrisma.embarqueMovimiento.create({ data: { embarqueId: embarque.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 3,
      metadata: { captura: 'ENTREGA_PEDIDO', pedidoId: p.id } } })
    expect((await fila(a.id)).entregasAgua).toBe(0)
    expect((await fila(a.id)).revisiones).not.toHaveLength(0)
    expect((await fila(b.id)).entregasAgua).toBe(3)
    expect((await fila(b.id)).revisiones).toEqual([])
  })

  it.each(['sin cantidades', 'sin responsable', 'fecha inválida', 'versión desconocida', 'JSON dañado', 'cantidades negativas'])(
    'captura moderna %s: no se disfraza de legado ni autoriza un pago/nómina', async caso => {
      const r = await repartidor(), p = await pedido(5)
      await entrega(p.id, r.id, 3)
      const h = await testPrisma.historial.findFirstOrThrow({ where: { entidad: 'Pedido', registroId: p.id, datos: { contains: 'consultaEntrega' } } })
      const datos = JSON.parse(h.datos) as { consultaEntrega: Record<string, unknown> }
      if (caso === 'sin cantidades') datos.consultaEntrega.cantidades = null
      if (caso === 'sin responsable') datos.consultaEntrega.repartidorId = null
      if (caso === 'fecha inválida') datos.consultaEntrega.fecha = 'fecha ilegible'
      if (caso === 'versión desconocida') datos.consultaEntrega.version = 99
      if (caso === 'cantidades negativas') datos.consultaEntrega.cantidades = [{ producto: 'PACA_AGUA', cantidad: -3 }]
      await testPrisma.historial.update({ where: { id: h.id }, data: {
        datos: caso === 'JSON dañado' ? '{"accion":"ENTREGA_OFICINA","consultaEntrega":' : JSON.stringify(datos),
      } })
      const d = await fila(r.id)
      expect(d.entregasAgua).toBe(0)
      expect(d.revisiones.length).toBeGreaterThan(0)
      const pago = await pagar(req('/api/nomina/dia/pagar', { trabajadorId: r.id, fecha: HOY, offlineId: key() }))
      expect(pago.status).toBe(409)
      expect((await pago.json()).error.code).toBe('COMISION_POR_CONCILIAR')
      const n = await nomina(req('/api/nomina', { trabajadorId: r.id, fechaInicio: HOY, fechaFin: HOY, tipoCalculo: 'AUTO' }))
      expect(n.status).toBe(409)
      expect((await n.json()).error.code).toBe('COMISION_POR_CONCILIAR')
      expect(await testPrisma.pagoComisionRepartidor.count({ where: { trabajadorId: r.id } })).toBe(0)
    },
  )

  it('un parcial antiguo sin evidencia de cantidades no se reparte por suposición; los demás pueden cobrar', async () => {
    const a = await repartidor(), p = await legado(a.id, 5)
    await testPrisma.pedido.update({ where: { id: p.id }, data: { estado: 'PENDIENTE', estadoEntrega: 'PENDIENTE', cPacaAguaEnt: 3 } })
    await testPrisma.pedidoItem.updateMany({ where: { pedidoId: p.id }, data: { cantEntrega: 3 } })
    expect((await fila(a.id)).entregasAgua).toBe(0)
    expect((await fila(a.id)).revisiones.length).toBeGreaterThan(0)
    const b = await repartidor(), propio = await pedido(4)
    await entrega(propio.id, b.id, 2)
    const pago = await pagar(req('/api/nomina/dia/pagar', { trabajadorId: b.id, fecha: HOY, offlineId: key(), montoEsperado: 2 * TARIFA }))
    expect(pago.status).toBe(201)
  })

  it('apagar la gestión directa no borra las entregas que ya fueron registradas', async () => {
    const r = await repartidor(), p = await pedido(5)
    await entrega(p.id, r.id, 3)
    await testPrisma.config.update({ where: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE }, data: { valor: 'false' } })
    expect((await fila(r.id)).entregasAgua).toBe(3)
  })

  it('cada producto usa sus unidades parciales y su tarifa de reparto, no lo pedido ni el precio de venta', async () => {
    const r = await repartidor()
    await testPrisma.trabajador.update({ where: { id: r.id }, data: { comRepartHielo: 250, comRepartBotellon: 300 } })
    const p = await pedido([{ producto: 'PACA_AGUA', cantidad: 5 }, { producto: 'PACA_HIELO', cantidad: 4 }, { producto: 'BOTELLON', cantidad: 2 }])
    await entrega(p.id, r.id, [{ producto: 'PACA_AGUA', cantidad: 3 }, { producto: 'PACA_HIELO', cantidad: 2 }, { producto: 'BOTELLON', cantidad: 1 }])
    expect(await fila(r.id)).toMatchObject({ entregasAgua: 3, entregasHielo: 2, entregasBotellon: 1,
      comAgua: 1200, comHielo: 500, comBotellon: 300, total: 2000, revisiones: [] })
  })
})
