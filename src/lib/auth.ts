import NextAuth, { type NextAuthConfig } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { prisma } from './prisma'
import type { JWT } from 'next-auth/jwt'
import type { Session, User } from 'next-auth'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/audit'
import { getRequestHeadersSafe } from '@/lib/request-headers-safe'
import { parseDeviceName } from '@/lib/user-agent'
import { isLoginCapableRole } from '@/lib/session-limits'
import {
  enforceSessionLimit,
  touchSession,
  revokeSession,
  sessionExists,
  reconcileSessionsAfterRoleChange,
} from '@/lib/session-store'
import type { Role } from '@/lib/constants'

const DUMMY_HASH = '$2b$12$3efHSCLxFTFy3/JJefgSmeHE/A.YexA51FcSccHtb8u0UvLR7mTWm'

const authOptions: NextAuthConfig = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Usuario', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null
        }

        let dbUser: { id: string; username: string; password: string; rol: string; activo: boolean; nombre: string; apellido: string; mustChangePassword: boolean } | null = null
        let hashToCompare = DUMMY_HASH

        try {
          dbUser = await prisma.user.findUnique({
            where: { username: credentials.username as string },
          })
          if (dbUser && dbUser.activo) {
            hashToCompare = dbUser.password
          }
        } catch (error) {
          logger.error({ err: error instanceof Error ? error.message : 'Unknown error' }, 'Auth error:')
        }

        const valid = await bcrypt.compare(
          credentials.password as string,
          hashToCompare
        )

        if (dbUser && dbUser.activo && valid) {
          const displayName = dbUser.nombre || dbUser.apellido
            ? `${dbUser.nombre} ${dbUser.apellido}`.trim()
            : dbUser.username
          // S-3 fix: log successful login for audit trail
          logger.info(
            { userId: dbUser.id, username: dbUser.username, role: dbUser.rol },
            'Auth: login exitoso',
          )
          return {
            id: dbUser.id,
            name: displayName,
            role: dbUser.rol,
            mustChangePassword: dbUser.mustChangePassword,
          }
        }

        // S-3 fix: log failed login attempt with username for security audit
        // (without leaking the password). Helps detect brute force and
        // account compromise attempts.
        logger.warn(
          {
            username: credentials.username,
            userExists: dbUser !== null,
            userActive: dbUser?.activo ?? false,
            // Don't log the password or hash (security: avoid hash leaks)
          },
          'Auth: login fallido',
        )

        await new Promise(r => setTimeout(r, 50 + Math.random() * 50))
        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }: { token: JWT; user?: User; trigger?: string }) {
      // Initial sign-in: persist user data and register active session
      if (user) {
        token.sub = user.id
        token.role = (user as User & { role?: string }).role
        token.displayName = (user as User & { name?: string }).name
        token.mustChangePassword = (user as User & { mustChangePassword?: boolean }).mustChangePassword
        token.lastVerified = Date.now()
        // FIX Fase 4 §4.3 + Sprint 6: REPARTIDOR tiene sesión extendida (6h)
        // porque su flujo de trabajo es offline-first en campo con 2G/3G y
        // no puede re-loguear a mitad de un embarque. El resto de roles
        // mantiene 30 min por seguridad. Los permisos de REPARTIDOR ya
        // están recortados (solo lectura + sus propios embarques), lo
        // que mitiga el riesgo de un token robado.
        const role = (user as User & { role?: string }).role
        const sessionSeconds = role === 'REPARTIDOR' ? 6 * 60 * 60 : 30 * 60
        const maxAgeMs = sessionSeconds * 1000
        token.sessionMaxAgeMs = maxAgeMs
        token.sessionExpiresAt = Date.now() + maxAgeMs

        // Register server-side session for device limit tracking.
        const newSessionId = randomUUID()
        token.sessionId = newSessionId
        const userId = user.id as string

        try {
          const { ip, userAgent } = await getRequestHeadersSafe()
          const dispositivo = parseDeviceName(userAgent)

          if (isLoginCapableRole(role)) {
            const result = await enforceSessionLimit({
              usuarioId: userId,
              rol: role as Role,
              newSessionId,
              userAgent,
              ip,
              dispositivo,
              slidingMaxAgeMs: maxAgeMs,
            })

            // Audit login
            await logAudit({
              entidad: 'User',
              registroId: userId,
              accion: 'LOGIN',
              datos: { sessionId: newSessionId, dispositivo, userAgent, ip },
              usuarioId: userId,
              ip,
              userAgent,
            }).catch(() => {})

            // Audit evictions
            for (const evictedSessionId of result.evictedSessionIds) {
              await logAudit({
                entidad: 'User',
                registroId: userId,
                accion: 'SESSION_EVICTED',
                datos: { sessionId: newSessionId, evictedSessionId, reason: 'LIMIT_EXCEEDED_LRU' },
                usuarioId: userId,
                ip,
              }).catch(() => {})
            }
          }
        } catch (error) {
          logger.error(
            { err: error instanceof Error ? error.message : 'Unknown error', userId },
            'Error registering active session at sign-in:',
          )
          // Fail-open: allow login even if session tracking fails
        }

        return token
      }

      // SLIDING SESSION (Sprint 6): si hay actividad reciente y la sesión
      // aún no expiró, extender automáticamente. Patrón custom porque
      // Auth.js v5 NO renueva exp automáticamente con uso online
      // (https://authjs.dev/reference/core#updateage). Esto da UX
      // "infinite session" mientras el usuario esté activo.
      //
      // Ventana de actividad: 15 min. Si el último request fue hace menos
      // de 15 min, extender. Si pasaron más, no extender (usuario idle
      // o app cerrada) — pero la sesión sigue vigente hasta sessionExpiresAt.
      const FIVE_MIN = 5 * 60 * 1000
      const lastVerified = (token.lastVerified as number) || 0
      const SLIDING_WINDOW_MS = 15 * 60 * 1000
      const sessionExpiresAt = (token.sessionExpiresAt as number) || 0
      const maxAgeMs = (token.sessionMaxAgeMs as number) || 0
      let didExtend = false

      if (
        maxAgeMs > 0 &&
        sessionExpiresAt > 0 &&
        Date.now() - lastVerified < SLIDING_WINDOW_MS &&
        Date.now() < sessionExpiresAt
      ) {
        // Hay actividad reciente y aún no expiró → extender
        token.sessionExpiresAt = Date.now() + maxAgeMs
        didExtend = true
      }

      // If the session was evicted/revoked or lacks a sessionId, invalidate.
      // This check runs on every request so that device-limit evictions take
      // effect immediately, even though the JWT itself is stateless.
      const currentSessionId = token.sessionId as string | undefined
      if (currentSessionId) {
        const stillValid = await sessionExists(currentSessionId).catch(() => false)
        if (!stillValid) {
          logger.info({ userId: token.sub, sessionId: currentSessionId }, 'Sesión invalidada: no existe o expiró')
          return { ...token, role: undefined, sub: undefined, sessionId: undefined }
        }
      }

      // Re-verify user state from DB every 5 minutes
      // Protects against: role demotion, account deactivation with stale JWT
      if ((trigger === 'update' || Date.now() - lastVerified > FIVE_MIN) && token.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub as string },
            select: { rol: true, activo: true, nombre: true, apellido: true, username: true, mustChangePassword: true },
          })
          if (!dbUser || !dbUser.activo) {
            // Invalidate token by returning empty — forces re-login
            return { ...token, role: undefined, sub: undefined, sessionId: undefined }
          }

          // Reconcile device limits when role changes
          const newRole = dbUser.rol as Role
          const oldRole = token.role as Role | undefined
          if (oldRole && oldRole !== newRole && currentSessionId) {
            const evictedIds = await reconcileSessionsAfterRoleChange(token.sub as string, newRole, currentSessionId)
            if (evictedIds.length > 0) {
              logger.info({ userId: token.sub, evictedCount: evictedIds.length, oldRole, newRole }, 'Sesiones evictadas por cambio de rol')
            }
          }

          token.role = newRole
          token.mustChangePassword = dbUser.mustChangePassword
          const displayName = dbUser.nombre || dbUser.apellido
            ? `${dbUser.nombre} ${dbUser.apellido}`.trim()
            : dbUser.username
          token.displayName = displayName
          token.lastVerified = Date.now()

          // Touch DB only when sliding session was extended; reduces write load
          if (didExtend && currentSessionId) {
            await touchSession({ sessionId: currentSessionId, slidingMaxAgeMs: maxAgeMs })
          }
        } catch (error) {
          logger.error({ err: error instanceof Error ? error.message : 'Unknown error' }, 'JWT refresh error:')
        }
      }

      return token
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      // FIX C-9: solo poblar session.user si hay un token.sub válido.
      // Cuando el usuario es desactivado, el jwt callback (líneas 82-85)
      // pone sub:undefined. Si propagamos session.user con defaults de
      // NextAuth, el proxy.ts NO puede detectar la desactivación vía
      // \`if (!session?.user)\`. Por eso validamos token.sub aquí también.
      //
      // Con este cambio, session.user queda con sus defaults de NextAuth
      // (que NO incluyen un id real) cuando el usuario está desactivado,
      // y el proxy.ts:59 check \`!session?.user?.id\` correctamente lo
      // redirige a /login.
      if (session.user && token.sub) {
        const extendedUser = session.user as Session['user'] & {
          id?: string
          role?: string
          name?: string
          mustChangePassword?: boolean
          sessionId?: string
        }
        extendedUser.id = token.sub as string
        extendedUser.role = token.role as string | undefined
        extendedUser.name = token.displayName as string | undefined
        extendedUser.mustChangePassword = token.mustChangePassword as boolean | undefined
        extendedUser.sessionId = token.sessionId as string | undefined
      }
      return session
    },
    async authorized({ auth }) {
      // This callback is invoked when using `export { auth as proxy }` pattern.
      // Currently we use auth() wrapper in proxy.ts, so this serves as a fallback.
      // All auth logic (redirects, role checks, mustChangePassword) lives in proxy.ts.
      return !!auth?.user
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt' as const,
    // FIX Fase 4 §4.3 + Sprint 6: maxAge global = 6h (REPARTIDOR con
    // sliding session). El resto de roles respeta su propio
    // sessionExpiresAt (30 min) seteado en el callback jwt() de arriba.
    // updateAge=5min mantiene el refresh transparente mientras hay
    // actividad online.
    maxAge: 6 * 60 * 60, // 6 hours (REPARTIDOR case); otros roles respetan su sessionExpiresAt propio
    updateAge: 5 * 60,
  },
  trustHost: process.env.AUTH_TRUST_HOST === 'true',
  events: {
    async signOut(message) {
      // In JWT strategy, message.token holds the JWT. It may be null if the
      // session was already invalid/expired when the client requested signOut.
      if (!('token' in message) || !message.token?.sessionId) return

      const sessionId = message.token.sessionId as string
      const userId = message.token.sub as string | undefined
      try {
        const wasRevoked = await revokeSession(sessionId)
        if (wasRevoked && userId) {
          await logAudit({
            entidad: 'User',
            registroId: userId,
            accion: 'FORCE_LOGOUT',
            datos: { sessionId, reason: 'USER_LOGOUT' },
            usuarioId: userId,
          }).catch(() => {})
        }
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? error.message : 'Unknown error', sessionId },
          'Error revoking session on signOut:',
        )
      }
    },
  },
}

const { handlers, signIn, signOut, auth } = NextAuth(authOptions)

export { handlers, signIn, signOut, auth, authOptions }
