import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ProveedorUpdateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = ProveedorUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }
    const proveedor = await prisma.proveedor.update({
      where: { id },
      data: parsed.data,
    })

    logAudit({
      entidad: 'Proveedor',
      registroId: proveedor.id,
      accion: 'UPDATE',
      datos: { nombre: proveedor.nombre, telefono: proveedor.telefono, email: proveedor.email, direccion: proveedor.direccion },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ proveedor })
  } catch (error) {
    return apiError('Error actualizando proveedor')
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'])
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const proveedor = await prisma.proveedor.update({
      where: { id },
      data: { activo: false },
    })

    logAudit({
      entidad: 'Proveedor',
      registroId: proveedor.id,
      accion: 'DELETE',
      datos: { nombre: proveedor.nombre, telefono: proveedor.telefono, email: proveedor.email, direccion: proveedor.direccion },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({})
  } catch (error) {
    return apiError('Error eliminando proveedor')
  }
}
