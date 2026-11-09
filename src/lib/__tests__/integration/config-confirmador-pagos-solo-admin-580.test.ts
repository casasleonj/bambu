// @tests #580 — solo el ADMIN designa a la persona que confirma los pagos digitales, por CUALQUIER ruta que
// escriba `Config` (Postgres real, handlers REALES). Antes un CONTADOR podía ponerse a sí mismo como confirmador.

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
import { CLAVE_USUARIO_CONFIRMA_PAGOS } from '@/lib/config-claves-restringidas'

let adminId: string
const sesion = (role: 'ADMIN' | 'CONTADOR' | 'ASISTENTE') =>
  mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
const req = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const valorActual = async () => (await testPrisma.config.findUnique({ where: { clave: CLAVE_USUARIO_CONFIRMA_PAGOS } }))?.valor ?? null

describe('#580 — designar al confirmador de pagos: solo ADMIN', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(async () => {
    await testPrisma.config.deleteMany({ where: { clave: CLAVE_USUARIO_CONFIRMA_PAGOS } })
  })

  it('el ADMIN lo designa por POST /api/config y por POST /api/config/section', async () => {
    sesion('ADMIN')
    expect((await postConfig(req('/api/config', { clave: CLAVE_USUARIO_CONFIRMA_PAGOS, valor: adminId }))).status).toBe(201)
    expect(await valorActual()).toBe(adminId)
    expect((await postSection(req('/api/config/section', { entries: [{ clave: CLAVE_USUARIO_CONFIRMA_PAGOS, valor: adminId }] }))).status).toBe(200)
    expect(await valorActual()).toBe(adminId)
  })

  it('un CONTADOR o un ASISTENTE NO puede designarse, ni solo ni mezclado con otras claves, y no se guarda nada', async () => {
    for (const rol of ['CONTADOR', 'ASISTENTE'] as const) {
      sesion(rol)
      expect((await postConfig(req('/api/config', { clave: CLAVE_USUARIO_CONFIRMA_PAGOS, valor: adminId }))).status).toBe(403)
      const mezcla = await postSection(req('/api/config/section', {
        entries: [{ clave: 'DIAS_ALERTA_NO_VERIFICADO', valor: '17' }, { clave: CLAVE_USUARIO_CONFIRMA_PAGOS, valor: adminId }],
      }))
      expect(mezcla.status).toBe(403)
    }
    expect(await valorActual()).toBeNull()
    expect((await testPrisma.config.findUnique({ where: { clave: 'DIAS_ALERTA_NO_VERIFICADO' } }))?.valor).not.toBe('17')
  })
})
