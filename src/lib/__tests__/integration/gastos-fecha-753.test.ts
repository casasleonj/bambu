// @tests #753 — validación y protección de la jornada en POST /api/gastos (Postgres real).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { startOfDayInBogota } from '@/lib/date-helpers'

const actor = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: actor })),
  requireRole: vi.fn(async () => ({ user: actor })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))

import { POST as registrarGasto } from '@/app/api/gastos/route'

const solicitud = (fecha?: string) => new NextRequest('http://localhost/api/gastos', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ categoria: 'OTRO', descripcion: 'Gasto sintético 753', monto: 100, ...(fecha === undefined ? {} : { fecha }) }),
})

describe('#753 — POST /api/gastos (PostgreSQL)', () => {
  beforeAll(async () => { await resetAndSeed(); actor.id = (await getAdminUser()).id })
  afterAll(async () => { await disconnect() })

  it('YYYY-MM-DD queda en la jornada Bogotá pedida, no en UTC del día anterior', async () => {
    const res = await registrarGasto(solicitud('2026-11-09'))
    expect(res.status).toBe(201)
    const json = await res.json()
    const gasto = await testPrisma.gasto.findUniqueOrThrow({ where: { id: json.gasto.id } })
    expect(gasto.fecha.toISOString()).toBe('2026-11-09T05:00:00.000Z')
  })

  it('ISO con zona explícita conserva la hora real sin cambiarla', async () => {
    const res = await registrarGasto(solicitud('2026-11-09T23:59:59.999-05:00'))
    expect(res.status).toBe(201)
    const json = await res.json()
    const gasto = await testPrisma.gasto.findUniqueOrThrow({ where: { id: json.gasto.id } })
    expect(gasto.fecha.toISOString()).toBe('2026-11-10T04:59:59.999Z')
  })

  it('fecha sin zona o imposible responde 400, sin crear gastos', async () => {
    const antes = await testPrisma.gasto.count()
    for (const fecha of ['2026-11-09T12:00:00', '2026-02-30', '2026/11/09']) {
      const res = await registrarGasto(solicitud(fecha))
      expect(res.status).toBe(400)
    }
    expect(await testPrisma.gasto.count()).toBe(antes)
  })

  it('un día ya cerrado devuelve 409 y preserva el snapshot', async () => {
    const fecha = '2026-11-08'
    const inicio = startOfDayInBogota(fecha)
    await testPrisma.cierreDia.create({ data: { fecha: inicio, cerradoPor: actor.id } })
    const antes = await testPrisma.gasto.count({ where: { fecha: { gte: inicio, lt: startOfDayInBogota('2026-11-09') } } })
    const res = await registrarGasto(solicitud(fecha))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('GASTO_DIA_CERRADO')
    const despues = await testPrisma.gasto.count({ where: { fecha: { gte: inicio, lt: startOfDayInBogota('2026-11-09') } } })
    expect(despues).toBe(antes)
  })
})
