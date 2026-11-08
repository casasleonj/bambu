// @tests #408 — aviso (no bloqueo) de venta repetida: mismo cliente, mismos productos y mismo total en pocos
// segundos. Postgres real, casos de uso reales; cada prueba mira la base de datos.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'

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
import { crearPedidoUseCase, previewPedidoUseCase } from '@/modules/pedidos'
import { buscarVentaRepetida } from '@/lib/venta-repetida'
import { POST as crearPedidoRoute } from '@/app/api/pedidos/route'

let adminId: string
let clienteId: string
const unico = () => `vr-${randomUUID()}`

async function vender(cantidad: number, offlineId = unico(), cliente = clienteId) {
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId: cliente, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad }], pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId,
  })
  return { id: pedido.id, offlineId }
}
const items = (cantidad: number) => [{ producto: 'PACA_AGUA', cantidad }]
const totalDe = async (id: string) => Number((await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).total)
const numeroDe = async (id: string) => (await testPrisma.pedido.findUniqueOrThrow({ where: { id } })).numero

describe('#408 — aviso de venta repetida (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Repetida', telefono: '3001230408', direccion: 'Calle 1 # 2-3', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
    })).id
  })
  afterAll(async () => { await disconnect() })

  it('avisa cuando hay una venta igual de hace pocos segundos, con su número y antigüedad', async () => {
    const v = await vender(10)
    const total = await totalDe(v.id)
    const r = await buscarVentaRepetida({ clienteId, items: items(10), total, ventanaSeg: 60 })
    expect(r).not.toBeNull()
    expect(r!.numero).toBe(await numeroDe(v.id))
    expect(r!.haceSegundos).toBeLessThan(60)
  })

  it('no avisa si cambia la cantidad, el total, el cliente o ya pasó la ventana', async () => {
    const v = await vender(7)
    const total = await totalDe(v.id)
    expect(await buscarVentaRepetida({ clienteId, items: items(8), total, ventanaSeg: 60 })).toBeNull()
    expect(await buscarVentaRepetida({ clienteId, items: items(7), total: total + 100, ventanaSeg: 60 })).toBeNull()
    expect(await buscarVentaRepetida({ clienteId: 'CONSUMIDOR_FINAL', items: items(7), total, ventanaSeg: 60 })).toBeNull()
    expect(await buscarVentaRepetida({ clienteId, items: items(7), total, ventanaSeg: 60, ahora: new Date(Date.now() + 120_000) })).toBeNull()
  })

  it('con ventana 0 el aviso está apagado', async () => {
    const v = await vender(6)
    expect(await buscarVentaRepetida({ clienteId, items: items(6), total: await totalDe(v.id), ventanaSeg: 0 })).toBeNull()
  })

  it('el reintento del MISMO borrador (misma clave) no se avisa como repetida', async () => {
    const v = await vender(5)
    const total = await totalDe(v.id)
    expect(await buscarVentaRepetida({ clienteId, items: items(5), total, ventanaSeg: 60, offlineId: v.offlineId })).toBeNull()
    expect(await buscarVentaRepetida({ clienteId, items: items(5), total, ventanaSeg: 60, offlineId: unico() })).not.toBeNull()
  })

  it('una venta anulada no cuenta como repetida', async () => {
    const v = await vender(4)
    const total = await totalDe(v.id)
    await testPrisma.pedido.update({ where: { id: v.id }, data: { estadoEntrega: 'ANULADO', estado: 'ANULADO', estadoPago: 'ANULADO' } })
    expect(await buscarVentaRepetida({ clienteId, items: items(4), total, ventanaSeg: 60 })).toBeNull()
  })

  it('el preview real emite el aviso (sin bloquear) y lo omite para el mismo borrador', async () => {
    const v = await vender(3)
    const pedido = { clienteId, canal: 'DOMICILIO' as const, origen: 'PEDIDO' as const, items: [{ producto: 'PACA_AGUA' as const, cantidad: 3 }], actorId: adminId }
    const con = await previewPedidoUseCase.execute(pedido)
    expect(con.warnings.map((w) => w.code)).toContain('VENTA_POSIBLE_DUPLICADA')
    expect(con.ventaRepetida?.numero).toBe(await numeroDe(v.id))
    expect(con.permissions.canCreate).toBe(true) // aviso, nunca bloqueo
    const mismoBorrador = await previewPedidoUseCase.execute({ ...pedido, borradorId: v.offlineId })
    expect(mismoBorrador.warnings.map((w) => w.code)).not.toContain('VENTA_POSIBLE_DUPLICADA')
    const otra = await previewPedidoUseCase.execute({ ...pedido, items: [{ producto: 'PACA_AGUA' as const, cantidad: 2 }] })
    expect(otra.warnings.map((w) => w.code)).not.toContain('VENTA_POSIBLE_DUPLICADA')
  })

  it('al guardar una venta con la advertencia confirmada, la confirmación queda en el historial', async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
    await vender(9)
    const crear = (extra: Record<string, unknown>) => crearPedidoRoute(new NextRequest('http://localhost/api/pedidos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 9 }], offlineId: unico(), ...extra }),
    }))
    const confirmada = await crear({ ventaRepetidaConfirmada: true })
    expect(confirmada.status).toBe(201)
    const idConfirmada = (await confirmada.json()).pedido.id as string
    const sinConfirmar = await crear({})
    expect(sinConfirmar.status).toBe(201) // el aviso nunca bloquea
    const idSin = (await sinConfirmar.json()).pedido.id as string
    const filas = await testPrisma.historial.findMany({ where: { entidad: 'Pedido', registroId: { in: [idConfirmada, idSin] }, datos: { contains: 'VENTA_REPETIDA_CONFIRMADA' } } })
    expect(filas.map((f) => f.registroId)).toEqual([idConfirmada])
  })
})
