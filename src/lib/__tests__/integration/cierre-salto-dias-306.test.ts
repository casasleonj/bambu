// @tests #306 — POST /api/cierre: los días sin operación se saltan solos; los días con operación
// bloquean salvo que el ADMIN los salte con motivo (queda en el historial). Postgres real, handler REAL;
// cada prueba mira la base de datos.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
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
import { POST as cerrar } from '@/app/api/cierre/route'
import { startOfDayInBogota } from '@/lib/date-helpers'

let adminId: string
const sesion = (role: 'ADMIN' | 'ASISTENTE') => mockAuth.mockResolvedValue({ user: { id: adminId, role } })

const suma = (fecha: string, dias: number) =>
  new Date(startOfDayInBogota(fecha).getTime() + dias * 86_400_000).toISOString().slice(0, 10)

async function ultimoCierreEn(fecha: string) {
  await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota(fecha), cerradoPor: adminId } })
}

async function gastoEn(fecha: string) {
  return testPrisma.gasto.create({
    data: { fecha: new Date(startOfDayInBogota(fecha).getTime() + 3_600_000), categoria: 'OTROS', monto: 5000, descripcion: 'dia-con-operacion-306', createdById: adminId },
  })
}

function post(body: Record<string, unknown>) {
  return cerrar(new NextRequest('http://localhost/api/cierre', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseDia: 0, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0, stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0, salarios: 0, ...body }),
  }))
}

describe('#306 POST /api/cierre con hueco entre cierres', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => {
    await disconnect()
  })
  beforeEach(() => sesion('ADMIN'))

  it('días intermedios sin operación: el cierre se hace solo y se saltan', async () => {
    const base = '2033-03-01'
    await ultimoCierreEn(base)
    const res = await post({ fecha: suma(base, 3) })
    expect(res.status).toBe(201)
    expect(await testPrisma.cierreDia.count({ where: { fecha: startOfDayInBogota(suma(base, 3)) } })).toBe(1)
    expect(await testPrisma.historial.count({ where: { accion: 'CIERRE_SALTO_DIAS' } })).toBe(0)
  })

  it('un día intermedio con operación bloquea (ADMIN sin motivo) y no crea el cierre', async () => {
    const base = '2034-03-01'
    await ultimoCierreEn(base)
    const g = await gastoEn(suma(base, 1))
    const res = await post({ fecha: suma(base, 3) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error.code).toBe('CIERRE_HUECO')
    expect(json.error.message).toContain(suma(base, 1))
    expect(await testPrisma.cierreDia.count({ where: { fecha: startOfDayInBogota(suma(base, 3)) } })).toBe(0)
    await testPrisma.gasto.delete({ where: { id: g.id } })
  })

  it('el ASISTENTE no puede saltar días con operación aunque mande motivo', async () => {
    const base = '2035-03-01'
    await ultimoCierreEn(base)
    const g = await gastoEn(suma(base, 1))
    sesion('ASISTENTE')
    const res = await post({ fecha: suma(base, 3), saltarDiasConOperacion: { motivo: 'Motivo suficientemente largo' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('CIERRE_HUECO')
    expect(await testPrisma.cierreDia.count({ where: { fecha: startOfDayInBogota(suma(base, 3)) } })).toBe(0)
    await testPrisma.gasto.delete({ where: { id: g.id } })
  })

  it('un motivo corto se rechaza antes de tocar nada', async () => {
    const base = '2036-03-01'
    await ultimoCierreEn(base)
    const g = await gastoEn(suma(base, 1))
    const res = await post({ fecha: suma(base, 3), saltarDiasConOperacion: { motivo: 'corto' } })
    expect(res.status).toBe(400)
    expect(await testPrisma.cierreDia.count({ where: { fecha: startOfDayInBogota(suma(base, 3)) } })).toBe(0)
    await testPrisma.gasto.delete({ where: { id: g.id } })
  })

  it('el ADMIN salta el día con operación indicando motivo: cierra y queda en el historial', async () => {
    const base = '2037-03-01'
    await ultimoCierreEn(base)
    const g = await gastoEn(suma(base, 1))
    const motivo = 'Feria del pueblo: se concilia a mano'
    const res = await post({ fecha: suma(base, 3), saltarDiasConOperacion: { motivo } })
    expect(res.status).toBe(201)
    const cierre = await testPrisma.cierreDia.findUnique({ where: { fecha: startOfDayInBogota(suma(base, 3)) } })
    expect(cierre).not.toBeNull()
    const h = await testPrisma.historial.findFirst({ where: { accion: 'CIERRE_SALTO_DIAS', registroId: cierre!.id } })
    expect(h).not.toBeNull()
    const datos = JSON.parse(h!.datos) as { motivo: string; diasSaltados: { fecha: string }[] }
    expect(datos.motivo).toBe(motivo)
    expect(datos.diasSaltados.map((d) => d.fecha)).toEqual([suma(base, 1)])
    await testPrisma.gasto.delete({ where: { id: g.id } })
  })
})
