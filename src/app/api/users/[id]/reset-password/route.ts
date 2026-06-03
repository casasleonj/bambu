import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { randomInt } from 'node:crypto'

// FIX C-11: usar randomInt criptográficamente seguro en vez de Math.random.
// Math.random() es predecible matemáticamente: un atacante que conozca
// la semilla o suficientes outputs puede predecir futuras contraseñas.
// crypto.randomInt usa CSPRNG del sistema (urandom/BCryptGenRandom) y es
// seguro para generación de secretos.
const CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function generatePassword(length = 12): string {
  // Generar un buffer de índices aleatorios y mapear al charset
  const buf = new Uint32Array(length)
  // require('node:crypto').randomFillSync no está tipado en algunas versiones;
  // randomInt sí lo está, y su uso repetido es eficiente.
  for (let i = 0; i < length; i++) {
    buf[i] = randomInt(0, CHARSET.length)
  }
  let result = ''
  for (let i = 0; i < length; i++) {
    result += CHARSET.charAt(buf[i])
  }
  return result
}

export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  const { id } = await params
  const adminId = (authResult.user as { id: string }).id

  if (id === adminId) {
    return apiError('No puedes resetear tu propia contraseña desde aqui', 400)
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, rol: true, nombre: true, apellido: true },
    })
    if (!user) return apiError('Usuario no encontrado', 404)

    const plainPassword = generatePassword(12)
    const hashed = await bcrypt.hash(plainPassword, 12)

    await prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true },
    })

    logAudit({
      entidad: 'User',
      registroId: user.id,
      accion: 'UPDATE',
      datos: { tipo: 'RESET_PASSWORD' },
      usuarioId: adminId,
    }).catch(() => {})

    return apiSuccess({
      password: plainPassword,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido,
      },
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error resetting password:')
    return apiError('Error reseteando contraseña')
  }
}
