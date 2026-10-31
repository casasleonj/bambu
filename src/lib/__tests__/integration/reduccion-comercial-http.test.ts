// @tests #451 / ADR-REDUCCION-COMERCIAL-001 — rutas HTTP reales de la reducción comercial
// y del permiso por usuario (Postgres real, handlers reales).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
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

import { testPrisma, resetAndSeed, disconnect, getSeededCliente, uniqueId } from './setup'
import { POST as reducir } from '@/app/api/pedidos/[id]/reducir-pedido/route'
import { GET as listar } from '@/app/api/pedidos/[id]/reducciones-comerciales/route'
import { PATCH as resolverRuta } from '@/app/api/pedidos/reducciones-comerciales/[id]/route'
import { PUT as actualizarUsuario } from '@/app/api/users/[id]/route'

type Rol = 'ADMIN' | 'ASISTENTE' | 'REPARTIDOR' | 'CONTADOR'
type Cuerpo = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const ids: Record<string, string> = {}
let clienteId: string

function sesion(username: string, role: Rol) {
  mockAuth.mockResolvedValue({ user: { id: ids[username], role }, expires: '2099-01-01T00:00:00.000Z' })
}

async function crearPedido() {
  const p = await testPrisma.pedido.create({
    data: {
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PENDIENTE',
      total: 50000, totalPagado: 0, saldo: 50000, cPacaAguaPed: 20, cPacaAguaEnt: 15, precioPacaAgua: 2500,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 15, precio: 2500, subtotal: 50000 }] },
    },
  })
  await testPrisma.factura.create({
    data: { numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId, pedidoId: p.id, subtotal: 50000, total: 50000, saldo: 50000, estado: 'EMITIDA' },
  })
  return p.id
}

const cuerpo = { producto: 'PACA_AGUA', cantidadReducida: 5, motivo: 'ya no quiere el resto', aceptadoPor: 'Don Pedro', medio: 'TELEFONO' }

