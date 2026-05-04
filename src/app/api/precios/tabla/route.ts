import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-check'
import { getPriceTable, type Canal } from '@/lib/pricing'
import { CanalSchema } from '@/lib/zod-schemas'
import { apiSuccess, apiError } from '@/lib/api-response'

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
    console.error('Error fetching price table:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error fetching price table', 500)
  }
}
