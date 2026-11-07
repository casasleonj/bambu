import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { formatZodError } from '@/lib/utils'
import { startOfDayBogota, todayStringBogota } from '@/lib/dates'
import { sueldosPendientesAl } from '@/lib/sueldos-pendientes'
import { nominaQueCubre } from '@/lib/nomina-cobertura'
import { POST as crearNomina } from '@/app/api/nomina/route'
import { PUT as accionNomina } from '@/app/api/nomina/[id]/route'

/**
 * POST /api/nomina/sueldo/pagar — paga desde el cierre un sueldo fijo que toca (#644). Usa el mismo código que
 * Nómina (crear la nómina del día y marcarla pagada con su medio), así el dinero se cuenta una sola vez: solo
 * el efectivo de la caja genera el egreso que resta del cierre (#641). El monto nunca lo manda el cliente.
 */
const PagarSueldoSchema = z.object({
  trabajadorId: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA']).default('EFECTIVO'),
  /** Sin indicarlo se usa lo configurado en el trabajador. */
  fueraDeCaja: z.boolean().optional(),
})

const json = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  let body: unknown
  try { body = await request.json() } catch { return apiError('Cuerpo inválido', 400) }
  const parsed = PagarSueldoSchema.safeParse(body)
  if (!parsed.success) return apiError(formatZodError(parsed.error), 400)
  const { trabajadorId, fecha, metodo } = parsed.data
  if (fecha > todayStringBogota()) return apiError('No se puede pagar un sueldo de una fecha que no ha llegado', 422, { code: 'FECHA_FUTURA' })

  try {
    const pendientes = await sueldosPendientesAl(prisma, fecha)
    const pendiente = pendientes.find((p) => p.trabajadorId === trabajadorId && p.fecha === fecha)
    if (!pendiente) return apiError('Ese sueldo no está pendiente (ya se pagó o no corresponde a su frecuencia)', 409, { code: 'SUELDO_NO_PENDIENTE' })
    const fueraDeCaja = parsed.data.fueraDeCaja ?? pendiente.fueraDeCaja

    // Si ya hay una nómina pendiente que cubre ese día, se paga esa; si no, se crea la del día.
    let nominaId = (await nominaQueCubre(prisma, trabajadorId, startOfDayBogota(fecha)))?.id
    if (!nominaId) {
      const creada = await crearNomina(json('/api/nomina', 'POST', { trabajadorId, fechaInicio: fecha, fechaFin: fecha, tipoCalculo: 'AUTO' }))
      const cuerpo = await creada.json().catch(() => null) as { data?: { nomina?: { id: string } }; nomina?: { id: string }; error?: { message?: string; code?: string } } | null
      if (!creada.ok) return apiError(cuerpo?.error?.message ?? 'No se pudo crear la nómina del día', creada.status, cuerpo?.error?.code ? { code: cuerpo.error.code } : undefined)
      nominaId = cuerpo?.data?.nomina?.id ?? cuerpo?.nomina?.id
      if (!nominaId) return apiError('No se pudo crear la nómina del día', 500)
    }

    const pagada = await accionNomina(
      json(`/api/nomina/${nominaId}`, 'PUT', { action: 'PAGAR', metodo, fueraDeCaja }),
      { params: Promise.resolve({ id: nominaId }) },
    )
    const resultado = await pagada.json().catch(() => null) as { error?: { message?: string } } | null
    if (!pagada.ok) return apiError(resultado?.error?.message ?? 'No se pudo marcar la nómina como pagada', pagada.status)
    return apiSuccess({ nominaId, fecha, trabajadorId, metodo, fueraDeCaja }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error pagando sueldo fijo:')
    return apiError('No se pudo pagar el sueldo', 500)
  }
}
