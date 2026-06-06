import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { startOfDayInBogota, endOfDayInBogota } from '@/lib/date-helpers'
import { withAdvisoryLock } from '@/lib/locks'
import { logger } from '@/lib/logger'

const CierreDiaSchema = z.object({
  fecha: z.string().datetime().optional(),
  numPedidos: z.coerce.number().int().min(0).optional(),
  totalVentas: z.coerce.number().min(0).optional(),
  aguaVendida: z.coerce.number().int().min(0).optional(),
  hieloVendido: z.coerce.number().int().min(0).optional(),
  botellonVendido: z.coerce.number().int().min(0).optional(),
  bolsaAguaVendida: z.coerce.number().int().min(0).optional(),
  bolsaHieloVendida: z.coerce.number().int().min(0).optional(),
  cobrado: z.coerce.number().min(0).optional(),
  fiado: z.coerce.number().min(0).optional(),
  efectivo: z.coerce.number().min(0).optional(),
  nequi: z.coerce.number().min(0).optional(),
  daviplata: z.coerce.number().min(0).optional(),
  transferencia: z.coerce.number().min(0).optional(),
  baseDia: z.coerce.number().min(0).optional(),
  comisiones: z.coerce.number().min(0).optional(),
  salarios: z.coerce.number().min(0).optional(),
  gastos: z.coerce.number().min(0).optional(),
  stockIniAgua: z.coerce.number().int().min(0).optional(),
  prodAgua: z.coerce.number().int().min(0).optional(),
  stockFinAgua: z.coerce.number().int().min(0).optional(),
  stockIniHielo: z.coerce.number().int().min(0).optional(),
  prodHielo: z.coerce.number().int().min(0).optional(),
  stockFinHielo: z.coerce.number().int().min(0).optional(),
  netoCaja: z.coerce.number().min(0).optional(),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha')

    let where: { fecha?: { gte: Date; lte: Date } } = {}
    if (fecha) {
      const start = startOfDayInBogota(fecha)
      const end = endOfDayInBogota(fecha)
      where = { fecha: { gte: start, lte: end } }
    }
    const cierres = await prisma.cierreDia.findMany({
      where,
      orderBy: { fecha: 'desc' },
      take: 30,
    })

    return apiSuccess({ cierres })
  } catch (error) {
    return apiError('Error', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = CierreDiaSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const { fecha, ...rest } = parsed.data

    // FIX F-N15 (hallazgo 17): usar withAdvisoryLock('CIERRE', ...) y
    // validar previamente la existencia de un cierre para esa fecha.
    //
    // Antes: prisma.cierreDia.create directo SIN lock. La unique
    // constraint en CierreDia.fecha previene el duplicado a nivel
    // DB, pero causa P2002 → 500 confuso cuando dos admins cierran
    // el mismo día casi simultáneo. Peor aún: hay inconsistencia
    // con el endpoint /api/cierre que SÍ usa el lock 'CIERRE' y
    // re-valida antes de crear.
    //
    // Ahora: con lock 'CIERRE' (mismo que /api/cierre), dos admins
    // se serializan. La validación previa dentro del lock detecta
    // el duplicado y devuelve 409 limpio.
    const cierre = await withAdvisoryLock('CIERRE', async (tx) => {
      // Re-leer y re-validar dentro del lock
      const targetDate = fecha ? new Date(fecha) : new Date()
      const start = startOfDayInBogota(targetDate.toISOString())
      const end = endOfDayInBogota(targetDate.toISOString())

      const existente = await tx.cierreDia.findFirst({
        where: {
          fecha: { gte: start, lte: end },
        },
      })
      if (existente) {
        throw new Error('CIERRE_YA_EXISTE')
      }

      return tx.cierreDia.create({
        data: {
          fecha: targetDate,
          ...rest,
        },
      })
    })

    logAudit({
      entidad: 'CierreDia',
      registroId: cierre.id,
      accion: 'CREATE',
      datos: { fecha: cierre.fecha, totalVentas: cierre.totalVentas },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ cierre }, 201)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'CIERRE_YA_EXISTE') {
        return apiError('Ya existe un cierre para esta fecha', 409)
      }
      // Capturar P2002 residual (por si el lock no se adquiere correctamente
      // en una condición de borde) y mapearlo a 409 limpio
      if (error.message.includes('Unique constraint') || (error as { code?: string }).code === 'P2002') {
        return apiError('Ya existe un cierre para esta fecha', 409)
      }
      logger.error({ err: error.message }, 'Error creating cierre:')
    }
    return apiError('Error', 500)
  }
}
