import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSessionLimit, getSessionMaxAgeMs, isLoginCapableRole } from '@/lib/session-limits'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { logger } from '@/lib/logger'
import type { Role } from '@/lib/constants'
import { esUsuarioSistema } from '@/lib/usuario-sistema'
import { SessionUnavailableError } from '@/lib/session-status'

export interface EnforceSessionLimitInput {
  usuarioId: string
  rol: Role
  newSessionId: string
  userAgent?: string | null
  ip?: string | null
  dispositivo?: string | null
  slidingMaxAgeMs: number
}

export interface EnforceSessionLimitResult {
  inserted: boolean
  evictedSessionIds: string[]
  expiresAt: Date
  role: Role
  maxAgeMs: number
}

/**
 * Register a new active session and enforce per-role concurrent device limits.
 * Uses Serializable isolation with retries to prevent races during concurrent logins.
 */
export async function enforceSessionLimit(
  input: EnforceSessionLimitInput,
): Promise<EnforceSessionLimitResult> {
  return executeSerializableWithRetry(async (tx) => {
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`
    const user = await tx.user.findUnique({
      where: { id: input.usuarioId },
      select: { activo: true, rol: true, username: true },
    })
    if (!user?.activo || !isLoginCapableRole(user.rol) || esUsuarioSistema(user.username)) {
      throw new Error('La cuenta no puede iniciar sesión')
    }
    const role = user.rol
    const maxAgeMs = role === input.rol ? input.slidingMaxAgeMs : getSessionMaxAgeMs(role)
    const expiresAt = new Date(now.getTime() + maxAgeMs)

    // 1. Lazy cleanup of expired sessions for this user
    await tx.sesionActiva.deleteMany({
      where: { usuarioId: input.usuarioId, expiresAt: { lte: now } },
    })

    // 2. Fetch active sessions for this user (excluding the new one being inserted)
    const active = await tx.sesionActiva.findMany({
      where: {
        usuarioId: input.usuarioId,
        sessionId: { not: input.newSessionId },
      },
      orderBy: [{ lastActive: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, sessionId: true },
    })

    const limit = getSessionLimit(role)
    const evictedSessionIds: string[] = []

    // 3. Evict least recently used sessions if over the limit
    if (active.length >= limit) {
      const toEvictCount = active.length - limit + 1
      const toEvict = active.slice(0, toEvictCount)
      const evictIds = toEvict.map((s) => s.id)
      await tx.sesionActiva.deleteMany({
        where: { id: { in: evictIds } },
      })
      evictedSessionIds.push(...toEvict.map((s) => s.sessionId))
      logger.info(
        {
          usuarioId: input.usuarioId,
          evictedCount: toEvict.length,
          limit,
          role: input.rol,
        },
        'Sesiones evictadas por límite de dispositivos',
      )
    }

    // 4. Upsert the new session (idempotent in case of retry)
    await tx.sesionActiva.upsert({
      where: { sessionId: input.newSessionId },
      update: {
        rol: role,
        userAgent: input.userAgent,
        ip: input.ip,
        dispositivo: input.dispositivo,
        lastActive: now,
        expiresAt,
      },
      create: {
        usuarioId: input.usuarioId,
        sessionId: input.newSessionId,
        rol: role,
        userAgent: input.userAgent,
        ip: input.ip,
        dispositivo: input.dispositivo,
        createdAt: now,
        lastActive: now,
        expiresAt,
      },
    })

    return { inserted: true, evictedSessionIds, expiresAt, role, maxAgeMs }
  }, 'session/enforce-limit')
}

export type ActiveSessionVerification =
  | { status: 'invalid' }
  | { status: 'unavailable' }
  | {
    status: 'valid'
    expiresAt: number
    maxAgeMs: number
    user: { id: string; role: Role; name: string; mustChangePassword: boolean }
  }

/** One authority for validity and renewal. Never recreates a revoked row. */
export async function verifyActiveSession(sessionId: string, usuarioId: string): Promise<ActiveSessionVerification> {
  try {
    return await executeSerializableWithRetry(async (tx): Promise<ActiveSessionVerification> => {
      const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`
      const row = await tx.sesionActiva.findUnique({
        where: { sessionId },
        include: { usuario: { select: { id: true, rol: true, activo: true, username: true, nombre: true, apellido: true, mustChangePassword: true } } },
      })
      if (!row || row.usuarioId !== usuarioId || row.expiresAt <= now) return { status: 'invalid' }
      const user = row.usuario
      if (!user.activo || !isLoginCapableRole(user.rol) || esUsuarioSistema(user.username)) {
        // Deactivation is terminal for existing credentials, even if the account is reactivated later.
        await tx.sesionActiva.deleteMany({ where: { usuarioId } })
        return { status: 'invalid' }
      }
      const maxAgeMs = getSessionMaxAgeMs(user.rol)
      const changedRole = row.rol !== user.rol
      let expiresAt = row.expiresAt
      // Bound writes without letting the token invent an independently renewed deadline.
      if (changedRole || now.getTime() - row.lastActive.getTime() >= 60_000) {
        if (changedRole) await reconcileRoleInTransaction(tx, usuarioId, user.rol, sessionId, now)
        expiresAt = new Date(changedRole
          ? now.getTime() + maxAgeMs
          : Math.max(row.expiresAt.getTime(), now.getTime() + maxAgeMs))
        const renewed = await tx.sesionActiva.updateMany({
          where: { id: row.id, usuarioId, sessionId, expiresAt: { gt: now } },
          data: { rol: user.rol, lastActive: new Date(Math.max(row.lastActive.getTime(), now.getTime())), expiresAt },
        })
        if (renewed.count !== 1) return { status: 'unavailable' }
      }
      return {
        status: 'valid', expiresAt: expiresAt.getTime(), maxAgeMs,
        user: { id: user.id, role: user.rol, name: `${user.nombre} ${user.apellido}`.trim() || user.username, mustChangePassword: user.mustChangePassword },
      }
    }, 'session/verify-and-renew')
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : 'Unknown error' }, 'No se pudo verificar la sesión')
    return { status: 'unavailable' }
  }
}

