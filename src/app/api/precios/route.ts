import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'

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
    // Get latest price for each product (legacy PrecioHistorial)
    const precios = await prisma.precioHistorial.findMany({
      orderBy: { vigenteDesde: 'desc' },
      distinct: ['producto'],
    })

    return NextResponse.json({ precios })
  } catch (error) {
    console.error('Error fetching precios:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error fetching precios' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole('ADMIN')
  if (roleCheck instanceof Response) return roleCheck

  try {
    const body = await request.json()

    // Handle PrecioVolumen update
    const volumenParsed = PrecioVolumenSchema.safeParse(body)
    if (volumenParsed.success) {
      const { precioVolumenId, precio } = volumenParsed.data
      await prisma.precioVolumen.update({
        where: { id: precioVolumenId },
        data: { precio },
      })
      return NextResponse.json({ success: true })
    }

    // Handle legacy PrecioHistorial create
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
      return NextResponse.json({ success: true, precio: record }, { status: 201 })
    }

    return NextResponse.json(
      { error: 'Datos invalidos. Envie {precioVolumenId, precio} o {producto, precio}.' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error updating precio:', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: 'Error actualizando precio' }, { status: 500 })
  }
}
