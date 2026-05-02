import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { InsumoCreateSchema } from '@/lib/validators'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const conStock = searchParams.get('conStock') === 'true'
  const alertOnly = searchParams.get('alertas') === 'true'

  try {
    const where: Record<string, unknown> = {}
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
    console.error('Error fetching insumos:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error cargando insumos')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const body = await request.json()
    const parsed = InsumoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }
    const { nombre, unidad, stock, stockMin, precioUnit, proveedorId } = parsed.data

    const insumo = await prisma.insumo.create({
      data: {
        nombre,
        unidad: unidad || 'UNIDAD',
        stock: stock || 0,
        stockMin: stockMin || 0,
        precioUnit: precioUnit || 0,
        proveedorId: proveedorId || null,
      },
    })

    return apiSuccess({ insumo }, 201)
  } catch (error) {
    console.error('Error creating insumo:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error creando insumo')
  }
}