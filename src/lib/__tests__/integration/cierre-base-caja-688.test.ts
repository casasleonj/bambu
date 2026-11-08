// @tests #688 — el cierre solo cierra con la base de caja vigente de esa fecha: sin base no cierra (422) y si la base
// cambió después de cargar la pantalla tampoco (409). Handlers y PostgreSQL reales.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, registrarBaseDia } from './setup'

const actor = { id: 'placeholder', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(async () => ({ user: actor })),
  requireRole: vi.fn(async () => ({ user: actor })),
}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn(async () => {}) }))

import { POST as cerrar } from '@/app/api/cierre/route'
import { leerBaseDelDia, exigirBaseVigente, BaseFaltanteError, BaseCambioError } from '@/lib/base-caja-dia'

const request = (body: unknown) => new NextRequest('http://localhost/api/cierre', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const payload = (dia: string, baseDia: number) => ({
  fecha: dia, baseDia, salarios: 0, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0,
  stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0, reporte: JSON.stringify({ arqueo: { 50000: 1 } }),
})

describe('#688 — base de caja en el cierre (servidor)', () => {
  beforeAll(async () => { await resetAndSeed(); actor.id = (await getAdminUser()).id })
  beforeEach(async () => { await testPrisma.cierreDia.deleteMany({}); await testPrisma.config.deleteMany({ where: { clave: { startsWith: 'BASE_DIA' } } }) })
  afterAll(disconnect)

  it('cierra cuando la base enviada es la vigente de esa fecha y la guarda en el cierre', async () => {
    const dia = '2026-03-20'
    await registrarBaseDia(dia, 50000)
    const res = await cerrar(request(payload(dia, 50000)))
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
    const guardado = await testPrisma.cierreDia.findFirstOrThrow({ where: { fecha: new Date(`${dia}T00:00:00-05:00`) } })
    expect(Number(guardado.baseDia)).toBe(50000)
  })

  it('sin base de caja de esa fecha NO cierra (422 BASE_FALTANTE), aunque exista el valor por defecto de Configuración', async () => {
    const dia = '2026-03-21'
    await testPrisma.config.upsert({ where: { clave: 'BASE_DIA' }, create: { clave: 'BASE_DIA', valor: '100000' }, update: { valor: '100000' } })
    const res = await cerrar(request(payload(dia, 100000)))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('BASE_FALTANTE')
    expect(await testPrisma.cierreDia.count()).toBe(0)
  })

  it('una base de 0 tampoco cuenta como ingresada', async () => {
    const dia = '2026-03-22'
    await registrarBaseDia(dia, 0)
    const res = await cerrar(request(payload(dia, 0)))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('BASE_FALTANTE')
  })

  it('si la base cambió después de cargar la pantalla NO cierra (409 BASE_CAMBIO) y devuelve la vigente', async () => {
    const dia = '2026-03-23'
    await registrarBaseDia(dia, 60000) // alguien la editó a 60.000; la pantalla aún mandaba 50.000
    const res = await cerrar(request(payload(dia, 50000)))
    expect(res.status).toBe(409)
    const cuerpo = await res.json()
    expect(cuerpo.error.code).toBe('BASE_CAMBIO')
    expect(cuerpo.error.impacto).toEqual({ baseVigente: 60000, baseEnviada: 50000 })
    expect(await testPrisma.cierreDia.count()).toBe(0)
    // con la vigente sí cierra
    const ok = await cerrar(request(payload(dia, 60000)))
    expect(ok.status).toBe(201)
  })

  it('solo importa la base de LA fecha: la de otro día no sirve', async () => {
    await registrarBaseDia('2026-03-25', 50000)
    const res = await cerrar(request(payload('2026-03-24', 50000)))
    expect(res.status).toBe(422)
  })

  it('un cierre ya registrado sigue respondiendo lo mismo (CIERRE_YA_EXISTE), aunque la base cambie después', async () => {
    const dia = '2026-03-26'
    await registrarBaseDia(dia, 50000)
    expect((await cerrar(request(payload(dia, 50000)))).status).toBe(201)
    await registrarBaseDia(dia, 70000)
    const otra = await cerrar(request(payload(dia, 50000)))
    // Lo importante: se rechaza por la regla de siempre (día duplicado → 400, o ya existe → 409), nunca por la de la base.
    const cuerpo = await otra.clone().json() as { error?: { code?: string } }
    expect([400, 409], JSON.stringify(cuerpo)).toContain(otra.status)
    expect(cuerpo.error?.code).not.toBe('BASE_CAMBIO')
    expect(cuerpo.error?.code).not.toBe('BASE_FALTANTE')
    expect(await testPrisma.cierreDia.count()).toBe(1)
  })

  it('exigirBaseVigente / leerBaseDelDia: devuelven la base, null y los errores tipados', async () => {
    await registrarBaseDia('2026-04-01', 45000)
    expect((await leerBaseDelDia(testPrisma, '2026-04-01'))?.valor).toBe(45000)
    expect(await leerBaseDelDia(testPrisma, '2026-04-02')).toBeNull()
    await expect(exigirBaseVigente(testPrisma, '2026-04-02', 45000)).rejects.toBeInstanceOf(BaseFaltanteError)
    await expect(exigirBaseVigente(testPrisma, '2026-04-01', 1)).rejects.toBeInstanceOf(BaseCambioError)
    await expect(exigirBaseVigente(testPrisma, '2026-04-01', 45000)).resolves.toBe(45000)
  })
})
