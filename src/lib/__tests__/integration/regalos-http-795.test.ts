import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'

const auth = vi.hoisted(() => ({ user: { id: '', role: 'ADMIN' } }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => ({ ...auth, expires: '2099-01-01T00:00:00Z' })) }))
vi.mock('next/cache', () => ({ unstable_cache: <Args extends unknown[], Result>(fn: (...args: Args) => Result) => fn, revalidateTag: vi.fn() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { POST as crear } from '@/app/api/pedidos/route'
import { POST as preview } from '@/app/api/pedidos/preview/route'
import { POST as entregar } from '@/app/api/pedidos/[id]/gestion-admin/entrega/route'
import { PUT as editar } from '@/app/api/pedidos/[id]/route'

const request = (path: string, body: unknown, method = 'POST') => new NextRequest(`http://localhost/api/${path}`, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

describe('#795 · adaptadores HTTP y autoridad de sesión real', () => {
  let adminId: string, clienteId: string
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    auth.user.id = adminId
    clienteId = (await db.cliente.create({ data: { nombre: 'Prueba HTTP regalos', telefono: randomUUID() } })).id
    await db.config.upsert({ where: { clave: 'GESTION_ADMIN_SIN_EMBARQUE' }, create: { clave: 'GESTION_ADMIN_SIN_EMBARQUE', valor: 'true' }, update: { valor: 'true' } })
  })
  afterAll(disconnect)
  const items = [{ producto: 'PACA_AGUA', cantidad: 60, cantidadRegalo: 3, precioManual: 2300 }]
  it('el servidor ignora autor y fecha falsificados; la captura mínima no exige otro formulario', async () => {
    const body = { clienteId, canal: 'PUNTO', items: [{ ...items[0], regaloAutorizadoPorId: 'falso', regaloAutorizadoEn: '2000-01-01' }], offlineId: randomUUID() }
    const resPreview = await preview(request('pedidos/preview', body))
    expect(resPreview.status).toBe(200)
    expect((await resPreview.json()).permissions.canCreate).toBe(true)
    const res = await crear(request('pedidos', body))
    expect(res.status).toBe(201)
    const data = await res.json() as { pedido: { id: string; total: number; items: Array<{ cantRegaloPedido: number }> } }
    expect(data.pedido.total).toBe(138000)
    expect(data.pedido.items[0].cantRegaloPedido).toBe(3)
    const fila = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: data.pedido.id } })
    expect(fila.regaloAutorizadoPorId).toBe(adminId)
    expect(fila.regaloAutorizadoEn?.getUTCFullYear()).toBe(2026)
    expect(fila.regaloMotivo).toContain('sin motivo adicional declarado')
    const edit = await editar(request(`pedidos/${data.pedido.id}`, { items: [{ ...items[0], cantidadRegalo: 4 }] }, 'PUT'), { params: Promise.resolve({ id: data.pedido.id }) })
    expect(edit.status).toBe(200)
    expect((await db.pedidoItem.findUniqueOrThrow({ where: { id: fila.id } })).cantRegaloPedido).toBe(4)
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const delivery = await entregar(request(`pedidos/${data.pedido.id}/gestion-admin/entrega`, {
      offlineId: randomUUID(), itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10, cantidadRegalo: 1 }], promesaPagoFecha: fecha,
    }), { params: Promise.resolve({ id: data.pedido.id }) })
    expect(delivery.status).toBe(200)
    const parcial = await db.pedidoItem.findUniqueOrThrow({ where: { id: fila.id } })
    expect([parcial.cantEntrega, parcial.cantRegaloEntrega]).toEqual([10, 1])
  })
  it('un ASISTENTE no se vuelve ADMIN escribiendo un rol o autorizador en el cuerpo', async () => {
    auth.user.role = 'ASISTENTE'
    try {
      const offlineId = randomUUID(), body = { clienteId, canal: 'PUNTO', items, offlineId, createdByRole: 'ADMIN', actorRol: 'ADMIN', regaloAutorizadoPorId: adminId }
      const pre = await preview(request('pedidos/preview', body))
      expect(pre.status).toBe(200)
      expect((await pre.json()).permissions.canCreate).toBe(false)
      const res = await crear(request('pedidos', body))
      expect(res.status).toBe(403)
      expect(await db.pedido.count({ where: { offlineId } })).toBe(0)
    } finally { auth.user.role = 'ADMIN' }
  })
})
