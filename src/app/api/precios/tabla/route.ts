import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { getPriceTable } from '@/lib/pricing'
import { CanalSchema } from '@/lib/zod-schemas'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const canalParam = request.nextUrl.searchParams.get('canal') || 'DOMICILIO'
    const canalValidation = CanalSchema.safeParse(canalParam)
    if (!canalValidation.success) {
      return apiError('Canal inválido. Debe ser: DOMICILIO, PUNTO_VENTA, MAYORISTA o INTERNO', 400)
    }
    const tabla = await getPriceTable(canalValidation.data)
    return apiSuccess({ tabla, canal: canalValidation.data })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching price table:')
    return apiError('Error fetching price table', 500)
  }
}