/**
 * Delete a session by its sessionId (used on explicit logout).
 */
export async function revokeSession(sessionId: string): Promise<boolean> {
  try {
    const result = await prisma.sesionActiva.deleteMany({
      where: { sessionId },
    })
    return result.count > 0
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown error', sessionId },
      'Error revoking session',
    )
    throw new SessionUnavailableError()
  }
}

/**
 * Check if a session exists and has not expired.
 */
export async function sessionExists(sessionId: string): Promise<boolean> {
  try {
    const session = await prisma.sesionActiva.findUnique({
      where: { sessionId },
      select: { expiresAt: true },
    })
    if (!session) return false
    return session.expiresAt > new Date()
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown error', sessionId },
      'Error checking session existence',
    )
    throw new SessionUnavailableError()
  }
}

/**
 * Reconcile sessions after a role change.
 * If the user's new role has a lower limit, evict the oldest sessions.
 */
export async function reconcileSessionsAfterRoleChange(
  usuarioId: string,
  newRole: Role,
  currentSessionId: string,
): Promise<string[]> {
  return executeSerializableWithRetry((tx) => reconcileRoleInTransaction(tx, usuarioId, newRole, currentSessionId, new Date()), 'session/reconcile-role-change')
}

async function reconcileRoleInTransaction(
  tx: Prisma.TransactionClient,
  usuarioId: string,
  newRole: Role,
  currentSessionId: string,
  now: Date,
): Promise<string[]> {
    await tx.sesionActiva.deleteMany({
      where: { usuarioId, expiresAt: { lte: now } },
    })

    const active = await tx.sesionActiva.findMany({
      where: { usuarioId },
      orderBy: [{ lastActive: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, sessionId: true },
    })

    const limit = getSessionLimit(newRole)
    if (active.length <= limit) return []

    // Keep current session if possible; evict oldest others
    const currentIndex = active.findIndex((s) => s.sessionId === currentSessionId)
    const others = active.filter((s) => s.sessionId !== currentSessionId)
    const toEvictCount = active.length - limit
    const toEvict = others.slice(0, toEvictCount)

    // Edge case: current session is the oldest and we still need to evict more
    if (toEvict.length < toEvictCount && currentIndex >= 0) {
      const remaining = active.filter((s) => !toEvict.some((e) => e.id === s.id) && s.sessionId !== currentSessionId)
      const extraNeeded = toEvictCount - toEvict.length
      toEvict.push(...remaining.slice(0, extraNeeded))
    }

    await tx.sesionActiva.deleteMany({
      where: { id: { in: toEvict.map((s) => s.id) } },
    })

    return toEvict.map((s) => s.sessionId)
}

/**
 * Global cleanup of expired sessions. Used by cron.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const result = await prisma.sesionActiva.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    return result.count
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown error' },
      'Error cleaning up expired sessions',
    )
    throw error
  }
}
