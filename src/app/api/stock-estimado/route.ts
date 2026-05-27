import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getStockEstimadoHoy, setStockEstimadoHoy, clearStockEstimadoHoy } from '@/lib/stock'
import { z } from 'zod'

const StockEstimadoSchema = z.object({
  agua: z.coerce.number().int().min(0),
  hielo: z.coerce.number().int().min(0),
})

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const estimado = await getStockEstimadoHoy()
    return apiSuccess({ estimado })
  } catch {
    return apiError('Error leyendo stock estimado', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()
    const parsed = StockEstimadoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400)
    }

    await setStockEstimadoHoy(parsed.data.agua, parsed.data.hielo)
    return apiSuccess({ message: 'Stock estimado actualizado' })
  } catch {
    return apiError('Error guardando stock estimado', 500)
  }
}

export async function DELETE(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    await clearStockEstimadoHoy()
    return apiSuccess({ message: 'Stock estimado eliminado' })
  } catch {
    return apiError('Error eliminando stock estimado', 500)
  }
}
