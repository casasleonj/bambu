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

    // FIX F-28: read+check+update DENTRO de tx con optimistic lock.
    // Mismos TOCTOU que F-27 pero en el endpoint de perfil del
    // usuario (auto-edición). Tres races:
    //
    //   F-28a: dos requests cambiando el username al mismo valor
    //          (usuario cambiando su propio username, retry por
    //          red). Mismo riesgo que F-27a.
    //   F-28b: cambio de password sin lock. Si el admin resetea el
    //          password entre el check y el update, el usuario puede
    //          usar el password viejo brevemente. También permite
    //          bypass del check currentPassword si el row cambia.
    //   F-28c: dos requests con cambios distintos al mismo perfil
    //          (e.g. nombre + apellido), last-write-wins silencioso.
    //
    // Solución: prisma.$transaction con row lock implícito + bcrypt
    // compare DENTRO de la tx + optimistic lock sobre updatedAt.
    const result = await prisma.$transaction(async (tx) => {
      // Si hay cambio de username, validar que no esté tomado
      if (username) {
        const existing = await tx.user.findUnique({ where: { username } })
        if (existing && existing.id !== userId) {
          throw new Error('PROFILE_USERNAME_TAKEN')
        }
      }

      const data: Record<string, string> = {}
      if (username) data.username = username
      if (nombre !== undefined) data.nombre = nombre
      if (apellido !== undefined) data.apellido = apellido

      if (newPassword) {
        const dbUser = await tx.user.findUnique({
          where: { id: userId },
          select: { password: true, updatedAt: true },
        })
        if (!dbUser) throw new Error('PROFILE_USER_NOT_FOUND')

        const valid = await bcrypt.compare(currentPassword || '', dbUser.password)
        if (!valid) {
          throw new Error('PROFILE_WRONG_PASSWORD')
        }
        data.password = await bcrypt.hash(newPassword, 12)

        // Optimistic lock: si el row fue modificado por otro request
        // entre el findUnique y el updateMany, count=0
        const updateResult = await tx.user.updateMany({
          where: { id: userId, updatedAt: dbUser.updatedAt },
          data,
        })
        if (updateResult.count === 0) {
          throw new Error('PROFILE_MODIFICADO_POR_OTRO_REQUEST')
        }
      } else {
        // Sin cambio de password: solo check básico de cambios
        if (Object.keys(data).length === 0) {
          throw new Error('PROFILE_NO_DATA')
        }

        const existing = await tx.user.findUnique({
          where: { id: userId },
          select: { updatedAt: true },
        })
        if (!existing) throw new Error('PROFILE_USER_NOT_FOUND')

        const updateResult = await tx.user.updateMany({
          where: { id: userId, updatedAt: existing.updatedAt },
          data,
        })
        if (updateResult.count === 0) {
          throw new Error('PROFILE_MODIFICADO_POR_OTRO_REQUEST')
        }
      }

      return tx.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, nombre: true, apellido: true, rol: true, activo: true },
      })
    })

    const user = result
    if (!user) return apiError('Usuario no encontrado', 404)

    logAudit({
      entidad: 'User',
      registroId: user.id,
      accion: 'UPDATE',
      datos: { cambios: 'profile update', tipo: 'PROFILE' },
      usuarioId: userId,
    }).catch(() => {})

    return apiSuccess({ user })
  } catch (error) {
    // FIX F-28: mapear errores thrown desde la tx
    if (error instanceof Error) {
      if (error.message === 'PROFILE_USERNAME_TAKEN') {
        return apiError('El nombre de usuario ya esta en uso', 409)
      }
      if (error.message === 'PROFILE_USER_NOT_FOUND') {
        return apiError('Usuario no encontrado', 404)
      }
      if (error.message === 'PROFILE_NO_DATA') {
        return apiError('No hay datos para actualizar', 400)
      }
      if (error.message === 'PROFILE_WRONG_PASSWORD') {
        return apiError('Contraseña actual incorrecta', 403)
      }
      if (error.message === 'PROFILE_MODIFICADO_POR_OTRO_REQUEST') {
        return apiError('Tu perfil fue modificado por otro request. Recarga y vuelve a intentar.', 409)
      }
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error updating profile:')
    return apiError('Error actualizando perfil')
  }
}
