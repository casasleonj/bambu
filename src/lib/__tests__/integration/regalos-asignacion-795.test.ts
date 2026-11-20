import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testPrisma as db, resetAndSeed, disconnect, getAdminUser } from './setup'

const sesion = vi.hoisted(() => ({ id: '' }))
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: sesion.id, role: 'ADMIN' } })),
  requireRole: vi.fn(async () => ({ user: { id: sesion.id, role: 'ADMIN' } })),
  requireOwnership: vi.fn(async () => true),
}))
vi.mock('next/cache', () => ({ unstable_cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { crearPedidoUseCase, entregarPedidoUseCase } from '@/modules/pedidos'
import { POST as enviar } from '@/app/api/pedidos/[id]/enviar/route'
import { PUT as asignarBloque } from '@/app/api/embarques/[id]/route'

describe('#795 · enviar al embarque usa peso físico pendiente y capacidad serializada', () => {
  beforeAll(async () => { await resetAndSeed(); sesion.id = (await getAdminUser()).id })
  afterAll(disconnect)
  async function pedido(cantidad = 60, cantidadRegalo = 3) {
    const cliente = await db.cliente.create({ data: { nombre: 'Cliente sintético de carga', telefono: randomUUID(), direccion: 'Dirección sintética', barrio: 'Centro' } })
    return (await crearPedidoUseCase.execute({ clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      createdById: sesion.id, createdByRole: 'ADMIN', offlineId: randomUUID(),
      items: [{ producto: 'PACA_AGUA', cantidad, cantidadRegalo, precioManual: 2300 }] })).pedido
  }
  async function mision(capacidadKg: number) {
    const trabajador = await db.trabajador.create({ data: { nombre: 'Repartidor sintético de carga', rol: 'REPARTIDOR', usaMoto: true, capacidadKg } })
    return db.embarque.create({ data: { trabajadorId: trabajador.id, fecha: new Date(), estado: 'ABIERTO' } })
  }
  const asignar = (pedidoId: string, embarqueId: string, offlineId = randomUUID()) => enviar(new NextRequest(`http://localhost/api/pedidos/${pedidoId}/enviar`, {
    method: 'POST', body: JSON.stringify({ embarqueId, offlineId }),
  }), { params: Promise.resolve({ id: pedidoId }) })
  const bloque = (pedidoIds: string[], embarqueId: string) => asignarBloque(new NextRequest(`http://localhost/api/embarques/${embarqueId}`, {
    method: 'PUT', body: JSON.stringify({ pedidoIds, offlineId: randomUUID() }),
  }), { params: Promise.resolve({ id: embarqueId }) })

  it('rechaza 63 físicas en capacidad de 620 kg aunque las 60 con precio sí cabrían', async () => {
    const p = await pedido(), e = await mision(620)
    expect((await asignar(p.id, e.id)).status).toBe(400)
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).embarqueId).toBeNull()
  })
  it('la capacidad ya comprometida incluye regalos de otros pedidos', async () => {
    const primero = await pedido(), segundo = await pedido(2, 1), e = await mision(650)
    const key = randomUUID()
    expect((await asignar(primero.id, e.id, key)).status).toBe(201)
    expect((await asignar(primero.id, e.id, key)).status).toBe(200)
    expect((await asignar(segundo.id, e.id)).status).toBe(400)
    expect(await db.pedido.count({ where: { embarqueId: e.id } })).toBe(1)
  })
  it('replanificar después de 10+1 carga solo 50+2: 520 kg, no los 630 originales', async () => {
    const p = await pedido(), e = await mision(530)
    await entregarPedidoUseCase.execute({ pedidoId: p.id, actorId: sesion.id, offlineId: randomUUID(),
      oficina: { fechaEntrega: new Date(), fechaEntregaGenerada: true, repartidorId: e.trabajadorId, promesaPagoFecha: new Date(Date.now() + 86400000) },
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 10, cantidadRegalo: 1 }] })
    expect((await asignar(p.id, e.id)).status).toBe(201)
    const actual = await db.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { items: true } })
    expect([actual.items[0].cantPedido, actual.items[0].cantEntrega, actual.items[0].cantRegaloPedido, actual.items[0].cantRegaloEntrega]).toEqual([60, 10, 3, 1])
    expect(Number(actual.total)).toBe(138000)
  })
  it('dos operadores no asignan dos cargas de 30 kg al mismo espacio de 50 kg', async () => {
    const a = await pedido(2, 1), b = await pedido(2, 1), e = await mision(50)
    const respuestas = await Promise.all([asignar(a.id, e.id), asignar(b.id, e.id)])
    expect(respuestas.map(r => r.status).sort()).toEqual([201, 400])
    expect(await db.pedido.count({ where: { embarqueId: e.id } })).toBe(1)
  })
  it('el envío en bloque también rechaza 72 físicas para el límite de 70', async () => {
    const p = await pedido(69, 3), e = await mision(2000)
    expect((await bloque([p.id], e.id)).status).toBe(400)
    expect((await db.pedido.findUniqueOrThrow({ where: { id: p.id } })).embarqueId).toBeNull()
  })
  it('reenviar la selección al mismo embarque no duplica las 63 unidades comprometidas', async () => {
    const p = await pedido(), e = await mision(2000)
    expect((await bloque([p.id], e.id)).status).toBe(200)
    expect((await bloque([p.id], e.id)).status).toBe(200)
    expect(await db.pedido.count({ where: { embarqueId: e.id } })).toBe(1)
  })
})
