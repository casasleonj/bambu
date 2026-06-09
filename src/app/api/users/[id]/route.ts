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

    // FIX F-27a/F-27b: read+check+update DENTRO de tx con optimistic lock.
    // Antes: findUnique (línea 58) + update directo. Dos races:
    //   F-27a: dos admins renombrando dos users al mismo username
    //           casi simultáneo pasaban el check, segundo recibía
    //           P2002 → 500.
    //   F-27b: dos admins editando al mismo user, last-write-wins
    //           silencioso.
    //
    // Ahora: prisma.$transaction con row lock implícito + optimistic
    // locking sobre updatedAt. Errores thrown con prefijo:
    //   USER_USERNAME_TAKEN → 409
    //   USER_MODIFICADO_POR_OTRO_USUARIO → 409
    //   USER_NOT_FOUND → 404
    //   USER_NO_DATA → 400
    const user = await prisma.$transaction(async (tx) => {
      // Si hay cambio de username, validar que no esté tomado
      if (username) {
        const existing = await tx.user.findUnique({ where: { username } })
        if (existing && existing.id !== id) {
          throw new Error('USER_USERNAME_TAKEN')
        }
      }

      const data: Record<string, unknown> = {}
      if (username) data.username = username
      if (rol) data.rol = rol
      if (activo !== undefined) data.activo = activo
      if (password) data.password = await bcrypt.hash(password, 12)
      if (nombre !== undefined) data.nombre = nombre
      if (apellido !== undefined) data.apellido = apellido

      if (Object.keys(data).length === 0) {
        throw new Error('USER_NO_DATA')
      }

      // Read updatedAt para optimistic lock
      const existingTarget = await tx.user.findUnique({
        where: { id },
        select: { updatedAt: true },
      })
      if (!existingTarget) throw new Error('USER_NOT_FOUND')

      // Update con condición sobre updatedAt
      const updateResult = await tx.user.updateMany({
        where: { id, updatedAt: existingTarget.updatedAt },
        data,
      })
      if (updateResult.count === 0) {
        throw new Error('USER_MODIFICADO_POR_OTRO_USUARIO')
      }

      // Re-leer para devolver el estado final
      return tx.user.findUnique({
        where: { id },
        select: { id: true, username: true, nombre: true, apellido: true, rol: true, activo: true },
      })
    })

    if (!user) return apiError('Usuario no encontrado', 404)

    logAudit({
      entidad: 'User',
      registroId: user.id,
      accion: 'UPDATE',
      datos: { cambios: 'user update', resetPassword: !!password },
      usuarioId: adminId,
    }).catch(() => {})

    return apiSuccess({ user })
  } catch (error) {
    // FIX F-27a/F-27b: mapear errores thrown desde la tx
    if (error instanceof Error) {
      if (error.message === 'USER_USERNAME_TAKEN') {
        return apiError('El nombre de usuario ya esta en uso', 409)
      }
      if (error.message === 'USER_NOT_FOUND') {
        return apiError('Usuario no encontrado', 404)
      }
      if (error.message === 'USER_NO_DATA') {
        return apiError('No hay datos para actualizar', 400)
      }
      if (error.message === 'USER_MODIFICADO_POR_OTRO_USUARIO') {
        return apiError('El usuario fue modificado por otro admin. Recarga y vuelve a intentar.', 409)
      }
    }
    // Capturar P2002 residual (defensa en profundidad)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return apiError('El nombre de usuario ya esta en uso', 409)
    }
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
