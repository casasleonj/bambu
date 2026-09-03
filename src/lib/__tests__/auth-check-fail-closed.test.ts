// @tests src/lib/auth-check.ts — FIX C-9 (fail-closed)
// El callback session() de auth.ts devuelve un objeto Session con session.user
// poblado por los defaults de NextAuth aun cuando token.sub es undefined
// (sesión revocada/invalidada a mitad de vuelo). Antes, los 4 guards de API
// validaban `!session` — que NUNCA es true en ese caso — y dejaban pasar la
// request con session.user.id === undefined. proxy.ts y auth-guard.ts ya
// usaban `!session?.user?.id`; este test fija ese contrato en auth-check.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()

vi.mock('../auth', () => ({ auth: () => mockAuth() }))
vi.mock('../prisma', () => ({ prisma: {} }))

import {
  requireAuth,
  requireAuthWithoutMustChangePassword,
  requireRole,
  requirePermission,
} from '../auth-check'

/** Sesión "fantasma": user con defaults de NextAuth pero sin id (token.sub undefined). */
const sesionFantasma = { user: { name: 'x', email: 'x@x.com', image: null } }
/** Sesión válida de un ADMIN. */
const sesionAdmin = { user: { id: 'u1', role: 'ADMIN' } }

async function status(r: unknown): Promise<number | 'ok'> {
  if (r instanceof Response) return r.status
  return 'ok'
}

beforeEach(() => {
  mockAuth.mockReset()
})

describe('requireAuth — fail-closed', () => {
  it('rechaza (401) una sesión sin user.id', async () => {
    mockAuth.mockResolvedValue(sesionFantasma)
    expect(await status(await requireAuth())).toBe(401)
  })

  it('rechaza (401) cuando auth() devuelve null', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await status(await requireAuth())).toBe(401)
  })

  it('deja pasar una sesión con user.id', async () => {
    mockAuth.mockResolvedValue(sesionAdmin)
    expect(await status(await requireAuth())).toBe('ok')
  })
})

describe('requireAuthWithoutMustChangePassword — fail-closed', () => {
  it('rechaza (401) una sesión sin user.id', async () => {
    mockAuth.mockResolvedValue(sesionFantasma)
    expect(await status(await requireAuthWithoutMustChangePassword())).toBe(401)
  })
})

describe('requireRole — fail-closed', () => {
  it('rechaza (401) una sesión sin user.id (vía auth())', async () => {
    mockAuth.mockResolvedValue(sesionFantasma)
    expect(await status(await requireRole('ADMIN'))).toBe(401)
  })

  it('rechaza (401) una existingSession sin user.id sin llamar auth()', async () => {
    const r = await requireRole('ADMIN', sesionFantasma as never)
    expect(await status(r)).toBe(401)
    expect(mockAuth).not.toHaveBeenCalled()
  })

  it('deja pasar al rol correcto', async () => {
    mockAuth.mockResolvedValue(sesionAdmin)
    expect(await status(await requireRole('ADMIN'))).toBe('ok')
  })
})

describe('requirePermission — fail-closed', () => {
  it('rechaza (401) una sesión sin user.id antes de evaluar el permiso', async () => {
    mockAuth.mockResolvedValue(sesionFantasma)
    // 401 (no autenticado), no 403 (autenticado sin permiso).
    expect(await status(await requirePermission('view:pedidos'))).toBe(401)
  })
})
