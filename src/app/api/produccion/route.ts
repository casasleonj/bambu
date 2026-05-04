import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ProduccionCreateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha')

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const where = fecha
      ? {
          fecha: {
            gte: new Date(`${fecha}T00:00:00`),
            lt: new Date(`${fecha}T23:59:59.999`),
          },
        }
      : {
          fecha: {
            gte: today,
            lt: tomorrow,
          },
        }

    const registros = await prisma.produccion.findMany({
      where,
      orderBy: { turno: 'asc' },
      include: { trabajador: true },
    })
    return apiSuccess({ produccion: registros })
  } catch (error) {
    console.error('Error fetching produccion:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = ProduccionCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    
    const prodAgua = Math.round((parsed.data.conteoAAgua + parsed.data.conteoBAgua) / 2)
    const prodHielo = Math.round((parsed.data.conteoAHielo + parsed.data.conteoBHielo) / 2)
    
    const ultimoCierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
    })
    
    const produccion = await prisma.produccion.create({
      data: {
        turno: parsed.data.turno,
        trabajadorId: parsed.data.trabajadorId,
        stockIniAgua: ultimoCierre?.stockFinAgua || 0,
        stockIniHielo: ultimoCierre?.stockFinHielo || 0,
        conteoAAgua: parsed.data.conteoAAgua,
        conteoBAgua: parsed.data.conteoBAgua,
        conteoAHielo: parsed.data.conteoAHielo,
        conteoBHielo: parsed.data.conteoBHielo,
        prodAgua,
        prodHielo,
        obs: parsed.data.obs,
      },
      include: { trabajador: true },
    })
    logAudit({
      entidad: 'Produccion',
      registroId: produccion.id,
      accion: 'CREATE',
      datos: { fecha: produccion.fecha, tipo: produccion.turno },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ produccion }, 201)
  } catch (error) {
    return apiError('Error', 500)
  }
}