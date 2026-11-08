// @tests #622 — detalle por pedido en «Ver entregas y cálculo»: nombres, parciales y pedidos que se completan otro día (Postgres real).
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
import { comisionDiaConEstado } from '@/lib/comision-pagada'
import { comisionRepartidoresDelDia, comisionDeEmbarque } from '@/lib/comision-repartidor'
import type { FuenteComision } from '@/lib/comision-repartidor-calculo'
import { startOfDayBogota } from '@/lib/dates'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE } from '@/lib/gestion-admin'

const TARIFA = 400
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const AYER = new Date(+startOfDayBogota(HOY) - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const PROMESA = new Date(+startOfDayBogota(HOY) + 3 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const key = () => `cd622-${randomUUID()}`
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


const detalleDe = async (trabajadorId: string, dia = HOY) => {
  const f = (await comisionRepartidoresDelDia(testPrisma, dia)).find(r => r.trabajadorId === trabajadorId)!
  return { ...f, pedidos: f.fuentes.flatMap(x => x.pedidos ?? []) }
}
const suma = (f: FuenteComision) => (f.pedidos ?? []).reduce((s, p) => s + p.unidades.agua + p.unidades.hielo + p.unidades.botellon, 0) +
  (f.sinPedido ? f.sinPedido.agua + f.sinPedido.hielo + f.sinPedido.botellon : 0)

describe('#622 — detalle por pedido de la comisión (Postgres y handlers reales)', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  afterAll(async () => { await disconnect() })
  beforeEach(async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
    await testPrisma.config.upsert({ where: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE },
      create: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE, valor: 'true' }, update: { valor: 'true' } })
  })

  it('parcial: pedido de 10 con 3 entregadas muestra 3 (no 10), pendiente 7 y el negocio primero con el cliente aparte', async () => {
    const r = await repartidor(), p = await pedido(10)
    const negocio = await testPrisma.negocio.create({ data: { nombre: `Hotel Sol ${key()}`, clienteId: p.clienteId } as never })
    await testPrisma.pedido.update({ where: { id: p.id }, data: { negocioId: negocio.id } })
    await entrega(p.id, r.id, 3)
    const d = await detalleDe(r.id)
    const fila = d.pedidos.find(x => x.id === p.id)!
    const cliente = await testPrisma.cliente.findUniqueOrThrow({ where: { id: p.clienteId } })
    expect(fila.unidades.agua).toBe(3)
    expect(fila.pedido.agua).toBe(10)
    expect(fila.entregadoActual.agua).toBe(3)
    expect(fila.detalle).toBe('POR_DIA')
    expect(fila.alDia?.agua).toBe(3)
    expect(fila.pendiente?.agua).toBe(7)
    expect(fila.completoAqui).toBe(false)
    expect(fila.nombre).toBe(negocio.nombre) // negocio primero
    expect(fila.cliente).toBe(cliente.nombre) // cliente como dato secundario
    expect(fila.href).toBe(`/pedidos/${p.id}`)
  })

  it('pedido sin negocio: el cliente es el nombre y no hay dato secundario', async () => {
    const r = await repartidor(), p = await pedido(4)
    await entrega(p.id, r.id, 4)
    const fila = (await detalleDe(r.id)).pedidos.find(x => x.id === p.id)!
    const cliente = await testPrisma.cliente.findUniqueOrThrow({ where: { id: p.clienteId } })
    expect(fila.nombre).toBe(cliente.nombre)
    expect(fila.cliente).toBeUndefined()
    expect(fila.completoAqui).toBe(true)
  })

  it('se completa otro día: ayer 5 y hoy 5 → hoy «completó aquí» con 10 de 10; el cierre de ayer sigue en 5 de 10 y avisa que se completó después', async () => {
    const r = await repartidor(), p = await pedido(10)
    await entrega(p.id, r.id, 5, AYER)
    await entrega(p.id, r.id, 5)
    const hoy = (await detalleDe(r.id)).pedidos.find(x => x.id === p.id)!
    expect(hoy.unidades.agua).toBe(5) // el dinero de hoy: solo lo de hoy
    expect(hoy.alDia?.agua).toBe(10)
    expect(hoy.pendiente?.agua).toBe(0)
    expect(hoy.completoAqui).toBe(true)
    expect(hoy.dias?.map(x => [x.dia, x.unidades.agua, x.propia])).toEqual([[AYER, 5, false], [HOY, 5, true]])
    expect(hoy.creadoDia).toBe(HOY) // creado hoy en la prueba; la fecha de creación no define la entrega

    const ayer = (await detalleDe(r.id, AYER)).pedidos.find(x => x.id === p.id)!
    expect(ayer.unidades.agua).toBe(5)
    expect(ayer.alDia?.agua).toBe(5)
    expect(ayer.pendiente?.agua).toBe(5)
    expect(ayer.completoAqui).toBe(false)
    expect(ayer.completadoDespues).toBe(HOY)
    expect(ayer.dias?.map(x => [x.dia, x.unidades.agua])).toEqual([[AYER, 5]]) // lo de hoy no se suma al día de ayer
  })

  it('dos personas el mismo día (dos embarques): cada una ve lo suyo y el acumulado a ese día suma a ambas', async () => {
    const a = await repartidor(), b = await repartidor(), p = await pedido(10)
    await testPrisma.pedidoItem.updateMany({ where: { pedidoId: p.id }, data: { cantEntrega: 7 } })
    const mision = async (trabajadorId: string, numeroDia: number, cantidad: number) => {
      const e = await testPrisma.embarque.create({ data: { trabajadorId, fecha: new Date(`${HOY}T08:00:00-05:00`), estado: 'CERRADO', numeroDia } })
      await testPrisma.embarqueMovimiento.create({ data: { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad, metadata: { captura: 'ENTREGA_PEDIDO', pedidoId: p.id } } })
    }
    await mision(a.id, 1, 3); await mision(b.id, 2, 4)
    const deA = (await detalleDe(a.id)).pedidos.find(x => x.id === p.id)!
    const deB = (await detalleDe(b.id)).pedidos.find(x => x.id === p.id)!
    expect(deA.unidades.agua).toBe(3)
    expect(deB.unidades.agua).toBe(4)
    expect(deA.detalle).toBe('POR_DIA')
    expect(deA.alDia?.agua).toBe(7)
    expect(deA.pendiente?.agua).toBe(3)
    expect(deA.dias?.filter(x => !x.propia).map(x => x.unidades.agua)).toEqual([4]) // lo de la otra persona, aparte
  })

  it('registro anterior sin entregas por día: no se inventa el reparto (HISTORICO) y el dinero no cambia', async () => {
    const r = await repartidor(), p = await legado(r.id, 6)
    const d = await detalleDe(r.id)
    const fila = d.pedidos.find(x => x.id === p.id)!
    expect(fila.detalle).toBe('HISTORICO')
    expect(fila.dias).toBeUndefined()
    expect(fila.unidades.agua).toBe(6)
    expect(fila.entregadoDia).toBe(HOY)
    expect(d.entregasAgua).toBe(6)
  })

  it('el detalle no cambia el dinero: mismas unidades y total con y sin detalle (día, cierre y nómina usan el mismo cálculo)', async () => {
    const r = await repartidor(), p1 = await pedido(10), p2 = await pedido(4)
    await entrega(p1.id, r.id, 3); await entrega(p2.id, r.id, 4)
    await legado(r.id, 2)
    const conDetalle = await detalleDe(r.id)
    const sinDetalle = await comisionDiaConEstado(testPrisma, HOY).then(x => x.find(f => f.trabajadorId === r.id)!)
    expect(conDetalle.entregasAgua).toBe(9)
    expect(sinDetalle.entregasAgua).toBe(conDetalle.entregasAgua)
    expect(sinDetalle.total).toBe(conDetalle.total)
    for (const f of conDetalle.fuentes) expect(suma(f), `fuente ${f.id}`).toBe(f.unidades.agua + f.unidades.hielo + f.unidades.botellon)
  })

  it('misión de embarque: pedidos con su nombre y las ventas en ruta aparte; la suma por pedido + sin pedido es exactamente la del embarque', async () => {
    const r = await repartidor(), p = await pedido(10)
    await testPrisma.pedidoItem.updateMany({ where: { pedidoId: p.id }, data: { cantEntrega: 4 } })
    const e = await testPrisma.embarque.create({ data: { trabajadorId: r.id, fecha: new Date(`${HOY}T08:00:00-05:00`), estado: 'CERRADO', numeroDia: 1 } })
    await testPrisma.embarqueMovimiento.createMany({ data: [
      { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 4, metadata: { captura: 'ENTREGA_PEDIDO', pedidoId: p.id } },
      { embarqueId: e.id, tipo: 'VENTA_RUTA', producto: 'PACA_AGUA', cantidad: 2 },
    ] })
    const f = (await detalleDe(r.id)).fuentes.find(x => x.id === e.id)!
    expect(f.unidades.agua).toBe(6)
    expect(f.pedidos).toHaveLength(1)
    expect(f.pedidos![0]).toMatchObject({ id: p.id, unidades: { agua: 4 }, pedido: { agua: 10 }, detalle: 'POR_DIA' })
    expect(f.pedidos![0].pendiente?.agua).toBe(6)
    expect(f.sinPedido?.agua).toBe(2)
    expect(suma(f)).toBe(6)
    // el cierre del embarque usa el mismo cálculo y trae el mismo detalle
    const alCerrar = await comisionDeEmbarque(testPrisma, e.id)
    expect(alCerrar.total).toBe(6 * TARIFA)
    expect(alCerrar.fuentes[0].pedidos).toHaveLength(1)
  })
})
