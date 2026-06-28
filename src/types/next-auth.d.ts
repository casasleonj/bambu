import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string | null
      name?: string | null
      email?: string | null
      image?: string | null
      role?: string
      mustChangePassword?: boolean
      sessionId?: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string
    displayName?: string
    mustChangePassword?: boolean
    lastVerified?: number
    sessionMaxAgeMs?: number
    sessionExpiresAt?: number
    /** Server-generated session identifier used for device tracking. NOT an offlineId. */
    sessionId?: string
  }
}
