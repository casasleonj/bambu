import { dashboardDateRange } from '@/lib/dashboard-date-range'
import { requireAuth, requirePermission } from '@/lib/auth-check'
import { apiError, apiSuccess } from '@/lib/api-response'
import { contarEntregasDelDia } from '@/lib/entregas-hoy'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  const session = await requireAuth()
  if (session instanceof Response) return session
  const permiso = await requirePermission('view:dashboard', session)
  if (permiso instanceof Response) return permiso
  try {
    const params = new URL(request.url).searchParams
    const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const from = params.get('from') ?? dia
    const to = params.get('to') ?? from
    const rango = dashboardDateRange(from, to)
    const entregas = await contarEntregasDelDia(rango)
    const response = apiSuccess({ entregas })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    if (error instanceof Error && /Fecha|rango|calendario/i.test(error.message)) return apiError(error.message, 400)
    logger.error({ err: error }, 'No se pudo consultar las entregas de hoy')
    return apiError('No se pudo consultar las entregas de hoy.', 503)
  }
}
