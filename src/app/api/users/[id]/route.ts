import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { UserUpdateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        nombre: true,
        apellido: true,
        rol: true,
        activo: true,
        createdAt: true,
        trabajador: { select: { id: true, nombre: true } },
      },
    })
    if (!user) return apiError('Usuario no encontrado', 404)
    return apiSuccess({ user: JSON.parse(JSON.stringify(user)) })
  } catch (error) {
    return apiError('Error cargando usuario')
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const adminId = (authResult.user as { id: string }).id

  try {
    const body = await request.json()
    const parsed = UserUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [parsed.error.issues.map(e => e.message).join(', ')] })
    }

    const { username, rol, activo, password, nombre, apellido } = parsed.data
    const data: Record<string, unknown> = {}

    if (username) {
      const existing = await prisma.user.findUnique({ where: { username } })
      if (existing && existing.id !== id) {
        return apiError('El nombre de usuario ya esta en uso', 409)
      }
      data.username = username
    }

    if (rol) data.rol = rol
    if (activo !== undefined) data.activo = activo
    if (password) data.password = await bcrypt.hash(password, 12)
    if (nombre !== undefined) data.nombre = nombre
    if (apellido !== undefined) data.apellido = apellido

    if (Object.keys(data).length === 0) {
      return apiError('No hay datos para actualizar', 400)
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, nombre: true, apellido: true, rol: true, activo: true },
    })

    logAudit({
      entidad: 'User',
      registroId: user.id,
      accion: 'UPDATE',
      datos: { cambios: Object.keys(data).filter(k => k !== 'password').join(', '), resetPassword: !!password },
      usuarioId: adminId,
    }).catch(() => {})

    return apiSuccess({ user })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating user:')
    return apiError('Error actualizando usuario')
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const adminId = (authResult.user as { id: string }).id

  if (id === adminId) {
    return apiError('No puedes desactivarte a ti mismo', 400)
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return apiError('Usuario no encontrado', 404)
    if (!user.activo) return apiError('El usuario ya esta desactivado', 409)

    await prisma.user.update({
      where: { id },
      data: { activo: false },
    })

    logAudit({
      entidad: 'User',
      registroId: user.id,
      accion: 'DELETE',
      datos: { username: user.username, rol: user.rol },
      usuarioId: adminId,
    }).catch(() => {})

    return apiSuccess({})
  } catch (error) {
    return apiError('Error desactivando usuario')
  }
}
