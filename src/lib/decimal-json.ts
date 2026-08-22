import { Prisma } from '@prisma/client'

/**
 * Convierte recursivamente instancias de Prisma.Decimal a number antes de
 * pasar por NextResponse.json(). Decimal.toJSON() devuelve un string
 * ("50000"), así que JSON.stringify (usado internamente por
 * NextResponse.json, y también por el patrón JSON.parse(JSON.stringify(x))
 * usado en otros endpoints) serializa montos como string, no number --
 * rompe cualquier consumidor que espere number (ver e2e/deudas.spec.ts).
 */
export function decimalsToNumbers<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (value instanceof Prisma.Decimal) {
    return value.toNumber() as unknown as T
  }
  if (value instanceof Date) return value
  if (Array.isArray(value)) {
    return value.map(decimalsToNumbers) as unknown as T
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = decimalsToNumbers(val)
    }
    return result as T
  }
  return value
}
