import { requireAuth, requirePermission } from '@/lib/auth-check'
import { apiError, apiSuccess } from '@/lib/api-response'
import { fetchCurrentDashboardData, fetchDashboardDateRange } from '@/modules/dashboard'
import { toLegacyDashboardData } from '@/modules/dashboard/presentation'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  const session = await requireAuth()
  if (session instanceof Response) return session
  const permiso = await requirePermission('view:dashboard', session)
  if (permiso instanceof Response) return permiso
  const params = new URL(request.url).searchParams
  const from = params.get('from')
  const to = params.get('to')
  if ((!from && to) || (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    return apiError('Rango de fechas inválido', 400)
  }
  try {
    const dashboard = toLegacyDashboardData(
      from ? await fetchDashboardDateRange(from, to ?? from) : await fetchCurrentDashboardData(),
      session.user?.role,
    )
    const response = apiSuccess({ dashboard })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof Error && (/Fecha|rango|calendario/i).test(error.message)) return apiError(error.message, 400)
    logger.error({ err: error }, 'No se pudo consultar el dashboard')
    return apiError(
      'No se pudo actualizar el dashboard. Conserva la última lectura y vuelve a intentarlo.',
      503,
    )
  }
}
