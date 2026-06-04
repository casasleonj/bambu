'use client'

import type { Role } from '@/lib/constants'

interface MoneyDisplayProps {
  value: number | string
  userRole?: Role | string | null
  className?: string
}

/**
 * Display a money value formatted according to the user role.
 * ADMIN/CONTADOR see full amount; ASISTENTE/REPARTIDOR see masked ($**).
 */
export function MoneyDisplay({ value, userRole, className }: MoneyDisplayProps) {
  const numValue = typeof value === 'string' ? Number(value) : value
  const isPrivileged = userRole === 'ADMIN' || userRole === 'CONTADOR'

  if (!isPrivileged && numValue > 0) {
    return <span className={className}>$**</span>
  }

  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numValue)

  return <span className={className}>{formatted}</span>
}
