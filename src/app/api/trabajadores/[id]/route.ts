import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { TrabajadorUpdateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = TrabajadorUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }
    const trabajador = await prisma.trabajador.update({
      where: { id },
      data: parsed.data,
    })
    return apiSuccess({ trabajador })
  } catch (error) {
    return apiError('Error actualizando trabajador')
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    await prisma.trabajador.update({
      where: { id },
      data: { activo: false },
    })
    return apiSuccess({})
  } catch (error) {
    return apiError('Error eliminando trabajador')
  }
}
