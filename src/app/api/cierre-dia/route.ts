import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

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

    const where = fecha ? { fecha: new Date(fecha) } : {}
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
    const cierre = await prisma.cierreDia.create({
      data: {
        fecha: fecha ? new Date(fecha) : new Date(),
        ...rest,
      },
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
    return apiError('Error', 500)
  }
}
