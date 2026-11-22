// @tests #630 F0 — reproducción de riesgo: Producción no debe confirmar sin auditoría.
// DB: PostgreSQL de integración, resetAndSeed() en base efímera. NO usar contra producción.
// Este archivo inyecta falla de logAudit y observa el estado persistido, no solo texto de fuente.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
const mocks = vi.hoisted(() => ({ auth: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: () => mocks.auth() }))
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => mocks.audit(...args) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as crearProduccion } from '@/app/api/produccion/route'
import { PUT as corregirProduccion } from '@/app/api/produccion/[id]/route'
import { dayInBogota } from '@/lib/date-helpers'

let adminId: string
const ayer = () => dayInBogota(new Date(Date.now() - 86_400_000))
const post = (body: unknown) => new NextRequest('http://localhost/api/produccion', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const put = (id: string, body: unknown) => corregirProduccion(
  new NextRequest(`http://localhost/api/produccion/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id }) },
)
const nuevoSellador = () => testPrisma.trabajador.create({
  data: { nombre: `Prueba F0 ${randomUUID()}`, rol: 'SELLADOR', tipoPago: 'COMISION', comPacaAgua: 330, comPacaHielo: 330, comBotellon: 330 },
})
const cuerpo = (trabajadorId: string) => ({
  fecha: ayer(), turno: 'MANANA', trabajadorId, obs: 'Caso sintético de auditoría',
  botellonesLlenados: 0,
  items: [
    { producto: 'PACA_AGUA', conteoA: 10, conteoB: 10, stockFinFisico: 10 },
    { producto: 'PACA_HIELO', conteoA: 0, conteoB: 0, stockFinFisico: 0 },
  ],
})

describe('#630 F0 — atomicidad de auditoría en Producción (PostgreSQL real)', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(() => {
    mocks.auth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
    mocks.audit.mockReset()
    mocks.audit.mockResolvedValue(undefined)
  })
  afterAll(disconnect)

  it('POST: si falla la auditoría, no confirma Producción ni sus items', async () => {
    const s = await nuevoSellador()
    mocks.audit.mockRejectedValueOnce(new Error('F0_AUDIT_FAILURE_INJECTED'))
    const res = await crearProduccion(post(cuerpo(s.id)))
    expect(mocks.audit).toHaveBeenCalledTimes(1)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await testPrisma.produccion.count({ where: { trabajadorId: s.id } })).toBe(0)
    expect(await testPrisma.produccionItem.count({ where: { produccion: { trabajadorId: s.id } } })).toBe(0)
  })

  it('PUT: si falla la auditoría, no conserva la corrección parcial', async () => {
    const s = await nuevoSellador()
    const creado = await crearProduccion(post(cuerpo(s.id)))
    expect(creado.status, JSON.stringify(await creado.clone().json())).toBe(201)
    const p = await testPrisma.produccion.findFirstOrThrow({
      where: { trabajadorId: s.id }, include: { items: true },
    })
    const original = p.items.find(i => i.producto === 'PACA_AGUA')?.producido
    expect(original).toBe(10)

    mocks.audit.mockRejectedValueOnce(new Error('F0_AUDIT_FAILURE_INJECTED'))
    const res = await put(p.id, {
      obs: 'Corrección sintética que debe revertirse',
      items: [{ producto: 'PACA_AGUA', conteoA: 14, conteoB: 14 }, { producto: 'PACA_HIELO' }],
    })
    expect(mocks.audit).toHaveBeenCalledTimes(2)
    expect(res.status).toBeGreaterThanOrEqual(400)
    const actual = await testPrisma.produccionItem.findFirstOrThrow({
      where: { produccionId: p.id, producto: 'PACA_AGUA' },
    })
    expect(actual.producido).toBe(original)
  })
})
