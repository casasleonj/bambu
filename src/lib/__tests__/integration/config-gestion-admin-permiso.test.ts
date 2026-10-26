// @tests #472 — TEMPORAL-SIN-EMBARQUE: solo el ADMIN cambia el interruptor de la gestión
// sin embarque, por CUALQUIER ruta que escriba `Config` (Postgres real, handlers REALES).
// Antes, `POST /api/config` y `POST /api/config/section` dejaban cambiarlo a un CONTADOR.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as postConfig } from '@/app/api/config/route'
import { POST as postSection } from '@/app/api/config/section/route'
import { CLAVE_GESTION_ADMIN_SIN_EMBARQUE, gestionAdminSinEmbarqueActiva } from '@/lib/gestion-admin'

let adminId: string

function sesion(role: 'ADMIN' | 'CONTADOR' | 'ASISTENTE') {
  mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
}
const req = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const unico = (clave: string, valor: string) => ({ clave, valor })

async function valorActual(clave: string) {
  return (await testPrisma.config.findUnique({ where: { clave } }))?.valor ?? null
}

describe('#472 — interruptor de la gestión sin embarque: solo ADMIN, en toda ruta', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(async () => {
    await testPrisma.config.upsert({
      where: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE },
      create: { clave: CLAVE_GESTION_ADMIN_SIN_EMBARQUE, valor: 'false' },
      update: { valor: 'false' },
    })
  })

  it('el ADMIN lo enciende y lo apaga con POST /api/config, y la lectura directa lo ve al instante', async () => {
    sesion('ADMIN')
    expect((await postConfig(req('/api/config', unico(CLAVE_GESTION_ADMIN_SIN_EMBARQUE, 'true')))).status).toBe(201)
    expect(await valorActual(CLAVE_GESTION_ADMIN_SIN_EMBARQUE)).toBe('true')
    expect(await gestionAdminSinEmbarqueActiva()).toBe(true)

    expect((await postConfig(req('/api/config', unico(CLAVE_GESTION_ADMIN_SIN_EMBARQUE, 'false')))).status).toBe(201)
    expect(await gestionAdminSinEmbarqueActiva()).toBe(false)
  })

  it('el ADMIN también puede por POST /api/config/section', async () => {
    sesion('ADMIN')
    const res = await postSection(req('/api/config/section', { entries: [unico(CLAVE_GESTION_ADMIN_SIN_EMBARQUE, 'true')] }))
    expect(res.status).toBe(200)
    expect(await valorActual(CLAVE_GESTION_ADMIN_SIN_EMBARQUE)).toBe('true')
  })

  it('un CONTADOR o un ASISTENTE NO puede, por ninguna de las dos rutas, y el valor no cambia', async () => {
    for (const rol of ['CONTADOR', 'ASISTENTE'] as const) {
      sesion(rol)
      expect((await postConfig(req('/api/config', unico(CLAVE_GESTION_ADMIN_SIN_EMBARQUE, 'true')))).status).toBe(403)
      // También cuando la clave va mezclada con otras que ese rol sí puede escribir.
      const mezcla = await postSection(req('/api/config/section', {
        entries: [unico('DIAS_ALERTA_NO_VERIFICADO', '15'), unico(CLAVE_GESTION_ADMIN_SIN_EMBARQUE, 'true')],
      }))
      expect(mezcla.status).toBe(403)
    }
    expect(await valorActual(CLAVE_GESTION_ADMIN_SIN_EMBARQUE)).toBe('false')
    expect(await valorActual('DIAS_ALERTA_NO_VERIFICADO')).not.toBe('15') // nada de la mezcla se guardó
  })

  it('solo acepta «true» o «false»', async () => {
    sesion('ADMIN')
    for (const malo of ['si', 'TRUE', '1', '', ' true']) {
      const r = await postConfig(req('/api/config', unico(CLAVE_GESTION_ADMIN_SIN_EMBARQUE, malo)))
      expect(r.status, `valor «${malo}»`).toBe(400)
    }
    expect(await valorActual(CLAVE_GESTION_ADMIN_SIN_EMBARQUE)).toBe('false')
  })

  it('las demás claves siguen igual: el CONTADOR sigue pudiendo cambiarlas', async () => {
    sesion('CONTADOR')
    expect((await postConfig(req('/api/config', unico('DIAS_ALERTA_NO_VERIFICADO', '21')))).status).toBe(201)
    expect(await valorActual('DIAS_ALERTA_NO_VERIFICADO')).toBe('21')
    expect((await postSection(req('/api/config/section', { entries: [unico('DIAS_ALERTA_NO_VERIFICADO', '22')] }))).status).toBe(200)
    expect(await valorActual('DIAS_ALERTA_NO_VERIFICADO')).toBe('22')
  })
})
