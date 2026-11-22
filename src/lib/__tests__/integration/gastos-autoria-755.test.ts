// #755: el alta manual no debe perder autoría ni auditoría si el cierre corre en paralelo.
// PostgreSQL real; todos los registros son sintéticos.
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { resetAndSeed, disconnect, testPrisma, getAdminUser } from './setup'
import { startOfDayInBogota } from '@/lib/date-helpers'

const actor = { id: 'pendiente', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: actor })),
  requireRole: vi.fn(async () => ({ user: actor })),
}))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))
// Deliberadamente NO se burla logAudit: debe persistir en la misma transacción.
import { POST } from '@/app/api/gastos/route'

function request(fecha: string) {
  return new NextRequest('http://localhost/api/gastos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      categoria: 'TRANSPORTE', descripcion: 'Combustible verificado #755',
      monto: 12345.67, responsable: 'Conductor', fecha,
    }),
  })
}

describe('#755: creador y trazabilidad real de gastos', () => {
  beforeAll(async () => {
    await resetAndSeed()
    actor.id = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })

  it('conserva por separado creador y responsable, y graba CREATE en Historial', async () => {
    const response = await POST(request('2031-04-20'))
    expect(response.status).toBe(201)
    const json = await response.json()
    const gasto = await testPrisma.gasto.findUniqueOrThrow({
      where: { id: json.gasto.id },
    })
    expect(gasto.createdById).toBe(actor.id)
    expect(gasto.responsable).toBe('Conductor')
    expect(gasto.fecha.toISOString()).toBe('2031-04-20T05:00:00.000Z')
    const events = await testPrisma.historial.findMany({
      where: { entidad: 'Gasto', registroId: gasto.id, accion: 'CREATE' },
    })
    expect(events).toHaveLength(1)
    expect(events[0].usuarioId).toBe(actor.id)
    expect(JSON.parse(events[0].datos).monto).toBe(12345.67)
  })

  it('no crea ni audita gastos si la jornada ya está cerrada', async () => {
    const dia = '2031-04-19'
    await testPrisma.cierreDia.create({ data: {
      fecha: startOfDayInBogota(dia), cerradoPor: actor.id,
    } })
    const before = await testPrisma.gasto.count({ where: {
      descripcion: 'Combustible verificado #755',
      fecha: startOfDayInBogota(dia),
    } })
    const response = await POST(request(dia))
    expect(response.status).toBe(409)
    const after = await testPrisma.gasto.count({ where: {
      descripcion: 'Combustible verificado #755',
      fecha: startOfDayInBogota(dia),
    } })
    expect(after).toBe(before)
  })
})
