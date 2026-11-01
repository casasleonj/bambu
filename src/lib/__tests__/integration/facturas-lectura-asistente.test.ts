// @tests #556 — el ASISTENTE lee facturas (decisión del PO, 2026-11-01): navegación y API dicen lo mismo.
// Postgres real, handlers REALES. La lectura es de ADMIN, CONTADOR y ASISTENTE; crear una factura
// (POST) sigue siendo solo ADMIN/CONTADOR y el REPARTIDOR no lee nada.

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
import { GET as listar, POST as crear } from '@/app/api/facturas/route'
import { GET as leer } from '@/app/api/facturas/[id]/route'
import { GET as buscar } from '@/app/api/facturas/buscar/route'
import { crearPedidoUseCase } from '@/modules/pedidos'

let adminId: string
let facturaId: string
let nombreCliente: string

function sesion(role: string) {
  mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
}
const get = (url: string) => new NextRequest(`http://localhost${url}`)

describe('#556 — lectura de facturas por rol (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    nombreCliente = `Facturas Asistente ${randomUUID().slice(0, 6)}`
    const cliente = await testPrisma.cliente.create({
      data: { nombre: nombreCliente, telefono: `3${Math.floor(Math.random() * 1e9)}`, direccion: 'Calle 1', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
    })
    const { pedido } = await crearPedidoUseCase.execute({
      clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }], pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: `fa-${randomUUID()}`,
    })
    const factura = await testPrisma.factura.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    facturaId = factura.id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => sesion('ADMIN'))

  for (const rol of ['ADMIN', 'CONTADOR', 'ASISTENTE'] as const) {
    it(`${rol}: lista, lee por id y busca facturas (200)`, async () => {
      sesion(rol)
      const lista = await listar(get('/api/facturas?all=true'))
      expect(lista.status).toBe(200)
      const una = await leer(get(`/api/facturas/${facturaId}`), { params: Promise.resolve({ id: facturaId }) })
      expect(una.status).toBe(200)
      expect(((await una.json()) as { factura?: { id: string } }).factura?.id ?? facturaId).toBe(facturaId)
      const res = await buscar(get(`/api/facturas/buscar?q=${encodeURIComponent(nombreCliente.slice(0, 12))}`))
      expect(res.status).toBe(200)
    })
  }

  it('REPARTIDOR no lee facturas (403 en los tres)', async () => {
    sesion('REPARTIDOR')
    expect((await listar(get('/api/facturas'))).status).toBe(403)
    expect((await leer(get(`/api/facturas/${facturaId}`), { params: Promise.resolve({ id: facturaId }) })).status).toBe(403)
    expect((await buscar(get('/api/facturas/buscar?q=abc'))).status).toBe(403)
  })

  it('el ASISTENTE no puede CREAR facturas: el POST sigue siendo solo ADMIN/CONTADOR', async () => {
    sesion('ASISTENTE')
    const antes = await testPrisma.factura.count()
    const req = new NextRequest('http://localhost/api/facturas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoId: 'x', clienteId: 'x' }),
    })
    expect((await crear(req)).status).toBe(403)
    expect(await testPrisma.factura.count()).toBe(antes)
  })
})
