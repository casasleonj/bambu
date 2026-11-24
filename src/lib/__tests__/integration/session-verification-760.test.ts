import { beforeAll, afterAll, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { resetAndSeed } from './setup'
import { enforceSessionLimit, verifyActiveSession, revokeSession, sessionExists } from '@/lib/session-store'
import { SessionUnavailableError } from '@/lib/session-status'
import type { Role } from '@/lib/constants'

const owned: string[] = []
async function account(role: Role = 'ADMIN') {
  const user = await prisma.user.create({ data: { username: `session760-${randomUUID()}`, password: 'not-used-for-login', nombre: 'Prueba', rol: role } })
  owned.push(user.id)
  const sessionId = randomUUID()
  await enforceSessionLimit({ usuarioId: user.id, rol: role, newSessionId: sessionId, slidingMaxAgeMs: role === 'REPARTIDOR' ? 21600000 : 1800000 })
  return { user, sessionId }
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? '')
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Tests de sesiones solo en PostgreSQL local')
  await resetAndSeed()
})
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: owned } } })
  await prisma.$disconnect()
})

it('renews the database window without an independent token deadline', async () => {
  const { user, sessionId } = await account()
  await prisma.sesionActiva.update({ where: { sessionId }, data: { lastActive: new Date(Date.now() - 120000), expiresAt: new Date(Date.now() + 60000) } })
  const result = await verifyActiveSession(sessionId, user.id)
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') throw new Error('Expected valid session')
  const row = await prisma.sesionActiva.findUniqueOrThrow({ where: { sessionId } })
  expect(result.expiresAt).toBe(row.expiresAt.getTime())
  expect(result.expiresAt).toBeGreaterThan(Date.now() + 1790000)
})

it('never revives an expired or deleted session', async () => {
  const { user, sessionId } = await account()
  await prisma.sesionActiva.update({ where: { sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } })
  expect(await verifyActiveSession(sessionId, user.id)).toEqual({ status: 'invalid' })
  await revokeSession(sessionId)
  expect(await verifyActiveSession(sessionId, user.id)).toEqual({ status: 'invalid' })
  expect(await prisma.sesionActiva.count({ where: { sessionId } })).toBe(0)
})

it('rejects a different owner without deleting the legitimate session', async () => {
  const { user, sessionId } = await account()
  expect(await verifyActiveSession(sessionId, 'different-user')).toEqual({ status: 'invalid' })
  expect((await verifyActiveSession(sessionId, user.id)).status).toBe('valid')
})

it('does not inherit the six-hour window after REPARTIDOR becomes ADMIN', async () => {
  const { user, sessionId } = await account('REPARTIDOR')
  await prisma.user.update({ where: { id: user.id }, data: { rol: 'ADMIN' } })
  const result = await verifyActiveSession(sessionId, user.id)
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') throw new Error('Expected valid session')
  expect(result.maxAgeMs).toBe(1800000)
  expect(result.user.role).toBe('ADMIN')
  expect(result.expiresAt).toBeLessThanOrEqual(Date.now() + 1800000)
  expect((await prisma.sesionActiva.findUniqueOrThrow({ where: { sessionId } })).rol).toBe('ADMIN')
})

it('reconciles the lower limit without dropping the current session', async () => {
  const { user, sessionId } = await account()
  await enforceSessionLimit({ usuarioId: user.id, rol: 'ADMIN', newSessionId: randomUUID(), slidingMaxAgeMs: 1800000 })
  await prisma.user.update({ where: { id: user.id }, data: { rol: 'REPARTIDOR' } })
  expect((await verifyActiveSession(sessionId, user.id)).status).toBe('valid')
  expect(await prisma.sesionActiva.count({ where: { usuarioId: user.id } })).toBe(1)
  expect(await sessionExists(sessionId)).toBe(true)
})

it('deactivation invalidates all observed credentials and reactivation does not recreate them', async () => {
  const { user, sessionId } = await account()
  await prisma.user.update({ where: { id: user.id }, data: { activo: false } })
  expect(await verifyActiveSession(sessionId, user.id)).toEqual({ status: 'invalid' })
  expect(await prisma.sesionActiva.count({ where: { usuarioId: user.id } })).toBe(0)
  await prisma.user.update({ where: { id: user.id }, data: { activo: true } })
  expect(await verifyActiveSession(sessionId, user.id)).toEqual({ status: 'invalid' })
})

it('missing table is unavailable, never valid or a permanent invalidation', async () => {
  const { user, sessionId } = await account()
  await prisma.$executeRawUnsafe('ALTER TABLE "SesionActiva" RENAME TO "SesionActiva_qa760_unavailable"')
  try {
    expect(await verifyActiveSession(sessionId, user.id)).toEqual({ status: 'unavailable' })
    await expect(revokeSession(sessionId)).rejects.toBeInstanceOf(SessionUnavailableError)
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "SesionActiva_qa760_unavailable" RENAME TO "SesionActiva"')
  }
  expect((await verifyActiveSession(sessionId, user.id)).status).toBe('valid')
})

it('revocation wins over concurrent renewals without inserting a replacement row', async () => {
  const { user, sessionId } = await account()
  await prisma.sesionActiva.update({ where: { sessionId }, data: { lastActive: new Date(Date.now() - 120000) } })
  await Promise.all([...[1, 2, 3, 4].map(() => verifyActiveSession(sessionId, user.id)), revokeSession(sessionId)])
  expect(await verifyActiveSession(sessionId, user.id)).toEqual({ status: 'invalid' })
  expect(await prisma.sesionActiva.count({ where: { sessionId } })).toBe(0)
})
