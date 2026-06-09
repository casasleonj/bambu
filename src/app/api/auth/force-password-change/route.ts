import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAuthWithoutMustChangePassword } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function PUT(request: NextRequest) {
  // FIX F1.8: este endpoint DEBE ser accesible cuando el usuario aún
  // no ha cambiado su contraseña (es el endpoint que la cambia). Usar
  // la variante sin check de mustChangePassword.
  const authResult = await requireAuthWithoutMustChangePassword()
  if (authResult instanceof Response) return authResult

  const userId = (authResult.user as { id: string }).id

  try {
    const body = await request.json()
    const { currentPassword, newPassword, confirmNewPassword } = body

    // FIX F-29: read+check+update DENTRO de tx con optimistic lock.
    // Mismo TOCTOU que F-28b: si el admin (o un atacante con sesión)
    // resetea el password entre el read y el update, el usuario
    // puede usar su password actual brevemente. También permite
    // bypass del check currentPassword si el row cambia.
    //
    // Solución: prisma.$transaction con row lock implícito + bcrypt
    // compare DENTRO de la tx + optimistic lock sobre updatedAt.
    await prisma.$transaction(async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: userId },
        select: { mustChangePassword: true, password: true, updatedAt: true },
      })
      if (!dbUser) throw new Error('FORCE_USER_NOT_FOUND')
      if (!dbUser.mustChangePassword) {
        throw new Error('FORCE_NOT_REQUIRED')
      }

      // FIX C-10: requerir contraseña actual para evitar account takeover.
      if (!currentPassword) {
        throw new Error('FORCE_CURRENT_PASSWORD_REQUIRED')
      }
      const currentValid = await bcrypt.compare(currentPassword, dbUser.password)
      if (!currentValid) {
        throw new Error('FORCE_WRONG_PASSWORD')
      }

      if (!newPassword || !confirmNewPassword) {
        throw new Error('FORCE_NEW_PASSWORD_REQUIRED')
      }
      if (newPassword.length < 6) {
        throw new Error('FORCE_PASSWORD_TOO_SHORT')
      }
      if (newPassword === currentPassword) {
        throw new Error('FORCE_PASSWORD_SAME')
      }
      if (newPassword !== confirmNewPassword) {
        throw new Error('FORCE_PASSWORD_MISMATCH')
      }

      const hashed = await bcrypt.hash(newPassword, 12)

      // Optimistic lock: si el row fue modificado por otro request
      // entre el findUnique y el updateMany, count=0
      const updateResult = await tx.user.updateMany({
        where: { id: userId, updatedAt: dbUser.updatedAt },
        data: { password: hashed, mustChangePassword: false },
      })
      if (updateResult.count === 0) {
        throw new Error('FORCE_MODIFICADO_POR_OTRO_REQUEST')
      }
    })

    logAudit({
      entidad: 'User',
      registroId: userId,
      accion: 'UPDATE',
      datos: { tipo: 'FORCE_PASSWORD_CHANGE' },
      usuarioId: userId,
    }).catch(() => {})

    return apiSuccess({ message: 'Contraseña actualizada' })
  } catch (error) {
    // FIX F-29: mapear errores thrown desde la tx
    if (error instanceof Error) {
      if (error.message === 'FORCE_USER_NOT_FOUND') {
        return apiError('Usuario no encontrado', 404)
      }
      if (error.message === 'FORCE_NOT_REQUIRED') {
        return apiError('No se requiere cambio de contraseña', 400)
      }
      if (error.message === 'FORCE_CURRENT_PASSWORD_REQUIRED') {
        return apiError('Contraseña actual requerida', 400)
      }
      if (error.message === 'FORCE_WRONG_PASSWORD') {
        return apiError('Contraseña actual incorrecta', 401)
      }
      if (error.message === 'FORCE_NEW_PASSWORD_REQUIRED') {
        return apiError('Nueva contraseña y confirmación requeridas', 400)
      }
      if (error.message === 'FORCE_PASSWORD_TOO_SHORT') {
        return apiError('Contraseña debe tener al menos 6 caracteres', 400)
      }
      if (error.message === 'FORCE_PASSWORD_SAME') {
        return apiError('La nueva contraseña debe ser diferente a la actual', 400)
      }
      if (error.message === 'FORCE_PASSWORD_MISMATCH') {
        return apiError('Las contraseñas no coinciden', 400)
      }
      if (error.message === 'FORCE_MODIFICADO_POR_OTRO_REQUEST') {
        return apiError('Tu cuenta fue modificada por otro request. Recarga y vuelve a intentar.', 409)
      }
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error force password change:')
    return apiError('Error actualizando contraseña')
  }
}
