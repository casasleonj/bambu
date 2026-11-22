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
import { PUT as corregirProduccion } from '@/app/api/produccion/[id]/route'
import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'

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

  it('el historial conserva la huella original en un CREATE confirmado', async () => {
    const s = await sellador()
    const primera = await crearProduccion(post(payload(s.id, randomUUID())))
    expect(primera.status).toBe(201)
    const p = await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: s.id } })
    const historial = await testPrisma.historial.findFirstOrThrow({
      where: { entidad: 'Produccion', registroId: p.id, accion: 'CREATE' },
    })
    const datos = JSON.parse(historial.datos) as Record<string, unknown>
    expect(datos._idempotencyHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('los items en distinto orden y observaciones con espacios son el mismo reintento', async () => {
    const s = await sellador()
    const body = payload(s.id, randomUUID())
    expect((await crearProduccion(post(body))).status).toBe(201)
    const replay = await crearProduccion(post({
      ...body, obs: `  ${body.obs}  `, items: [...body.items].reverse(),
    }))
    expect(replay.status, JSON.stringify(await replay.clone().json())).toBe(200)
    expect((await replay.json()).deduped).toBe(true)
    expect(await testPrisma.produccion.count({ where: { trabajadorId: s.id } })).toBe(1)
  })

  it('replay original después de una corrección no deshace la corrección', async () => {
    const s = await sellador()
    const body = payload(s.id, randomUUID())
    expect((await crearProduccion(post(body))).status).toBe(201)
    const p = await testPrisma.produccion.findFirstOrThrow({ where: { trabajadorId: s.id } })
    const correccion = await corregirProduccion(
      new NextRequest(`http://localhost/api/produccion/${p.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obs: 'Corrección posterior de la cantidad',
          items: [{ producto: 'PACA_AGUA', conteoA: 14, conteoB: 14 }, { producto: 'PACA_HIELO' }],
        }),
      }), { params: Promise.resolve({ id: p.id }) },
    )
    expect(correccion.status, JSON.stringify(await correccion.clone().json())).toBe(200)

    const reintento = await crearProduccion(post(body))
    expect(reintento.status, JSON.stringify(await reintento.clone().json())).toBe(200)
    expect((await reintento.json()).deduped).toBe(true)
    const item = await testPrisma.produccionItem.findFirstOrThrow({
      where: { produccionId: p.id, producto: 'PACA_AGUA' },
    })
    expect(item.producido).toBe(14)
  })

  it('replay idéntico después del cierre no genera una nueva producción', async () => {
    const s = await sellador()
    const body = payload(s.id, randomUUID())
    expect((await crearProduccion(post(body))).status).toBe(201)
    await testPrisma.cierreDia.create({
      data: { fecha: startOfDayInBogota(body.fecha), cerradoPor: adminId },
    })
    const replay = await crearProduccion(post(body))
    expect(replay.status, JSON.stringify(await replay.clone().json())).toBe(200)
    expect((await replay.json()).deduped).toBe(true)
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
