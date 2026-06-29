// Role constants — single source of truth for authorization checks
export const ROLES = {
  ADMIN: 'ADMIN',
  CONTADOR: 'CONTADOR',
  ASISTENTE: 'ASISTENTE',
  REPARTIDOR: 'REPARTIDOR',
  SELLADOR: 'SELLADOR',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

/**
 * Roles that bypass ownership checks in `requireOwnership`.
 *
 * FIX MEDIUM (C-BIZ-4): Renamed from PRIVILEGED_ROLES to clarify intent.
 *
 * IMPORTANTE: estos roles pueden LEER cualquier recurso de cualquier
 * trabajador, pero NO necesariamente pueden MODIFICARLO. Los endpoints
 * de WRITE (POST/PUT/DELETE en /api/embarques, /api/pedidos, etc.)
 * tienen su propio `requireRole([ADMIN, ASISTENTE])` que bloquea a
 * CONTADOR. La única excepción es el caso del CONTADOR navegando al
 * detalle de un embarque via GET (esto sigue siendo permitido).
 *
 * Si necesitas un check más estricto (solo ADMIN puede acceder),
 * usa `requireRole([ROLES.ADMIN])` directamente en el endpoint.
 */
export const PRIVILEGED_READ_ROLES: Role[] = [ROLES.ADMIN, ROLES.CONTADOR]

// Alias para backward compatibility
/** @deprecated Use PRIVILEGED_READ_ROLES instead */
export const PRIVILEGED_ROLES = PRIVILEGED_READ_ROLES

/**
 * Id canónico para ventas anónimas (VENTA_RAPIDA / VENTA_LIBRE).
 *
 * Este id es un contrato fuerte en la aplicación: 13+ lugares del código lo
 * usan como string literal. NUNCA cambiar este valor sin un refactor mayor.
 *
 * El registro correspondiente en la base de datos tiene activo=false para no
 * aparecer en listados de clientes.
 */
export const CANONICAL_CONSUMIDOR_FINAL_ID = 'CONSUMIDOR_FINAL'
