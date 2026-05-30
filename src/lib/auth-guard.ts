import 'server-only'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { userCan, type Permission, getRedirectForRole } from '@/lib/permissions'
import type { Role } from '@/lib/constants'

/**
 * Require a specific permission to access a Server Component page.
 * Redirects to login if unauthenticated, or to the role's default page if unauthorized.
 *
 * Usage in a page:
 *   await requirePagePermission('view:reportes')
 */
export async function requirePagePermission(permission: Permission) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const role = (session.user as { role?: Role } | undefined)?.role
  if (!userCan(role, permission)) {
    redirect(getRedirectForRole(role))
  }

  return session
}
