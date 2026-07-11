import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { TrabajadorCreateSchema, normalizeTrabajador } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const rol = searchParams.get('rol')
    const activo = searchParams.get('activo')
    const usaMoto = searchParams.get('usaMoto')

    const where: Record<string, unknown> = {}
    if (rol) where.rol = rol
    if (activo === null) {
      where.activo = true
    } else {
      where.activo = activo === 'true'
    }
    if (usaMoto !== null) {
      where.usaMoto = usaMoto === 'true'
    }

    const trabajadores = await prisma.trabajador.findMany({
      where,
      orderBy: { nombre: 'asc' },
    })
    return apiSuccess({ trabajadores })
  } catch (error) {
    return apiError('Error cargando trabajadores')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = TrabajadorCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const raw = parsed.data
    const data = normalizeTrabajador(raw)

    const trabajador = await prisma.trabajador.create({
      data: {
        nombre: data.nombre,
        rol: data.rol,
        tipoPago: data.tipoPago ?? 'FIJO',
        usaMoto: data.usaMoto ?? false,
        capacidadKg: data.capacidadKg ?? 500,
        comPacaAgua: data.comPacaAgua ?? 0,
        comPacaHielo: data.comPacaHielo ?? 0,
        comBotellon: data.comBotellon ?? 0,
        comRepartAgua: data.comRepartAgua ?? 0,
        comRepartHielo: data.comRepartHielo ?? 0,
        comRepartBotellon: data.comRepartBotellon ?? 0,
        salarioFijo: data.salarioFijo ?? 0,
        telefono: data.telefono,
      },
    })
    logAudit({
      entidad: 'Trabajador',
      registroId: trabajador.id,
      accion: 'CREATE',
      datos: { nombre: parsed.data.nombre, rol: parsed.data.rol },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    publishRealtimeEvent('trabajador.created', trabajador.id).catch(() => {})

    return apiSuccess({ trabajador }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating trabajador:')
    return apiError('Error creando trabajador')
  }
}
