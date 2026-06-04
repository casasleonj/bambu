import NextAuth, { type NextAuthConfig } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import type { JWT } from 'next-auth/jwt'
import type { Session, User } from 'next-auth'
import { logger } from '@/lib/logger'

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
          return {
            id: dbUser.id,
            name: displayName,
            role: dbUser.rol,
            mustChangePassword: dbUser.mustChangePassword,
          }
        }

        await new Promise(r => setTimeout(r, 50 + Math.random() * 50))
        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }: { token: JWT; user?: User; trigger?: string }) {
      // Initial sign-in: persist user data
      if (user) {
        token.sub = user.id
        token.role = (user as User & { role?: string }).role
        token.displayName = (user as User & { name?: string }).name
        token.mustChangePassword = (user as User & { mustChangePassword?: boolean }).mustChangePassword
        token.lastVerified = Date.now()
        return token
      }

      // Re-verify user state from DB every 5 minutes
      // Protects against: role demotion, account deactivation with stale JWT
      const FIVE_MIN = 5 * 60 * 1000
      const lastVerified = (token.lastVerified as number) || 0
      if ((trigger === 'update' || Date.now() - lastVerified > FIVE_MIN) && token.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub as string },
            select: { rol: true, activo: true, nombre: true, apellido: true, username: true, mustChangePassword: true },
          })
          if (!dbUser || !dbUser.activo) {
            // Invalidate token by returning empty — forces re-login
            return { ...token, role: undefined, sub: undefined }
          }
          token.role = dbUser.rol
          token.mustChangePassword = dbUser.mustChangePassword
          const displayName = dbUser.nombre || dbUser.apellido
            ? `${dbUser.nombre} ${dbUser.apellido}`.trim()
            : dbUser.username
          token.displayName = displayName
          token.lastVerified = Date.now()
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
        ;(session.user as Session['user'] & { id?: string; role?: string; name?: string; mustChangePassword?: boolean }).id = token.sub as string
        ;(session.user as Session['user'] & { id?: string; role?: string; name?: string; mustChangePassword?: boolean }).role = token.role as string | undefined
        ;(session.user as Session['user'] & { id?: string; role?: string; name?: string; mustChangePassword?: boolean }).name = token.displayName as string | undefined
        ;(session.user as Session['user'] & { id?: string; role?: string; name?: string; mustChangePassword?: boolean }).mustChangePassword = token.mustChangePassword as boolean | undefined
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
    maxAge: 30 * 60, // 30 minutes (was 4 hours — reduces stolen-token window)
    updateAge: 5 * 60, // refresh JWT every 5 minutes of activity
  },
  trustHost: process.env.AUTH_TRUST_HOST === 'true',
}

const { handlers, signIn, signOut, auth } = NextAuth(authOptions)

export { handlers, signIn, signOut, auth, authOptions }
