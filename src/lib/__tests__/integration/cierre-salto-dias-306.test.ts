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

import { testPrisma, resetAndSeed, disconnect, getAdminUser, registrarBaseDia } from './setup'
import { POST as cerrar } from '@/app/api/cierre/route'
import { GET as pendientes } from '@/app/api/cierre/pendientes/route'
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

async function post(body: Record<string, unknown>) {
  // #688: el cierre exige la base de caja de esa fecha; estas pruebas son del salto de días, no de la base.
  if (typeof body.fecha === 'string') await registrarBaseDia(body.fecha, 50000)
  return cerrar(new NextRequest('http://localhost/api/cierre', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseDia: 50000, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0, stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0, salarios: 0, ...body }),
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

  it('ni el ADMIN ni el ASISTENTE pueden cerrar saltándose un día con movimiento', async () => {
    const base = '2035-03-01'
    await ultimoCierreEn(base)
    const g = await gastoEn(suma(base, 1))
    for (const rol of ['ADMIN', 'ASISTENTE'] as const) {
      sesion(rol)
      const res = await post({ fecha: suma(base, 3) })
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('CIERRE_HUECO')
    }
    expect(await testPrisma.cierreDia.count({ where: { fecha: startOfDayInBogota(suma(base, 3)) } })).toBe(0)
    await testPrisma.gasto.delete({ where: { id: g.id } })
  })

  it('el campo de «saltar con motivo» ya no existe: se rechaza', async () => {
    const base = '2036-03-01'
    await ultimoCierreEn(base)
    const res = await post({ fecha: suma(base, 2), saltarDiasConOperacion: { motivo: 'Feria del pueblo, se concilia a mano' } })
    expect(res.status).toBe(400)
    expect(await testPrisma.cierreDia.count({ where: { fecha: startOfDayInBogota(suma(base, 2)) } })).toBe(0)
  })

  it('cerrar el día con movimiento primero y luego el siguiente funciona (el orden correcto)', async () => {
    const base = '2037-03-01'
    await ultimoCierreEn(base)
    const g = await gastoEn(suma(base, 1))
    expect((await post({ fecha: suma(base, 1) })).status).toBe(201)
    expect((await post({ fecha: suma(base, 3) })).status).toBe(201)
    await testPrisma.gasto.delete({ where: { id: g.id } })
  })

  it('un día omitido (sin movimientos) se puede cerrar DESPUÉS de un cierre posterior, sin hueco', async () => {
    const base = '2038-03-01'
    await ultimoCierreEn(base)
    expect((await post({ fecha: suma(base, 3) })).status).toBe(201) // el 2 y el 3 se omiten
    const tarde = await post({ fecha: suma(base, 1) }) // día omitido, anterior al último cierre
    expect(tarde.status).toBe(201)
    expect(await testPrisma.cierreDia.count({ where: { fecha: startOfDayInBogota(suma(base, 1)) } })).toBe(1)
    const otraVez = await post({ fecha: suma(base, 1) })
    expect(otraVez.status).toBe(409) // ya está cerrado
  })

  it('un día omitido que luego recibe movimientos bloquea el siguiente cierre, y se cierra atrasado', async () => {
    const base = '2039-03-01'
    await ultimoCierreEn(base)
    expect((await post({ fecha: suma(base, 3) })).status).toBe(201) // se omite el día 1 y el 2
    const g = await gastoEn(suma(base, 1)) // aparece movimiento en el día omitido
    const siguiente = await post({ fecha: suma(base, 5) })
    expect(siguiente.status).toBe(400)
    expect((await siguiente.json()).error.code).toBe('CIERRE_HUECO')
    expect((await post({ fecha: suma(base, 1) })).status).toBe(201) // cierre atrasado del día con movimiento
    expect((await post({ fecha: suma(base, 5) })).status).toBe(201)
    await testPrisma.gasto.delete({ where: { id: g.id } })
  })

  it('GET /api/cierre/pendientes devuelve los días por cerrar con sus movimientos y si son obligatorios', async () => {
    sesion('ASISTENTE')
    const res = await pendientes()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.dias)).toBe(true)
    expect(typeof json.hoy).toBe('string')
    for (const d of json.dias as Array<{ fecha: string; operaciones: number; obligatorio: boolean }>) {
      expect(d.obligatorio).toBe(d.operaciones > 0)
    }
  })
})
