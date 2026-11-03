// @tests #410 — el usuario técnico `system@bambu.local` no puede iniciar sesión.
// Usa el `authorize` real de Auth.js y bcrypt real; solo la base está simulada.
// Con la contraseña correcta el técnico es rechazado y otro usuario con la misma
// contraseña entra, así que el rechazo se debe a que es el técnico.
import { describe, it, expect, beforeAll, vi } from 'vitest'
import bcrypt from 'bcryptjs'

const db = vi.hoisted(() => ({ users: new Map<string, Record<string, unknown>>() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(async ({ where }: { where: { username: string } }) => db.users.get(where.username) ?? null) } },
}))
vi.mock('@/lib/request-headers-safe', () => ({ getRequestHeadersSafe: vi.fn(async () => null) }))

import { authOptions } from '@/lib/auth'
import { USUARIO_SISTEMA, esUsuarioSistema } from '@/lib/usuario-sistema'

type Authorize = (c: Record<string, string>) => Promise<{ id: string } | null>
const authorize = (authOptions.providers[0] as unknown as { options: { authorize: Authorize } }).options.authorize

const CLAVE = 'clave-de-prueba-410'

describe('#410 — el usuario técnico no inicia sesión', () => {
  beforeAll(async () => {
    const password = await bcrypt.hash(CLAVE, 4)
    const base = { rol: 'ADMIN', activo: true, apellido: '', mustChangePassword: false, password }
    db.users.set(USUARIO_SISTEMA, { ...base, id: 'sys', username: USUARIO_SISTEMA, nombre: 'Sistema' })
    db.users.set('control', { ...base, id: 'ctl', username: 'control', nombre: 'Control' })
  })

  it('con la contraseña correcta, el usuario técnico es rechazado', async () => {
    expect(await authorize({ username: USUARIO_SISTEMA, password: CLAVE })).toBeNull()
  })

  it('otro usuario con la misma contraseña sí entra', async () => {
    expect((await authorize({ username: 'control', password: CLAVE }))?.id).toBe('ctl')
  })

  it('reconoce al técnico aunque cambien mayúsculas o espacios', () => {
    expect(esUsuarioSistema(' System@Bambu.Local ')).toBe(true)
    expect(esUsuarioSistema('admin')).toBe(false)
    expect(esUsuarioSistema(undefined)).toBe(false)
  })
})
