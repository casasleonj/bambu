import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'

const PrecioHistorialSchema = z.object({
  producto: z.enum([
    'AGUA_GALON',
    'HIELO_5KG',
    'BOTELLON_FABRICA',
    'BOTELLON_DOMICILIO',
    'BOLSA_AGUA',
    'BOLSA_HIELO',
  ]),
  precio: z.coerce.number().positive(),
})

const PrecioVolumenSchema = z.object({
  precioVolumenId: z.string().min(1),
  precio: z.coerce.number().positive(),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const precios = await prisma.precioHistorial.findMany({
      orderBy: { vigenteDesde: 'desc' },
      distinct: ['producto'],
    })

    return apiSuccess({ precios })
  } catch (error) {
    console.error('Error fetching precios:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error cargando precios')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()

    const volumenParsed = PrecioVolumenSchema.safeParse(body)
    if (volumenParsed.success) {
      const { precioVolumenId, precio } = volumenParsed.data
      await prisma.precioVolumen.update({
        where: { id: precioVolumenId },
        data: { precio },
      })
      return apiSuccess({})
    }

    const historialParsed = PrecioHistorialSchema.safeParse(body)
    if (historialParsed.success) {
      const { producto, precio } = historialParsed.data
      const record = await prisma.precioHistorial.create({
        data: {
          producto,
          precio,
          creadoPor: authResult.user?.email || 'unknown',
        },
      })
      return apiSuccess({ precio: record }, 201)
    }

    return apiError('Datos invalidos. Envie {precioVolumenId, precio} o {producto, precio}.', 400)
  } catch (error) {
    console.error('Error updating precio:', error instanceof Error ? error.message : 'Unknown')
    return apiError('Error actualizando precio')
  }
}
