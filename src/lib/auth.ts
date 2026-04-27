import NextAuth, { type NextAuthConfig } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './prisma'

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

          if (user.password === credentials.password) {
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
    async jwt({ token, user }: any) {
      if (user) {
        token.role = user.role
      }
      return token
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.role = token.role
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt' as const,
    maxAge: 4 * 60 * 60,
  },
  trustHost: true,
}

const { handlers, signIn, signOut, auth } = NextAuth(authOptions)

export { handlers, signIn, signOut, auth }