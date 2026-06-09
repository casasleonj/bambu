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
    // FIX F-30: read+update DENTRO de tx con optimistic lock.
    // Antes: findUnique (línea 47) + update (línea 56) sin tx.
    // Dos admins reseteando el password del mismo user casi
    // simultáneo:
    //   T0: Admin A: findUnique → user existe
    //   T0: Admin B: findUnique → user existe
    //   T1: A genera password "abc", hace update, retorna "abc"
    //   T1: B genera password "xyz", hace update, retorna "xyz"
    //   T2: La DB tiene "xyz" (last-write-wins). El admin A le dijo
    //       al usuario "tu nueva contraseña es abc" pero la real
    //       es "xyz". El usuario no puede entrar con "abc".
    //
    // Ahora: prisma.$transaction con row lock + optimistic lock.
    // Si el row fue modificado entre el findUnique y el updateMany,
    // count=0 → 409 con mensaje específico.
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { id: true, username: true, rol: true, nombre: true, apellido: true, updatedAt: true },
      })
      if (!user) throw new Error('RESET_USER_NOT_FOUND')

      const plainPassword = generatePassword(12)
      const hashed = await bcrypt.hash(plainPassword, 12)

      const updateResult = await tx.user.updateMany({
        where: { id, updatedAt: user.updatedAt },
        data: { password: hashed, mustChangePassword: true },
      })
      if (updateResult.count === 0) {
        throw new Error('RESET_MODIFICADO_POR_OTRO_ADMIN')
      }

      return { user, plainPassword }
    })

    logAudit({
      entidad: 'User',
      registroId: result.user.id,
      accion: 'UPDATE',
      datos: { tipo: 'RESET_PASSWORD' },
      usuarioId: adminId,
    }).catch(() => {})

    return apiSuccess({
      password: result.plainPassword,
      user: {
        id: result.user.id,
        username: result.user.username,
        nombre: result.user.nombre,
        apellido: result.user.apellido,
      },
    })
  } catch (error) {
    // FIX F-30: mapear errores thrown desde la tx
    if (error instanceof Error) {
      if (error.message === 'RESET_USER_NOT_FOUND') {
        return apiError('Usuario no encontrado', 404)
      }
      if (error.message === 'RESET_MODIFICADO_POR_OTRO_ADMIN') {
        return apiError('El usuario fue modificado por otro admin. Recarga y vuelve a intentar.', 409)
      }
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error resetting password:')
    return apiError('Error reseteando contraseña')
  }
}
