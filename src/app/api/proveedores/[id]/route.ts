import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { ProveedorUpdateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'

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
    return apiSuccess({ proveedor })
  } catch (error) {
    return apiError('Error actualizando proveedor')
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { id } = await params
  try {
    await prisma.proveedor.update({
      where: { id },
      data: { activo: false },
    })
    return apiSuccess({})
  } catch (error) {
    return apiError('Error eliminando proveedor')
  }
}
