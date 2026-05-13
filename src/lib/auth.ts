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

        let dbUser: { id: string; username: string; password: string; rol: string; activo: boolean } | null = null
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
          return {
            id: dbUser.id,
            name: dbUser.username,
            role: dbUser.rol,
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
            select: { rol: true, activo: true },
          })
          if (!dbUser || !dbUser.activo) {
            // Invalidate token by returning empty — forces re-login
            return { ...token, role: undefined, sub: undefined }
          }
          token.role = dbUser.rol
          token.lastVerified = Date.now()
        } catch (error) {
          logger.error({ err: error instanceof Error ? error.message : 'Unknown error' }, 'JWT refresh error:')
        }
      }

      return token
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user && token.sub) {
        ;(session.user as Session['user'] & { id?: string; role?: string }).id = token.sub as string
        ;(session.user as Session['user'] & { id?: string; role?: string }).role = token.role as string | undefined
      }
      return session
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