async function post(pedidoId: string, extra: Cuerpo = {}) {
  const req = new NextRequest(`http://localhost/api/pedidos/${pedidoId}/reducir-pedido`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cuerpo, ...extra }),
  })
  const res = await reducir(req, { params: Promise.resolve({ id: pedidoId }) })
  return { status: res.status, body: (await res.json()) as Cuerpo }
}
async function patch(id: string, b: Cuerpo) {
  const req = new NextRequest(`http://localhost/api/pedidos/reducciones-comerciales/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  })
  const res = await resolverRuta(req, { params: Promise.resolve({ id }) })
  return { status: res.status, body: (await res.json()) as Cuerpo }
}
async function get(pedidoId: string) {
  const res = await listar(new NextRequest(`http://localhost/api/pedidos/${pedidoId}/reducciones-comerciales`), { params: Promise.resolve({ id: pedidoId }) })
  return { status: res.status, body: (await res.json()) as Cuerpo }
}
async function putUsuario(id: string, b: Cuerpo) {
  const req = new NextRequest(`http://localhost/api/users/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  })
  const res = await actualizarUsuario(req, { params: Promise.resolve({ id }) })
  return { status: res.status, body: (await res.json()) as Cuerpo }
}

describe('Reducción comercial — HTTP (#451)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    for (const username of ['admin', 'asistente', 'repartidor', 'contador']) {
      ids[username] = (await testPrisma.user.findUniqueOrThrow({ where: { username } })).id
    }
    clienteId = (await getSeededCliente()).id
  })
  afterAll(async () => {
    await disconnect()
  })

  it('sin sesión → 401', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await post(await crearPedido())).status).toBe(401)
  })

  it('REPARTIDOR y CONTADOR no pueden registrar (403)', async () => {
    const id = await crearPedido()
    sesion('repartidor', 'REPARTIDOR')
    expect((await post(id)).status).toBe(403)
    sesion('contador', 'CONTADOR')
    expect((await post(id)).status).toBe(403)
  })

  it('valida el cuerpo: medio inválido y cantidad no entera → 400', async () => {
    const id = await crearPedido()
    sesion('admin', 'ADMIN')
    expect((await post(id, { medio: 'SEÑAL_DE_HUMO' })).status).toBe(400)
    expect((await post(id, { cantidadReducida: 1.5 })).status).toBe(400)
  })

  it('flujo completo: ASISTENTE solicita (201 PENDIENTE) → ADMIN sin permiso no autoriza (403) → con permiso aplica', async () => {
    const id = await crearPedido()
    sesion('asistente', 'ASISTENTE')
    const s = await post(id)
    expect(s.status).toBe(201)
    expect(s.body).toMatchObject({ estado: 'PENDIENTE', monto: 12500, deduped: false })
    expect(Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).total)).toBe(50000)

    sesion('admin', 'ADMIN')
    const sinPermiso = await patch(s.body.id, { resolucion: 'AUTORIZAR' })
    expect(sinPermiso.status).toBe(403)

    await testPrisma.user.update({ where: { id: ids.admin }, data: { puedeAutorizarReduccionComercial: true } })
    const ok = await patch(s.body.id, { resolucion: 'AUTORIZAR', nota: 'confirmado' })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ estado: 'APLICADA', totalAntes: 50000, totalDespues: 37500 })
    expect(Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).total)).toBe(37500)

    const lista = await get(id)
    expect(lista.status).toBe(200)
    expect(lista.body.puedeAutorizar).toBe(true)
    expect(lista.body.reducciones).toHaveLength(1)
    expect(lista.body.reducciones[0]).toMatchObject({ estado: 'APLICADA', monto: 12500, notaCredito: { numero: expect.stringMatching(/^NC-/) } })
  })

  it('GET informa puedeAutorizar=false a quien no tiene el permiso', async () => {
    const id = await crearPedido()
    sesion('asistente', 'ASISTENTE')
    expect((await get(id)).body.puedeAutorizar).toBe(false)
  })

  it('pagó de más → 422 con código; sobre lo entregado → 409; reintento con el mismo offlineId → 200 deduped', async () => {
    sesion('admin', 'ADMIN')
    const pagado = await crearPedido()
    await testPrisma.pedido.update({ where: { id: pagado }, data: { totalPagado: 40000, saldo: 10000, estadoPago: 'PARCIAL' } })
    const r = await post(pagado)
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('REDUCCION_GENERARIA_SOBREPAGO')

    const id = await crearPedido()
    expect((await post(id, { cantidadReducida: 6 })).status).toBe(409)

    const offlineId = randomUUID()
    const a = await post(id, { offlineId })
    const b = await post(id, { offlineId })
    expect(a.status).toBe(201)
    expect(b.status).toBe(200)
    expect(b.body).toMatchObject({ deduped: true, id: a.body.id })
  })

  describe('permiso por usuario en PUT /api/users/[id]', () => {
    it('solo ADMIN edita usuarios (un ASISTENTE no se da el permiso solo)', async () => {
      sesion('asistente', 'ASISTENTE')
      expect((await putUsuario(ids.asistente, { puedeAutorizarReduccionComercial: true })).status).toBe(403)
    })

    it('lo recibe un ASISTENTE y se guarda', async () => {
      sesion('admin', 'ADMIN')
      const r = await putUsuario(ids.asistente, { puedeAutorizarReduccionComercial: true })
      expect(r.status).toBe(200)
      expect((await testPrisma.user.findUniqueOrThrow({ where: { id: ids.asistente } })).puedeAutorizarReduccionComercial).toBe(true)
    })

    it('no se le puede dar a un REPARTIDOR (409) y no queda guardado', async () => {
      sesion('admin', 'ADMIN')
      const r = await putUsuario(ids.repartidor, { puedeAutorizarReduccionComercial: true })
      expect(r.status).toBe(409)
      expect((await testPrisma.user.findUniqueOrThrow({ where: { id: ids.repartidor } })).puedeAutorizarReduccionComercial).toBe(false)
    })

    it('cambiar a un rol sin derecho le quita el permiso', async () => {
      sesion('admin', 'ADMIN')
      await putUsuario(ids.asistente, { puedeAutorizarReduccionComercial: true })
      const r = await putUsuario(ids.asistente, { rol: 'CONTADOR' })
      expect(r.status).toBe(200)
      const u = await testPrisma.user.findUniqueOrThrow({ where: { id: ids.asistente } })
      expect(u).toMatchObject({ rol: 'CONTADOR', puedeAutorizarReduccionComercial: false })
      await testPrisma.user.update({ where: { id: ids.asistente }, data: { rol: 'ASISTENTE' } })
    })

    it('quitarlo a todos es válido: las solicitudes simplemente quedan pendientes', async () => {
      sesion('admin', 'ADMIN')
      const r = await putUsuario(ids.admin, { puedeAutorizarReduccionComercial: false })
      expect(r.status).toBe(200)
    })
  })
})
