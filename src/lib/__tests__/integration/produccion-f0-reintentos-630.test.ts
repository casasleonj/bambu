// @tests #630 F0 — replay offlineId idéntico vs conflicto de payload.
// DB PostgreSQL de integración con datos sintéticos. No usar contra producción.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as crearProduccion } from '@/app/api/produccion/route'
import { dayInBogota } from '@/lib/date-helpers'

let adminId: string
const fecha = () => dayInBogota(new Date(Date.now() - 86_400_000))
const post = (body: unknown) => new NextRequest('http://localhost/api/produccion', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const sellador = () => testPrisma.trabajador.create({
  data: { nombre: `Sellador replay ${randomUUID()}`, rol: 'SELLADOR', tipoPago: 'COMISION', comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330 },
})
const payload = (trabajadorId: string, offlineId: string, cantidad = 10) => ({
  fecha: fecha(), turno: 'MANANA', trabajadorId, offlineId,
  obs: 'Reintento sintético F0', botellonesLlenados: 0,
  items: [
    { producto: 'PACA_AGUA', conteoA: cantidad, conteoB: cantidad, stockFinFisico: cantidad },
    { producto: 'PACA_HIELO', conteoA: 0, conteoB: 0, stockFinFisico: 0 },
  ],
})

describe('#630 F0 — idempotencia semántica de Producción (PostgreSQL real)', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }))
  afterAll(disconnect)

  it('mismo offlineId y mismo payload: responde con el hecho anterior sin duplicar producción', async () => {
    const s = await sellador()
    const b = payload(s.id, randomUUID())
    const primera = await crearProduccion(post(b))
    expect(primera.status, JSON.stringify(await primera.clone().json())).toBe(201)
    const segunda = await crearProduccion(post(b))
    expect(segunda.status, JSON.stringify(await segunda.clone().json())).toBe(200)
    const body = await segunda.json()
    expect(body.deduped).toBe(true)
    expect(await testPrisma.produccion.count({ where: { trabajadorId: s.id } })).toBe(1)
  })

  it('mismo offlineId y payload diferente: NO afirma éxito ni altera el hecho original', async () => {
    const s = await sellador()
    const id = randomUUID()
    const primera = await crearProduccion(post(payload(s.id, id, 10)))
    expect(primera.status, JSON.stringify(await primera.clone().json())).toBe(201)

    const segunda = await crearProduccion(post(payload(s.id, id, 14)))
    expect(segunda.status).toBe(409)
    expect(await testPrisma.produccion.count({ where: { trabajadorId: s.id } })).toBe(1)
    const p = await testPrisma.produccion.findFirstOrThrow({
      where: { trabajadorId: s.id }, include: { items: true },
    })
    expect(p.items.find(i => i.producto === 'PACA_AGUA')?.producido).toBe(10)
  })
})
