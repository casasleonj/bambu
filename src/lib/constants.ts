// Role constants — single source of truth for authorization checks
export const ROLES = {
  ADMIN: 'ADMIN',
  CONTADOR: 'CONTADOR',
  ASISTENTE: 'ASISTENTE',
  REPARTIDOR: 'REPARTIDOR',
  SELLADOR: 'SELLADOR',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

// Admin/contador roles that can see all data
export const PRIVILEGED_ROLES: Role[] = [ROLES.ADMIN, ROLES.CONTADOR]
