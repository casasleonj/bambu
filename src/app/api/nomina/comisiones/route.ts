import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { parseDateParam, todayStringBogota } from '@/lib/dates'
import { dateRangeForDay } from '@/lib/date-helpers'
import { HistorialComisionLimiteError, leerDetalleHistorialComision, leerHistorialComisiones } from '@/lib/nomina-historial-comisiones'

export const dynamic = 'force-dynamic'

const fechaValida = (v: string) => parseDateParam(v, '') === v && v.length === 10
const entero = (v: string, max: number) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= max
const textoValido = (v: string) => v.length > 0 && v.length <= 128 && v.trim() === v

/** #1010 F1: consulta independiente de liquidaciones; ninguna escritura. */
export async function GET(request: NextRequest) {
  const auth = await requireRole(['ADMIN', 'CONTADOR'])
  if (auth instanceof Response) return auth
  const p = new URL(request.url).searchParams
  const modo = p.get('modo') ?? 'lista'
  const trabajadorId = p.get('trabajadorId')
  const concepto = p.get('concepto')
  if ((trabajadorId !== null && !textoValido(trabajadorId)) || (concepto !== null && !textoValido(concepto))) {
    return apiError('Filtro inválido', 400)
  }
  try {
    if (modo === 'detalle') {
      const fechaTrabajo = p.get('fechaTrabajo') ?? ''
      if (!trabajadorId || !concepto || !fechaValida(fechaTrabajo)) return apiError('Identifica trabajador, fecha de trabajo y concepto', 400)
      const detalle = await prisma.$transaction(tx => leerDetalleHistorialComision(tx, { trabajadorId, fechaTrabajo, concepto }),
        { isolationLevel: 'RepeatableRead', timeout: 15000 })
      if (!detalle) return apiError('No hay pagos para esa jornada y concepto', 404)
      const respuesta = apiSuccess({ detalle })
      respuesta.headers.set('Cache-Control', 'private, no-store')
      return respuesta
    }
    if (modo !== 'lista') return apiError('Modo inválido', 400)
    const desde = p.get('desde') ?? todayStringBogota()
    const hasta = p.get('hasta') ?? desde
    const porFecha = p.get('porFecha') ?? 'TRABAJO'
    const pagina = p.get('pagina') ?? '1'
    const tamano = p.get('tamano') ?? '20'
    if (!fechaValida(desde) || !fechaValida(hasta) || hasta < desde
      || dateRangeForDay(hasta).lt.getTime() - dateRangeForDay(desde).gte.getTime() > 93 * 86_400_000
      || (porFecha !== 'TRABAJO' && porFecha !== 'PAGO') || !entero(pagina, 10000) || !entero(tamano, 50)) {
      return apiError('Filtros inválidos: selecciona un rango de hasta 93 días, fecha de trabajo o pago y paginación válida', 400)
    }
    const resultado = await prisma.$transaction(tx => leerHistorialComisiones(tx, {
      desde, hasta, porFecha, trabajadorId: trabajadorId ?? undefined, concepto: concepto ?? undefined,
      pagina: Number(pagina), tamano: Number(tamano),
    }), { isolationLevel: 'RepeatableRead', timeout: 15000 })
    const respuesta = apiSuccess(resultado)
    respuesta.headers.set('Cache-Control', 'private, no-store')
    return respuesta
  } catch (error) {
    if (error instanceof HistorialComisionLimiteError) return apiError(error.message, 422, { code: 'RANGO_EXCESIVO' })
    logger.error({ err: error instanceof Error ? error.name : 'Unknown' }, 'Error consultando historial de comisiones')
    return apiError('No se pudo consultar el historial de comisiones', 500)
  }
}
