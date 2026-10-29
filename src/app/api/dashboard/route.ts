import { requireAuth, requirePermission } from '@/lib/auth-check'
import { apiError, apiSuccess } from '@/lib/api-response'
import { fetchCurrentDashboardData } from '@/modules/dashboard'
import { toLegacyDashboardData } from '@/modules/dashboard/presentation'
import { logger } from '@/lib/logger'

export async function GET() {
  const session = await requireAuth()
  if (session instanceof Response) return session
  const permiso = await requirePermission('view:dashboard', session)
  if (permiso instanceof Response) return permiso
  try {
    const dashboard = toLegacyDashboardData(
      await fetchCurrentDashboardData(),
      session.user?.role,
    )
    const response = apiSuccess({ dashboard })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    logger.error({ err: error }, 'No se pudo consultar el dashboard')
    return apiError(
      'No se pudo actualizar el dashboard. Conserva la última lectura y vuelve a intentarlo.',
      503,
    )
  }
}
