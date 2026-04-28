import NextAuth, { type NextAuthConfig } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import type { JWT } from 'next-auth/jwt'
import type { Session, User } from 'next-auth'

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

        try {
          const user = await prisma.user.findUnique({
            where: { username: credentials.username as string },
          })

          if (!user || !user.activo) {
            return null
          }

          const valid = await bcrypt.compare(
            credentials.password as string,
            user.password
          )

          if (valid) {
            return {
              id: user.id,
              name: user.username,
              role: user.rol,
            }
          }
        } catch (error) {
          console.error('Auth error:', error)
        }

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
      if (trigger === 'update' || Date.now() - lastVerified > FIVE_MIN) {
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
          console.error('JWT refresh error:', error)
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
  trustHost: true,
}

const { handlers, signIn, signOut, auth } = NextAuth(authOptions)

export { handlers, signIn, signOut, auth, authOptions }
