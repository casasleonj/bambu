import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const userId = (authResult.user as { id: string }).id

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { mustChangePassword: true, username: true, password: true },
    })
    if (!dbUser) return apiError('Usuario no encontrado', 404)
    if (!dbUser.mustChangePassword) {
      return apiError('No se requiere cambio de contraseña', 400)
    }

    const body = await request.json()
    const { currentPassword, newPassword, confirmNewPassword } = body

    // FIX C-10: requerir contraseña actual para evitar account takeover.
    // Si un atacante roba la sesión antes de que el dueño legítimo cambie
    // la contraseña, sin este check podría cambiarla y bloquear al dueño.
    // El endpoint de "mi perfil" (/api/auth/profile) YA requiere currentPassword;
    // este era el único flujo de cambio de pass que no lo hacía.
    if (!currentPassword) {
      return apiError('Contraseña actual requerida', 400)
    }
    const currentValid = await bcrypt.compare(currentPassword, dbUser.password)
    if (!currentValid) {
      return apiError('Contraseña actual incorrecta', 401)
    }

    if (!newPassword || !confirmNewPassword) {
      return apiError('Nueva contraseña y confirmación requeridas', 400)
    }
    if (newPassword.length < 6) {
      return apiError('Contraseña debe tener al menos 6 caracteres', 400)
    }
    if (newPassword === currentPassword) {
      return apiError('La nueva contraseña debe ser diferente a la actual', 400)
    }
    if (newPassword !== confirmNewPassword) {
      return apiError('Las contraseñas no coinciden', 400)
    }

    const hashed = await bcrypt.hash(newPassword, 12)

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false },
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
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error force password change:')
    return apiError('Error actualizando contraseña')
  }
}
