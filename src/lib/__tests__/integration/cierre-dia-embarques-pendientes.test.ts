// @tests ALS AB-ALS-EMB-2026-10-13 §7 (T-05) / invariante I-15 — PR-3.
//
// GET /api/cierre decide COMPLETO/INCOMPLETO y POST /api/cierre rechaza el
// cierre con EMBARQUES_ABIERTOS. Ambos deben usar el MISMO predicado
// (`ABIERTO | EN_RUTA`, día Bogotá). Antes el GET solo miraba `ABIERTO`: un día
// con un embarque `EN_RUTA` aparecía como COMPLETO y el POST lo rechazaba
// después. Este test invoca los handlers REALES contra Postgres.
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { EstadoEmbarque } from '@prisma/client'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { startOfDayInBogota } from '@/lib/date-helpers'

const authUser = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
  requireRole: vi.fn(async () => ({ user: authUser })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))

const FECHA = '2026-03-10'
const OTRA_FECHA = '2026-03-11'

function getReq(fecha: string) {
  return { nextUrl: { searchParams: new URLSearchParams({ fecha }) } } as unknown as import('next/server').NextRequest
}
function postReq(fecha: string) {
  return {
    json: async () => ({
      fecha,
      baseDia: 0,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
      comisiones: 0,
      salarios: 0,
    }),
  } as unknown as import('next/server').NextRequest
}

/** Mediodía Bogotá del día `ymd` (dentro de su rango [00:00, 24:00) Bogotá). */
function mediodiaBogota(ymd: string): Date {
  return new Date(startOfDayInBogota(ymd).getTime() + 12 * 60 * 60 * 1000)
}

// Unique (trabajadorId, fecha, numeroDia): un repartidor nuevo por embarque.
async function crearEmbarque(estado: EstadoEmbarque, ymd = FECHA) {
  const t = await testPrisma.trabajador.create({
    data: { nombre: `PR3 Rep ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  return testPrisma.embarque.create({
    data: { trabajadorId: t.id, fecha: mediodiaBogota(ymd), estado, baseDinero: 0 },
  })
}

async function getStatus(ymd: string) {
  const { GET } = await import('@/app/api/cierre/route')
  const res = await GET(getReq(ymd))
  expect(res.status).toBe(200)
  return (await res.json()) as { status: string; embarquesPendientes: Array<{ id: string }> }
}

describe('PR-3 — cierre de día: GET y POST comparten el predicado de embarques pendientes', () => {
  beforeAll(async () => {
    await resetAndSeed()
    const admin = await testPrisma.user.findUnique({ where: { username: 'admin' } })
    if (!admin) throw new Error('admin')
    authUser.id = admin.id
  })

  beforeEach(async () => {
    await testPrisma.embarqueMovimiento.deleteMany({})
    await testPrisma.embarque.deleteMany({})
  })

  afterAll(async () => {
    await disconnect()
  })

  it('un embarque EN_RUTA deja el día INCOMPLETO y lo lista como pendiente (antes: COMPLETO)', async () => {
    const e = await crearEmbarque('EN_RUTA')
    const body = await getStatus(FECHA)
    expect(body.status).toBe('INCOMPLETO')
    expect(body.embarquesPendientes.map((x) => x.id)).toContain(e.id)
  })

  it('un embarque ABIERTO sigue dejando el día INCOMPLETO', async () => {
    const e = await crearEmbarque('ABIERTO')
    const body = await getStatus(FECHA)
    expect(body.status).toBe('INCOMPLETO')
    expect(body.embarquesPendientes.map((x) => x.id)).toContain(e.id)
  })

  it('CERRADO, CANCELADO y un EN_RUTA de OTRO día no son pendientes', async () => {
    await crearEmbarque('CERRADO')
    await crearEmbarque('CANCELADO')
    await crearEmbarque('EN_RUTA', OTRA_FECHA)
    const body = await getStatus(FECHA)
    expect(body.status).toBe('COMPLETO')
    expect(body.embarquesPendientes).toHaveLength(0)
  })

  it.each(['ABIERTO', 'EN_RUTA'] as const)(
    'paridad: con un embarque %s el GET dice INCOMPLETO y el POST lo rechaza sin crear CierreDia',
    async (estado) => {
      await crearEmbarque(estado)
      const { POST } = await import('@/app/api/cierre/route')

      expect((await getStatus(FECHA)).status).toBe('INCOMPLETO')
      const res = await POST(postReq(FECHA))
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { message: string } }
      expect(body.error.message).toMatch(/embarques abiertos/i)
      expect(await testPrisma.cierreDia.count({ where: { fecha: startOfDayInBogota(FECHA) } })).toBe(0)
    },
  )

  it('paridad inversa: con el día COMPLETO el POST sí cierra', async () => {
    await crearEmbarque('CERRADO')
    const { POST } = await import('@/app/api/cierre/route')

    expect((await getStatus(FECHA)).status).toBe('COMPLETO')
    const res = await POST(postReq(FECHA))
    expect(res.status).toBeLessThan(300)
    expect(await testPrisma.cierreDia.count({ where: { fecha: startOfDayInBogota(FECHA) } })).toBe(1)
  })
})
