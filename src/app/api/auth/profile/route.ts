import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { ProfileUpdateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const user = await prisma.user.findUnique({
      where: { id: (authResult.user as { id: string }).id },
      select: {
        id: true,
        username: true,
        nombre: true,
        apellido: true,
        rol: true,
        activo: true,
        createdAt: true,
        trabajador: { select: { nombre: true } },
      },
    })
    if (!user) return apiError('Usuario no encontrado', 404)
    return apiSuccess({ user: JSON.parse(JSON.stringify(user)) })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching profile:')
    return apiError('Error cargando perfil')
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const userId = (authResult.user as { id: string }).id

  try {
    const body = await request.json()
    const parsed = ProfileUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [parsed.error.issues.map(e => e.message).join(', ')] })
    }

    const { username, nombre, apellido, currentPassword, newPassword } = parsed.data
    const data: Record<string, string> = {}

    if (username) {
      const existing = await prisma.user.findUnique({ where: { username } })
      if (existing && existing.id !== userId) {
        return apiError('El nombre de usuario ya esta en uso', 409)
      }
      data.username = username
    }

    if (nombre !== undefined) data.nombre = nombre
    if (apellido !== undefined) data.apellido = apellido

    if (newPassword) {
      const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } })
      if (!dbUser) return apiError('Usuario no encontrado', 404)

      const valid = await bcrypt.compare(currentPassword || '', dbUser.password)
      if (!valid) {
        return apiError('Contraseña actual incorrecta', 403)
      }
      data.password = await bcrypt.hash(newPassword, 12)
    }

    if (Object.keys(data).length === 0) {
      return apiError('No hay datos para actualizar', 400)
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, username: true, nombre: true, apellido: true, rol: true, activo: true },
    })

    logAudit({
      entidad: 'User',
      registroId: user.id,
      accion: 'UPDATE',
      datos: { cambios: Object.keys(data).join(', '), tipo: 'PROFILE' },
      usuarioId: userId,
    }).catch(() => {})

    return apiSuccess({ user })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating profile:')
    return apiError('Error actualizando perfil')
  }
}
