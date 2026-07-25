import { ROLES, type Role } from '@/lib/constants'

const ROLE_VALUES = Object.values(ROLES)

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

function loadEnvSessionLimits(): Partial<Record<Role, number>> {
  const raw = process.env.SESSION_LIMITS_JSON
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    const result: Partial<Record<Role, number>> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (ROLE_VALUES.includes(key as Role) && typeof value === 'number') {
        result[key as Role] = value
      }
    }
    return result
  } catch {
    return {}
  }
}

export function getSessionLimit(role: Role): number {
  const envLimits = loadEnvSessionLimits()
  return envLimits[role] ?? SESSION_LIMITS[role] ?? 1
}

export function isLoginCapableRole(role: string | undefined): role is Role {
  return role !== undefined && role in SESSION_LIMITS
}
