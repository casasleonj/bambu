'use client'

import type { Role } from '@/lib/constants'

interface MoneyDisplayProps {
  /** Money value to display. Accepts number, string, or null. */
  value: number | string | null
  /**
   * User role. ADMIN/CONTADOR see the full amount;
   * ASISTENTE/REPARTIDOR see the masked text.
   */
  userRole?: Role | string | null
  /**
   * If true, always show the formatted value (skip masking).
   * Useful for printing/exporting where the role check is bypassed.
   */
  forceShow?: boolean
  /**
   * Custom text to show when the value is masked.
   * Defaults to "$**".
   */
  maskedText?: string
  className?: string
}

/**
 * Returns true if the given role should see money values masked.
 * Solo REPARTIDOR ve masked (por BLOQUEAR_PRECIOS_REPARTIDOR).
 * ADMIN, CONTADOR, ASISTENTE y null ven el monto completo.
 */
export function shouldMaskMoneyForRole(userRole: string | null | undefined): boolean {
  return userRole === 'REPARTIDOR'
}

/**
 * Display a money value formatted according to the user role.
 * ADMIN/CONTADOR see full amount; ASISTENTE/REPARTIDOR see masked.
 */
export function MoneyDisplay({
  value,
  userRole,
  forceShow = false,
  maskedText = '$**',
  className,
}: MoneyDisplayProps) {
  const numValue =
    value === null || value === undefined
      ? 0
      : typeof value === 'string'
        ? Number(value)
        : value
  const isPrivileged = userRole === 'ADMIN' || userRole === 'CONTADOR'

  if (!forceShow && !isPrivileged && numValue > 0) {
    return <span className={className}>{maskedText}</span>
  }

  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numValue)

  return <span className={className}>{formatted}</span>
}
