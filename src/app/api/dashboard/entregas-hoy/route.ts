import { requireAuth, requirePermission } from '@/lib/auth-check'
import { apiError, apiSuccess } from '@/lib/api-response'
import { contarEntregasDelDia } from '@/lib/entregas-hoy'
import { logger } from '@/lib/logger'

export async function GET() {
  const session = await requireAuth()
  if (session instanceof Response) return session
  const permiso = await requirePermission('view:dashboard', session)
  if (permiso instanceof Response) return permiso
  try {
    const dia = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Bogota',
    })
    const start = new Date(`${dia}T00:00:00-05:00`)
    const entregas = await contarEntregasDelDia({
      start,
      end: new Date(+start + 86_400_000),
    })
    const response = apiSuccess({ entregas })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    logger.error({ err: error }, 'No se pudo consultar las entregas de hoy')
    return apiError('No se pudo consultar las entregas de hoy.', 503)
  }
}
