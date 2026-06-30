import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSessionLimit } from '@/lib/session-limits'
import { executeSerializableWithRetry } from '@/lib/serializable'
import { logger } from '@/lib/logger'
import type { Role } from '@/lib/constants'

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
}

/**
 * Register a new active session and enforce per-role concurrent device limits.
 * Uses Serializable isolation with retries to prevent races during concurrent logins.
 */
export async function enforceSessionLimit(
  input: EnforceSessionLimitInput,
): Promise<EnforceSessionLimitResult> {
  return executeSerializableWithRetry(async (tx) => {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + input.slidingMaxAgeMs)

    // 1. Lazy cleanup of expired sessions for this user
    await tx.sesionActiva.deleteMany({
      where: { usuarioId: input.usuarioId, expiresAt: { lt: now } },
    })

    // 2. Fetch active sessions for this user (excluding the new one being inserted)
    const active = await tx.sesionActiva.findMany({
      where: {
        usuarioId: input.usuarioId,
        sessionId: { not: input.newSessionId },
      },
      orderBy: { lastActive: 'asc' },
      select: { id: true, sessionId: true },
    })

    const limit = getSessionLimit(input.rol)
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
        rol: input.rol,
        userAgent: input.userAgent,
        ip: input.ip,
        dispositivo: input.dispositivo,
        lastActive: now,
        expiresAt,
      },
      create: {
        usuarioId: input.usuarioId,
        sessionId: input.newSessionId,
        rol: input.rol,
        userAgent: input.userAgent,
        ip: input.ip,
        dispositivo: input.dispositivo,
        createdAt: now,
        lastActive: now,
        expiresAt,
      },
    })

    return { inserted: true, evictedSessionIds }
  }, 'session/enforce-limit')
}

export interface TouchSessionInput {
  sessionId: string
  slidingMaxAgeMs: number
}

/**
 * Extend the expiration of an active session (sliding window).
 * Called only when the JWT sliding session is actually extended.
 */
export async function touchSession({
  sessionId,
  slidingMaxAgeMs,
}: TouchSessionInput): Promise<void> {
  try {
    await prisma.sesionActiva.updateMany({
      where: { sessionId },
      data: {
        lastActive: new Date(),
        expiresAt: new Date(Date.now() + slidingMaxAgeMs),
      },
    })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown error', sessionId },
      'Error touching session',
    )
    // Fail-open: session tracking is best-effort for sliding extension
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
    return false
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
    // Fail-open on P2021 (table missing). This prevents a schema drift
    // (e.g. migration not applied) from locking every user out of the app.
    // Other errors still invalidate the session.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      logger.warn(
        { sessionId },
        'SesionActiva table missing (P2021); treating session as valid to avoid lockout',
      )
      return true
    }
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown error', sessionId },
      'Error checking session existence',
    )
    return false
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
  return executeSerializableWithRetry(async (tx) => {
    const now = new Date()
    await tx.sesionActiva.deleteMany({
      where: { usuarioId, expiresAt: { lt: now } },
    })

    const active = await tx.sesionActiva.findMany({
      where: { usuarioId },
      orderBy: { lastActive: 'asc' },
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
  }, 'session/reconcile-role-change')
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
