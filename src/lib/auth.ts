import NextAuth, { CredentialsSignin, type NextAuthConfig } from 'next-auth'
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
import { getSessionMaxAgeMs, isLoginCapableRole } from '@/lib/session-limits'
import { SessionUnavailableError } from '@/lib/session-status'
import {
  enforceSessionLimit,
  revokeSession,
  verifyActiveSession,
} from '@/lib/session-store'
import { esUsuarioSistema } from '@/lib/usuario-sistema'

const DUMMY_HASH = '$2b$12$3efHSCLxFTFy3/JJefgSmeHE/A.YexA51FcSccHtb8u0UvLR7mTWm'

class TemporarySigninError extends CredentialsSignin {
  code = 'temporarily_unavailable'
}

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
          // #410: el usuario técnico del sistema nunca inicia sesión; se compara contra el hash
          // de relleno para no delatar por el tiempo de respuesta que la cuenta existe.
          if (dbUser && dbUser.activo && !esUsuarioSistema(dbUser.username)) {
            hashToCompare = dbUser.password
          }
        } catch (error) {
          logger.error({ err: error instanceof Error ? error.message : 'Unknown error' }, 'Auth error:')
          throw new TemporarySigninError()
        }

        const valid = await bcrypt.compare(
          credentials.password as string,
          hashToCompare
        )

        if (dbUser && dbUser.activo && !esUsuarioSistema(dbUser.username) && valid && isLoginCapableRole(dbUser.rol)) {
          const displayName = dbUser.nombre || dbUser.apellido
            ? `${dbUser.nombre} ${dbUser.apellido}`.trim()
            : dbUser.username
          // S-3 fix: log successful login for audit trail
          logger.info(
            { userId: dbUser.id, username: dbUser.username, role: dbUser.rol },
            'Auth: credenciales verificadas',
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
    async jwt({ token, user }: { token: JWT; user?: User }) {
      // Initial sign-in: persist user data and register active session
      if (user) {
        token.sub = user.id
        token.role = (user as User & { role?: string }).role
        token.displayName = (user as User & { name?: string }).name
        token.mustChangePassword = (user as User & { mustChangePassword?: boolean }).mustChangePassword
        token.lastVerified = Date.now()
        const role = (user as User & { role?: string }).role
        if (!user.id || !isLoginCapableRole(role)) throw new CredentialsSignin()
        const maxAgeMs = getSessionMaxAgeMs(role)
        token.sessionMaxAgeMs = maxAgeMs

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
              rol: role,
              newSessionId,
              userAgent,
              ip,
              dispositivo,
              slidingMaxAgeMs: maxAgeMs,
            })

            token.role = result.role
            token.sessionMaxAgeMs = result.maxAgeMs
            token.sessionExpiresAt = result.expiresAt.getTime()
            token.authStatus = 'valid'

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
          throw new TemporarySigninError()
        }

        return token
      }

      if (!token.sub || !token.sessionId) return { ...token, authStatus: 'invalid' }
      const result = await verifyActiveSession(token.sessionId, token.sub)
      if (result.status !== 'valid') {
        // Preserve the signed credential on outages; it grants no access until verified.
        return { ...token, authStatus: result.status }
      }
      return {
        ...token,
        authStatus: 'valid',
        role: result.user.role,
        displayName: result.user.name,
        mustChangePassword: result.user.mustChangePassword,
        sessionMaxAgeMs: result.maxAgeMs,
        sessionExpiresAt: result.expiresAt,
      }
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      // Never leak stale privileges through Auth.js's default user object.
      session.user = {}
      session.authStatus = token.authStatus ?? 'invalid'
      if (session.authStatus === 'valid' && token.sub && token.sessionId) {
        session.user = {
          id: token.sub,
          role: token.role,
          name: token.displayName,
          mustChangePassword: token.mustChangePassword,
          sessionId: token.sessionId,
        }
        if (token.sessionExpiresAt) session.expires = new Date(token.sessionExpiresAt).toISOString()
      }
      return session
    },
    async authorized({ auth }) {
      // This callback is invoked when using `export { auth as proxy }` pattern.
      // Currently we use auth() wrapper in proxy.ts, so this serves as a fallback.
      // All auth logic (redirects, role checks, mustChangePassword) lives in proxy.ts.
      return !!auth?.user?.id
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt' as const,
    // Cookie envelope; the verified server row controls the role's renewable window.
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

const instance = NextAuth(authOptions)

/** Server-only consumers fail closed without throwing inside Auth.js's cookie machinery. */
async function auth(): Promise<Session | null> {
  const session = await instance.auth()
  if (session?.authStatus === 'unavailable') throw new SessionUnavailableError()
  return session
}

const { handlers, signIn, signOut } = instance
// Only the proxy uses the SDK's request wrapper; it checks authStatus explicitly.
const authProxy = instance.auth
export { handlers, signIn, signOut, auth, authProxy, authOptions }
