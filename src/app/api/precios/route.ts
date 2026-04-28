import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'

const PrecioCreateSchema = z.object({
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

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    // Get latest price for each product
    const precios = await prisma.precioHistorial.findMany({
      orderBy: { vigenteDesde: 'desc' },
      distinct: ['producto'],
    })

    return NextResponse.json({ precios })
  } catch (error) {
    console.error('Error fetching precios:', error)
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
    const parsed = PrecioCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { producto, precio } = parsed.data

    const record = await prisma.precioHistorial.create({
      data: {
        producto,
        precio,
        creadoPor: authResult.user?.email || 'unknown',
      },
    })

    return NextResponse.json({ success: true, precio: record }, { status: 201 })
  } catch (error) {
    console.error('Error creating precio:', error)
    return NextResponse.json({ error: 'Error creating precio' }, { status: 500 })
  }
}
