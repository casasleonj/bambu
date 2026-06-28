import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  resetAndSeed,
  disconnect,
  getAdminUser,
  getRepartidorUser,
} from './setup'
import {
  enforceSessionLimit,
  sessionExists,
  revokeSession,
  cleanupExpiredSessions,
  reconcileSessionsAfterRoleChange,
} from '@/lib/session-store'
import { prisma } from '@/lib/prisma'

const ONE_HOUR = 60 * 60 * 1000

describe('session-store integration', () => {
  beforeAll(async () => {
    await resetAndSeed()
  })

  afterAll(async () => {
    await disconnect()
  })

  it('inserta una sesión nueva sin evictar si está bajo el límite', async () => {
    await prisma.sesionActiva.deleteMany({})
    const admin = await getAdminUser()

    const result = await enforceSessionLimit({
      usuarioId: admin.id,
      rol: 'ADMIN',
      newSessionId: 'session-1',
      slidingMaxAgeMs: ONE_HOUR,
    })

    expect(result.inserted).toBe(true)
    expect(result.evictedSessionIds).toEqual([])

    const count = await prisma.sesionActiva.count({ where: { usuarioId: admin.id } })
    expect(count).toBe(1)

    const exists = await sessionExists('session-1')
    expect(exists).toBe(true)
  })

  it('ADMIN puede tener 2 sesiones; la 3ra evicta la más vieja (LRU)', async () => {
    await prisma.sesionActiva.deleteMany({})
    const admin = await getAdminUser()

    await enforceSessionLimit({ usuarioId: admin.id, rol: 'ADMIN', newSessionId: 'oldest', slidingMaxAgeMs: ONE_HOUR })
    // Simulate middle activity so 'oldest' stays at the bottom after touch
    const middle = await prisma.sesionActiva.findUnique({ where: { sessionId: 'oldest' } })
    if (middle) {
      await prisma.sesionActiva.update({
        where: { id: middle.id },
        data: { lastActive: new Date(Date.now() - 10_000) },
      })
    }
    await enforceSessionLimit({ usuarioId: admin.id, rol: 'ADMIN', newSessionId: 'middle', slidingMaxAgeMs: ONE_HOUR })

    const result = await enforceSessionLimit({ usuarioId: admin.id, rol: 'ADMIN', newSessionId: 'newest', slidingMaxAgeMs: ONE_HOUR })

    expect(result.evictedSessionIds).toContain('oldest')
    expect(result.evictedSessionIds).not.toContain('newest')

    const sessions = await prisma.sesionActiva.findMany({
      where: { usuarioId: admin.id },
      orderBy: { lastActive: 'asc' },
    })
    expect(sessions.map((s) => s.sessionId)).toEqual(['middle', 'newest'])
  })

  it('REPARTIDOR solo puede tener 1 sesión; la 2da evicta la 1ra', async () => {
    await prisma.sesionActiva.deleteMany({})
    const repartidor = await getRepartidorUser()

    await enforceSessionLimit({ usuarioId: repartidor.id, rol: 'REPARTIDOR', newSessionId: 'rep-1', slidingMaxAgeMs: ONE_HOUR })
    const result = await enforceSessionLimit({ usuarioId: repartidor.id, rol: 'REPARTIDOR', newSessionId: 'rep-2', slidingMaxAgeMs: ONE_HOUR })

    expect(result.evictedSessionIds).toEqual(['rep-1'])

    const sessions = await prisma.sesionActiva.findMany({
      where: { usuarioId: repartidor.id },
    })
    expect(sessions.map((s) => s.sessionId)).toEqual(['rep-2'])
  })

  it('revokeSession elimina la sesión', async () => {
    await prisma.sesionActiva.deleteMany({})
    const admin = await getAdminUser()

    await enforceSessionLimit({ usuarioId: admin.id, rol: 'ADMIN', newSessionId: 'to-revoke', slidingMaxAgeMs: ONE_HOUR })
    expect(await sessionExists('to-revoke')).toBe(true)

    const revoked = await revokeSession('to-revoke')
    expect(revoked).toBe(true)
    expect(await sessionExists('to-revoke')).toBe(false)
  })

  it('sessionExists retorna false para sesión expirada', async () => {
    await prisma.sesionActiva.deleteMany({})
    const admin = await getAdminUser()

    await prisma.sesionActiva.create({
      data: {
        usuarioId: admin.id,
        sessionId: 'expired-session',
        rol: 'ADMIN',
        expiresAt: new Date(Date.now() - 1000),
        lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    })

    expect(await sessionExists('expired-session')).toBe(false)
  })

  it('cleanupExpiredSessions elimina solo sesiones expiradas', async () => {
    await prisma.sesionActiva.deleteMany({})
    const admin = await getAdminUser()

    await prisma.sesionActiva.createMany({
      data: [
        {
          usuarioId: admin.id,
          sessionId: 'active-1',
          rol: 'ADMIN',
          expiresAt: new Date(Date.now() + ONE_HOUR),
          lastActive: new Date(),
        },
        {
          usuarioId: admin.id,
          sessionId: 'expired-1',
          rol: 'ADMIN',
          expiresAt: new Date(Date.now() - 1000),
          lastActive: new Date(Date.now() - 2 * ONE_HOUR),
        },
      ],
    })

    const deleted = await cleanupExpiredSessions()
    expect(deleted).toBe(1)

    const remaining = await prisma.sesionActiva.findMany({ where: { usuarioId: admin.id } })
    expect(remaining.map((s) => s.sessionId)).toEqual(['active-1'])
  })

  it('reconcileSessionsAfterRoleChange evicta sesiones si el nuevo rol baja el límite', async () => {
    await prisma.sesionActiva.deleteMany({})
    const admin = await getAdminUser()

    await enforceSessionLimit({ usuarioId: admin.id, rol: 'ADMIN', newSessionId: 'admin-1', slidingMaxAgeMs: ONE_HOUR })
    await enforceSessionLimit({ usuarioId: admin.id, rol: 'ADMIN', newSessionId: 'admin-2', slidingMaxAgeMs: ONE_HOUR })

    const evicted = await reconcileSessionsAfterRoleChange(admin.id, 'REPARTIDOR', 'admin-2')

    expect(evicted.length).toBe(1)
    expect(evicted).toContain('admin-1')

    const remaining = await prisma.sesionActiva.findMany({ where: { usuarioId: admin.id } })
    expect(remaining.map((s) => s.sessionId)).toEqual(['admin-2'])
  })
})
