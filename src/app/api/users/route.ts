import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { UserCreateSchema } from '@/lib/validators'
import type { RolUsuario } from '@prisma/client'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const rol = searchParams.get('rol')
    const activo = searchParams.get('activo')

    const where: Record<string, unknown> = {}
    if (rol) where.rol = rol
    if (activo === 'true') where.activo = true
    else if (activo === 'false') where.activo = false
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido: { contains: search, mode: 'insensitive' } },
      ]
    }

    const users = await prisma.user.findMany({
      where,
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
      orderBy: { username: 'asc' },
    })

    return apiSuccess({ users: JSON.parse(JSON.stringify(users)) })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching users:')
    return apiError('Error cargando usuarios')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  const adminId = (authResult.user as { id: string }).id

  try {
    const body = await request.json()
    const parsed = UserCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [parsed.error.issues.map(e => e.message).join(', ')] })
    }

    const { username, password, rol, nombre, apellido } = parsed.data

    // FIX F-31: findUnique + create DENTRO de prisma.$transaction.
    // Antes: el findUnique (línea 74) corría FUERA de tx. Dos
    // admins creando user con el mismo username casi simultáneo
    // pasaban el check, el segundo recibía P2002 → 500 (vía
    // catch genérico).
    //
    // Ahora: prisma.$transaction con row lock implícito sobre la
    // unique constraint username. La segunda tx espera y ve la
    // fila recién creada → 409 con mensaje específico.
    const hashed = await bcrypt.hash(password, 12)

    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { username } })
      if (existing) {
        throw new Error('USER_USERNAME_EXISTS')
      }

      return tx.user.create({
        data: { username, password: hashed, rol: rol as RolUsuario, nombre, apellido },
        select: { id: true, username: true, nombre: true, apellido: true, rol: true, activo: true, createdAt: true },
      })
    })

    logAudit({
      entidad: 'User',
      registroId: user.id,
      accion: 'CREATE',
      datos: { username: user.username, rol: user.rol },
      usuarioId: adminId,
    }).catch(() => {})

    return apiSuccess({ user }, 201)
  } catch (error) {
    // FIX F-31: mapear error thrown desde la tx
    if (error instanceof Error && error.message === 'USER_USERNAME_EXISTS') {
      return apiError('El nombre de usuario ya existe', 409)
    }
    // Capturar P2002 residual (defensa en profundidad)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return apiError('El nombre de usuario ya existe', 409)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating user:')
    return apiError('Error creando usuario')
  }
}
