import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ProveedorCreateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { ROLES } from '@/lib/constants'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const proveedores = await prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    })
    return apiSuccess({ proveedores })
  } catch (error) {
    return apiError('Error cargando proveedores')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = ProveedorCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }
    const proveedor = await prisma.proveedor.create({
      data: {
        nombre: parsed.data.nombre,
        telefono: parsed.data.telefono,
        email: parsed.data.email,
        direccion: parsed.data.direccion,
      },
    })
    logAudit({
      entidad: 'Proveedor',
      registroId: proveedor.id,
      accion: 'CREATE',
      datos: { nombre: parsed.data.nombre },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ proveedor }, 201)
  } catch (error) {
    return apiError('Error creando proveedor')
  }
}