import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { InsumoCreateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { ROLES } from '@/lib/constants'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const conStock = searchParams.get('conStock') === 'true'
  const alertOnly = searchParams.get('alertas') === 'true'

  try {
    const where: Record<string, unknown> = { activo: true }
    if (conStock) {
      where.stock = { gt: 0 }
    }
    if (alertOnly) {
      const currentStock = where.stock as Record<string, unknown> | undefined
      where.stock = { ...currentStock, lte: prisma.insumo.fields.stockMin }
    }

    const insumos = await prisma.insumo.findMany({
      where,
      include: { proveedor: true },
      orderBy: { nombre: 'asc' },
    })

    return apiSuccess({ insumos })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching insumos:')
    return apiError('Error cargando insumos')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = InsumoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }
    const { nombre, unidad, stock, stockMin, precioUnit, proveedorId } = parsed.data

    // FIX F-34a: create DENTRO de prisma.$transaction con row lock
    // sobre la unique constraint nombre. Antes: create directo.
    // Dos admins creando insumo con el mismo nombre casi simultáneo
    // → P2002 → 500. Ahora: P2002 → 409 con mensaje específico.
    const insumo = await prisma.$transaction(async (tx) => {
      return tx.insumo.create({
        data: {
          nombre,
          unidad: unidad || 'UNIDAD',
          stock: stock || 0,
          stockMin: stockMin || 0,
          precioUnit: precioUnit || 0,
          proveedorId: proveedorId || null,
        },
      })
    })

    logAudit({
      entidad: 'Insumo',
      registroId: insumo.id,
      accion: 'CREATE',
      datos: { nombre, unidad },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ insumo }, 201)
  } catch (error) {
    // FIX F-34a: mapear P2002 → 409 con mensaje específico
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return apiError('Ya existe un insumo con ese nombre', 409)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating insumo:')
    return apiError('Error creando insumo')
  }
}