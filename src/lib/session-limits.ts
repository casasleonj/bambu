import { ROLES, type Role } from '@/lib/constants'

/**
 * Concurrent active session limits per role.
 *
 * - ADMIN / ASISTENTE: 2 devices (back-office users often need laptop + mobile/tablet)
 * - CONTADOR / REPARTIDOR / SELLADOR: 1 device (operational roles)
 */
export const SESSION_LIMITS: Record<Role, number> = {
  [ROLES.ADMIN]: 2,
  [ROLES.ASISTENTE]: 2,
  [ROLES.CONTADOR]: 1,
  [ROLES.REPARTIDOR]: 1,
  [ROLES.SELLADOR]: 1,
}

export function getSessionLimit(role: Role): number {
  return SESSION_LIMITS[role] ?? 1
}

export function isLoginCapableRole(role: string | undefined): role is Role {
  return role !== undefined && role in SESSION_LIMITS
}
